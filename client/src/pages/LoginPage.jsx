import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LifeBuoy, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { signIn, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    try {
      await signIn({ email, password });
      toast.success('Signed in successfully!');
      navigate(from, { replace: true });
    } catch (err) {
      setErrorMsg(err.message || 'Failed to authenticate');
      toast.error(err.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-8 p-8 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-xl space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-navy-900 to-coral-500 flex items-center justify-center text-white mx-auto shadow-md">
          <LifeBuoy className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold text-navy-900 dark:text-white">Sign In to SmartDesk</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Enter your college email and password to access your account
        </p>
      </div>

      {!isSupabaseConfigured && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Supabase Setup Required:</strong> To sign in with real credentials, set <code className="bg-amber-100 dark:bg-navy-800 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and <code className="bg-amber-100 dark:bg-navy-800 px-1 py-0.5 rounded">VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code className="bg-amber-100 dark:bg-navy-800 px-1 py-0.5 rounded">.env</code>.
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-coral-500/10 border border-coral-500/30 text-coral-600 dark:text-coral-400 text-xs">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
            College Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@college.edu or staff@college.edu"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
            Password
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-semibold text-sm shadow-md shadow-coral-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Authenticating...</span>
            </>
          ) : (
            <>
              <span>Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="text-center text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-navy-800">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="text-coral-500 hover:underline font-semibold">
          Register here
        </Link>
      </div>
    </div>
  );
}
