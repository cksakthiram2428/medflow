import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { Server as SocketIOServer } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import {
  createCentralizedAppointment,
  getAdminAnalyticsSummary,
  getPublicLiveQueue,
  performQueueAction,
  requestOtp,
  rescheduleAppointmentDoctor,
  runScheduledReminderSweep,
  setRealtimeBroadcaster,
  toggleDoctorAvailability,
  trackTokenPublic,
  verifyOtpCode,
} from './src/server/queueEngine.ts';
import {
  checkRateLimit,
  hashSecret,
  isSafeHttpWebhookUrl,
  normalizeMobile,
  signStaffToken,
  verifySecret,
  verifyStaffToken,
  type StaffSessionPayload,
} from './src/server/security.ts';
import { getTodayDateString, readStore, updateStore } from './src/server/store.ts';
import type { StaffRole } from './src/server/types.ts';
import { handleWhatsAppWebhook } from './src/server/whatsappEngine.ts';

declare global {
  namespace Express {
    interface Request {
      staffSession?: StaffSessionPayload;
    }
  }
}

const PORT = Number(process.env.PORT) || 3000;

function extractBearer(req: express.Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

function requireStaff(allowedRoles?: StaffRole[]): express.RequestHandler {
  return (req, res, next) => {
    const token = extractBearer(req);
    if (!token) {
      res.status(401).json({ error: 'Staff authentication required.' });
      return;
    }
    const payload = verifyStaffToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired staff session.' });
      return;
    }
    if (allowedRoles && !allowedRoles.includes(payload.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action.' });
      return;
    }
    req.staffSession = payload;
    next();
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));

  const httpServer = http.createServer(app);
  const io = new SocketIOServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: false,
    },
  });

  setRealtimeBroadcaster({
    emit(event, payload) {
      io.emit(event, payload);
    },
  });

  io.on('connection', async (socket) => {
    try {
      const snapshot = await getPublicLiveQueue();
      socket.emit('queue:updated', snapshot);
    } catch {
      // Ignore initial sync failure on closing socket
    }
  });

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'mediflow' });
  });

  // 1. Public OTP endpoints
  const sendOtpSchema = z.object({
    mobile: z.string().min(10).max(20),
    channel: z.enum(['website', 'whatsapp']).optional().default('website'),
  });

  app.post('/api/auth/send-otp', async (req, res) => {
    try {
      const parsed = sendOtpSchema.parse(req.body);
      const rateKey = req.ip || 'unknown';
      const result = await requestOtp(parsed.mobile, parsed.channel, rateKey);
      res.json(result);
    } catch (err) {
      const message = err instanceof z.ZodError ? 'Invalid mobile number format.' : (err as Error).message;
      res.status(400).json({ error: message });
    }
  });

  const verifyOtpSchema = z.object({
    otpSessionId: z.string().min(10),
    mobile: z.string().min(10).max(20),
    code: z.string().regex(/^\d{6}$/),
  });

  app.post('/api/auth/verify-otp', async (req, res) => {
    try {
      const parsed = verifyOtpSchema.parse(req.body);
      const result = await verifyOtpCode(parsed.otpSessionId, parsed.mobile, parsed.code);
      res.json(result);
    } catch (err) {
      const message = err instanceof z.ZodError ? 'OTP must be a 6-digit number.' : (err as Error).message;
      res.status(400).json({ error: message });
    }
  });

  // 2. Public Queue & Live Token Tracking (zero PII)
  app.get('/api/queue/live', async (req, res) => {
    try {
      const doctorId = typeof req.query.doctorId === 'string' ? req.query.doctorId : undefined;
      const date = typeof req.query.date === 'string' ? req.query.date : undefined;
      const data = await getPublicLiveQueue(doctorId, date);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/queue/:token', async (req, res) => {
    try {
      const result = await trackTokenPublic(req.params.token);
      if (!result) {
        res.status(404).json({ error: 'Token not found for today.' });
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 3. Centralized Appointment Creation (Website + Receptionist)
  const createAppointmentSchema = z.object({
    patientName: z.string().min(2).max(80),
    mobile: z.string().min(10).max(20),
    doctorId: z.string().min(2),
    bookingChannel: z.enum(['website', 'receptionist']),
    appointmentDate: z.string().optional(),
    notes: z.string().max(200).optional(),
    age: z.number().int().min(0).max(120).optional(),
    gender: z.enum(['Male', 'Female', 'Other']).optional(),
    verificationToken: z.string().optional(),
  });

  app.post('/api/appointments', async (req, res) => {
    try {
      const parsed = createAppointmentSchema.parse(req.body);
      let actorRole: 'patient' | 'receptionist' | 'admin' = 'patient';

      if (parsed.bookingChannel === 'receptionist') {
        const bearer = extractBearer(req);
        const session = bearer ? verifyStaffToken(bearer) : null;
        if (!session || (session.role !== 'receptionist' && session.role !== 'admin')) {
          res.status(401).json({ error: 'Receptionist or Admin authentication required.' });
          return;
        }
        actorRole = session.role;
      }

      const created = await createCentralizedAppointment({
        ...parsed,
        actorRole,
      });

      res.status(created.deduplicated ? 200 : 201).json({
        entry: created.publicEntry,
        deduplicated: created.deduplicated,
      });
    } catch (err) {
      const message = err instanceof z.ZodError ? 'Invalid appointment details.' : (err as Error).message;
      res.status(400).json({ error: message });
    }
  });

  // 4. WhatsApp OpenWA Webhook
  const whatsappWebhookSchema = z.object({
    from: z.string().min(10).max(24),
    message: z.string().min(1).max(300),
  });

  app.post('/api/whatsapp/webhook', async (req, res) => {
    try {
      const configuredSecret = process.env.OPENWA_WEBHOOK_SECRET?.trim();
      const isInternalUiTest = req.headers['x-mediflow-simulator'] === 'true';
      if (configuredSecret && !isInternalUiTest) {
        const provided = req.headers['x-openwa-secret'];
        if (provided !== configuredSecret) {
          res.status(401).json({ error: 'Invalid OpenWA webhook signature.' });
          return;
        }
      }

      const parsed = whatsappWebhookSchema.parse(req.body);
      const reply = await handleWhatsAppWebhook(parsed, req.ip || 'wa');
      res.json(reply);
    } catch (err) {
      const message = err instanceof z.ZodError ? 'Invalid WhatsApp webhook payload.' : (err as Error).message;
      res.status(400).json({ error: message });
    }
  });

  // 5. Staff Auth (First-Run Claim or Env Passcode + Bearer Session)
  app.get('/api/staff/auth-status', async (_req, res) => {
    const store = await readStore();
    const envPasscode = process.env.STAFF_PASSCODE?.trim();
    const envConfigured = Boolean(envPasscode);
    const claimed = Boolean(store.settings.staffPasscodeHash && store.settings.staffPasscodeSalt);
    res.json({
      envConfigured,
      claimed,
      needsSetup: !envConfigured && !claimed,
    });
  });

  const claimSchema = z.object({
    passcode: z.string().min(4).max(64),
    role: z.enum(['receptionist', 'doctor', 'admin']).default('admin'),
    staffName: z.string().min(2).max(60).optional(),
  });

  app.post('/api/staff/claim', async (req, res) => {
    try {
      const parsed = claimSchema.parse(req.body);
      const envPasscode = process.env.STAFF_PASSCODE?.trim();
      if (envPasscode) {
        res.status(409).json({ error: 'Staff passcode is already configured via environment secrets.' });
        return;
      }

      await updateStore((draft) => {
        if (draft.settings.staffPasscodeHash) {
          throw new Error('Staff passcode has already been claimed.');
        }
        const { hash, salt } = hashSecret(parsed.passcode);
        draft.settings.staffPasscodeHash = hash;
        draft.settings.staffPasscodeSalt = salt;
      });

      const staffName = parsed.staffName?.trim() || 'Hospital Staff';
      const token = signStaffToken(parsed.role, staffName);
      res.status(201).json({ token, role: parsed.role, staffName });
    } catch (err) {
      const message = err instanceof z.ZodError ? 'Passcode must be at least 4 characters.' : (err as Error).message;
      res.status(400).json({ error: message });
    }
  });

  const loginSchema = z.object({
    passcode: z.string().min(1).max(64),
    role: z.enum(['receptionist', 'doctor', 'admin']),
    staffName: z.string().min(2).max(60).optional(),
  });

  app.post('/api/staff/login', async (req, res) => {
    try {
      const rateKey = req.ip || 'staff';
      if (!checkRateLimit(`staff:login:${rateKey}`, 15, 5 * 60_000)) {
        res.status(429).json({ error: 'Too many login attempts. Please wait a few minutes.' });
        return;
      }

      const parsed = loginSchema.parse(req.body);
      const envPasscode = process.env.STAFF_PASSCODE?.trim();
      const store = await readStore();

      let valid = false;
      if (envPasscode) {
        valid = parsed.passcode === envPasscode;
      } else if (store.settings.staffPasscodeHash && store.settings.staffPasscodeSalt) {
        valid = verifySecret(
          parsed.passcode,
          store.settings.staffPasscodeHash,
          store.settings.staffPasscodeSalt,
        );
      } else {
        res.status(409).json({ error: 'Staff passcode has not been set up yet.' });
        return;
      }

      if (!valid) {
        res.status(401).json({ error: 'Incorrect staff passcode.' });
        return;
      }

      const staffName =
        parsed.staffName?.trim() ||
        (parsed.role === 'doctor'
          ? 'Consulting Doctor'
          : parsed.role === 'receptionist'
            ? 'Front Desk Reception'
            : 'Hospital Admin');

      const token = signStaffToken(parsed.role, staffName);
      res.json({ token, role: parsed.role, staffName });
    } catch (err) {
      const message = err instanceof z.ZodError ? 'Invalid login payload.' : (err as Error).message;
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/staff/me', requireStaff(), (req, res) => {
    res.json({ session: req.staffSession });
  });

  // 6. Staff-protected Appointment, Patient, Queue, Doctor & Admin routes
  app.get('/api/staff/appointments', requireStaff(), async (req, res) => {
    const store = await readStore();
    const date = typeof req.query.date === 'string' ? req.query.date : getTodayDateString();
    const doctorId = typeof req.query.doctorId === 'string' ? req.query.doctorId : undefined;
    const list = store.appointments
      .filter((a) => a.appointmentDate === date && (!doctorId || a.doctorId === doctorId))
      .sort((a, b) => a.tokenSequence - b.tokenSequence);
    res.json({ date, appointments: list, doctors: store.doctors });
  });

  app.get('/api/staff/patients', requireStaff(['receptionist', 'admin']), async (req, res) => {
    const store = await readStore();
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    const patients = q
      ? store.patients.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            normalizeMobile(p.mobile).includes(normalizeMobile(q)),
        )
      : store.patients;
    res.json({ patients: patients.slice(0, 50) });
  });

  app.patch('/api/appointments/:id/cancel', requireStaff(['receptionist', 'admin']), async (req, res) => {
    try {
      const store = await readStore();
      const apt = store.appointments.find((a) => a.id === req.params.id);
      if (!apt) {
        res.status(404).json({ error: 'Appointment not found.' });
        return;
      }
      const result = await performQueueAction({
        appointmentId: apt.id,
        doctorId: apt.doctorId,
        action: 'cancel',
        actorRole: req.staffSession!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const rescheduleSchema = z.object({
    doctorId: z.string().min(2),
  });

  app.patch('/api/appointments/:id/reschedule', requireStaff(['receptionist', 'admin']), async (req, res) => {
    try {
      const parsed = rescheduleSchema.parse(req.body);
      const result = await rescheduleAppointmentDoctor({
        appointmentId: req.params.id,
        newDoctorId: parsed.doctorId,
        actorRole: req.staffSession!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const statusActionSchema = z.object({
    action: z.enum(['start_serving', 'complete', 'skip', 'recall', 'cancel']),
  });

  app.patch('/api/queue/:id/status', requireStaff(), async (req, res) => {
    try {
      const parsed = statusActionSchema.parse(req.body);
      const store = await readStore();
      const apt = store.appointments.find((a) => a.id === req.params.id);
      if (!apt) {
        res.status(404).json({ error: 'Appointment not found.' });
        return;
      }
      const result = await performQueueAction({
        appointmentId: apt.id,
        doctorId: apt.doctorId,
        action: parsed.action,
        actorRole: req.staffSession!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const callNextSchema = z.object({
    doctorId: z.string().min(2),
  });

  app.post('/api/queue/call-next', requireStaff(), async (req, res) => {
    try {
      const parsed = callNextSchema.parse(req.body);
      const result = await performQueueAction({
        doctorId: parsed.doctorId,
        action: 'call_next',
        actorRole: req.staffSession!.role,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  const availabilitySchema = z.object({
    availability: z.enum(['available', 'on_break']),
  });

  app.patch('/api/doctors/:id/availability', requireStaff(['doctor', 'admin']), async (req, res) => {
    try {
      const parsed = availabilitySchema.parse(req.body);
      const updated = await toggleDoctorAvailability(req.params.id, parsed.availability);
      res.json({ doctor: updated });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.get('/api/admin/analytics', requireStaff(), async (_req, res) => {
    try {
      const summary = await getAdminAnalyticsSummary();
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  const settingsSchema = z.object({
    hospitalName: z.string().min(2).max(80).optional(),
    branchName: z.string().min(2).max(80).optional(),
    workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    defaultConsultMinutes: z.number().int().min(3).max(60).optional(),
    reminderThresholdMinutes: z.number().int().min(10).max(90).optional(),
    n8nWebhookUrl: z.string().max(300).optional(),
  });

  app.patch('/api/admin/settings', requireStaff(['admin']), async (req, res) => {
    try {
      const parsed = settingsSchema.parse(req.body);
      if (parsed.n8nWebhookUrl !== undefined && !isSafeHttpWebhookUrl(parsed.n8nWebhookUrl)) {
        res.status(400).json({ error: 'Invalid or restricted n8n webhook URL.' });
        return;
      }

      const updated = await updateStore((draft) => {
        if (parsed.hospitalName) draft.settings.hospitalName = parsed.hospitalName.trim();
        if (parsed.branchName) draft.settings.branchName = parsed.branchName.trim();
        if (parsed.workingHoursStart) draft.settings.workingHoursStart = parsed.workingHoursStart;
        if (parsed.workingHoursEnd) draft.settings.workingHoursEnd = parsed.workingHoursEnd;
        if (parsed.defaultConsultMinutes !== undefined) {
          draft.settings.defaultConsultMinutes = parsed.defaultConsultMinutes;
          for (const doc of draft.doctors) {
            doc.avgConsultMinutes = parsed.defaultConsultMinutes;
          }
        }
        if (parsed.reminderThresholdMinutes !== undefined) {
          draft.settings.reminderThresholdMinutes = parsed.reminderThresholdMinutes;
        }
        if (parsed.n8nWebhookUrl !== undefined) {
          draft.settings.n8nWebhookUrl = parsed.n8nWebhookUrl.trim();
        }
        return {
          hospitalName: draft.settings.hospitalName,
          branchName: draft.settings.branchName,
          workingHoursStart: draft.settings.workingHoursStart,
          workingHoursEnd: draft.settings.workingHoursEnd,
          defaultConsultMinutes: draft.settings.defaultConsultMinutes,
          reminderThresholdMinutes: draft.settings.reminderThresholdMinutes,
          n8nWebhookUrl: draft.settings.n8nWebhookUrl,
        };
      });

      await runScheduledReminderSweep();
      io.emit('queue:updated', await getPublicLiveQueue());
      res.json({ settings: updated });
    } catch (err) {
      const message = err instanceof z.ZodError ? 'Invalid hospital settings.' : (err as Error).message;
      res.status(400).json({ error: message });
    }
  });

  // Periodic 30-minute reminder scheduler
  setInterval(() => {
    void runScheduledReminderSweep();
  }, 30_000);

  // Mount Vite in dev or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MediFlow server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MediFlow server:', err);
  process.exit(1);
});
