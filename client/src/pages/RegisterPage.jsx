import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LifeBuoy, AlertCircle, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { signUp, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState('STUDENT');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [registered, setRegistered] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    try {
      const metadata = {
        full_name: fullName,
        role,
        ...(role === 'STUDENT' ? { roll_number: rollNumber } : { employee_id: employeeId }),
      };

      await signUp({ email, password, metadata });
      setRegistered(true);
      toast.success('Registration submitted successfully!');
    } catch (err) {
      setErrorMsg(err.message || 'Registration failed');
      toast.error(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (registered) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-white dark:bg-navy-900 border border-emerald-500/30 shadow-xl text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Registration Submitted</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          {role === 'STAFF'
            ? 'Your staff account has been created in PENDING_APPROVAL status. An email confirmation has been sent, and your account will be activated once approved by a Super Administrator.'
            : 'Your student account has been created. Please check your college inbox to confirm your email, then proceed to sign in.'}
        </p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-medium text-sm transition-colors"
        >
          Proceed to Sign In
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto my-8 p-8 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-xl space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-navy-900 to-coral-500 flex items-center justify-center text-white mx-auto shadow-md">
          <LifeBuoy className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-extrabold text-navy-900 dark:text-white">Join SmartDesk</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Create your account for grounded college assistance and support
        </p>
      </div>

      {!isSupabaseConfigured && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Supabase Setup Required:</strong> Set <code className="bg-amber-100 dark:bg-navy-800 px-1 py-0.5 rounded">VITE_SUPABASE_URL</code> and <code className="bg-amber-100 dark:bg-navy-800 px-1 py-0.5 rounded">VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code className="bg-amber-100 dark:bg-navy-800 px-1 py-0.5 rounded">.env</code> to enable live registration.
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-coral-500/10 border border-coral-500/30 text-coral-600 dark:text-coral-400 text-xs">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Role Selection */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
            Register As
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setRole('STUDENT')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                role === 'STUDENT'
                  ? 'border-coral-500 bg-coral-500/10 text-coral-600 dark:text-coral-400'
                  : 'border-gray-200 dark:border-navy-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-navy-800'
              }`}
            >
              Student
            </button>
            <button
              type="button"
              onClick={() => setRole('STAFF')}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all ${
                role === 'STAFF'
                  ? 'border-coral-500 bg-coral-500/10 text-coral-600 dark:text-coral-400'
                  : 'border-gray-200 dark:border-navy-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-navy-800'
              }`}
            >
              Staff (Requires Approval)
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
            Full Name
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
            College Email
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="student@college.edu"
            className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
          />
        </div>

        {role === 'STUDENT' ? (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
              Roll / Registration Number
            </label>
            <input
              type="text"
              required
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              placeholder="e.g. 21CS042"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
              Employee ID
            </label>
            <input
              type="text"
              required
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g. EMP-9041"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
            Password
          </label>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 6 characters"
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
              <span>Submitting Registration...</span>
            </>
          ) : (
            <>
              <span>Create Account</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="text-center text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-navy-800">
        Already have an account?{' '}
        <Link to="/login" className="text-coral-500 hover:underline font-semibold">
          Sign in
        </Link>
      </div>
    </div>
  );
}
