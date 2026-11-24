import crypto from 'node:crypto';
import type { Appointment, PublicQueueEntry, StaffRole } from './types.ts';

const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  return envSecret && envSecret.length >= 16 ? envSecret : EPHEMERAL_SESSION_SECRET;
}

export function normalizeMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  return digits;
}

export function isValidMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile) || /^\d{10}$/.test(mobile);
}

export function maskMobile(mobile: string): string {
  const normalized = normalizeMobile(mobile);
  if (normalized.length < 4) return '******';
  return `${normalized.slice(0, 2)}******${normalized.slice(-2)}`;
}

export function toPatientDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Patient';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}

export function toPublicQueueEntry(appointment: Appointment): PublicQueueEntry {
  return {
    id: appointment.id,
    trackingCode: appointment.trackingCode,
    patientDisplay: toPatientDisplayName(appointment.patientName),
    doctorId: appointment.doctorId,
    bookingChannel: appointment.bookingChannel,
    appointmentDate: appointment.appointmentDate,
    tokenNumber: appointment.tokenNumber,
    tokenSequence: appointment.tokenSequence,
    status: appointment.status,
    queuePosition: appointment.queuePosition,
    estimatedWaitingTime: appointment.estimatedWaitingTime,
    createdAt: appointment.createdAt,
    startedAt: appointment.startedAt,
    completedAt: appointment.completedAt,
  };
}

export function hashSecret(secret: string, providedSalt?: string): { hash: string; salt: string } {
  const salt = providedSalt ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(secret, salt, 32).toString('hex');
  return { hash: derived, salt };
}

export function verifySecret(secret: string, storedHash: string, salt: string): boolean {
  const derived = crypto.scryptSync(secret, salt, 32);
  const expected = Buffer.from(storedHash, 'hex');
  if (derived.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(derived, expected);
}

export interface StaffSessionPayload {
  role: StaffRole;
  staffName: string;
  exp: number;
}

export function signStaffToken(role: StaffRole, staffName: string): string {
  const payload: StaffSessionPayload = {
    role,
    staffName,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyStaffToken(token: string): StaffSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as StaffSessionPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    if (!['receptionist', 'doctor', 'admin'].includes(parsed.role)) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= maxRequests) {
    return false;
  }
  bucket.count += 1;
  return true;
}

export function isSafeHttpWebhookUrl(rawUrl: string): boolean {
  if (!rawUrl.trim()) return true;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '169.254.169.254' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
