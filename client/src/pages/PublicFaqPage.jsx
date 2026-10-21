import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import {
  Search,
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  Sparkles,
  BookOpen,
  GraduationCap,
  CreditCard,
  Award,
  Home,
  FileCheck,
  Wifi,
  Library,
  Bus,
  Briefcase,
  Users,
  MessageSquare,
  CheckCircle2,
  ExternalLink,
  X,
  Eye,
  ShieldCheck,
} from 'lucide-react';

const CATEGORY_FILTERS = [
  { id: '', label: 'All Categories', icon: BookOpen },
  { id: 'ACADEMICS', code: 'ACADEMICS', label: 'Academics & Grading', icon: GraduationCap },
  { id: 'FINANCE_FEES', code: 'FINANCE_FEES', label: 'Fee Payments & Dues', icon: CreditCard },
  { id: 'SCHOLARSHIPS', code: 'SCHOLARSHIPS', label: 'Scholarships & Grants', icon: Award },
  { id: 'HOSTEL_MESS', code: 'HOSTEL_MESS', label: 'Hostel & Mess', icon: Home },
  { id: 'EXAMINATIONS', code: 'EXAMINATIONS', label: 'Examinations', icon: FileCheck },
  { id: 'CAMPUS_IT', code: 'CAMPUS_IT', label: 'Campus IT & WiFi', icon: Wifi },
  { id: 'LIBRARY_SERVICES', code: 'LIBRARY_SERVICES', label: 'Library Services', icon: Library },
  { id: 'TRANSPORTATION', code: 'TRANSPORTATION', label: 'Transportation & Bus', icon: Bus },
  { id: 'CAREER_PLACEMENT', code: 'CAREER_PLACEMENT', label: 'Placements & Internships', icon: Briefcase },
  { id: 'STUDENT_AFFAIRS', code: 'STUDENT_AFFAIRS', label: 'Student Affairs', icon: Users },
];

export default function PublicFaqPage() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [userVotes, setUserVotes] = useState({}); // { [faqId]: 'helpful' | 'unhelpful' }

  // 1. Fetch published FAQs
  const {
    data: faqData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['public-faqs', selectedCategory, searchTerm],
    queryFn: async () => {
      const params = {};
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (selectedCategory) params.categoryId = selectedCategory;
      const res = await api.get('/faqs', { params });
      return res.data || res.faqs || [];
    },
    staleTime: 60 * 1000,
  });

  const faqs = useMemo(() => (Array.isArray(faqData) ? faqData : []), [faqData]);

  // 2. Vote mutation
  const voteMutation = useMutation({
    mutationFn: async ({ faqId, isHelpful }) => {
      return await api.post(`/faqs/${faqId}/vote`, { isHelpful });
    },
    onSuccess: (data, variables) => {
      const { faqId, isHelpful } = variables;
      setUserVotes((prev) => ({
        ...prev,
        [faqId]: isHelpful ? 'helpful' : 'unhelpful',
      }));
      toast.success(
        isHelpful
          ? 'Glad that helped! Your feedback improves SmartDesk answers.'
          : 'Thank you for your feedback. We will review this entry.',
        { icon: isHelpful ? '👍' : '📝' }
      );
      // Invalidate to refresh vote counters
      queryClient.invalidateQueries(['public-faqs']);
    },
    onError: (err) => {
      const msg = err?.message || 'Feedback could not be submitted.';
      toast.error(msg, { icon: '⚠️' });
    },
  });

  const handleVote = (e, faqId, isHelpful) => {
    e.stopPropagation();
    if (userVotes[faqId]) {
      toast('You have already submitted feedback for this question.', { icon: 'ℹ️' });
      return;
    }
    voteMutation.mutate({ faqId, isHelpful });
  };

  const toggleAccordion = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-navy-950 text-gray-900 dark:text-gray-100">
      {/* Hero Header */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy-900 via-navy-900 to-navy-950 text-white pt-16 pb-20 px-4 sm:px-6 lg:px-8 border-b border-navy-800">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-coral-500/10 border border-coral-500/30 text-coral-400 text-xs font-semibold mb-4 tracking-wide uppercase">
            <Sparkles className="w-3.5 h-3.5" />
            Verified College Knowledge Base
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-4">
            Frequently Asked <span className="text-coral-500">Questions</span>
          </h1>
          <p className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto mb-8">
            Instant, officially approved answers regarding academics, fees, scholarships, hostel
            accommodations, IT access, and campus procedures.
          </p>

          {/* Instant Search Bar */}
          <div className="relative max-w-2xl mx-auto">
            <div className="relative flex items-center shadow-2xl rounded-2xl">
              <Search className="w-5 h-5 text-gray-400 absolute left-4 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by keywords (e.g., wifi mac registration, refund, scholarship)..."
                className="w-full pl-12 pr-12 py-4 bg-white/10 dark:bg-navy-800/90 backdrop-blur-md text-white placeholder-gray-400 border border-white/20 dark:border-navy-700 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-coral-500 focus:border-transparent transition-all shadow-lg"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 p-1 rounded-full text-gray-400 hover:text-white transition-colors"
                  title="Clear search"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Category Filter Pills */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
              Filter by Category
            </h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Showing {faqs.length} published {faqs.length === 1 ? 'solution' : 'solutions'}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {CATEGORY_FILTERS.map((cat) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id || 'all'}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                    isSelected
                      ? 'bg-coral-500 text-white shadow-md shadow-coral-500/20 ring-2 ring-coral-500 ring-offset-2 dark:ring-offset-navy-950'
                      : 'bg-white dark:bg-navy-900 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-navy-800 hover:border-gray-300 dark:hover:border-navy-700 hover:bg-gray-100 dark:hover:bg-navy-800'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* FAQs Accordion List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className="animate-pulse bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 rounded-2xl p-5"
              >
                <div className="h-5 bg-gray-200 dark:bg-navy-800 rounded w-3/4 mb-3" />
                <div className="h-4 bg-gray-100 dark:bg-navy-800/60 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-2xl p-6 text-center">
            <HelpCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-red-800 dark:text-red-200 mb-1">
              Unable to load FAQs
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">
              {error?.message || 'An unexpected error occurred while fetching knowledge base items.'}
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : faqs.length === 0 ? (
          <div className="bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 rounded-2xl p-10 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-coral-500/10 text-coral-500 flex items-center justify-center mx-auto mb-4">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
              No matching questions found
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-6">
              We couldn't find any approved FAQs matching{' '}
              {searchTerm ? `"${searchTerm}"` : 'this category'}. Try adjusting your keywords or ask
              our 24/7 AI Assistant.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {(searchTerm || selectedCategory) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('');
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-navy-700 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
                >
                  Clear Filters
                </button>
              )}
              <Link
                to="/ai-chat"
                className="inline-flex items-center gap-2 px-5 py-2 bg-coral-500 hover:bg-coral-600 text-white rounded-xl text-sm font-medium shadow-md transition-all"
              >
                <Sparkles className="w-4 h-4" />
                Ask AI Assistant
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5">
            {faqs.map((faq) => {
              const isExpanded = expandedId === faq.id;
              const userVote = userVotes[faq.id];
              const categoryName =
                faq.category?.name ||
                CATEGORY_FILTERS.find((c) => c.code === faq.category_code)?.label ||
                faq.category_code ||
                'General';

              return (
                <div
                  key={faq.id}
                  className={`bg-white dark:bg-navy-900 border transition-all rounded-2xl overflow-hidden shadow-sm hover:shadow-md ${
                    isExpanded
                      ? 'border-coral-500/50 dark:border-coral-500/40 ring-1 ring-coral-500/20'
                      : 'border-gray-200 dark:border-navy-800'
                  }`}
                >
                  {/* Accordion Header */}
                  <button
                    onClick={() => toggleAccordion(faq.id)}
                    className="w-full text-left px-5 py-4 sm:px-6 sm:py-5 flex items-start justify-between gap-4 focus:outline-none"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-navy-100 dark:bg-navy-800 text-navy-800 dark:text-navy-200">
                          {categoryName}
                        </span>
                        {faq.department_id && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-navy-800/60 text-gray-600 dark:text-gray-400">
                            Dept: {faq.department_id}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          Approved v{faq.version || 1}.0
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-snug">
                        {faq.question}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-1">
                      <div className="flex items-center gap-1 text-xs text-gray-400 mr-1 hidden sm:flex">
                        <Eye className="w-3.5 h-3.5" />
                        <span>{faq.view_count || 0}</span>
                      </div>
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform duration-200 ${
                          isExpanded
                            ? 'bg-coral-500 text-white rotate-180'
                            : 'bg-gray-100 dark:bg-navy-800 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </button>

                  {/* Accordion Body */}
                  {isExpanded && (
                    <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-1 border-t border-gray-100 dark:border-navy-800/80 animate-in fade-in duration-200">
                      <div className="prose dark:prose-invert max-w-none text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line mb-5">
                        {faq.answer}
                      </div>

                      {/* Keywords / Tags */}
                      {Array.isArray(faq.keywords) && faq.keywords.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-5 pt-3 border-t border-gray-100 dark:border-navy-800/50">
                          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">
                            Keywords:
                          </span>
                          {faq.keywords.map((kw, i) => (
                            <button
                              key={i}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchTerm(kw);
                              }}
                              className="px-2 py-0.5 rounded text-[11px] bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-navy-700 transition-colors"
                            >
                              #{kw}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Helpful / Unhelpful Action Row */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-navy-800/50 text-xs sm:text-sm">
                        <span className="text-gray-500 dark:text-gray-400 font-medium">
                          Was this answer helpful?
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => handleVote(e, faq.id, true)}
                            disabled={voteMutation.isPending || !!userVote}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all ${
                              userVote === 'helpful'
                                ? 'bg-emerald-500 text-white shadow-sm'
                                : 'bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:text-emerald-600 dark:hover:text-emerald-400'
                            }`}
                            title="Mark as helpful"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            <span>Helpful</span>
                            <span className="text-[11px] opacity-75">
                              ({(faq.helpful_count || 0) + (userVote === 'helpful' ? 1 : 0)})
                            </span>
                          </button>

                          <button
                            onClick={(e) => handleVote(e, faq.id, false)}
                            disabled={voteMutation.isPending || !!userVote}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-medium transition-all ${
                              userVote === 'unhelpful'
                                ? 'bg-amber-500 text-white shadow-sm'
                                : 'bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-600 dark:hover:text-amber-400'
                            }`}
                            title="Mark as unhelpful"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                            <span>Not helpful</span>
                            <span className="text-[11px] opacity-75">
                              ({(faq.unhelpful_count || 0) + (userVote === 'unhelpful' ? 1 : 0)})
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Escalation / Assistance Callout */}
        <section className="mt-14 bg-gradient-to-tr from-navy-900 to-navy-800 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-xl border border-navy-700">
          <div className="absolute -right-12 -top-12 w-48 h-48 bg-coral-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="text-center sm:text-left">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 text-coral-400 text-xs font-semibold mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                24/7 AI-Powered Support
              </div>
              <h2 className="text-xl sm:text-2xl font-bold mb-1">
                Still can't find what you need?
              </h2>
              <p className="text-sm text-gray-300 max-w-xl">
                Chat directly with our RAG-grounded AI assistant for personalized answers, or submit a
                support ticket to be routed to department staff.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/ai-chat"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-bold shadow-lg shadow-coral-500/25 transition-all hover:scale-105"
              >
                <Sparkles className="w-4 h-4" />
                Ask AI Assistant
              </Link>
              <Link
                to="/tickets/new"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-semibold border border-white/20 transition-all"
              >
                <MessageSquare className="w-4 h-4" />
                Submit Ticket
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
