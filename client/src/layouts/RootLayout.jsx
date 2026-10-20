import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import NotificationsBell from '../components/NotificationsBell';
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
} from 'lucide-react';

export default function RootLayout() {
  const { isDark, toggleTheme } = useTheme();
  const { user, profile, isAuthenticated, role, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  let navigation = [];
  if (!isAuthenticated) {
    navigation = [
      { name: 'Home', href: '/', icon: Home },
      { name: 'AI Assistant', href: '/ai-chat', icon: Bot, badge: 'Phase 6' },
      { name: 'Tickets', href: '/tickets', icon: Ticket },
    ];
  } else if (role === 'SUPER_ADMIN') {
    navigation = [
      { name: 'Admin Console', href: '/admin', icon: ShieldCheck },
      { name: 'Staff Queue', href: '/staff', icon: Building2 },
      { name: 'All Tickets', href: '/tickets', icon: Ticket },
      { name: 'Profile', href: '/profile', icon: User },
    ];
  } else if (role === 'STAFF') {
    navigation = [
      { name: 'Department Queue', href: '/staff', icon: Building2 },
      { name: 'My Tickets', href: '/tickets', icon: Ticket },
      { name: 'New Ticket', href: '/tickets/new', icon: PlusCircle },
      { name: 'Profile', href: '/profile', icon: User },
    ];
  } else {
    // Default student navigation
    navigation = [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { name: 'My Tickets', href: '/tickets', icon: Ticket },
      { name: 'New Ticket', href: '/tickets/new', icon: PlusCircle },
      { name: 'AI Assistant', href: '/ai-chat', icon: Bot, badge: 'Phase 6' },
      { name: 'Profile', href: '/profile', icon: User },
    ];
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-navy-950 text-gray-900 dark:text-gray-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-navy-900/90 backdrop-blur-md border-b border-gray-200 dark:border-navy-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2.5 group">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-navy-900 to-coral-500 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                  <LifeBuoy className="w-6 h-6 text-white" />
                </div>
                <div>
                  <span className="font-extrabold text-xl tracking-tight text-navy-900 dark:text-white flex items-center gap-1.5">
                    Smart<span className="text-coral-500">Desk</span>
                  </span>
                  <span className="block text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold -mt-1">
                    College Help Desk
                  </span>
                </div>
              </Link>
            </div>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-navy-100 dark:bg-navy-800 text-coral-600 dark:text-coral-400 font-semibold'
                        : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {item.name}
                    {item.badge && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-coral-500/10 text-coral-600 dark:text-coral-400 font-bold">
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
                    <span className="block text-xs font-bold text-gray-900 dark:text-white leading-tight">
                      {profile?.full_name || user?.email?.split('@')[0]}
                    </span>
                    <span className="block text-[10px] font-semibold text-coral-500 uppercase tracking-wider">
                      {role || 'Student'}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    title="Sign Out"
                    className="p-2 rounded-lg text-gray-500 hover:text-coral-500 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-navy-100 hover:bg-navy-200 dark:bg-navy-800 dark:hover:bg-navy-700 text-navy-900 dark:text-white text-xs font-semibold transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </Link>
              )}

              {/* Dark/Light Mode Toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="p-2 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>

              {/* Mobile menu button */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-navy-800"
                aria-label="Open mobile menu"
              >
                {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-gray-200 dark:border-navy-800 bg-white dark:bg-navy-900 px-4 pt-2 pb-4 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-base font-medium ${
                    isActive
                      ? 'bg-navy-100 dark:bg-navy-800 text-coral-600 dark:text-coral-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="text-xs px-2 py-0.5 rounded bg-coral-500/10 text-coral-600 font-bold">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            <div className="pt-3 border-t border-gray-100 dark:border-navy-800">
              {isAuthenticated ? (
                <div className="flex items-center justify-between px-3 py-2">
                  <div>
                    <span className="block text-sm font-bold text-gray-900 dark:text-white">
                      {profile?.full_name || user?.email}
                    </span>
                    <span className="block text-xs text-coral-500">{role || 'Student'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      signOut();
                      setMobileMenuOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-coral-500 text-white text-xs font-semibold"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-coral-500 text-white font-medium text-sm"
                >
                  <LogIn className="w-4 h-4" />
                  Sign In
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-navy-800 bg-white dark:bg-navy-900/60 py-6 text-sm text-center text-gray-500 dark:text-gray-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 SmartDesk — AI-Powered College Student Help Desk. Built with Deep Learning & RAG.</p>
          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="flex items-center gap-1 text-emerald-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              All Systems Operational
            </span>
            <span className="text-gray-400">|</span>
            <span>Version 1.0.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
