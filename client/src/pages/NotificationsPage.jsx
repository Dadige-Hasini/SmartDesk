import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import NotificationPreferencesModal from '../components/NotificationPreferencesModal';
import {
  Bell,
  Check,
  CheckCheck,
  Settings,
  Ticket,
  Clock,
  Filter,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const limit = 15;

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get(
        `/notifications?page=${page}&limit=${limit}&unreadOnly=${unreadOnly}`
      );
      if (res?.data?.data) {
        setNotifications(res.data.data.items || []);
        setTotal(res.data.data.total || 0);
        setUnreadCount(res.data.data.unreadCount || 0);
      }
    } catch (err) {
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [page, unreadOnly]);

  const handleMarkAsRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      toast.success('Marked as read');
    } catch {
      toast.error('Failed to update notification');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const handleItemClick = (notification) => {
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }
    if (notification.ticket_id) {
      navigate(`/tickets/${notification.ticket_id}`);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-navy-900 to-coral-500 flex items-center justify-center text-white shadow-md">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-white">
              Notifications & Alerts
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Stay informed on ticket creation, status changes, and staff updates
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-navy-800 hover:bg-gray-200 dark:hover:bg-navy-700 transition-colors"
            >
              <CheckCheck className="w-4 h-4 text-emerald-500" />
              <span>Mark all read</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setPrefsOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white bg-coral-500 hover:bg-coral-600 transition-colors shadow-sm"
          >
            <Settings className="w-4 h-4" />
            <span>Preferences</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-navy-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(false);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              !unreadOnly
                ? 'bg-navy-900 text-white dark:bg-white dark:text-navy-900'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-navy-800'
            }`}
          >
            All Updates ({total})
          </button>
          <button
            type="button"
            onClick={() => {
              setUnreadOnly(true);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              unreadOnly
                ? 'bg-coral-500 text-white'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-navy-800'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        <span className="text-xs text-gray-400">
          Page {page} of {totalPages}
        </span>
      </div>

      {/* Notification List */}
      <div className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 shadow-sm divide-y divide-gray-100 dark:divide-navy-800/80 overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-coral-500" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-16 text-center text-gray-400 dark:text-gray-500 space-y-2">
            <Bell className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm font-semibold">No notifications found</p>
            <p className="text-xs">
              {unreadOnly ? 'You have caught up with all updates!' : 'Your activity alerts will appear here.'}
            </p>
          </div>
        ) : (
          notifications.map((notif) => (
            <div
              key={notif.id}
              onClick={() => handleItemClick(notif)}
              className={`flex items-start justify-between gap-4 p-5 hover:bg-gray-50 dark:hover:bg-navy-800/50 cursor-pointer transition-colors ${
                !notif.is_read ? 'bg-coral-50/30 dark:bg-coral-500/5' : ''
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    !notif.is_read
                      ? 'bg-coral-500 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-navy-800 text-gray-500'
                  }`}
                >
                  <Ticket className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm ${
                        !notif.is_read
                          ? 'font-bold text-gray-900 dark:text-white'
                          : 'font-semibold text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {notif.title}
                    </span>
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-coral-500 inline-block"></span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    {notif.message}
                  </p>
                  <span className="text-[11px] text-gray-400 flex items-center gap-1 pt-1">
                    <Clock className="w-3 h-3" />
                    {new Date(notif.created_at).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
              </div>

              {!notif.is_read && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkAsRead(notif.id);
                  }}
                  title="Mark as read"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-coral-500 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors shrink-0"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>
          <span className="text-xs font-medium text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 disabled:opacity-40"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
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
