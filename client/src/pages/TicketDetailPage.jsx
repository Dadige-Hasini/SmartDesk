import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
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
} from 'lucide-react';
import toast from 'react-hot-toast';

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

  // Rating state
  const [ratingVal, setRatingVal] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);

  const fetchTicket = () => {
    setLoading(true);
    api
      .get(`/tickets/${id}`)
      .then((res) => {
        setTicket(res.data);
        setLoading(false);
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Failed to load ticket details');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTicket();
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
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-white dark:bg-navy-900 border border-coral-500/30 shadow-xl text-center space-y-4">
        <XCircle className="w-12 h-12 text-coral-500 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Unable to View Ticket</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{errorMsg || 'Ticket does not exist or access is denied.'}</p>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-coral-500 text-white font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tickets
        </Link>
      </div>
    );
  }

  const isCreator = ticket.created_by === profile?.id;
  const isAssignedStaff =
    role === 'STAFF' && ticket.assigned_department_id === profile?.department_id;
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const canTriage = isAssignedStaff || isSuperAdmin;

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

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* Back button */}
      <div>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Ticket Queue
        </Link>
      </div>

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
            <span className="text-xs text-gray-400">Status:</span>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-navy-950 text-white dark:bg-navy-800">
              {ticket.status}
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white leading-snug">
            {ticket.title}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Raised on {new Date(ticket.created_at).toLocaleString()} by{' '}
            <strong>{ticket.creator?.full_name || 'Student'}</strong>
          </p>
        </div>

        {/* Department & SLA Information Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800 space-y-1">
            <span className="text-gray-400 uppercase font-semibold text-[10px]">Responsible Department</span>
            <div className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-coral-500" />
              <span>{ticket.assigned_department?.name || 'Unassigned'}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800 space-y-1">
            <span className="text-gray-400 uppercase font-semibold text-[10px]">Student Academic Dept</span>
            <div className="font-bold text-gray-900 dark:text-white">
              {ticket.student_department?.name || 'Not Specified'}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-navy-950/60 border border-gray-100 dark:border-navy-800 space-y-1">
            <span className="text-gray-400 uppercase font-semibold text-[10px]">SLA Due Date</span>
            <div className="font-bold text-amber-500 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleString() : 'Standard SLA'}</span>
            </div>
          </div>
        </div>

        {/* Full Issue Description */}
        <div className="pt-2 space-y-2">
          <h3 className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
            Description
          </h3>
          <div className="p-4 rounded-2xl bg-gray-50/70 dark:bg-navy-950 text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap border border-gray-100 dark:border-navy-800">
            {ticket.description}
          </div>
        </div>

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
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-navy-800 hover:bg-navy-700 text-white text-xs font-semibold transition-colors"
                  >
                    <span>Claim Ticket</span>
                  </button>
                )}

                {ticket.status !== 'RESOLVED' && (
                  <button
                    type="button"
                    onClick={() => setResolveModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
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
              </>
            )}
          </div>

          <div className="text-xs text-gray-400">
            Reopen count: <strong>{ticket.reopened_count}</strong> / 1
          </div>
        </div>
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
                    {new Date(evt.created_at).toLocaleString()}
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

      {/* Resolve Modal */}
      {resolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Resolve Ticket</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Provide an official resolution summary explaining how this student inquiry was settled.
            </p>
            <form onSubmit={handleResolve} className="space-y-3">
              <textarea
                required
                rows={4}
                value={resolutionSummary}
                onChange={(e) => setResolutionSummary(e.target.value)}
                placeholder="Detailed explanation of the resolution steps taken..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs"
              ></textarea>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResolveModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  Confirm Resolution
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Reject Ticket</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Document the formal reason this request cannot be processed according to college policies.
            </p>
            <form onSubmit={handleReject} className="space-y-3">
              <textarea
                required
                rows={4}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Documented reason for rejection..."
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs"
              ></textarea>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-coral-500 text-white text-xs font-semibold"
                >
                  Confirm Rejection
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
    </div>
  );
}
