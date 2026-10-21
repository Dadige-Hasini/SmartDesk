import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  Bot,
  X,
  Send,
  Maximize2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  FileText,
  PlusCircle,
  Loader2,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AiChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'w-msg-1',
      role: 'assistant',
      content: 'Hi! Need quick help with college fees, transport, or course rules? Ask me anything!',
      citations: [],
      hasSufficientEvidence: true,
    },
  ]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const messagesEndRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  // Scroll to bottom when messages update
  useEffect(() => {
    if (isOpen && typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  // Don't render on dedicated /ai-chat page to avoid double chat
  if (location.pathname === '/ai-chat' || !isAuthenticated) {
    return null;
  }

  const handleSend = async (e) => {
    e?.preventDefault();
    const query = inputQuery.trim();
    if (!query || loading) return;

    const userMsg = {
      id: `w-user-${Date.now()}`,
      role: 'user',
      content: query,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const conversationHistory = messages.slice(-4).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await api.post('/ai/chat', {
        query,
        conversationHistory,
      });

      const data = res?.data?.data || {};

      setMessages((prev) => [
        ...prev,
        {
          id: `w-ai-${Date.now()}`,
          role: 'assistant',
          content: data.answer || 'No relevant college policy found.',
          citations: Array.isArray(data.citations) ? data.citations : [],
          hasSufficientEvidence: data.hasSufficientEvidence ?? true,
          confidenceScore: data.confidenceScore ?? 0.8,
          originalQuery: query,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `w-err-${Date.now()}`,
          role: 'assistant',
          content: 'Unable to reach AI assistant right now. Please create a support ticket.',
          citations: [],
          hasSufficientEvidence: false,
          originalQuery: query,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleTicketHandoff = async (msg) => {
    setSuggesting(true);
    try {
      const q = msg?.originalQuery || msg?.content || inputQuery;
      const res = await api.post('/ai/suggest-ticket', { query: q });
      const sug = res?.data?.data;

      setIsOpen(false);
      navigate('/tickets/new', {
        state: {
          prefilled: {
            title: sug?.suggestedTitle || q.slice(0, 80),
            description: sug?.suggestedDescription || q,
            categoryId: sug?.suggestedCategoryId || '',
            priority: sug?.suggestedPriority || 'Medium',
            suggestedDepartment: sug?.suggestedDepartment || '',
          },
          aiAssisted: true,
        },
      });
    } catch {
      setIsOpen(false);
      navigate('/tickets/new');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Expanded Widget Window */}
      {isOpen && (
        <div className="w-[360px] sm:w-[400px] h-[520px] mb-3 bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slideUp">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-navy-900 via-navy-900 to-coral-600 text-white flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-1.5">
                  SmartDesk AI
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                </h3>
                <p className="text-[10px] text-gray-200">Grounded in college docs</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/ai-chat');
                }}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                title="Expand to Full Page"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages body */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-gray-50/50 dark:bg-navy-950/50 text-xs">
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-fadeIn`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3 shadow-xs space-y-2 ${
                      isUser
                        ? 'bg-coral-500 text-white rounded-br-none'
                        : 'bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 text-gray-800 dark:text-gray-200 rounded-bl-none'
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>

                    {/* Citations preview */}
                    {!isUser && Array.isArray(m.citations) && m.citations.length > 0 && (
                      <div className="pt-1 border-t border-gray-100 dark:border-navy-800 text-[10px] text-coral-600 dark:text-coral-400 font-semibold flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        <span>Source: {m.citations[0].title}</span>
                      </div>
                    )}

                    {/* Grounded check */}
                    {!isUser && m.id !== 'w-msg-1' && (
                      <div className="pt-1 flex items-center justify-between text-[10px]">
                        {m.hasSufficientEvidence ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Grounded
                          </span>
                        ) : (
                          <button
                            onClick={() => handleTicketHandoff(m)}
                            disabled={suggesting}
                            className="text-coral-600 dark:text-coral-400 font-bold flex items-center gap-1 hover:underline"
                          >
                            <PlusCircle className="w-3 h-3" /> Open Ticket
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex items-center gap-2 text-gray-400 text-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-coral-500" />
                <span>Searching college documents...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick action footer */}
          <div className="p-2.5 bg-white dark:bg-navy-900 border-t border-gray-200 dark:border-navy-800 flex items-center justify-between text-[11px]">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/ai-chat');
              }}
              className="text-gray-500 hover:text-coral-500 flex items-center gap-1 font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5 text-coral-500" />
              Full Assistant
            </button>
            <button
              onClick={() => handleTicketHandoff(null)}
              className="text-coral-600 hover:text-coral-700 font-bold flex items-center gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Create Ticket
            </button>
          </div>

          {/* Input field */}
          <form
            onSubmit={handleSend}
            className="p-3 bg-gray-50 dark:bg-navy-950 border-t border-gray-200 dark:border-navy-800 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask SmartDesk AI..."
              disabled={loading}
              maxLength={1000}
              className="flex-1 bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-coral-500 dark:text-white"
            />
            <button
              type="submit"
              disabled={loading || !inputQuery.trim()}
              className="w-8 h-8 rounded-xl bg-coral-500 hover:bg-coral-600 disabled:opacity-50 flex items-center justify-center text-white shadow-xs shrink-0"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </form>
        </div>
      )}

      {/* Floating launcher button */}
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="group relative flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-gradient-to-tr from-navy-900 to-coral-500 text-white shadow-xl hover:shadow-2xl shadow-coral-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
        aria-label="Toggle SmartDesk AI Assistant"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-coral-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-coral-500" />
        </span>
        <Bot className="w-5 h-5 text-white group-hover:rotate-12 transition-transform" />
        <span className="font-extrabold text-xs tracking-tight">AI Assistant</span>
      </button>
    </div>
  );
}
