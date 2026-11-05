import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import CommentThread from '../components/CommentThread';
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Building,
  User,
  Shield,
  Star,
  RotateCcw,
  Check,
  Send,
  Loader2,
  History,
  BookOpen,
  Sparkles,
  Paperclip,
  Download,
  UserPlus,
  PlayCircle,
  MessageSquarePlus,
  Users,
  FileText,
  ExternalLink,
  Award,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatToIST } from '../utils/date';

const DEFAULT_CAMPUS_STAFF = [
  { id: '8c059f64-e7f6-4b8d-a5c2-6d1666f40aa1', full_name: 'Vikram Malhotra', email: 'finance.staff@smartdesk.edu', role: 'STAFF', department: { name: 'Finance & Accounts Office' } },
  { id: 'ce476173-a30b-45db-ae57-0181acf21d9d', full_name: 'Suresh Reddy', email: 'it.staff@smartdesk.edu', role: 'STAFF', department: { name: 'Central IT Infrastructure' } },
  { id: '76c1a58b-079f-4906-85ce-cf71f0f22004', full_name: 'Dr. Ananya Iyer', email: 'exam.staff@smartdesk.edu', role: 'STAFF', department: { name: 'Examination & Evaluation Cell' } },
  { id: '92794424-f082-45a1-a8b5-44070579920a', full_name: 'Prof. Sneha Verma', email: 'affairs.staff@smartdesk.edu', role: 'STAFF', department: { name: 'Student Affairs & Grievances' } },
  { id: 'e3677a00-9aa7-4a3e-8f5e-3cdee2ebaef9', full_name: 'teju', email: 'dadigehasiniraj@gmail.com', role: 'STAFF', department: { name: 'Academic Registrar Office' } },
  { id: '7502fc89-9c77-4d07-b29a-77779cc410eb', full_name: 'hasini (Super Admin)', email: 'hasinirajdadige@gmail.com', role: 'SUPER_ADMIN', department: { name: 'Campus Administration' } },
  { id: '22222222-2222-2222-2222-222222222222', full_name: 'Prof. Priya Sharma', email: 'staff@smartdesk.edu', role: 'STAFF', department: { name: 'Computer Science & Engineering' } },
];

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile, role } = useAuth();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Modals / Input states
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // Staff Assignment states
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [departmentStaff, setDepartmentStaff] = useState([]);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState('');
  const [assignmentNote, setAssignmentNote] = useState('');
  const [loadingStaff, setLoadingStaff] = useState(false);

  // Request Information states
  const [requestInfoModalOpen, setRequestInfoModalOpen] = useState(false);
  const [requestInfoPrompt, setRequestInfoPrompt] = useState('');

  // Certificate / Document Ready for Collection states
  const [readyModalOpen, setReadyModalOpen] = useState(false);
  const [collectionInstructions, setCollectionInstructions] = useState('');
  const [collectionLocation, setCollectionLocation] = useState('Room 104, Administrative Block (Counter 3)');

  // AI Assistance states
  const [aiAssistOpen, setAiAssistOpen] = useState(false);
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
  const [aiAssistData, setAiAssistData] = useState(null);

  // Attachments state
  const [attachments, setAttachments] = useState([]);

  // Phase 8: Promote to FAQ Draft states
  const [faqModalOpen, setFaqModalOpen] = useState(false);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqKeywords, setFaqKeywords] = useState('');
  const [submittingFaqDraft, setSubmittingFaqDraft] = useState(false);

  // Rating state
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);

  const fetchAttachments = async () => {
    try {
      const res = await api.get(`/tickets/${id}/attachments`);
      const payload = res.data?.attachments || res.data || [];
      if (Array.isArray(payload)) setAttachments(payload);
    } catch {
      // Non-fatal attachment fetch
    }
  };

  const fetchTicket = (showFullLoader = false) => {
    if (showFullLoader) setLoading(true);
    api
      .get(`/tickets/${id}`)
      .then((res) => {
        const payload = (res.data?.data && res.data.data.id) ? res.data.data : (res.data?.id ? res.data : (res.data?.data || res.data));
        setTicket(payload);
        if (Array.isArray(payload?.attachments)) {
          setAttachments(payload.attachments);
        } else {
          fetchAttachments();
        }
        setLoading(false);
      })
      .catch((err) => {
        setErrorMsg(err.response?.data?.message || err.message || 'Failed to load ticket details');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTicket(true);

    // 1. Supabase Realtime synchronization for live status and assignment changes
    let channel = null;
    if (supabase && typeof supabase.channel === 'function' && id) {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const filterStr = isUuid ? `id=eq.${id}` : `ticket_number=eq.${id}`;
        channel = supabase
          .channel(`public:ticket_detail_sync:${id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'tickets',
              filter: filterStr,
            },
            () => {
              fetchTicket(false);
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              fetchTicket(false);
            }
          });
      } catch (e) {
        console.debug('Realtime ticket detail notice:', e?.message);
      }
    }

    // 2. Focus and Online event synchronization
    const handleFocus = () => fetchTicket(false);
    const handleOnline = () => {
      toast.success('Connection restored. Refreshing ticket details...', { id: 'detail-online-toast', duration: 2500 });
      fetchTicket(false);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    // 3. Reliable periodic polling fallback (every 15s)
    let intervalId = null;
    if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
      intervalId = setInterval(() => {
        if (ticket?.status !== 'CLOSED' && ticket?.status !== 'REJECTED') {
          fetchTicket(false);
        }
      }, 15000);
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
  }, [id]);

  if (loading) {
    return (
      <div className="p-16 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-coral-500 animate-spin mx-auto" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Loading ticket #{id}...</p>
      </div>
    );
  }

  if (errorMsg || !ticket) {
    const isStaffOrAdmin = role === 'STAFF' || role === 'SUPER_ADMIN';
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-white dark:bg-navy-900 border border-coral-500/30 shadow-xl text-center space-y-4">
        <XCircle className="w-12 h-12 text-coral-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Unable to View Query / Ticket</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{errorMsg || 'Ticket does not exist or access is denied.'}</p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => {
              setErrorMsg('');
              fetchTicket(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-navy-800 dark:hover:bg-navy-700 text-gray-800 dark:text-gray-200 font-semibold text-xs transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
          <Link
            to={isStaffOrAdmin ? '/staff' : '/tickets'}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-medium text-xs transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{isStaffOrAdmin ? 'Back to Staff Dashboard' : 'Back to Tickets'}</span>
          </Link>
        </div>
      </div>
    );
  }

  const isCreator = ticket.created_by === profile?.id;
  const isQuery =
    ticket?.request_type === 'INFORMATION_REQUEST' ||
    (Array.isArray(ticket?.tags) && ticket.tags.some((t) => t.includes('INFORMATION_REQUEST') || t.includes('CERTIFICATE'))) ||
    (typeof ticket?.title === 'string' && ticket.title.toLowerCase().startsWith('information request:'));

  const isStaff = role === 'STAFF';
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const canTriage = isStaff || isSuperAdmin;

  // Reopen Eligibility Check (One reopen within 7 days of resolved/closed)
  const isResolvedOrClosed = ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';
  const resolvedOrClosedAt = new Date(ticket.resolved_at || ticket.closed_at || ticket.updated_at).getTime();
  const isWithin7Days = Date.now() - resolvedOrClosedAt <= 7 * 24 * 3600 * 1000;
  const canReopen = isCreator && isResolvedOrClosed && ticket.reopened_count === 0 && isWithin7Days;

  // Handlers
  const handleClaim = async () => {
    setActionLoading(true);
    try {
      await api.post(`/tickets/${ticket.id}/claim`);
      toast.success('Ticket claimed successfully!');
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to claim ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const loadDepartmentStaff = async () => {
    setLoadingStaff(true);
    try {
      const params = {};
      if (ticket?.assigned_department_id) {
        params.departmentId = ticket.assigned_department_id;
      }
      const res = await api.get('/staff/members', { params });
      const list = res?.data?.data || res?.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(list) && list.length > 0) {
        setDepartmentStaff(list);
      } else {
        const fallbackRes = await api.get('/staff/members', { params: { all: true } });
        const fallbackList = fallbackRes?.data?.data || fallbackRes?.data || (Array.isArray(fallbackRes) ? fallbackRes : []);
        if (Array.isArray(fallbackList) && fallbackList.length > 0) {
          setDepartmentStaff(fallbackList);
        } else {
          setDepartmentStaff(DEFAULT_CAMPUS_STAFF);
        }
      }
    } catch (e) {
      console.warn('Could not load staff members', e);
      setDepartmentStaff(DEFAULT_CAMPUS_STAFF);
    } finally {
      setLoadingStaff(false);
    }
  };

  // Certificate Workflow stage detector
  const getCertificateStage = (tkt) => {
    if (!tkt) return 0;
    const st = tkt.status;
    const tgs = Array.isArray(tkt.tags) ? tkt.tags : [];
    if (st === 'CLOSED') return 5;
    if (st === 'RESOLVED') return 5;
    if (st === 'READY_FOR_COLLECTION' || st === 'ISSUED' || tgs.includes('STAGE:READY_FOR_COLLECTION')) return 4;
    if (st === 'IN_PROGRESS' || tgs.includes('STAGE:IN_PROGRESS')) return 3;
    if (st === 'DOCUMENT_VERIFICATION' || tgs.includes('STAGE:DOCUMENT_VERIFICATION')) return 2;
    if (st === 'UNDER_REVIEW' || tgs.includes('STAGE:UNDER_REVIEW')) return 1;
    return 0; // SUBMITTED / OPEN
  };

  const handleAcceptQuery = async () => {
    setActionLoading(true);
    try {
      await api.patch(`/tickets/${ticket.id}/status`, {
        status: 'UNDER_REVIEW',
        note: 'Staff accepted student query and commenced administrative review.',
      });
      toast.success('Query accepted and moved to Under Review.');
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to accept query');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyDocs = async () => {
    setActionLoading(true);
    try {
      await api.patch(`/tickets/${ticket.id}/status`, {
        status: 'DOCUMENT_VERIFICATION',
        note: 'Staff verified supporting documents and cross-referenced institutional student records.',
      });
      toast.success('Documents verified and record updated to Document Verification.');
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to verify documents');
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkReady = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const details = collectionInstructions.trim() || `Certificate/Document ready for collection at ${collectionLocation}. Please carry valid student ID card.`;
      await api.patch(`/tickets/${ticket.id}/status`, {
        status: 'READY_FOR_COLLECTION',
        note: details,
      });
      // Post comment so student sees immediate instruction
      await api.post(`/tickets/${ticket.id}/comments`, {
        content: `Official Update: Document is ready for collection!\nLocation: ${collectionLocation}\nInstructions: ${details}`,
        is_internal: false,
      });
      toast.success('Certificate marked Ready for Collection! Student notified.');
      setReadyModalOpen(false);
      setCollectionInstructions('');
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to update certificate status');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartProgress = async () => {
    setActionLoading(true);
    try {
      await api.patch(`/tickets/${ticket.id}/status`, {
        status: 'IN_PROGRESS',
        note: 'Staff initiated active investigation.',
      });
      toast.success('Ticket moved to In Progress');
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to start progress');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignToColleague = async (e) => {
    e.preventDefault();
    if (!selectedAssigneeId) {
      toast.error('Please select a staff member to assign.');
      return;
    }
    setActionLoading(true);
    try {
      await api.post(`/tickets/${ticket.id}/assign`, {
        assignedTo: selectedAssigneeId,
        note: assignmentNote.trim() || undefined,
      });
      toast.success('Ticket assigned successfully!');
      setAssignModalOpen(false);
      setSelectedAssigneeId('');
      setAssignmentNote('');
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to assign ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestInfo = async (e) => {
    e.preventDefault();
    if (!requestInfoPrompt.trim() || requestInfoPrompt.trim().length < 5) {
      toast.error('Please specify what information or document is needed from the student (min 5 characters).');
      return;
    }
    setActionLoading(true);
    try {
      await api.patch(`/tickets/${ticket.id}/status`, {
        status: 'AWAITING_INFO',
        note: `Staff requested information: ${requestInfoPrompt.trim()}`,
      });
      await api.post(`/tickets/${ticket.id}/comments`, {
        content: `Staff Request for Information: ${requestInfoPrompt.trim()}`,
        is_internal: false,
      });
      toast.success('Information requested! Ticket updated to Awaiting Info.');
      setRequestInfoModalOpen(false);
      setRequestInfoPrompt('');
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to request information');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFetchAiAssist = async () => {
    setAiAssistLoading(true);
    try {
      const res = await api.post('/ai/summarize-ticket', { ticketId: ticket.id });
      const assistPayload = res?.data?.data || res?.data || res;
      setAiAssistData(assistPayload);
      setAiAssistOpen(true);
      toast.success('AI summary & reply suggestion generated!');
    } catch (err) {
      toast.error(err.message || 'Failed to generate AI assist suggestion');
    } finally {
      setAiAssistLoading(false);
    }
  };

  const handleApplySuggestedReply = (isForInternal = false) => {
    if (!aiAssistData?.suggestedReply) return;
    const commentBox = document.getElementById('comment-textarea');
    if (commentBox) {
      commentBox.value = aiAssistData.suggestedReply;
      commentBox.dispatchEvent(new Event('input', { bubbles: true }));
      const composer = document.getElementById('comment-composer');
      if (typeof composer?.scrollIntoView === 'function') composer.scrollIntoView({ behavior: 'smooth' });
      if (typeof commentBox?.focus === 'function') commentBox.focus();

      if (isForInternal) {
        const checkbox = document.querySelector('input[type="checkbox"][id*="internal"]');
        if (checkbox && !checkbox.checked) checkbox.click();
      }
      toast.success(isForInternal ? 'Inserted into internal note' : 'Inserted into public reply');
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    if (resolutionSummary.trim().length < 5) {
      toast.error('Resolution summary must be at least 5 characters long.');
      return;
    }
    setActionLoading(true);
    try {
      await api.patch(`/tickets/${ticket.id}/status`, {
        status: 'RESOLVED',
        resolutionSummary: resolutionSummary.trim(),
      });
      toast.success('Ticket marked as Resolved!');
      setResolveModalOpen(false);
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to resolve ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e) => {
    e.preventDefault();
    if (rejectionReason.trim().length < 5) {
      toast.error('Rejection reason must be at least 5 characters long.');
      return;
    }
    setActionLoading(true);
    try {
      await api.patch(`/tickets/${ticket.id}/status`, {
        status: 'REJECTED',
        rejectionReason: rejectionReason.trim(),
      });
      toast.success('Ticket rejected with documented reason.');
      setRejectModalOpen(false);
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to reject ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async (e) => {
    e.preventDefault();
    if (reopenReason.trim().length < 5) {
      toast.error('Please describe why the issue remains unresolved (min 5 characters).');
      return;
    }
    setActionLoading(true);
    try {
      await api.post(`/tickets/${ticket.id}/reopen`, {
        reason: reopenReason.trim(),
      });
      toast.success('Ticket reopened. Department notified.');
      setReopenModalOpen(false);
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to reopen ticket');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRate = async (e) => {
    e.preventDefault();
    setSubmittingRating(true);
    try {
      await api.post(`/tickets/${ticket.id}/rate`, {
        rating: ratingVal,
        feedback: ratingFeedback.trim() || undefined,
      });
      toast.success('Thank you for rating this resolution!');
      fetchTicket();
    } catch (err) {
      toast.error(err.message || 'Failed to submit rating');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handlePromoteToFaq = async (e) => {
    e.preventDefault();
    if (!faqQuestion.trim() || faqQuestion.trim().length < 5) {
      toast.error('Question must be at least 5 characters');
      return;
    }
    if (!faqAnswer.trim() || faqAnswer.trim().length < 10) {
      toast.error('Answer must be at least 10 characters');
      return;
    }

    setSubmittingFaqDraft(true);
    try {
      const keywordsArray = faqKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);

      await api.post('/faqs/draft-from-ticket', {
        ticketId: ticket.id,
        question: faqQuestion.trim(),
        answer: faqAnswer.trim(),
        categoryId: ticket.category_id,
        departmentId: ticket.assigned_department_id,
        keywords: keywordsArray,
      });

      toast.success('Solution promoted to FAQ draft! Pending Super Admin review & publication.', {
        icon: '📚',
        duration: 5000,
      });
      setFaqModalOpen(false);
    } catch (err) {
      toast.error(err.message || 'Failed to submit FAQ draft');
    } finally {
      setSubmittingFaqDraft(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <Link
          to={
            role === 'STAFF' || role === 'SUPER_ADMIN'
              ? '/staff'
              : ticket?.request_type === 'INFORMATION_REQUEST'
              ? '/queries'
              : '/tickets'
          }
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{role === 'STAFF' || role === 'SUPER_ADMIN' ? 'Back to Staff Operations' : 'Back to Ticket Queue'}</span>
        </Link>

        <span className="text-[11px] font-mono text-gray-400">
          Ref: <strong>{ticket.ticket_number}</strong>
        </span>
      </div>

      {/* Certificate & Student Service Workflow Lifecycle Stepper */}
      <div className="p-5 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-indigo-500" />
            <h3 className="text-xs uppercase tracking-wider font-bold text-gray-900 dark:text-white">
              Service & Certificate Workflow Lifecycle
            </h3>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
            Current Stage: {ticket.status.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Stepper Steps */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 pt-1">
          {[
            { key: 'SUBMITTED', label: '1. Submitted', icon: Clock },
            { key: 'UNDER_REVIEW', label: '2. Under Review', icon: HelpCircle },
            { key: 'DOCUMENT_VERIFICATION', label: '3. Doc Verification', icon: ShieldCheck },
            { key: 'IN_PROGRESS', label: '4. In Progress', icon: PlayCircle },
            { key: 'READY_FOR_COLLECTION', label: '5. Ready / Issued', icon: Award },
            { key: 'RESOLVED', label: '6. Completed', icon: CheckCircle2 },
          ].map((step, idx) => {
            const currentStageIdx = getCertificateStage(ticket);
            const isCompleted = idx < currentStageIdx || ticket.status === 'RESOLVED' || ticket.status === 'CLOSED';
            const isCurrent = idx === currentStageIdx && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED';
            const StepIcon = step.icon;

            return (
              <div
                key={step.key}
                className={`p-2.5 rounded-2xl border text-center transition-all ${
                  isCurrent
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20'
                    : isCompleted
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-gray-50 dark:bg-navy-950/40 border-gray-100 dark:border-navy-800/80 text-gray-400'
                }`}
              >
                <div className="flex justify-center mb-1">
                  <StepIcon className={`w-4 h-4 ${isCurrent ? 'text-indigo-600 animate-pulse' : isCompleted ? 'text-emerald-500' : 'text-gray-400'}`} />
                </div>
                <div className="text-[11px] font-bold truncate">{step.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Student Action Required: Staff Requested Additional Information Banner */}
      {ticket.status === 'AWAITING_INFO' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-amber-600 dark:text-amber-400 animate-fadeIn shadow-sm">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                Action Required: Staff Requested Additional Information
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                College staff has requested more details, documents, or clarifications to proceed with resolving your ticket. Please reply in the conversation thread below.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('comment-composer') || document.getElementById('comment-textarea');
              if (el) {
                el.scrollIntoView({ behavior: 'smooth' });
                document.getElementById('comment-textarea')?.focus();
              }
            }}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs whitespace-nowrap self-start sm:self-center transition-colors shadow-sm cursor-pointer"
          >
            Reply to Staff
          </button>
        </div>
      )}

      {/* Mode 4: Official Institutional Approval Request Banner */}
      {Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST') && (
        <div className={`p-4 sm:p-5 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fadeIn shadow-sm ${
          ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300'
            : ticket.status === 'REJECTED'
            ? 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
              ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
            }`}>
              {ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : ticket.status === 'REJECTED' ? (
                <XCircle className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                  Official Institutional Approval Request
                </h4>
                <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                  ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : ticket.status === 'REJECTED'
                    ? 'bg-rose-500/20 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                }`}>
                  {ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
                    ? 'Official Approval Granted'
                    : ticket.status === 'REJECTED'
                    ? 'Official Request Declined'
                    : 'Decision Pending Authorized Review'}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                {ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'
                  ? 'This request was reviewed and officially approved by authorized department personnel. See resolution summary below.'
                  : ticket.status === 'REJECTED'
                  ? 'This request was formally declined with a documented reason provided by authorized staff.'
                  : 'Requires explicit approval or rejection by authorized staff or Super Admin. AI cannot authorize official records directly.'}
              </p>
            </div>
          </div>

          {canTriage && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && ticket.status !== 'REJECTED' && (
            <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
              {profile?.can_approve_documents || role === 'SUPER_ADMIN' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setResolveModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-all"
                  >
                    ✓ Approve Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectModalOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm transition-all"
                  >
                    ✕ Reject Request
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-500 dark:text-gray-400 italic">
                  Awaiting Approver sign-off
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mode 2/3: Staff Information Request Banner */}
      {Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:INFORMATION_REQUEST') && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-800 dark:text-amber-300 flex items-start gap-3 animate-fadeIn shadow-sm">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white">
                Staff Information Request
              </h4>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                Clarification Only
              </span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
              This request was initiated for factual confirmation, processing timelines, or status updates from department staff. Formal institutional approval is not required.
            </p>
          </div>
        </div>
      )}

      {/* Main Ticket Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-navy-800">
          <div className="flex items-center gap-3">
            <span className="font-mono text-base font-extrabold text-coral-600 dark:text-coral-400 bg-coral-500/10 px-3 py-1 rounded-xl">
              {ticket.ticket_number}
            </span>
            <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-navy-100 dark:bg-navy-800 text-gray-800 dark:text-gray-200">
              {ticket.category?.name || 'Inquiry'}
            </span>
            {ticket.is_confidential && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-500/10 px-2.5 py-1 rounded-full">
                <Shield className="w-3.5 h-3.5" />
                Confidential
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Status:</span>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-navy-800 text-slate-800 dark:text-white border border-slate-200 dark:border-navy-700">
              {ticket.status}
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-snug">
            {ticket.title}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Raised on {formatToIST(ticket.created_at)} by{' '}
            <strong>{ticket.creator?.full_name || 'Student'}</strong>
          </p>
        </div>

        {/* Department & SLA Information Cards (Safe Assignment Disclosure) */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800 space-y-1">
            <span className="text-gray-400 uppercase font-semibold text-[10px]">Responsible Department</span>
            <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5 truncate">
              <Building className="w-3.5 h-3.5 text-coral-500 shrink-0" />
              <span className="truncate">{ticket.assigned_department?.name || 'Department Desk'}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800 space-y-1">
            <span className="text-gray-400 uppercase font-semibold text-[10px]">Assignment Status</span>
            <div className="font-bold text-gray-900 dark:text-white truncate">
              {role === 'STUDENT'
                ? ticket.assigned_to
                  ? 'Assigned to Staff Officer'
                  : 'In Department Queue'
                : ticket.assignee?.full_name || 'Unassigned'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800 space-y-1">
            <span className="text-gray-400 uppercase font-semibold text-[10px]">Priority</span>
            <div className="font-bold text-gray-900 dark:text-white">
              {ticket.priority || 'Medium'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800 space-y-1">
            <span className="text-gray-400 uppercase font-semibold text-[10px]">SLA Response Target</span>
            <div className="font-bold text-amber-500 flex items-center gap-1.5 truncate">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {ticket.sla_due_at
                  ? formatToIST(ticket.sla_due_at)
                  : ticket.resolution_due_at
                  ? formatToIST(ticket.resolution_due_at)
                  : 'Standard 24h SLA'}
              </span>
            </div>
          </div>
        </div>

        {/* Permitted Student Information (Staff Authorization Scope) */}
        {canTriage && (
          <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-navy-950/70 border border-indigo-100 dark:border-navy-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5" />
                Permitted Student Information (Institutional Scope)
              </span>
              {ticket.is_confidential && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Confidential Case
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div>
                <span className="text-gray-400 text-[10px] block">Student Name</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {ticket.student?.full_name || ticket.creator?.full_name || ticket.student_name || 'Registered Student'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] block">Roll Number / ID</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {ticket.student?.roll_number || ticket.creator?.roll_number || ticket.student_roll_number || 'STU-' + (ticket.created_by?.slice(0, 8) || '2026')}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] block">College Email</span>
                <span className="font-semibold text-gray-900 dark:text-white truncate block">
                  {ticket.student?.email || ticket.creator?.email || ticket.student_email || 'student@smartdesk.edu'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 text-[10px] block">Academic Department</span>
                <span className="font-semibold text-gray-900 dark:text-white truncate block">
                  {ticket.student?.department?.name || ticket.student_department?.name || ticket.creator?.department?.name || 'Computer Science & Engineering'}
                </span>
              </div>
              {ticket.creator?.phone_number && (
                <div>
                  <span className="text-gray-400 text-[10px] block">Contact Phone</span>
                  <span className="font-semibold text-gray-900 dark:text-white truncate block">
                    {ticket.creator.phone_number}
                  </span>
                </div>
              )}
              {ticket.creator?.year_of_study && (
                <div>
                  <span className="text-gray-400 text-[10px] block">Year of Study</span>
                  <span className="font-semibold text-gray-900 dark:text-white truncate block">
                    Year {ticket.creator.year_of_study}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full Issue Description */}
        <div className="pt-2 space-y-2">
          <h3 className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
            Description
          </h3>
          <div className="p-4 rounded-2xl bg-gray-50/70 dark:bg-navy-950 text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap border border-gray-100 dark:border-navy-800">
            {ticket.description}
          </div>
        </div>

        {/* Attachments Section */}
        {((attachments && attachments.length > 0) || (ticket.attachments && ticket.attachments.length > 0)) && (
          <div className="pt-1 space-y-2">
            <h3 className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5 text-coral-500" />
              Attached Files & Verification Documents
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(attachments.length > 0 ? attachments : ticket.attachments || []).map((att, idx) => {
                const fileName = att.file_name || att.filename || att.name || `Attachment-${idx + 1}`;
                const fileSize = att.file_size ? `${Math.round(att.file_size / 1024)} KB` : 'Document';
                const fileUrl = att.file_url || att.url || `/api/tickets/${ticket.id}/attachments/${att.id}/download`;

                return (
                  <div
                    key={att.id || idx}
                    className="p-3 rounded-xl bg-gray-50 dark:bg-navy-950 border border-gray-200 dark:border-navy-800 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-coral-500 shrink-0" />
                      <div className="truncate">
                        <span className="font-semibold text-gray-800 dark:text-gray-200 block truncate" title={fileName}>
                          {fileName}
                        </span>
                        <span className="text-[10px] text-gray-400">{fileSize}</span>
                      </div>
                    </div>
                    {fileUrl && (
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-navy-800 dark:hover:bg-navy-700 text-gray-700 dark:text-gray-300 font-medium text-[11px] shrink-0 flex items-center gap-1 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Resolution Summary Block (if resolved) */}
        {ticket.resolution_summary && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs space-y-1">
            <div className="font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Official Department Resolution Summary</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed pl-5">
              {ticket.resolution_summary}
            </p>
          </div>
        )}

        {/* Rejection Reason Block (if rejected) */}
        {ticket.rejection_reason && (
          <div className="p-4 rounded-2xl bg-coral-500/10 border border-coral-500/30 text-xs space-y-1">
            <div className="font-bold text-coral-700 dark:text-coral-300 flex items-center gap-1.5">
              <XCircle className="w-4 h-4" />
              <span>Documented Rejection Reason</span>
            </div>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed pl-5">
              {ticket.rejection_reason}
            </p>
          </div>
        )}

        {/* Action Buttons Toolbar */}
        <div className="pt-4 border-t border-gray-100 dark:border-navy-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Student: Reopen button */}
            {canReopen && (
              <button
                type="button"
                onClick={() => setReopenModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reopen Ticket (1 time allowed)</span>
              </button>
            )}

            {/* Staff / Admin Actions */}
            {canTriage && ticket.status !== 'CLOSED' && ticket.status !== 'REJECTED' && (
              <>
                {!ticket.assigned_to && (
                  <button
                    type="button"
                    onClick={handleClaim}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-navy-800 hover:bg-navy-700 text-white text-xs font-semibold transition-colors shadow-sm"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Claim Ticket</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    loadDepartmentStaff();
                    setAssignModalOpen(true);
                  }}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shadow-sm"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{ticket.assigned_to ? 'Reassign' : 'Assign'}</span>
                </button>

                {ticket.status === 'OPEN' && (
                  <button
                    type="button"
                    onClick={handleAcceptQuery}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-sm"
                    title="Accept query and move to Under Review stage"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Accept Query</span>
                  </button>
                )}

                {(ticket.status === 'OPEN' || ticket.status === 'UNDER_REVIEW') && (
                  <button
                    type="button"
                    onClick={handleVerifyDocs}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors shadow-sm"
                    title="Verify submitted student certificates and documentation"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Verify Documents</span>
                  </button>
                )}

                {(ticket.status === 'OPEN' || ticket.status === 'UNDER_REVIEW' || ticket.status === 'DOCUMENT_VERIFICATION' || ticket.status === 'AWAITING_INFO') && (
                  <button
                    type="button"
                    onClick={handleStartProgress}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors shadow-sm"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Start Progress</span>
                  </button>
                )}

                {(ticket.status === 'IN_PROGRESS' || ticket.status === 'DOCUMENT_VERIFICATION' || ticket.status === 'UNDER_REVIEW') && (
                  <button
                    type="button"
                    onClick={() => setReadyModalOpen(true)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-sm"
                    title="Mark document ready for student collection or issue"
                  >
                    <Award className="w-3.5 h-3.5" />
                    <span>Ready for Collection / Issue</span>
                  </button>
                )}

                {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && ticket.status !== 'AWAITING_INFO' && (
                  <button
                    type="button"
                    onClick={() => setRequestInfoModalOpen(true)}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold transition-colors shadow-sm"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Request Info</span>
                  </button>
                )}

                {ticket.status !== 'RESOLVED' && (
                  <button
                    type="button"
                    onClick={() => setResolveModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors shadow-sm"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Resolve</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setRejectModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-coral-600 hover:bg-coral-500/10 text-xs font-semibold transition-colors"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>

                {/* AI Assist Assistance Button */}
                <button
                  type="button"
                  onClick={handleFetchAiAssist}
                  disabled={aiAssistLoading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 text-white text-xs font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                  title="Generate advisory AI summary and recommended response draft"
                >
                  {aiAssistLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>AI Assist</span>
                </button>
              </>
            )}

            {/* Promote Solution to Knowledge Base FAQ Draft (Staff / Super Admin) */}
            {canTriage && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && (
              <button
                type="button"
                onClick={() => {
                  setFaqQuestion(ticket.title || '');
                  setFaqAnswer(ticket.resolution_summary || ticket.description || '');
                  setFaqKeywords(Array.isArray(ticket.tags) ? ticket.tags.join(', ') : '');
                  setFaqModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-colors"
                title="Create an FAQ draft from this ticket solution for Super Admin review"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Promote to FAQ Draft</span>
              </button>
            )}
          </div>

          <div className="text-xs text-gray-400">
            Reopen count: <strong>{ticket.reopened_count}</strong> / 1
          </div>
        </div>

        {/* AI Assist Assistance Panel (Advisory Only) */}
        {aiAssistOpen && aiAssistData && (
          <div className="mt-4 p-5 rounded-2xl bg-gradient-to-r from-sky-50/70 via-indigo-50/50 to-purple-50/70 dark:from-sky-950/30 dark:via-navy-950/50 dark:to-purple-950/30 border border-sky-500/30 text-xs space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sky-700 dark:text-sky-300 text-sm">
                <Sparkles className="w-4 h-4 text-sky-500" />
                <span>AI Advisory Ticket Summary & Response Assistance</span>
              </div>
              <button
                type="button"
                onClick={() => setAiAssistOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>

            {/* Institutional Disclaimer */}
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              <span>
                {aiAssistData.disclaimer ||
                  'Advisory AI assistance only; official actions and replies remain the responsibility of university staff.'}
              </span>
            </div>

            {/* Summary */}
            <div className="space-y-1">
              <span className="font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider text-[10px]">
                Advisory Case Summary:
              </span>
              <p className="text-gray-700 dark:text-gray-300 leading-relaxed bg-white/70 dark:bg-navy-900/70 p-3 rounded-xl border border-gray-200 dark:border-navy-800">
                {aiAssistData.summary}
              </p>
            </div>

            {/* Key Points */}
            {aiAssistData.keyPoints && aiAssistData.keyPoints.length > 0 && (
              <div className="space-y-1">
                <span className="font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider text-[10px]">
                  Key Case Points:
                </span>
                <ul className="list-disc pl-5 space-y-0.5 text-gray-600 dark:text-gray-300">
                  {aiAssistData.keyPoints.map((pt, idx) => (
                    <li key={idx}>{pt}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggested Reply Draft */}
            {aiAssistData.suggestedReply && (
              <div className="space-y-2">
                <span className="font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider text-[10px]">
                  Recommended Staff Reply Draft:
                </span>
                <div className="p-3 rounded-xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-xs">
                  {aiAssistData.suggestedReply}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleApplySuggestedReply(false)}
                    className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Insert into Public Reply</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplySuggestedReply(true)}
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Save as Internal Note</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Student Satisfaction Rating Widget */}
      {isResolvedOrClosed && isCreator && (
        <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Rate Resolution Quality
            </h3>
          </div>

          {ticket.rating ? (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
              <div className="flex items-center gap-1 text-amber-500">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`w-4 h-4 ${
                      star <= ticket.rating.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                    }`}
                  />
                ))}
                <span className="font-bold ml-1.5">You rated this {ticket.rating.rating} / 5</span>
              </div>
              {ticket.rating.feedback && (
                <p className="text-gray-600 dark:text-gray-300 italic pt-1">
                  &ldquo;{ticket.rating.feedback}&rdquo;
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleRate} className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                How satisfied are you with the resolution provided by staff?
              </p>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatingVal(star)}
                    className="p-1 hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`w-6 h-6 ${
                        star <= ratingVal
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-300 dark:text-navy-700'
                      }`}
                    />
                  </button>
                ))}
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300 ml-2">
                  {ratingVal} Stars
                </span>
              </div>

              <input
                type="text"
                value={ratingFeedback}
                onChange={(e) => setRatingFeedback(e.target.value)}
                placeholder="Optional feedback or compliments on staff response..."
                className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs"
              />

              <button
                type="submit"
                disabled={submittingRating}
                className="px-4 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                {submittingRating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Submit Rating</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* Phase 3: Discussion & Internal Notes */}
      <CommentThread ticketId={ticket.id} isClosed={ticket.status === 'CLOSED'} />

      {/* Audit History / Event Timeline */}
      <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-gray-100 dark:border-navy-800">
          <History className="w-4 h-4 text-coral-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
            Ticket Audit History & Activity Timeline
          </h3>
        </div>

        <div className="space-y-4 pl-2">
          {ticket.events && ticket.events.length > 0 ? (
            ticket.events.map((evt, idx) => (
              <div key={evt.id || idx} className="relative pl-6 pb-2 border-l border-gray-200 dark:border-navy-800 text-xs">
                <span className="absolute -left-1.5 top-0.5 w-3 h-3 rounded-full bg-coral-500 border-2 border-white dark:border-navy-900"></span>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 dark:text-white">
                    {evt.event_type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {formatToIST(evt.created_at)}
                  </span>
                </div>
                {evt.actor && (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    by {evt.actor.full_name} ({evt.actor.role})
                  </span>
                )}
                {evt.note && (
                  <p className="mt-1 text-gray-700 dark:text-gray-300 italic bg-gray-50 dark:bg-navy-950 p-2 rounded-lg border border-gray-100 dark:border-navy-800">
                    {evt.note}
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-400">No events recorded yet.</p>
          )}
        </div>
      </div>

      {/* Resolve / Approve Modal */}
      {resolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST')
                ? 'Approve Official Request'
                : 'Resolve Ticket'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST')
                ? 'Provide the official authorization notes, conditions, or institutional confirmation details for this student request.'
                : 'Provide an official resolution summary explaining how this student inquiry was settled.'}
            </p>
            <form onSubmit={handleResolve} className="space-y-3">
              <textarea
                required
                rows={4}
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                placeholder={
                  Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST')
                    ? 'e.g. Official approval granted per Academic Dean review. Attendance shortage condoned with medical certificate on file...'
                    : 'Detailed explanation of the resolution steps taken...'
                }
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white"
              ></textarea>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResolveModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  {Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST')
                    ? 'Confirm Official Approval'
                    : 'Confirm Resolution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject / Decline Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST')
                ? 'Decline Official Request'
                : 'Reject Ticket'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST')
                ? 'Document the official institutional reason why this authorization request cannot be approved.'
                : 'Document the formal reason this request cannot be processed according to college policies.'}
            </p>
            <form onSubmit={handleReject} className="space-y-3">
              <textarea
                required
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={
                  Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST')
                    ? 'e.g. Request declined: submitted after deadline or minimum 65% attendance requirement not met per University Regulation 4.2...'
                    : 'Documented reason for rejection...'
                }
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white"
              ></textarea>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold text-gray-700 dark:text-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-semibold"
                >
                  {Array.isArray(ticket.tags) && ticket.tags.includes('WORKFLOW:APPROVAL_REQUEST')
                    ? 'Confirm Official Rejection'
                    : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign / Reassign Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                  {ticket.assigned_to ? 'Reassign Ticket' : 'Assign Ticket'}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Assign this ticket to an authorized departmental colleague.
                </p>
              </div>
            </div>

            <form onSubmit={handleAssignToColleague} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Select Staff Member *
                </label>
                {loadingStaff ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                    <span>Loading department colleagues...</span>
                  </div>
                ) : (
                  <select
                    required
                    value={selectedAssigneeId}
                    onChange={(e) => setSelectedAssigneeId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Choose Staff Colleague --</option>
                    {departmentStaff.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.full_name || st.name} ({st.email}) {st.department?.name || st.departments?.name ? `• ${st.department?.name || st.departments?.name}` : (st.role === 'SUPER_ADMIN' ? '• Super Admin' : '')} {st.id === profile?.id ? '(Me)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Assignment Note / Internal Handover (Optional)
                </label>
                <textarea
                  rows={3}
                  value={assignmentNote}
                  onChange={(e) => setAssignmentNote(e.target.value)}
                  placeholder="e.g. Please follow up on this student's exam hall ticket issue..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !selectedAssigneeId}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Assigning...</span>
                    </>
                  ) : (
                    <span>Confirm Assignment</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Information Modal */}
      {requestInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                <MessageSquarePlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                  Request Information from Student
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Ticket status will transition to <span className="font-semibold text-amber-600">AWAITING_INFO</span> and notify the student.
                </p>
              </div>
            </div>

            <form onSubmit={handleRequestInfo} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Required Information or Document *
                </label>
                <textarea
                  required
                  rows={4}
                  value={requestInfoPrompt}
                  onChange={(e) => setRequestInfoPrompt(e.target.value)}
                  placeholder="e.g. Please provide a clear copy of your previous fee receipt or grade sheet to proceed..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500"
                ></textarea>
                <p className="mt-1 text-[11px] text-gray-500">
                  This message will be posted publicly to the ticket thread so the student can respond promptly.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRequestInfoModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !requestInfoPrompt.trim()}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
                >
                  {actionLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>Send Request</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Reopen Ticket</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Explain why this issue is not resolved. You are permitted to reopen this ticket only once within 7 days.
            </p>
            <form onSubmit={handleReopen} className="space-y-3">
              <textarea
                required
                rows={4}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Explain what remains unresolved..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs"
              ></textarea>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReopenModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold"
                >
                  Submit Reopening
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Promote to FAQ Draft Modal */}
      {faqModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                  Promote Solution to FAQ Draft
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Transform this resolved student ticket into a general knowledge base solution.
                </p>
              </div>
            </div>

            <form onSubmit={handlePromoteToFaq} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  FAQ Question Title *
                </label>
                <input
                  type="text"
                  required
                  value={faqQuestion}
                  onChange={(e) => setFaqQuestion(e.target.value)}
                  placeholder="e.g. How do I register a laptop MAC address for WiFi?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Approved Answer & Procedure *
                </label>
                <textarea
                  required
                  rows={5}
                  value={faqAnswer}
                  onChange={(e) => setFaqAnswer(e.target.value)}
                  placeholder="Clear, step-by-step resolution that can help any student encountering this issue..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Search Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={faqKeywords}
                  onChange={(e) => setFaqKeywords(e.target.value)}
                  placeholder="wifi, mac address, hostel, network"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                <span className="font-bold">Lifecycle Note:</span> This FAQ will be saved with status{' '}
                <span className="font-mono font-bold">DRAFT</span>. It will not be visible on the public FAQ
                page or in AI retrieval until reviewed and published by a Super Admin.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setFaqModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingFaqDraft}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
                >
                  {submittingFaqDraft ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit FAQ Draft</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Ready for Collection / Issue Modal */}
      {readyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white dark:bg-navy-900 rounded-3xl p-6 border border-gray-200 dark:border-navy-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-navy-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-500">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Mark Ready for Collection / Issued</h3>
                  <p className="text-xs text-gray-400">Notify student with official pickup instructions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReadyModalOpen(false)}
                className="p-1 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleMarkReady} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Collection Location / Counter *
                </label>
                <input
                  type="text"
                  value={collectionLocation}
                  onChange={(e) => setCollectionLocation(e.target.value)}
                  placeholder="e.g. Room 104, Administrative Block (Counter 3)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-gray-50 dark:bg-navy-950 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-1.5">
                  Collection Timings & Mandatory Student Instructions *
                </label>
                <textarea
                  value={collectionInstructions}
                  onChange={(e) => setCollectionInstructions(e.target.value)}
                  rows={3}
                  placeholder="e.g. Please collect between 10:00 AM and 4:00 PM on working days. Must present valid student ID card."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-gray-50 dark:bg-navy-950 text-xs text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReadyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-500/25 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {actionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Award className="w-3.5 h-3.5" />}
                  <span>Confirm Document Ready</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
