import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import {
  Bot,
  Ticket,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  Server,
  Layers,
  Database,
  CheckCircle2,
  Clock,
  BookOpen,
} from 'lucide-react';

export default function HomePage() {
  const [healthData, setHealthData] = useState(null);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [errorHealth, setErrorHealth] = useState(null);

  useEffect(() => {
    let isMounted = true;
    api
      .get('/health')
      .then((res) => {
        if (isMounted) {
          setHealthData(res.data);
          setLoadingHealth(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setErrorHealth(err.message || 'Unable to connect to backend server');
          setLoadingHealth(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-12 animate-fadeIn">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy-800 to-navy-950 text-white p-8 sm:p-12 shadow-2xl border border-navy-700/50">
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-coral-500/20 blur-3xl pointer-events-none"></div>
        <div className="absolute right-1/3 -bottom-20 w-72 h-72 rounded-full bg-amber-500/10 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-coral-500/20 border border-coral-500/40 text-coral-400 text-xs font-bold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered College Student Help Desk
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            Instant College Answers, <br />
            <span className="bg-gradient-to-r from-coral-400 via-coral-500 to-amber-400 bg-clip-text text-transparent">
              Grounded in Truth.
            </span>
          </h1>

          <p className="text-lg text-gray-300 leading-relaxed max-w-2xl">
            Ask our AI assistant about academic timetables, fees, library policies, or hostel regulations.
            Need staff intervention? Raise a tracked ticket that routes directly to the responsible department.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              to="/ai-chat"
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-semibold shadow-lg shadow-coral-500/30 transition-all hover:scale-105 active:scale-95"
            >
              <Bot className="w-5 h-5" />
              <span>Ask AI Assistant</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>

            <Link
              to="/tickets"
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-navy-800/80 hover:bg-navy-700 border border-navy-600 text-white font-semibold transition-all hover:scale-105 active:scale-95"
            >
              <Ticket className="w-5 h-5 text-amber-400" />
              <span>Create / Track Ticket</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Backend Health & Foundation Status Card */}
      <section className="bg-white dark:bg-navy-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-navy-800">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-navy-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-navy-100 dark:bg-navy-800 text-navy-900 dark:text-coral-400 flex items-center justify-center font-bold">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Backend Services Probe
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Live verification of Express API, health endpoints, and security envelope
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {loadingHealth ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-navy-800 text-gray-600 dark:text-gray-300">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                Connecting...
              </span>
            ) : healthData ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                API Healthy ({healthData.uptimeSeconds}s uptime)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-coral-500/10 text-coral-600 dark:text-coral-400 border border-coral-500/20">
                <ShieldAlert className="w-3.5 h-3.5" />
                {errorHealth || 'Offline'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-sm">
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-navy-800/40 border border-gray-100 dark:border-navy-800">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Environment</div>
            <div className="text-base font-bold text-gray-900 dark:text-white mt-1">
              {healthData?.environment || 'Development'}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-navy-800/40 border border-gray-100 dark:border-navy-800">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Response Contract</div>
            <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">
              Uniform JSON Envelope Active
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gray-50 dark:bg-navy-800/40 border border-gray-100 dark:border-navy-800">
            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">Current Phase</div>
            <div className="text-base font-bold text-coral-500 mt-1">
              Phase 0 — Workspace Foundation
            </div>
          </div>
        </div>
      </section>

      {/* Feature Architecture Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-coral-500/10 text-coral-500 flex items-center justify-center">
            <Bot className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Grounded RAG AI Assistant</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Retrieves vetted college policy chunks via pgvector embeddings. Generates accurate answers with citations and abstains when evidence is insufficient.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <Layers className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Deterministic Ticket Lifecycle</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Strict finite-state machine (OPEN, IN_PROGRESS, AWAITING_INFO, RESOLVED, CLOSED, REJECTED) with departmental routing, SLA timers, and internal notes.
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-xl bg-navy-100 dark:bg-navy-800 text-navy-900 dark:text-coral-400 flex items-center justify-center">
            <Database className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Multi-Tenant PostgreSQL & RLS</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Enforces zero-trust database security. Student ownership checks, staff departmental isolation, and confidential grievance protection at the SQL level.
          </p>
        </div>
      </section>
    </div>
  );
}
