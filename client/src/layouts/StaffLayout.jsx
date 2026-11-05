import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationsBell from '../components/NotificationsBell';
import {
  LayoutDashboard,
  Inbox,
  UserCheck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Bell,
  User,
  LogOut,
  Building2,
  ShieldCheck,
  ShieldAlert,
  Sun,
  Moon,
  Menu,
  X,
  Activity,
  Layers,
  Search,
} from 'lucide-react';

export default function StaffLayout({ children }) {
  const { profile, user, role, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Role validation: StaffLayout is strictly for STAFF and SUPER_ADMIN
  if (role === 'STUDENT') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-white">
        <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-[#0c1222] border border-coral-500/30 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-coral-500/10 text-coral-500 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold">Staff Operational Portal Restricted</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            The Staff Operations Center is reserved for university departmental officers and administrators. As a student, please use your dedicated Student Portal.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => navigate('/dashboard')}
              className="w-full py-2.5 px-4 rounded-xl bg-coral-500 hover:bg-coral-600 text-white font-semibold text-sm transition-colors shadow-lg shadow-coral-500/20"
            >
              Return to Student Dashboard
            </button>
            <button
              onClick={() => signOut()}
              className="w-full py-2 px-4 rounded-xl text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Knowledge Base Authorization check:
  // "Include Knowledge Base only if authorized for the staff role."
  const isAuthorizedForKnowledge = Boolean(
    profile?.can_manage_knowledge ||
    profile?.can_review_faqs ||
    role === 'SUPER_ADMIN' ||
    profile?.departments?.code === 'IT' ||
    profile?.departments?.code === 'CSE' ||
    profile?.department?.code === 'IT' ||
    profile?.department?.code === 'CSE'
  );

  const currentTab = searchParams.get('tab') || 'department_queue';

  const staffNavItems = [
    {
      name: 'Dashboard',
      href: '/staff',
      icon: LayoutDashboard,
      isActive: location.pathname === '/staff' && !searchParams.get('tab'),
    },
    {
      name: 'Department Ticket Queue',
      href: '/staff?tab=department_queue',
      icon: Inbox,
      isActive: location.pathname === '/staff' && currentTab === 'department_queue',
    },
    {
      name: 'My Assigned Tickets',
      href: '/staff?tab=assigned_to_me',
      icon: UserCheck,
      isActive: location.pathname === '/staff' && currentTab === 'assigned_to_me',
    },
    {
      name: 'Awaiting Information',
      href: '/staff?tab=awaiting_info',
      icon: Clock,
      isActive: location.pathname === '/staff' && currentTab === 'awaiting_info',
    },
    {
      name: 'Overdue / SLA at Risk',
      href: '/staff?tab=overdue_cases',
      icon: AlertTriangle,
      isWarning: true,
      isActive: location.pathname === '/staff' && currentTab === 'overdue_cases',
    },
    {
      name: 'Resolved Tickets',
      href: '/staff?tab=resolved_tickets',
      icon: CheckCircle2,
      isActive: location.pathname === '/staff' && currentTab === 'resolved_tickets',
    },
    {
      name: 'Notifications',
      href: '/notifications',
      icon: Bell,
      isActive: location.pathname === '/notifications',
    },
    {
      name: 'Profile',
      href: '/profile',
      icon: User,
      isActive: location.pathname === '/profile',
    },
  ];

  // Add Knowledge Base conditionally if authorized
  if (isAuthorizedForKnowledge) {
    staffNavItems.push({
      name: 'Knowledge Base',
      href: '/faqs',
      icon: BookOpen,
      isActive: location.pathname === '/faqs',
      badge: 'Admin/Staff',
    });
  }

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const departmentName = profile?.departments?.name || profile?.department?.name || 'Departmental Operations';
  const departmentCode = profile?.departments?.code || profile?.department?.code || 'STAFF';

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-500/20 selection:text-indigo-600 dark:selection:text-indigo-400 transition-colors duration-200">
      {/* 1. Desktop Operational Command Sidebar */}
      <aside className="hidden lg:flex flex-col w-72 fixed inset-y-0 left-0 z-30 bg-white dark:bg-[#080d1a] border-r border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-2xl transition-colors duration-200">
        {/* Department Banner & Operational Logo */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-3">
          <Link to="/staff" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-500/25 group-hover:bg-indigo-500 transition-colors shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                <span>Staff Operations</span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border border-indigo-500/30">
                  {departmentCode}
                </span>
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {departmentName}
              </p>
            </div>
          </Link>
        </div>

        {/* Live SLA Watchdog Operational Chip */}
        <div className="px-4 py-3 bg-slate-100/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
              <span className="font-semibold text-slate-700 dark:text-slate-300">SLA Watchdog</span>
            </div>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              Active (30s)
            </span>
          </div>
        </div>

        {/* Operational Staff Identity Summary */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 flex items-center justify-center font-bold text-xs border border-indigo-500/20 dark:border-indigo-500/30">
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {profile?.full_name || 'Staff Member'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate font-mono">
                {profile?.employee_id || profile?.designation || user?.email}
              </p>
            </div>
          </div>
        </div>

        {/* Operational Navigation List */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {staffNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  item.isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      item.isActive
                        ? 'text-white'
                        : item.isWarning
                        ? 'text-amber-500 dark:text-amber-400 group-hover:text-amber-600 dark:group-hover:text-amber-300'
                        : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                    }`}
                  />
                  <span>{item.name}</span>
                </div>

                {item.isWarning && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/30">
                    SLA Alert
                  </span>
                )}

                {item.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300 border border-sky-500/30">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Actions: Log Out */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Operational Workspace */}
      <div className="flex-1 flex flex-col lg:pl-72 min-w-0 min-h-screen">
        {/* Operational Top Header */}
        <header className="sticky top-0 z-20 h-16 bg-white/90 dark:bg-[#080d1a]/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-colors duration-200">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
              aria-label="Open staff menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold font-mono">
                {departmentCode}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
                Operational Queue & Ticket Redressal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Queue Link / Badge */}
            <Link
              to="/staff?tab=department_queue"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              <Inbox className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Queue View</span>
            </Link>

            {/* Notifications */}
            <NotificationsBell />

            {/* Dark/Light Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            {/* Staff User Avatar */}
            <Link
              to="/profile"
              className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold text-xs flex items-center justify-center hover:bg-indigo-500 transition-colors shadow-sm"
              title="Staff Profile"
            >
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'S'}
            </Link>
          </div>
        </header>

        {/* Mobile Slide-Over Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-[#080d1a] border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col p-6 z-10 animate-slideRight">
              <div className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <span className="font-bold text-base text-slate-900 dark:text-white">Staff Command</span>
                  <span className="block text-xs text-indigo-600 dark:text-indigo-400">{departmentName}</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 py-6 space-y-1">
                {staffNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                        item.isActive
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </nav>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-sm font-bold"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. Main Operational Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fadeIn">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
