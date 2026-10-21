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
    try {
      const payload = res?.data?.data || res?.data || res;
      if (payload?.comments) {
        setComments(payload.comments);
      }
    } catch (err) {
      toast.error('Failed to load discussion comments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();

    // Supabase Realtime subscription
    let channel = null;
    if (supabase && ticketId) {
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
          .subscribe();
      } catch {}
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [ticketId, role]);

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
    if (mimeType?.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-sky-500" />;
    if (mimeType?.includes('pdf')) return <FileText className="w-4 h-4 text-rose-500" />;
    return <File className="w-4 h-4 text-emerald-500" />;
  };

  return (
    <div className="bg-white dark:bg-navy-900 rounded-2xl border border-gray-200 dark:border-navy-800 overflow-hidden shadow-sm">
      {/* Thread Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-navy-800 bg-gray-50/60 dark:bg-navy-950/40">
        <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
          Discussion & Notes
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 dark:bg-navy-800 text-gray-700 dark:text-gray-300 font-semibold">
            {comments.length}
          </span>
        </h3>
        {isStaffOrAdmin && (
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> Staff Internal Notes Enabled
          </span>
        )}
      </div>

      {/* Comment List */}
      <div className="p-6 space-y-4 max-h-[500px] overflow-y-auto">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-coral-500" />
          </div>
        ) : comments.length === 0 ? (
          <div className="py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
            <p>No comments on this ticket yet. Start the conversation below.</p>
          </div>
        ) : (
          comments.map((comment) => {
            const authorRole = comment.author?.role || 'STUDENT';
            const isNote = Boolean(comment.is_internal);

            return (
              <div
                key={comment.id}
                className={`p-4 rounded-2xl transition-all ${
                  isNote
                    ? 'bg-amber-500/10 border-2 border-amber-500/30'
                    : 'bg-gray-50 dark:bg-navy-950/70 border border-gray-200/80 dark:border-navy-800'
                }`}
              >
                {/* Comment Metadata */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-navy-800 text-white flex items-center justify-center text-xs font-bold uppercase">
                      {comment.author?.full_name?.[0] || 'U'}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-gray-900 dark:text-white mr-2">
                        {comment.author?.full_name || 'User'}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                          authorRole === 'SUPER_ADMIN'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                            : authorRole === 'STAFF'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {authorRole}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isNote && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md">
                        <Lock className="w-3 h-3" /> Internal Staff Note
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatToIST(comment.created_at)}
                    </span>
                  </div>
                </div>

                {/* Comment Body */}
                <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">
                  {comment.content}
                </p>

                {/* Attached Files */}
                {comment.attachments && comment.attachments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200/50 dark:border-navy-800/80 flex flex-wrap gap-2">
                    {comment.attachments.map((att) => (
                      <button
                        key={att.id}
                        type="button"
                        onClick={() => handleDownloadAttachment(att)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 hover:border-coral-500 text-xs text-gray-700 dark:text-gray-300 transition-colors shadow-sm"
                      >
                        {renderFileIcon(att.mime_type)}
                        <span className="max-w-[140px] truncate">{att.file_name}</span>
                        <span className="text-[10px] text-gray-400">
                          ({(att.file_size / 1024).toFixed(0)} KB)
                        </span>
                        <Download className="w-3.5 h-3.5 text-gray-400 hover:text-coral-500" />
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
        <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200 dark:border-navy-800 bg-gray-50/50 dark:bg-navy-950/60">
          {/* Internal Note Toggle (Staff Only) */}
          {isStaffOrAdmin && (
            <div className="flex items-center gap-4 mb-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={!isInternal}
                  onChange={() => setIsInternal(false)}
                  className="text-coral-500 focus:ring-coral-400"
                />
                <span>Public Response (Visible to Student)</span>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  checked={isInternal}
                  onChange={() => setIsInternal(true)}
                  className="text-amber-500 focus:ring-amber-400"
                />
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Staff Internal Note
                </span>
              </label>
            </div>
          )}

          {/* Text Area */}
          <textarea
            rows="3"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              isInternal
                ? 'Write a private note for department staff...'
                : 'Type your message or response...'
            }
            className={`w-full p-3 text-sm rounded-xl border ${
              isInternal
                ? 'border-amber-500/50 focus:border-amber-500 focus:ring-amber-400 bg-amber-50/20 dark:bg-amber-950/20'
                : 'border-gray-200 dark:border-navy-800 focus:border-coral-500 focus:ring-coral-400 bg-white dark:bg-navy-900'
            } text-gray-900 dark:text-white placeholder-gray-400 outline-none transition-all resize-none`}
          />

          {/* Selected File Previews */}
          {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {selectedFiles.map((file, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-200 dark:bg-navy-800 text-xs text-gray-800 dark:text-gray-200"
                >
                  <Paperclip className="w-3 h-3 text-coral-500" />
                  <span className="max-w-[120px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="p-0.5 hover:text-red-500 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Action Row */}
          <div className="flex items-center justify-between mt-3 pt-2">
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-navy-800 cursor-pointer transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5 text-coral-500" />
                <span>Attach Files (Max 3, 5MB)</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
                isInternal
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-coral-500 hover:bg-coral-600'
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
        <div className="p-4 bg-gray-100 dark:bg-navy-950 text-center text-xs text-gray-500 dark:text-gray-400">
          This ticket is closed. Reopen the ticket to continue the discussion.
        </div>
      )}
    </div>
  );
}
