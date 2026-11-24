import { ArrowRight, MessageSquare, RotateCcw, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface ChatMessage {
  id: string;
  sender: 'patient' | 'bot';
  text: string;
  timestamp: string;
}

interface WhatsAppChannelViewProps {
  onTrackToken: (tokenNumber: string) => void;
}

interface WebhookResponse {
  replies: string[];
  step: string;
  tokenNumber?: string;
  trackingCode?: string;
  previewOtp?: string;
}

export function WhatsAppChannelView({ onTrackToken }: WhatsAppChannelViewProps) {
  const [senderMobile, setSenderMobile] = useState('9876543219');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'bot',
      text: 'OpenWA WhatsApp Channel connected to MediFlow backend. Send "Hi" to start booking or track your live token.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [currentStep, setCurrentStep] = useState<string>('idle');
  const [previewOtp, setPreviewOtp] = useState<string | null>(null);
  const [confirmedToken, setConfirmedToken] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<Record<string, unknown> | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function sendWhatsAppMessage(rawText: string) {
    const trimmed = rawText.trim();
    if (!trimmed || sending) return;
    setError(null);
    setSending(true);

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((prev) => [
      ...prev,
      {
        id: `p-${Date.now()}-${Math.random()}`,
        sender: 'patient',
        text: trimmed,
        timestamp: nowTime,
      },
    ]);
    setInputText('');

    try {
      const reqBody = { from: senderMobile, message: trimmed };
      const res = await fetch('/api/whatsapp/webhook', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mediflow-simulator': 'true',
        },
        body: JSON.stringify(reqBody),
      });

      const data = (await res.json()) as WebhookResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Webhook error');
      }

      setLastPayload({ request: reqBody, response: data });
      setCurrentStep(data.step);
      setPreviewOtp(data.previewOtp ?? null);
      if (data.tokenNumber) {
        setConfirmedToken(data.tokenNumber);
      }

      const botTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const botMsgs: ChatMessage[] = data.replies.map((replyText, idx) => ({
        id: `b-${Date.now()}-${idx}`,
        sender: 'bot',
        text: replyText,
        timestamp: botTime,
      }));
      setMessages((prev) => [...prev, ...botMsgs]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    void sendWhatsAppMessage(inputText);
  }

  const quickReplies =
    currentStep === 'awaiting_menu'
      ? ['1', '2']
      : currentStep === 'awaiting_doctor'
        ? ['1', '2', '3']
        : ['Hi', '1', '2'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Interactive WhatsApp Conversation Panel */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">MediFlow WhatsApp (OpenWA)</h1>
              <p className="text-xs text-slate-300 truncate">
                Connected to /api/whatsapp/webhook
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void sendWhatsAppMessage('Hi')}
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-md inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restart (&quot;Hi&quot;)
          </button>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <label htmlFor="wa-sender" className="text-xs font-medium text-slate-600 shrink-0">
            Patient WhatsApp Number:
          </label>
          <input
            id="wa-sender"
            type="tel"
            value={senderMobile}
            onChange={(e) => setSenderMobile(e.target.value)}
            className="w-40 px-2.5 py-1 text-xs font-mono-tabular border border-slate-300 rounded bg-white focus:outline-none focus:border-teal-700"
          />
        </div>

        <div
          ref={scrollRef}
          className="h-[380px] overflow-y-auto p-5 space-y-3 bg-slate-100/70"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender === 'patient' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[82%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-line ${
                  m.sender === 'patient'
                    ? 'bg-teal-700 text-white'
                    : 'bg-white border border-slate-200 text-slate-800'
                }`}
              >
                <p className="leading-relaxed">{m.text}</p>
                <span
                  className={`block text-[10px] mt-1 font-mono-tabular text-right ${
                    m.sender === 'patient' ? 'text-teal-100' : 'text-slate-400'
                  }`}
                >
                  {m.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>

        {previewOtp && (
          <div className="px-5 py-2.5 bg-teal-50 border-t border-teal-200 flex items-center justify-between text-xs text-teal-900">
            <span>
              Sandbox OTP Dispatched: <strong className="font-mono-tabular text-sm">{previewOtp}</strong>
            </span>
            <button
              type="button"
              onClick={() => void sendWhatsAppMessage(previewOtp)}
              className="px-2.5 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-medium cursor-pointer"
            >
              Send OTP
            </button>
          </div>
        )}

        {error && (
          <div className="px-5 py-2 bg-rose-50 border-t border-rose-200 text-xs text-rose-800">
            {error}
          </div>
        )}

        {/* Quick Reply Bar */}
        <div className="px-5 pt-3 pb-2 bg-white border-t border-slate-200 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 mr-1">Quick replies:</span>
          {quickReplies.map((qr) => (
            <button
              key={qr}
              type="button"
              onClick={() => void sendWhatsAppMessage(qr)}
              className="px-3 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md transition-colors cursor-pointer"
            >
              {qr}
            </button>
          ))}
          {confirmedToken && (
            <button
              type="button"
              onClick={() => onTrackToken(confirmedToken)}
              className="ml-auto px-3 py-1 text-xs font-medium bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-md inline-flex items-center gap-1 cursor-pointer"
            >
              Track #{confirmedToken} Live
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <form onSubmit={handleFormSubmit} className="p-4 pt-2 bg-white flex gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder='Type "Hi", option number, name, mobile, or OTP...'
            aria-label="WhatsApp message input"
            className="flex-1 px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-700"
          />
          <button
            type="submit"
            disabled={sending || !inputText.trim()}
            className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>
      </div>

      {/* OpenWA Architecture & Webhook Inspector */}
      <div className="lg:col-span-6 space-y-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">
            OpenWA &amp; Centralized Queue Integration
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            This chat connects directly to the MediFlow Express webhook (<code className="font-mono-tabular text-xs bg-slate-100 px-1.5 py-0.5 rounded">POST /api/whatsapp/webhook</code>).
            WhatsApp never allocates tokens independently — upon OTP confirmation, it invokes the exact same centralized queue engine and <code className="font-mono-tabular text-xs bg-slate-100 px-1.5 py-0.5 rounded">AsyncKeyMutex</code> store used by the Website and Receptionist channels.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-900">Booking Flow</div>
              <div className="text-slate-600 mt-1">
                Hi → 1 (Book) → Select Doctor → Full Name → Mobile → 6-Digit OTP → Token Issued
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="font-semibold text-slate-900">Live Tracking Flow</div>
              <div className="text-slate-600 mt-1">
                Hi → 2 (Track) → Token Number (e.g. A005) → Now Serving, Patients Ahead &amp; ETA
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Latest Webhook Exchange
            </h2>
            <span className="text-xs font-mono-tabular text-slate-500">
              State: {currentStep}
            </span>
          </div>
          {lastPayload ? (
            <pre className="p-4 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono-tabular overflow-x-auto leading-relaxed">
              {JSON.stringify(lastPayload, null, 2)}
            </pre>
          ) : (
            <div className="p-6 rounded-lg border border-dashed border-slate-200 text-center text-xs text-slate-500">
              Send a message on the left to inspect the live OpenWA webhook payload and backend state transition.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
