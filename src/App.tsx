import { Bell, LogOut } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AdminAnalyticsView } from './components/AdminAnalyticsView';
import { DoctorConsole } from './components/DoctorConsole';
import { LiveQueueStage } from './components/LiveQueueStage';
import { ReceptionistDesk } from './components/ReceptionistDesk';
import { StaffAuthGate, type StaffSession } from './components/StaffAuthGate';
import { WebsiteBookingView } from './components/WebsiteBookingView';
import { WhatsAppChannelView } from './components/WhatsAppChannelView';
import type { LiveQueueResponse, NotificationLog, StaffRole } from './types';

type ActiveTab =
  | 'live'
  | 'website'
  | 'whatsapp'
  | 'reception'
  | 'doctor_admin';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('live');
  const [staffSubTab, setStaffSubTab] = useState<'doctor' | 'admin'>('doctor');

  const [queueData, setQueueData] = useState<LiveQueueResponse | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('doc-meera');
  const [trackedTokenQuery, setTrackedTokenQuery] = useState<string>('');

  // In-memory Bearer session (never persisted to localStorage)
  const [staffSession, setStaffSession] = useState<StaffSession | null>(null);
  const [liveToast, setLiveToast] = useState<NotificationLog | null>(null);

  const fetchLiveQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/live');
      if (!res.ok) return;
      const body = (await res.json()) as LiveQueueResponse;
      setQueueData(body);
    } catch {
      // Initial poll fallback handled silently
    }
  }, []);

  useEffect(() => {
    void fetchLiveQueue();

    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('queue:updated', (payload: LiveQueueResponse) => {
      if (payload && payload.queues) {
        setQueueData((prev) => {
          if (!prev) return payload;
          return {
            date: payload.date,
            doctors: payload.doctors,
            queues: {
              ...prev.queues,
              ...payload.queues,
            },
          };
        });
      } else {
        void fetchLiveQueue();
      }
    });

    const refreshOnEvent = () => {
      void fetchLiveQueue();
    };

    socket.on('appointment:created', refreshOnEvent);
    socket.on('appointment:cancelled', refreshOnEvent);
    socket.on('token:called', refreshOnEvent);
    socket.on('consultation:started', refreshOnEvent);
    socket.on('consultation:completed', refreshOnEvent);
    socket.on('eta:updated', refreshOnEvent);

    socket.on('notification:sent', (notif: NotificationLog) => {
      if (
        notif.event === 'reminder_30m' ||
        notif.event === 'token_approaching' ||
        notif.event === 'consultation_started'
      ) {
        setLiveToast(notif);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchLiveQueue]);

  useEffect(() => {
    if (!liveToast) return;
    const timer = setTimeout(() => setLiveToast(null), 6500);
    return () => clearTimeout(timer);
  }, [liveToast]);

  const doctors = queueData?.doctors ?? [];

  function handleJumpToTrackedToken(tokenNumber: string) {
    setTrackedTokenQuery(tokenNumber);
    setActiveTab('live');
  }

  const desiredAuthRole: StaffRole =
    activeTab === 'reception'
      ? 'receptionist'
      : staffSubTab === 'admin'
        ? 'admin'
        : 'doctor';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('live')}
            className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            MediFlow
          </button>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {(
              [
                { id: 'live', label: 'Live Queue' },
                { id: 'website', label: 'Book Online' },
                { id: 'whatsapp', label: 'WhatsApp' },
                { id: 'reception', label: 'Reception' },
                { id: 'doctor_admin', label: 'Doctor & Admin' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'border-teal-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 primary CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('website')}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Book Token
            </button>
          </div>
        </div>

        {/* Mobile Nav Row */}
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
          {(
            [
              { id: 'live', label: 'Live Queue' },
              { id: 'website', label: 'Book Online' },
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'reception', label: 'Reception' },
              { id: 'doctor_admin', label: 'Doctor & Admin' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeTab === item.id
                  ? 'border-teal-700 text-slate-900'
                  : 'border-transparent text-slate-600'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      {/* Live Notification Toast (when Socket.IO emits 30-min / approaching / serving alerts) */}
      {liveToast && (
        <div className="fixed bottom-5 right-5 z-40 max-w-sm bg-slate-900 text-white rounded-xl p-4 shadow-xl border border-slate-700 flex items-start gap-3">
          <Bell className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <div className="font-semibold text-teal-300">
              {liveToast.channel.toUpperCase()} · {liveToast.tokenNumber ?? 'Alert'}
            </div>
            <p className="mt-0.5 text-slate-200">{liveToast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            className="text-xs text-slate-400 hover:text-white ml-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'live' && (
          <LiveQueueStage
            queueData={queueData}
            selectedDoctorId={selectedDoctorId}
            onSelectDoctor={setSelectedDoctorId}
            trackedTokenQuery={trackedTokenQuery}
            onTrackTokenQueryChange={setTrackedTokenQuery}
            onNavigateBook={() => setActiveTab('website')}
            onNavigateWhatsApp={() => setActiveTab('whatsapp')}
          />
        )}

        {activeTab === 'website' && (
          <WebsiteBookingView
            doctors={doctors}
            defaultDoctorId={selectedDoctorId}
            onBookingConfirmed={handleJumpToTrackedToken}
          />
        )}

        {activeTab === 'whatsapp' && (
          <WhatsAppChannelView onTrackToken={handleJumpToTrackedToken} />
        )}

        {activeTab === 'reception' && (
          <div className="space-y-6">
            {!staffSession ? (
              <StaffAuthGate
                session={staffSession}
                onAuthenticated={setStaffSession}
                defaultRole="receptionist"
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-5 py-3">
                  <div className="text-xs text-slate-600">
                    Signed in as <strong className="text-slate-900">{staffSession.staffName}</strong> ·{' '}
                    <span className="capitalize">{staffSession.role}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStaffSession(null)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
                {staffSession.role === 'doctor' ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-900">
                    Receptionist registration requires the Receptionist or Admin role. Sign out and sign in as Receptionist or Admin to register walk-ins.
                  </div>
                ) : (
                  <ReceptionistDesk
                    authToken={staffSession.token}
                    doctors={doctors}
                    onRefreshQueue={() => void fetchLiveQueue()}
                  />
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'doctor_admin' && (
          <div className="space-y-6">
            {!staffSession ? (
              <StaffAuthGate
                session={staffSession}
                onAuthenticated={setStaffSession}
                defaultRole={desiredAuthRole}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-5 py-3">
                  <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setStaffSubTab('doctor')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        staffSubTab === 'doctor'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Doctor Console
                    </button>
                    <button
                      type="button"
                      onClick={() => setStaffSubTab('admin')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        staffSubTab === 'admin'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Admin &amp; Analytics
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-600">
                    <span>
                      Signed in as <strong className="text-slate-900">{staffSession.staffName}</strong> ({staffSession.role})
                    </span>
                    <button
                      type="button"
                      onClick={() => setStaffSession(null)}
                      className="font-medium text-slate-700 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Switch Role
                    </button>
                  </div>
                </div>

                {staffSubTab === 'doctor' ? (
                  <DoctorConsole
                    authToken={staffSession.token}
                    doctors={doctors}
                    selectedDoctorId={selectedDoctorId}
                    onSelectDoctor={setSelectedDoctorId}
                    onRefreshQueue={() => void fetchLiveQueue()}
                  />
                ) : (
                  <AdminAnalyticsView
                    authToken={staffSession.token}
                    role={staffSession.role}
                    onRefreshQueue={() => void fetchLiveQueue()}
                  />
                )}
              </>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>MediFlow — Hospital Appointment &amp; Queue Management Platform</span>
          <span>Website · WhatsApp (OpenWA) · Receptionist Desk · Real-Time Socket.IO</span>
        </div>
      </footer>
    </div>
  );
}
