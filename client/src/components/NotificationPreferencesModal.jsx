import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { X, Bell, Mail, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function NotificationPreferencesModal({ isOpen, onClose }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState({
    email_on_ticket_created: true,
    email_on_ticket_assigned: true,
    email_on_comment_added: true,
    email_on_status_changed: true,
    email_on_ticket_resolved: true,
    email_on_ticket_reopened: true,
    in_app_notifications: true,
  });

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    async function fetchPrefs() {
      setLoading(true);
      try {
        const res = await api.get('/notifications/preferences');
        if (mounted && res?.data?.preferences) {
          setPreferences(res.data.preferences);
        }
      } catch (err) {
        toast.error('Failed to load notification preferences');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchPrefs();
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  const handleToggle = (key) => {
    setPreferences((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/notifications/preferences', preferences);
      toast.success('Notification preferences updated');
      onClose();
    } catch (err) {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white dark:bg-navy-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-navy-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-navy-800 bg-gray-50 dark:bg-navy-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-coral-500/10 text-coral-500 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white text-base">
                Notification Preferences
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Choose what updates you want to receive
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-coral-500" />
            </div>
          ) : (
            <>
              {/* In-App Alerts Header */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-gray-50 dark:bg-navy-950/70 border border-gray-200 dark:border-navy-800">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-coral-500" />
                  <div>
                    <span className="block text-sm font-semibold text-gray-900 dark:text-white">
                      In-App Notifications
                    </span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      Show bell badges and in-app alerts
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.in_app_notifications}
                  onChange={() => handleToggle('in_app_notifications')}
                  className="w-4 h-4 text-coral-500 rounded focus:ring-coral-400 cursor-pointer"
                />
              </div>

              {/* Email Notifications Section */}
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email Notifications (Per Event)</span>
                </div>

                <div className="space-y-2.5">
                  {[
                    {
                      key: 'email_on_ticket_created',
                      title: 'Ticket Created',
                      desc: 'When you submit a new support ticket',
                    },
                    {
                      key: 'email_on_ticket_assigned',
                      title: 'Ticket Assigned',
                      desc: 'When a ticket is assigned or claimed',
                    },
                    {
                      key: 'email_on_comment_added',
                      title: 'New Comment',
                      desc: 'When a student or staff adds a response',
                    },
                    {
                      key: 'email_on_status_changed',
                      title: 'Status Updates',
                      desc: 'When ticket status transitions',
                    },
                    {
                      key: 'email_on_ticket_resolved',
                      title: 'Ticket Resolved',
                      desc: 'When the issue has been marked resolved',
                    },
                    {
                      key: 'email_on_ticket_reopened',
                      title: 'Ticket Reopened',
                      desc: 'When a closed ticket is reopened',
                    },
                  ].map(({ key, title, desc }) => (
                    <label
                      key={key}
                      className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-navy-800 hover:bg-gray-50/50 dark:hover:bg-navy-800/40 cursor-pointer transition-colors"
                    >
                      <div>
                        <span className="block text-sm font-medium text-gray-800 dark:text-gray-200">
                          {title}
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {desc}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={Boolean(preferences[key])}
                        onChange={() => handleToggle(key)}
                        className="w-4 h-4 text-coral-500 rounded focus:ring-coral-400 cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-gray-200 dark:border-navy-800 bg-gray-50 dark:bg-navy-950/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-coral-500 hover:bg-coral-600 disabled:opacity-50 rounded-xl shadow-md transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>Save Preferences</span>
          </button>
        </div>
      </div>
    </div>
  );
}
