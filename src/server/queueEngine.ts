import crypto from 'node:crypto';
import { AsyncKeyMutex } from './mutex.ts';
import {
  checkRateLimit,
  hashSecret,
  isSafeHttpWebhookUrl,
  isValidMobile,
  maskMobile,
  normalizeMobile,
  toPublicQueueEntry,
  verifySecret,
} from './security.ts';
import { getTodayDateString, readStore, updateStore } from './store.ts';
import type {
  Appointment,
  BookingChannel,
  Doctor,
  MediFlowStoreData,
  NotificationEventType,
  NotificationLog,
  PublicQueueEntry,
  QueueEvent,
  StaffRole,
} from './types.ts';

const queueMutex = new AsyncKeyMutex();

export interface RealtimeBroadcaster {
  emit(event: string, payload: unknown): void;
}

let broadcaster: RealtimeBroadcaster | null = null;

export function setRealtimeBroadcaster(io: RealtimeBroadcaster): void {
  broadcaster = io;
}

function broadcast(event: string, payload: unknown): void {
  if (broadcaster) {
    broadcaster.emit(event, payload);
  }
}

async function dispatchN8nWebhook(
  webhookUrl: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!webhookUrl || !isSafeHttpWebhookUrl(webhookUrl)) {
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // Non-blocking external automation dispatch
  }
}

function appendNotification(
  draft: MediFlowStoreData,
  params: {
    appointmentId?: string;
    tokenNumber?: string;
    mobile: string;
    channel: 'whatsapp' | 'sms' | 'n8n';
    event: NotificationEventType;
    message: string;
  },
): NotificationLog {
  const log: NotificationLog = {
    id: crypto.randomUUID(),
    appointmentId: params.appointmentId,
    tokenNumber: params.tokenNumber,
    recipientMasked: maskMobile(params.mobile),
    channel: params.channel,
    event: params.event,
    message: params.message,
    status: 'delivered',
    createdAt: new Date().toISOString(),
  };
  draft.notifications.unshift(log);
  if (draft.notifications.length > 200) {
    draft.notifications.length = 200;
  }
  return log;
}

function appendQueueEvent(
  draft: MediFlowStoreData,
  params: {
    appointmentId: string;
    doctorId: string;
    tokenNumber: string;
    eventType: QueueEvent['eventType'];
    actorRole: QueueEvent['actorRole'];
    details: string;
  },
): QueueEvent {
  const evt: QueueEvent = {
    id: crypto.randomUUID(),
    appointmentId: params.appointmentId,
    doctorId: params.doctorId,
    tokenNumber: params.tokenNumber,
    eventType: params.eventType,
    actorRole: params.actorRole,
    details: params.details,
    createdAt: new Date().toISOString(),
  };
  draft.queueEvents.unshift(evt);
  if (draft.queueEvents.length > 250) {
    draft.queueEvents.length = 250;
  }
  return evt;
}

function recomputeDoctorQueue(
  draft: MediFlowStoreData,
  doctorId: string,
  appointmentDate: string,
): { newNotifications: NotificationLog[] } {
  const doctor = draft.doctors.find((d) => d.id === doctorId);
  const consultMinutes = doctor?.avgConsultMinutes ?? draft.settings.defaultConsultMinutes ?? 10;
  const breakPenalty = doctor?.availability === 'on_break' ? 10 : 0;
  const reminderThreshold = draft.settings.reminderThresholdMinutes ?? 30;
  const newNotifications: NotificationLog[] = [];

  const activeForDoctor = draft.appointments
    .filter(
      (a) =>
        a.doctorId === doctorId &&
        a.appointmentDate === appointmentDate &&
        (a.status === 'serving' || a.status === 'next' || a.status === 'waiting'),
    )
    .sort((a, b) => a.tokenSequence - b.tokenSequence);

  const hasServing = activeForDoctor.some((a) => a.status === 'serving');
  const waitingOrNext = activeForDoctor.filter((a) => a.status === 'next' || a.status === 'waiting');

  if (waitingOrNext.length > 0) {
    waitingOrNext.forEach((apt, idx) => {
      if (idx === 0) {
        apt.status = 'next';
      } else if (apt.status === 'next') {
        apt.status = 'waiting';
      }
    });
  }

  let aheadCount = hasServing ? 1 : 0;
  for (const apt of waitingOrNext) {
    apt.queuePosition = aheadCount;
    apt.estimatedWaitingTime = Math.max(0, aheadCount * consultMinutes + (aheadCount > 0 ? breakPenalty : 0));
    apt.updatedAt = new Date().toISOString();

    if (
      apt.status === 'next' &&
      !apt.approachingSent
    ) {
      apt.approachingSent = true;
      const log = appendNotification(draft, {
        appointmentId: apt.id,
        tokenNumber: apt.tokenNumber,
        mobile: apt.mobile,
        channel: apt.bookingChannel === 'whatsapp' ? 'whatsapp' : 'sms',
        event: 'token_approaching',
        message: `MediFlow Alert: Token ${apt.tokenNumber} is next for ${doctor?.name ?? 'your doctor'}. Please proceed near ${doctor?.room ?? 'the OPD room'}.`,
      });
      newNotifications.push(log);
    }

    if (
      !apt.reminder30Sent &&
      apt.estimatedWaitingTime > 0 &&
      apt.estimatedWaitingTime <= reminderThreshold
    ) {
      apt.reminder30Sent = true;
      const log = appendNotification(draft, {
        appointmentId: apt.id,
        tokenNumber: apt.tokenNumber,
        mobile: apt.mobile,
        channel: 'n8n',
        event: 'reminder_30m',
        message: `Your MediFlow appointment is approaching (~${apt.estimatedWaitingTime} min). Token ${apt.tokenNumber}. Please reach the hospital and monitor your live queue.`,
      });
      newNotifications.push(log);
    }

    aheadCount += 1;
  }

  const serving = activeForDoctor.find((a) => a.status === 'serving');
  if (serving) {
    serving.queuePosition = 0;
    serving.estimatedWaitingTime = 0;
  }

  for (const apt of draft.appointments) {
    if (
      apt.doctorId === doctorId &&
      apt.appointmentDate === appointmentDate &&
      (apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'skipped')
    ) {
      apt.queuePosition = 0;
      apt.estimatedWaitingTime = 0;
    }
  }

  return { newNotifications };
}

export interface SendOtpResult {
  otpSessionId: string;
  expiresAt: string;
  maskedMobile: string;
  previewCode?: string;
}

export async function requestOtp(
  rawMobile: string,
  channel: 'website' | 'whatsapp',
  rateKey: string,
): Promise<SendOtpResult> {
  const mobile = normalizeMobile(rawMobile);
  if (!isValidMobile(mobile)) {
    throw new Error('Please enter a valid 10-digit mobile number.');
  }

  if (!checkRateLimit(`otp:send:${rateKey}:${mobile}`, 6, 5 * 60_000)) {
    throw new Error('Too many OTP requests. Please wait a few minutes and try again.');
  }

  const otpCode = String(crypto.randomInt(100000, 999999));
  const { hash, salt } = hashSecret(otpCode);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60_000).toISOString();
  const sessionId = crypto.randomUUID();

  let n8nUrl = '';
  let notifLog: NotificationLog | null = null;

  await updateStore((draft) => {
    n8nUrl = draft.settings.n8nWebhookUrl;
    draft.otpSessions = draft.otpSessions.filter(
      (s) => new Date(s.expiresAt).getTime() > Date.now() - 60_000,
    );
    draft.otpSessions.push({
      id: sessionId,
      mobile,
      channel,
      otpHash: hash,
      salt,
      attempts: 0,
      maxAttempts: 5,
      verified: false,
      expiresAt,
      createdAt: now.toISOString(),
    });
    notifLog = appendNotification(draft, {
      mobile,
      channel: channel === 'whatsapp' ? 'whatsapp' : 'sms',
      event: 'otp_requested',
      message: `MediFlow verification code sent to ${maskMobile(mobile)} (valid for 5 minutes).`,
    });
  });

  if (notifLog) {
    broadcast('notification:sent', notifLog);
  }
  if (n8nUrl) {
    void dispatchN8nWebhook(n8nUrl, 'otp_requested', {
      mobileMasked: maskMobile(mobile),
      channel,
    });
  }

  const hasExternalSms = Boolean(process.env.SMS_WEBHOOK_URL?.trim());
  return {
    otpSessionId: sessionId,
    expiresAt,
    maskedMobile: maskMobile(mobile),
    previewCode: !hasExternalSms && process.env.NODE_ENV !== 'production' ? otpCode : undefined,
  };
}

export async function verifyOtpCode(
  otpSessionId: string,
  rawMobile: string,
  code: string,
): Promise<{ verified: boolean; verificationToken: string; mobile: string }> {
  const mobile = normalizeMobile(rawMobile);
  const trimmedCode = code.trim();
  if (!/^\d{6}$/.test(trimmedCode)) {
    throw new Error('OTP must be a 6-digit number.');
  }

  if (!checkRateLimit(`otp:verify:${mobile}`, 12, 5 * 60_000)) {
    throw new Error('Too many verification attempts. Please request a new OTP.');
  }

  return updateStore((draft) => {
    const session = draft.otpSessions.find(
      (s) => s.id === otpSessionId && s.mobile === mobile,
    );
    if (!session) {
      throw new Error('OTP session not found. Please request a new OTP.');
    }
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      throw new Error('OTP has expired. Please request a new OTP.');
    }
    if (session.attempts >= session.maxAttempts) {
      throw new Error('Maximum OTP verification attempts reached. Request a new code.');
    }

    session.attempts += 1;
    const ok = verifySecret(trimmedCode, session.otpHash, session.salt);
    if (!ok) {
      throw new Error('Invalid OTP code. Please check and try again.');
    }

    const verificationToken = crypto.randomBytes(24).toString('hex');
    session.verified = true;
    session.verificationToken = verificationToken;
    return { verified: true, verificationToken, mobile };
  });
}

export interface CreateAppointmentInput {
  patientName: string;
  mobile: string;
  doctorId: string;
  bookingChannel: BookingChannel;
  appointmentDate?: string;
  notes?: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other';
  verificationToken?: string;
  actorRole?: QueueEvent['actorRole'];
}

export async function createCentralizedAppointment(
  input: CreateAppointmentInput,
): Promise<{
  appointment: Appointment;
  publicEntry: PublicQueueEntry;
  deduplicated: boolean;
}> {
  const patientName = input.patientName.trim();
  if (patientName.length < 2 || patientName.length > 80) {
    throw new Error('Patient name must be between 2 and 80 characters.');
  }

  const mobile = normalizeMobile(input.mobile);
  if (!isValidMobile(mobile)) {
    throw new Error('Please provide a valid 10-digit mobile number.');
  }

  const appointmentDate = input.appointmentDate?.trim() || getTodayDateString();
  const lockKey = `queue:${input.doctorId}:${appointmentDate}`;

  return queueMutex.runExclusive(lockKey, async () => {
    let n8nUrl = '';
    const emittedNotifications: NotificationLog[] = [];

    const result = await updateStore((draft) => {
      n8nUrl = draft.settings.n8nWebhookUrl;
      const doctor = draft.doctors.find((d) => d.id === input.doctorId);
      if (!doctor) {
        throw new Error('Selected doctor does not exist.');
      }

      // Enforce OTP verification for patient self-service channels (Website & WhatsApp)
      if (input.bookingChannel === 'website' || input.bookingChannel === 'whatsapp') {
        if (!input.verificationToken) {
          throw new Error('OTP verification is required before confirming this appointment.');
        }
        const verifiedSession = draft.otpSessions.find(
          (s) =>
            s.mobile === mobile &&
            s.verified &&
            s.verificationToken === input.verificationToken &&
            new Date(s.expiresAt).getTime() >= Date.now() - 15 * 60_000,
        );
        if (!verifiedSession) {
          throw new Error('OTP verification expired or invalid. Please verify again.');
        }
        // Consume verification token once used
        verifiedSession.verificationToken = undefined;
      }

      // Duplicate booking guard (active appointment on same doctor & date for same mobile)
      const existingActive = draft.appointments.find(
        (a) =>
          a.mobile === mobile &&
          a.doctorId === input.doctorId &&
          a.appointmentDate === appointmentDate &&
          (a.status === 'waiting' || a.status === 'next' || a.status === 'serving'),
      );
      if (existingActive) {
        return { appointment: existingActive, deduplicated: true };
      }

      const nowIso = new Date().toISOString();
      let patient = draft.patients.find((p) => p.mobile === mobile);
      if (!patient) {
        patient = {
          id: `pat-${crypto.randomUUID().slice(0, 8)}`,
          name: patientName,
          mobile,
          age: input.age,
          gender: input.gender,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        draft.patients.push(patient);
      } else {
        patient.name = patientName;
        if (input.age !== undefined) patient.age = input.age;
        if (input.gender !== undefined) patient.gender = input.gender;
        patient.updatedAt = nowIso;
      }

      const doctorAppointmentsToday = draft.appointments.filter(
        (a) => a.doctorId === input.doctorId && a.appointmentDate === appointmentDate,
      );
      const nextSeq =
        doctorAppointmentsToday.reduce((max, a) => Math.max(max, a.tokenSequence), 0) + 1;
      const tokenNumber = `${doctor.tokenPrefix}${String(nextSeq).padStart(3, '0')}`;
      const trackingCode = `MF-${tokenNumber}-${crypto.randomInt(1000, 9999)}`;

      const appointment: Appointment = {
        id: `apt-${crypto.randomUUID().slice(0, 8)}`,
        trackingCode,
        patientId: patient.id,
        patientName,
        mobile,
        doctorId: doctor.id,
        bookingChannel: input.bookingChannel,
        appointmentDate,
        tokenNumber,
        tokenSequence: nextSeq,
        status: 'waiting',
        queuePosition: 0,
        estimatedWaitingTime: 0,
        notes: input.notes?.trim().slice(0, 200),
        reminder30Sent: false,
        approachingSent: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      draft.appointments.push(appointment);
      const { newNotifications } = recomputeDoctorQueue(draft, doctor.id, appointmentDate);

      const confirmLog = appendNotification(draft, {
        appointmentId: appointment.id,
        tokenNumber: appointment.tokenNumber,
        mobile,
        channel: input.bookingChannel === 'whatsapp' ? 'whatsapp' : 'sms',
        event: 'appointment_confirmed',
        message: `Appointment confirmed with ${doctor.name} (${doctor.room}). Token: #${appointment.tokenNumber}. Est. wait: ${appointment.estimatedWaitingTime} min.`,
      });
      emittedNotifications.push(confirmLog, ...newNotifications);

      appendQueueEvent(draft, {
        appointmentId: appointment.id,
        doctorId: doctor.id,
        tokenNumber: appointment.tokenNumber,
        eventType: 'appointment:created',
        actorRole:
          input.actorRole ??
          (input.bookingChannel === 'whatsapp'
            ? 'whatsapp_bot'
            : input.bookingChannel === 'receptionist'
              ? 'receptionist'
              : 'patient'),
        details: `Token ${appointment.tokenNumber} booked via ${input.bookingChannel}`,
      });

      return { appointment, deduplicated: false };
    });

    const publicEntry = toPublicQueueEntry(result.appointment);

    if (!result.deduplicated) {
      broadcast('appointment:created', publicEntry);
      broadcast('queue:updated', await getPublicLiveQueue(result.appointment.doctorId));
      broadcast('eta:updated', {
        doctorId: result.appointment.doctorId,
        appointmentDate: result.appointment.appointmentDate,
      });
      for (const notif of emittedNotifications) {
        broadcast('notification:sent', notif);
      }
      if (n8nUrl) {
        void dispatchN8nWebhook(n8nUrl, 'appointment_confirmed', {
          tokenNumber: result.appointment.tokenNumber,
          doctorId: result.appointment.doctorId,
          channel: result.appointment.bookingChannel,
          etaMinutes: result.appointment.estimatedWaitingTime,
        });
      }
    }

    return {
      appointment: result.appointment,
      publicEntry,
      deduplicated: result.deduplicated,
    };
  });
}

export async function getPublicLiveQueue(doctorId?: string, date?: string): Promise<{
  date: string;
  doctors: Doctor[];
  queues: Record<
    string,
    {
      doctor: Doctor;
      serving: PublicQueueEntry | null;
      next: PublicQueueEntry | null;
      waitingCount: number;
      completedCount: number;
      entries: PublicQueueEntry[];
    }
  >;
}> {
  const store = await readStore();
  const targetDate = date || getTodayDateString();
  const targetDoctors = doctorId
    ? store.doctors.filter((d) => d.id === doctorId)
    : store.doctors;

  const queues: Record<
    string,
    {
      doctor: Doctor;
      serving: PublicQueueEntry | null;
      next: PublicQueueEntry | null;
      waitingCount: number;
      completedCount: number;
      entries: PublicQueueEntry[];
    }
  > = {};

  for (const doc of targetDoctors) {
    const docAppointments = store.appointments
      .filter((a) => a.doctorId === doc.id && a.appointmentDate === targetDate)
      .sort((a, b) => a.tokenSequence - b.tokenSequence);
    const entries = docAppointments.map(toPublicQueueEntry);
    const serving = entries.find((e) => e.status === 'serving') ?? null;
    const next = entries.find((e) => e.status === 'next') ?? null;
    const waitingCount = entries.filter((e) => e.status === 'waiting' || e.status === 'next').length;
    const completedCount = entries.filter((e) => e.status === 'completed').length;

    queues[doc.id] = {
      doctor: doc,
      serving,
      next,
      waitingCount,
      completedCount,
      entries,
    };
  }

  return {
    date: targetDate,
    doctors: store.doctors,
    queues,
  };
}

export async function trackTokenPublic(query: string): Promise<{
  entry: PublicQueueEntry;
  doctor: Doctor;
  nowServing: PublicQueueEntry | null;
  patientsAhead: number;
  progression: PublicQueueEntry[];
} | null> {
  const clean = query.trim().toUpperCase();
  if (!clean) return null;
  const store = await readStore();
  const today = getTodayDateString();

  const match =
    store.appointments.find(
      (a) =>
        a.trackingCode.toUpperCase() === clean ||
        (a.appointmentDate === today && a.tokenNumber.toUpperCase() === clean),
    ) ??
    store.appointments.find((a) => a.tokenNumber.toUpperCase() === clean);

  if (!match) return null;
  const doctor = store.doctors.find((d) => d.id === match.doctorId);
  if (!doctor) return null;

  const sameDayDoctor = store.appointments
    .filter((a) => a.doctorId === doctor.id && a.appointmentDate === match.appointmentDate)
    .sort((a, b) => a.tokenSequence - b.tokenSequence)
    .map(toPublicQueueEntry);

  const nowServing = sameDayDoctor.find((e) => e.status === 'serving') ?? null;
  const entry = toPublicQueueEntry(match);

  const progression = sameDayDoctor.filter(
    (e) =>
      e.status === 'serving' ||
      e.status === 'next' ||
      (e.status === 'waiting' && e.tokenSequence <= entry.tokenSequence + 3),
  );

  return {
    entry,
    doctor,
    nowServing,
    patientsAhead: entry.queuePosition,
    progression,
  };
}

export type QueueActionType =
  | 'call_next'
  | 'start_serving'
  | 'complete'
  | 'skip'
  | 'recall'
  | 'cancel';

export async function performQueueAction(params: {
  appointmentId?: string;
  doctorId: string;
  action: QueueActionType;
  actorRole: StaffRole;
}): Promise<{ updated: PublicQueueEntry; doctorId: string }> {
  const today = getTodayDateString();
  const lockKey = `queue:${params.doctorId}:${today}`;

  return queueMutex.runExclusive(lockKey, async () => {
    const emittedNotifications: NotificationLog[] = [];
    let n8nUrl = '';
    let eventNameToEmit: string = 'queue:updated';

    const updatedApt = await updateStore((draft) => {
      n8nUrl = draft.settings.n8nWebhookUrl;
      const doctor = draft.doctors.find((d) => d.id === params.doctorId);
      if (!doctor) {
        throw new Error('Doctor not found.');
      }

      const nowIso = new Date().toISOString();
      let target: Appointment | undefined;

      if (params.action === 'call_next') {
        const currentServing = draft.appointments.find(
          (a) =>
            a.doctorId === params.doctorId &&
            a.appointmentDate === today &&
            a.status === 'serving',
        );
        if (currentServing) {
          currentServing.status = 'completed';
          currentServing.completedAt = nowIso;
          currentServing.updatedAt = nowIso;
          appendQueueEvent(draft, {
            appointmentId: currentServing.id,
            doctorId: doctor.id,
            tokenNumber: currentServing.tokenNumber,
            eventType: 'consultation:completed',
            actorRole: params.actorRole,
            details: `Completed consultation for ${currentServing.tokenNumber}`,
          });
        }

        const eligible = draft.appointments
          .filter(
            (a) =>
              a.doctorId === params.doctorId &&
              a.appointmentDate === today &&
              (a.status === 'next' || a.status === 'waiting'),
          )
          .sort((a, b) => a.tokenSequence - b.tokenSequence);

        if (eligible.length === 0) {
          throw new Error('No waiting patients in queue for this doctor.');
        }

        target = eligible[0];
        target.status = 'serving';
        target.calledAt = nowIso;
        target.startedAt = nowIso;
        target.updatedAt = nowIso;
        eventNameToEmit = 'token:called';

        const log = appendNotification(draft, {
          appointmentId: target.id,
          tokenNumber: target.tokenNumber,
          mobile: target.mobile,
          channel: target.bookingChannel === 'whatsapp' ? 'whatsapp' : 'sms',
          event: 'consultation_started',
          message: `Token ${target.tokenNumber}: ${doctor.name} is ready for your consultation at ${doctor.room}.`,
        });
        emittedNotifications.push(log);

        appendQueueEvent(draft, {
          appointmentId: target.id,
          doctorId: doctor.id,
          tokenNumber: target.tokenNumber,
          eventType: 'consultation:started',
          actorRole: params.actorRole,
          details: `Called and started consultation for ${target.tokenNumber}`,
        });
      } else {
        target = draft.appointments.find((a) => a.id === params.appointmentId);
        if (!target) {
          throw new Error('Appointment not found.');
        }

        if (params.action === 'start_serving') {
          const activeServing = draft.appointments.find(
            (a) =>
              a.doctorId === target!.doctorId &&
              a.appointmentDate === target!.appointmentDate &&
              a.status === 'serving' &&
              a.id !== target!.id,
          );
          if (activeServing) {
            activeServing.status = 'completed';
            activeServing.completedAt = nowIso;
            activeServing.updatedAt = nowIso;
          }
          target.status = 'serving';
          target.calledAt = target.calledAt ?? nowIso;
          target.startedAt = nowIso;
          target.updatedAt = nowIso;
          eventNameToEmit = 'consultation:started';

          const log = appendNotification(draft, {
            appointmentId: target.id,
            tokenNumber: target.tokenNumber,
            mobile: target.mobile,
            channel: target.bookingChannel === 'whatsapp' ? 'whatsapp' : 'sms',
            event: 'consultation_started',
            message: `Token ${target.tokenNumber}: ${doctor.name} is now consulting you at ${doctor.room}.`,
          });
          emittedNotifications.push(log);

          appendQueueEvent(draft, {
            appointmentId: target.id,
            doctorId: doctor.id,
            tokenNumber: target.tokenNumber,
            eventType: 'consultation:started',
            actorRole: params.actorRole,
            details: `Started consultation for ${target.tokenNumber}`,
          });
        } else if (params.action === 'complete') {
          target.status = 'completed';
          target.completedAt = nowIso;
          target.updatedAt = nowIso;
          eventNameToEmit = 'consultation:completed';
          appendQueueEvent(draft, {
            appointmentId: target.id,
            doctorId: doctor.id,
            tokenNumber: target.tokenNumber,
            eventType: 'consultation:completed',
            actorRole: params.actorRole,
            details: `Consultation completed for ${target.tokenNumber}`,
          });
        } else if (params.action === 'skip') {
          target.status = 'skipped';
          target.updatedAt = nowIso;
          appendQueueEvent(draft, {
            appointmentId: target.id,
            doctorId: doctor.id,
            tokenNumber: target.tokenNumber,
            eventType: 'token:skipped',
            actorRole: params.actorRole,
            details: `Token ${target.tokenNumber} marked skipped`,
          });
        } else if (params.action === 'recall') {
          if (target.status !== 'skipped') {
            throw new Error('Only skipped tokens can be recalled to the waiting queue.');
          }
          target.status = 'waiting';
          target.updatedAt = nowIso;
          appendQueueEvent(draft, {
            appointmentId: target.id,
            doctorId: doctor.id,
            tokenNumber: target.tokenNumber,
            eventType: 'token:recalled',
            actorRole: params.actorRole,
            details: `Token ${target.tokenNumber} recalled to waiting queue`,
          });
        } else if (params.action === 'cancel') {
          if (target.status === 'completed') {
            throw new Error('Completed appointments cannot be cancelled.');
          }
          target.status = 'cancelled';
          target.cancelledAt = nowIso;
          target.updatedAt = nowIso;
          eventNameToEmit = 'appointment:cancelled';

          const log = appendNotification(draft, {
            appointmentId: target.id,
            tokenNumber: target.tokenNumber,
            mobile: target.mobile,
            channel: target.bookingChannel === 'whatsapp' ? 'whatsapp' : 'sms',
            event: 'appointment_cancelled',
            message: `Your MediFlow appointment (Token ${target.tokenNumber}) has been cancelled.`,
          });
          emittedNotifications.push(log);

          appendQueueEvent(draft, {
            appointmentId: target.id,
            doctorId: doctor.id,
            tokenNumber: target.tokenNumber,
            eventType: 'appointment:cancelled',
            actorRole: params.actorRole,
            details: `Appointment ${target.tokenNumber} cancelled by ${params.actorRole}`,
          });
        }
      }

      const { newNotifications } = recomputeDoctorQueue(
        draft,
        target.doctorId,
        target.appointmentDate,
      );
      emittedNotifications.push(...newNotifications);

      return target;
    });

    const publicEntry = toPublicQueueEntry(updatedApt);
    broadcast(eventNameToEmit, publicEntry);
    broadcast('queue:updated', await getPublicLiveQueue(updatedApt.doctorId));
    broadcast('eta:updated', {
      doctorId: updatedApt.doctorId,
      appointmentDate: updatedApt.appointmentDate,
    });
    for (const notif of emittedNotifications) {
      broadcast('notification:sent', notif);
    }

    if (n8nUrl) {
      void dispatchN8nWebhook(n8nUrl, eventNameToEmit, {
        tokenNumber: updatedApt.tokenNumber,
        doctorId: updatedApt.doctorId,
        status: updatedApt.status,
      });
    }

    return { updated: publicEntry, doctorId: updatedApt.doctorId };
  });
}

export async function rescheduleAppointmentDoctor(params: {
  appointmentId: string;
  newDoctorId: string;
  actorRole: StaffRole;
}): Promise<{ updated: Appointment }> {
  const today = getTodayDateString();
  return queueMutex.runExclusive(`reschedule:${params.appointmentId}`, async () => {
    const result = await updateStore((draft) => {
      const apt = draft.appointments.find((a) => a.id === params.appointmentId);
      if (!apt) throw new Error('Appointment not found.');
      if (apt.status === 'completed' || apt.status === 'cancelled') {
        throw new Error('Completed or cancelled appointments cannot be rescheduled.');
      }

      const newDoctor = draft.doctors.find((d) => d.id === params.newDoctorId);
      if (!newDoctor) throw new Error('Target doctor not found.');

      const oldDoctorId = apt.doctorId;
      if (oldDoctorId !== newDoctor.id) {
        const targetDoctorApts = draft.appointments.filter(
          (a) => a.doctorId === newDoctor.id && a.appointmentDate === today,
        );
        const nextSeq =
          targetDoctorApts.reduce((max, a) => Math.max(max, a.tokenSequence), 0) + 1;
        apt.doctorId = newDoctor.id;
        apt.appointmentDate = today;
        apt.tokenSequence = nextSeq;
        apt.tokenNumber = `${newDoctor.tokenPrefix}${String(nextSeq).padStart(3, '0')}`;
        apt.status = 'waiting';
        apt.updatedAt = new Date().toISOString();

        recomputeDoctorQueue(draft, oldDoctorId, today);
        recomputeDoctorQueue(draft, newDoctor.id, today);

        appendQueueEvent(draft, {
          appointmentId: apt.id,
          doctorId: newDoctor.id,
          tokenNumber: apt.tokenNumber,
          eventType: 'appointment:rescheduled',
          actorRole: params.actorRole,
          details: `Transferred to ${newDoctor.name} as ${apt.tokenNumber}`,
        });
      }

      return apt;
    });

    broadcast('queue:updated', await getPublicLiveQueue());
    return { updated: result };
  });
}

export async function toggleDoctorAvailability(
  doctorId: string,
  availability: Doctor['availability'],
): Promise<Doctor> {
  const today = getTodayDateString();
  const updatedDoctor = await updateStore((draft) => {
    const doc = draft.doctors.find((d) => d.id === doctorId);
    if (!doc) throw new Error('Doctor not found.');
    doc.availability = availability;
    recomputeDoctorQueue(draft, doctorId, today);
    return doc;
  });

  broadcast('queue:updated', await getPublicLiveQueue(doctorId));
  broadcast('eta:updated', { doctorId, appointmentDate: today });
  return updatedDoctor;
}

export async function runScheduledReminderSweep(): Promise<void> {
  const today = getTodayDateString();
  const dispatched: NotificationLog[] = [];
  let n8nUrl = '';

  await updateStore((draft) => {
    n8nUrl = draft.settings.n8nWebhookUrl;
    for (const doc of draft.doctors) {
      const { newNotifications } = recomputeDoctorQueue(draft, doc.id, today);
      dispatched.push(...newNotifications);
    }
  });

  for (const notif of dispatched) {
    broadcast('notification:sent', notif);
    if (n8nUrl) {
      void dispatchN8nWebhook(n8nUrl, notif.event, {
        tokenNumber: notif.tokenNumber,
        message: notif.message,
      });
    }
  }
}

export async function getAdminAnalyticsSummary() {
  const store = await readStore();
  const today = getTodayDateString();
  const todayApts = store.appointments.filter((a) => a.appointmentDate === today);

  const byChannel = {
    website: todayApts.filter((a) => a.bookingChannel === 'website').length,
    whatsapp: todayApts.filter((a) => a.bookingChannel === 'whatsapp').length,
    receptionist: todayApts.filter((a) => a.bookingChannel === 'receptionist').length,
  };

  const byStatus = {
    waiting: todayApts.filter((a) => a.status === 'waiting').length,
    next: todayApts.filter((a) => a.status === 'next').length,
    serving: todayApts.filter((a) => a.status === 'serving').length,
    completed: todayApts.filter((a) => a.status === 'completed').length,
    skipped: todayApts.filter((a) => a.status === 'skipped').length,
    cancelled: todayApts.filter((a) => a.status === 'cancelled').length,
  };

  const activeWaiting = todayApts.filter(
    (a) => a.status === 'waiting' || a.status === 'next',
  );
  const avgEstimatedWait =
    activeWaiting.length > 0
      ? Math.round(
          activeWaiting.reduce((acc, a) => acc + a.estimatedWaitingTime, 0) /
            activeWaiting.length,
        )
      : 0;

  const remindersSent = store.notifications.filter(
    (n) => n.event === 'reminder_30m' || n.event === 'token_approaching',
  ).length;

  const doctorWorkload = store.doctors.map((doc) => {
    const docApts = todayApts.filter((a) => a.doctorId === doc.id);
    return {
      doctorId: doc.id,
      doctorName: doc.name,
      department: doc.department,
      total: docApts.length,
      completed: docApts.filter((a) => a.status === 'completed').length,
      waiting: docApts.filter((a) => a.status === 'waiting' || a.status === 'next').length,
      serving: docApts.find((a) => a.status === 'serving')?.tokenNumber ?? null,
      availability: doc.availability,
    };
  });

  const hourlyMap = new Map<string, number>();
  for (const apt of todayApts) {
    const d = new Date(apt.createdAt);
    const hourLabel = `${String(d.getHours()).padStart(2, '0')}:00`;
    hourlyMap.set(hourLabel, (hourlyMap.get(hourLabel) ?? 0) + 1);
  }
  const hourlyDistribution = Array.from(hourlyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([hour, count]) => ({ hour, count }));

  return {
    date: today,
    totalAppointments: todayApts.length,
    byChannel,
    byStatus,
    avgEstimatedWait,
    remindersSent,
    doctorWorkload,
    hourlyDistribution,
    recentNotifications: store.notifications.slice(0, 30),
    recentQueueEvents: store.queueEvents.slice(0, 30),
    settings: {
      hospitalName: store.settings.hospitalName,
      branchName: store.settings.branchName,
      workingHoursStart: store.settings.workingHoursStart,
      workingHoursEnd: store.settings.workingHoursEnd,
      defaultConsultMinutes: store.settings.defaultConsultMinutes,
      reminderThresholdMinutes: store.settings.reminderThresholdMinutes,
      n8nWebhookUrl: store.settings.n8nWebhookUrl,
    },
  };
}
