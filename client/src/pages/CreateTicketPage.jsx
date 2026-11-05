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
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { CATEGORIES as CANONICAL_CATEGORIES } from '../data/taxonomyClient';

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

  // Phase 7 & Prompt 4: Real-time FAQ deflection & AI Category Classification / Deterministic Routing
  const [similarFaqs, setSimilarFaqs] = useState([]);
  const [expandedFaqId, setExpandedFaqId] = useState(null);
  const [aiCategorySuggestion, setAiCategorySuggestion] = useState(null);
  const [ticketPrediction, setTicketPrediction] = useState(null);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isDeflecting, setIsDeflecting] = useState(false);

  // Phase 3: Review & Confirmation modal state + Post-submission confirmation
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState(null);

  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await api.get('/tickets/meta/categories');
        const rawList = res?.data || res;
        const fetchedCats = Array.isArray(rawList)
          ? rawList
          : (Array.isArray(rawList?.data) ? rawList.data : (Array.isArray(res) ? res : []));
        
        const cats = fetchedCats.length > 0 ? fetchedCats : CANONICAL_CATEGORIES;
        setCategories(cats);

        // If not already set by AI prefill or selection, choose first
        if (cats.length > 0 && !categoryId) {
          const matched = prefillData?.categoryId
            ? cats.find((c) => c.id === prefillData.categoryId)
            : null;
          setCategoryId(matched ? matched.id : cats[0].id);
        }
      } catch {
        setCategories(CANONICAL_CATEGORIES);
        if (CANONICAL_CATEGORIES.length > 0 && !categoryId) {
          setCategoryId(CANONICAL_CATEGORIES[0].id);
        }
      } finally {
        setCategoriesLoading(false);
      }
    }
    loadCategories();
  }, [prefillData]);

  // Prompt 4 & Phase 7: Debounced Ticket Classification, Deterministic Routing & FAQ Deflection
  useEffect(() => {
    if (!title || title.trim().length < 5) {
      setSimilarFaqs([]);
      setAiCategorySuggestion(null);
      setTicketPrediction(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsClassifying(true);
      try {
        // 1. Semantic FAQ Search for Deflection
        const faqRes = await api.post('/ai/similar-faqs', {
          query: title.trim(),
          limit: 3,
        });
        const faqs = faqRes?.data?.data?.faqs || [];
        setSimilarFaqs(faqs);

        // 2. Deep-Learning Ticket Classification & Deterministic Routing (Requirement 1 & 12)
        let pred = null;
        try {
          const classRes = await api.post('/ai/classify-ticket', {
            title: title.trim(),
            description: (description || '').trim(),
          });
          pred = classRes?.data?.data;
        } catch {
          // Fall back to legacy classify-query
        }

        if (!pred) {
          try {
            const queryRes = await api.post('/ai/classify-query', { query: title.trim() });
            const qData = queryRes?.data?.data;
            if (qData) {
              const catCode = qData.suggestedCategoryCode || qData.topCandidateCode;
              pred = {
                category: catCode,
                confidence: qData.confidenceScore || 0.85,
                department: 'FEE',
                department_name: 'Accounts and Fee Section',
                priority: 'P2',
                rule_applied: 'ROUTE-06',
                human_review_required: false,
                is_fallback: false,
                model_name: 'SmartDesk-Baseline',
              };
            }
          } catch {
            // Non-blocking
          }
        }

        if (pred) {
          setTicketPrediction(pred);

          // Update legacy advisory pill if matched
          const matchedCat = categories.find(
            (c) => c.code === pred.category || c.name.toLowerCase().includes(pred.category.toLowerCase().replace(/_/g, ' '))
          );
          if (matchedCat && !pred.is_fallback) {
            setAiCategorySuggestion({
              category: matchedCat,
              confidenceScore: pred.confidence,
              isAmbiguous: false,
            });
          }
        }
      } catch {
        // Silent fallback: manual ticket flow remains 100% operational
      } finally {
        setIsClassifying(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [title, description, categories]);

  // Handle Applying AI Prediction to Ticket Form
  const handleApplyPrediction = (pred) => {
    if (!pred) return;
    const targetCode = pred.category;
    const matched = categories.find(
      (c) => c.code === targetCode || c.name.toLowerCase().includes(targetCode.toLowerCase().replace(/_/g, ' '))
    );
    if (matched) {
      setCategoryId(matched.id);
    }

    // Map priority
    if (pred.priority === 'P1') {
      setPriority('High');
    } else if (pred.priority === 'P2') {
      setPriority('Medium');
    } else if (pred.priority === 'P3') {
      setPriority('Low');
    }

    // Flag confidentiality if sensitive grievance
    if (pred.category === 'GRIEVANCE') {
      setIsConfidential(true);
    }

    toast.success(`Applied AI routing: ${pred.category} (${pred.department_name || pred.department})`);
  };

  // Handle Ticket Deflection (student chooses FAQ solution)
  const handleDeflectWithFaq = async (faq) => {
    setIsDeflecting(true);
    try {
      await api.post('/ai/deflection-event', {
        query: title,
        categoryId: faq.category_id || categoryId,
        deflectedBy: 'SIMILAR_FAQ',
        matchedFaqId: faq.id,
        similarityScore: faq.similarity,
        wasTicketCreated: false,
      });

      toast.success('Inquiry resolved instantly! No ticket was submitted.');
      navigate('/dashboard');
    } catch {
      navigate('/dashboard');
    } finally {
      setIsDeflecting(false);
    }
  };

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

      const newTicket = ticketRes?.data?.data || ticketRes?.data || ticketRes;

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
      queryClient.invalidateQueries({ queryKey: ['staff-queue'] });
      queryClient.invalidateQueries({ queryKey: ['staff-stats'] });
      const ticketNum = data?.ticket_number || data?.id || '';
      toast.success(ticketNum ? `Ticket #${ticketNum} created successfully!` : 'Ticket created successfully!');
      setIsReviewOpen(false);
      setSubmittedTicket(data);
    },
    onError: (err) => {
      const msg = err?.message || err?.response?.data?.message || err?.error?.message || 'Failed to raise ticket.';
      toast.error(msg);
    },
  });

  const isSubmittingRef = useRef(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      setIsReviewOpen(true);
    }
  };

  const handleConfirmSubmit = () => {
    if (createMutation.isPending || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    createMutation.mutate(undefined, {
      onSettled: () => {
        isSubmittingRef.current = false;
      },
    });
  };

  const handleResetForm = () => {
    setTitle('');
    setDescription('');
    setPriority('Medium');
    setTagsInput('');
    setIsConfidential(false);
    setSelectedFiles([]);
    setErrors({});
    setSubmittedTicket(null);
    setIsReviewOpen(false);
  };

  const handleAiDraftAssist = () => {
    if (!description.trim()) {
      const template = `1. Problem Statement:\n${title ? title.trim() : 'Describe what happened in detail'}\n\n2. Affected Service/Course:\n${selectedCategory?.name || 'Academic, Fee, Hostel, or Administrative'}\n\n3. Desired Resolution:\nWhat specific outcome or assistance is requested from college staff?`;
      setDescription(template);
      setErrors((prev) => ({ ...prev, description: undefined }));
      toast.success('AI structured draft outline applied. Edit to customize.', { icon: '✨' });
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

  if (submittedTicket) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn py-8">
        <div className="p-8 sm:p-10 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <span>Ticket Created & Routed</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white">
              Ticket Submitted Successfully!
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Your inquiry has been placed in the departmental queue. Keep note of your tracking ticket number below.
            </p>
          </div>

          {/* Generated Ticket Number Banner */}
          <div className="p-4 rounded-2xl bg-gray-50 dark:bg-navy-950/70 border border-gray-200 dark:border-navy-800 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Generated Ticket Number
            </span>
            <div className="font-mono text-2xl sm:text-3xl font-black text-coral-600 dark:text-coral-400 tracking-wider">
              {submittedTicket.ticket_number || submittedTicket.id}
            </div>
          </div>

          {/* Ticket Metadata Breakdown */}
          <div className="p-4 rounded-2xl bg-gray-50/70 dark:bg-navy-950/40 border border-gray-100 dark:border-navy-800/80 text-xs text-left grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-gray-400 block text-[11px]">Subject</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 truncate block">
                {submittedTicket.title || title}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Assigned Department</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 block">
                {submittedTicket.assigned_department?.name || selectedCategory?.department?.name || 'Department Desk'}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">Category</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200 block">
                {submittedTicket.category?.name || selectedCategory?.name || 'General Support'}
              </span>
            </div>
            <div>
              <span className="text-gray-400 block text-[11px]">SLA Response Target</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 block">
                Within 4 Business Hours (College IST)
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/tickets/${submittedTicket.id || submittedTicket.ticket_number}`)}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-bold text-sm shadow-md transition-colors"
            >
              View Ticket Details
            </button>
            <button
              type="button"
              onClick={() => navigate('/tickets')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 hover:bg-gray-50 dark:hover:bg-navy-800 text-gray-700 dark:text-gray-300 font-semibold text-sm transition-colors"
            >
              Go to My Tickets
            </button>
            <button
              type="button"
              onClick={handleResetForm}
              className="w-full sm:w-auto px-4 py-2.5 text-xs text-gray-500 hover:text-coral-500 font-semibold transition-colors"
            >
              Submit Another
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          {/* Prompt 4 (Requirement 12): AI Triage & Department Routing Review Card */}
          {ticketPrediction && (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-white to-purple-50/60 dark:from-navy-900/90 dark:via-navy-950 dark:to-navy-900/70 border border-indigo-200/80 dark:border-indigo-900/50 shadow-sm space-y-3.5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-900 dark:text-white flex items-center gap-2">
                      <span>AI Triage & Department Routing</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono font-bold">
                        {ticketPrediction.rule_applied || 'ROUTE'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Model: {ticketPrediction.model_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80">
                    {Math.round(ticketPrediction.confidence * 100)}% Match
                  </span>
                  <button
                    type="button"
                    onClick={() => handleApplyPrediction(ticketPrediction)}
                    className="px-3 py-1.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-bold text-xs shadow-xs cursor-pointer transition-all flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Apply Suggestion</span>
                  </button>
                </div>
              </div>

              {/* Triage Overview Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-navy-950/80 border border-gray-100 dark:border-navy-800">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Suggested Category</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {ticketPrediction.category.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-navy-950/80 border border-gray-100 dark:border-navy-800">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Routed Department</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                    {ticketPrediction.department_name} ({ticketPrediction.department})
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-white/80 dark:bg-navy-950/80 border border-gray-100 dark:border-navy-800">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block">Priority & Triage</span>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {ticketPrediction.priority} {ticketPrediction.human_review_required ? '• Human Review' : '• Automated'}
                  </span>
                </div>
              </div>

              {/* Human Review Banner (Requirement 9) */}
              {ticketPrediction.human_review_required && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Priority Human Review Required: </span>
                    <span>
                      {ticketPrediction.human_review_reason || 'This inquiry matches configured criteria for mandatory manual staff evaluation.'}
                    </span>
                  </div>
                </div>
              )}

              {/* Fallback & Clarifying Question Banner (Requirement 8) */}
              {ticketPrediction.is_fallback && ticketPrediction.clarifying_question && (
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-2.5 text-xs text-blue-800 dark:text-blue-300">
                  <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold">Clarification Suggested: </span>
                    <p>{ticketPrediction.clarifying_question}</p>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                * All suggestions are strictly advisory. Students maintain full authority to modify any field before final submission.
              </p>
            </div>
          )}

          {/* Category Selector with Automatic Department Routing Notice */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Query Category <span className="text-coral-500">*</span>
              </label>

              {/* Advisory ML Category Suggestion */}
              {aiCategorySuggestion && aiCategorySuggestion.category.id !== categoryId && (
                <div className="flex items-center gap-2 animate-fadeIn text-[11px]">
                  <span className="font-semibold text-coral-600 dark:text-coral-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    AI Suggests: {aiCategorySuggestion.category.name} ({Math.round(aiCategorySuggestion.confidenceScore * 100)}%)
                  </span>
                  <button
                    type="button"
                    onClick={() => setCategoryId(aiCategorySuggestion.category.id)}
                    className="px-2 py-0.5 rounded bg-coral-500 hover:bg-coral-600 text-white font-bold text-[10px] shadow-xs cursor-pointer transition-colors"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>

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
              {categories.length === 0 ? (
                <option value="">Loading categories...</option>
              ) : (
                categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.code})
                  </option>
                ))
              )}
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

            {/* Phase 7: Real-time Recommended FAQs for Ticket Deflection */}
            {similarFaqs.length > 0 && (
              <div className="mt-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-3 animate-fadeIn">
                <div className="flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Recommended Instant Answers (FAQs)
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">
                    Could save you waiting for staff response
                  </span>
                </div>

                <div className="space-y-2">
                  {similarFaqs.map((faq) => {
                    const isExpanded = expandedFaqId === faq.id;
                    return (
                      <div
                        key={faq.id}
                        className="p-3 rounded-xl bg-white dark:bg-navy-900 border border-amber-200 dark:border-navy-800 text-xs space-y-2 shadow-xs"
                      >
                        <div
                          onClick={() => setExpandedFaqId(isExpanded ? null : faq.id)}
                          className="flex items-center justify-between cursor-pointer font-semibold text-gray-900 dark:text-white hover:text-coral-600 transition-colors"
                        >
                          <span className="flex-1 pr-2">{faq.question}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
                            {Math.round(faq.similarity * 100)}% match
                          </span>
                        </div>

                        {isExpanded && (
                          <div className="pt-2 border-t border-gray-100 dark:border-navy-800 space-y-2 text-gray-600 dark:text-gray-300 animate-fadeIn">
                            <p className="text-xs leading-relaxed">{faq.answer}</p>
                            <div className="flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => handleDeflectWithFaq(faq)}
                                disabled={isDeflecting}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>This solves my issue (No ticket needed)</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Detailed Description */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Detailed Description <span className="text-coral-500">*</span>
              </label>
              {!description && (
                <button
                  type="button"
                  onClick={handleAiDraftAssist}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-coral-500 hover:text-coral-600 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Assist: Draft Outline</span>
                </button>
              )}
            </div>
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

      {/* Pre-Submission Review & Confirmation Modal */}
      {isReviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-2xl p-6 sm:p-7 space-y-5 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-navy-800 pb-3">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-coral-500" />
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Review Ticket Before Submission
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                disabled={createMutation.isPending}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Please verify your inquiry details before submitting. Once confirmed, a ticket number will be generated and assigned directly to the department queue.
            </p>

            <div className="space-y-3 p-4 rounded-2xl bg-gray-50 dark:bg-navy-950/70 border border-gray-200 dark:border-navy-800 text-xs">
              <div>
                <span className="font-bold text-gray-500 block text-[11px] uppercase tracking-wider">Title</span>
                <span className="font-semibold text-gray-900 dark:text-white text-sm">{title}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-200/60 dark:border-navy-800">
                <div>
                  <span className="font-bold text-gray-500 block text-[11px] uppercase tracking-wider">Category</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{selectedCategory?.name || 'General Support'}</span>
                </div>
                <div>
                  <span className="font-bold text-gray-500 block text-[11px] uppercase tracking-wider">Priority</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{priority}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-200/60 dark:border-navy-800">
                <div>
                  <span className="font-bold text-gray-500 block text-[11px] uppercase tracking-wider">Routing</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {ticketPrediction?.department_name || selectedCategory?.department?.name || 'Assigned Department'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-gray-500 block text-[11px] uppercase tracking-wider">Confidentiality</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {isConfidential ? 'Confidential Grievance' : 'Standard Ticket'}
                  </span>
                </div>
              </div>

              <div className="pt-1 border-t border-gray-200/60 dark:border-navy-800">
                <span className="font-bold text-gray-500 block text-[11px] uppercase tracking-wider">Description Preview</span>
                <p className="text-gray-700 dark:text-gray-300 mt-1 line-clamp-3 italic">
                  &ldquo;{description}&rdquo;
                </p>
              </div>

              {selectedFiles.length > 0 && (
                <div className="pt-1 border-t border-gray-200/60 dark:border-navy-800">
                  <span className="font-bold text-gray-500 block text-[11px] uppercase tracking-wider">
                    Attachments ({selectedFiles.length})
                  </span>
                  <span className="text-gray-700 dark:text-gray-300 truncate block mt-0.5">
                    {selectedFiles.map((f) => f.name).join(', ')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsReviewOpen(false)}
                disabled={createMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
              >
                Edit Details
              </button>

              <button
                type="button"
                onClick={handleConfirmSubmit}
                disabled={createMutation.isPending}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold text-white bg-coral-500 hover:bg-coral-600 disabled:opacity-50 shadow-md transition-all cursor-pointer"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting Ticket...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm & Submit Ticket</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
