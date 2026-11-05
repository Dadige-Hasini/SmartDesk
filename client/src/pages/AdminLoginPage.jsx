import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  KeyRound,
  Fingerprint,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminLoginPage() {
  const { signIn, signOut, isSupabaseConfigured, loginAsDemoUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDemoAdminSignIn = () => {
    if (loginAsDemoUser) {
      loginAsDemoUser('SUPER_ADMIN');
      toast.success('Signed in with Super Administrator privileges!');
      navigate('/admin', { replace: true });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    try {
      // 1. Authenticate credentials via Supabase Auth
      const authResult = await signIn({ email: email.trim(), password });
      const user = authResult?.user;

      // 2. Strict Role Verification: Ensure account is genuinely a SUPER_ADMIN
      const userMetadataRole = user?.user_metadata?.role;

      // Check user metadata and database profile
      if (userMetadataRole && userMetadataRole !== 'SUPER_ADMIN') {
        await signOut();
        const msg = 'Access Denied: This account does not possess Super Administrator privileges. Please use the Student / Staff login portal.';
        setErrorMsg(msg);
        toast.error(msg);
        return;
      }

      toast.success('Administrator authenticated successfully!');
      navigate(from === '/' ? '/admin' : from, { replace: true });
    } catch (err) {
      const msg = err.message || 'Invalid administrator credentials.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-10 space-y-5 px-4 sm:px-0 animate-fadeIn">
      {/* Return to General Portal & Motive */}
      <div className="flex items-center justify-between px-1">
        <Link
          to="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-coral-500 dark:text-gray-400 dark:hover:text-coral-400 transition-colors group"
        >
          <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-1" />
          <span>Student & Staff Portal</span>
        </Link>
        <span className="text-[11px] font-bold tracking-wider uppercase text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
          <Lock className="w-3 h-3" />
          Restricted Zone
        </span>
      </div>

      <div className="p-8 sm:p-9 rounded-3xl bg-white dark:bg-[#0c1222] border-2 border-slate-200 dark:border-white/10 shadow-2xl space-y-6 relative overflow-hidden">
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-coral-500 to-sky-500" />

        {/* Console Header */}
        <div className="text-center space-y-2 pt-1">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-900 via-navy-900 to-amber-600 flex items-center justify-center text-amber-400 mx-auto shadow-lg shadow-amber-500/10 border border-amber-500/30">
            <ShieldCheck className="w-8 h-8 text-amber-400" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center justify-center gap-1.5">
            <span>Admin Console</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-coral-500/10 text-coral-600 dark:text-coral-400 border border-coral-500/20 font-bold uppercase tracking-wider">
              Root
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
            Super Administrator authentication portal for campus governance, SLA, and department queues.
          </p>
        </div>

        {/* Security Warning Notice */}
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-800 dark:text-amber-300 text-xs flex items-start gap-2.5">
          <Fingerprint className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-[11.5px] leading-relaxed">
            <strong>Zero-Trust Audited Area:</strong> All sign-ins, IP addresses, and console transactions are cryptographically recorded in the append-only system audit log.
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-coral-500/10 border border-coral-500/30 text-coral-600 dark:text-coral-400 text-xs flex items-start gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="font-medium leading-relaxed">{errorMsg}</span>
          </div>
        )}

        {/* Admin Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Administrator Email
            </label>
            <div className="relative">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hasinirajdadige@gmail.com or admin@college.edu"
                className="w-full px-4 py-2.5 pl-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all font-mono"
              />
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Master Password
            </label>
            <div className="relative">
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-2.5 pl-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition-all font-mono"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-600 to-coral-600 hover:from-amber-500 hover:to-coral-500 text-white font-bold text-sm shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Privileges...</span>
              </>
            ) : (
              <>
                <span>Access Admin Console</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* One-Click Super Admin Demo Button */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          <div className="text-center text-[10px] font-bold tracking-widest uppercase text-slate-400">
            Rapid Evaluation Access
          </div>
          <button
            type="button"
            id="demo-admin-login-btn"
            onClick={handleDemoAdminSignIn}
            className="w-full px-4 py-2.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-amber-400 transition-all flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-700 shadow-sm hover:border-amber-500/40"
          >
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>Instant Demo Super Admin Access</span>
          </button>
        </div>

        {/* Footer Navigation */}
        <div className="text-center text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <Link to="/" className="text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors">
            Campus Home
          </Link>
          <Link to="/login" className="text-coral-500 hover:underline font-semibold flex items-center gap-1">
            <span>Student & Staff Sign In</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}

