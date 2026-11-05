import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import NotificationsBell from '../components/NotificationsBell';
import AiChatWidget from '../components/AiChatWidget';
import {
  Sun,
  Moon,
  LifeBuoy,
  Menu,
  X,
  Home,
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Bot,
  Bell,
  CheckCircle2,
  LogOut,
  LogIn,
  User,
  Building2,
  ShieldCheck,
  HelpCircle,
} from 'lucide-react';

export default function RootLayout({ children }) {
  const { isDark, toggleTheme } = useTheme();
  const { user, profile, isAuthenticated, role, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  let navigation = [];
  if (!isAuthenticated) {
    navigation = [
      { name: 'Home', href: '/', icon: Home },
      { name: 'FAQs', href: '/faqs', icon: HelpCircle },
      { name: 'AI Assistant', href: '/ai-chat', icon: Bot },
      { name: 'Tickets', href: '/tickets', icon: Ticket },
    ];
  } else if (role === 'SUPER_ADMIN') {
    navigation = [
      { name: 'Admin Console', href: '/admin', icon: ShieldCheck },
      { name: 'Staff Queue', href: '/staff', icon: Building2 },
      { name: 'FAQs', href: '/faqs', icon: HelpCircle },
      { name: 'AI Assistant', href: '/ai-chat', icon: Bot },
      { name: 'All Tickets', href: '/tickets', icon: Ticket },
      { name: 'Profile', href: '/profile', icon: User },
    ];
  } else if (role === 'STAFF') {
    navigation = [
      { name: 'Department Queue', href: '/staff', icon: Building2 },
      { name: 'FAQs', href: '/faqs', icon: HelpCircle },
      { name: 'AI Assistant', href: '/ai-chat', icon: Bot },
      { name: 'My Tickets', href: '/tickets', icon: Ticket },
      { name: 'New Ticket', href: '/tickets/new', icon: PlusCircle },
      { name: 'Profile', href: '/profile', icon: User },
    ];
  } else {
    // Default student navigation
    navigation = [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'FAQs', href: '/faqs', icon: HelpCircle },
      { name: 'My Tickets', href: '/tickets', icon: Ticket },
      { name: 'New Ticket', href: '/tickets/new', icon: PlusCircle },
      { name: 'AI Assistant', href: '/ai-chat', icon: Bot },
      { name: 'Profile', href: '/profile', icon: User },
    ];
  }

  const isHomePage = location.pathname === '/';
  const showStandardHeader = !isHomePage || isAuthenticated;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-gray-100 selection:bg-coral-500/20 selection:text-coral-500 transition-colors duration-200">
      {/* Top Navigation Bar - Shown for authenticated users or on sub-pages */}
      {showStandardHeader && (
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#070b14]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/10 text-slate-900 dark:text-white transition-colors duration-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16 items-center">
              {/* Logo with modern Help Desk + AI mark */}
              <div className="flex items-center gap-3">
                <Link to="/" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 via-indigo-600 to-coral-500 p-[1.5px] shadow-md shadow-sky-500/20 group-hover:scale-105 group-hover:shadow-sky-500/30 transition-all duration-300">
                    <div className="w-full h-full rounded-[10px] bg-white dark:bg-[#0c1222] flex items-center justify-center text-sky-500 dark:text-sky-400">
                      <LifeBuoy className="w-5 h-5 transition-transform duration-300 group-hover:rotate-45" />
                    </div>
                  </div>
                  <div>
                    <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white flex items-center gap-0.5">
                      Smart<span className="text-coral-500 dark:text-[#64CEFB]">Desk</span>
                    </span>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-500 dark:text-white/50 font-semibold -mt-1">
                      College Help Desk
                    </span>
                  </div>
                </Link>
              </div>

              {/* Desktop Navigation Links in Rounded Pill Container */}
              <nav className="hidden md:flex items-center gap-1 border border-slate-200/80 dark:border-white/10 rounded-full px-3 py-1.5 backdrop-blur-md bg-slate-100/70 dark:bg-white/[0.04] shadow-sm">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                        isActive
                          ? 'bg-white dark:bg-white/15 text-coral-600 dark:text-white font-semibold border border-slate-200/90 dark:border-white/20 shadow-sm'
                          : 'text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/10'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.name}</span>
                      {item.badge && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-coral-500/10 text-coral-600 dark:bg-[#64CEFB]/20 dark:text-[#64CEFB] font-bold border border-coral-500/20 dark:border-[#64CEFB]/30">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              {/* Right Actions: Auth Status, Notifications, Theme Toggle */}
              <div className="flex items-center gap-3">
                {/* In-app Notifications Bell */}
                <NotificationsBell />

                {/* User Authentication Status */}
                {isAuthenticated ? (
                  <div className="hidden sm:flex items-center gap-2.5 pl-2">
                    <Link
                      to="/profile"
                      className="text-right hover:opacity-80 transition-opacity"
                      title="View Student Profile"
                    >
                      <span className="block text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        {profile?.full_name || user?.email?.split('@')[0]}
                      </span>
                      <span className="block text-[10px] font-semibold text-coral-500 dark:text-[#64CEFB] uppercase tracking-wider">
                        {role || 'Student'}
                      </span>
                    </Link>
                    <button
                      type="button"
                      onClick={signOut}
                      title="Sign Out"
                      className="p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="hidden sm:flex items-center gap-2">
                    <Link
                      to="/login"
                      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 text-white hover:bg-slate-800 dark:bg-white/10 dark:hover:bg-white/20 dark:border dark:border-white/20 dark:text-white text-xs font-semibold backdrop-blur-md transition-all hover:scale-105"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Sign In</span>
                    </Link>
                    <Link
                      to="/admin/login"
                      title="Super Administrator Portal"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-semibold transition-all hover:scale-105"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-500" />
                      <span>Admin</span>
                    </Link>
                  </div>
                )}

                {/* Dark/Light Mode Toggle */}
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                  className="p-2 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/10 transition-colors"
                >
                  {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                {/* Mobile menu button */}
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden p-2 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100/70 dark:bg-white/5 text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white"
                  aria-label="Open mobile menu"
                >
                  {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Navigation Dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden border-b border-slate-200 dark:border-white/10 bg-white/95 dark:bg-black/95 backdrop-blur-2xl px-4 pt-2 pb-4 space-y-1 text-slate-900 dark:text-white shadow-xl">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-100 dark:bg-white/15 text-coral-600 dark:text-white font-semibold border border-slate-200 dark:border-white/20'
                        : 'text-slate-700 dark:text-white/80 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-coral-500 dark:text-[#64CEFB]" />
                      <span>{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-coral-500/10 text-coral-600 dark:bg-[#64CEFB]/20 dark:text-[#64CEFB] font-bold">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}

              <div className="pt-3 border-t border-slate-200 dark:border-white/10">
                {isAuthenticated ? (
                  <div className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="block text-sm font-bold text-slate-900 dark:text-white">
                        {profile?.full_name || user?.email}
                      </span>
                      <span className="block text-xs text-coral-500 dark:text-[#64CEFB]">{role || 'Student'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        signOut();
                        setMobileMenuOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-900 dark:text-white text-xs font-semibold"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Link
                      to="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full bg-coral-500 hover:bg-coral-600 text-white font-medium text-sm transition-all"
                    >
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </Link>
                    <Link
                      to="/admin/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-full border border-amber-500/40 text-amber-600 dark:text-amber-400 font-medium text-sm transition-all hover:bg-amber-500/10"
                    >
                      <ShieldCheck className="w-4 h-4 text-amber-500" />
                      Admin Portal
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}
        </header>
      )}

      {/* Main Content Area */}
      <main className={isHomePage ? 'flex-1 w-full' : 'flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8'}>
        {children || <Outlet />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-black/90 backdrop-blur-xl py-6 text-sm text-center text-slate-500 dark:text-white/60 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 p-[1px] flex items-center justify-center">
              <div className="w-full h-full rounded-[5px] bg-white dark:bg-[#0c1222] flex items-center justify-center text-sky-500">
                <LifeBuoy className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-white/60">© 2026 SmartDesk — AI-Powered College Student Help Desk. Built with Deep Learning & RAG.</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              All Systems Operational
            </span>
            <span className="text-slate-300 dark:text-white/20">|</span>
            <Link to="/faqs" className="hover:text-coral-500 dark:hover:text-[#64CEFB] transition-colors">
              Knowledge Base & FAQs
            </Link>
            <span className="text-slate-300 dark:text-white/20">|</span>
            <Link to="/admin/login" className="hover:text-amber-500 transition-colors">
              Admin Portal
            </Link>
            <span className="text-slate-300 dark:text-white/20">|</span>
            <span>Version 1.0.0</span>
          </div>
        </div>
      </footer>

      {/* Floating AI Assistant Chat Widget */}
      <AiChatWidget />
    </div>
  );
}
