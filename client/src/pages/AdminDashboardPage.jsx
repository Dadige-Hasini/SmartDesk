import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ShieldCheck,
  Building2,
  Users,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  Star,
  Download,
  Plus,
  Search,
  Filter,
  Check,
  Ban,
  RotateCcw,
  BookOpen,
  Bell,
  History,
  Settings,
  X,
  ExternalLink,
  ChevronRight,
  FileSpreadsheet,
  AlertCircle,
  Eye,
  Trash2,
  Bot,
  Sparkles,
} from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { formatToIST, formatDateOnlyIST } from '../utils/date';
import AiAnalyticsView from '../components/AiAnalyticsView';

const STAFF_STATUS_BADGES = {
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-500/30',
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-500/30',
  SUSPENDED: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-500/30',
};

const AUDIENCE_BADGES = {
  ALL: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  STUDENTS: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  STAFF: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
};

export default function AdminDashboardPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Active tab state: 'overview' | 'staff' | 'depts' | 'sla' | 'announcements' | 'audit'
  const [activeTab, setActiveTab] = useState('overview');

  // Staff filtering state
  const [staffSearch, setStaffSearch] = useState('');
  const [staffStatusFilter, setStaffStatusFilter] = useState('');

  // Modals state
  const [suspendModalStaff, setSuspendModalStaff] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');

  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: '', code: '', description: '' });

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    code: '',
    defaultDepartmentId: '',
    defaultPriority: 'Medium',
  });

  const [isSlaModalOpen, setIsSlaModalOpen] = useState(false);
  const [slaForm, setSlaForm] = useState({
    name: '',
    priority: 'Urgent',
    categoryId: '',
    responseTimeHours: 2,
    resolutionTimeHours: 12,
  });

  const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
  const [announceForm, setAnnounceForm] = useState({
    title: '',
    content: '',
    targetAudience: 'ALL',
    expiresAt: '',
  });

  // 1. Fetch Global Statistics
  const { data: statsData, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await api.get('/admin/stats');
      return res.data;
    },
  });

  // 2. Fetch Staff List
  const { data: staffList, isLoading: staffLoading, refetch: refetchStaff } = useQuery({
    queryKey: ['admin-staff', staffStatusFilter, staffSearch],
    queryFn: async () => {
      const params = {};
      if (staffStatusFilter) params.status = staffStatusFilter;
      if (staffSearch) params.search = staffSearch;
      const res = await api.get('/admin/staff', { params });
      return res.data;
    },
    enabled: activeTab === 'staff' || activeTab === 'overview',
  });

  // 3. Fetch Departments
  const { data: departments, isLoading: deptsLoading, refetch: refetchDepts } = useQuery({
    queryKey: ['admin-depts'],
    queryFn: async () => {
      const res = await api.get('/admin/departments');
      return res.data;
    },
  });

  // 4. Fetch Categories & Routing
  const { data: categories, isLoading: catsLoading, refetch: refetchCats } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: async () => {
      const res = await api.get('/admin/categories');
      return res.data;
    },
  });

  // 5. Fetch SLA Policies
  const { data: slaPolicies, isLoading: slaLoading, refetch: refetchSla } = useQuery({
    queryKey: ['admin-sla-policies'],
    queryFn: async () => {
      const res = await api.get('/admin/sla-policies');
      return res.data;
    },
  });

  // 6. Fetch Announcements
  const { data: announcements, isLoading: annLoading, refetch: refetchAnn } = useQuery({
    queryKey: ['admin-announcements'],
    queryFn: async () => {
      const res = await api.get('/admin/announcements');
      return res.data;
    },
    enabled: activeTab === 'announcements',
  });

  // 7. Fetch Audit Logs
  const { data: auditLogs, isLoading: auditLoading, refetch: refetchAudit } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: async () => {
      const res = await api.get('/admin/audit-logs');
      return res.data;
    },
    enabled: activeTab === 'audit',
  });

  // Mutations
  const updateStaffStatusMutation = useMutation({
    mutationFn: async ({ staffId, status, reason }) => {
      return await api.put(`/admin/staff/${staffId}/status`, { status, reason });
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Staff status updated');
      setSuspendModalStaff(null);
      setSuspendReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to update staff status');
    },
  });

  const toggleDocumentPermissionMutation = useMutation({
    mutationFn: async ({ staffId, canApproveDocuments }) => {
      return await api.put(`/admin/staff/${staffId}/permissions`, { canApproveDocuments });
    },
    onSuccess: () => {
      toast.success('Document approval permissions updated');
      queryClient.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: (err) => {
      toast.error(err.message || 'Permission update failed');
    },
  });

  const createDeptMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/admin/departments', payload);
    },
    onSuccess: () => {
      toast.success('Department created successfully!');
      setIsDeptModalOpen(false);
      setDeptForm({ name: '', code: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-depts'] });
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to create department'),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/admin/categories', payload);
    },
    onSuccess: () => {
      toast.success('Category & routing rule created!');
      setIsCategoryModalOpen(false);
      setCategoryForm({ name: '', code: '', defaultDepartmentId: '', defaultPriority: 'Medium' });
      queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to create category'),
  });

  const createSlaMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/admin/sla-policies', payload);
    },
    onSuccess: () => {
      toast.success('SLA target configured successfully!');
      setIsSlaModalOpen(false);
      setSlaForm({ name: '', priority: 'Urgent', categoryId: '', responseTimeHours: 2, resolutionTimeHours: 12 });
      queryClient.invalidateQueries({ queryKey: ['admin-sla-policies'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to configure SLA policy'),
  });

  const createAnnouncementMutation = useMutation({
    mutationFn: async (payload) => {
      return await api.post('/admin/announcements', payload);
    },
    onSuccess: () => {
      toast.success('Announcement broadcast published!');
      setIsAnnounceModalOpen(false);
      setAnnounceForm({ title: '', content: '', targetAudience: 'ALL', expiresAt: '' });
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to publish announcement'),
  });

  const deleteAnnouncementMutation = useMutation({
    mutationFn: async (id) => {
      return await api.delete(`/admin/announcements/${id}`);
    },
    onSuccess: () => {
      toast.success('Announcement deleted');
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to delete announcement'),
  });

  const overview = statsData?.overview || {};
  const departmentPerformance = statsData?.departmentPerformance || [];

  // CSV Export Handler
  const handleExportCsv = async () => {
    try {
      toast.loading('Preparing CSV export...', { id: 'csv-export' });
      const res = await api.get('/admin/export/tickets.csv', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `smartdesk_tickets_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Ticket CSV downloaded successfully!', { id: 'csv-export' });
    } catch (err) {
      toast.error('Failed to export ticket CSV', { id: 'csv-export' });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-gradient-to-r from-navy-950 via-navy-900 to-navy-800 text-white shadow-xl border border-navy-700/60">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-coral-500/20 border border-coral-500/40 flex items-center justify-center text-coral-400 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-coral-400 bg-coral-500/10 px-2.5 py-0.5 rounded-full border border-coral-500/30">
                Super Admin Console
              </span>
              <span className="text-xs text-gray-400">Governance & Institutional Metrics</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">
              University Operations Center
            </h1>
            <p className="text-sm text-gray-300 mt-0.5">
              Control staff approvals, departmental SLAs, routing rules, announcements, and university-wide triage health.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-md transition-all active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Global Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">Total Tickets</span>
          <span className="text-2xl font-black text-gray-900 dark:text-white mt-1 block">
            {statsLoading ? '—' : overview.totalTickets ?? 0}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 block">Open Cases</span>
          <span className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1 block">
            {statsLoading ? '—' : overview.openTickets ?? 0}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 block">Resolved</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            {statsLoading ? '—' : overview.resolvedTickets ?? 0}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 block">SLA Compliance</span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 block">
            {statsLoading ? '—' : `${overview.slaComplianceRate ?? 100}%`}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 block">Avg Resolution</span>
          <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
            {statsLoading ? '—' : `${overview.avgResolutionTimeHours ?? 0}h`}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block">Satisfaction</span>
          <span className="text-2xl font-black text-amber-500 mt-1 block">
            {statsLoading ? '—' : `${overview.avgSatisfactionScore ?? '5.0'}★`}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-500 block">Active Staff</span>
          <span className="text-2xl font-black text-purple-600 dark:text-purple-400 mt-1 block">
            {statsLoading ? '—' : overview.activeStaffCount ?? 0}
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm text-center">
          <span className="text-[10px] font-bold uppercase tracking-wider text-sky-500 block">Departments</span>
          <span className="text-2xl font-black text-sky-600 dark:text-sky-400 mt-1 block">
            {statsLoading ? '—' : overview.departmentCount ?? 0}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-navy-800 overflow-x-auto pb-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-coral-500 text-white shadow'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Department Performance</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'staff'
              ? 'bg-coral-500 text-white shadow'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff Accounts & Approvals</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('depts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'depts'
              ? 'bg-coral-500 text-white shadow'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Departments & Routing</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sla')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'sla'
              ? 'bg-coral-500 text-white shadow'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>SLA Targets</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'announcements'
              ? 'bg-coral-500 text-white shadow'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>Announcements</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'audit'
              ? 'bg-coral-500 text-white shadow'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Events</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ai-analytics')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-colors whitespace-nowrap ${
            activeTab === 'ai-analytics'
              ? 'bg-coral-500 text-white shadow'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span>AI & ML Analytics</span>
        </button>
      </div>

      {/* TAB: AI & ML ANALYTICS (Phase 7) */}
      {activeTab === 'ai-analytics' && <AiAnalyticsView />}

      {/* TAB 1: DEPARTMENT PERFORMANCE TABLE */}
      {activeTab === 'overview' && (
        <div className="rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Department Performance Scorecard
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Comparative metrics across academic and administrative departments
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-950/60 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider border-b border-gray-200 dark:border-navy-800">
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-3 text-center">Active Staff</th>
                  <th className="py-3 px-3 text-center">Total Cases</th>
                  <th className="py-3 px-3 text-center">Open Cases</th>
                  <th className="py-3 px-3 text-center">Resolved</th>
                  <th className="py-3 px-4 text-center">SLA Compliance</th>
                  <th className="py-3 px-4 text-center">Avg Resolution</th>
                  <th className="py-3 px-4 text-center">Satisfaction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-navy-800 font-medium">
                {departmentPerformance.map((dept) => (
                  <tr key={dept.departmentId} className="hover:bg-gray-50/60 dark:hover:bg-navy-800/40">
                    <td className="py-4 px-4 font-bold text-gray-900 dark:text-white">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-coral-500" />
                        <span>{dept.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 dark:bg-navy-800 text-gray-500 font-mono">
                          {dept.code}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-3 text-center text-gray-700 dark:text-gray-300">
                      {dept.activeStaffCount}
                    </td>
                    <td className="py-4 px-3 text-center font-bold text-gray-900 dark:text-white">
                      {dept.totalTickets}
                    </td>
                    <td className="py-4 px-3 text-center text-blue-600 dark:text-blue-400 font-bold">
                      {dept.openTickets}
                    </td>
                    <td className="py-4 px-3 text-center text-emerald-600 dark:text-emerald-400 font-bold">
                      {dept.resolvedTickets}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          dept.slaComplianceRate >= 90
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : dept.slaComplianceRate >= 75
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                        }`}
                      >
                        {dept.slaComplianceRate}%
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center text-gray-700 dark:text-gray-300">
                      {dept.avgResolutionTimeHours}h
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className="text-amber-500 font-bold">★ {dept.avgSatisfactionScore}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: STAFF ACCOUNTS & APPROVALS */}
      {activeTab === 'staff' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={staffSearch}
                  onChange={(e) => setStaffSearch(e.target.value)}
                  placeholder="Search staff by name or email..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                />
              </div>

              <select
                value={staffStatusFilter}
                onChange={(e) => setStaffStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
              >
                <option value="">All Account Statuses</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>

          <div className="rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-navy-950/60 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider border-b border-gray-200 dark:border-navy-800">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4 text-center">KB Doc Approval</th>
                    <th className="py-3 px-4 text-right">Administrative Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-navy-800 font-medium">
                  {staffLoading ? (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-gray-400">Loading staff accounts...</td>
                    </tr>
                  ) : !staffList || staffList.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="py-12 text-center text-gray-400">No staff accounts match your filters.</td>
                    </tr>
                  ) : (
                    staffList.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50/60 dark:hover:bg-navy-800/40">
                        <td className="py-4 px-4">
                          <span className="font-bold text-gray-900 dark:text-white block">{s.full_name}</span>
                          <span className="text-xs text-gray-400 block">{s.email}</span>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-navy-100 dark:bg-navy-800 text-gray-800 dark:text-gray-200">
                            {s.department?.name || 'Unassigned'}
                          </span>
                        </td>
                        <td className="py-4 px-3">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${STAFF_STATUS_BADGES[s.status] || ''}`}>
                            {s.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              toggleDocumentPermissionMutation.mutate({
                                staffId: s.id,
                                canApproveDocuments: !s.can_approve_documents,
                              })
                            }
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                              s.can_approve_documents
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-gray-100 dark:bg-navy-800 text-gray-400 hover:text-gray-600'
                            }`}
                          >
                            {s.can_approve_documents ? 'Granted' : 'Revoked'}
                          </button>
                        </td>
                        <td className="py-4 px-4 text-right space-x-2">
                          {s.status === 'PENDING_APPROVAL' && (
                            <button
                              type="button"
                              onClick={() =>
                                updateStaffStatusMutation.mutate({
                                  staffId: s.id,
                                  status: 'ACTIVE',
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold"
                            >
                              Approve
                            </button>
                          )}

                          {s.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={() => setSuspendModalStaff(s)}
                              className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 text-xs font-bold"
                            >
                              Suspend
                            </button>
                          )}

                          {s.status === 'SUSPENDED' && (
                            <button
                              type="button"
                              onClick={() =>
                                updateStaffStatusMutation.mutate({
                                  staffId: s.id,
                                  status: 'ACTIVE',
                                  reason: 'Reactivated by Super Admin',
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold"
                            >
                              Reactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DEPARTMENTS & ROUTING */}
      {activeTab === 'depts' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Departments Column */}
          <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Academic & Support Departments</h3>
                <p className="text-xs text-gray-400">Institutional routing units</p>
              </div>
              <button
                type="button"
                onClick={() => setIsDeptModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-bold shadow transition-transform active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Dept</span>
              </button>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-navy-800">
              {departments?.map((d) => (
                <div key={d.id} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-gray-900 dark:text-white block">{d.name}</span>
                    <span className="text-xs text-gray-400 block">{d.description || 'No description provided.'}</span>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-300">
                    {d.code}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Categories & Routing Rules */}
          <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">Categories & Auto-Routing Rules</h3>
                <p className="text-xs text-gray-400">Automatic department triage destination</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-bold shadow transition-transform active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Add Category</span>
              </button>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-navy-800">
              {categories?.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-sm text-gray-900 dark:text-white block">{c.name}</span>
                    <span className="text-xs text-gray-400 block">
                      Routes to: <strong className="text-gray-600 dark:text-gray-300">{c.department?.name || 'Assigned Department'}</strong> • Default Priority: {c.default_priority || 'Medium'}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-coral-500/10 text-coral-600 dark:text-coral-400">
                    {c.code}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SLA TARGETS */}
      {activeTab === 'sla' && (
        <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Service Level Agreement (SLA) Policies</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Guaranteed response and resolution deadlines enforced by server-side scheduled watchdog
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsSlaModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-bold shadow transition-transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Configure SLA Target</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-950/60 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider border-b border-gray-200 dark:border-navy-800">
                  <th className="py-3 px-4">Policy Name</th>
                  <th className="py-3 px-4">Priority Level</th>
                  <th className="py-3 px-4">Category Scope</th>
                  <th className="py-3 px-4 text-center">Max Response Time</th>
                  <th className="py-3 px-4 text-center">Max Resolution Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-navy-800 font-medium">
                {slaPolicies?.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-navy-800/40">
                    <td className="py-4 px-4 font-bold text-gray-900 dark:text-white">{p.name}</td>
                    <td className="py-4 px-4">
                      <span className="font-semibold px-2.5 py-0.5 rounded-full text-xs bg-coral-500/10 text-coral-600 dark:text-coral-400">
                        {p.priority}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-xs text-gray-500">
                      {p.category?.name || 'All Categories (Global Target)'}
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-gray-900 dark:text-white">
                      {p.response_time_hours} Hours
                    </td>
                    <td className="py-4 px-4 text-center font-bold text-gray-900 dark:text-white">
                      {p.resolution_time_hours} Hours
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm">
            <div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">Campus Bulletins & Broadcasts</h2>
              <p className="text-xs text-gray-400">Broadcast updates to Students, Staff, or University-wide</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAnnounceModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-bold shadow transition-transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Publish Bulletin</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {announcements?.map((a) => (
              <div key={a.id} className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-3 relative group">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${AUDIENCE_BADGES[a.target_audience] || AUDIENCE_BADGES.ALL}`}>
                    Audience: {a.target_audience}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteAnnouncementMutation.mutate(a.id)}
                    className="p-1 rounded text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove Bulletin"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">{a.title}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 leading-relaxed">{a.content}</p>
                <div className="text-xs text-gray-400 pt-2 border-t border-gray-100 dark:border-navy-800">
                  Published: {formatToIST(a.published_at || a.created_at)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: AUDIT EVENTS */}
      {activeTab === 'audit' && (
        <div className="rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm overflow-hidden p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Security & Administrative Audit Trail</h2>
            <p className="text-xs text-gray-400">Append-only log of high-privilege configuration and staff authorization changes</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-navy-950/60 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider border-b border-gray-200 dark:border-navy-800">
                  <th className="py-3 px-4">Timestamp (IST)</th>
                  <th className="py-3 px-4">Admin Operator</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Type</th>
                  <th className="py-3 px-4">Documented Reason / Delta</th>
                  <th className="py-3 px-3 text-right">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-navy-800 font-medium">
                {auditLogs?.items?.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/60 dark:hover:bg-navy-800/40 text-xs">
                    <td className="py-3 px-4 font-mono text-gray-500">{formatToIST(log.created_at)}</td>
                    <td className="py-3 px-4 font-bold text-gray-800 dark:text-gray-200">
                      {log.admin?.full_name || 'Super Admin'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-coral-600 dark:text-coral-400 font-mono">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 uppercase text-gray-500 font-semibold">{log.target_type}</td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-300 max-w-xs truncate">
                      {log.reason || JSON.stringify(log.new_value) || '—'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-gray-400">{log.ip_address || '127.0.0.1'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUSPEND REASON MODAL */}
      {suspendModalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-navy-900 border border-red-500/30 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Suspend Staff Account</h3>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              You are suspending access for <strong>{suspendModalStaff.full_name}</strong> ({suspendModalStaff.email}). A documented administrative reason is mandatory.
            </p>

            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                Mandatory Reason for Suspension *
              </label>
              <textarea
                rows="3"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                required
                placeholder="e.g. Conduct review pending regarding student record disclosures..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSuspendModalStaff(null);
                  setSuspendReason('');
                }}
                className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-sm font-semibold text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (suspendReason.trim().length < 5) {
                    toast.error('Please specify a detailed reason (min 5 characters).');
                    return;
                  }
                  updateStaffStatusMutation.mutate({
                    staffId: suspendModalStaff.id,
                    status: 'SUSPENDED',
                    reason: suspendReason.trim(),
                  });
                }}
                disabled={updateStaffStatusMutation.isPending}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-md"
              >
                Confirm Suspension
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE DEPARTMENT MODAL */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add Department</h3>
              <button type="button" onClick={() => setIsDeptModalOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createDeptMutation.mutate(deptForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  placeholder="e.g. Examinations & Grading"
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Department Code *</label>
                <input
                  type="text"
                  required
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. EXAM"
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Description</label>
                <textarea
                  rows="2"
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                  placeholder="Responsibilities, physical location, etc."
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createDeptMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-bold"
                >
                  Save Department
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE CATEGORY MODAL */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add Category & Routing Rule</h3>
              <button type="button" onClick={() => setIsCategoryModalOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createCategoryMutation.mutate(categoryForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="e.g. Grade Re-evaluation"
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Auto-Route To Department *</label>
                <select
                  required
                  value={categoryForm.defaultDepartmentId}
                  onChange={(e) => setCategoryForm({ ...categoryForm, defaultDepartmentId: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                >
                  <option value="">Select Destination Department...</option>
                  {departments?.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Default Priority</label>
                <select
                  value={categoryForm.defaultPriority}
                  onChange={(e) => setCategoryForm({ ...categoryForm, defaultPriority: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createCategoryMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-bold"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE SLA MODAL */}
      {isSlaModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Configure SLA Target</h3>
              <button type="button" onClick={() => setIsSlaModalOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createSlaMutation.mutate(slaForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Policy Name *</label>
                <input
                  type="text"
                  required
                  value={slaForm.name}
                  onChange={(e) => setSlaForm({ ...slaForm, name: e.target.value })}
                  placeholder="e.g. Critical Laboratory Emergency"
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Priority Target *</label>
                  <select
                    value={slaForm.priority}
                    onChange={(e) => setSlaForm({ ...slaForm, priority: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                  >
                    <option value="Urgent">Urgent</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Optional Category</label>
                  <select
                    value={slaForm.categoryId}
                    onChange={(e) => setSlaForm({ ...slaForm, categoryId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">Global (All Categories)</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Response Time (Hours) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={slaForm.responseTimeHours}
                    onChange={(e) => setSlaForm({ ...slaForm, responseTimeHours: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase mb-1">Resolution Time (Hours) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={slaForm.resolutionTimeHours}
                    onChange={(e) => setSlaForm({ ...slaForm, resolutionTimeHours: parseInt(e.target.value, 10) })}
                    className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSlaModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSlaMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-bold"
                >
                  Save SLA Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE ANNOUNCEMENT MODAL */}
      {isAnnounceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Publish Campus Announcement</h3>
              <button type="button" onClick={() => setIsAnnounceModalOpen(false)}>
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createAnnouncementMutation.mutate(announceForm);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Bulletin Title *</label>
                <input
                  type="text"
                  required
                  value={announceForm.title}
                  onChange={(e) => setAnnounceForm({ ...announceForm, title: e.target.value })}
                  placeholder="e.g. Monsoon Semester Fee Payment Extension"
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Target Audience *</label>
                <select
                  value={announceForm.targetAudience}
                  onChange={(e) => setAnnounceForm({ ...announceForm, targetAudience: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white"
                >
                  <option value="ALL">Entire Campus (Students & Staff)</option>
                  <option value="STUDENTS">Students Only</option>
                  <option value="STAFF">Staff & Faculty Only</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Announcement Details *</label>
                <textarea
                  rows="4"
                  required
                  value={announceForm.content}
                  onChange={(e) => setAnnounceForm({ ...announceForm, content: e.target.value })}
                  placeholder="Detailed announcement text with instructions or deadlines..."
                  className="w-full px-3.5 py-2 rounded-xl bg-gray-50 dark:bg-navy-800 border border-gray-300 dark:border-navy-700 text-sm text-gray-900 dark:text-white resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAnnounceModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-sm font-semibold text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createAnnouncementMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-bold"
                >
                  Publish Broadcast
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
