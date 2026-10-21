import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Ticket,
  ArrowLeft,
  Building,
  Upload,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  File,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Bot,
} from 'lucide-react';
import toast from 'react-hot-toast';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 3;
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'docx'];

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  // Prefilled AI draft support
  const prefillData = location.state?.prefilled || null;
  const isAiPrefilled = Boolean(prefillData || location.state?.aiAssisted);

  // Form Fields
  const [title, setTitle] = useState(prefillData?.title || '');
  const [description, setDescription] = useState(prefillData?.description || '');
  const [categoryId, setCategoryId] = useState(prefillData?.categoryId || '');
  const [priority, setPriority] = useState(prefillData?.priority || 'Medium');
  const [tagsInput, setTagsInput] = useState(
    Array.isArray(prefillData?.tags) ? prefillData.tags.join(', ') : ''
  );
  const [isConfidential, setIsConfidential] = useState(false);

  // Attachments
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  // Field-level Errors
  const [errors, setErrors] = useState({});

  // Dynamic Metadata
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await api.get('/tickets/meta/categories');
        const cats = res?.data?.data || [];
        setCategories(cats);
        // If not already set by AI prefill or selection, choose first
        if (cats.length > 0 && !categoryId) {
          const matched = prefillData?.categoryId
            ? cats.find((c) => c.id === prefillData.categoryId)
            : null;
          setCategoryId(matched ? matched.id : cats[0].id);
        }
      } catch {
        toast.error('Failed to load categories');
      } finally {
        setCategoriesLoading(false);
      }
    }
    loadCategories();
  }, [prefillData]);

  const selectedCategory = categories.find((c) => c.id === categoryId);

  // Validate form
  const validate = () => {
    const errs = {};
    if (!title.trim()) {
      errs.title = 'Title is required.';
    } else if (title.trim().length < 3) {
      errs.title = 'Title must be at least 3 characters.';
    }

    if (!description.trim()) {
      errs.description = 'Description is required.';
    } else if (description.trim().length < 5) {
      errs.description = 'Description must be at least 5 characters.';
    }

    if (!categoryId) {
      errs.categoryId = 'Please select a ticket category.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Handle file additions
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (selectedFiles.length + files.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} attachments allowed.`);
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

  // TanStack Mutation for ticket creation
  const createMutation = useMutation({
    mutationFn: async () => {
      // 1. Create base ticket
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const ticketRes = await api.post('/tickets', {
        title: title.trim(),
        description: description.trim(),
        categoryId,
        priority,
        tags,
        isConfidential,
      });

      const newTicket = ticketRes.data.data;

      // 2. Upload attachments if present
      if (selectedFiles.length > 0 && newTicket?.id) {
        const formData = new FormData();
        selectedFiles.forEach((f) => formData.append('files', f));
        await api.post(`/tickets/${newTicket.id}/attachments`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      return newTicket;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['student-dashboard-stats'] });
      toast.success(`Ticket #${data.ticket_number} created successfully!`);
      navigate(`/tickets/${data.id}`);
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Failed to raise ticket.';
      toast.error(msg);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      createMutation.mutate();
    }
  };

  const renderFileIcon = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      return <ImageIcon className="w-4 h-4 text-sky-500" />;
    }
    if (ext === 'pdf') {
      return <FileText className="w-4 h-4 text-rose-500" />;
    }
    return <File className="w-4 h-4 text-emerald-500" />;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn pb-12">
      {/* Back button */}
      <div>
        <Link
          to="/tickets"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-coral-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tickets</span>
        </Link>
      </div>

      {/* Main Card */}
      <div className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="p-6 sm:p-8 border-b border-gray-200 dark:border-navy-800 bg-gray-50/60 dark:bg-navy-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-navy-900 to-coral-500 flex items-center justify-center text-white shadow-md">
              <Ticket className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                Raise Support Ticket
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Submit an official inquiry to college administration or academic departments
              </p>
            </div>
          </div>

          {/* AI Pre-fill Notice Banner */}
          {isAiPrefilled && (
            <div className="mt-4 p-4 rounded-2xl bg-coral-500/10 border border-coral-500/20 flex items-start gap-3 text-xs text-coral-700 dark:text-coral-300 animate-fadeIn">
              <Bot className="w-5 h-5 text-coral-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold flex items-center gap-1.5">
                  Prefilled by SmartDesk AI Assistant
                  <span className="px-1.5 py-0.5 rounded bg-coral-500/20 text-[10px] uppercase font-bold text-coral-600 dark:text-coral-300">
                    Draft Review
                  </span>
                </p>
                <p className="mt-1 text-gray-600 dark:text-gray-400">
                  The AI assistant proposed this ticket category, department routing, and description based on your inquiry.
                  Deterministic server rules require your explicit review and submission. Feel free to adjust any fields.
                </p>
                {prefillData?.suggestedDepartment && (
                  <p className="mt-1 font-semibold text-coral-600 dark:text-coral-400">
                    Routing to Department: {prefillData.suggestedDepartment}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
          {/* Category Selector with Automatic Department Routing Notice */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Query Category <span className="text-coral-500">*</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setErrors((prev) => ({ ...prev, categoryId: undefined }));
              }}
              disabled={categoriesLoading}
              className={`w-full px-4 py-3 rounded-xl border ${
                errors.categoryId
                  ? 'border-rose-500 focus:ring-rose-400'
                  : 'border-gray-200 dark:border-navy-800 focus:border-coral-500 focus:ring-coral-400'
              } bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm outline-none transition-all`}
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.code})
                </option>
              ))}
            </select>
            {errors.categoryId && (
              <p className="text-xs text-rose-500 font-medium">{errors.categoryId}</p>
            )}

            {/* Department Routing Preview */}
            {selectedCategory && (
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-navy-950/60 border border-blue-200/50 dark:border-navy-800 flex items-center gap-2.5 text-xs text-blue-700 dark:text-blue-300">
                <Building className="w-4 h-4 text-blue-500 shrink-0" />
                <span>
                  Automatically routed to responsible department based on category. Academic records remain associated with your branch.
                </span>
              </div>
            )}
          </div>

          {/* Ticket Title */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Subject / Title <span className="text-coral-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              placeholder="e.g. Tuition fee payment receipt not updating in ERP"
              className={`w-full px-4 py-3 rounded-xl border ${
                errors.title
                  ? 'border-rose-500 focus:ring-rose-400'
                  : 'border-gray-200 dark:border-navy-800 focus:border-coral-500 focus:ring-coral-400'
              } bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm outline-none transition-all`}
            />
            {errors.title && (
              <p className="text-xs text-rose-500 font-medium">{errors.title}</p>
            )}
          </div>

          {/* Detailed Description */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Detailed Description <span className="text-coral-500">*</span>
            </label>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setErrors((prev) => ({ ...prev, description: undefined }));
              }}
              placeholder="Provide exact details: transaction IDs, course codes, dates, or error messages encountered..."
              className={`w-full p-4 rounded-xl border ${
                errors.description
                  ? 'border-rose-500 focus:ring-rose-400'
                  : 'border-gray-200 dark:border-navy-800 focus:border-coral-500 focus:ring-coral-400'
              } bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm outline-none transition-all resize-y`}
            />
            {errors.description && (
              <p className="text-xs text-rose-500 font-medium">{errors.description}</p>
            )}
          </div>

          {/* Priority & Tags Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Priority */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-800 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm outline-none focus:border-coral-500 transition-all"
              >
                <option value="Low">Low (Standard inquiry)</option>
                <option value="Medium">Medium (Normal priority)</option>
                <option value="High">High (Impacting coursework / deadlines)</option>
                <option value="Urgent">Urgent (Immediate institutional concern)</option>
              </select>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Tags (Comma Separated)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. fee, portal, spring2026"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-navy-800 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm outline-none focus:border-coral-500 transition-all"
              >
              </input>
            </div>
          </div>

          {/* Confidentiality Option */}
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-navy-950/70 border border-gray-200 dark:border-navy-800 flex items-start gap-3">
            <input
              type="checkbox"
              id="confidential-check"
              checked={isConfidential}
              onChange={(e) => setIsConfidential(e.target.checked)}
              className="mt-1 w-4 h-4 text-coral-500 rounded focus:ring-coral-400 cursor-pointer"
            />
            <label htmlFor="confidential-check" className="cursor-pointer space-y-0.5">
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                Mark as Confidential Grievance
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Restricts visibility exclusively to the designated College Grievance Officer and Super Administrators.
              </span>
            </label>
          </div>

          {/* Attachments Section */}
          <div className="space-y-3 pt-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Supporting Attachments (Max 3, 5 MB each)
            </label>

            {/* Dropzone Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="p-6 rounded-2xl border-2 border-dashed border-gray-200 dark:border-navy-800 hover:border-coral-500/80 bg-gray-50/50 dark:bg-navy-950/40 text-center cursor-pointer transition-all group"
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.docx"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-gray-400 group-hover:text-coral-500 mx-auto mb-2 transition-colors" />
              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                Click to browse or drag and drop files here
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Supported formats: PDF, DOCX, JPEG, PNG, WEBP (up to 5 MB per file)
              </p>
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2.5 pt-1">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gray-100 dark:bg-navy-800 border border-gray-200 dark:border-navy-700 text-xs text-gray-800 dark:text-gray-200 shadow-sm"
                  >
                    {renderFileIcon(file.name)}
                    <span className="max-w-[140px] truncate font-medium">{file.name}</span>
                    <span className="text-[10px] text-gray-400">
                      ({(file.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="p-0.5 hover:text-rose-500 rounded transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-navy-800">
            <button
              type="button"
              onClick={() => navigate('/tickets')}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-coral-500 hover:bg-coral-600 disabled:opacity-50 shadow-lg shadow-coral-500/25 transition-transform hover:-translate-y-0.5"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              <span>{createMutation.isPending ? 'Submitting Ticket...' : 'Submit Support Ticket'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
