import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';
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
} from 'lucide-react';
import toast from 'react-hot-toast';

const STARTER_PROMPTS = [
  'What are the semester fee payment deadlines and late penalty fees?',
  'How do I apply for a student bus pass or campus parking permit?',
  'What is the academic policy for dropping or withdrawing from a course?',
  'What documents are required for degree transcript verification?',
];

export default function AiChatPage() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // Chat State
  const [messages, setMessages] = useState([
    {
      id: 'welcome-1',
      role: 'assistant',
      content:
        'Hello! I am your SmartDesk AI Assistant. I provide answers strictly grounded in official college policies, academic calendars, and administrative guidelines. How can I help you today?',
      citations: [],
      hasSufficientEvidence: true,
      confidenceScore: 1.0,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestingTicket, setSuggestingTicket] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState({});
  const [feedbackSubmitted, setFeedbackSubmitted] = useState({});
  const [activeFeedbackModal, setActiveFeedbackModal] = useState(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [serviceStatus, setServiceStatus] = useState(null);

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

  // Load AI Service status probe
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await api.get('/ai/status');
        setServiceStatus(res?.data?.data || null);
      } catch {
        // Fallback silently if status probe is unreachable
      }
    }
    checkStatus();
  }, []);

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
      });

      const data = res?.data?.data || {};

      const assistantMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.answer || 'I could not find sufficient information in the official documents.',
        citations: Array.isArray(data.citations) ? data.citations : [],
        hasSufficientEvidence: data.hasSufficientEvidence ?? true,
        confidenceScore: data.confidenceScore ?? 0.85,
        suggestedActions: data.suggestedActions || [],
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

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: 'Conversation cleared. How else may I assist you with college policies?',
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

      {/* Main Conversation Container */}
      <div className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 shadow-xl flex flex-col h-[650px] overflow-hidden">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {messages.map((message) => {
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

                  {/* Grounded Evidence Badge (For Assistant responses) */}
                  {!isUser && message.id !== 'welcome-1' && message.id !== 'welcome-reset' && (
                    <div className="pt-2 border-t border-gray-200/60 dark:border-navy-800/60 flex flex-wrap items-center justify-between gap-2">
                      {message.hasSufficientEvidence ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verified Grounded Answer ({Math.round(message.confidenceScore * 100)}% match)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Insufficient College Evidence — Support Ticket Recommended
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
                              className="p-3 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 text-xs space-y-1 shadow-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-gray-900 dark:text-white">
                                  {cite.title || 'Official Document'}
                                </span>
                                {cite.similarity && (
                                  <span className="text-[10px] text-gray-400 font-mono">
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

                  {/* Handoff suggestion when evidence is insufficient or offered */}
                  {!isUser && !message.hasSufficientEvidence && (
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
