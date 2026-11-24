export type TokenStatus =
  | 'waiting'
  | 'next'
  | 'serving'
  | 'completed'
  | 'skipped'
  | 'cancelled';

export type BookingChannel = 'website' | 'whatsapp' | 'receptionist';

export type StaffRole = 'receptionist' | 'doctor' | 'admin';

export type DoctorAvailability = 'available' | 'on_break';

export interface Doctor {
  id: string;
  name: string;
  department: string;
  tokenPrefix: string;
  room: string;
  avgConsultMinutes: number;
  availability: DoctorAvailability;
  avatarUrl: string;
}

export interface Patient {
  id: string;
  name: string;
  mobile: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other';
  createdAt: string;
  updatedAt: string;
}

export interface Appointment {
  id: string;
  trackingCode: string;
  patientId: string;
  patientName: string;
  mobile: string;
  doctorId: string;
  bookingChannel: BookingChannel;
  appointmentDate: string;
  tokenNumber: string;
  tokenSequence: number;
  status: TokenStatus;
  queuePosition: number;
  estimatedWaitingTime: number;
  notes?: string;
  reminder30Sent: boolean;
  approachingSent: boolean;
  createdAt: string;
  calledAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  updatedAt: string;
}

export interface PublicQueueEntry {
  id: string;
  trackingCode: string;
  patientDisplay: string;
  doctorId: string;
  bookingChannel: BookingChannel;
  appointmentDate: string;
  tokenNumber: string;
  tokenSequence: number;
  status: TokenStatus;
  queuePosition: number;
  estimatedWaitingTime: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface OtpSession {
  id: string;
  mobile: string;
  channel: 'website' | 'whatsapp';
  otpHash: string;
  salt: string;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
  verificationToken?: string;
  expiresAt: string;
  createdAt: string;
}

export type NotificationEventType =
  | 'appointment_confirmed'
  | 'otp_requested'
  | 'reminder_30m'
  | 'token_approaching'
  | 'consultation_started'
  | 'appointment_cancelled';

export interface NotificationLog {
  id: string;
  appointmentId?: string;
  tokenNumber?: string;
  recipientMasked: string;
  channel: 'whatsapp' | 'sms' | 'n8n';
  event: NotificationEventType;
  message: string;
  status: 'delivered' | 'queued' | 'failed';
  createdAt: string;
}

export interface QueueEvent {
  id: string;
  appointmentId: string;
  doctorId: string;
  tokenNumber: string;
  eventType:
    | 'appointment:created'
    | 'appointment:cancelled'
    | 'appointment:rescheduled'
    | 'token:called'
    | 'consultation:started'
    | 'consultation:completed'
    | 'token:skipped'
    | 'token:recalled';
  actorRole: 'patient' | 'whatsapp_bot' | StaffRole;
  details: string;
  createdAt: string;
}

export interface WhatsAppConversationState {
  mobile: string;
  step:
    | 'idle'
    | 'awaiting_menu'
    | 'awaiting_doctor'
    | 'awaiting_name'
    | 'awaiting_mobile'
    | 'awaiting_otp'
    | 'awaiting_track_token';
  selectedDoctorId?: string;
  pendingName?: string;
  pendingMobile?: string;
  updatedAt: string;
}

export interface HospitalSettings {
  hospitalName: string;
  branchName: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  defaultConsultMinutes: number;
  reminderThresholdMinutes: number;
  n8nWebhookUrl: string;
  staffPasscodeHash?: string;
  staffPasscodeSalt?: string;
}

export interface MediFlowStoreData {
  doctors: Doctor[];
  patients: Patient[];
  appointments: Appointment[];
  otpSessions: OtpSession[];
  notifications: NotificationLog[];
  queueEvents: QueueEvent[];
  whatsappSessions: Record<string, WhatsAppConversationState>;
  settings: HospitalSettings;
}
