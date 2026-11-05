import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationsBell from '../components/NotificationsBell';
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Bot,
  HelpCircle,
  Bell,
  User,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
  LifeBuoy,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  GraduationCap,
  ArrowRight,
  ShieldAlert,
  MessageSquareCode,
} from 'lucide-react';

export default function StudentLayout({ children }) {
  const { profile, user, role, signOut, isAuthenticated } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Role validation: StudentLayout is for Students (and Super Admin inspecting student view)
  if (role === 'STAFF') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-white">
        <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-[#0d1424] border border-amber-500/30 shadow-2xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold">Staff Operational Account Detected</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            You are logged in as <strong>{profile?.full_name || 'Staff Member'}</strong> with a staff operational account. The Student Portal is tailored for student ticket submissions.
          </p>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => navigate('/staff')}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-600/20"
            >
              Open Staff Department Queue
            </button>
            <button
              onClick={() => signOut()}
              className="w-full py-2 px-4 rounded-xl text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Sign out of staff account
            </button>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'My Tickets', href: '/tickets', icon: Ticket },
    { name: 'Student Queries', href: '/queries', icon: MessageSquareCode, badge: 'Live' },
    { name: 'Create Ticket', href: '/tickets/new', icon: PlusCircle, isCta: true },
    { name: 'AI Assistant', href: '/ai-chat', icon: Bot, isAi: true },
    { name: 'FAQs / Knowledge Base', href: '/faqs', icon: HelpCircle },
    { name: 'Notifications', href: '/notifications', icon: Bell },
    { name: 'Profile', href: '/profile', icon: User },
  ];

  const handleLogout = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const currentPath = location.pathname;

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-gray-100 selection:bg-coral-500/20 selection:text-coral-500 transition-colors duration-200">
      {/* 1. Desktop Persistent Sidebar (Fixed left) */}
      <aside className="hidden lg:flex flex-col w-64 xl:w-72 fixed inset-y-0 left-0 z-30 bg-white dark:bg-[#0c1222] border-r border-slate-200/80 dark:border-white/10 shadow-sm transition-colors duration-200">
        {/* Brand Header */}
        <div className="p-6 border-b border-slate-200/80 dark:border-white/10 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-coral-500 p-[1.5px] shadow-md shadow-sky-500/20 group-hover:scale-105 transition-all">
              <div className="w-full h-full rounded-[10px] bg-white dark:bg-[#070b14] flex items-center justify-center text-sky-500 dark:text-sky-400">
                <LifeBuoy className="w-5 h-5 transition-transform group-hover:rotate-45" />
              </div>
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white flex items-center gap-0.5">
                Smart<span className="text-coral-500 dark:text-[#64CEFB]">Desk</span>
              </span>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 dark:text-white/50 font-bold -mt-1">
                Student Portal
              </span>
            </div>
          </Link>
        </div>

        {/* Student Mini Profile Card */}
        <div className="px-4 py-4 border-b border-slate-100 dark:border-white/5">
          <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-coral-500 to-amber-500 text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm">
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'S'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {profile?.full_name || 'Enrolled Student'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-white/50 truncate flex items-center gap-1">
                <GraduationCap className="w-3 h-3 shrink-0" />
                <span>{profile?.roll_number || profile?.departments?.code || 'Student'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Primary Prominent CTA */}
        <div className="px-4 pt-4">
          <Link
            to="/tickets/new"
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-coral-500 to-rose-500 hover:from-coral-600 hover:to-rose-600 text-white font-bold text-xs shadow-lg shadow-coral-500/25 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-0.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create New Ticket</span>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentPath === item.href || (item.href !== '/dashboard' && currentPath.startsWith(item.href));
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                to={item.href}
                className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-coral-500/10 text-coral-600 dark:text-coral-400 font-bold border-l-4 border-coral-500 pl-2.5 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive
                        ? 'text-coral-500'
                        : 'text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                    }`}
                  />
                  <span>{item.name}</span>
                </div>

                {item.badge && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    {item.badge}
                  </span>
                )}
                {item.isAi && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-500 dark:text-[#64CEFB] border border-sky-500/20">
                    24/7 AI
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Actions: Logout */}
        <div className="p-4 border-t border-slate-200/80 dark:border-white/10 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* 2. Main Layout Area (Offset by sidebar width on desktop) */}
      <div className="flex-1 flex flex-col lg:pl-64 xl:pl-72 min-w-0 min-h-screen">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 h-16 bg-white/80 dark:bg-[#0c1222]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/10 px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-colors">
          {/* Mobile hamburger + Page Context */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
              <span className="font-semibold text-slate-500 dark:text-slate-400">Student Portal</span>
              <span>/</span>
              <span className="font-bold text-slate-900 dark:text-white capitalize">
                {currentPath.replace('/', '') || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Right Header Badges & Actions */}
          <div className="flex items-center gap-3">
            {/* Campus Desk Active Status */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Campus Desk Online</span>
            </div>

            {/* Notifications Popover */}
            <NotificationsBell />

            {/* Dark / Light Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            {/* Profile Avatar Quick Link */}
            <Link
              to="/profile"
              className="w-8 h-8 rounded-xl bg-gradient-to-tr from-coral-500 to-amber-500 text-white font-bold text-xs flex items-center justify-center shadow-sm hover:scale-105 transition-transform"
              title="View Student Profile"
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
            <div className="fixed inset-y-0 left-0 w-72 bg-white dark:bg-[#0c1222] shadow-2xl flex flex-col p-6 z-10 animate-slideRight">
              <div className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-white/10">
                <span className="font-extrabold text-lg tracking-tight">SmartDesk Student</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex-1 py-6 space-y-1">
                {navItems.map((item) => {
                  const isActive = currentPath === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-coral-500 text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
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
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/30 text-sm font-bold"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}

        {/* 3. Main Routed View Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-fadeIn">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
