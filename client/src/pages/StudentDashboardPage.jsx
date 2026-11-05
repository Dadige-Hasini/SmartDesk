import React, { useState, useMemo, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import { formatToIST, formatRelativeIST } from '../utils/date';
import {
  Ticket,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Bot,
  Sparkles,
  ArrowRight,
  TrendingUp,
  RefreshCw,
  HelpCircle,
  FolderOpen,
  ChevronRight,
  ChevronLeft,
  Search,
  Activity,
  Layers,
  X,
  Calendar,
} from 'lucide-react';

export default function StudentDashboardPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Fetch real dashboard stats from the server using TanStack Query
  const {
    data: statsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['student-dashboard-stats'],
    queryFn: async () => {
      const res = await api.get('/tickets/stats/dashboard');
      return res?.data || res || null;
    },
    staleTime: 30 * 1000,
    refetchInterval: 15000,
    retry: 1,
  });

  // Supabase Realtime synchronization & focus/online refetch for student dashboard
  useEffect(() => {
    let channel = null;
    if (supabase && typeof supabase.channel === 'function' && user?.id) {
      try {
        channel = supabase
          .channel(`public:student_dashboard:${user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'tickets',
              filter: `created_by=eq.${user.id}`,
            },
            () => {
              refetch();
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              refetch();
            }
          });
      } catch (e) {
        console.debug('Realtime student dashboard notice:', e?.message);
      }
    }

    const handleFocus = () => refetch();
    const handleOnline = () => refetch();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [user?.id, refetch]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  const stats = statsData || {
    totalTickets: 0,
    openTickets: 0,
    resolvedTickets: 0,
    averageResolutionTime: 'N/A',
    byStatus: {
      OPEN: 0,
      IN_PROGRESS: 0,
      AWAITING_INFO: 0,
      RESOLVED: 0,
      CLOSED: 0,
      REJECTED: 0,
    },
    recentTickets: [],
  };

  // Filter & Search Tickets
  const filteredTickets = useMemo(() => {
    const raw = stats.recentTickets || [];
    return raw.filter((t) => {
      // Status filter
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;

      // Search query filter (matches ticket number, title, or category name)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const numMatch = t.ticket_number?.toLowerCase().includes(query);
        const titleMatch = t.title?.toLowerCase().includes(query);
        const catMatch = (t.category?.name || '')?.toLowerCase().includes(query);
        const descMatch = (t.description || '')?.toLowerCase().includes(query);
        if (!numMatch && !titleMatch && !catMatch && !descMatch) return false;
      }

      return true;
    });
  }, [stats.recentTickets, statusFilter, searchQuery]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / pageSize));
  const paginatedTickets = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredTickets.slice(startIdx, startIdx + pageSize);
  }, [filteredTickets, currentPage, pageSize]);

  const handleStatusFilterChange = (status) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'IN_PROGRESS':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      case 'AWAITING_INFO':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
      case 'RESOLVED':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'CLOSED':
        return 'bg-gray-500/10 text-gray-500 dark:text-gray-400 border-gray-500/20';
      case 'REJECTED':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'Urgent':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 font-bold';
      case 'High':
        return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 font-semibold';
      case 'Medium':
        return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
      case 'Low':
        return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  // Safe open & in-progress counts
  const openCount = stats.byStatus?.OPEN !== undefined ? stats.byStatus.OPEN : stats.openTickets;
  const inProgressCount = stats.byStatus?.IN_PROGRESS !== undefined ? stats.byStatus.IN_PROGRESS : 0;
  const resolvedCount = stats.resolvedTickets || stats.byStatus?.RESOLVED || 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn pb-12">
      {/* Welcome & Navigation Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-100 via-white to-coral-50/40 dark:from-navy-900 dark:via-navy-800 dark:to-navy-950 border border-slate-200 dark:border-navy-800 p-8 shadow-md dark:shadow-xl text-slate-900 dark:text-white transition-colors duration-200">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-coral-500/10 text-coral-600 dark:bg-coral-500/20 dark:text-coral-300 text-xs font-bold uppercase tracking-wider border border-coral-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              <span>SmartDesk Student Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Welcome back, {profile?.full_name?.split(' ')[0] || 'Student'}!
            </h1>
            <p className="text-slate-600 dark:text-gray-300 text-sm leading-relaxed">
              Track your college queries, raise support tickets across academic & administrative departments, and receive real-time resolutions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/tickets/new"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-bold shadow-lg shadow-coral-500/25 transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus className="w-4 h-4" />
              <span>Create Ticket</span>
            </Link>

            <Link
              to="/tickets"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white text-sm font-semibold backdrop-blur-md border border-slate-200 dark:border-white/10 shadow-sm transition-colors"
            >
              <Layers className="w-4 h-4 text-coral-500 dark:text-coral-400" />
              <span>My Tickets</span>
            </Link>

            <Link
              to="/ai-chat"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 dark:bg-white/10 dark:hover:bg-white/20 dark:text-white text-sm font-semibold backdrop-blur-md border border-slate-200 dark:border-white/10 shadow-sm transition-colors"
            >
              <Bot className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              <span>Ask AI</span>
            </Link>
          </div>
        </div>

        {/* Ambient background decoration */}
        <div className="absolute -right-10 -bottom-10 w-64 h-64 rounded-full bg-coral-500/10 blur-3xl pointer-events-none" />
      </div>

      {/* Error Recovery Banner if API fails */}
      {isError && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-rose-500 text-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>Unable to load live dashboard metrics. ({error?.message || 'Network error'})</span>
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 font-semibold text-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Statistics Cards Grid: Total, Open, In-Progress, Resolved, and Avg Resolution */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {/* Total Tickets */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm relative overflow-hidden group hover:border-blue-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Total Raised
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Ticket className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-16 bg-gray-200 dark:bg-navy-800 rounded animate-pulse" />
            ) : (
              <span className="text-3xl font-extrabold text-gray-900 dark:text-white">
                {stats.totalTickets}
              </span>
            )}
            <p className="text-xs text-gray-500 mt-1">Lifetime support requests</p>
          </div>
        </div>

        {/* Open Tickets */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Open Tickets
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-16 bg-gray-200 dark:bg-navy-800 rounded animate-pulse" />
            ) : (
              <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">
                {openCount}
              </span>
            )}
            <p className="text-xs text-gray-500 mt-1">Awaiting department triage</p>
          </div>
        </div>

        {/* In-Progress Tickets */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm relative overflow-hidden group hover:border-amber-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              In-Progress
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-16 bg-gray-200 dark:bg-navy-800 rounded animate-pulse" />
            ) : (
              <span className="text-3xl font-extrabold text-amber-500">
                {inProgressCount}
              </span>
            )}
            <p className="text-xs text-gray-500 mt-1">Under staff investigation</p>
          </div>
        </div>

        {/* Resolved Tickets */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm relative overflow-hidden group hover:border-emerald-500/40 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Resolved Issues
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-16 bg-gray-200 dark:bg-navy-800 rounded animate-pulse" />
            ) : (
              <span className="text-3xl font-extrabold text-emerald-500">
                {resolvedCount}
              </span>
            )}
            <p className="text-xs text-gray-500 mt-1">Successfully settled</p>
          </div>
        </div>

        {/* Average Resolution Time */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm relative overflow-hidden group hover:border-purple-500/40 transition-all col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Avg. Resolution
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            {isLoading ? (
              <div className="h-8 w-16 bg-gray-200 dark:bg-navy-800 rounded animate-pulse" />
            ) : (
              <span className="text-2xl sm:text-3xl font-extrabold text-purple-500 truncate block">
                {stats.averageResolutionTime}
              </span>
            )}
            <p className="text-xs text-gray-500 mt-1">From open to resolution</p>
          </div>
        </div>
      </div>

      {/* Main Content Split: Recent Tickets & AI Assistant Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Recent Tickets with Search, Filters, and Pagination */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <span>Recent Support Tickets</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-400 font-normal">
                  {filteredTickets.length} total
                </span>
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Timestamps displayed in college local time (Asia/Kolkata - IST)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/tickets/new"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-bold shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Raise Ticket</span>
              </Link>
              <Link
                to="/tickets"
                className="text-xs font-bold text-coral-500 hover:text-coral-600 flex items-center gap-1 transition-colors px-2.5 py-1.5 rounded-xl hover:bg-coral-500/10"
              >
                <span>My Tickets</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Search Bar & Status Filter Bar */}
          <div className="space-y-3 p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm">
            {/* Live Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search recent tickets by ticket #, title, or category..."
                className="w-full pl-10 pr-9 py-2 rounded-xl border border-gray-200 dark:border-navy-700 bg-gray-50/50 dark:bg-navy-950 text-gray-900 dark:text-white text-xs focus:ring-2 focus:ring-coral-500 focus:outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Status Quick Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100 dark:border-navy-800">
              {[
                { id: 'ALL', label: 'All Statuses' },
                { id: 'OPEN', label: 'Open' },
                { id: 'IN_PROGRESS', label: 'In Progress' },
                { id: 'AWAITING_INFO', label: 'Awaiting Info' },
                { id: 'RESOLVED', label: 'Resolved' },
                { id: 'CLOSED', label: 'Closed' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleStatusFilterChange(tab.id)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold transition-all ${
                    statusFilter === tab.id
                      ? 'bg-coral-500 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-navy-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Ticket Table View with Required Columns */}
          <div className="bg-white dark:bg-navy-900 rounded-2xl border border-gray-200 dark:border-navy-800 shadow-sm overflow-hidden">
            {isLoading ? (
              // Skeleton loading state
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <div className="space-y-2 flex-1">
                      <div className="h-4 bg-gray-200 dark:bg-navy-800 rounded w-1/3 animate-pulse" />
                      <div className="h-3 bg-gray-100 dark:bg-navy-800/60 rounded w-1/2 animate-pulse" />
                    </div>
                    <div className="h-6 w-20 bg-gray-200 dark:bg-navy-800 rounded-full animate-pulse" />
                  </div>
                ))}
              </div>
            ) : filteredTickets.length === 0 ? (
              // Empty state
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-navy-800 text-gray-400 flex items-center justify-center mx-auto">
                  <FolderOpen className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {searchQuery || statusFilter !== 'ALL'
                    ? 'No Matching Tickets Found'
                    : 'No Support Tickets Yet'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                  {searchQuery || statusFilter !== 'ALL'
                    ? 'No tickets match your search criteria. Try modifying your filters or clearing search.'
                    : 'Have an issue with fees, exam hall tickets, hostel amenities, or attendance? Raise your first inquiry now.'}
                </p>
                <div className="pt-2 flex items-center justify-center gap-2">
                  {(searchQuery || statusFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setStatusFilter('ALL');
                      }}
                      className="px-3.5 py-1.5 rounded-xl border border-gray-300 dark:border-navy-700 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-navy-800 transition-colors"
                    >
                      Clear Filters
                    </button>
                  )}
                  <Link
                    to="/tickets/new"
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-bold shadow-md transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Ticket</span>
                  </Link>
                </div>
              </div>
            ) : (
              // Table of Tickets with All Required Columns
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50/80 dark:bg-navy-950/60 border-b border-gray-200 dark:border-navy-800 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="px-4 py-3">Ticket #</th>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Priority</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Last Update</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-navy-800/80">
                    {paginatedTickets.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => navigate(`/tickets/${t.id}`)}
                        className="hover:bg-gray-50/80 dark:hover:bg-navy-800/50 cursor-pointer transition-colors group"
                      >
                        {/* Ticket Number */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-mono font-bold text-coral-600 dark:text-coral-400">
                            {t.ticket_number}
                          </span>
                        </td>

                        {/* Title */}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900 dark:text-white group-hover:text-coral-500 transition-colors line-clamp-1 max-w-xs">
                            {t.title}
                          </div>
                          {t.description && (
                            <div className="text-[11px] text-gray-400 line-clamp-1 max-w-xs">
                              {t.description}
                            </div>
                          )}
                        </td>

                        {/* Category */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {t.category?.name || 'General Support'}
                          </span>
                        </td>

                        {/* Priority */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full border text-[11px] ${getPriorityBadge(
                              t.priority
                            )}`}
                          >
                            {t.priority || 'Medium'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-full border font-bold text-[11px] ${getStatusBadge(
                              t.status
                            )}`}
                          >
                            {t.status.replace('_', ' ')}
                          </span>
                        </td>

                        {/* Created Date */}
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                          <div title={formatToIST(t.created_at)} className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span>{formatRelativeIST(t.created_at)}</span>
                          </div>
                        </td>

                        {/* Last Update */}
                        <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                          <div title={formatToIST(t.updated_at || t.created_at)}>
                            {formatRelativeIST(t.updated_at || t.created_at)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {filteredTickets.length > pageSize && (
              <div className="p-3.5 bg-gray-50/60 dark:bg-navy-950/40 border-t border-gray-100 dark:border-navy-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>
                  Showing{' '}
                  <strong className="text-gray-900 dark:text-white">
                    {(currentPage - 1) * pageSize + 1}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-gray-900 dark:text-white">
                    {Math.min(currentPage * pageSize, filteredTickets.length)}
                  </strong>{' '}
                  of{' '}
                  <strong className="text-gray-900 dark:text-white">
                    {filteredTickets.length}
                  </strong>{' '}
                  tickets
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 hover:bg-gray-100 dark:hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {Array.from({ length: totalPages }).map((_, idx) => {
                    const pageNum = idx + 1;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all ${
                          currentPage === pageNum
                            ? 'bg-coral-500 text-white'
                            : 'bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-700 hover:bg-gray-100 dark:hover:bg-navy-800'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-gray-200 dark:border-navy-700 bg-white dark:bg-navy-900 hover:bg-gray-100 dark:hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col: AI Assistant Preview & Quick Links */}
        <div className="space-y-6">
          {/* AI Entry Point Card */}
          <div className="p-6 rounded-3xl bg-gradient-to-br from-navy-900 to-indigo-950 border border-indigo-500/20 text-white shadow-lg space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <Bot className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 tracking-wider uppercase">
                AI Knowledge RAG
              </span>
            </div>

            <div className="space-y-1.5">
              <h3 className="font-bold text-base text-white">SmartDesk AI Assistant</h3>
              <p className="text-xs text-indigo-200/80 leading-relaxed">
                Powered by document-grounded college knowledge bases. Get verified answers for attendance rules, exam calendars, and fee policies.
              </p>
            </div>

            <Link
              to="/ai-chat"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-300 hover:text-white transition-colors"
            >
              <span>Open AI Assistant</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* College Quick Reference Guide */}
          <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-4">
            <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-coral-500" />
              <span>Need Help Finding the Right Office?</span>
            </h3>

            <div className="space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800/80">
                <span className="font-bold block text-gray-900 dark:text-white">Fee Discrepancies</span>
                <span>Select &ldquo;Fee & Payments&rdquo; to route directly to Finance Office.</span>
              </div>
              <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800/80">
                <span className="font-bold block text-gray-900 dark:text-white">Grade Sheets & Hall Tickets</span>
                <span>Select &ldquo;Examinations & Grades&rdquo; to route to Evaluation Cell.</span>
              </div>
              <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800/80">
                <span className="font-bold block text-gray-900 dark:text-white">Hostel & WiFi Inquiries</span>
                <span>Select &ldquo;Hostel & Amenities&rdquo; or &ldquo;IT Infrastructure&rdquo;.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
