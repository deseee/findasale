/**
 * Consignor Self-Serve Intake — Appointments (2026-09-25)
 *
 * TEAMS-tier page: a plain day-grouped chronological list of intake appointments (V1 --
 * not a calendar grid, per product decision). Appointments come either from the public
 * intake form (createdBy CONSIGNOR, when a requester picked a time) or from staff booking
 * a phone/walk-in directly here (createdBy ORGANIZER, "+ Add Appointment").
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { useToast } from '../../components/ToastContext';
import TierGate from '../../components/TierGate';
import { ArrowLeft, Clock, Mail, Phone, Plus, X } from 'lucide-react';

interface Appointment {
  id: string;
  consignorId: string | null;
  consignor: { id: string; name: string; email: string | null; phone: string | null } | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  startsAt: string;
  endsAt: string | null;
  status: string; // REQUESTED | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW
  notes: string | null;
  createdBy: string; // ORGANIZER | CONSIGNOR
}

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  CONFIRMED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  COMPLETED: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  CANCELLED: 'bg-warm-200 dark:bg-gray-700 text-warm-600 dark:text-warm-400',
  NO_SHOW: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
};

const dayLabel = (dateStr: string): string => {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
};

const IntakeAppointmentsPage: React.FC = () => {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ contactName: '', contactEmail: '', contactPhone: '', startsAt: '', notes: '' });
  const [isSaving, setIsSaving] = useState(false);

  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleStartsAt, setRescheduleStartsAt] = useState('');
  const [isRescheduling, setIsRescheduling] = useState(false);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const response = await api.get('/intake-appointments');
      setAppointments(response.data || []);
    } catch (error: any) {
      console.error('Error fetching intake appointments:', error);
      showToast('Failed to load appointments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.roles?.includes('ORGANIZER')) {
      fetchAppointments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // NOTE: this hook must run unconditionally, before the auth early-return below
  // (react-hooks/rules-of-hooks) -- CI build failure fixed 2026-09-25.
  const groups = useMemo(() => {
    const active = appointments.filter(a => a.status !== 'CANCELLED');
    const sorted = [...active].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const byDay = new Map<string, Appointment[]>();
    for (const appt of sorted) {
      const key = new Date(appt.startsAt).toDateString();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(appt);
    }
    return Array.from(byDay.entries());
  }, [appointments]);

  if (!authLoading && (!user || !user.roles?.includes('ORGANIZER'))) {
    router.push('/login');
    return null;
  }

  const handleUpdateStatus = async (appt: Appointment, status: string) => {
    try {
      const response = await api.put(`/intake-appointments/${appt.id}`, { status });
      setAppointments(prev => prev.map(a => (a.id === appt.id ? response.data : a)));
      showToast('Appointment updated', 'success');
    } catch (error: any) {
      console.error('Error updating appointment:', error);
      showToast(error.response?.data?.error || 'Failed to update appointment', 'error');
    }
  };

  const handleCancel = async (appt: Appointment) => {
    try {
      const response = await api.delete(`/intake-appointments/${appt.id}`);
      setAppointments(prev => prev.map(a => (a.id === appt.id ? response.data : a)));
      showToast('Appointment cancelled', 'success');
    } catch (error: any) {
      console.error('Error cancelling appointment:', error);
      showToast(error.response?.data?.error || 'Failed to cancel appointment', 'error');
    }
  };

  const handleOpenReschedule = (appt: Appointment) => {
    setRescheduleTarget(appt);
    // datetime-local expects "YYYY-MM-DDTHH:mm" in local time
    const d = new Date(appt.startsAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    setRescheduleStartsAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const handleSubmitReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTarget || !rescheduleStartsAt) return;
    setIsRescheduling(true);
    try {
      const response = await api.put(`/intake-appointments/${rescheduleTarget.id}`, {
        startsAt: new Date(rescheduleStartsAt).toISOString(),
      });
      setAppointments(prev => prev.map(a => (a.id === rescheduleTarget.id ? response.data : a)));
      showToast('Appointment rescheduled', 'success');
      setRescheduleTarget(null);
    } catch (error: any) {
      console.error('Error rescheduling appointment:', error);
      showToast(error.response?.data?.error || 'Failed to reschedule appointment', 'error');
    } finally {
      setIsRescheduling(false);
    }
  };

  const handleAddFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setAddForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.contactName.trim()) {
      showToast('Contact name is required', 'error');
      return;
    }
    if (!addForm.startsAt) {
      showToast('Date/time is required', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const response = await api.post('/intake-appointments', {
        contactName: addForm.contactName.trim(),
        contactEmail: addForm.contactEmail || undefined,
        contactPhone: addForm.contactPhone || undefined,
        startsAt: new Date(addForm.startsAt).toISOString(),
        notes: addForm.notes || undefined,
      });
      setAppointments(prev => [...prev, response.data]);
      showToast('Appointment added', 'success');
      setShowAddModal(false);
      setAddForm({ contactName: '', contactEmail: '', contactPhone: '', startsAt: '', notes: '' });
    } catch (error: any) {
      console.error('Error adding appointment:', error);
      showToast(error.response?.data?.error || 'Failed to add appointment', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (authLoading) {
    return <div>Loading...</div>;
  }

  return (
    <TierGate
      requiredTier="TEAMS"
      featureName="Intake Appointments"
      description="Schedule and track consignor intake appointments. Available on TEAMS and above."
    >
      <Head>
        <title>Intake Appointments | FindA.Sale</title>
      </Head>

      <div className="min-h-screen bg-warm-50 dark:bg-gray-900 p-4 md:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <Link
                href="/organizer/consignors"
                className="inline-flex items-center gap-1 text-sm text-warm-500 dark:text-warm-400 hover:text-warm-700 dark:hover:text-warm-200 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Consignors
              </Link>
              <h1 className="text-3xl font-bold text-warm-900 dark:text-white">Intake Appointments</h1>
              <p className="text-warm-600 dark:text-warm-400 mt-1">
                Drop-off and consult appointments, soonest first
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Appointment
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-warm-600 dark:text-warm-400">Loading appointments...</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-12 text-center">
              <p className="text-warm-600 dark:text-warm-400">No upcoming appointments</p>
            </div>
          ) : (
            <div className="space-y-8">
              {groups.map(([dayKey, dayAppointments]) => (
                <div key={dayKey}>
                  <h2 className="text-sm font-bold text-warm-500 dark:text-warm-400 uppercase mb-3">
                    {dayLabel(dayAppointments[0].startsAt)}
                  </h2>
                  <div className="grid gap-3">
                    {dayAppointments.map(appt => (
                      <div
                        key={appt.id}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-warm-200 dark:border-gray-700 p-4 flex flex-col md:flex-row md:items-center gap-3"
                      >
                        <div className="flex items-center gap-2 text-sm font-bold text-warm-900 dark:text-white md:w-24 flex-shrink-0">
                          <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          {new Date(appt.startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>

                        <div className="flex-1 min-w-0">
                          {appt.consignorId ? (
                            <Link
                              href={`/organizer/consignors/${appt.consignorId}`}
                              className="font-bold text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {appt.contactName}
                            </Link>
                          ) : (
                            <span className="font-bold text-warm-900 dark:text-white">{appt.contactName}</span>
                          )}
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-warm-500 dark:text-warm-400">
                            {appt.contactPhone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" /> {appt.contactPhone}
                              </span>
                            )}
                            {appt.contactEmail && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" /> {appt.contactEmail}
                              </span>
                            )}
                          </div>
                          {appt.notes && (
                            <p className="text-xs text-warm-600 dark:text-warm-300 mt-1">{appt.notes}</p>
                          )}
                        </div>

                        <span className={`text-xs font-bold px-2 py-1 rounded-full flex-shrink-0 ${STATUS_STYLES[appt.status] || ''}`}>
                          {appt.status}
                        </span>

                        <div className="flex flex-wrap gap-2 flex-shrink-0">
                          {appt.status === 'REQUESTED' && (
                            <button
                              onClick={() => handleUpdateStatus(appt, 'CONFIRMED')}
                              className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 rounded-lg font-medium text-xs transition-colors"
                            >
                              Confirm
                            </button>
                          )}
                          {(appt.status === 'REQUESTED' || appt.status === 'CONFIRMED') && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(appt, 'COMPLETED')}
                                className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg font-medium text-xs transition-colors"
                              >
                                Mark Completed
                              </button>
                              <button
                                onClick={() => handleOpenReschedule(appt)}
                                className="px-3 py-1.5 bg-warm-100 dark:bg-gray-700 hover:bg-warm-200 dark:hover:bg-gray-600 text-warm-900 dark:text-warm-100 rounded-lg font-medium text-xs transition-colors"
                              >
                                Reschedule
                              </button>
                              <button
                                onClick={() => handleCancel(appt)}
                                className="px-3 py-1.5 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-lg font-medium text-xs transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Appointment modal (staff-booked phone/walk-in) */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-warm-900 dark:text-white">Add Appointment</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-warm-400 hover:text-warm-600 dark:hover:text-warm-200"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmitAdd}>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Contact Name *
                </label>
                <input
                  type="text"
                  name="contactName"
                  value={addForm.contactName}
                  onChange={handleAddFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  required
                  aria-label="Contact name"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  name="contactPhone"
                  value={addForm.contactPhone}
                  onChange={handleAddFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  aria-label="Phone"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  name="contactEmail"
                  value={addForm.contactEmail}
                  onChange={handleAddFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  aria-label="Email"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Date &amp; Time *
                </label>
                <input
                  type="datetime-local"
                  name="startsAt"
                  value={addForm.startsAt}
                  onChange={handleAddFormChange}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  required
                  aria-label="Date and time"
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={addForm.notes}
                  onChange={handleAddFormChange}
                  rows={2}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                >
                  {isSaving ? 'Saving...' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {rescheduleTarget && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setRescheduleTarget(null)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-warm-900 dark:text-white mb-4">
              Reschedule {rescheduleTarget.contactName}
            </h2>
            <form onSubmit={handleSubmitReschedule}>
              <div className="mb-6">
                <label className="block text-sm font-bold text-warm-700 dark:text-warm-300 mb-1">
                  New Date &amp; Time *
                </label>
                <input
                  type="datetime-local"
                  value={rescheduleStartsAt}
                  onChange={(e) => setRescheduleStartsAt(e.target.value)}
                  className="w-full border border-warm-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  required
                  aria-label="New date and time"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRescheduleTarget(null)}
                  className="flex-1 px-4 py-2 border border-warm-300 dark:border-gray-600 rounded-lg text-warm-700 dark:text-warm-300 hover:bg-warm-50 dark:hover:bg-gray-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRescheduling}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold transition-colors"
                >
                  {isRescheduling ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </TierGate>
  );
};

export default IntakeAppointmentsPage;
