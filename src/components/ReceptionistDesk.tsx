import { Plus, Search, UserPlus, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookingChannel, Doctor, PatientRecord, StaffAppointment, TokenStatus } from '../types';

interface ReceptionistDeskProps {
  authToken: string;
  doctors: Doctor[];
  onRefreshQueue: () => void;
}

export function ReceptionistDesk({
  authToken,
  doctors,
  onRefreshQueue,
}: ReceptionistDeskProps) {
  const [appointments, setAppointments] = useState<StaffAppointment[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Registration / Booking Form
  const [patientSearch, setPatientSearch] = useState('');
  const [patientName, setPatientName] = useState('');
  const [mobile, setMobile] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [doctorId, setDoctorId] = useState(doctors[0]?.id || 'doc-meera');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Table Filters
  const [tableQuery, setTableQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState<'all' | BookingChannel>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | TokenStatus>('all');

  const fetchStaffData = useCallback(async () => {
    try {
      const [aptsRes, patRes] = await Promise.all([
        fetch('/api/staff/appointments', {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch('/api/staff/patients', {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      ]);

      if (!aptsRes.ok) throw new Error('Unable to fetch daily appointments.');
      const aptsBody = (await aptsRes.json()) as { appointments: StaffAppointment[] };
      setAppointments(aptsBody.appointments);

      if (patRes.ok) {
        const patBody = (await patRes.json()) as { patients: PatientRecord[] };
        setPatients(patBody.patients);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void fetchStaffData();
  }, [fetchStaffData]);

  const matchingPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return [];
    return patients
      .filter((p) => p.name.toLowerCase().includes(q) || p.mobile.includes(q))
      .slice(0, 5);
  }, [patients, patientSearch]);

  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (channelFilter !== 'all' && a.bookingChannel !== channelFilter) return false;
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (tableQuery.trim()) {
        const q = tableQuery.trim().toLowerCase();
        return (
          a.tokenNumber.toLowerCase().includes(q) ||
          a.patientName.toLowerCase().includes(q) ||
          a.mobile.includes(q)
        );
      }
      return true;
    });
  }, [appointments, channelFilter, statusFilter, tableQuery]);

  async function handleCreateBooking(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          patientName,
          mobile,
          doctorId,
          bookingChannel: 'receptionist',
          age: age ? Number(age) : undefined,
          gender,
          notes: notes.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        entry?: { tokenNumber: string };
        deduplicated?: boolean;
        error?: string;
      };
      if (!res.ok || !body.entry) {
        throw new Error(body.error || 'Failed to register walk-in token.');
      }

      setSuccessMsg(
        body.deduplicated
          ? `Patient already has active token ${body.entry.tokenNumber} for this doctor today.`
          : `Token ${body.entry.tokenNumber} generated and synchronized across all live boards.`,
      );
      setPatientName('');
      setMobile('');
      setAge('');
      setNotes('');
      setPatientSearch('');
      await fetchStaffData();
      onRefreshQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(appointmentId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || 'Cancel failed');
      }
      await fetchStaffData();
      onRefreshQueue();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleReschedule(appointmentId: string, newDoctorId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/reschedule`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ doctorId: newDoctorId }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || 'Reschedule failed');
      }
      await fetchStaffData();
      onRefreshQueue();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Walk-in Patient Registration & Token Generation */}
      <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
          <UserPlus className="w-5 h-5 text-teal-700" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Receptionist Booking
            </h2>
            <p className="text-xs text-slate-500">
              Walk-in &amp; phone registration via centralized queue
            </p>
          </div>
        </div>

        {/* Quick Search Existing Patient */}
        <div>
          <label htmlFor="rec-pat-search" className="block text-xs font-medium text-slate-700 mb-1.5">
            Find Existing Patient
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="rec-pat-search"
              type="text"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder="Search name or mobile..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-teal-700"
            />
          </div>
          {matchingPatients.length > 0 && (
            <div className="mt-1.5 border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
              {matchingPatients.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPatientName(p.name);
                    setMobile(p.mobile);
                    if (p.age) setAge(String(p.age));
                    if (p.gender) setGender(p.gender);
                    setPatientSearch('');
                  }}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                >
                  <span className="font-medium text-slate-900">{p.name}</span>
                  <span className="font-mono-tabular text-slate-500">{p.mobile}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleCreateBooking} className="space-y-4">
          <div>
            <label htmlFor="rec-doctor" className="block text-xs font-medium text-slate-700 mb-1.5">
              Assign Doctor
            </label>
            <select
              id="rec-doctor"
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-teal-700"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.department})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rec-name" className="block text-xs font-medium text-slate-700 mb-1.5">
              Patient Full Name
            </label>
            <input
              id="rec-name"
              type="text"
              required
              minLength={2}
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Full name"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>

          <div>
            <label htmlFor="rec-mobile" className="block text-xs font-medium text-slate-700 mb-1.5">
              Mobile Number
            </label>
            <input
              id="rec-mobile"
              type="tel"
              required
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="10-digit mobile"
              className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="rec-age" className="block text-xs font-medium text-slate-700 mb-1.5">
                Age
              </label>
              <input
                id="rec-age"
                type="number"
                min={0}
                max={120}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Years"
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
              />
            </div>
            <div>
              <label htmlFor="rec-gender" className="block text-xs font-medium text-slate-700 mb-1.5">
                Gender
              </label>
              <select
                id="rec-gender"
                value={gender}
                onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other')}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-teal-700"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="rec-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
              Visit Notes
            </label>
            <input
              id="rec-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional symptoms or notes"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {submitting ? 'Generating Token...' : 'Register & Issue Token'}
          </button>
        </form>
      </section>

      {/* Right: Daily Appointments Table */}
      <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Daily Appointment Ledger
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Unified view across Website, WhatsApp, and Receptionist channels
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={tableQuery}
              onChange={(e) => setTableQuery(e.target.value)}
              placeholder="Filter token, name, mobile..."
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-teal-700"
            />
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as 'all' | BookingChannel)}
              aria-label="Filter by channel"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">All Channels</option>
              <option value="website">Website</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="receptionist">Receptionist</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | TokenStatus)}
              aria-label="Filter by status"
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="serving">Serving</option>
              <option value="next">Next</option>
              <option value="waiting">Waiting</option>
              <option value="completed">Completed</option>
              <option value="skipped">Skipped</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 space-y-3">
            <div className="h-9 bg-slate-100 rounded animate-pulse" />
            <div className="h-9 bg-slate-100 rounded animate-pulse" />
            <div className="h-9 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No appointments match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <th className="py-2.5 px-4">Token</th>
                  <th className="py-2.5 px-4">Patient</th>
                  <th className="py-2.5 px-4">Mobile</th>
                  <th className="py-2.5 px-4">Doctor</th>
                  <th className="py-2.5 px-4">Channel</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredAppointments.map((apt) => {
                  const canModify =
                    apt.status !== 'completed' && apt.status !== 'cancelled';
                  return (
                    <tr key={apt.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-mono-tabular font-bold text-slate-900">
                        {apt.tokenNumber}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {apt.patientName}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-600">
                        {apt.mobile}
                      </td>
                      <td className="py-3 px-4">
                        {canModify ? (
                          <select
                            value={apt.doctorId}
                            onChange={(e) => void handleReschedule(apt.id, e.target.value)}
                            aria-label={`Assign doctor for ${apt.tokenNumber}`}
                            className="px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                          >
                            {doctors.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-slate-600">
                            {doctors.find((d) => d.id === apt.doctorId)?.name ?? apt.doctorId}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 capitalize text-slate-600">
                        {apt.bookingChannel}
                      </td>
                      <td className="py-3 px-4 font-semibold capitalize text-slate-800">
                        {apt.status}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {canModify ? (
                          <button
                            type="button"
                            onClick={() => void handleCancel(apt.id)}
                            className="inline-flex items-center gap-1 text-rose-700 hover:text-rose-900 font-medium cursor-pointer"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
