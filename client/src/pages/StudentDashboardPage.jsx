import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api from '../api/client';
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
  ShieldAlert,
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
    staleTime: 60 * 1000,
    retry: 1,
  });

  const stats = statsData || {
    totalTickets: 0,
    openTickets: 0,
    resolvedTickets: 0,
    averageResolutionTime: 'N/A',
    recentTickets: [],
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'IN_PROGRESS':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'AWAITING_INFO':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'RESOLVED':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'CLOSED':
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
      case 'REJECTED':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-navy-900 via-navy-800 to-navy-950 border border-gray-200/20 dark:border-navy-800 p-8 shadow-xl text-white">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-coral-500/20 text-coral-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>SmartDesk Student Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Welcome back, {profile?.full_name?.split(' ')[0] || 'Student'}!
            </h1>
            <p className="text-gray-300 text-sm leading-relaxed">
              Track your college queries, raise support tickets across departments, and get instant answers to campus questions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/tickets/new"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-bold shadow-lg shadow-coral-500/25 transition-transform hover:-translate-y-0.5"
            >
              <Plus className="w-4 h-4" />
              <span>Raise Ticket</span>
            </Link>

            <Link
              to="/ai-chat"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold backdrop-blur-md border border-white/10 transition-colors"
            >
              <Bot className="w-4 h-4 text-sky-400" />
              <span>Ask AI Assistant</span>
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

      {/* Statistics Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tickets */}
        <div className="p-6 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm relative overflow-hidden group hover:border-coral-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Total Raised
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Ticket className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
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

        {/* Open & Active Tickets */}
        <div className="p-6 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Active / In-Queue
            </span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <div className="h-8 w-16 bg-gray-200 dark:bg-navy-800 rounded animate-pulse" />
            ) : (
              <span className="text-3xl font-extrabold text-amber-500">
                {stats.openTickets}
              </span>
            )}
            <p className="text-xs text-gray-500 mt-1">Under departmental review</p>
          </div>
        </div>

        {/* Resolved Tickets */}
        <div className="p-6 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm relative overflow-hidden group hover:border-emerald-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Resolved Issues
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <div className="h-8 w-16 bg-gray-200 dark:bg-navy-800 rounded animate-pulse" />
            ) : (
              <span className="text-3xl font-extrabold text-emerald-500">
                {stats.resolvedTickets}
              </span>
            )}
            <p className="text-xs text-gray-500 mt-1">Successfully settled</p>
          </div>
        </div>

        {/* Average Resolution Time */}
        <div className="p-6 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm relative overflow-hidden group hover:border-purple-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Avg. Resolution
            </span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            {isLoading ? (
              <div className="h-8 w-16 bg-gray-200 dark:bg-navy-800 rounded animate-pulse" />
            ) : (
              <span className="text-3xl font-extrabold text-purple-500">
                {stats.averageResolutionTime}
              </span>
            )}
            <p className="text-xs text-gray-500 mt-1">From ticket open to closure</p>
          </div>
        </div>
      </div>

      {/* Main Content Split: Recent Tickets & AI Assistant Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Recent Tickets */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Recent Support Tickets</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Timestamps displayed in college local time (Asia/Kolkata - IST)
              </p>
            </div>
            <Link
              to="/tickets"
              className="text-xs font-bold text-coral-500 hover:text-coral-600 flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="bg-white dark:bg-navy-900 rounded-2xl border border-gray-200 dark:border-navy-800 shadow-sm overflow-hidden divide-y divide-gray-100 dark:divide-navy-800/80">
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
            ) : stats.recentTickets.length === 0 ? (
              // Empty state
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-navy-800 text-gray-400 flex items-center justify-center mx-auto">
                  <FolderOpen className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  No Support Tickets Yet
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                  Have an issue with fees, course registration, library books, or hostel amenities?
                  Raise your first ticket now.
                </p>
                <div className="pt-2">
                  <Link
                    to="/tickets/new"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-bold shadow-md transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Ticket</span>
                  </Link>
                </div>
              </div>
            ) : (
              // Ticket items list
              stats.recentTickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/tickets/${t.id}`)}
                  className="p-4 sm:p-5 hover:bg-gray-50/80 dark:hover:bg-navy-800/50 cursor-pointer transition-colors flex items-center justify-between gap-4 group"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-coral-500">
                        {t.ticket_number}
                      </span>
                      <span className="text-gray-300 dark:text-navy-700">•</span>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                        {t.category?.name || 'General Support'}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-coral-500 transition-colors truncate">
                      {t.title}
                    </h4>

                    <div className="flex items-center gap-3 text-[11px] text-gray-400 pt-0.5">
                      <span>Raised {formatRelativeIST(t.created_at)}</span>
                      <span>•</span>
                      <span>{formatToIST(t.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border ${getStatusBadge(
                        t.status
                      )}`}
                    >
                      {t.status.replace('_', ' ')}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors" />
                  </div>
                </div>
              ))
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
                Phase 5/6 Preview
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
              <span>Explore AI Assistant</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* College Quick Reference */}
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
