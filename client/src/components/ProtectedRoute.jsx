import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Clock, ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';

export default function ProtectedRoute({
  children,
  allowedRoles = null,
  requireActive = true,
}) {
  const { user, profile, loading, isAuthenticated, isPendingApproval, isActive, role } = useAuth();
  const location = useLocation();

  // 1. Loading state
  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-8 h-8 text-coral-500 animate-spin" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Verifying security credentials...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated -> Redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Pending Approval State (Staff accounts require Super Admin review)
  if (requireActive && isPendingApproval) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-2xl bg-white dark:bg-navy-900 border border-amber-500/30 shadow-lg text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Account Pending Approval</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          Hello <strong>{profile?.full_name || user?.email}</strong>. Your staff registration has been submitted and is currently awaiting review by a Super Administrator.
        </p>
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-xs text-left space-y-1">
          <div>• <strong>Role:</strong> {profile?.role || 'STAFF'}</div>
          <div>• <strong>Status:</strong> PENDING_APPROVAL</div>
          <div>• <strong>Email:</strong> {user?.email}</div>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-navy-800 dark:hover:bg-navy-700 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    );
  }

  // 4. Role Authorization Check
  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 rounded-2xl bg-white dark:bg-navy-900 border border-coral-500/30 shadow-lg text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-coral-500/10 text-coral-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Access Restricted</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          You do not possess the required departmental permissions to view this resource.
        </p>
        <div className="p-3.5 rounded-xl bg-gray-100 dark:bg-navy-800 text-xs text-left space-y-1">
          <div>• <strong>Current Role:</strong> {role || 'Unassigned'}</div>
          <div>• <strong>Authorized Roles:</strong> {allowedRoles.join(', ')}</div>
        </div>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return children;
}
