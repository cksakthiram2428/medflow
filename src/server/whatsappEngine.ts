import {
  createCentralizedAppointment,
  requestOtp,
  trackTokenPublic,
  verifyOtpCode,
} from './queueEngine.ts';
import { isValidMobile, normalizeMobile } from './security.ts';
import { readStore, updateStore } from './store.ts';
import type { WhatsAppConversationState } from './types.ts';

export interface WhatsAppInboundInput {
  from: string;
  message: string;
}

export interface WhatsAppReplyPayload {
  replies: string[];
  step: WhatsAppConversationState['step'];
  tokenNumber?: string;
  trackingCode?: string;
  previewOtp?: string;
}

export async function handleWhatsAppWebhook(
  input: WhatsAppInboundInput,
  rateKey: string,
): Promise<WhatsAppReplyPayload> {
  const sender = normalizeMobile(input.from);
  if (!isValidMobile(sender)) {
    throw new Error('Invalid WhatsApp sender mobile number.');
  }

  const text = input.message.trim();
  const lower = text.toLowerCase();

  const store = await readStore();
  const currentSession: WhatsAppConversationState = store.whatsappSessions[sender] ?? {
    mobile: sender,
    step: 'idle',
    updatedAt: new Date().toISOString(),
  };

  // Global reset commands
  if (lower === 'hi' || lower === 'hello' || lower === 'menu' || lower === 'start') {
    await updateStore((draft) => {
      draft.whatsappSessions[sender] = {
        mobile: sender,
        step: 'awaiting_menu',
        updatedAt: new Date().toISOString(),
      };
    });
    return {
      step: 'awaiting_menu',
      replies: [
        `Welcome to ${store.settings.hospitalName}!`,
        'Please reply with an option:\n1. Book Appointment\n2. Track Live Token',
      ],
    };
  }

  if (currentSession.step === 'idle' || currentSession.step === 'awaiting_menu') {
    if (lower === '1' || lower.includes('book')) {
      const doctorLines = store.doctors
        .map((d, idx) => `${idx + 1}. ${d.name} (${d.department})`)
        .join('\n');

      await updateStore((draft) => {
        draft.whatsappSessions[sender] = {
          mobile: sender,
          step: 'awaiting_doctor',
          updatedAt: new Date().toISOString(),
        };
      });

      return {
        step: 'awaiting_doctor',
        replies: [
          `Select a doctor by replying with 1, 2, or 3:\n${doctorLines}`,
        ],
      };
    }

    if (lower === '2' || lower.includes('track')) {
      await updateStore((draft) => {
        draft.whatsappSessions[sender] = {
          mobile: sender,
          step: 'awaiting_track_token',
          updatedAt: new Date().toISOString(),
        };
      });
      return {
        step: 'awaiting_track_token',
        replies: ['Please enter your token number (for example: A005) to check live queue status.'],
      };
    }

    return {
      step: 'awaiting_menu',
      replies: ['Reply "1" to Book Appointment, "2" to Track Live Token, or "Hi" for menu.'],
    };
  }

  if (currentSession.step === 'awaiting_track_token') {
    const tracking = await trackTokenPublic(text);
    await updateStore((draft) => {
      draft.whatsappSessions[sender] = {
        mobile: sender,
        step: 'idle',
        updatedAt: new Date().toISOString(),
      };
    });

    if (!tracking) {
      return {
        step: 'idle',
        replies: [
          `Token "${text.toUpperCase()}" was not found for today. Reply "Hi" to return to the main menu.`,
        ],
      };
    }

    return {
      step: 'idle',
      tokenNumber: tracking.entry.tokenNumber,
      trackingCode: tracking.entry.trackingCode,
      replies: [
        `Live Queue Status for #${tracking.entry.tokenNumber}\nDoctor: ${tracking.doctor.name} (${tracking.doctor.room})\nStatus: ${tracking.entry.status.toUpperCase()}\nNow Serving: ${tracking.nowServing?.tokenNumber ?? 'None'}\nPatients Ahead: ${tracking.patientsAhead}\nEstimated Wait: ~${tracking.entry.estimatedWaitingTime} mins`,
      ],
    };
  }

  if (currentSession.step === 'awaiting_doctor') {
    const idx = Number.parseInt(text, 10) - 1;
    const chosenDoctor =
      !Number.isNaN(idx) && store.doctors[idx]
        ? store.doctors[idx]
        : store.doctors.find((d) => d.name.toLowerCase().includes(lower));

    if (!chosenDoctor) {
      return {
        step: 'awaiting_doctor',
        replies: ['Please reply with 1, 2, or 3 to select a valid doctor.'],
      };
    }

    await updateStore((draft) => {
      draft.whatsappSessions[sender] = {
        mobile: sender,
        step: 'awaiting_name',
        selectedDoctorId: chosenDoctor.id,
        updatedAt: new Date().toISOString(),
      };
    });

    return {
      step: 'awaiting_name',
      replies: [
        `Selected ${chosenDoctor.name} (${chosenDoctor.department}).`,
        'Please enter your full name.',
      ],
    };
  }

  if (currentSession.step === 'awaiting_name') {
    if (text.length < 2) {
      return {
        step: 'awaiting_name',
        replies: ['Please enter a valid full name (at least 2 characters).'],
      };
    }

    await updateStore((draft) => {
      draft.whatsappSessions[sender] = {
        ...currentSession,
        step: 'awaiting_mobile',
        pendingName: text,
        updatedAt: new Date().toISOString(),
      };
    });

    return {
      step: 'awaiting_mobile',
      replies: ['Please enter your 10-digit mobile number for OTP verification.'],
    };
  }

  if (currentSession.step === 'awaiting_mobile') {
    const mobile = normalizeMobile(text);
    if (!isValidMobile(mobile)) {
      return {
        step: 'awaiting_mobile',
        replies: ['Invalid mobile number. Please enter a valid 10-digit mobile number.'],
      };
    }

    const otpResult = await requestOtp(mobile, 'whatsapp', rateKey);

    await updateStore((draft) => {
      draft.whatsappSessions[sender] = {
        ...currentSession,
        step: 'awaiting_otp',
        pendingMobile: mobile,
        updatedAt: new Date().toISOString(),
      };
      // Store latest otpSessionId in notes? Let's keep it linked via mobile in otpSessions
      void otpResult;
    });

    return {
      step: 'awaiting_otp',
      previewOtp: otpResult.previewCode,
      replies: [
        `A 6-digit verification OTP has been sent to ${otpResult.maskedMobile}. Please reply with your 6-digit OTP to confirm your booking.`,
      ],
    };
  }

  if (currentSession.step === 'awaiting_otp') {
    const mobile = currentSession.pendingMobile ?? sender;
    const latestStore = await readStore();
    const latestOtpSession = [...latestStore.otpSessions]
      .reverse()
      .find((s) => s.mobile === mobile && s.channel === 'whatsapp' && !s.verified);

    if (!latestOtpSession) {
      return {
        step: 'awaiting_otp',
        replies: ['OTP session expired. Reply "Hi" to restart booking.'],
      };
    }

    let verifiedToken: string;
    try {
      const verified = await verifyOtpCode(latestOtpSession.id, mobile, text);
      verifiedToken = verified.verificationToken;
    } catch (err) {
      return {
        step: 'awaiting_otp',
        replies: [err instanceof Error ? err.message : 'Invalid OTP. Please try again.'],
      };
    }

    const booking = await createCentralizedAppointment({
      patientName: currentSession.pendingName ?? 'Patient',
      mobile,
      doctorId: currentSession.selectedDoctorId ?? latestStore.doctors[0].id,
      bookingChannel: 'whatsapp',
      verificationToken: verifiedToken,
      actorRole: 'whatsapp_bot',
    });

    const doctor = latestStore.doctors.find((d) => d.id === booking.appointment.doctorId);

    await updateStore((draft) => {
      draft.whatsappSessions[sender] = {
        mobile: sender,
        step: 'idle',
        updatedAt: new Date().toISOString(),
      };
    });

    return {
      step: 'idle',
      tokenNumber: booking.appointment.tokenNumber,
      trackingCode: booking.appointment.trackingCode,
      replies: [
        `Appointment confirmed!\nYour token: #${booking.appointment.tokenNumber}\nDoctor: ${doctor?.name ?? 'Assigned Doctor'} (${doctor?.room ?? ''})\nPatients Ahead: ${booking.appointment.queuePosition}\nEstimated Wait: ~${booking.appointment.estimatedWaitingTime} mins\n\nPlease track your live token before visiting the hospital. We will notify you 30 minutes before your turn.`,
      ],
    };
  }

  return {
    step: 'idle',
    replies: ['Reply "Hi" to start MediFlow WhatsApp Assistant.'],
  };
}
