import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Inbox,
  Filter,
  ArrowUpDown,
  Search,
  CheckSquare,
  Square,
  Users,
  UserCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  Star,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  X,
  Calendar,
  AlertCircle,
  Building2,
  ShieldAlert,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatToIST, formatDateOnlyIST } from '../utils/date';

const STATUS_COLORS = {
  OPEN: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-500/20',
  IN_PROGRESS: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-500/20',
  AWAITING_INFO: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-500/20',
  RESOLVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-500/20',
  CLOSED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border-gray-500/20',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-500/20',
};

const PRIORITY_BADGES = {
  Urgent: 'bg-red-500 text-white font-bold animate-pulse',
  High: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30',
  Medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30',
  Low: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30',
};

const CHART_COLORS = ['#38bdf8', '#818cf8', '#c084fc', '#f472b6', '#fb923c', '#4ade80'];

export default function StaffDashboardPage() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  // Filters & Sorting state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('priority');
  const [sortOrder, setSortOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const limit = 15;

  // Bulk assignment state
  const [selectedTicketIds, setSelectedTicketIds] = useState([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [assignNote, setAssignNote] = useState('');

  // 1. Fetch Department Stats & Charts
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['staff-stats'],
    queryFn: async () => {
      const res = await api.get('/staff/stats');
      return res.data;
    },
  });

  // 2. Fetch Department Queue
  const {
    data: queueData,
    isLoading: queueLoading,
    isFetching: queueFetching,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: [
      'staff-queue',
      { search, statusFilter, priorityFilter, categoryFilter, assigneeFilter, dateFrom, dateTo, sortBy, sortOrder, page },
    ],
    queryFn: async () => {
      const params = {
        page,
        limit,
        sortBy,
        sortOrder,
      };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (assigneeFilter) params.assignedTo = assigneeFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await api.get('/staff/queue', { params });
      return res.data;
    },
  });

  // 3. Claim Ticket Mutation
  const claimMutation = useMutation({
    mutationFn: async (ticketId) => {
      return await api.post(`/staff/tickets/${ticketId}/claim`);
    },
    onSuccess: () => {
      toast.success('Ticket claimed successfully!');
      queryClient.invalidateQueries({ queryKey: ['staff-queue'] });
      queryClient.invalidateQueries({ queryKey: ['staff-stats'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to claim ticket');
    },
  });

  // 4. Bulk Assign Mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async ({ ticketIds, staffId, note }) => {
      return await api.post('/staff/tickets/bulk-assign', { ticketIds, staffId, note });
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Tickets assigned successfully!');
      setIsBulkModalOpen(false);
      setSelectedTicketIds([]);
      setSelectedStaffId('');
      setAssignNote('');
      queryClient.invalidateQueries({ queryKey: ['staff-queue'] });
      queryClient.invalidateQueries({ queryKey: ['staff-stats'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Bulk assignment failed');
    },
  });

  const overview = statsData?.overview || {};
  const charts = statsData?.charts || {};
  const staffMembers = statsData?.staffMembers || [];
  const tickets = queueData?.tickets || [];
  const totalTickets = queueData?.total || 0;
  const totalPages = queueData?.totalPages || 1;

  // Toggle ticket selection for bulk actions
  const handleSelectTicket = (id) => {
    setSelectedTicketIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedTicketIds.length === tickets.length) {
      setSelectedTicketIds([]);
    } else {
      setSelectedTicketIds(tickets.map((t) => t.id));
    }
  };

  const handleQuickClaim = (ticketId) => {
    claimMutation.mutate(ticketId);
  };

  const handleBulkSubmit = (e) => {
    e.preventDefault();
    if (!selectedStaffId) {
      toast.error('Please select a staff member to assign to.');
      return;
    }
    bulkAssignMutation.mutate({
      ticketIds: selectedTicketIds,
      staffId: selectedStaffId,
      note: assignNote.trim(),
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      {/* Top Banner / Department Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-navy-900 via-navy-800 to-navy-950 text-white shadow-xl border border-navy-700/60">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-coral-500/20 border border-coral-500/40 flex items-center justify-center text-coral-400 shadow-inner">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-coral-400 bg-coral-500/10 px-2.5 py-0.5 rounded-full border border-coral-500/30">
                Departmental Queue
              </span>
              <span className="text-xs text-gray-400">
                Staff ID: {profile?.id?.slice(0, 8)}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
              {profile?.department?.name || 'Departmental Support Desk'}
            </h1>
            <p className="text-sm text-gray-300 mt-0.5">
              Triage student issues, assign cases, meet SLA deadlines, and post verified resolutions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              refetchQueue();
              refetchStats();
              toast.success('Queue refreshed');
            }}
            disabled={queueFetching}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-800 hover:bg-navy-700 border border-navy-600 text-sm font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${queueFetching ? 'animate-spin text-coral-400' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Total In Queue */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Queue Total</span>
            <Inbox className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {statsLoading ? '—' : overview.totalTickets ?? 0}
          </div>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Active departmental tickets</span>
        </div>

        {/* Urgent Attention */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-red-500/20 dark:border-red-500/30 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-red-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Urgent Cases</span>
            <AlertTriangle className="w-4 h-4 text-red-500 animate-bounce" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400">
            {statsLoading ? '—' : overview.urgentTickets ?? 0}
          </div>
          <span className="text-[11px] text-red-500/80 mt-1">Requires immediate triage</span>
        </div>

        {/* Avg Response Time */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Response</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {statsLoading ? '—' : overview.avgResponseTimeHours !== undefined ? `${overview.avgResponseTimeHours}h` : '—'}
          </div>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">First staff comment</span>
        </div>

        {/* Avg Resolution Time */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Resolution</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
            {statsLoading ? '—' : overview.avgResolutionTimeHours !== undefined ? `${overview.avgResolutionTimeHours}h` : '—'}
          </div>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Created to final resolution</span>
        </div>

        {/* SLA Compliance */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">SLA Target</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
            {statsLoading ? '—' : overview.slaComplianceRate !== undefined ? `${overview.slaComplianceRate}%` : '100%'}
          </div>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Resolved before deadline</span>
        </div>

        {/* Satisfaction Rating */}
        <div className="p-5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Satisfaction</span>
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white flex items-center gap-1">
            <span>{statsLoading ? '—' : overview.avgSatisfactionScore ?? '5.0'}</span>
            <span className="text-xs text-gray-400 font-normal">/ 5</span>
          </div>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Student feedback average</span>
        </div>
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tickets Over Time (14-day line chart) */}
        <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Tickets Activity Over Time</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Tickets created vs resolved (last 14 days)</p>
            </div>
          </div>
          <div className="h-64 w-full">
            {charts.ticketsOverTime && charts.ticketsOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts.ticketsOverTime} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="created" name="Raised" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="resolved" name="Resolved" stroke="#4ade80" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-gray-400">
                No activity data recorded in the 14-day window.
              </div>
            )}
          </div>
        </div>

        {/* Status Breakdown Donut Chart */}
        <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">Status Breakdown</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Distribution of cases by current workflow state</p>
          </div>
          <div className="h-64 w-full flex items-center justify-center">
            {charts.statusBreakdown && charts.statusBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={charts.statusBreakdown}
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="count"
                    nameKey="status"
                  >
                    {charts.statusBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-gray-400">No tickets in department queue yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Queue Filter Bar & Controls */}
      <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Search Box */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by ticket #, student name, issue title..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 dark:bg-navy-800/80 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral-500"
            />
          </div>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-navy-800/80 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral-500"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="AWAITING_INFO">Awaiting Info</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="REJECTED">Rejected</option>
          </select>

          {/* Priority Dropdown */}
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-navy-800/80 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral-500"
          >
            <option value="">All Priorities</option>
            <option value="Urgent">Urgent (Highest)</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={assigneeFilter}
            onChange={(e) => {
              setAssigneeFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-navy-800/80 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral-500"
          >
            <option value="">All Assignees</option>
            <option value="UNASSIGNED">Unassigned Only</option>
            <option value={profile?.id}>Assigned to Me</option>
            {staffMembers.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.full_name}
              </option>
            ))}
          </select>

          {/* Sort By */}
          <div className="flex items-center gap-1.5">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-navy-800/80 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral-500"
            >
              <option value="priority">Sort: Priority</option>
              <option value="created_at">Sort: Age / Date</option>
              <option value="sla_due_at">Sort: SLA Due Date</option>
            </select>
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              title={`Toggle sort order (${sortOrder.toUpperCase()})`}
              className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-navy-800 dark:hover:bg-navy-700 border border-gray-300 dark:border-navy-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Date Range Sub-Bar */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100 dark:border-navy-800 text-xs">
          <span className="font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Date Range:
          </span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-xs text-gray-900 dark:text-white"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-xs text-gray-900 dark:text-white"
          />

          {(search || statusFilter || priorityFilter || categoryFilter || assigneeFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatusFilter('');
                setPriorityFilter('');
                setCategoryFilter('');
                setAssigneeFilter('');
                setDateFrom('');
                setDateTo('');
                setPage(1);
              }}
              className="ml-auto text-xs text-coral-500 hover:text-coral-600 font-semibold flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Banner */}
      {selectedTicketIds.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-2xl bg-coral-500/10 border border-coral-500/30 text-coral-900 dark:text-coral-200 animate-slideDown">
          <div className="flex items-center gap-2 font-bold text-sm">
            <CheckSquare className="w-5 h-5 text-coral-500" />
            <span>{selectedTicketIds.length} ticket(s) selected</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsBulkModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-bold shadow-md transition-all active:scale-95 flex items-center gap-1.5"
            >
              <Users className="w-4 h-4" />
              <span>Bulk Assign</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedTicketIds([])}
              className="px-3 py-2 rounded-xl bg-gray-200 dark:bg-navy-800 text-gray-700 dark:text-gray-300 text-xs font-semibold hover:opacity-80 transition-opacity"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ticket Queue Table */}
      <div className="rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50/80 dark:bg-navy-950/60 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider border-b border-gray-200 dark:border-navy-800">
                <th className="py-4 px-4 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-white"
                  >
                    {selectedTicketIds.length === tickets.length && tickets.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-coral-500" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-4 px-4">Ticket Info</th>
                <th className="py-4 px-3">Priority</th>
                <th className="py-4 px-3">Status</th>
                <th className="py-4 px-4">SLA Deadline</th>
                <th className="py-4 px-4">Assignee</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-navy-800/60 font-medium">
              {queueLoading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-gray-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-coral-500 mx-auto mb-2" />
                    Loading departmental queue...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-16 text-center space-y-3">
                    <Inbox className="w-12 h-12 text-gray-300 dark:text-navy-700 mx-auto" />
                    <p className="text-base font-bold text-gray-700 dark:text-gray-300">
                      No matching tickets in queue
                    </p>
                    <p className="text-xs text-gray-400 max-w-sm mx-auto">
                      All caught up! Any incoming inquiries routed to your department will appear here automatically.
                    </p>
                  </td>
                </tr>
              ) : (
                tickets.map((t) => {
                  const isSelected = selectedTicketIds.includes(t.id);
                  const isClaimedByMe = t.assigned_to === profile?.id;
                  const isUnassigned = !t.assigned_to;

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-gray-50/80 dark:hover:bg-navy-800/40 transition-colors ${
                        isSelected ? 'bg-coral-50/40 dark:bg-coral-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-4 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleSelectTicket(t.id)}
                          className="p-1 rounded text-gray-400 hover:text-coral-500"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-coral-500" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Ticket Number & Title */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/tickets/${t.id}`}
                            className="font-mono text-xs font-bold text-coral-600 dark:text-coral-400 hover:underline"
                          >
                            {t.ticket_number}
                          </Link>
                          {t.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-300">
                              {t.category.name}
                            </span>
                          )}
                        </div>
                        <Link
                          to={`/tickets/${t.id}`}
                          className="block text-sm font-semibold text-gray-900 dark:text-white hover:text-coral-500 dark:hover:text-coral-400 line-clamp-1 mt-0.5"
                        >
                          {t.title}
                        </Link>
                        <span className="block text-xs text-gray-400 mt-0.5">
                          Student: {t.creator?.full_name || 'Anonymous Student'} • Created {formatToIST(t.created_at)}
                        </span>
                      </td>

                      {/* Priority */}
                      <td className="py-4 px-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.Medium
                          }`}
                        >
                          {t.priority}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            STATUS_COLORS[t.status] || STATUS_COLORS.OPEN
                          }`}
                        >
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* SLA Deadline & Breach Status */}
                      <td className="py-4 px-4">
                        <div className="space-y-0.5">
                          {t.is_overdue ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400">
                              <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                              SLA BREACHED
                            </span>
                          ) : (
                            <span className="text-xs text-gray-700 dark:text-gray-300 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-gray-400" />
                              {formatToIST(t.sla_due_at)}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Assignee */}
                      <td className="py-4 px-4">
                        {t.assignee ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-navy-100 dark:bg-navy-800 text-xs font-bold flex items-center justify-center text-gray-700 dark:text-gray-300">
                              {t.assignee.full_name?.charAt(0) || 'S'}
                            </div>
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate max-w-[120px]">
                              {t.assignee.full_name}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-block text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right space-x-2">
                        {isUnassigned && (
                          <button
                            type="button"
                            onClick={() => handleQuickClaim(t.id)}
                            disabled={claimMutation.isPending}
                            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                          >
                            Claim
                          </button>
                        )}
                        <Link
                          to={`/tickets/${t.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-navy-800 dark:hover:bg-navy-700 text-gray-800 dark:text-gray-200 text-xs font-semibold transition-colors"
                        >
                          <span>Manage</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-navy-800 text-xs text-gray-500">
            <div>
              Showing {tickets.length} of {totalTickets} tickets
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-navy-700 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-navy-700 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Assign Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-navy-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-coral-500" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Bulk Assign ({selectedTicketIds.length} tickets)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Assign To Staff Member *
                </label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral-500"
                >
                  <option value="">Select Department Staff...</option>
                  {staffMembers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Internal Handover Note (Optional)
                </label>
                <textarea
                  rows="3"
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                  placeholder="e.g. Assigned for immediate laboratory verification prior to Friday exams..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkAssignMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50"
                >
                  {bulkAssignMutation.isPending ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
