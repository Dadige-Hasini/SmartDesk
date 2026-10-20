import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { X, Plus, AlertCircle, Sparkles, Loader2, Building, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CreateTicketModal({ isOpen, onClose, onCreated }) {
  const [categories, setCategories] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [description, setDescription] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState([]);
  const [isConfidential, setIsConfidential] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch categories on mount
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingCategories(true);

    api
      .get('/tickets/meta/categories')
      .then((res) => {
        if (isMounted) {
          const list = res.data || [];
          setCategories(list);
          if (list.length > 0 && !categoryId) {
            setCategoryId(list[0].id);
          }
          setLoadingCategories(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('Failed to fetch categories:', err);
          setLoadingCategories(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddTag = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const clean = tagInput.trim().toLowerCase().replace(/,/g, '');
      if (clean && !tags.includes(clean) && tags.length < 5) {
        setTags([...tags, clean]);
        setTagInput('');
      }
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (title.trim().length < 3) {
      setErrorMsg('Title must be at least 3 characters long.');
      return;
    }

    if (description.trim().length < 5) {
      setErrorMsg('Description must be at least 5 characters long.');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        categoryId,
        priority,
        tags,
        isConfidential,
      };

      const res = await api.post('/tickets', payload);
      toast.success(`Ticket ${res.data?.ticket_number || 'created'} submitted successfully!`);
      if (onCreated) onCreated(res.data);
      onClose();
    } catch (err) {
      const msg = err.error?.details?.[0]?.message || err.message || 'Failed to submit ticket';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCategory = categories.find((c) => c.id === categoryId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-gray-100 dark:border-navy-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-coral-500/10 text-coral-500 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Raise New Support Ticket</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Submit an inquiry or report an issue directly to the responsible college department
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-navy-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-coral-500/10 border border-coral-500/30 text-coral-600 dark:text-coral-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
              Ticket Subject / Title <span className="text-coral-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Tuition fee deducted twice / ID card scanner error"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
            />
          </div>

          {/* Category & Priority Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                Category <span className="text-coral-500">*</span>
              </label>
              {loadingCategories ? (
                <div className="h-10 rounded-xl bg-gray-100 dark:bg-navy-800 animate-pulse"></div>
              ) : (
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
              >
                <option value="Low">Low (Response in 24h, Resolved in 96h)</option>
                <option value="Medium">Medium (Response in 8h, Resolved in 48h)</option>
                <option value="High">High (Response in 4h, Resolved in 24h)</option>
                <option value="Urgent">Urgent (Response in 2h, Resolved in 12h)</option>
              </select>
            </div>
          </div>

          {/* Dynamic Routing Notification Indicator */}
          <div className="p-3.5 rounded-xl bg-navy-50 dark:bg-navy-800/60 border border-navy-100 dark:border-navy-700/60 text-xs flex items-center justify-between text-gray-600 dark:text-gray-300">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-coral-500" />
              <span>
                Automated Departmental Routing: <strong>{selectedCategory?.name || 'Selected Category'}</strong>
              </span>
            </div>
            <span className="text-[10px] uppercase font-bold text-coral-500 px-2 py-0.5 rounded bg-coral-500/10">
              Auto Route Active
            </span>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
              Issue Description & Details <span className="text-coral-500">*</span>
            </label>
            <textarea
              required
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide specific dates, error codes, roll numbers, or context to help staff resolve your inquiry swiftly..."
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
            ></textarea>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
              Tags (Press Enter or comma to add)
            </label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-navy-800 text-gray-700 dark:text-gray-300"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-coral-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            {tags.length < 5 && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="e.g. fees, refund, lab"
                className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-navy-700 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-coral-500"
              />
            )}
          </div>

          {/* Confidential Grievance Toggle */}
          <div className="p-3.5 rounded-xl border border-gray-200 dark:border-navy-800 bg-gray-50/50 dark:bg-navy-950/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Shield className="w-5 h-5 text-amber-500 shrink-0" />
              <div>
                <span className="block text-xs font-bold text-gray-900 dark:text-white">
                  Confidential Grievance
                </span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                  Restricts visibility strictly to designated Grievance Officers and Super Administrators.
                </span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isConfidential}
              onChange={(e) => setIsConfidential(e.target.checked)}
              className="w-4 h-4 text-coral-500 rounded border-gray-300 focus:ring-coral-500 cursor-pointer"
            />
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-gray-100 dark:border-navy-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-navy-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-navy-800 text-sm font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl bg-coral-500 hover:bg-coral-600 text-white text-sm font-semibold shadow-md shadow-coral-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Submitting Ticket...</span>
                </>
              ) : (
                <span>Submit Ticket</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
