export type TokenStatus =
  | 'waiting'
  | 'next'
  | 'serving'
  | 'completed'
  | 'skipped'
  | 'cancelled';

export type BookingChannel = 'website' | 'whatsapp' | 'receptionist';

export type StaffRole = 'receptionist' | 'doctor' | 'admin';

export interface Doctor {
  id: string;
  name: string;
  department: string;
  tokenPrefix: string;
  room: string;
  avgConsultMinutes: number;
  availability: 'available' | 'on_break';
  avatarUrl: string;
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

export interface StaffAppointment {
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
  startedAt?: string;
  completedAt?: string;
}

export interface PatientRecord {
  id: string;
  name: string;
  mobile: string;
  age?: number;
  gender?: 'Male' | 'Female' | 'Other';
}

export interface DoctorQueueSnapshot {
  doctor: Doctor;
  serving: PublicQueueEntry | null;
  next: PublicQueueEntry | null;
  waitingCount: number;
  completedCount: number;
  entries: PublicQueueEntry[];
}

export interface LiveQueueResponse {
  date: string;
  doctors: Doctor[];
  queues: Record<string, DoctorQueueSnapshot>;
}

export interface TokenTrackingResult {
  entry: PublicQueueEntry;
  doctor: Doctor;
  nowServing: PublicQueueEntry | null;
  patientsAhead: number;
  progression: PublicQueueEntry[];
}

export interface NotificationLog {
  id: string;
  appointmentId?: string;
  tokenNumber?: string;
  recipientMasked: string;
  channel: 'whatsapp' | 'sms' | 'n8n';
  event: string;
  message: string;
  status: 'delivered' | 'queued' | 'failed';
  createdAt: string;
}

export interface QueueEventLog {
  id: string;
  appointmentId: string;
  doctorId: string;
  tokenNumber: string;
  eventType: string;
  actorRole: string;
  details: string;
  createdAt: string;
}

export interface AdminAnalyticsResponse {
  date: string;
  totalAppointments: number;
  byChannel: {
    website: number;
    whatsapp: number;
    receptionist: number;
  };
  byStatus: {
    waiting: number;
    next: number;
    serving: number;
    completed: number;
    skipped: number;
    cancelled: number;
  };
  avgEstimatedWait: number;
  remindersSent: number;
  doctorWorkload: Array<{
    doctorId: string;
    doctorName: string;
    department: string;
    total: number;
    completed: number;
    waiting: number;
    serving: string | null;
    availability: 'available' | 'on_break';
  }>;
  hourlyDistribution: Array<{ hour: string; count: number }>;
  recentNotifications: NotificationLog[];
  recentQueueEvents: QueueEventLog[];
  settings: {
    hospitalName: string;
    branchName: string;
    workingHoursStart: string;
    workingHoursEnd: string;
    defaultConsultMinutes: number;
    reminderThresholdMinutes: number;
    n8nWebhookUrl: string;
  };
}
