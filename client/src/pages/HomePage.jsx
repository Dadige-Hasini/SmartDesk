import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../api/client';
import FullScreenHero from '../components/FullScreenHero';
import ShinyText from '../components/ShinyText';
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
  Building2,
  HelpCircle,
  FileText,
  Lock,
  Headphones,
  Mail,
  GraduationCap,
  Activity,
  Zap,
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

  const handleScrollTo = (targetId) => {
    const el = document.querySelector(targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="w-full flex flex-col bg-black text-white selection:bg-[#64CEFB]/30">
      {/* 1. Full-Screen Hero Section (100vw x 100vh) */}
      <FullScreenHero onExploreClick={handleScrollTo} defaultMode="smartdesk" />

      {/* 2. Seamless Dark Explore Container with Ambient Glows */}
      <div className="relative w-full bg-[#05070f] border-t border-white/10 overflow-hidden">
        {/* Subtle cyan ambient glows matching hero */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#64CEFB]/[0.05] blur-[140px] pointer-events-none rounded-full" />
        <div className="absolute top-[800px] right-0 w-[500px] h-[500px] bg-[#64CEFB]/[0.03] blur-[160px] pointer-events-none rounded-full" />

        <div className="relative z-10 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-24 space-y-28">
          
          {/* Section 1: Core Services / Architecture (#features) */}
          <section id="features" className="scroll-mt-28 space-y-12">
            {/* Centered Heading Block */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center max-w-3xl mx-auto space-y-4"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/90 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-[#64CEFB] animate-ping" />
                <Sparkles className="w-3.5 h-3.5 text-[#64CEFB]" />
                <span>AI-Powered College Student Help Desk</span>
              </div>

              <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
                Instant College Answers, <br />
                <ShinyText text="Grounded in Truth." baseColor="#64CEFB" shineColor="#ffffff" speed={3} />
              </h2>

              <p className="text-base sm:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed font-normal">
                Ask our AI assistant about academic timetables, fees, library policies, or hostel regulations. Need staff intervention? Raise a tracked ticket that routes directly to the responsible department.
              </p>

              {/* Main Quick Action CTAs */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <Link
                  to="/ai-chat"
                  className="group inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-[#64CEFB] hover:bg-[#52bbe8] text-black font-semibold text-sm shadow-xl shadow-[#64CEFB]/20 transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  <Bot className="w-4 h-4 text-black" />
                  <span>Ask AI Assistant</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>

                <Link
                  to="/tickets"
                  className="group inline-flex items-center gap-2.5 px-6 py-3.5 rounded-full bg-black hover:bg-neutral-900 border border-white/20 hover:border-white/40 text-white font-medium text-sm transition-all duration-300 hover:scale-105 active:scale-95 shadow-xl"
                >
                  <Ticket className="w-4 h-4 text-[#64CEFB]" />
                  <span>Create / Track Ticket</span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </div>
            </motion.div>

            {/* 3 Balanced Feature Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
              {/* Card 1: Grounded RAG */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex flex-col justify-between p-8 rounded-3xl bg-neutral-900/50 backdrop-blur-xl border border-white/10 hover:border-[#64CEFB]/50 hover:shadow-[0_0_30px_rgba(100,206,251,0.12)] transition-all duration-300 group"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-[#64CEFB] flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Bot className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Grounded RAG AI Assistant</h3>
                  <p className="text-sm text-white/70 leading-relaxed font-normal">
                    Retrieves vetted college policy chunks via pgvector embeddings. Generates accurate answers with citations and abstains when evidence is insufficient.
                  </p>
                </div>

                <div className="pt-6 border-t border-white/10 mt-6">
                  <Link
                    to="/ai-chat"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#64CEFB] hover:text-white transition-colors group/link"
                  >
                    <span>Try AI Chat</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/link:translate-x-1" />
                  </Link>
                </div>
              </motion.div>

              {/* Card 2: Deterministic Ticket Lifecycle */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex flex-col justify-between p-8 rounded-3xl bg-neutral-900/50 backdrop-blur-xl border border-white/10 hover:border-amber-400/50 hover:shadow-[0_0_30px_rgba(245,158,11,0.12)] transition-all duration-300 group"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Deterministic Ticket Lifecycle</h3>
                  <p className="text-sm text-white/70 leading-relaxed font-normal">
                    Strict finite-state machine (OPEN, IN_PROGRESS, AWAITING_INFO, RESOLVED, CLOSED) with departmental routing, SLA timers, and internal staff notes.
                  </p>
                </div>

                <div className="pt-6 border-t border-white/10 mt-6">
                  <Link
                    to="/tickets"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-white transition-colors group/link"
                  >
                    <span>Track Tickets</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/link:translate-x-1" />
                  </Link>
                </div>
              </motion.div>

              {/* Card 3: Multi-Tenant PostgreSQL */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col justify-between p-8 rounded-3xl bg-neutral-900/50 backdrop-blur-xl border border-white/10 hover:border-emerald-400/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.12)] transition-all duration-300 group"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Database className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-tight">Multi-Tenant PostgreSQL & RLS</h3>
                  <p className="text-sm text-white/70 leading-relaxed font-normal">
                    Enforces zero-trust database security. Student ownership checks, staff departmental isolation, and confidential grievance protection at the SQL level.
                  </p>
                </div>

                <div className="pt-6 border-t border-white/10 mt-6">
                  <Link
                    to="/faqs"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-white transition-colors group/link"
                  >
                    <span>Browse FAQs</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/link:translate-x-1" />
                  </Link>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Section 2: Backend Services Probe (#status) */}
          <section id="status" className="scroll-mt-28">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-3xl p-8 sm:p-10 bg-neutral-900/50 backdrop-blur-xl border border-white/10 shadow-2xl space-y-8"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/15 text-[#64CEFB] flex items-center justify-center">
                    <Server className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
                      <span>Backend Services Probe</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </h2>
                    <p className="text-xs sm:text-sm text-white/60">
                      Live verification of Express API, health probe, and AI background workers
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {loadingHealth ? (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-white/70">
                      <Clock className="w-3.5 h-3.5 animate-spin text-[#64CEFB]" />
                      Connecting...
                    </span>
                  ) : healthData ? (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>API Healthy ({healthData.uptimeSeconds}s uptime)</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      {errorHealth || 'Offline'}
                    </span>
                  )}
                </div>
              </div>

              {/* 3 Metric Summary Boxes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-sm">
                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                  <div className="text-xs text-white/50 uppercase font-semibold tracking-wider">Environment</div>
                  <div className="text-lg font-bold text-white">
                    {healthData?.environment || 'Development'}
                  </div>
                  <div className="text-[11px] text-white/40">Secure local development profile</div>
                </div>

                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                  <div className="text-xs text-white/50 uppercase font-semibold tracking-wider">Response Contract</div>
                  <div className="text-lg font-bold text-emerald-400 flex items-center gap-1.5">
                    <Activity className="w-4 h-4" />
                    <span>Uniform JSON Active</span>
                  </div>
                  <div className="text-[11px] text-white/40">Standard error & response envelope</div>
                </div>

                <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
                  <div className="text-xs text-white/50 uppercase font-semibold tracking-wider">System Architecture</div>
                  <div className="text-lg font-bold text-[#64CEFB] flex items-center gap-1.5">
                    <Zap className="w-4 h-4" />
                    <span>SmartDesk 2.0 Engine</span>
                  </div>
                  <div className="text-[11px] text-white/40">pgvector RAG + Multi-Role FSM</div>
                </div>
              </div>
            </motion.div>
          </section>

          {/* Section 3: Supported Campus Departments (#services) */}
          <section id="services" className="scroll-mt-28 space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Supported Campus Departments
                </h2>
                <p className="text-sm text-white/60 mt-1">
                  Direct ticket routing with automated department-level SLA policies
                </p>
              </div>

              <Link
                to="/login"
                className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium text-xs sm:text-sm backdrop-blur-md transition-all duration-300 hover:scale-105"
              >
                <span>Submit Department Ticket</span>
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Balanced 4-Column Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { name: 'Academics & Exam', desc: 'Timetables, grade sheets, transcripts, course drops', sla: '24h SLA', icon: GraduationCap },
                { name: 'Accounts & Fees', desc: 'Tuition fees, receipts, payment proofs, refunds', sla: '48h SLA', icon: Building2 },
                { name: 'Hostel & Mess', desc: 'Room allocation, maintenance, catering, leave slips', sla: '12h SLA', icon: BookOpen },
                { name: 'Library Services', desc: 'Book renewals, overdue fines, digital database keys', sla: '24h SLA', icon: HelpCircle },
              ].map((dept, index) => {
                const Icon = dept.icon;
                return (
                  <motion.div
                    key={dept.name}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    className="p-6 rounded-2xl bg-white/[0.03] backdrop-blur-md border border-white/10 hover:border-[#64CEFB]/40 transition-all duration-300 flex flex-col justify-between h-full group"
                  >
                    <div className="space-y-3">
                      <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#64CEFB] group-hover:scale-110 transition-transform duration-300">
                        <Icon className="w-5 h-5" />
                      </div>
                      <h4 className="font-bold text-white text-base group-hover:text-[#64CEFB] transition-colors">
                        {dept.name}
                      </h4>
                      <p className="text-xs text-white/60 leading-relaxed font-normal">
                        {dept.desc}
                      </p>
                    </div>

                    <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between text-[11px]">
                      <span className="text-white/40">Guaranteed Response</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#64CEFB]/10 text-[#64CEFB] font-semibold">
                        {dept.sla}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* Section 4: Contact & Prompt Assistance (#contact) */}
          <section id="contact" className="scroll-mt-28">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-3xl bg-gradient-to-br from-neutral-900/90 via-black to-neutral-950 p-8 sm:p-12 border border-white/10 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-8"
            >
              <div className="space-y-3 max-w-xl text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/70">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>24/7 Academic Support Active</span>
                </div>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                  Need immediate campus assistance?
                </h2>
                <p className="text-sm text-white/70 leading-relaxed font-normal">
                  Our AI Assistant is available 24 hours a day, 7 days a week. For complex inquiries or departmental review, sign in with your student credentials.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0 w-full sm:w-auto">
                <Link
                  to="/ai-chat"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium text-sm backdrop-blur-md transition-all duration-300 hover:scale-105"
                >
                  <Bot className="w-4 h-4 text-[#64CEFB]" />
                  <span>Ask AI Chat</span>
                </Link>

                <Link
                  to="/login"
                  className="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-full bg-black hover:bg-neutral-900 border border-white/20 hover:border-[#64CEFB]/50 text-white font-medium text-sm transition-all duration-300 hover:scale-105 shadow-xl"
                >
                  <span>Student Sign In</span>
                  <ArrowRight className="w-4 h-4 text-white transition-transform duration-300 group-hover:translate-x-1.5" />
                </Link>
              </div>
            </motion.div>
          </section>

        </div>
      </div>
    </div>
  );
}
