import { Check, Coffee, Play, RotateCcw, SkipForward, Stethoscope } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Doctor, StaffAppointment } from '../types';

interface DoctorConsoleProps {
  authToken: string;
  doctors: Doctor[];
  selectedDoctorId: string;
  onSelectDoctor: (doctorId: string) => void;
  onRefreshQueue: () => void;
}

export function DoctorConsole({
  authToken,
  doctors,
  selectedDoctorId,
  onSelectDoctor,
  onRefreshQueue,
}: DoctorConsoleProps) {
  const [appointments, setAppointments] = useState<StaffAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeDoctor =
    doctors.find((d) => d.id === selectedDoctorId) ?? doctors[0];

  const loadDoctorAppointments = useCallback(async () => {
    if (!activeDoctor) return;
    try {
      const res = await fetch(
        `/api/staff/appointments?doctorId=${encodeURIComponent(activeDoctor.id)}`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
      if (!res.ok) throw new Error('Failed to load doctor queue.');
      const data = (await res.json()) as { appointments: StaffAppointment[] };
      setAppointments(data.appointments);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [authToken, activeDoctor]);

  useEffect(() => {
    void loadDoctorAppointments();
  }, [loadDoctorAppointments]);

  const serving = useMemo(
    () => appointments.find((a) => a.status === 'serving') ?? null,
    [appointments],
  );

  const waitingList = useMemo(
    () =>
      appointments.filter((a) => a.status === 'next' || a.status === 'waiting'),
    [appointments],
  );

  const skippedList = useMemo(
    () => appointments.filter((a) => a.status === 'skipped'),
    [appointments],
  );

  const completedCount = useMemo(
    () => appointments.filter((a) => a.status === 'completed').length,
    [appointments],
  );

  async function callNextPatient() {
    if (!activeDoctor) return;
    setError(null);
    setBusyId('call-next');
    try {
      const res = await fetch('/api/queue/call-next', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ doctorId: activeDoctor.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Could not call next patient.');
      await loadDoctorAppointments();
      onRefreshQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function updateTokenStatus(
    appointmentId: string,
    action: 'start_serving' | 'complete' | 'skip' | 'recall',
  ) {
    setError(null);
    setBusyId(appointmentId);
    try {
      const res = await fetch(`/api/queue/${appointmentId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ action }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Action failed.');
      await loadDoctorAppointments();
      onRefreshQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleBreak() {
    if (!activeDoctor) return;
    setError(null);
    setBusyId('break-toggle');
    try {
      const nextState =
        activeDoctor.availability === 'available' ? 'on_break' : 'available';
      const res = await fetch(`/api/doctors/${activeDoctor.id}/availability`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ availability: nextState }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Could not update availability.');
      onRefreshQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  if (!activeDoctor) return null;

  return (
    <div className="space-y-6">
      {/* Doctor Switcher & Availability Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <img
            src={activeDoctor.avatarUrl}
            alt={activeDoctor.name}
            referrerPolicy="no-referrer"
            className="w-12 h-12 rounded-lg object-cover border border-slate-200"
          />
          <div>
            <div className="flex items-center gap-3">
              <select
                value={activeDoctor.id}
                onChange={(e) => onSelectDoctor(e.target.value)}
                aria-label="Select consulting doctor"
                className="text-base font-bold text-slate-900 bg-transparent border-b border-slate-300 pb-0.5 focus:outline-none focus:border-teal-700"
              >
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <span
                className={`text-xs font-semibold ${
                  activeDoctor.availability === 'available'
                    ? 'text-teal-700'
                    : 'text-amber-700'
                }`}
              >
                {activeDoctor.availability === 'available' ? 'Available' : 'On Break'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {activeDoctor.department} · {activeDoctor.room} · Completed today:{' '}
              <span className="font-mono-tabular font-semibold text-slate-700">
                {completedCount}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busyId === 'break-toggle'}
            onClick={() => void toggleBreak()}
            className="px-4 py-2 text-xs font-medium border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg inline-flex items-center gap-2 cursor-pointer"
          >
            <Coffee className="w-4 h-4 text-amber-700" />
            {activeDoctor.availability === 'available' ? 'Pause (On Break)' : 'Resume Consultations'}
          </button>

          <button
            type="button"
            disabled={busyId === 'call-next' || waitingList.length === 0}
            onClick={() => void callNextPatient()}
            className="px-4 py-2 text-xs font-medium bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white rounded-lg inline-flex items-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4" />
            {serving ? 'Complete & Call Next' : 'Call Next Patient'}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Active Consultation Focal Anchor */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-teal-700" />
              <h2 className="text-base font-semibold text-slate-900">
                Currently Consulting
              </h2>
            </div>
            <span className="text-xs text-slate-500">{activeDoctor.room}</span>
          </div>

          {loading ? (
            <div className="h-44 bg-slate-100 rounded-lg animate-pulse" />
          ) : serving ? (
            <div className="space-y-5">
              <div className="p-5 rounded-xl bg-teal-50/60 border border-teal-200">
                <div className="flex items-baseline justify-between">
                  <span className="text-4xl font-bold font-mono-tabular text-teal-800">
                    {serving.tokenNumber}
                  </span>
                  <span className="text-xs font-medium text-teal-800 capitalize">
                    Booked via {serving.bookingChannel}
                  </span>
                </div>
                <div className="mt-3 text-lg font-semibold text-slate-900">
                  {serving.patientName}
                </div>
                <div className="text-xs font-mono-tabular text-slate-600 mt-1">
                  Mobile: {serving.mobile}
                </div>
                {serving.notes && (
                  <p className="mt-3 text-xs text-slate-700 bg-white/80 border border-teal-100 rounded p-2.5">
                    Notes: {serving.notes}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busyId === serving.id}
                  onClick={() => void updateTokenStatus(serving.id, 'complete')}
                  className="py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  Complete Consultation
                </button>
                <button
                  type="button"
                  disabled={busyId === serving.id}
                  onClick={() => void updateTokenStatus(serving.id, 'skip')}
                  className="py-2.5 px-4 border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-800 text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <SkipForward className="w-4 h-4 text-rose-700" />
                  Skip Patient
                </button>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-500">
                No patient is currently inside {activeDoctor.room}.
              </p>
              {waitingList.length > 0 && (
                <button
                  type="button"
                  onClick={() => void callNextPatient()}
                  className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Call Next Token ({waitingList[0].tokenNumber})
                </button>
              )}
            </div>
          )}
        </section>

        {/* Right: Waiting & Skipped Queues */}
        <section className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Upcoming Queue ({waitingList.length})
              </h2>
              <span className="text-xs text-slate-500">Ordered by Token Sequence</span>
            </div>

            {waitingList.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                All waiting tokens have been consulted.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {waitingList.map((apt) => (
                  <div
                    key={apt.id}
                    className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/70"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-base font-bold font-mono-tabular text-slate-900 w-14">
                        {apt.tokenNumber}
                      </span>
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {apt.patientName}
                          {apt.status === 'next' && (
                            <span className="ml-2 text-xs font-semibold text-amber-700">
                              · Up Next
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 font-mono-tabular">
                          {apt.bookingChannel} · Est. {apt.estimatedWaitingTime}m
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === apt.id}
                        onClick={() => void updateTokenStatus(apt.id, 'start_serving')}
                        className="px-3 py-1.5 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-white rounded-md cursor-pointer"
                      >
                        Start Now
                      </button>
                      <button
                        type="button"
                        disabled={busyId === apt.id}
                        onClick={() => void updateTokenStatus(apt.id, 'skip')}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-md cursor-pointer"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {skippedList.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-900">
                  Skipped Patients ({skippedList.length})
                </h2>
              </div>
              <div className="divide-y divide-slate-100">
                {skippedList.map((apt) => (
                  <div
                    key={apt.id}
                    className="px-5 py-3 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono-tabular font-bold text-rose-700">
                        {apt.tokenNumber}
                      </span>
                      <span className="text-sm text-slate-800">{apt.patientName}</span>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === apt.id}
                      onClick={() => void updateTokenStatus(apt.id, 'recall')}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-300 hover:bg-slate-50 text-slate-800 rounded-md inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Recall to Queue
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
