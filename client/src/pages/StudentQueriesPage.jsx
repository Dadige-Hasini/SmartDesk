import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { supabase } from '../config/supabase';
import {
  MessageSquareCode,
  MessageSquare,
  Bot,
  Send,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building,
  User,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
  Loader2,
  ExternalLink,
  Plus,
  RefreshCw,
  Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatToIST, formatRelativeIST } from '../utils/date';

export default function StudentQueriesPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, AWAITING_REPLY, REPLIED, RESOLVED
  const [expandedQueryId, setExpandedQueryId] = useState(null);
  const [discussionComments, setDiscussionComments] = useState({});
  const [loadingComments, setLoadingComments] = useState({});
  const [replyText, setReplyText] = useState({});
  const [submittingReply, setSubmittingReply] = useState({});

  // 1. Fetch student queries (tickets originating from AI Assistant or tagged with INFORMATION_REQUEST)
  const fetchQueries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/tickets?limit=100');
      const payload = res?.data || res;
      const allTickets = Array.isArray(payload) ? payload : (payload?.tickets || []);

      // Filter for student queries: tagged with WORKFLOW:INFORMATION_REQUEST or title starting with Information Request:
      const studentQueries = allTickets.filter((t) => {
        const isInfoRequest =
          (Array.isArray(t.tags) && t.tags.includes('WORKFLOW:INFORMATION_REQUEST')) ||
          (typeof t.title === 'string' && t.title.toLowerCase().startsWith('information request:')) ||
          t.request_type === 'INFORMATION_REQUEST';
        return isInfoRequest;
      });

      setQueries(studentQueries);
    } catch (err) {
      console.error('Failed to load student queries:', err);
      toast.error(err?.response?.data?.message || err?.message || 'Could not load student queries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueries();

    // Realtime listener for ticket updates and comments
    let channel = null;
    if (supabase && typeof supabase.channel === 'function' && user?.id) {
      try {
        channel = supabase
          .channel(`student_queries:${user.id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'ticket_comments',
            },
            (payload) => {
              // Refresh queries list and comments if expanded
              fetchQueries();
              if (payload.new?.ticket_id) {
                fetchComments(payload.new.ticket_id, true);
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'tickets',
              filter: `created_by=eq.${user.id}`,
            },
            () => {
              fetchQueries();
            }
          )
          .subscribe();
      } catch (e) {
        console.debug('Realtime subscription notice:', e?.message);
      }
    }

    return () => {
      if (channel && supabase && typeof supabase.removeChannel === 'function') {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchQueries, user?.id]);

  // 2. Fetch comments for an expanded query
  const fetchComments = async (ticketId, silent = false) => {
    if (!silent) {
      setLoadingComments((prev) => ({ ...prev, [ticketId]: true }));
    }
    try {
      const res = await api.get(`/tickets/${ticketId}/comments`);
      const list = res?.data?.data || res?.data || [];
      setDiscussionComments((prev) => ({
        ...prev,
        [ticketId]: Array.isArray(list) ? list : [],
      }));
    } catch (err) {
      console.warn('Failed to load comments for query:', ticketId, err);
    } finally {
      if (!silent) {
        setLoadingComments((prev) => ({ ...prev, [ticketId]: false }));
      }
    }
  };

  const toggleExpandQuery = (ticketId) => {
    if (expandedQueryId === ticketId) {
      setExpandedQueryId(null);
    } else {
      setExpandedQueryId(ticketId);
      if (!discussionComments[ticketId]) {
        fetchComments(ticketId);
      }
    }
  };

  // 3. Post reply to staff directly from inline discussion
  const handleSendReply = async (ticketId, ticketNumber) => {
    const text = (replyText[ticketId] || '').trim();
    if (!text) {
      toast.error('Please enter a response message.');
      return;
    }

    setSubmittingReply((prev) => ({ ...prev, [ticketId]: true }));
    try {
      await api.post(`/tickets/${ticketId}/comments`, {
        content: text,
        is_internal: false,
      });

      toast.success('Your reply was delivered to department staff!');
      setReplyText((prev) => ({ ...prev, [ticketId]: '' }));
      // Reload comments
      await fetchComments(ticketId, true);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to send reply to staff');
    } finally {
      setSubmittingReply((prev) => ({ ...prev, [ticketId]: false }));
    }
  };

  // Filter calculations
  const filteredQueries = queries.filter((q) => {
    // Search
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchTitle = q.title?.toLowerCase().includes(term);
      const matchDesc = q.description?.toLowerCase().includes(term);
      const matchNum = q.ticket_number?.toLowerCase().includes(term);
      const matchDept = q.assigned_department?.name?.toLowerCase().includes(term);
      if (!matchTitle && !matchDesc && !matchNum && !matchDept) return false;
    }

    // Status Filter
    if (statusFilter === 'AWAITING_REPLY') {
      return q.status === 'OPEN' || q.status === 'AWAITING_INFO';
    }
    if (statusFilter === 'REPLIED') {
      return q.status === 'IN_PROGRESS';
    }
    if (statusFilter === 'RESOLVED') {
      return q.status === 'RESOLVED' || q.status === 'CLOSED';
    }

    return true;
  });

  // Metric counts
  const awaitingCount = queries.filter((q) => q.status === 'OPEN' || q.status === 'AWAITING_INFO').length;
  const inProgressCount = queries.filter((q) => q.status === 'IN_PROGRESS').length;
  const resolvedCount = queries.filter((q) => q.status === 'RESOLVED' || q.status === 'CLOSED').length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12 animate-fadeIn">
      {/* 1. Header Banner */}
      <div className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-bl from-coral-500/10 via-indigo-500/10 to-transparent rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-navy-900 to-indigo-600 flex items-center justify-center text-white shadow-lg">
              <MessageSquareCode className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  Student Queries & Inquiries
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  Live Discussion
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
                Direct conversational queries and factual clarification requests submitted to university departments. Kept separate from institutional support tickets.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto justify-end">
            <button
              onClick={fetchQueries}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors border border-gray-200 dark:border-navy-700"
              title="Refresh queries"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => navigate('/ai-chat')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-gradient-to-r from-coral-500 to-indigo-600 hover:from-coral-600 hover:to-indigo-700 text-white shadow-md shadow-indigo-500/20 transition-all hover:scale-[1.02]"
            >
              <Bot className="w-4 h-4" />
              <span>Ask AI / New Query</span>
            </button>
          </div>
        </div>

        {/* Info Pill */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-navy-800/80 flex flex-wrap items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 gap-2">
          <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300 font-medium">
            <Info className="w-3.5 h-3.5 text-indigo-500" />
            Staff replies automatically appear in real time and can also be continued in the AI Chatbot.
          </span>
          <Link
            to="/tickets"
            className="text-xs font-semibold text-coral-600 dark:text-coral-400 hover:underline flex items-center gap-1"
          >
            <span>Switch to Support Tickets</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* 2. Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-navy-900 p-4 rounded-2xl border border-gray-200 dark:border-navy-800 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <MessageSquareCode className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-gray-900 dark:text-white">{queries.length}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Total Queries</div>
          </div>
        </div>

        <div className="bg-white dark:bg-navy-900 p-4 rounded-2xl border border-gray-200 dark:border-navy-800 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{awaitingCount}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Awaiting Staff</div>
          </div>
        </div>

        <div className="bg-white dark:bg-navy-900 p-4 rounded-2xl border border-gray-200 dark:border-navy-800 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{inProgressCount}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Staff In Discussion</div>
          </div>
        </div>

        <div className="bg-white dark:bg-navy-900 p-4 rounded-2xl border border-gray-200 dark:border-navy-800 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xl font-extrabold text-gray-900 dark:text-white">{resolvedCount}</div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400">Answered & Closed</div>
          </div>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white dark:bg-navy-900 p-4 rounded-2xl border border-gray-200 dark:border-navy-800 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search query keywords, department, or #..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 bg-gray-50 dark:bg-navy-950 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All Queries' },
            { id: 'AWAITING_REPLY', label: 'Awaiting Staff' },
            { id: 'REPLIED', label: 'In Discussion' },
            { id: 'RESOLVED', label: 'Resolved' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Queries List */}
      {loading ? (
        <div className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 p-12 text-center shadow-sm">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-medium">
            Loading student queries and live discussion threads...
          </p>
        </div>
      ) : filteredQueries.length === 0 ? (
        <div className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 p-12 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <MessageSquareCode className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">No Student Queries Found</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {search || statusFilter !== 'ALL'
                ? 'No inquiries match the current search or filter criteria. Try resetting your filters.'
                : 'You have not submitted any conversational queries yet. You can ask any question in the AI Assistant, and if department clarification is needed, it will be forwarded here!'}
            </p>
          </div>
          <button
            onClick={() => navigate('/ai-chat')}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-105"
          >
            <Bot className="w-4 h-4" />
            <span>Open AI Chatbot & Ask a Question</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredQueries.map((q) => {
            const isExpanded = expandedQueryId === q.id;
            const comments = discussionComments[q.id] || [];
            const isLoadingThisComments = loadingComments[q.id];
            const cleanTitle = q.title?.replace(/^Information Request:\s*/i, '');

            const isAwaiting = q.status === 'OPEN' || q.status === 'AWAITING_INFO';
            const isInDiscussion = q.status === 'IN_PROGRESS';
            const isResolved = q.status === 'RESOLVED' || q.status === 'CLOSED';

            return (
              <div
                key={q.id}
                className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 shadow-sm overflow-hidden transition-all hover:border-indigo-500/40"
              >
                {/* Main Card Header */}
                <div className="p-5 sm:p-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800">
                        {q.ticket_number}
                      </span>

                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-300">
                        <Building className="w-3 h-3 text-gray-500" />
                        {q.assigned_department?.name || 'Department Desk'}
                      </span>

                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        Staff Information Request
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isAwaiting && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          <Clock className="w-3 h-3" />
                          Awaiting Staff Response
                        </span>
                      )}
                      {isInDiscussion && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                          <MessageSquare className="w-3 h-3" />
                          Staff Replied • In Discussion
                        </span>
                      )}
                      {isResolved && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-500/10 text-gray-600 dark:text-gray-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Resolved
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white leading-snug">
                      {cleanTitle}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
                      {q.description}
                    </p>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-2 border-t border-gray-100 dark:border-navy-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-[11px] text-gray-400">
                      Submitted {formatRelativeIST(q.created_at)}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate('/ai-chat')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                        title="Continue this inquiry in AI Assistant"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Continue in AI Chat</span>
                      </button>

                      <button
                        onClick={() => toggleExpandQuery(q.id)}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all ${
                          isExpanded
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-navy-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-navy-700'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Discussion Thread</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      <Link
                        to={`/tickets/${q.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs"
                        title="View formal audit details"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>

                {/* 5. Expanded Discussion Thread */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-navy-800 bg-gray-50/70 dark:bg-navy-950/60 p-5 sm:p-6 space-y-4 animate-fadeIn">
                    <div className="flex items-center justify-between pb-2 border-b border-gray-200/50 dark:border-navy-800/60">
                      <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Live Department Discussion Table</span>
                      </h4>
                      <button
                        onClick={() => fetchComments(q.id)}
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Refresh thread</span>
                      </button>
                    </div>

                    {isLoadingThisComments ? (
                      <div className="py-8 text-center text-xs text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-1 text-indigo-500" />
                        Loading conversation history...
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="py-6 text-center text-xs text-gray-400 bg-white dark:bg-navy-900 rounded-2xl border border-dashed border-gray-200 dark:border-navy-800 p-4">
                        <Clock className="w-5 h-5 text-amber-500 mx-auto mb-1" />
                        <span>Awaiting first response from {q.assigned_department?.name || 'department staff'}. You can add additional context below!</span>
                      </div>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {comments.map((comment) => {
                          const isStaff = comment.author?.role === 'STAFF' || comment.author?.role === 'SUPER_ADMIN';

                          return (
                            <div
                              key={comment.id}
                              className={`p-4 rounded-2xl text-xs space-y-2 shadow-xs ${
                                isStaff
                                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-950 dark:text-emerald-100 ml-0 mr-4'
                                  : 'bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 text-gray-900 dark:text-gray-100 ml-4 mr-0'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] ${
                                      isStaff ? 'bg-emerald-600 text-white' : 'bg-coral-500 text-white'
                                    }`}
                                  >
                                    {isStaff ? 'S' : 'U'}
                                  </div>
                                  <span className="font-bold text-gray-900 dark:text-white">
                                    {comment.author?.full_name || (isStaff ? 'Department Staff' : 'You')}
                                  </span>
                                  {isStaff && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-600/20 text-emerald-700 dark:text-emerald-300">
                                      Staff
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {formatRelativeIST(comment.created_at)}
                                </span>
                              </div>

                              <div className="leading-relaxed whitespace-pre-wrap pl-8">
                                {comment.content}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Inline Reply Input */}
                    <div className="pt-2 flex gap-2">
                      <input
                        type="text"
                        value={replyText[q.id] || ''}
                        onChange={(e) => setReplyText({ ...replyText, [q.id]: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendReply(q.id, q.ticket_number);
                          }
                        }}
                        placeholder={`Reply directly to ${q.assigned_department?.name || 'department staff'}...`}
                        className="flex-1 px-4 py-2.5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-300 dark:border-navy-700 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={submittingReply[q.id] || !replyText[q.id]?.trim()}
                        onClick={() => handleSendReply(q.id, q.ticket_number)}
                        className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all hover:scale-105 disabled:opacity-50 disabled:scale-100"
                      >
                        {submittingReply[q.id] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Send Reply</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

