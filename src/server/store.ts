import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storeMutex } from './mutex.ts';
import type { Appointment, Doctor, MediFlowStoreData, Patient } from './types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.resolve(DATA_DIR, 'mediflow-store.json');

export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createSeedData(): MediFlowStoreData {
  const today = getTodayDateString();
  const now = new Date();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  const doctors: Doctor[] = [
    {
      id: 'doc-meera',
      name: 'Dr. Meera Nair',
      department: 'General Medicine',
      tokenPrefix: 'A',
      room: 'OPD Room 102',
      avgConsultMinutes: 10,
      availability: 'available',
      avatarUrl: '/src/assets/images/doctor_meera_nair_1795527491103.jpg',
    },
    {
      id: 'doc-arjun',
      name: 'Dr. Arjun Krishnan',
      department: 'Cardiology',
      tokenPrefix: 'B',
      room: 'Heart Wing 204',
      avgConsultMinutes: 12,
      availability: 'available',
      avatarUrl: '/src/assets/images/doctor_arjun_krishnan_1795527491192.jpg',
    },
    {
      id: 'doc-kavitha',
      name: 'Dr. Kavitha Rao',
      department: 'Pediatrics',
      tokenPrefix: 'C',
      room: 'Pediatric Suite 108',
      avgConsultMinutes: 8,
      availability: 'available',
      avatarUrl: '/src/assets/images/doctor_kavitha_rao_1795527491126.jpg',
    },
  ];

  const patients: Patient[] = [
    { id: 'pat-1', name: 'Suresh Menon', mobile: '9840112233', age: 42, gender: 'Male', createdAt: minsAgo(90), updatedAt: minsAgo(90) },
    { id: 'pat-2', name: 'Lakshmi Devi', mobile: '9840223344', age: 56, gender: 'Female', createdAt: minsAgo(80), updatedAt: minsAgo(80) },
    { id: 'pat-3', name: 'Arun Kumar', mobile: '9876543210', age: 31, gender: 'Male', createdAt: minsAgo(65), updatedAt: minsAgo(65) },
    { id: 'pat-4', name: 'Priya Sharma', mobile: '9790334455', age: 28, gender: 'Female', createdAt: minsAgo(50), updatedAt: minsAgo(50) },
    { id: 'pat-5', name: 'Karthik Raja', mobile: '9677445566', age: 35, gender: 'Male', createdAt: minsAgo(40), updatedAt: minsAgo(40) },
    { id: 'pat-6', name: 'Divya Bharathi', mobile: '9551556677', age: 29, gender: 'Female', createdAt: minsAgo(25), updatedAt: minsAgo(25) },
    { id: 'pat-7', name: 'Vikramjit Singh', mobile: '9940667788', age: 48, gender: 'Male', createdAt: minsAgo(20), updatedAt: minsAgo(20) },
    { id: 'pat-8', name: 'Ananya Iyer', mobile: '9884778899', age: 33, gender: 'Female', createdAt: minsAgo(14), updatedAt: minsAgo(14) },
    { id: 'pat-9', name: 'Rohan Verma', mobile: '9820889900', age: 52, gender: 'Male', createdAt: minsAgo(45), updatedAt: minsAgo(45) },
    { id: 'pat-10', name: 'Nandini Patel', mobile: '9769990011', age: 44, gender: 'Female', createdAt: minsAgo(30), updatedAt: minsAgo(30) },
    { id: 'pat-11', name: 'Baby Aarav Nair', mobile: '9900112200', age: 5, gender: 'Male', createdAt: minsAgo(22), updatedAt: minsAgo(22) },
  ];

  const appointments: Appointment[] = [
    {
      id: 'apt-a001',
      trackingCode: 'MF-A001-9182',
      patientId: 'pat-1',
      patientName: 'Suresh Menon',
      mobile: '9840112233',
      doctorId: 'doc-meera',
      bookingChannel: 'receptionist',
      appointmentDate: today,
      tokenNumber: 'A001',
      tokenSequence: 1,
      status: 'completed',
      queuePosition: 0,
      estimatedWaitingTime: 0,
      reminder30Sent: true,
      approachingSent: true,
      createdAt: minsAgo(90),
      calledAt: minsAgo(75),
      startedAt: minsAgo(74),
      completedAt: minsAgo(64),
      updatedAt: minsAgo(64),
    },
    {
      id: 'apt-a002',
      trackingCode: 'MF-A002-4410',
      patientId: 'pat-2',
      patientName: 'Lakshmi Devi',
      mobile: '9840223344',
      doctorId: 'doc-meera',
      bookingChannel: 'website',
      appointmentDate: today,
      tokenNumber: 'A002',
      tokenSequence: 2,
      status: 'completed',
      queuePosition: 0,
      estimatedWaitingTime: 0,
      reminder30Sent: true,
      approachingSent: true,
      createdAt: minsAgo(80),
      calledAt: minsAgo(63),
      startedAt: minsAgo(62),
      completedAt: minsAgo(51),
      updatedAt: minsAgo(51),
    },
    {
      id: 'apt-a003',
      trackingCode: 'MF-A003-7731',
      patientId: 'pat-3',
      patientName: 'Arun Kumar',
      mobile: '9876543210',
      doctorId: 'doc-meera',
      bookingChannel: 'whatsapp',
      appointmentDate: today,
      tokenNumber: 'A003',
      tokenSequence: 3,
      status: 'serving',
      queuePosition: 0,
      estimatedWaitingTime: 0,
      notes: 'Follow-up consultation',
      reminder30Sent: true,
      approachingSent: true,
      createdAt: minsAgo(65),
      calledAt: minsAgo(6),
      startedAt: minsAgo(5),
      updatedAt: minsAgo(5),
    },
    {
      id: 'apt-a004',
      trackingCode: 'MF-A004-6092',
      patientId: 'pat-4',
      patientName: 'Priya Sharma',
      mobile: '9790334455',
      doctorId: 'doc-meera',
      bookingChannel: 'website',
      appointmentDate: today,
      tokenNumber: 'A004',
      tokenSequence: 4,
      status: 'next',
      queuePosition: 1,
      estimatedWaitingTime: 10,
      reminder30Sent: true,
      approachingSent: true,
      createdAt: minsAgo(50),
      updatedAt: minsAgo(5),
    },
    {
      id: 'apt-a005',
      trackingCode: 'MF-A005-2314',
      patientId: 'pat-5',
      patientName: 'Karthik Raja',
      mobile: '9677445566',
      doctorId: 'doc-meera',
      bookingChannel: 'whatsapp',
      appointmentDate: today,
      tokenNumber: 'A005',
      tokenSequence: 5,
      status: 'waiting',
      queuePosition: 2,
      estimatedWaitingTime: 20,
      reminder30Sent: true,
      approachingSent: false,
      createdAt: minsAgo(40),
      updatedAt: minsAgo(5),
    },
    {
      id: 'apt-a006',
      trackingCode: 'MF-A006-8854',
      patientId: 'pat-6',
      patientName: 'Divya Bharathi',
      mobile: '9551556677',
      doctorId: 'doc-meera',
      bookingChannel: 'receptionist',
      appointmentDate: today,
      tokenNumber: 'A006',
      tokenSequence: 6,
      status: 'waiting',
      queuePosition: 3,
      estimatedWaitingTime: 30,
      reminder30Sent: true,
      approachingSent: false,
      createdAt: minsAgo(25),
      updatedAt: minsAgo(5),
    },
    {
      id: 'apt-a007',
      trackingCode: 'MF-A007-1190',
      patientId: 'pat-7',
      patientName: 'Vikramjit Singh',
      mobile: '9940667788',
      doctorId: 'doc-meera',
      bookingChannel: 'website',
      appointmentDate: today,
      tokenNumber: 'A007',
      tokenSequence: 7,
      status: 'waiting',
      queuePosition: 4,
      estimatedWaitingTime: 40,
      reminder30Sent: false,
      approachingSent: false,
      createdAt: minsAgo(20),
      updatedAt: minsAgo(5),
    },
    {
      id: 'apt-a008',
      trackingCode: 'MF-A008-5501',
      patientId: 'pat-8',
      patientName: 'Ananya Iyer',
      mobile: '9884778899',
      doctorId: 'doc-meera',
      bookingChannel: 'whatsapp',
      appointmentDate: today,
      tokenNumber: 'A008',
      tokenSequence: 8,
      status: 'waiting',
      queuePosition: 5,
      estimatedWaitingTime: 50,
      reminder30Sent: false,
      approachingSent: false,
      createdAt: minsAgo(14),
      updatedAt: minsAgo(5),
    },
    {
      id: 'apt-b001',
      trackingCode: 'MF-B001-3348',
      patientId: 'pat-9',
      patientName: 'Rohan Verma',
      mobile: '9820889900',
      doctorId: 'doc-arjun',
      bookingChannel: 'website',
      appointmentDate: today,
      tokenNumber: 'B001',
      tokenSequence: 1,
      status: 'serving',
      queuePosition: 0,
      estimatedWaitingTime: 0,
      reminder30Sent: true,
      approachingSent: true,
      createdAt: minsAgo(45),
      calledAt: minsAgo(8),
      startedAt: minsAgo(7),
      updatedAt: minsAgo(7),
    },
    {
      id: 'apt-b002',
      trackingCode: 'MF-B002-7104',
      patientId: 'pat-10',
      patientName: 'Nandini Patel',
      mobile: '9769990011',
      doctorId: 'doc-arjun',
      bookingChannel: 'receptionist',
      appointmentDate: today,
      tokenNumber: 'B002',
      tokenSequence: 2,
      status: 'next',
      queuePosition: 1,
      estimatedWaitingTime: 12,
      reminder30Sent: true,
      approachingSent: true,
      createdAt: minsAgo(30),
      updatedAt: minsAgo(7),
    },
    {
      id: 'apt-c001',
      trackingCode: 'MF-C001-9023',
      patientId: 'pat-11',
      patientName: 'Baby Aarav Nair',
      mobile: '9900112200',
      doctorId: 'doc-kavitha',
      bookingChannel: 'whatsapp',
      appointmentDate: today,
      tokenNumber: 'C001',
      tokenSequence: 1,
      status: 'serving',
      queuePosition: 0,
      estimatedWaitingTime: 0,
      reminder30Sent: true,
      approachingSent: true,
      createdAt: minsAgo(22),
      calledAt: minsAgo(4),
      startedAt: minsAgo(3),
      updatedAt: minsAgo(3),
    },
  ];

  return {
    doctors,
    patients,
    appointments,
    otpSessions: [],
    notifications: [
      {
        id: crypto.randomUUID(),
        appointmentId: 'apt-a003',
        tokenNumber: 'A003',
        recipientMasked: '98******10',
        channel: 'whatsapp',
        event: 'consultation_started',
        message: 'Doctor is now consulting token A003 in OPD Room 102.',
        status: 'delivered',
        createdAt: minsAgo(5),
      },
      {
        id: crypto.randomUUID(),
        appointmentId: 'apt-a004',
        tokenNumber: 'A004',
        recipientMasked: '97******55',
        channel: 'sms',
        event: 'token_approaching',
        message: 'MediFlow Alert: Token A004 is next in queue. Please proceed near OPD Room 102.',
        status: 'delivered',
        createdAt: minsAgo(5),
      },
      {
        id: crypto.randomUUID(),
        appointmentId: 'apt-a006',
        tokenNumber: 'A006',
        recipientMasked: '95******77',
        channel: 'n8n',
        event: 'reminder_30m',
        message: 'Your MediFlow appointment is ~30 mins away. Token A006. Please monitor your live queue.',
        status: 'delivered',
        createdAt: minsAgo(4),
      },
    ],
    queueEvents: [
      {
        id: crypto.randomUUID(),
        appointmentId: 'apt-a003',
        doctorId: 'doc-meera',
        tokenNumber: 'A003',
        eventType: 'consultation:started',
        actorRole: 'doctor',
        details: 'Dr. Meera Nair started consultation for A003',
        createdAt: minsAgo(5),
      },
    ],
    whatsappSessions: {},
    settings: {
      hospitalName: 'MediFlow Care Hospital',
      branchName: 'Central Outpatient Wing',
      workingHoursStart: '08:30',
      workingHoursEnd: '20:30',
      defaultConsultMinutes: 10,
      reminderThresholdMinutes: 30,
      n8nWebhookUrl: process.env.N8N_WEBHOOK_URL?.trim() || '',
    },
  };
}

let cachedStore: MediFlowStoreData | null = null;

async function ensureDirectory(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function writeAtomic(data: MediFlowStoreData): Promise<void> {
  await ensureDirectory();
  const tmpPath = `${STORE_PATH}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, STORE_PATH);
  cachedStore = data;
}

export async function readStore(): Promise<MediFlowStoreData> {
  if (cachedStore) {
    return structuredClone(cachedStore);
  }
  return storeMutex.runExclusive('store:io', async () => {
    if (cachedStore) {
      return structuredClone(cachedStore);
    }
    try {
      const raw = await fs.readFile(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as MediFlowStoreData;
      cachedStore = parsed;
      return structuredClone(parsed);
    } catch {
      const seeded = createSeedData();
      await writeAtomic(seeded);
      return structuredClone(seeded);
    }
  });
}

export async function updateStore<T>(
  mutator: (draft: MediFlowStoreData) => Promise<T> | T,
): Promise<T> {
  return storeMutex.runExclusive('store:io', async () => {
    let current: MediFlowStoreData;
    if (cachedStore) {
      current = structuredClone(cachedStore);
    } else {
      try {
        const raw = await fs.readFile(STORE_PATH, 'utf8');
        current = JSON.parse(raw) as MediFlowStoreData;
      } catch {
        current = createSeedData();
      }
    }

    const result = await mutator(current);
    await writeAtomic(current);
    return result;
  });
}
