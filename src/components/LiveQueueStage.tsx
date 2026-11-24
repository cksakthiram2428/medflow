import { ArrowRight, Bell, Clock, Search, UserCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import type { LiveQueueResponse, PublicQueueEntry, TokenStatus, TokenTrackingResult } from '../types';

interface LiveQueueStageProps {
  queueData: LiveQueueResponse | null;
  selectedDoctorId: string;
  onSelectDoctor: (doctorId: string) => void;
  trackedTokenQuery: string;
  onTrackTokenQueryChange: (token: string) => void;
  onNavigateBook: () => void;
  onNavigateWhatsApp: () => void;
}

const STATUS_META: Record<
  TokenStatus,
  { label: string; blockClass: string; textClass: string; borderClass: string }
> = {
  serving: {
    label: 'Serving',
    blockClass: 'bg-teal-700 text-white shadow-lg shadow-teal-900/15',
    textClass: 'text-teal-700',
    borderClass: 'border-teal-700',
  },
  next: {
    label: 'Next',
    blockClass: 'bg-amber-50 text-amber-950 border-amber-400',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-400',
  },
  waiting: {
    label: 'Waiting',
    blockClass: 'bg-white text-slate-900 border-slate-300',
    textClass: 'text-slate-700',
    borderClass: 'border-slate-300',
  },
  completed: {
    label: 'Completed',
    blockClass: 'bg-emerald-50 text-emerald-900 border-emerald-200 opacity-75',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
  },
  skipped: {
    label: 'Skipped',
    blockClass: 'bg-rose-50 text-rose-900 border-rose-200 opacity-80',
    textClass: 'text-rose-700',
    borderClass: 'border-rose-200',
  },
  cancelled: {
    label: 'Cancelled',
    blockClass: 'bg-slate-100 text-slate-500 border-slate-200 opacity-60',
    textClass: 'text-slate-500',
    borderClass: 'border-slate-200',
  },
};

function formatChannelName(channel: string): string {
  if (channel === 'whatsapp') return 'WhatsApp';
  if (channel === 'receptionist') return 'Receptionist';
  return 'Website';
}

export function LiveQueueStage({
  queueData,
  selectedDoctorId,
  onSelectDoctor,
  trackedTokenQuery,
  onTrackTokenQueryChange,
  onNavigateBook,
  onNavigateWhatsApp,
}: LiveQueueStageProps) {
  const [searchInput, setSearchInput] = useState(trackedTokenQuery);
  const [trackedResult, setTrackedResult] = useState<TokenTrackingResult | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  useEffect(() => {
    setSearchInput(trackedTokenQuery);
  }, [trackedTokenQuery]);

  const activeQueue = useMemo(() => {
    if (!queueData) return null;
    return (
      queueData.queues[selectedDoctorId] ??
      Object.values(queueData.queues)[0] ??
      null
    );
  }, [queueData, selectedDoctorId]);

  const defaultSpotlightEntry = useMemo(() => {
    if (!activeQueue) return null;
    return (
      activeQueue.entries.find((e) => e.status === 'next') ??
      activeQueue.entries.find((e) => e.status === 'waiting') ??
      activeQueue.serving ??
      null
    );
  }, [activeQueue]);

  useEffect(() => {
    const query = trackedTokenQuery.trim();
    if (!query) {
      setTrackedResult(null);
      setTrackError(null);
      return;
    }

    let cancelled = false;
    setTrackingLoading(true);
    fetch(`/api/queue/${encodeURIComponent(query)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || 'Token not found');
        }
        return (await res.json()) as TokenTrackingResult;
      })
      .then((data) => {
        if (!cancelled) {
          setTrackedResult(data);
          setTrackError(null);
          if (data.doctor.id !== selectedDoctorId) {
            onSelectDoctor(data.doctor.id);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setTrackedResult(null);
          setTrackError((err as Error).message);
        }
      })
      .finally(() => {
        if (!cancelled) setTrackingLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trackedTokenQuery, queueData, selectedDoctorId, onSelectDoctor]);

  const spotlightEntry: PublicQueueEntry | null =
    trackedResult?.entry ?? defaultSpotlightEntry;

  const visibleRailTokens = useMemo(() => {
    if (!activeQueue) return [];
    const activeAndRecent = activeQueue.entries.filter(
      (e) => e.status !== 'cancelled',
    );
    const servingIdx = activeAndRecent.findIndex((e) => e.status === 'serving');
    const startIdx = servingIdx > 1 ? servingIdx - 1 : 0;
    return activeAndRecent.slice(startIdx, startIdx + 8);
  }, [activeQueue]);

  function handleTrackSubmit(e: React.FormEvent) {
    e.preventDefault();
    onTrackTokenQueryChange(searchInput.trim().toUpperCase());
  }

  if (!queueData || !activeQueue) {
    return (
      <div className="space-y-6">
        <div className="h-44 rounded-xl border border-slate-200 bg-white animate-pulse" />
        <div className="h-80 rounded-xl border border-slate-200 bg-white animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Split: Clinical Queue Overview + Live Token Tracker */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
          <div>
            <p className="text-xs font-medium text-teal-700 tracking-wide">
              Centralized Hospital Queue · {queueData.date}
            </p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Book Anywhere. Track Everywhere. Wait Less.
            </h1>
            <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
              Website, WhatsApp, and Receptionist bookings synchronize to a single real-time queue.
              Select any token on the 3D rail below or enter your token number to monitor your position.
            </p>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onNavigateBook}
              className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Book via Website OTP
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNavigateWhatsApp}
              className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Book via WhatsApp
            </button>
          </div>
        </div>

        {/* Live Token Tracker Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-semibold text-slate-900">
                Live Appointment Tracker
              </h2>
              <span className="text-xs font-medium text-teal-700">
                Real-Time Sync
              </span>
            </div>

            <form onSubmit={handleTrackSubmit} className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Enter token (e.g. A005)"
                  aria-label="Track token number"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700 font-mono-tabular uppercase"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Track
              </button>
            </form>

            {trackError && (
              <p className="mt-2 text-xs text-rose-700" role="alert">
                {trackError}
              </p>
            )}
          </div>

          {spotlightEntry ? (
            <div className="mt-5 pt-5 border-t border-slate-100 space-y-4">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-500 block">
                    {trackedResult ? 'Tracked Token' : 'Next Highlighted Token'}
                  </span>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl font-bold font-mono-tabular text-slate-900">
                      {spotlightEntry.tokenNumber}
                    </span>
                    <span className={`text-xs font-semibold ${STATUS_META[spotlightEntry.status].textClass}`}>
                      {STATUS_META[spotlightEntry.status].label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    {spotlightEntry.patientDisplay} · {formatChannelName(spotlightEntry.bookingChannel)}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs text-slate-500 block">Now Serving</span>
                  <span className="mt-1 text-2xl font-bold font-mono-tabular text-teal-700 block">
                    {activeQueue.serving?.tokenNumber ?? '—'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
                  <span className="text-xs text-slate-500 block">Patients Ahead</span>
                  <span className="text-xl font-bold font-mono-tabular text-slate-900">
                    {spotlightEntry.queuePosition}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3">
                  <span className="text-xs text-slate-500 block">Estimated Wait</span>
                  <span className="text-xl font-bold font-mono-tabular text-slate-900">
                    {spotlightEntry.status === 'serving'
                      ? 'In Room'
                      : spotlightEntry.status === 'completed'
                        ? 'Done'
                        : `~${spotlightEntry.estimatedWaitingTime} min`}
                  </span>
                </div>
              </div>

              {spotlightEntry.estimatedWaitingTime > 0 &&
                spotlightEntry.estimatedWaitingTime <= 30 && (
                  <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                    <Bell className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <span>
                      30-minute arrival window active: please reach{' '}
                      <strong>{activeQueue.doctor.room}</strong> and monitor the live queue.
                    </span>
                  </div>
                )}

              {trackingLoading && (
                <p className="text-xs text-slate-400">Refreshing token status...</p>
              )}
            </div>
          ) : (
            <div className="mt-6 pt-5 border-t border-slate-100 text-sm text-slate-500">
              No active tokens for {activeQueue.doctor.name} right now.
            </div>
          )}
        </div>
      </section>

      {/* Multi-Doctor Selector Strip */}
      <section aria-label="Hospital Doctors">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Select Department &amp; Consulting Doctor
          </h2>
          <span className="text-xs text-slate-500">
            ETA Formula: Patients Ahead × Avg Consultation Duration (Estimate)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {queueData.doctors.map((doc) => {
            const q = queueData.queues[doc.id];
            const isSelected = doc.id === activeQueue.doctor.id;
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => onSelectDoctor(doc.id)}
                className={`text-left rounded-xl p-4 border transition-colors cursor-pointer flex items-center gap-4 ${
                  isSelected
                    ? 'bg-white border-teal-700 ring-2 ring-teal-700/10'
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                  <img
                    src={doc.avatarUrl}
                    alt={doc.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {doc.name}
                    </span>
                    <span
                      className={`text-xs font-medium shrink-0 ${
                        doc.availability === 'available' ? 'text-teal-700' : 'text-amber-700'
                      }`}
                    >
                      {doc.availability === 'available' ? 'Available' : 'On Break'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {doc.department} · {doc.room}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-600 font-mono-tabular">
                    <span>Serving: {q?.serving?.tokenNumber ?? '—'}</span>
                    <span aria-hidden="true">·</span>
                    <span>Waiting: {q?.waitingCount ?? 0}</span>
                    <span aria-hidden="true">·</span>
                    <span>{doc.avgConsultMinutes}m avg</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3D Linear Token Queue Visualization */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              3D Linear Token Queue · {activeQueue.doctor.name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeQueue.doctor.department} · {activeQueue.doctor.room} · Click any token block to inspect wait estimate
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-teal-700 inline-block" /> Serving
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Next
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-300 inline-block" /> Waiting
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" /> Completed
            </span>
          </div>
        </div>

        {visibleRailTokens.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">
            Queue is currently empty for {activeQueue.doctor.name}. Book the first token to start today&apos;s flow.
          </div>
        ) : (
          <div className="queue-stage-3d py-8 overflow-x-auto">
            <div className="queue-rail-3d relative min-w-[680px] px-4 py-4">
              {/* Linear guide rail */}
              <div
                aria-hidden="true"
                className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-2 bg-slate-100 border border-slate-200 rounded-full"
              />

              <div className="relative flex items-center gap-4 justify-start">
                {visibleRailTokens.map((token) => {
                  const meta = STATUS_META[token.status];
                  const isHighlighted = spotlightEntry?.tokenNumber === token.tokenNumber;

                  return (
                    <motion.button
                      key={token.id}
                      layout
                      type="button"
                      onClick={() => onTrackTokenQueryChange(token.tokenNumber)}
                      className={`token-block-3d relative shrink-0 w-36 text-left rounded-xl p-4 border-2 cursor-pointer ${
                        meta.blockClass
                      } ${
                        isHighlighted && token.status !== 'serving'
                          ? 'ring-2 ring-teal-700 ring-offset-2'
                          : ''
                      }`}
                      style={{
                        boxShadow:
                          token.status === 'serving'
                            ? '0 14px 24px -8px rgba(15, 118, 110, 0.35), 0 6px 0 0 #115e59'
                            : '0 8px 16px -6px rgba(15, 23, 42, 0.08), 0 5px 0 0 #cbd5e1',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wider ${
                            token.status === 'serving' ? 'text-teal-100' : meta.textClass
                          }`}
                        >
                          {meta.label}
                        </span>
                        <span
                          className={`text-[11px] font-mono-tabular ${
                            token.status === 'serving' ? 'text-teal-100' : 'text-slate-400'
                          }`}
                        >
                          #{token.tokenSequence}
                        </span>
                      </div>

                      <div className="mt-2 text-2xl font-bold font-mono-tabular tracking-tight">
                        {token.tokenNumber}
                      </div>

                      <div
                        className={`mt-1 text-xs truncate ${
                          token.status === 'serving' ? 'text-teal-50' : 'text-slate-600'
                        }`}
                      >
                        {token.patientDisplay}
                      </div>

                      <div
                        className={`mt-2 pt-2 border-t text-[11px] font-mono-tabular flex items-center justify-between ${
                          token.status === 'serving'
                            ? 'border-teal-600 text-teal-100'
                            : 'border-slate-100 text-slate-500'
                        }`}
                      >
                        <span>{formatChannelName(token.bookingChannel)}</span>
                        <span>
                          {token.status === 'serving'
                            ? 'Active'
                            : token.status === 'completed'
                              ? 'Done'
                              : `~${token.estimatedWaitingTime}m`}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Queue Progression Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">
            Daily Token Schedule · {activeQueue.doctor.name}
          </h2>
          <span className="text-xs text-slate-500 font-mono-tabular">
            {activeQueue.entries.length} tokens today
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6">Token</th>
                <th className="py-2.5 px-4">Patient</th>
                <th className="py-2.5 px-4">Channel</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Ahead</th>
                <th className="py-2.5 px-6 text-right">Est. Wait</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {activeQueue.entries.map((entry) => {
                const meta = STATUS_META[entry.status];
                return (
                  <tr
                    key={entry.id}
                    onClick={() => onTrackTokenQueryChange(entry.tokenNumber)}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-6 font-mono-tabular font-semibold text-slate-900">
                      {entry.tokenNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-800">{entry.patientDisplay}</td>
                    <td className="py-3 px-4 text-slate-600 text-xs">
                      {formatChannelName(entry.bookingChannel)}
                    </td>
                    <td className={`py-3 px-4 text-xs font-semibold ${meta.textClass}`}>
                      <span className="inline-flex items-center gap-1.5">
                        {entry.status === 'serving' && <UserCheck className="w-3.5 h-3.5" />}
                        {entry.status === 'next' && <Clock className="w-3.5 h-3.5" />}
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-slate-700">
                      {entry.status === 'waiting' || entry.status === 'next'
                        ? entry.queuePosition
                        : '—'}
                    </td>
                    <td className="py-3 px-6 text-right font-mono-tabular text-slate-700">
                      {entry.status === 'waiting' || entry.status === 'next'
                        ? `~${entry.estimatedWaitingTime} min`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
