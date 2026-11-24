import { Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { AdminAnalyticsResponse, StaffRole } from '../types';

interface AdminAnalyticsViewProps {
  authToken: string;
  role: StaffRole;
  onRefreshQueue: () => void;
}

export function AdminAnalyticsView({
  authToken,
  role,
  onRefreshQueue,
}: AdminAnalyticsViewProps) {
  const [data, setData] = useState<AdminAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  // Settings form state
  const [hospitalName, setHospitalName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [defaultConsultMinutes, setDefaultConsultMinutes] = useState(10);
  const [reminderThresholdMinutes, setReminderThresholdMinutes] = useState(30);
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error('Unable to load hospital analytics.');
      const body = (await res.json()) as AdminAnalyticsResponse;
      setData(body);
      setHospitalName(body.settings.hospitalName);
      setBranchName(body.settings.branchName);
      setDefaultConsultMinutes(body.settings.defaultConsultMinutes);
      setReminderThresholdMinutes(body.settings.reminderThresholdMinutes);
      setN8nWebhookUrl(body.settings.n8nWebhookUrl);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedNotice(null);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          hospitalName,
          branchName,
          defaultConsultMinutes: Number(defaultConsultMinutes),
          reminderThresholdMinutes: Number(reminderThresholdMinutes),
          n8nWebhookUrl,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error || 'Failed to update settings.');
      setSavedNotice('Hospital configuration updated and queue ETAs recalculated.');
      await loadAnalytics();
      onRefreshQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-white border border-slate-200 animate-pulse" />
          ))}
        </div>
        <div className="h-72 rounded-xl bg-white border border-slate-200 animate-pulse" />
      </div>
    );
  }

  const totalChannels = Math.max(
    1,
    data.byChannel.website + data.byChannel.whatsapp + data.byChannel.receptionist,
  );
  const maxHourCount = Math.max(1, ...data.hourlyDistribution.map((h) => h.count));

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {error}
        </div>
      )}

      {/* 4-Column Full-Width KPI Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs text-slate-500 block">Daily Appointments</span>
          <span className="mt-1.5 text-3xl font-bold font-mono-tabular text-slate-900 block">
            {data.totalAppointments}
          </span>
          <span className="mt-1 text-xs text-slate-500 block">{data.date}</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs text-slate-500 block">Completed Consultations</span>
          <span className="mt-1.5 text-3xl font-bold font-mono-tabular text-emerald-700 block">
            {data.byStatus.completed}
          </span>
          <span className="mt-1 text-xs text-slate-500 block">
            {data.byStatus.waiting + data.byStatus.next} waiting · {data.byStatus.serving} serving
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs text-slate-500 block">Avg Estimated Wait</span>
          <span className="mt-1.5 text-3xl font-bold font-mono-tabular text-slate-900 block">
            {data.avgEstimatedWait} min
          </span>
          <span className="mt-1 text-xs text-slate-500 block">
            Across active queues
          </span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <span className="text-xs text-slate-500 block">Automation Alerts Sent</span>
          <span className="mt-1.5 text-3xl font-bold font-mono-tabular text-teal-700 block">
            {data.remindersSent}
          </span>
          <span className="mt-1 text-xs text-slate-500 block">
            30-min &amp; approaching alerts
          </span>
        </div>
      </section>

      {/* Channel Split & Hourly Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-900">
            Booking Channel Distribution
          </h2>
          <div className="space-y-4">
            {(
              [
                { label: 'Website (OTP)', count: data.byChannel.website, color: 'bg-teal-700' },
                { label: 'WhatsApp (OpenWA)', count: data.byChannel.whatsapp, color: 'bg-emerald-600' },
                { label: 'Receptionist Desk', count: data.byChannel.receptionist, color: 'bg-slate-700' },
              ] as const
            ).map((ch) => {
              const pct = Math.round((ch.count / totalChannels) * 100);
              return (
                <div key={ch.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">{ch.label}</span>
                    <span className="font-mono-tabular text-slate-600">
                      {ch.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${ch.color} rounded-full`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Hourly Patient Intake
            </h2>
            <span className="text-xs text-slate-500">Bookings by hour</span>
          </div>

          {data.hourlyDistribution.length === 0 ? (
            <p className="text-sm text-slate-500 py-10 text-center">
              No hourly intake recorded yet today.
            </p>
          ) : (
            <div className="flex items-end gap-3 h-40 pt-4 border-b border-slate-200">
              {data.hourlyDistribution.map((bucket) => {
                const heightPct = Math.max(12, Math.round((bucket.count / maxHourCount) * 100));
                return (
                  <div
                    key={bucket.hour}
                    className="flex-1 flex flex-col items-center justify-end h-full gap-1.5"
                  >
                    <span className="text-xs font-mono-tabular font-semibold text-slate-700">
                      {bucket.count}
                    </span>
                    <div
                      className="w-full max-w-[44px] bg-teal-700/85 rounded-t-md"
                      style={{ height: `${heightPct}%` }}
                    />
                    <span className="text-[11px] font-mono-tabular text-slate-500 pb-1">
                      {bucket.hour}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Doctor Workload Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">
            Multi-Doctor Queue Workload
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="py-2.5 px-6">Doctor</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Availability</th>
                <th className="py-2.5 px-4">Serving</th>
                <th className="py-2.5 px-4 text-right">Waiting</th>
                <th className="py-2.5 px-4 text-right">Completed</th>
                <th className="py-2.5 px-6 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {data.doctorWorkload.map((doc) => (
                <tr key={doc.doctorId}>
                  <td className="py-3 px-6 font-medium text-slate-900">{doc.doctorName}</td>
                  <td className="py-3 px-4 text-slate-600">{doc.department}</td>
                  <td
                    className={`py-3 px-4 font-medium ${
                      doc.availability === 'available' ? 'text-teal-700' : 'text-amber-700'
                    }`}
                  >
                    {doc.availability === 'available' ? 'Available' : 'On Break'}
                  </td>
                  <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                    {doc.serving ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-slate-700">
                    {doc.waiting}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-emerald-700">
                    {doc.completed}
                  </td>
                  <td className="py-3 px-6 text-right font-mono-tabular font-semibold text-slate-900">
                    {doc.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Notification Log & Hospital Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">
              Notification &amp; n8n Automation Log
            </h2>
            <span className="text-xs text-slate-500">Latest 30 events</span>
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 text-xs">
            {data.recentNotifications.map((n) => (
              <div key={n.id} className="px-6 py-3 flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="font-medium text-slate-900">
                    {n.event.replaceAll('_', ' ')} ·{' '}
                    <span className="font-mono-tabular text-slate-600">
                      {n.tokenNumber ? `#${n.tokenNumber}` : n.recipientMasked}
                    </span>
                  </div>
                  <p className="text-slate-600">{n.message}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="uppercase font-mono-tabular text-[11px] text-teal-700 font-semibold block">
                    {n.channel}
                  </span>
                  <span className="font-mono-tabular text-[11px] text-slate-400">
                    {new Date(n.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Hospital Settings &amp; Queue Timing
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {role === 'admin'
                ? 'Configure consultation duration (T), 30-min reminders, and n8n webhook.'
                : 'Sign in with the Admin role to modify hospital-wide settings.'}
            </p>
          </div>

          {savedNotice && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
              {savedNotice}
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-3.5">
            <div>
              <label htmlFor="set-hosp" className="block text-xs font-medium text-slate-700 mb-1">
                Hospital Name
              </label>
              <input
                id="set-hosp"
                type="text"
                disabled={role !== 'admin'}
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
              />
            </div>

            <div>
              <label htmlFor="set-branch" className="block text-xs font-medium text-slate-700 mb-1">
                Branch / Wing
              </label>
              <input
                id="set-branch"
                type="text"
                disabled={role !== 'admin'}
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="set-consult" className="block text-xs font-medium text-slate-700 mb-1">
                  Avg Consultation T (min)
                </label>
                <input
                  id="set-consult"
                  type="number"
                  min={3}
                  max={60}
                  disabled={role !== 'admin'}
                  value={defaultConsultMinutes}
                  onChange={(e) => setDefaultConsultMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
              </div>
              <div>
                <label htmlFor="set-remind" className="block text-xs font-medium text-slate-700 mb-1">
                  Reminder Lead (min)
                </label>
                <input
                  id="set-remind"
                  type="number"
                  min={10}
                  max={90}
                  disabled={role !== 'admin'}
                  value={reminderThresholdMinutes}
                  onChange={(e) => setReminderThresholdMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
              </div>
            </div>

            <div>
              <label htmlFor="set-n8n" className="block text-xs font-medium text-slate-700 mb-1">
                n8n Automation Webhook URL (Optional)
              </label>
              <input
                id="set-n8n"
                type="url"
                disabled={role !== 'admin'}
                value={n8nWebhookUrl}
                onChange={(e) => setN8nWebhookUrl(e.target.value)}
                placeholder="https://n8n.example.com/webhook/mediflow"
                className="w-full px-3 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg disabled:bg-slate-50"
              />
            </div>

            {role === 'admin' && (
              <button
                type="submit"
                disabled={saving}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-medium rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving Configuration...' : 'Save Hospital Settings'}
              </button>
            )}
          </form>
        </section>
      </div>
    </div>
  );
}
