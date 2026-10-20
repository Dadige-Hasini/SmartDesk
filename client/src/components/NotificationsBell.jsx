import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { supabase } from '../config/supabase';
import { useAuth } from '../context/AuthContext';
import NotificationPreferencesModal from './NotificationPreferencesModal';
import {
  Bell,
  Check,
  CheckCheck,
  Settings,
  Ticket,
  Clock,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function NotificationsBell() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const popoverRef = useRef(null);

  // Fetch unread count & initial list
  const loadNotifications = async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/notifications?limit=10');
      if (res?.data?.data) {
        setNotifications(res.data.data.items || []);
        setUnreadCount(res.data.data.unreadCount || 0);
      }
    } catch {
      // Quiet fail on background poll
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000); // Poll every 30s as fallback

    // Realtime subscription via Supabase client
    let channel = null;
    if (supabase && user?.id) {
      try {
        channel = supabase
          .channel(`public:notifications:recipient_id=eq.${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `recipient_id=eq.${user.id}`,
            },
            (payload) => {
              if (payload.new) {
                setNotifications((prev) => [payload.new, ...prev]);
                setUnreadCount((c) => c + 1);
                toast((t) => (
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-coral-500" />
                    <span>{payload.new.title}</span>
                  </div>
                ));
              }
            }
          )
          .subscribe();
      } catch {}
    }

    return () => {
      clearInterval(interval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [isAuthenticated, user?.id]);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('All marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      api.patch(`/notifications/${notification.id}/read`).catch(() => {});
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setIsOpen(false);
    if (notification.ticket_id) {
      navigate(`/tickets/${notification.ticket_id}`);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={popoverRef}>
      {/* Bell Trigger */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadNotifications();
        }}
        aria-label="Notifications"
        className="relative p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-coral-500 text-[10px] font-extrabold text-white animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-navy-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-navy-800 z-50 overflow-hidden animate-fadeIn">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-navy-800 bg-gray-50 dark:bg-navy-950/60">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900 dark:text-white">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-coral-500/10 text-coral-500 text-xs font-semibold">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  title="Mark all as read"
                  className="p-1.5 rounded-lg text-gray-500 hover:text-coral-500 hover:bg-gray-100 dark:hover:bg-navy-800 text-xs flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mark all</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setPrefsOpen(true);
                }}
                title="Notification Preferences"
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List items */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-navy-800/60">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-gray-400 dark:text-gray-500 text-xs">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`flex items-start justify-between gap-3 p-3.5 hover:bg-gray-50 dark:hover:bg-navy-800/60 cursor-pointer transition-colors ${
                    !notif.is_read ? 'bg-coral-50/40 dark:bg-coral-500/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        !notif.is_read
                          ? 'bg-coral-500 text-white'
                          : 'bg-gray-100 dark:bg-navy-800 text-gray-500'
                      }`}
                    >
                      <Ticket className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p
                        className={`text-xs ${
                          !notif.is_read
                            ? 'font-bold text-gray-900 dark:text-white'
                            : 'font-medium text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {notif.title}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                        {notif.message}
                      </p>
                      <span className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {new Date(notif.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {!notif.is_read && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkAsRead(notif.id, e)}
                      title="Mark as read"
                      className="p-1 rounded-md text-gray-400 hover:text-coral-500 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Notification Preferences Modal */}
      <NotificationPreferencesModal
        isOpen={prefsOpen}
        onClose={() => setPrefsOpen(false)}
      />
    </div>
  );
}
