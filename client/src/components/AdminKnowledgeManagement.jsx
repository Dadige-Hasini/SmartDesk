import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import api from '../api/client';
import {
  BookOpen,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  RefreshCw,
  Search,
  Eye,
  Edit3,
  Archive,
  Plus,
  Layers,
  Sparkles,
  ShieldCheck,
  Check,
  Building,
  Tag,
  Loader2,
  Calendar,
} from 'lucide-react';
import { formatToIST } from '../utils/date';

export default function AdminKnowledgeManagement() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState('faqs'); // 'faqs' | 'documents'

  // FAQs state
  const [faqStatusFilter, setFaqStatusFilter] = useState('');
  const [faqSearch, setFaqSearch] = useState('');
  const [editingFaq, setEditingFaq] = useState(null);
  const [editForm, setEditForm] = useState({
    question: '',
    answer: '',
    keywords: '',
    visibility: 'PUBLIC',
  });

  // Document state
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    description: '',
    departmentId: '',
    categoryId: '',
    autoApprove: true,
  });
  const [uploadFile, setUploadFile] = useState(null);

  const [reindexDoc, setReindexDoc] = useState(null);
  const [reindexFile, setReindexFile] = useState(null);

  // 1. Fetch Admin FAQs
  const {
    data: faqsData,
    isLoading: faqsLoading,
    refetch: refetchFaqs,
  } = useQuery({
    queryKey: ['admin-faqs', faqStatusFilter, faqSearch],
    queryFn: async () => {
      const params = {};
      if (faqStatusFilter) params.status = faqStatusFilter;
      if (faqSearch.trim()) params.search = faqSearch.trim();
      const res = await api.get('/faqs/admin/list', { params });
      return res.data || [];
    },
  });

  const faqs = Array.isArray(faqsData) ? faqsData : [];

  // 2. Fetch Knowledge Documents
  const {
    data: docsData,
    isLoading: docsLoading,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ['admin-docs'],
    queryFn: async () => {
      const res = await api.get('/ai/documents');
      return res.data || [];
    },
  });

  const documents = Array.isArray(docsData) ? docsData : [];

  // Mutations for FAQs
  const approveFaqMutation = useMutation({
    mutationFn: async (faqId) => {
      return await api.post(`/faqs/${faqId}/approve`);
    },
    onSuccess: () => {
      toast.success('FAQ approved, published, and vector indexed for AI deflection!');
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
      queryClient.invalidateQueries({ queryKey: ['public-faqs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to approve FAQ'),
  });

  const updateFaqMutation = useMutation({
    mutationFn: async ({ faqId, updates }) => {
      return await api.patch(`/faqs/${faqId}`, updates);
    },
    onSuccess: () => {
      toast.success('FAQ updated and re-indexed to new version!');
      setEditingFaq(null);
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
      queryClient.invalidateQueries({ queryKey: ['public-faqs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to update FAQ'),
  });

  const retireFaqMutation = useMutation({
    mutationFn: async (faqId) => {
      return await api.post(`/faqs/${faqId}/retire`);
    },
    onSuccess: () => {
      toast.success('FAQ retired and invalidated from public display & AI retrieval!');
      queryClient.invalidateQueries({ queryKey: ['admin-faqs'] });
      queryClient.invalidateQueries({ queryKey: ['public-faqs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to retire FAQ'),
  });

  // Mutations for Knowledge Documents
  const approveDocMutation = useMutation({
    mutationFn: async (docId) => {
      return await api.put(`/ai/documents/${docId}/approve`);
    },
    onSuccess: () => {
      toast.success('Knowledge document approved for grounded AI responses!');
      queryClient.invalidateQueries({ queryKey: ['admin-docs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to approve document'),
  });

  const retireDocMutation = useMutation({
    mutationFn: async (docId) => {
      return await api.post(`/ai/documents/${docId}/retire`);
    },
    onSuccess: () => {
      toast.success('Document retired! Outdated chunks invalidated from RAG pipeline.');
      queryClient.invalidateQueries({ queryKey: ['admin-docs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to retire document'),
  });

  const uploadDocMutation = useMutation({
    mutationFn: async (formData) => {
      return await api.post('/ai/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Document uploaded, parsed into chunks, and vector embedded!');
      setUploadModalOpen(false);
      setUploadFile(null);
      queryClient.invalidateQueries({ queryKey: ['admin-docs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to upload document'),
  });

  const reindexDocMutation = useMutation({
    mutationFn: async ({ docId, formData }) => {
      return await api.post(`/ai/documents/${docId}/reindex`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Document re-indexed to new version! Old chunks purged.');
      setReindexDoc(null);
      setReindexFile(null);
      queryClient.invalidateQueries({ queryKey: ['admin-docs'] });
    },
    onError: (err) => toast.error(err.message || 'Failed to re-index document'),
  });

  const handleEditClick = (faq) => {
    setEditingFaq(faq);
    setEditForm({
      question: faq.question || '',
      answer: faq.answer || '',
      keywords: Array.isArray(faq.keywords) ? faq.keywords.join(', ') : '',
      visibility: faq.visibility || 'PUBLIC',
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (!editingFaq) return;
    const keywordsArray = editForm.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    updateFaqMutation.mutate({
      faqId: editingFaq.id,
      updates: {
        question: editForm.question.trim(),
        answer: editForm.answer.trim(),
        keywords: keywordsArray,
        visibility: editForm.visibility,
      },
    });
  };

  const handleUploadSubmit = (e) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.error('Please select a PDF, DOCX, or text file');
      return;
    }
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', uploadForm.title);
    formData.append('description', uploadForm.description);
    if (uploadForm.departmentId) formData.append('departmentId', uploadForm.departmentId);
    if (uploadForm.categoryId) formData.append('categoryId', uploadForm.categoryId);
    formData.append('autoApprove', uploadForm.autoApprove);

    uploadDocMutation.mutate(formData);
  };

  const handleReindexSubmit = (e) => {
    e.preventDefault();
    if (!reindexDoc) return;
    const formData = new FormData();
    if (reindexFile) formData.append('file', reindexFile);
    formData.append('title', reindexDoc.title);

    reindexDocMutation.mutate({ docId: reindexDoc.id, formData });
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation pills */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveSection('faqs')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSection === 'faqs'
                ? 'bg-coral-500 text-white shadow-md'
                : 'bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-navy-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>FAQs & Staff Drafts ({faqs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('documents')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${
              activeSection === 'documents'
                ? 'bg-coral-500 text-white shadow-md'
                : 'bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-navy-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Knowledge Documents ({documents.length})</span>
          </button>
        </div>

        {activeSection === 'documents' && (
          <button
            type="button"
            onClick={() => setUploadModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs sm:text-sm font-semibold shadow-md transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>Ingest Document</span>
          </button>
        )}
      </div>

      {/* SECTION 1: FAQS MANAGEMENT */}
      {activeSection === 'faqs' && (
        <div className="space-y-4">
          {/* Filters & Search Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800">
            <div className="relative flex-1 w-full max-w-sm">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={faqSearch}
                onChange={(e) => setFaqSearch(e.target.value)}
                placeholder="Search FAQs by question or answer..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-navy-800 bg-gray-50 dark:bg-navy-950 text-xs text-gray-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
              {['', 'DRAFT', 'PUBLISHED', 'RETIRED'].map((st) => (
                <button
                  key={st || 'ALL'}
                  onClick={() => setFaqStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    faqStatusFilter === st
                      ? 'bg-navy-900 text-white dark:bg-coral-500'
                      : 'bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-navy-700'
                  }`}
                >
                  {st ? (st === 'DRAFT' ? 'Pending Drafts' : st) : 'All Statuses'}
                </button>
              ))}
            </div>
          </div>

          {/* FAQs List Table */}
          {faqsLoading ? (
            <div className="p-12 text-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-coral-500" />
              <p className="text-xs">Loading FAQ knowledge entries...</p>
            </div>
          ) : faqs.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 text-gray-500">
              No FAQs found matching filter.
            </div>
          ) : (
            <div className="bg-white dark:bg-navy-900 rounded-2xl border border-gray-200 dark:border-navy-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600 dark:text-gray-300">
                  <thead className="bg-gray-50/80 dark:bg-navy-950 text-[11px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-200 dark:border-navy-800">
                    <tr>
                      <th className="py-3.5 px-4">Question & Solution</th>
                      <th className="py-3.5 px-3">Status</th>
                      <th className="py-3.5 px-3">Version</th>
                      <th className="py-3.5 px-3 text-center">Feedback</th>
                      <th className="py-3.5 px-4 text-right">Lifecycle Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-navy-800">
                    {faqs.map((faq) => {
                      const isDraft = faq.status === 'DRAFT';
                      const isPublished = faq.status === 'PUBLISHED';
                      const isRetired = faq.status === 'RETIRED';

                      return (
                        <tr
                          key={faq.id}
                          className="hover:bg-gray-50/60 dark:hover:bg-navy-800/40 transition-colors"
                        >
                          <td className="py-4 px-4 max-w-md">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-400">
                                {faq.category_code || 'General'}
                              </span>
                              {faq.source_ticket_id && (
                                <span className="text-[10px] text-indigo-500 font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                  From Ticket #{faq.source_ticket_id.slice(0, 8)}
                                </span>
                              )}
                              <span className="text-[10px] text-gray-400">
                                {faq.visibility || 'PUBLIC'}
                              </span>
                            </div>
                            <h4 className="font-bold text-gray-900 dark:text-white line-clamp-1 mb-0.5">
                              {faq.question}
                            </h4>
                            <p className="text-gray-500 dark:text-gray-400 line-clamp-2 text-[11px] leading-relaxed">
                              {faq.answer}
                            </p>
                          </td>

                          <td className="py-4 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                isDraft
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                  : isPublished
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                                  : 'bg-gray-100 text-gray-600 dark:bg-navy-800 dark:text-gray-400'
                              }`}
                            >
                              {isDraft && <AlertTriangle className="w-3 h-3" />}
                              {isPublished && <CheckCircle2 className="w-3 h-3" />}
                              {isRetired && <Archive className="w-3 h-3" />}
                              {faq.status}
                            </span>
                          </td>

                          <td className="py-4 px-3 whitespace-nowrap font-mono text-[11px]">
                            v{faq.version || 1}.0
                          </td>

                          <td className="py-4 px-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-2 text-[11px]">
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                +{faq.helpful_count || 0}
                              </span>
                              <span className="text-gray-400">/</span>
                              <span className="text-coral-500 font-bold">
                                -{faq.unhelpful_count || 0}
                              </span>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {/* Approve draft */}
                              {isDraft && (
                                <button
                                  type="button"
                                  onClick={() => approveFaqMutation.mutate(faq.id)}
                                  disabled={approveFaqMutation.isPending}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
                                  title="Approve and Publish to Knowledge Base"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Approve & Publish</span>
                                </button>
                              )}

                              {/* Edit FAQ */}
                              <button
                                type="button"
                                onClick={() => handleEditClick(faq)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-navy-800 text-gray-600 dark:text-gray-300 transition-colors"
                                title="Edit Question & Answer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              {/* Retire FAQ */}
                              {!isRetired && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Retiring this FAQ will immediately remove it from public search and AI deflection. Proceed?'
                                      )
                                    ) {
                                      retireFaqMutation.mutate(faq.id);
                                    }
                                  }}
                                  disabled={retireFaqMutation.isPending}
                                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 transition-colors"
                                  title="Retire FAQ (Invalidate from AI and public)"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: KNOWLEDGE BASE DOCUMENTS */}
      {activeSection === 'documents' && (
        <div className="space-y-4">
          {/* Overview Banner */}
          <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Authoritative Knowledge Base Grounding:</span> The AI
              assistant strictly cites approved, active document versions. Inactivating or retiring a
              document purges its chunks from similarity search to prevent citing outdated policies.
            </div>
          </div>

          {/* Documents Table */}
          {docsLoading ? (
            <div className="p-12 text-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-coral-500" />
              <p className="text-xs">Loading institutional documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 text-gray-500">
              No knowledge documents registered yet. Click "Ingest Document" to upload student handbooks
              or academic regulations.
            </div>
          ) : (
            <div className="bg-white dark:bg-navy-900 rounded-2xl border border-gray-200 dark:border-navy-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-600 dark:text-gray-300">
                  <thead className="bg-gray-50/80 dark:bg-navy-950 text-[11px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-200 dark:border-navy-800">
                    <tr>
                      <th className="py-3.5 px-4">Document Title</th>
                      <th className="py-3.5 px-3">Type & Version</th>
                      <th className="py-3.5 px-3">Chunks</th>
                      <th className="py-3.5 px-3">Visibility</th>
                      <th className="py-3.5 px-3">Lifecycle State</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-navy-800">
                    {documents.map((doc) => {
                      const isActive = doc.status === 'ACTIVE' && doc.is_active !== false;
                      const isApproved = doc.is_approved;

                      return (
                        <tr
                          key={doc.id}
                          className="hover:bg-gray-50/60 dark:hover:bg-navy-800/40 transition-colors"
                        >
                          <td className="py-4 px-4 max-w-sm">
                            <h4 className="font-bold text-gray-900 dark:text-white line-clamp-1 mb-0.5">
                              {doc.title}
                            </h4>
                            <p className="text-gray-400 text-[11px] line-clamp-1">
                              {doc.description || 'No description provided'}
                            </p>
                          </td>

                          <td className="py-4 px-3 whitespace-nowrap">
                            <span className="font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-navy-800 text-[11px] font-bold">
                              {doc.file_type || 'TXT'} v{doc.version || 1}.0
                            </span>
                          </td>

                          <td className="py-4 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                              <Layers className="w-3.5 h-3.5 text-coral-500" />
                              {doc.chunk_count || 12} indexed
                            </span>
                          </td>

                          <td className="py-4 px-3 whitespace-nowrap">
                            <span className="text-[11px] px-2 py-0.5 rounded bg-navy-100 dark:bg-navy-800 font-medium text-navy-800 dark:text-navy-300">
                              {doc.visibility || 'PUBLIC'}
                            </span>
                          </td>

                          <td className="py-4 px-3 whitespace-nowrap">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                                  isActive
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-red-500'
                                }`}
                              >
                                {isActive ? (
                                  <CheckCircle2 className="w-3 h-3" />
                                ) : (
                                  <XCircle className="w-3 h-3" />
                                )}
                                {doc.status || (isActive ? 'ACTIVE' : 'RETIRED')}
                              </span>
                              <span className="text-[10px] text-gray-400">
                                {isApproved ? 'Approved by Admin' : 'Pending Approval'}
                              </span>
                            </div>
                          </td>

                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {!isApproved && (
                                <button
                                  type="button"
                                  onClick={() => approveDocMutation.mutate(doc.id)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                                >
                                  Approve
                                </button>
                              )}

                              {/* Re-index button */}
                              <button
                                type="button"
                                onClick={() => setReindexDoc(doc)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-navy-800 hover:bg-gray-200 dark:hover:bg-navy-700 text-gray-700 dark:text-gray-300 text-xs font-semibold transition-colors"
                                title="Re-index document with new content or version bump"
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Re-index</span>
                              </button>

                              {/* Retire button */}
                              {isActive && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Retire "${doc.title}"? Chunks will be immediately purged from AI retrieval.`
                                      )
                                    ) {
                                      retireDocMutation.mutate(doc.id);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500 text-xs font-semibold transition-colors"
                                >
                                  Retire
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit FAQ Modal */}
      {editingFaq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
              Edit Knowledge Base FAQ (v{editingFaq.version || 1}.0)
            </h3>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Question *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.question}
                  onChange={(e) => setEditForm({ ...editForm, question: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Approved Answer *
                </label>
                <textarea
                  required
                  rows={5}
                  value={editForm.answer}
                  onChange={(e) => setEditForm({ ...editForm, answer: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={editForm.keywords}
                  onChange={(e) => setEditForm({ ...editForm, keywords: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Visibility
                </label>
                <select
                  value={editForm.visibility}
                  onChange={(e) => setEditForm({ ...editForm, visibility: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white"
                >
                  <option value="PUBLIC">Public (All students & guests)</option>
                  <option value="INTERNAL_DEPARTMENT">Internal Department Only</option>
                  <option value="STAFF_ONLY">Staff Only</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingFaq(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateFaqMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-semibold shadow-md transition-colors"
                >
                  Save & Bump Version
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
              Ingest Document into AI Retrieval Index
            </h3>
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  value={uploadForm.title}
                  onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                  placeholder="e.g. 2026 Student Academic Regulations & Policies"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  placeholder="Summary of document contents..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-xs text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  File (PDF, DOCX, TXT, MD) *
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,.docx,.txt,.md"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  className="w-full px-3.5 py-2 rounded-xl border border-dashed border-gray-300 dark:border-navy-700 bg-gray-50 dark:bg-navy-950 text-xs text-gray-600 dark:text-gray-400"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoApprove"
                  checked={uploadForm.autoApprove}
                  onChange={(e) => setUploadForm({ ...uploadForm, autoApprove: e.target.checked })}
                  className="rounded border-gray-300 text-coral-500 focus:ring-coral-500"
                />
                <label htmlFor="autoApprove" className="text-xs text-gray-700 dark:text-gray-300">
                  Auto-approve for immediate AI retrieval
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadDocMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
                >
                  {uploadDocMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Ingesting...</span>
                    </>
                  ) : (
                    <span>Upload & Index</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Re-index Document Modal */}
      {reindexDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-navy-900 rounded-3xl p-6 shadow-2xl border border-gray-200 dark:border-navy-800 space-y-4">
            <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
              Re-index Document: {reindexDoc.title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Current version is v{reindexDoc.version || 1}.0. Re-indexing will bump the version to v
              {(reindexDoc.version || 1) + 1}.0, purge previous chunks, and generate fresh vector embeddings.
            </p>

            <form onSubmit={handleReindexSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Upload Updated File (optional)
                </label>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={(e) => setReindexFile(e.target.files[0])}
                  className="w-full px-3.5 py-2 rounded-xl border border-dashed border-gray-300 dark:border-navy-700 bg-gray-50 dark:bg-navy-950 text-xs text-gray-600 dark:text-gray-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReindexDoc(null)}
                  className="px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reindexDocMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-xs font-semibold shadow-md transition-colors flex items-center gap-1.5"
                >
                  {reindexDocMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Re-indexing...</span>
                    </>
                  ) : (
                    <span>Confirm Re-index</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
