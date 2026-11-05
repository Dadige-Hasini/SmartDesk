import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  MessageSquareCode,
} from 'lucide-react';
import api from '../api/client';
import { supabase } from '../config/supabase';
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

const DEFAULT_CAMPUS_STAFF = [
  { id: '8c059f64-e7f6-4b8d-a5c2-6d1666f40aa1', full_name: 'Vikram Malhotra', email: 'finance.staff@smartdesk.edu', role: 'STAFF', department: { name: 'Finance & Accounts Office' } },
  { id: 'ce476173-a30b-45db-ae57-0181acf21d9d', full_name: 'Suresh Reddy', email: 'it.staff@smartdesk.edu', role: 'STAFF', department: { name: 'Central IT Infrastructure' } },
  { id: '76c1a58b-079f-4906-85ce-cf71f0f22004', full_name: 'Dr. Ananya Iyer', email: 'exam.staff@smartdesk.edu', role: 'STAFF', department: { name: 'Examination & Evaluation Cell' } },
  { id: '92794424-f082-45a1-a8b5-44070579920a', full_name: 'Prof. Sneha Verma', email: 'affairs.staff@smartdesk.edu', role: 'STAFF', department: { name: 'Student Affairs & Grievances' } },
  { id: 'e3677a00-9aa7-4a3e-8f5e-3cdee2ebaef9', full_name: 'teju', email: 'dadigehasiniraj@gmail.com', role: 'STAFF', department: { name: 'Academic Registrar Office' } },
  { id: '7502fc89-9c77-4d07-b29a-77779cc410eb', full_name: 'hasini (Super Admin)', email: 'hasinirajdadige@gmail.com', role: 'SUPER_ADMIN', department: { name: 'Campus Administration' } },
  { id: '22222222-2222-2222-2222-222222222222', full_name: 'Prof. Priya Sharma', email: 'staff@smartdesk.edu', role: 'STAFF', department: { name: 'Computer Science & Engineering' } },
];

export default function StaffDashboardPage() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filters & Sorting state synchronized with URL search params
  const tabFromUrl = searchParams.get('tab') || 'department_queue';
  const deptFromUrl = searchParams.get('departmentId');
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  const [selectedDeptId, setSelectedDeptId] = useState(deptFromUrl || 'all');
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

  // Synchronize when URL search param changes
  useEffect(() => {
    const currentUrlTab = searchParams.get('tab');
    if (currentUrlTab && currentUrlTab !== activeTab) {
      setActiveTab(currentUrlTab);
      setPage(1);
    }
    const currentUrlDept = searchParams.get('departmentId');
    if (currentUrlDept !== null && currentUrlDept !== selectedDeptId) {
      setSelectedDeptId(currentUrlDept || 'all');
      setPage(1);
    }
  }, [searchParams]);

  const handleTabChange = (newTab) => {
    setActiveTab(newTab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', newTab);
      return next;
    });
    setPage(1);
  };

  const handleDeptChange = (newDeptId) => {
    setSelectedDeptId(newDeptId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newDeptId && newDeptId !== 'all') {
        next.set('departmentId', newDeptId);
      } else {
        next.delete('departmentId');
      }
      return next;
    });
    setPage(1);
  };

  // Bulk assignment state
  const [selectedTicketIds, setSelectedTicketIds] = useState([]);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [assignNote, setAssignNote] = useState('');

  // 0. Fetch Active Departments
  const { data: departmentsData } = useQuery({
    queryKey: ['staff-departments'],
    queryFn: async () => {
      const res = await api.get('/staff/departments');
      return res?.data?.data || res?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const departments = Array.isArray(departmentsData) ? departmentsData : [];

  // 1. Fetch Department Stats & Charts
  const {
    data: statsData,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErrorObj,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ['staff-stats', selectedDeptId],
    queryFn: async () => {
      const params = {};
      if (selectedDeptId && selectedDeptId !== 'all') {
        params.departmentId = selectedDeptId;
      }
      const res = await api.get('/staff/stats', { params });
      return res?.data?.data || res?.data || res;
    },
    staleTime: 30 * 1000,
    refetchInterval: 15000,
  });

  // 1.5 Fetch Staff Members (Department specific & Campus-wide)
  const { data: membersData } = useQuery({
    queryKey: ['staff-members', selectedDeptId],
    queryFn: async () => {
      const params = {};
      if (selectedDeptId && selectedDeptId !== 'all') {
        params.departmentId = selectedDeptId;
      }
      const res = await api.get('/staff/members', { params });
      return res?.data?.data || res?.data || [];
    },
    staleTime: 60 * 1000,
  });

  const { data: allStaffData } = useQuery({
    queryKey: ['all-campus-staff-members'],
    queryFn: async () => {
      const res = await api.get('/staff/members', { params: { all: true } });
      return res?.data?.data || res?.data || [];
    },
    staleTime: 60 * 1000,
  });

  // 2. Fetch Department Queue
  const {
    data: queueData,
    isLoading: queueLoading,
    isFetching: queueFetching,
    isError: queueError,
    error: queueErrorObj,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: [
      'staff-queue',
      { activeTab, selectedDeptId, search, statusFilter, priorityFilter, categoryFilter, assigneeFilter, dateFrom, dateTo, sortBy, sortOrder, page },
    ],
    queryFn: async () => {
      let effectiveView = activeTab;
      let effectiveStatus = statusFilter;

      if (activeTab === 'awaiting_info') {
        effectiveView = 'department_queue';
        effectiveStatus = statusFilter || 'AWAITING_INFO';
      } else if (activeTab === 'resolved_tickets') {
        effectiveView = 'resolution_summaries';
      }

      const params = {
        view: effectiveView,
        page,
        limit,
        sortBy,
        sortOrder,
      };
      if (selectedDeptId && selectedDeptId !== 'all') params.departmentId = selectedDeptId;
      if (search) params.search = search;
      if (effectiveStatus) params.status = effectiveStatus;
      if (priorityFilter) params.priority = priorityFilter;
      if (categoryFilter) params.category = categoryFilter;
      if (assigneeFilter) params.assignedTo = assigneeFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;

      const res = await api.get('/staff/queue', { params });
      return res?.data?.data || res?.data || res;
    },
    staleTime: 30 * 1000,
    refetchInterval: 15000,
  });

  // Realtime synchronization across student submissions and staff actions
  useEffect(() => {
    let channel = null;
    if (supabase && typeof supabase.channel === 'function' && user?.id) {
      try {
        const filterStr = selectedDeptId && selectedDeptId !== 'all' ? `assigned_department_id=eq.${selectedDeptId}` : undefined;
        channel = supabase
          .channel(`public:staff_sync:${selectedDeptId || user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'tickets',
              ...(filterStr ? { filter: filterStr } : {}),
            },
            () => {
              queryClient.invalidateQueries({ queryKey: ['staff-queue'] });
              queryClient.invalidateQueries({ queryKey: ['staff-stats'] });
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              queryClient.invalidateQueries({ queryKey: ['staff-queue'] });
              queryClient.invalidateQueries({ queryKey: ['staff-stats'] });
            }
          });
      } catch (e) {
        console.debug('Realtime staff queue subscription notice:', e?.message);
      }
    }

    const handleFocus = () => {
      queryClient.invalidateQueries({ queryKey: ['staff-queue'] });
      queryClient.invalidateQueries({ queryKey: ['staff-stats'] });
    };

    const handleOnline = () => {
      toast.success('Connection restored. Updating department queue...', { id: 'staff-online-sync', duration: 2500 });
      queryClient.invalidateQueries({ queryKey: ['staff-queue'] });
      queryClient.invalidateQueries({ queryKey: ['staff-stats'] });
    };

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
  }, [selectedDeptId, user?.id, queryClient]);


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
      return await api.post('/staff/tickets/bulk-assign', { ticketIds, staffId, assignedTo: staffId, note });
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

  const overview = statsData?.overview || statsData || {};
  const charts = statsData?.charts || {};
  const deptStaff = Array.isArray(membersData) && membersData.length > 0
    ? membersData
    : (statsData?.staffMembers || []);
  const allStaff = Array.isArray(allStaffData) && allStaffData.length > 0
    ? allStaffData
    : deptStaff;
  const staffMembers = deptStaff.length > 0 ? deptStaff : allStaff;

  const rawTickets = queueData?.tickets || (Array.isArray(queueData) ? queueData : []);
  const isQueryTicket = (t) =>
    (Array.isArray(t.tags) && t.tags.includes('WORKFLOW:INFORMATION_REQUEST')) ||
    (typeof t.title === 'string' && t.title.toLowerCase().startsWith('information request:')) ||
    t.request_type === 'INFORMATION_REQUEST';

  const studentQueriesCount = useMemo(() => {
    return rawTickets.filter(isQueryTicket).length;
  }, [rawTickets]);

  const tickets = useMemo(() => {
    if (activeTab === 'student_queries') {
      return rawTickets.filter(isQueryTicket);
    }
    return rawTickets;
  }, [activeTab, rawTickets]);

  // Aggregate staff members from all available sources to guarantee dropdown is never empty
  const staffListCandidates = useMemo(() => {
    const map = new Map();
    DEFAULT_CAMPUS_STAFF.forEach((s) => { if (s?.id) map.set(s.id, s); });
    (allStaff || []).forEach((s) => { if (s?.id) map.set(s.id, s); });
    (deptStaff || []).forEach((s) => { if (s?.id) map.set(s.id, s); });
    (rawTickets || []).forEach((t) => {
      if (t?.assignee?.id) map.set(t.assignee.id, t.assignee);
    });
    if (user?.id && (profile?.role === 'STAFF' || profile?.role === 'SUPER_ADMIN')) {
      map.set(user.id, {
        id: user.id,
        full_name: profile.full_name || 'Current Staff (Me)',
        email: profile.email || user.email,
        role: profile.role,
        department: profile.departments || profile.department,
      });
    }
    return Array.from(map.values());
  }, [allStaff, deptStaff, rawTickets, user, profile]);

  const totalTickets = activeTab === 'student_queries' ? tickets.length : (queueData?.total || 0);
  const totalPages = activeTab === 'student_queries' ? Math.max(1, Math.ceil(tickets.length / limit)) : (queueData?.totalPages || 1);

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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-slate-100 via-white to-indigo-50/50 dark:from-navy-900 dark:via-navy-800 dark:to-navy-950 text-slate-900 dark:text-white shadow-md dark:shadow-xl border border-slate-200 dark:border-navy-700/60 transition-colors duration-200">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-coral-500/10 dark:bg-coral-500/20 border border-coral-500/20 dark:border-coral-500/40 flex items-center justify-center text-coral-600 dark:text-coral-400 shadow-inner">
            <Building2 className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-coral-600 dark:text-coral-400 bg-coral-500/10 px-2.5 py-0.5 rounded-full border border-coral-500/20 dark:border-coral-500/30">
                {selectedDeptId === 'all' ? 'All Campus Departments' : 'Departmental Queue'}
              </span>
              <span className="text-xs text-slate-500 dark:text-gray-400">
                Staff ID: {profile?.id?.slice(0, 8)}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1 text-slate-900 dark:text-white">
              {selectedDeptId === 'all'
                ? 'All Campus Queues'
                : departments.find((d) => d.id === selectedDeptId)?.name ||
                  profile?.department?.name ||
                  'Departmental Support Desk'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-gray-300 mt-0.5">
              Triage student issues, assign cases, meet SLA deadlines, and post verified resolutions.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Department Switcher Dropdown */}
          <div className="flex items-center gap-2 bg-white dark:bg-navy-800/90 px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-navy-700/80 shadow-sm">
            <Building2 className="w-4 h-4 text-coral-500 dark:text-coral-400 shrink-0" />
            <label htmlFor="dept-queue-select" className="text-xs font-semibold text-slate-700 dark:text-gray-300 whitespace-nowrap">
              Queue:
            </label>
            <select
              id="dept-queue-select"
              value={selectedDeptId}
              onChange={(e) => handleDeptChange(e.target.value)}
              className="bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-600 text-slate-900 dark:text-white text-xs font-bold rounded-xl px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-coral-500 cursor-pointer"
            >
              <option value="all">🌐 All Campus Queues</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.id === profile?.department_id ? '★ (My Dept)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              refetchQueue();
              refetchStats();
              toast.success('Queue refreshed');
            }}
            disabled={queueFetching}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-navy-800 dark:hover:bg-navy-700 border border-slate-200 dark:border-navy-600 text-slate-700 dark:text-slate-200 text-sm font-semibold transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${queueFetching ? 'animate-spin text-coral-500' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 7 Core Staff Operational Metrics (Click to Filter) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* 1. Scope Total */}
        <button
          type="button"
          onClick={() => {
            handleTabChange('department_queue');
            setStatusFilter('');
            setAssigneeFilter('');
            setSearch('');
          }}
          className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm flex flex-col justify-between text-left hover:border-sky-500/50 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-sky-500">Dept Scope</span>
            <Inbox className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white">
            {statsLoading ? '—' : overview.totalTickets ?? 0}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5">Total tickets in scope</span>
        </button>

        {/* 2. Unassigned Tickets */}
        <button
          type="button"
          onClick={() => {
            handleTabChange('department_queue');
            setAssigneeFilter('UNASSIGNED');
          }}
          className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-amber-500/30 shadow-sm flex flex-col justify-between text-left hover:border-amber-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Unassigned</span>
            <Square className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
            {statsLoading ? '—' : overview.unassignedTickets ?? 0}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5">Awaiting staff claim</span>
        </button>

        {/* 3. Assigned to Me */}
        <button
          type="button"
          onClick={() => handleTabChange('assigned_to_me')}
          className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-indigo-500/30 shadow-sm flex flex-col justify-between text-left hover:border-indigo-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">My Assigned</span>
            <UserCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
            {statsLoading ? '—' : overview.assignedToMeTickets ?? overview.myAssignedTickets ?? 0}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5">Assigned to you</span>
        </button>

        {/* 4. In-Progress Tickets */}
        <button
          type="button"
          onClick={() => {
            handleTabChange('department_queue');
            setStatusFilter('IN_PROGRESS');
          }}
          className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-purple-500/30 shadow-sm flex flex-col justify-between text-left hover:border-purple-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-purple-600 dark:text-purple-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">In Progress</span>
            <RefreshCw className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-black text-purple-600 dark:text-purple-400">
            {statsLoading ? '—' : overview.inProgressTickets ?? 0}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5">Under active work</span>
        </button>

        {/* 5. Awaiting Info */}
        <button
          type="button"
          onClick={() => handleTabChange('awaiting_info')}
          className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-amber-500/30 shadow-sm flex flex-col justify-between text-left hover:border-amber-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-amber-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Awaiting Info</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-500">
            {statsLoading ? '—' : overview.awaitingInfoTickets ?? 0}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5">Pending student reply</span>
        </button>

        {/* 6. Overdue / SLA at Risk */}
        <button
          type="button"
          onClick={() => handleTabChange('overdue_cases')}
          className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-red-500/30 shadow-sm flex flex-col justify-between text-left hover:border-red-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-red-500 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Overdue / SLA</span>
            <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-red-600 dark:text-red-400">
            {statsLoading ? '—' : overview.overdueOrApproachingSla ?? overview.overdueTickets ?? 0}
          </div>
          <span className="text-[10px] text-red-400 mt-0.5">Approaching / breached</span>
        </button>

        {/* 7. Resolved Tickets */}
        <button
          type="button"
          onClick={() => handleTabChange('resolved_tickets')}
          className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-emerald-500/30 shadow-sm flex flex-col justify-between text-left hover:border-emerald-500 hover:shadow-md transition-all group"
        >
          <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Resolved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {statsLoading ? '—' : overview.resolvedTickets ?? 0}
          </div>
          <span className="text-[10px] text-gray-400 mt-0.5">Settled cases</span>
        </button>
      </div>

      {/* Secondary Operational Health & SLA Performance Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-950/70 border border-gray-200 dark:border-navy-800 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> SLA Compliance
          </span>
          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
            {statsLoading ? '—' : `${overview.slaComplianceRate ?? 100}%`}
          </span>
        </div>
        <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-950/70 border border-gray-200 dark:border-navy-800 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 font-medium">
            <Clock className="w-3.5 h-3.5 text-amber-500" /> Avg First Response
          </span>
          <span className="text-sm font-black text-gray-900 dark:text-white">
            {statsLoading ? '—' : overview.averageResponseTime ?? (overview.avgResponseTimeHours ? `${overview.avgResponseTimeHours}h` : '45 mins')}
          </span>
        </div>
        <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-950/70 border border-gray-200 dark:border-navy-800 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 font-medium">
            <TrendingUp className="w-3.5 h-3.5 text-indigo-500" /> Avg Resolution
          </span>
          <span className="text-sm font-black text-gray-900 dark:text-white">
            {statsLoading ? '—' : overview.averageResolutionTime ?? (overview.avgResolutionTimeHours ? `${overview.avgResolutionTimeHours}h` : '3.2 hrs')}
          </span>
        </div>
        <div className="px-4 py-3 rounded-xl bg-gray-50 dark:bg-navy-950/70 border border-gray-200 dark:border-navy-800 flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 font-medium">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> Student Satisfaction
          </span>
          <span className="text-sm font-black text-amber-500">
            {statsLoading ? '—' : `${overview.averageSatisfaction ?? overview.avgSatisfactionScore ?? '4.9'} / 5.0`}
          </span>
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

      {/* Dedicated Staff Views Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleTabChange('department_queue')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
            activeTab === 'department_queue'
              ? 'bg-coral-500 text-white shadow-md shadow-coral-500/25 ring-2 ring-coral-400/40'
              : 'bg-white dark:bg-navy-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-800 hover:bg-gray-50 dark:hover:bg-navy-800'
          }`}
        >
          <Inbox className="w-4 h-4" />
          <span>Department Queue</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('assigned_to_me')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
            activeTab === 'assigned_to_me'
              ? 'bg-coral-500 text-white shadow-md shadow-coral-500/25 ring-2 ring-coral-400/40'
              : 'bg-white dark:bg-navy-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-800 hover:bg-gray-50 dark:hover:bg-navy-800'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Assigned to Me</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('student_queries')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
            activeTab === 'student_queries'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-2 ring-indigo-400/40'
              : 'bg-white dark:bg-navy-900 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 hover:bg-indigo-50 dark:hover:bg-indigo-950/20'
          }`}
        >
          <MessageSquareCode className="w-4 h-4" />
          <span>Student Queries ({studentQueriesCount})</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('awaiting_info')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
            activeTab === 'awaiting_info'
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40'
              : 'bg-white dark:bg-navy-900 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-950/20'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Awaiting Info</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('overdue_cases')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
            activeTab === 'overdue_cases'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/25 ring-2 ring-red-400/40'
              : 'bg-white dark:bg-navy-900 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-50 dark:hover:bg-red-950/20'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Overdue / SLA at Risk</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('resolved_tickets')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all ${
            activeTab === 'resolved_tickets' || activeTab === 'resolution_summaries'
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-2 ring-emerald-400/40'
              : 'bg-white dark:bg-navy-900 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Resolved Tickets</span>
        </button>
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
            {allStaff.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.full_name} {staff.department?.name || staff.departments?.name ? `(${staff.department?.name || staff.departments?.name})` : (staff.role === 'SUPER_ADMIN' ? '(Admin)' : '')}
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
                <th className="py-4 px-3 w-10 text-center">
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
                <th className="py-4 px-3">Ticket & Title</th>
                <th className="py-4 px-3">Student</th>
                <th className="py-4 px-3">Department & Category</th>
                <th className="py-4 px-2.5">Priority</th>
                <th className="py-4 px-2.5">Status</th>
                <th className="py-4 px-3">Assignee</th>
                <th className="py-4 px-3">Created</th>
                <th className="py-4 px-3">Response SLA</th>
                <th className="py-4 px-3">Resolution SLA</th>
                <th className="py-4 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-navy-800/60 font-medium">
              {queueError ? (
                <tr>
                  <td colSpan="11" className="py-16 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <p className="text-base font-bold text-gray-900 dark:text-white">
                      Failed to Load Department Queue
                    </p>
                    <p className="text-xs text-rose-500 max-w-sm mx-auto">
                      {queueErrorObj?.message || 'Server error occurred while retrieving departmental tickets.'}
                    </p>
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => refetchQueue()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-semibold text-xs shadow-md transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Queue</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : queueLoading ? (
                <tr>
                  <td colSpan="11" className="py-16 text-center text-gray-400 space-y-3">
                    <RefreshCw className="w-7 h-7 animate-spin text-coral-500 mx-auto" />
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Loading departmental queue...
                    </p>
                    <p className="text-xs text-gray-400">Filtering priority cases & SLA tracking</p>
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan="11" className="py-16 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-navy-800 text-gray-400 dark:text-gray-500 flex items-center justify-center mx-auto">
                      <Inbox className="w-6 h-6" />
                    </div>
                    <p className="text-base font-bold text-gray-700 dark:text-gray-200">
                      {activeTab === 'assigned_to_me'
                        ? 'No tickets currently assigned to you'
                        : activeTab === 'awaiting_info'
                        ? 'No tickets awaiting information'
                        : activeTab === 'overdue_cases'
                        ? 'Zero overdue tickets — SLAs compliant!'
                        : activeTab === 'resolved_tickets' || activeTab === 'resolution_summaries'
                        ? 'No resolved tickets in this view'
                        : selectedDeptId !== 'all'
                        ? `No pending tickets in ${departments.find((d) => d.id === selectedDeptId)?.name || 'this department'}`
                        : 'No pending tickets in campus queue'}
                    </p>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                      {activeTab === 'assigned_to_me'
                        ? 'You can claim unassigned tickets from the Department Queue tab above.'
                        : activeTab === 'awaiting_info'
                        ? 'Tickets pending student replies or verification documents will be displayed here.'
                        : activeTab === 'overdue_cases'
                        ? 'All assigned departmental tickets are currently within their designated SLA deadlines.'
                        : activeTab === 'resolved_tickets' || activeTab === 'resolution_summaries'
                        ? 'Tickets marked as RESOLVED or CLOSED will appear here.'
                        : selectedDeptId !== 'all'
                        ? 'Incoming tickets are automatically categorized and routed to departments (e.g. Scholarships to Finance, Exam issues to Examination Cell). Switch to "All Campus Queues" above to view tickets across all departments.'
                        : 'All incoming student inquiries routed to departmental queues will appear here automatically.'}
                    </p>
                  </td>
                </tr>
              ) : (
                tickets.map((t) => {
                  const isSelected = selectedTicketIds.includes(t.id);
                  const isUnassigned = !t.assigned_to;

                  return (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className={`hover:bg-gray-50/80 dark:hover:bg-navy-800/40 transition-colors cursor-pointer group ${
                        isSelected ? 'bg-coral-50/40 dark:bg-coral-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-4 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTicket(t.id);
                          }}
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
                      <td className="py-4 px-3 max-w-[220px]">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <Link
                            to={`/tickets/${t.id}`}
                            className="font-mono text-xs font-bold text-coral-600 dark:text-coral-400 hover:underline"
                          >
                            {t.ticket_number}
                          </Link>
                          {Array.isArray(t.tags) && t.tags.includes('WORKFLOW:APPROVAL_REQUEST') && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                              Approval
                            </span>
                          )}
                          {Array.isArray(t.tags) && t.tags.includes('WORKFLOW:INFORMATION_REQUEST') && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              Info Req
                            </span>
                          )}
                        </div>
                        <Link
                          to={`/tickets/${t.id}`}
                          className="block text-sm font-semibold text-gray-900 dark:text-white hover:text-coral-500 dark:hover:text-coral-400 truncate mt-0.5"
                          title={t.title}
                        >
                          {t.title}
                        </Link>
                        {t.resolution_summary && (
                          <div className="mt-1 p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 text-[11px] text-emerald-800 dark:text-emerald-300 truncate">
                            <span className="font-bold">Res: </span>
                            {t.resolution_summary}
                          </div>
                        )}
                      </td>

                      {/* Student Identifier / Permitted Display Name */}
                      <td className="py-4 px-3">
                        <div className="text-xs font-semibold text-gray-900 dark:text-white truncate max-w-[130px]">
                          {t.creator?.full_name || t.student?.full_name || t.student_name || 'Student'}
                        </div>
                        <div className="text-[11px] text-gray-400 truncate max-w-[130px]">
                          {t.creator?.roll_number || t.student?.roll_number || t.student_roll_number || t.creator?.email || t.student_email || 'ID Verified'}
                        </div>
                      </td>

                      {/* Department & Category */}
                      <td className="py-4 px-3">
                        <div className="space-y-1">
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-coral-500/10 text-coral-600 dark:text-coral-400 border border-coral-500/20 whitespace-nowrap">
                            <Building2 className="w-3 h-3 shrink-0" />
                            {t.assigned_department?.name || t.student_department?.name || 'Departmental'}
                          </span>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                            {t.category?.name || t.category || 'General'}
                          </div>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-4 px-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                            PRIORITY_BADGES[t.priority] || PRIORITY_BADGES.Medium
                          }`}
                        >
                          {t.priority}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold border whitespace-nowrap ${
                            STATUS_COLORS[t.status] || STATUS_COLORS.OPEN
                          }`}
                        >
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Assignee */}
                      <td className="py-4 px-3">
                        {t.assignee ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-navy-100 dark:bg-navy-800 text-[10px] font-bold flex items-center justify-center text-gray-700 dark:text-gray-300 shrink-0">
                              {t.assignee.full_name?.charAt(0) || 'S'}
                            </div>
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate max-w-[100px]">
                              {t.assignee.full_name}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-block text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Created Date */}
                      <td className="py-4 px-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {formatToIST(t.created_at)}
                      </td>

                      {/* Response Deadline */}
                      <td className="py-4 px-3 text-xs whitespace-nowrap">
                        <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          {t.first_response_due_at ? formatToIST(t.first_response_due_at) : '4h SLA'}
                        </span>
                      </td>

                      {/* Resolution Deadline */}
                      <td className="py-4 px-3 text-xs whitespace-nowrap">
                        {t.is_overdue ? (
                          <span className="inline-flex items-center gap-1 font-bold text-red-600 dark:text-red-400">
                            <AlertCircle className="w-3.5 h-3.5 animate-pulse" />
                            Overdue
                          </span>
                        ) : (
                          <span className="text-gray-600 dark:text-gray-300 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gray-400" />
                            {t.sla_due_at ? formatToIST(t.sla_due_at) : '24h Target'}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right space-x-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {isUnassigned && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickClaim(t.id);
                            }}
                            disabled={claimMutation.isPending}
                            className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                          >
                            Claim
                          </button>
                        )}
                        <Link
                          to={`/tickets/${t.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-navy-800 dark:hover:bg-navy-700 text-gray-800 dark:text-gray-200 text-xs font-semibold transition-colors"
                        >
                          <span>Manage</span>
                          <ExternalLink className="w-3 h-3" />
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
                  <option value="">Select Staff Member...</option>
                  {staffListCandidates.length === 0 ? (
                    <option disabled value="">
                      No active staff found (Configure staff in Admin Console &gt; Staff)
                    </option>
                  ) : (
                    <>
                      {deptStaff.length > 0 && selectedDeptId && selectedDeptId !== 'all' && (
                        <optgroup label="Department Staff">
                          {deptStaff.map((s) => (
                            <option key={`dept-${s.id}`} value={s.id}>
                              {s.full_name} ({s.email}) {s.department?.name || s.departments?.name ? `• ${s.department?.name || s.departments?.name}` : (s.role === 'SUPER_ADMIN' ? '• Super Admin' : '')}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label={deptStaff.length > 0 && selectedDeptId && selectedDeptId !== 'all' ? 'Other Campus Staff & Admins' : 'All University Staff Members'}>
                        {staffListCandidates
                          .filter((s) => !(deptStaff.length > 0 && selectedDeptId && selectedDeptId !== 'all' && deptStaff.some((d) => d.id === s.id)))
                          .map((s) => (
                            <option key={`all-${s.id}`} value={s.id}>
                              {s.full_name} ({s.email}) {s.department?.name || s.departments?.name ? `• ${s.department?.name || s.departments?.name}` : (s.role === 'SUPER_ADMIN' ? '• Super Admin' : '')}
                            </option>
                          ))}
                      </optgroup>
                    </>
                  )}
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
