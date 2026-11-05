import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/client';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import CreateTicketModal from '../components/CreateTicketModal';
import {
  Ticket,
  Search,
  Filter,
  Plus,
  ArrowUpDown,
  Download,
  CheckSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Building,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Shield,
  Loader2,
  MessageSquareCode,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatToIST, formatRelativeIST } from '../utils/date';

export default function TicketsPage() {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-driven query state
  const search = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || '';
  const priorityFilter = searchParams.get('priority') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const sortBy = searchParams.get('sortBy') || 'created_at';
  const sortOrder = searchParams.get('sortOrder') || 'desc';

  const [tickets, setTickets] = useState([]);
  const [totalTickets, setTotalTickets] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showQueries, setShowQueries] = useState(false);
  const [queriesCount, setQueriesCount] = useState(0);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedTicketIds, setSelectedTicketIds] = useState([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  const isStaffOrAdmin = role === 'STAFF' || role === 'SUPER_ADMIN';

  // Fetch tickets
  const fetchTickets = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (priorityFilter) params.set('priority', priorityFilter);
    params.set('page', page.toString());
    params.set('limit', '50'); // fetch batch for client filtering
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);

    api
      .get(`/tickets?${params.toString()}`)
      .then((res) => {
        const payload = res?.data || res;
        const list = Array.isArray(payload) ? payload : (payload?.tickets || []);

        // Distinguish conversational queries (information requests) vs standard support tickets
        const isQueryTicket = (t) =>
          (Array.isArray(t.tags) && t.tags.includes('WORKFLOW:INFORMATION_REQUEST')) ||
          (typeof t.title === 'string' && t.title.toLowerCase().startsWith('information request:')) ||
          t.request_type === 'INFORMATION_REQUEST';

        const qCount = list.filter(isQueryTicket).length;
        setQueriesCount(qCount);

        const displayedList = showQueries ? list : list.filter((t) => !isQueryTicket(t));
        setTickets(displayedList);
        setTotalTickets(displayedList.length);
        setTotalPages(Math.max(1, Math.ceil(displayedList.length / 10)));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load tickets:', err);
        toast.error(err.message || 'Error fetching tickets');
        setLoading(false);
      });
  }, [search, statusFilter, priorityFilter, page, sortBy, sortOrder, showQueries]);

  useEffect(() => {
    fetchTickets();

    // 1. Supabase Realtime synchronization
    let channel = null;
    if (supabase && typeof supabase.channel === 'function' && user?.id) {
      try {
        const filterStr =
          role === 'STUDENT'
            ? `created_by=eq.${user.id}`
            : (profile?.department_id ? `assigned_department_id=eq.${profile.department_id}` : undefined);

        channel = supabase
          .channel(`public:tickets:sync:${user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'tickets',
              ...(filterStr ? { filter: filterStr } : {}),
            },
            () => {
              fetchTickets();
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              fetchTickets();
            }
          });
      } catch (e) {
        console.debug('Realtime tickets subscription notice:', e?.message);
      }
    }

    // 2. Reconnection and Focus Event Synchronization
    const handleFocus = () => fetchTickets();
    const handleOnline = () => {
      toast.success('Connection restored. Updating tickets...', { id: 'online-sync-toast', duration: 2500 });
      fetchTickets();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    // 3. Reliable periodic polling fallback (every 20s)
    let intervalId = null;
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
      intervalId = setInterval(() => {
        fetchTickets();
      }, 20000);
      if (typeof intervalId?.unref === 'function') intervalId.unref();
    }

    return () => {
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchTickets, user?.id, profile?.department_id, role]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== 'page') {
      next.set('page', '1');
    }
    setSearchParams(next);
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedTicketIds(tickets.map((t) => t.id));
    } else {
      setSelectedTicketIds([]);
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedTicketIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBulkClose = async () => {
    if (selectedTicketIds.length === 0) return;
    const reason = window.prompt('Enter resolution summary for selected tickets:');
    if (!reason || reason.trim().length < 5) {
      toast.error('Resolution summary is required (minimum 5 characters).');
      return;
    }

    setBulkActionLoading(true);
    try {
      await api.post('/tickets/bulk/close', {
        ticketIds: selectedTicketIds,
        resolutionSummary: reason.trim(),
      });
      toast.success(`Closed ${selectedTicketIds.length} tickets successfully.`);
      setSelectedTicketIds([]);
      fetchTickets();
    } catch (err) {
      toast.error(err.message || 'Failed to bulk close tickets');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await api.get('/tickets/export/csv', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `smartdesk-tickets-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('CSV export downloaded successfully!');
    } catch (err) {
      toast.error(err.message || 'Export failed');
    }
  };

  // Status Badge Helper
  const renderStatusBadge = (status) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Open
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" />
            In Progress
          </span>
        );
      case 'AWAITING_INFO':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <HelpCircle className="w-3 h-3" />
            Awaiting Info
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Resolved
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/20">
            Closed
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-coral-500/10 text-coral-600 dark:text-coral-400 border border-coral-500/20">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  // Priority Badge Helper
  const renderPriorityBadge = (priority) => {
    switch (priority) {
      case 'Urgent':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-coral-500/15 text-coral-600 dark:text-coral-400 uppercase tracking-wider">
            Urgent
          </span>
        );
      case 'High':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            High
          </span>
        );
      case 'Medium':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            Medium
          </span>
        );
      case 'Low':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-gray-200 dark:bg-navy-800 text-gray-700 dark:text-gray-400 uppercase tracking-wider">
            Low
          </span>
        );
      default:
        return <span>{priority}</span>;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-navy-900 dark:text-white flex items-center gap-2.5">
            <Ticket className="w-7 h-7 text-coral-500" />
            <span>{role === 'STUDENT' ? 'My Support Tickets' : 'Support Tickets'}</span>
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isStaffOrAdmin
              ? `Manage and triage department support tickets (${totalTickets} total)`
              : `Track and raise your college inquiries and support requests (${totalTickets} total)`}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {isStaffOrAdmin && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-900 hover:bg-gray-50 dark:hover:bg-navy-800 text-xs font-semibold transition-colors"
            >
              <Download className="w-4 h-4 text-gray-500" />
              <span>Export CSV</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => navigate('/tickets/new')}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-semibold text-sm shadow-md shadow-coral-500/20 transition-all hover:scale-105 active:scale-95 flex-1 sm:flex-initial"
          >
            <Plus className="w-4 h-4" />
            <span>Raise Ticket</span>
          </button>
        </div>
      </div>

      {/* Student Queries Dedicated Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-500/10 via-sky-500/10 to-coral-500/10 border border-indigo-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <MessageSquareCode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-gray-900 dark:text-white">
                Looking for your Student Queries or AI Information Requests?
              </p>
              {queriesCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500 text-white">
                  {queriesCount} Active
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Conversational inquiries with department staff have their own dedicated section with real-time discussions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => setShowQueries(!showQueries)}
            className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:underline px-2.5 py-1"
          >
            {showQueries ? 'Show Support Tickets Only' : 'Include Queries in List'}
          </button>
          <Link
            to="/queries"
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
          >
            <span>Open Student Queries</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search Input */}
          <div className="relative md:col-span-2">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
            <input
              type="text"
              defaultValue={search}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  updateParam('search', e.target.value);
                }
              }}
              onBlur={(e) => updateParam('search', e.target.value)}
              placeholder="Search by ticket #, title, or keywords..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-gray-50/50 dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => updateParam('status', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-gray-50/50 dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
            >
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="AWAITING_INFO">Awaiting Info</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div>
            <select
              value={priorityFilter}
              onChange={(e) => updateParam('priority', e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-gray-50/50 dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
            >
              <option value="">All Priorities</option>
              <option value="Urgent">Urgent Priority</option>
              <option value="High">High Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="Low">Low Priority</option>
            </select>
          </div>
        </div>

        {/* Staff Bulk Action Bar */}
        {isStaffOrAdmin && selectedTicketIds.length > 0 && (
          <div className="pt-3 border-t border-gray-100 dark:border-navy-800 flex items-center justify-between text-xs animate-fadeIn">
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              {selectedTicketIds.length} ticket(s) selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBulkClose}
                disabled={bulkActionLoading}
                className="px-3.5 py-1.5 rounded-lg bg-coral-500 hover:bg-coral-600 text-white font-semibold flex items-center gap-1.5 transition-colors"
              >
                {bulkActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Bulk Close</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ticket List Table / Card View */}
      <div className="bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 rounded-3xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-coral-500 animate-spin mx-auto" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Loading support tickets...
            </p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-navy-100 dark:bg-navy-800 text-gray-400 dark:text-gray-500 flex items-center justify-center mx-auto">
              <Ticket className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Tickets Found</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1">
                {search || statusFilter || priorityFilter
                  ? 'No tickets match the selected filters. Try clearing your search parameters.'
                  : 'You have not raised any support inquiries yet. Click "Raise Ticket" to submit one.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-navy-950/60 border-b border-gray-200 dark:border-navy-800 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                <tr>
                  {isStaffOrAdmin && (
                    <th className="p-4 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedTicketIds.length === tickets.length && tickets.length > 0}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-coral-500 rounded border-gray-300 focus:ring-coral-500 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="px-6 py-4">Ticket</th>
                  <th className="px-4 py-4">Category</th>
                  <th className="px-4 py-4">Priority</th>
                  <th className="px-4 py-4">Status</th>
                  <th className="px-4 py-4">Assigned Department</th>
                  <th className="px-4 py-4">SLA Target</th>
                  <th className="px-4 py-4">Created / Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-navy-800">
                {tickets.map((t) => {
                  const isSelected = selectedTicketIds.includes(t.id);
                  return (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className={`hover:bg-gray-50/80 dark:hover:bg-navy-800/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-coral-500/5 dark:bg-coral-500/10' : ''
                      }`}
                    >
                      {isStaffOrAdmin && (
                        <td
                          className="p-4 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(t.id);
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="w-4 h-4 text-coral-500 rounded border-gray-300 focus:ring-coral-500 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-coral-600 dark:text-coral-400">
                            {t.ticket_number}
                          </span>
                          {t.is_confidential && (
                            <span className="p-1 rounded bg-amber-500/10 text-amber-500" title="Confidential Grievance">
                              <Shield className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-gray-900 dark:text-white line-clamp-1 mt-0.5">
                          {t.title}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                          {t.description}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {t.category?.name || 'General'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {renderPriorityBadge(t.priority)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {renderStatusBadge(t.status)}
                          {t.status === 'AWAITING_INFO' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
                              Action Needed
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-xs font-medium text-gray-900 dark:text-white">
                          {t.assigned_department?.name || 'Department Desk'}
                        </div>
                        {t.student_department && (
                          <div className="text-[10px] text-gray-400">
                            Student Dept: {t.student_department.code}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        <div className="font-medium text-gray-700 dark:text-gray-300">
                          {t.sla_due_at ? formatToIST(t.sla_due_at) : (t.resolution_due_at ? formatToIST(t.resolution_due_at) : 'Standard 24h SLA')}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        <div title={formatToIST(t.created_at)}>{formatRelativeIST(t.created_at)}</div>
                        {t.updated_at && t.updated_at !== t.created_at && (
                          <div className="text-[10px] text-gray-400">
                            Updated {formatRelativeIST(t.updated_at)}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-navy-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => updateParam('page', (page - 1).toString())}
                className="p-2 rounded-lg border border-gray-300 dark:border-navy-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => updateParam('page', (page + 1).toString())}
                className="p-2 rounded-lg border border-gray-300 dark:border-navy-700 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Creation Modal */}
      <CreateTicketModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => {
          fetchTickets();
        }}
      />
    </div>
  );
}
