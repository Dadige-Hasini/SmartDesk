import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import {
  Send,
  Lock,
  Paperclip,
  FileText,
  Image as ImageIcon,
  File,
  X,
  Download,
  Shield,
  User,
  Clock,
  Loader2,
  AlertCircle,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatToIST } from '../utils/date';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 3;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx'];

export default function CommentThread({ ticketId, isClosed = false }) {
  const { user, profile, role } = useAuth();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);
  const isStaffOrAdmin = role === 'STAFF' || role === 'SUPER_ADMIN';

  // Load comments
  const loadComments = async () => {
    if (!ticketId) return;
    try {
      setLoading(true);
      const res = await api.get(`/tickets/${ticketId}/comments`);
      const payload = res?.data?.data || res?.data || res;
      if (payload?.comments && Array.isArray(payload.comments)) {
        const raw = payload.comments;
        setComments(role === 'STUDENT' ? raw.filter((c) => !c.is_internal) : raw);
      } else if (Array.isArray(payload)) {
        setComments(role === 'STUDENT' ? payload.filter((c) => !c.is_internal) : payload);
      } else {
        setComments([]);
      }
    } catch (err) {
      console.warn('Comments fetch warning/fallback:', err?.message || err);
      // Only toast if an explicit error with status occurs
      if (err?.response && err.response.status !== 404) {
        toast.error('Failed to load discussion comments');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();

    // Supabase Realtime subscription
    let channel = null;
    if (supabase && typeof supabase.channel === 'function' && ticketId) {
      try {
        channel = supabase
          .channel(`public:ticket_comments:ticket_id=eq.${ticketId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'ticket_comments',
              filter: `ticket_id=eq.${ticketId}`,
            },
            (payload) => {
              if (payload.new) {
                // If student, do not display internal notes
                if (role === 'STUDENT' && payload.new.is_internal) {
                  return;
                }
                setComments((prev) => {
                  if (prev.some((c) => c.id === payload.new.id)) return prev;
                  return [...prev, payload.new];
                });
              }
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              loadComments();
            }
          });
      } catch {}
    }

    // Fallback synchronization on focus, network reconnection, and polling
    const handleFocus = () => loadComments();
    const handleOnline = () => loadComments();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    let intervalId = null;
    if (!isClosed && typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
      intervalId = setInterval(() => {
        loadComments();
      }, 12000);
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
  }, [ticketId, role, isClosed]);

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (selectedFiles.length + files.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} attachments allowed per comment.`);
      return;
    }

    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        toast.error(`"${file.name}" has an unsupported format. Allowed: .jpg, .jpeg, .png, .webp, .pdf, .docx`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`"${file.name}" exceeds the 5 MB size limit.`);
        return;
      }
    }

    setSelectedFiles((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim() && selectedFiles.length === 0) {
      toast.error('Please enter a comment message.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('content', content.trim());
      formData.append('isInternal', isStaffOrAdmin ? isInternal : false);

      selectedFiles.forEach((file) => {
        formData.append('files', file);
      });

      const res = await api.post(`/tickets/${ticketId}/comments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const payload = res?.data?.data || res?.data || res;
      if (payload?.comment) {
        setComments((prev) => [...prev, payload.comment]);
      } else {
        await loadComments();
      }

      setContent('');
      setSelectedFiles([]);
      setIsInternal(false);
      toast.success(isInternal ? 'Internal note added' : 'Comment posted');
    } catch (err) {
      const msg = err?.message || err?.response?.data?.message || 'Failed to submit comment.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadAttachment = async (attachment) => {
    try {
      const res = await api.get(
        `/tickets/${ticketId}/attachments/${attachment.id}/download`,
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', attachment.file_name);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      const msg = err.response?.data?.message || 'Unable to download attachment.';
      toast.error(msg);
    }
  };

  const renderFileIcon = (mimeType) => {
    if (mimeType?.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-sky-400" />;
    if (mimeType?.includes('pdf')) return <FileText className="w-4 h-4 text-rose-400" />;
    return <File className="w-4 h-4 text-emerald-400" />;
  };

  return (
    <div className="bg-neutral-900/70 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl transition-all">
      {/* Thread Header */}
      <div className="flex items-center justify-between px-6 py-4.5 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#64CEFB]">
            <MessageSquare className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              Discussion & Notes
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-white/90 border border-white/10 font-semibold">
                {comments.length}
              </span>
            </h3>
            <p className="text-xs text-white/60">Official thread between student and assigned department</p>
          </div>
        </div>

        {isStaffOrAdmin && (
          <span className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-sm">
            <Lock className="w-3.5 h-3.5" /> Staff Internal Notes Enabled
          </span>
        )}
      </div>

      {/* Comment List */}
      <div className="p-6 space-y-4 max-h-[540px] overflow-y-auto">
        {loading ? (
          <div className="py-14 flex flex-col items-center justify-center gap-3 text-white/60">
            <Loader2 className="w-6 h-6 animate-spin text-[#64CEFB]" />
            <span className="text-xs">Loading ticket discussion...</span>
          </div>
        ) : comments.length === 0 ? (
          <div className="py-12 text-center text-white/50 text-sm space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/40">
              <MessageSquare className="w-6 h-6" />
            </div>
            <p className="font-medium text-white/70">No comments on this ticket yet.</p>
            <p className="text-xs text-white/40">Start the conversation below or ask for an update.</p>
          </div>
        ) : (
          comments.map((comment) => {
            const authorRole = comment.author?.role || 'STUDENT';
            const isNote = Boolean(comment.is_internal);

            return (
              <div
                key={comment.id}
                className={`p-5 rounded-2xl transition-all duration-200 ${
                  isNote
                    ? 'bg-amber-500/10 border-2 border-amber-500/30 shadow-lg shadow-amber-500/5'
                    : 'bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-white/20'
                }`}
              >
                {/* Comment Metadata */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-black to-neutral-800 border border-white/20 text-white flex items-center justify-center text-xs font-bold uppercase shadow-sm">
                      {comment.author?.full_name?.[0] || 'U'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">
                          {comment.author?.full_name || 'User'}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            authorRole === 'SUPER_ADMIN'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : authorRole === 'STAFF'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {authorRole}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {isNote && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                        <Lock className="w-3 h-3" /> Internal Staff Note
                      </span>
                    )}
                    <span className="text-[11px] text-white/50 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatToIST(comment.created_at)}
                    </span>
                  </div>
                </div>

                {/* Comment Body */}
                <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">
                  {comment.content}
                </p>

                {/* Attached Files */}
                {comment.attachments && comment.attachments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap gap-2">
                    {comment.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 hover:border-[#64CEFB] text-xs text-white/80 hover:text-white transition-all shadow-sm group"
                      >
                        {renderFileIcon(att.mime_type)}
                        <span className="max-w-[150px] truncate">{att.file_name}</span>
                        <span className="text-[10px] text-white/40">
                          ({(att.file_size / 1024).toFixed(0)} KB)
                        </span>
                        <Download className="w-3.5 h-3.5 text-white/40 group-hover:text-[#64CEFB] transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Post Comment Box */}
      {!isClosed ? (
        <form id="comment-composer" onSubmit={handleSubmit} className="p-5 border-t border-white/10 bg-black/40 space-y-3">
          {/* Internal Note Toggle (Staff Only) */}
          {isStaffOrAdmin && (
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-white/80 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={!isInternal}
                  onChange={() => setIsInternal(false)}
                  className="text-[#64CEFB] focus:ring-[#64CEFB]"
                />
                <span>Public Response (Visible to Student)</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-amber-300 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={isInternal}
                  onChange={() => setIsInternal(true)}
                  className="text-amber-400 focus:ring-amber-400"
                />
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Staff Internal Note
                </span>
              </label>
            </div>
          )}

          {/* Text Area */}
          <textarea
            id="comment-textarea"
            rows="3"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              isInternal
                ? 'Write a private note for department staff...'
                : 'Type your message or response...'
            }
            className={`w-full p-4 text-sm rounded-2xl border ${
              isInternal
                ? 'border-amber-500/40 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 bg-amber-950/20'
                : 'border-white/10 focus:border-[#64CEFB] focus:ring-1 focus:ring-[#64CEFB] bg-white/[0.04]'
            } text-white placeholder-white/40 outline-none transition-all resize-none`}
          />

          {/* Selected File Previews */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/10 text-xs text-white"
                >
                  <Paperclip className="w-3 h-3 text-[#64CEFB]" />
                  <span className="max-w-[130px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="p-0.5 hover:text-red-400 rounded transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.docx"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <label
                htmlFor="file-upload"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5 text-[#64CEFB]" />
                <span>Attach Files (Max 3, 5MB)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold text-white shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 ${
                isInternal
                  ? 'bg-amber-600 hover:bg-amber-500 border border-amber-400/40'
                  : 'bg-black hover:bg-neutral-900 border border-white/20 hover:border-[#64CEFB]/60'
              } disabled:opacity-50`}
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>{isInternal ? 'Save Internal Note' : 'Send Reply'}</span>
            </button>
          </div>
        </form>
      ) : (
        <div className="p-4 bg-white/[0.02] border-t border-white/10 text-center text-xs text-white/50">
          This ticket is closed. Reopen the ticket to continue the discussion.
        </div>
      )}
    </div>
  );
}
