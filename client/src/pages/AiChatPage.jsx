import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
import { supabase } from '../config/supabase';
import { formatRelativeIST } from '../utils/date';
import {
  Bot,
  User,
  Send,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  PlusCircle,
  BookOpen,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Trash2,
  Info,
  Loader2,
  ArrowRight,
  ExternalLink,
  Building,
  MessageSquare,
  MessageSquareCode,
  Clock,
  Bell,
  PanelLeft,
  PanelLeftClose,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STARTER_PROMPTS = [
  'What is artificial intelligence and machine learning?',
  'What are the semester fee payment deadlines and late penalty fees?',
  'What is the status of my tickets and when will they be resolved?',
  'I need official approval for attendance shortage due to medical leave',
];

export default function AiChatPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const WELCOME_MESSAGE = {
    id: 'welcome-1',
    role: 'assistant',
    content:
      'Hello! I am your SmartDesk AI Assistant. I provide answers strictly grounded in official college policies, academic calendars, and administrative guidelines. How can I help you today?',
    citations: [],
    hasSufficientEvidence: true,
    confidenceScore: 1.0,
    timestamp: new Date().toISOString(),
  };

  // Chat & Conversation Persistence State
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestingTicket, setSuggestingTicket] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState({});
  const [feedbackSubmitted, setFeedbackSubmitted] = useState({});
  const [activeFeedbackModal, setActiveFeedbackModal] = useState(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [serviceStatus, setServiceStatus] = useState(null);

  // Live Staff Discussion & Query Notification State
  const [replyInputs, setReplyInputs] = useState({});
  const [sendingReply, setSendingReply] = useState({});
  const [directSubmittingTicket, setDirectSubmittingTicket] = useState({});
  const [recentStaffAlerts, setRecentStaffAlerts] = useState([]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const loadConversationMessages = async (convId) => {
    if (!convId) return;
    try {
      const res = await api.get(`/ai/conversations/${convId}/messages`);
      const msgList = res?.data?.data || res?.data || [];
      if (Array.isArray(msgList) && msgList.length > 0) {
        const formatted = msgList.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          workflowMode: m.workflow_mode || m.workflowMode,
          workflowLabel: m.workflow_label || m.workflowLabel,
          workflowDescription: m.metadata?.workflowDescription,
          citations: m.metadata?.citations || [],
          suggestedActions: m.metadata?.suggestedActions || [],
          ticketDraft: m.metadata?.ticketDraft || null,
          requiresStaffApproval: m.metadata?.requiresStaffApproval || false,
          requiresStaffInformation: m.metadata?.requiresStaffInformation || false,
          hasSufficientEvidence: m.metadata?.hasSufficientEvidence ?? true,
          confidenceScore: m.metadata?.confidenceScore ?? 0.95,
          timestamp: m.created_at || m.timestamp || new Date().toISOString(),
        }));
        setMessages([WELCOME_MESSAGE, ...formatted]);
      } else {
        setMessages([WELCOME_MESSAGE]);
      }
    } catch (e) {
      console.warn('Could not load messages for conversation', convId, e);
    }
  };

  const fetchConversations = async (preferredId = null) => {
    setLoadingConversations(true);
    try {
      const res = await api.get('/ai/conversations');
      const list = res?.data?.data || res?.data || [];
      if (Array.isArray(list) && list.length > 0) {
        setConversations(list);
        const targetId = preferredId || activeConversationId || list[0].id;
        setActiveConversationId(targetId);
        await loadConversationMessages(targetId);
      } else {
        try {
          const createRes = await api.post('/ai/conversations', { title: 'Welcome & Academic Support' });
          const newConv = createRes?.data?.data || createRes?.data;
          if (newConv?.id) {
            setConversations([newConv]);
            setActiveConversationId(newConv.id);
          }
        } catch {}
      }
    } catch (e) {
      console.warn('Could not load conversations', e);
    } finally {
      setLoadingConversations(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const res = await api.post('/ai/conversations', { title: 'New Conversation' });
      const newConv = res?.data?.data || res?.data;
      if (newConv?.id) {
        setConversations((prev) => [newConv, ...prev]);
        setActiveConversationId(newConv.id);
        setMessages([WELCOME_MESSAGE]);
        toast.success('Started a new conversation');
      }
    } catch {
      const offlineId = `conv-${Date.now()}`;
      const offlineConv = { id: offlineId, title: 'New Conversation', last_message_at: new Date().toISOString() };
      setConversations((prev) => [offlineConv, ...prev]);
      setActiveConversationId(offlineId);
      setMessages([WELCOME_MESSAGE]);
    }
  };

  const handleSelectConversation = (convId) => {
    if (convId === activeConversationId) return;
    setActiveConversationId(convId);
    loadConversationMessages(convId);
    setShowSidebar(false);
  };

  const handleDeleteConversation = async (convId, e) => {
    e.stopPropagation();
    try {
      await api.delete(`/ai/conversations/${convId}`);
      toast.success('Conversation archived');
      const updated = conversations.filter((c) => c.id !== convId);
      setConversations(updated);
      if (activeConversationId === convId) {
        if (updated.length > 0) {
          setActiveConversationId(updated[0].id);
          loadConversationMessages(updated[0].id);
        } else {
          handleNewChat();
        }
      }
    } catch {
      toast.error('Could not archive conversation');
    }
  };

  // Load AI Service status probe, saved conversations & recent staff replies
  useEffect(() => {
    async function checkStatusAndHistory() {
      try {
        const res = await api.get('/ai/status');
        setServiceStatus(res?.data?.data || null);
      } catch {
        // Fallback silently if status probe is unreachable
      }

      await fetchConversations();

      // Check for recent staff responses on the student's inquiries
      if (user?.id) {
        try {
          const ticketsRes = await api.get('/tickets?limit=25');
          const tList = ticketsRes?.data?.tickets || (Array.isArray(ticketsRes?.data) ? ticketsRes.data : []);
          const inquiries = tList.filter((t) => {
            return (
              (Array.isArray(t.tags) && t.tags.includes('WORKFLOW:INFORMATION_REQUEST')) ||
              (typeof t.title === 'string' && t.title.toLowerCase().startsWith('information request:')) ||
              t.request_type === 'INFORMATION_REQUEST'
            );
          });

          for (const inq of inquiries.slice(0, 5)) {
            try {
              const cRes = await api.get(`/tickets/${inq.id}/comments`);
              const comments = cRes?.data?.data || cRes?.data || [];
              const staffComments = comments.filter((c) => c.author_id !== user.id && !c.is_internal);
              if (staffComments.length > 0) {
                const latest = staffComments[staffComments.length - 1];
                setRecentStaffAlerts((prev) => {
                  if (prev.some((a) => a.id === latest.id)) return prev;
                  return [...prev, { ...latest, ticket: inq }];
                });
              }
            } catch (err) {
              // Silently ignore individual ticket comment check error
            }
          }
        } catch (err) {
          // Silently ignore inquiries check
        }
      }
    }
    checkStatusAndHistory();
  }, [user?.id]);

  // Realtime Supabase synchronization for live staff discussion comments
  useEffect(() => {
    let channel = null;
    if (supabase && typeof supabase.channel === 'function' && user?.id) {
      try {
        channel = supabase
          .channel(`ai_chat:student_staff_sync:${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'ticket_comments',
            },
            async (payload) => {
              const newComment = payload.new;
              if (newComment && newComment.author_id !== user.id && !newComment.is_internal) {
                try {
                  const tRes = await api.get(`/tickets/${newComment.ticket_id}`);
                  const ticket = tRes?.data?.data || tRes?.data;

                  // Verify this comment belongs to the authenticated student's ticket
                  if (ticket && ticket.created_by === user.id) {
                    let authorName = 'Department Staff';
                    try {
                      const cRes = await api.get(`/tickets/${newComment.ticket_id}/comments`);
                      const cList = cRes?.data?.data || cRes?.data || [];
                      const found = cList.find((c) => c.id === newComment.id);
                      if (found?.author?.full_name) authorName = found.author.full_name;
                    } catch {}

                    // High priority notification toast
                    toast.success(
                      `🔔 Staff Response Received: ${authorName} from ${ticket.assigned_department?.name || 'Department'} just replied to your query!`,
                      {
                        duration: 8000,
                        icon: '💬',
                        style: {
                          background: '#064e3b',
                          color: '#fff',
                          border: '1px solid #10b981',
                        },
                      }
                    );

                    // Inject live staff response card directly into AI chat conversation stream
                    const staffMsg = {
                      id: `staff-comment-${newComment.id}`,
                      role: 'staff_response',
                      ticketId: ticket.id,
                      ticketNumber: ticket.ticket_number,
                      ticketTitle: ticket.title,
                      departmentName: ticket.assigned_department?.name || 'Department Staff',
                      staffName: authorName,
                      content: newComment.content,
                      timestamp: newComment.created_at || new Date().toISOString(),
                    };

                    setMessages((prev) => {
                      if (prev.some((m) => m.id === staffMsg.id)) return prev;
                      return [...prev, staffMsg];
                    });
                  }
                } catch (e) {
                  console.debug('Error processing realtime staff comment:', e);
                }
              }
            }
          )
          .subscribe();
      } catch (e) {
        console.debug('Realtime ai chat subscription notice:', e);
      }
    }

    return () => {
      if (channel && supabase && typeof supabase.removeChannel === 'function') {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.id]);

  // Submit AI Chat Query
  const handleSendMessage = async (queryToSend = null) => {
    const text = (typeof queryToSend === 'string' ? queryToSend : inputQuery).trim();
    if (!text || loading) return;

    const userMessageId = `user-${Date.now()}`;
    const userMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputQuery('');
    setLoading(true);

    try {
      // Build conversation history for context (last 6 messages)
      const conversationHistory = newMessages.slice(-6).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

      const res = await api.post('/ai/chat', {
        query: text,
        conversationHistory,
        conversationId: activeConversationId,
      });

      const data = res?.data?.data || res?.data || res || {};
      const returnedConvId = data.conversationId || activeConversationId;
      if (!activeConversationId && returnedConvId) {
        setActiveConversationId(returnedConvId);
      }

      // Dynamically update conversation title in sidebar if default
      setConversations((prev) => {
        const smartTitle = text.length > 36 ? text.substring(0, 33) + '...' : text;
        const exists = prev.some((c) => c.id === returnedConvId);
        if (!exists && returnedConvId) {
          return [{ id: returnedConvId, title: smartTitle, last_message_at: new Date().toISOString() }, ...prev];
        }
        return prev.map((c) => {
          if (c.id === returnedConvId) {
            const shouldRename = !c.title || c.title === 'New Conversation' || c.title === 'Welcome & Academic Support';
            return {
              ...c,
              title: shouldRename ? smartTitle : c.title,
              last_message_at: new Date().toISOString(),
            };
          }
          return c;
        });
      });

      const assistantMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'I could not find sufficient information in the official documents.',
        workflowMode: data.workflowMode,
        workflowLabel: data.workflowLabel,
        workflowDescription: data.workflowDescription,
        requiresStaffApproval: data.requiresStaffApproval,
        requiresStaffInformation: data.requiresStaffInformation,
        citations: Array.isArray(data.citations) ? data.citations : [],
        hasSufficientEvidence: data.hasSufficientEvidence ?? true,
        confidenceScore: data.confidenceScore ?? 0.85,
        suggestedActions: data.suggestedActions || [],
        ticketDraft: data.ticketDraft || null,
        timestamp: new Date().toISOString(),
        originalQuery: text,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errMsg =
        err?.response?.data?.message ||
        'Unable to contact the AI Assistant. Please verify your connection or raise a support ticket.';
      toast.error(errMsg);

      const errorMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${errMsg} Would you like to create a support ticket instead?`,
        citations: [],
        hasSufficientEvidence: false,
        confidenceScore: 0,
        isError: true,
        originalQuery: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Trigger Ticket Suggestion Handoff
  const handleDraftTicket = async (sourceMessage) => {
    setSuggestingTicket(true);
    const toastId = toast.loading('Analyzing query and preparing support ticket draft...');

    try {
      const query = sourceMessage?.originalQuery || sourceMessage?.content || inputQuery;
      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api.post('/ai/suggest-ticket', {
        query,
        conversationHistory,
      });

      const suggestion = res?.data?.data;
      toast.success('Ticket draft prepared! Reviewing draft...', { id: toastId });

      navigate('/tickets/new', {
        state: {
          prefilled: {
            title: suggestion?.suggestedTitle || query.slice(0, 80),
            description: suggestion?.suggestedDescription || query,
            categoryId: suggestion?.suggestedCategoryId || '',
            priority: suggestion?.suggestedPriority || 'Medium',
            suggestedDepartment: suggestion?.suggestedDepartment || '',
            missingInformation: suggestion?.missingInformation || [],
          },
          aiAssisted: true,
        },
      });
    } catch (err) {
      toast.dismiss(toastId);
      // Fallback: Navigate to new ticket directly with user query
      navigate('/tickets/new', {
        state: {
          prefilled: {
            title: sourceMessage?.originalQuery?.slice(0, 80) || 'Support Request',
            description: sourceMessage?.content || '',
            priority: 'Medium',
          },
          aiAssisted: true,
        },
      });
    } finally {
      setSuggestingTicket(false);
    }
  };

  // Direct Query Submission & Live Staff Discussion Continuation
  const handleSendReplyToStaff = async (ticketId, ticketNumber) => {
    const text = (replyInputs[ticketId] || '').trim();
    if (!text) {
      toast.error('Please enter your response message.');
      return;
    }

    setSendingReply((prev) => ({ ...prev, [ticketId]: true }));
    try {
      await api.post(`/tickets/${ticketId}/comments`, {
        content: text,
        is_internal: false,
      });

      toast.success('Your reply was delivered to staff in real time!');

      const studentEcho = {
        id: `reply-${Date.now()}`,
        role: 'user',
        content: `[Replied to Staff on Query #${ticketNumber}]:\n${text}`,
        timestamp: new Date().toISOString(),
      };

      const aiAck = {
        id: `ack-${Date.now()}`,
        role: 'assistant',
        content: `I've sent your reply directly to the **Query #${ticketNumber}** staff discussion table. The department staff has been notified in real time.\n\nYou can continue talking with me or ask any follow-up questions!`,
        workflowMode: 'GENERAL_KNOWLEDGE',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, studentEcho, aiAck]);
      setReplyInputs((prev) => ({ ...prev, [ticketId]: '' }));
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to send reply to staff');
    } finally {
      setSendingReply((prev) => ({ ...prev, [ticketId]: false }));
    }
  };

  const handleDirectSubmitQuery = async (message) => {
    if (!message?.ticketDraft) return;
    const draft = message.ticketDraft;
    setDirectSubmittingTicket((prev) => ({ ...prev, [message.id]: true }));
    const toastId = toast.loading(`Submitting query directly to ${draft.departmentName || 'department staff'}...`);

    try {
      const isUuid = (val) => typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
      const rawTitle = draft.title || `Information Request: ${message.originalQuery?.slice(0, 60) || 'Student Query'}`;
      const rawDesc = draft.description || message.originalQuery || message.content || 'Student Information Request';
      const cleanTitle = (rawTitle.length < 3 ? `Information Request: ${rawTitle}` : rawTitle).slice(0, 150);
      const cleanDesc = (rawDesc.length < 5 ? `${rawDesc} (Inquiry submitted for staff verification)` : rawDesc).slice(0, 5000);
      const allowedPriorities = ['Low', 'Medium', 'High', 'Urgent'];
      const resolvedPriority = allowedPriorities.find((p) => p.toLowerCase() === String(draft.priority).toLowerCase()) || 'Medium';

      const payload = {
        title: cleanTitle,
        description: cleanDesc,
        categoryId: isUuid(draft.categoryId) ? draft.categoryId : 'c1000000-0000-0000-0000-000000000001',
        assignedDepartmentId: isUuid(draft.departmentId) ? draft.departmentId : '99999999-9999-9999-9999-999999999999',
        priority: resolvedPriority,
        tags: ['WORKFLOW:INFORMATION_REQUEST'],
        requestType: 'INFORMATION_REQUEST',
      };

      const res = await api.post('/tickets', payload);
      const createdTicket = res?.data?.data || res?.data;
      const refNum = createdTicket?.ticket_number || 'New Query';

      toast.success(`Query ${refNum} sent to ${draft.departmentName || 'department staff'}!`, { id: toastId });

      const confirmMsg = {
        id: `query-submitted-${Date.now()}`,
        role: 'assistant',
        content: `Your **Staff Information Request (${refNum})** has been forwarded to the **${draft.departmentName || 'Responsible Department'}**!\n\n• **Real-time Synchronization**: When department staff answers in the discussion table, their response will appear right here in this chat.\n• **Student Queries Section**: You can also review all conversational threads in your dedicated **[Student Queries](/queries)** section.`,
        workflowMode: 'STAFF_INFORMATION_REQUEST',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => {
        return prev
          .map((m) =>
            m.id === message.id
              ? { ...m, draftSubmitted: true, submittedTicketNumber: refNum, submittedTicketId: createdTicket?.id }
              : m
          )
          .concat(confirmMsg);
      });
    } catch (err) {
      const errMsg =
        err?.response?.data?.details?.[0]?.message ||
        err?.response?.data?.error?.details?.[0]?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to submit inquiry';
      toast.error(errMsg, { id: toastId });
    } finally {
      setDirectSubmittingTicket((prev) => ({ ...prev, [message.id]: false }));
    }
  };

  // Feedback Submission
  const handleFeedback = async (message, isHelpful) => {
    setActiveFeedbackModal({
      messageId: message.id,
      isHelpful,
      message,
    });
  };

  const submitFeedback = async (message, isHelpful, note = '') => {
    try {
      await api.post('/ai/feedback', {
        query: message.originalQuery || 'General Assistant Query',
        answer: message.content,
        isHelpful,
        feedbackText: note || undefined,
        citations: message.citations || [],
        hasSufficientEvidence: message.hasSufficientEvidence,
        confidenceScore: message.confidenceScore,
      });

      setFeedbackSubmitted((prev) => ({
        ...prev,
        [message.id]: isHelpful ? 'up' : 'down',
      }));
      toast.success(isHelpful ? 'Marked as helpful. Thank you!' : 'Feedback recorded. We are improving!');
    } catch (err) {
      toast.error('Failed to record feedback.');
    } finally {
      setActiveFeedbackModal(null);
      setFeedbackNote('');
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied response to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = async () => {
    try {
      await api.delete('/ai/history');
      toast.success('Chat history cleared');
    } catch (e) {
      console.warn('Could not clear backend history:', e?.message);
    }
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: 'Conversation cleared. How can I assist you with academic concepts, college procedures, or ticket status?',
        citations: [],
        hasSufficientEvidence: true,
        confidenceScore: 1.0,
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-coral-500/10 via-sky-500/10 to-transparent rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-navy-900 to-coral-500 flex items-center justify-center text-white shadow-lg">
              <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                  SmartDesk AI Assistant
                </h1>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  RAG Grounded
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
                Verified college policies with pgvector similarity search, verified citations, and deterministic ticket assistance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={clearChat}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors border border-gray-200 dark:border-navy-700"
              title="Clear conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Chat</span>
            </button>
            <button
              onClick={() => handleDraftTicket(null)}
              disabled={suggestingTicket}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-coral-500 hover:bg-coral-600 text-white shadow-md shadow-coral-500/20 transition-all hover:scale-[1.02]"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Open Support Ticket</span>
            </button>
          </div>
        </div>

        {/* Model & Security Pill */}
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-navy-800/80 flex flex-wrap items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 gap-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-coral-500" />
              Prompt Injection Defense Active
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-sky-500" />
              Ingested College Docs: {serviceStatus?.embeddingModel || '768-dim Vector Space'}
            </span>
          </div>
          <span className="font-mono text-[10px] bg-gray-100 dark:bg-navy-950 px-2 py-0.5 rounded text-gray-600 dark:text-gray-400">
            Provider: {serviceStatus?.activeProvider || 'Mock / Fallback Provider'}
          </span>
        </div>
      </div>

      {/* Real-time Alert Banner for Pending Staff Responses */}
      {recentStaffAlerts.length > 0 && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-indigo-500/10 border border-emerald-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  Staff Response Received!
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                  {recentStaffAlerts[0]?.ticket?.ticket_number}
                </span>
              </div>
              <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-1">
                "{recentStaffAlerts[0]?.content}"
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const alertItem = recentStaffAlerts[0];
                const staffMsg = {
                  id: `staff-comment-${alertItem.id}`,
                  role: 'staff_response',
                  ticketId: alertItem.ticket?.id,
                  ticketNumber: alertItem.ticket?.ticket_number,
                  ticketTitle: alertItem.ticket?.title,
                  departmentName: alertItem.ticket?.assigned_department?.name || 'Department Staff',
                  staffName: alertItem.author?.full_name || 'Department Staff',
                  content: alertItem.content,
                  timestamp: alertItem.created_at,
                };
                setMessages((prev) => {
                  if (prev.some((m) => m.id === staffMsg.id)) return prev;
                  return [...prev, staffMsg];
                });
                setRecentStaffAlerts((prev) => prev.slice(1));
              }}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm"
            >
              Continue in Chat
            </button>
            <Link
              to="/queries"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:underline"
            >
              Open Queries Section
            </Link>
          </div>
        </div>
      )}

      {/* Main Conversation Container with Multi-turn History Sidebar */}
      <div className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 shadow-xl flex flex-col md:flex-row h-[700px] overflow-hidden">
        {/* Sidebar: Conversation Sessions */}
        <div
          className={`${
            showSidebar ? 'flex' : 'hidden md:flex'
          } flex-col w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-100 dark:border-navy-800 bg-gray-50/60 dark:bg-navy-950/60 shrink-0 h-52 md:h-auto overflow-hidden transition-all`}
        >
          {/* New Chat Button */}
          <div className="p-3 border-b border-gray-100 dark:border-navy-800/80 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex-1 flex items-center justify-center gap-2 px-3.5 py-2 rounded-2xl bg-gradient-to-r from-coral-500 to-indigo-600 hover:from-coral-600 hover:to-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-500/20 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>New Chat</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSidebar(false)}
              className="md:hidden p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          {/* Conversations Thread List */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Recent Conversations ({conversations.length})
            </div>
            {loadingConversations ? (
              <div className="p-4 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-coral-500" />
                <span>Loading chats...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400">
                No saved chats yet
              </div>
            ) : (
              conversations.map((c) => {
                const isActive = c.id === activeConversationId;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectConversation(c.id)}
                    className={`group flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-navy-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-1">
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                      <div className="truncate">
                        <span className="block truncate text-xs">{c.title || 'Conversation'}</span>
                        <span className="block text-[10px] font-normal text-gray-400">
                          {c.last_message_at ? formatRelativeIST(c.last_message_at) : 'Just now'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteConversation(c.id, e)}
                      title="Archive chat"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-gray-400 hover:text-coral-500 hover:bg-coral-500/10 transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right side: Active Messages & Input Stream */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header Bar with Sidebar Toggle on Mobile */}
          <div className="px-4 py-2 border-b border-gray-100 dark:border-navy-800 flex items-center justify-between bg-gray-50/40 dark:bg-navy-950/40">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSidebar(!showSidebar)}
                className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-300 text-xs font-semibold"
              >
                <PanelLeft className="w-3.5 h-3.5" />
                <span>History ({conversations.length})</span>
              </button>
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 truncate max-w-xs sm:max-w-md">
                {conversations.find((c) => c.id === activeConversationId)?.title || 'AI Helpdesk Assistant'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex md:hidden items-center gap-1 text-xs font-bold text-coral-600 hover:underline"
            >
              <PlusCircle className="w-3.5 h-3.5" /> New
            </button>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.map((message) => {
            if (message.role === 'staff_response') {
              return (
                <div
                  key={message.id}
                  className="w-full my-4 p-5 rounded-3xl bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-sky-500/10 border-2 border-emerald-500/30 shadow-lg space-y-4 animate-fadeIn"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md">
                        <Building className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                            {message.staffName || 'Department Staff'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-800 dark:text-emerald-300">
                            {message.departmentName || 'Department'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-800 dark:text-sky-300">
                            Live Staff Response
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          Query #{message.ticketNumber} — "{message.ticketTitle}"
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {formatRelativeIST(message.timestamp)}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-white dark:bg-navy-900 border border-emerald-500/20 text-sm text-gray-900 dark:text-gray-100 shadow-sm leading-relaxed whitespace-pre-wrap select-text">
                    {message.content}
                  </div>

                  {/* Inline Reply to Staff */}
                  <div className="pt-2 border-t border-emerald-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Continue Conversation with {message.staffName || 'Staff Member'}:</span>
                      </label>
                      <Link
                        to="/queries"
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                      >
                        <span>View in Student Queries</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={replyInputs[message.ticketId] || ''}
                        onChange={(e) =>
                          setReplyInputs((prev) => ({ ...prev, [message.ticketId]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendReplyToStaff(message.ticketId, message.ticketNumber);
                          }
                        }}
                        placeholder={`Type your reply to ${message.staffName || 'staff'}...`}
                        className="flex-1 px-4 py-2.5 rounded-2xl bg-white dark:bg-navy-900 border border-gray-300 dark:border-navy-700 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={sendingReply[message.ticketId] || !replyInputs[message.ticketId]?.trim()}
                        onClick={() => handleSendReplyToStaff(message.ticketId, message.ticketNumber)}
                        className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all hover:scale-105 disabled:opacity-50 disabled:scale-100"
                      >
                        {sendingReply[message.ticketId] ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        <span>Reply to Staff</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            const isUser = message.role === 'user';
            const isCitationsOpen = expandedCitations[message.id];

            return (
              <div
                key={message.id}
                className={`flex gap-3 sm:gap-4 ${isUser ? 'justify-end' : 'justify-start'} animate-fadeIn`}
              >
                {!isUser && (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-navy-900 to-coral-500 flex items-center justify-center text-white shrink-0 shadow-md">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[78%] rounded-3xl p-4 sm:p-5 shadow-sm space-y-3 ${
                    isUser
                      ? 'bg-gradient-to-r from-coral-500 to-coral-600 text-white rounded-br-xs'
                      : 'bg-gray-50 dark:bg-navy-950/80 border border-gray-200 dark:border-navy-800/80 text-gray-900 dark:text-gray-100 rounded-bl-xs'
                  }`}
                >
                  {/* Message Content */}
                  <div className="text-sm leading-relaxed whitespace-pre-wrap select-text">
                    {message.content}
                  </div>

                  {/* Grounded Evidence / Workflow Classification Badge */}
                  {!isUser && message.id !== 'welcome-1' && message.id !== 'welcome-reset' && (
                    <div className="pt-2 border-t border-gray-200/60 dark:border-navy-800/60 flex flex-wrap items-center justify-between gap-2">
                      {message.workflowMode === 'GENERAL_KNOWLEDGE' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2.5 py-0.5 rounded-full border border-sky-500/20">
                          <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                          General Knowledge & Learning (AI Direct • Zero Staff Needed)
                        </span>
                      ) : message.workflowMode === 'COLLEGE_KNOWLEDGE_VERIFIED' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          Verified College Regulations (Handbook Grounded • No Approval Needed)
                        </span>
                      ) : message.workflowMode === 'PERSONAL_TICKET_INFO' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                          <FileText className="w-3.5 h-3.5 text-purple-500" />
                          Personal Student Records (Live Supabase DB • Verified)
                        </span>
                      ) : message.workflowMode === 'STAFF_APPROVAL_REQUEST' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/20">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          Official Institutional Decision (Authorized Staff Must Explicitly Approve/Reject)
                        </span>
                      ) : message.workflowMode === 'STAFF_INFORMATION_REQUEST' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                          <Info className="w-3.5 h-3.5 text-amber-500" />
                          Staff Information Request (Department Clarification • Approval Not Required)
                        </span>
                      ) : message.hasSufficientEvidence ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified Grounded Answer ({Math.round(message.confidenceScore * 100)}% match)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Staff Clarification Recommended
                        </span>
                      )}

                      {/* Message Actions */}
                      <div className="flex items-center gap-2">
                        {/* Copy button */}
                        <button
                          onClick={() => copyToClipboard(message.content, message.id)}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-navy-800 transition-colors"
                          title="Copy response"
                        >
                          {copiedId === message.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Thumbs Feedback */}
                        <button
                          onClick={() => handleFeedback(message, true)}
                          className={`p-1 rounded-lg transition-colors ${
                            feedbackSubmitted[message.id] === 'up'
                              ? 'text-emerald-500 bg-emerald-500/10'
                              : 'text-gray-400 hover:text-emerald-500 hover:bg-gray-200/50 dark:hover:bg-navy-800'
                          }`}
                          title="Helpful answer"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleFeedback(message, false)}
                          className={`p-1 rounded-lg transition-colors ${
                            feedbackSubmitted[message.id] === 'down'
                              ? 'text-rose-500 bg-rose-500/10'
                              : 'text-gray-400 hover:text-rose-500 hover:bg-gray-200/50 dark:hover:bg-navy-800'
                          }`}
                          title="Not helpful"
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Citations Accordion */}
                  {!isUser && Array.isArray(message.citations) && message.citations.length > 0 && (
                    <div className="pt-2">
                      <button
                        onClick={() =>
                          setExpandedCitations((prev) => ({
                            ...prev,
                            [message.id]: !prev[message.id],
                          }))
                        }
                        className="flex items-center justify-between w-full text-[11px] font-bold text-coral-600 dark:text-coral-400 hover:underline"
                      >
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          {message.citations.length} Grounded Source Citation
                          {message.citations.length > 1 ? 's' : ''}
                        </span>
                        {isCitationsOpen ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {isCitationsOpen && (
                        <div className="mt-2 space-y-2 animate-fadeIn">
                          {message.citations.map((cite, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 text-xs space-y-1.5 shadow-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {cite.sourceId && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-coral-100 dark:bg-coral-950/60 text-coral-600 dark:text-coral-400 border border-coral-200 dark:border-coral-800">
                                      [{cite.sourceId}]
                                    </span>
                                  )}
                                  <span className="font-bold text-gray-900 dark:text-white">
                                    {cite.documentTitle || cite.title || 'Official Document'}
                                  </span>
                                </div>
                                {cite.similarity && (
                                  <span className="text-[10px] text-gray-400 font-mono shrink-0">
                                    {(cite.similarity * 100).toFixed(1)}% match
                                  </span>
                                )}
                              </div>
                              {cite.section && (
                                <p className="text-[11px] font-semibold text-coral-600 dark:text-coral-400">
                                  Section: {cite.section}
                                </p>
                              )}
                              {cite.snippet && (
                                <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                                  "{cite.snippet}"
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ticket Draft Confirmation Card (Mode 4: Approval Request or Mode 2/3: Information Request) */}
                  {!isUser && message.ticketDraft && (
                    <div
                      className={`mt-3 p-3.5 rounded-2xl border text-xs space-y-2.5 ${
                        message.workflowMode === 'STAFF_APPROVAL_REQUEST'
                          ? 'bg-rose-500/10 border-rose-500/30'
                          : 'bg-amber-500/10 border-amber-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-bold flex items-center gap-1.5 text-xs ${
                            message.workflowMode === 'STAFF_APPROVAL_REQUEST'
                              ? 'text-rose-800 dark:text-rose-300'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {message.workflowMode === 'STAFF_APPROVAL_REQUEST' ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                              Official Decision Request (Requires Staff Approval)
                            </>
                          ) : (
                            <>
                              <Info className="w-3.5 h-3.5 text-amber-500" />
                              Staff Information Request (Clarification Only)
                            </>
                          )}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                            message.workflowMode === 'STAFF_APPROVAL_REQUEST'
                              ? 'bg-rose-500/20 text-rose-800 dark:text-rose-200'
                              : 'bg-amber-500/20 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {message.workflowMode === 'STAFF_APPROVAL_REQUEST' ? 'Approval Required' : 'Information Request'}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-600 dark:text-gray-300">
                        {message.workflowMode === 'STAFF_APPROVAL_REQUEST'
                          ? 'This institutional decision requires review and explicit approval or rejection by authorized department staff or Super Admin.'
                          : 'Department staff will provide factual confirmation and progress updates. Formal institutional approval is not required.'}
                      </p>

                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-white/70 dark:bg-navy-900/70 p-2.5 rounded-xl border border-gray-200/50 dark:border-navy-800/50">
                        <div>
                          <span className="text-gray-400 block text-[10px]">Category:</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {message.ticketDraft.categoryName || message.ticketDraft.category || 'General Assistance'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">Assigned Department:</span>
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {message.ticketDraft.departmentName || message.ticketDraft.department || 'Help Desk'}
                          </span>
                        </div>
                        <div className="col-span-2 flex items-center justify-between">
                          <div>
                            <span className="text-gray-400 block text-[10px]">Priority:</span>
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-coral-500/15 text-coral-600 dark:text-coral-400 mt-0.5">
                              {message.ticketDraft.priority || 'Medium'}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 italic">Pre-routed draft</span>
                        </div>
                      </div>

                      {message.draftSubmitted ? (
                        <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between gap-2 animate-fadeIn">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span>
                              Query #{message.submittedTicketNumber || 'Inquiry'} forwarded to staff. Real-time alert active!
                            </span>
                          </div>
                          <Link
                            to="/queries"
                            className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline shrink-0"
                          >
                            View in Queries →
                          </Link>
                        </div>
                      ) : message.workflowMode === 'STAFF_INFORMATION_REQUEST' ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => handleDirectSubmitQuery(message)}
                            disabled={directSubmittingTicket[message.id]}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs shadow-md transition-all hover:scale-[1.01] text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
                          >
                            {directSubmittingTicket[message.id] ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>Send Query to Staff (Instant • Live in AI Chat)</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              navigate('/tickets/new', {
                                state: {
                                  prefilled: {
                                    title: message.ticketDraft.title || 'Information Request',
                                    description: message.ticketDraft.description || '',
                                    categoryId: message.ticketDraft.categoryId || '',
                                    priority: message.ticketDraft.priority || 'Medium',
                                    suggestedDepartment: message.ticketDraft.departmentName || '',
                                    tags: ['WORKFLOW:INFORMATION_REQUEST'],
                                  },
                                  aiAssisted: true,
                                },
                              });
                            }}
                            className="w-full text-center text-[11px] text-amber-700 dark:text-amber-300 hover:underline font-semibold"
                          >
                            Or review & customize inquiry details first →
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const tags = message.ticketDraft.tags || [
                              'WORKFLOW:APPROVAL_REQUEST',
                              'APPROVAL_STATUS:PENDING',
                            ];
                            navigate('/tickets/new', {
                              state: {
                                prefilled: {
                                  title: message.ticketDraft.title || 'Official Approval Request',
                                  description: message.ticketDraft.description || '',
                                  categoryId: message.ticketDraft.categoryId || '',
                                  priority: message.ticketDraft.priority || 'High',
                                  suggestedDepartment: message.ticketDraft.departmentName || '',
                                  tags,
                                },
                                aiAssisted: true,
                              },
                            });
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-bold text-xs shadow-md transition-all hover:scale-[1.01] text-white bg-rose-600 hover:bg-rose-700"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Submit Official Request for Staff Approval</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Handoff suggestion when evidence is insufficient or offered (and no explicit ticketDraft displayed) */}
                  {!isUser && !message.hasSufficientEvidence && !message.ticketDraft && (
                    <div className="pt-2">
                      <button
                        onClick={() => handleDraftTicket(message)}
                        disabled={suggestingTicket}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-bold text-xs shadow-md transition-all hover:scale-[1.01]"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>Open Verified Ticket from this Query</span>
                      </button>
                    </div>
                  )}
                </div>

                {isUser && (
                  <div className="w-9 h-9 rounded-xl bg-coral-500 flex items-center justify-center text-white shrink-0 shadow-md">
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>
            );
          })}

          {/* Typing Indicator */}
          {loading && (
            <div className="flex gap-3 items-center text-gray-500 dark:text-gray-400 text-xs animate-fadeIn">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-navy-900 to-coral-500 flex items-center justify-center text-white shrink-0 shadow-md">
                <Bot className="w-5 h-5 text-white animate-spin" />
              </div>
              <div className="bg-gray-50 dark:bg-navy-950/80 border border-gray-200 dark:border-navy-800/80 rounded-2xl px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-coral-500" />
                <span>Searching knowledge base and formulating grounded answer...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompt Chips */}
        {messages.length <= 2 && (
          <div className="px-4 py-2 border-t border-gray-100 dark:border-navy-800/80 bg-gray-50/50 dark:bg-navy-950/40">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-coral-500" />
              Suggested Student Questions
            </div>
            <div className="flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  disabled={loading}
                  className="text-left text-xs px-3 py-1.5 rounded-xl bg-white dark:bg-navy-900 hover:bg-coral-500/10 hover:text-coral-600 dark:hover:text-coral-400 border border-gray-200 dark:border-navy-800 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <div className="p-4 bg-gray-50/80 dark:bg-navy-950/80 border-t border-gray-200 dark:border-navy-800">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask an official college question (e.g., fees, bus pass, academic rules)..."
              disabled={loading}
              maxLength={1000}
              className="flex-1 bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-coral-500 dark:text-white placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={loading || !inputQuery.trim()}
              className="w-11 h-11 rounded-2xl bg-coral-500 hover:bg-coral-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-white shadow-md shadow-coral-500/20 transition-all hover:scale-105 shrink-0"
              title="Send question"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </form>
          <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400 px-1">
            <span>Official college documents are authoritative. Max 1,000 characters.</span>
            <span>{inputQuery.length} / 1000</span>
          </div>
        </div>
      </div>
    </div>

      {/* Optional Feedback Modal */}
      {activeFeedbackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
              {activeFeedbackModal.isHelpful ? (
                <>
                  <ThumbsUp className="w-5 h-5 text-emerald-500" />
                  What did you find helpful?
                </>
              ) : (
                <>
                  <ThumbsDown className="w-5 h-5 text-rose-500" />
                  How can we improve this answer?
                </>
              )}
            </h3>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Your feedback directly improves document indexing and response grounding.
            </p>

            <textarea
              rows={3}
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              placeholder={
                activeFeedbackModal.isHelpful
                  ? 'Optional: What part was most accurate?'
                  : 'Optional: Did it miss any specific policy detail or section?'
              }
              className="w-full bg-gray-50 dark:bg-navy-950 border border-gray-200 dark:border-navy-800 rounded-2xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-coral-500 dark:text-white"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  submitFeedback(
                    activeFeedbackModal.message,
                    activeFeedbackModal.isHelpful,
                    feedbackNote
                  );
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-coral-500 hover:bg-coral-600 text-white shadow-md transition-colors"
              >
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
