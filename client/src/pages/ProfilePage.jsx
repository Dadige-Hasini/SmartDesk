import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import {
  User,
  Mail,
  GraduationCap,
  Building,
  Phone,
  Calendar,
  ShieldCheck,
  Check,
  Loader2,
  AlertCircle,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  // Controlled form state
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phoneNumber, setPhoneNumber] = useState(profile?.phone_number || '');
  const [yearOfStudy, setYearOfStudy] = useState(profile?.year_of_study || 1);
  const [errors, setErrors] = useState({});

  // Validation
  const validate = () => {
    const errs = {};
    if (!fullName.trim() || fullName.trim().length < 2) {
      errs.fullName = 'Full name must be at least 2 characters.';
    }

    if (phoneNumber && !/^[0-9+\s-]{8,15}$/.test(phoneNumber.trim())) {
      errs.phoneNumber = 'Please enter a valid contact phone number (8-15 digits).';
    }

    if (yearOfStudy < 1 || yearOfStudy > 5) {
      errs.yearOfStudy = 'Year of study must be between 1 and 5.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // Profile update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.patch('/auth/profile', {
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim() || null,
        yearOfStudy: parseInt(yearOfStudy, 10),
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Profile details updated successfully');
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'Failed to update profile details.';
      toast.error(msg);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      updateMutation.mutate();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fadeIn pb-12">
      {/* Header Banner */}
      <div className="p-8 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-navy-900 to-coral-500 text-white flex items-center justify-center font-extrabold text-2xl shadow-lg uppercase">
            {profile?.full_name?.[0] || 'S'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-white">
                {profile?.full_name || 'Student Account'}
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-coral-500/10 text-coral-500 uppercase tracking-wider">
                {profile?.role || 'Student'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
              <Mail className="w-3.5 h-3.5" />
              <span>{profile?.email || user?.email}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/20">
            <ShieldCheck className="w-4 h-4" />
            <span>Account Active</span>
          </span>
        </div>
      </div>

      {/* Main Grid: Academic Credentials & Editable Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Academic Credentials (Read-only verified records) */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
            College Academic Records
          </h2>

          <div className="p-6 rounded-3xl bg-white dark:bg-navy-900 border border-gray-200 dark:border-navy-800 shadow-sm space-y-4">
            <div>
              <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Roll / Registration Number
              </span>
              <span className="font-mono text-sm font-extrabold text-gray-900 dark:text-white mt-0.5 block">
                {profile?.roll_number || 'STU-2026-0042'}
              </span>
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-navy-800">
              <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Academic Department
              </span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 block flex items-center gap-1.5">
                <Building className="w-4 h-4 text-coral-500" />
                {profile?.department?.name || 'Computer Science & Engineering'}
              </span>
            </div>

            <div className="pt-3 border-t border-gray-100 dark:border-navy-800">
              <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Institutional Email
              </span>
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5 block truncate">
                {profile?.email || user?.email}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-gray-50 dark:bg-navy-950/70 border border-gray-100 dark:border-navy-800 text-[11px] text-gray-500">
              Department and roll number are verified college records. Contact the Registrar Office to request updates to official academic identity.
            </div>
          </div>
        </div>

        {/* Editable Student Details Form */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-400">
            Personal & Contact Settings
          </h2>

          <div className="bg-white dark:bg-navy-900 rounded-3xl border border-gray-200 dark:border-navy-800 shadow-sm p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Full Name */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Full Name <span className="text-coral-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      setErrors((prev) => ({ ...prev, fullName: undefined }));
                    }}
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${
                      errors.fullName
                        ? 'border-rose-500 focus:ring-rose-400'
                        : 'border-gray-200 dark:border-navy-800 focus:border-coral-500 focus:ring-coral-400'
                    } bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm outline-none transition-all`}
                  />
                </div>
                {errors.fullName && (
                  <p className="text-xs text-rose-500 font-medium">{errors.fullName}</p>
                )}
              </div>

              {/* Phone Number */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Contact Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
                    }}
                    placeholder="+91 98765 43210"
                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${
                      errors.phoneNumber
                        ? 'border-rose-500 focus:ring-rose-400'
                        : 'border-gray-200 dark:border-navy-800 focus:border-coral-500 focus:ring-coral-400'
                    } bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm outline-none transition-all`}
                  />
                </div>
                {errors.phoneNumber && (
                  <p className="text-xs text-rose-500 font-medium">{errors.phoneNumber}</p>
                )}
                <p className="text-[11px] text-gray-400">
                  Used by departmental staff for urgent support inquiries.
                </p>
              </div>

              {/* Year of Study */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Current Year of Study
                </label>
                <div className="relative">
                  <GraduationCap className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
                  <select
                    value={yearOfStudy}
                    onChange={(e) => {
                      setYearOfStudy(parseInt(e.target.value, 10));
                      setErrors((prev) => ({ ...prev, yearOfStudy: undefined }));
                    }}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 dark:border-navy-800 bg-white dark:bg-navy-950 text-gray-900 dark:text-white text-sm outline-none focus:border-coral-500 transition-all"
                  >
                    <option value={1}>1st Year (Freshman)</option>
                    <option value={2}>2nd Year (Sophomore)</option>
                    <option value={3}>3rd Year (Junior)</option>
                    <option value={4}>4th Year (Senior)</option>
                    <option value={5}>5th Year (Dual Degree / Integrated)</option>
                  </select>
                </div>
                {errors.yearOfStudy && (
                  <p className="text-xs text-rose-500 font-medium">{errors.yearOfStudy}</p>
                )}
              </div>

              {/* Save Button */}
              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-coral-500 hover:bg-coral-600 disabled:opacity-50 shadow-lg shadow-coral-500/25 transition-transform hover:-translate-y-0.5"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{updateMutation.isPending ? 'Saving...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
