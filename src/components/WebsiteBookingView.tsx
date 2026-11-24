import { ArrowRight, CheckCircle2, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import type { Doctor, PublicQueueEntry } from '../types';

interface WebsiteBookingViewProps {
  doctors: Doctor[];
  defaultDoctorId: string;
  onBookingConfirmed: (tokenNumber: string) => void;
}

export function WebsiteBookingView({
  doctors,
  defaultDoctorId,
  onBookingConfirmed,
}: WebsiteBookingViewProps) {
  const [step, setStep] = useState<'details' | 'otp' | 'confirmed'>('details');
  const [doctorId, setDoctorId] = useState(defaultDoctorId || doctors[0]?.id || 'doc-meera');
  const [patientName, setPatientName] = useState('');
  const [mobile, setMobile] = useState('');
  const [notes, setNotes] = useState('');

  const [otpSessionId, setOtpSessionId] = useState('');
  const [maskedMobile, setMaskedMobile] = useState('');
  const [previewOtp, setPreviewOtp] = useState<string | undefined>(undefined);
  const [otpCode, setOtpCode] = useState('');

  const [confirmedEntry, setConfirmedEntry] = useState<PublicQueueEntry | null>(null);
  const [deduplicated, setDeduplicated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDoctor = doctors.find((d) => d.id === doctorId) ?? doctors[0];

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile, channel: 'website' }),
      });
      const body = (await res.json()) as {
        otpSessionId?: string;
        maskedMobile?: string;
        previewCode?: string;
        error?: string;
      };
      if (!res.ok || !body.otpSessionId) {
        throw new Error(body.error || 'Could not send OTP.');
      }
      setOtpSessionId(body.otpSessionId);
      setMaskedMobile(body.maskedMobile || mobile);
      setPreviewOtp(body.previewCode);
      setStep('otp');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyAndBook(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const verifyRes = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpSessionId, mobile, code: otpCode }),
      });
      const verifyBody = (await verifyRes.json()) as {
        verified?: boolean;
        verificationToken?: string;
        error?: string;
      };
      if (!verifyRes.ok || !verifyBody.verificationToken) {
        throw new Error(verifyBody.error || 'OTP verification failed.');
      }

      const bookRes = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName,
          mobile,
          doctorId,
          bookingChannel: 'website',
          notes: notes.trim() || undefined,
          verificationToken: verifyBody.verificationToken,
        }),
      });
      const bookBody = (await bookRes.json()) as {
        entry?: PublicQueueEntry;
        deduplicated?: boolean;
        error?: string;
      };
      if (!bookRes.ok || !bookBody.entry) {
        throw new Error(bookBody.error || 'Could not complete appointment booking.');
      }

      setConfirmedEntry(bookBody.entry);
      setDeduplicated(Boolean(bookBody.deduplicated));
      setStep('confirmed');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setStep('details');
    setOtpCode('');
    setOtpSessionId('');
    setPreviewOtp(undefined);
    setConfirmedEntry(null);
    setDeduplicated(false);
    setError(null);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-5">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Website Appointment Booking
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Verify your mobile number via 6-digit OTP to receive a synchronized queue token.
            </p>
          </div>
          <span className="text-xs font-mono-tabular text-slate-500">
            Step {step === 'details' ? '1' : step === 'otp' ? '2' : '3'} / 3
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 p-3.5 rounded-lg border border-rose-200 bg-rose-50 text-sm text-rose-800"
          >
            {error}
          </div>
        )}

        {step === 'details' && (
          <form onSubmit={handleRequestOtp} className="mt-6 space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-2">
                Select Doctor
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {doctors.map((doc) => {
                  const active = doc.id === doctorId;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => setDoctorId(doc.id)}
                      className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-teal-700 bg-teal-50/40 ring-1 ring-teal-700'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {doc.name}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {doc.department}
                      </div>
                      <div className="text-xs font-mono-tabular text-teal-700 mt-1.5">
                        {doc.avgConsultMinutes} min avg · {doc.room}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="wb-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Patient Full Name
                </label>
                <input
                  id="wb-name"
                  type="text"
                  required
                  minLength={2}
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="e.g. Arun Kumar"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
                />
              </div>
              <div>
                <label htmlFor="wb-mobile" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Mobile Number (10 digits)
                </label>
                <input
                  id="wb-mobile"
                  type="tel"
                  required
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono-tabular focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="wb-notes" className="block text-xs font-medium text-slate-700 mb-1.5">
                Visit Reason (Optional)
              </label>
              <input
                id="wb-notes"
                type="text"
                maxLength={200}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Fever & general checkup"
                className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
              />
            </div>

            <div className="pt-2 flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500">
                No account password needed — verified via SMS OTP.
              </span>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {loading ? 'Sending OTP...' : 'Send Verification OTP'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyAndBook} className="mt-6 space-y-5">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex items-start gap-3">
              <Smartphone className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-700">
                <p>
                  Enter the 6-digit verification code sent to{' '}
                  <strong className="font-mono-tabular">{maskedMobile}</strong>.
                </p>
                {previewOtp && (
                  <p className="mt-2 text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded px-2.5 py-1.5 inline-block">
                    Sandbox SMS Preview Code:{' '}
                    <strong className="font-mono-tabular text-sm">{previewOtp}</strong>
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="wb-otp" className="block text-xs font-medium text-slate-700 mb-1.5">
                6-Digit OTP Code
              </label>
              <input
                id="wb-otp"
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-48 px-4 py-2.5 text-lg tracking-widest font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
              />
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {loading ? 'Verifying & Booking...' : 'Verify OTP & Confirm Token'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('details');
                  setError(null);
                }}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Edit Details
              </button>
            </div>
          </form>
        )}

        {step === 'confirmed' && confirmedEntry && (
          <div className="mt-6 space-y-6">
            <div className="p-5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-emerald-950">
                  {deduplicated
                    ? 'Active Appointment Found (Duplicate Prevented)'
                    : 'Appointment Confirmed'}
                </h2>
                <p className="text-sm text-emerald-900 mt-0.5">
                  Your token has been allocated centrally with {selectedDoctor?.name}.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <span className="text-xs text-slate-500 block">Token Number</span>
                <span className="text-2xl font-bold font-mono-tabular text-teal-700">
                  {confirmedEntry.tokenNumber}
                </span>
              </div>
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <span className="text-xs text-slate-500 block">Patients Ahead</span>
                <span className="text-2xl font-bold font-mono-tabular text-slate-900">
                  {confirmedEntry.queuePosition}
                </span>
              </div>
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <span className="text-xs text-slate-500 block">Est. Wait</span>
                <span className="text-2xl font-bold font-mono-tabular text-slate-900">
                  ~{confirmedEntry.estimatedWaitingTime}m
                </span>
              </div>
              <div className="p-4 rounded-lg border border-slate-200 bg-slate-50">
                <span className="text-xs text-slate-500 block">Tracking Ref</span>
                <span className="text-xs font-mono-tabular font-semibold text-slate-800 break-all">
                  {confirmedEntry.trackingCode}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onBookingConfirmed(confirmedEntry.tokenNumber)}
                className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer"
              >
                Track Live Token {confirmedEntry.tokenNumber}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                Book Another Appointment
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right Context Column */}
      <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-teal-700" />
          <h2 className="text-sm font-semibold text-slate-900">
            Centralized Token Allocation Safeguards
          </h2>
        </div>

        <dl className="space-y-4 text-sm">
          <div className="pb-3 border-b border-slate-100">
            <dt className="font-medium text-slate-900">1. Concurrency-Safe Token Locking</dt>
            <dd className="text-slate-600 mt-1 text-xs leading-relaxed">
              Website, WhatsApp, and Receptionist bookings acquire an atomic per-doctor queue lock before allocating your sequential token.
            </dd>
          </div>
          <div className="pb-3 border-b border-slate-100">
            <dt className="font-medium text-slate-900">2. Duplicate Booking Protection</dt>
            <dd className="text-slate-600 mt-1 text-xs leading-relaxed">
              Repeated submissions from the same mobile number for the same doctor today return your existing active token instead of double-booking.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-900">3. 30-Minute Advance Reminder</dt>
            <dd className="text-slate-600 mt-1 text-xs leading-relaxed">
              When your estimated wait reaches 30 minutes or less, MediFlow automatically dispatches an arrival alert via SMS/WhatsApp.
            </dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
