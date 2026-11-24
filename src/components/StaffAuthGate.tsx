import { KeyRound, Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { StaffRole } from '../types';

export interface StaffSession {
  token: string;
  role: StaffRole;
  staffName: string;
}

interface StaffAuthGateProps {
  session: StaffSession | null;
  onAuthenticated: (session: StaffSession) => void;
  defaultRole?: StaffRole;
}

export function StaffAuthGate({
  session,
  onAuthenticated,
  defaultRole = 'receptionist',
}: StaffAuthGateProps) {
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState('');
  const [role, setRole] = useState<StaffRole>(defaultRole);
  const [staffName, setStaffName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRole(defaultRole);
  }, [defaultRole]);

  useEffect(() => {
    if (session) return;
    fetch('/api/staff/auth-status')
      .then((res) => res.json())
      .then((data: { needsSetup?: boolean }) => {
        setNeedsSetup(Boolean(data.needsSetup));
      })
      .catch(() => setNeedsSetup(false));
  }, [session]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = needsSetup ? '/api/staff/claim' : '/api/staff/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passcode,
          role,
          staffName: staffName.trim() || undefined,
        }),
      });
      const body = (await res.json()) as {
        token?: string;
        role?: StaffRole;
        staffName?: string;
        error?: string;
      };
      if (!res.ok || !body.token || !body.role) {
        throw new Error(body.error || 'Authentication failed.');
      }
      onAuthenticated({
        token: body.token,
        role: body.role,
        staffName: body.staffName || 'Hospital Staff',
      });
      setPasscode('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (needsSetup === null) {
    return (
      <div className="max-w-md mx-auto bg-white border border-slate-200 rounded-xl p-8 animate-pulse h-64" />
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
          {needsSetup ? <KeyRound className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">
            {needsSetup ? 'First-Run Staff Passcode Setup' : 'Hospital Staff Sign-In'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {needsSetup
              ? 'Create a staff passcode to protect Receptionist, Doctor, and Admin consoles.'
              : 'Authenticate to manage appointments, call patient tokens, and configure hospital settings.'}
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">
            Operational Role
          </label>
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-lg">
            {(['receptionist', 'doctor', 'admin'] as StaffRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`py-2 px-3 text-xs font-medium rounded-md capitalize transition-colors cursor-pointer ${
                  role === r
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="staff-name" className="block text-xs font-medium text-slate-700 mb-1.5">
            Staff Name (Optional)
          </label>
          <input
            id="staff-name"
            type="text"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            placeholder="e.g. Priya Desk / Dr. Meera"
            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
          />
        </div>

        <div>
          <label htmlFor="staff-passcode" className="block text-xs font-medium text-slate-700 mb-1.5">
            {needsSetup ? 'Choose Staff Passcode (min. 4 characters)' : 'Staff Passcode'}
          </label>
          <input
            id="staff-passcode"
            type="password"
            required
            minLength={4}
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter passcode"
            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          {loading
            ? 'Verifying...'
            : needsSetup
              ? 'Save Passcode & Enter Workspace'
              : 'Sign In to Staff Workspace'}
        </button>
      </form>
    </div>
  );
}
