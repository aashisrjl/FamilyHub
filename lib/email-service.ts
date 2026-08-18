import { supabase } from '@/lib/supabase';

export const DEFAULT_OWNER_EMAIL = 'aashisrijal252@gmail.com';

let customResendApiKey: string | null = null;

export function setResendApiKey(key: string) {
  customResendApiKey = key.trim();
}

export function getResendApiKey(): string | null {
  if (customResendApiKey) return customResendApiKey;
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_RESEND_API_KEY) {
    return process.env.EXPO_PUBLIC_RESEND_API_KEY;
  }
  return null;
}


export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/** Send an email notification via Resend API behind the scenes */
export async function sendResendEmail(payload: EmailPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = getResendApiKey();
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const validRecipients = recipients.filter((email) => email && email.includes('@'));

  if (validRecipients.length === 0) {
    return { success: false, error: 'No valid recipient email addresses.' };
  }

  if (!apiKey) {
    console.log('📧 [Resend Simulated Preview]:', validRecipients.join(', '), payload.subject);
    return { success: true, id: 'simulated_resend_email_id' };
  }

  const dispatchEmail = async (targetEmails: string[]) => {
    return fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FamilyHub <onboarding@resend.dev>',
        to: targetEmails,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });
  };

  try {
    let response = await dispatchEmail(validRecipients);
    let data = await response.json();

    // Handle Resend unverified domain / sandbox restriction fallback
    if (!response.ok && data?.message && data.message.includes('only send testing emails to your own email address')) {
      console.warn('Resend sandbox restriction. Delivering to registered owner email:', DEFAULT_OWNER_EMAIL);
      response = await dispatchEmail([DEFAULT_OWNER_EMAIL]);
      data = await response.json();
    }

    if (!response.ok) {
      console.error('Resend API Error:', data);
      return { success: false, error: data.message || 'Failed to send email via Resend' };
    }

    return { success: true, id: data.id };
  } catch (err: any) {
    console.error('Error triggering Resend email:', err);
    return { success: false, error: err.message || 'Network error' };
  }
}

/** Send email notification for Motor actions (Start, Stop, Expire) */
export async function sendMotorEmail(
  familyId: string,
  senderName: string,
  action: 'start' | 'stop' | 'expire',
  tank: 'top' | 'down',
  durationMinutes?: number
) {
  try {
    const { data: members } = await supabase
      .from('profiles')
      .select('email, display_name, id')
      .eq('family_id', familyId);

    let recipientEmails: string[] = [];
    if (members && members.length > 0) {
      recipientEmails = members.filter((m) => m.email).map((m) => m.email as string);
    }
    if (recipientEmails.length === 0) {
      recipientEmails = [DEFAULT_OWNER_EMAIL];
    } else if (!recipientEmails.includes(DEFAULT_OWNER_EMAIL)) {
      recipientEmails.push(DEFAULT_OWNER_EMAIL);
    }

    const tankTitle = tank === 'top' ? 'Top Tank' : 'Down Tank';
    let subject = '';
    let actionTitle = '';
    let actionColor = '#0284c7';
    let bodyMsg = '';

    if (action === 'start') {
      subject = `💧 ${tankTitle} Motor Started by ${senderName}`;
      actionTitle = `💧 Motor Started`;
      actionColor = '#0284c7';
      bodyMsg = `${senderName} turned ON the ${tankTitle} Motor for ${durationMinutes ?? 30} minutes.`;
    } else if (action === 'stop') {
      subject = `⏹️ ${tankTitle} Motor Stopped by ${senderName}`;
      actionTitle = `⏹️ Motor Turned Off`;
      actionColor = '#64748b';
      bodyMsg = `${senderName} turned OFF the ${tankTitle} Motor.`;
    } else {
      subject = `⚠️ ALERT: ${tankTitle} Motor Timer Expired!`;
      actionTitle = `⚠️ Motor Timer Expired!`;
      actionColor = '#ef4444';
      bodyMsg = `The ${tankTitle} Motor timer has finished! Please check the water tank and turn off the motor machine immediately.`;
    }

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: ${actionColor}; margin: 0; font-size: 22px;">${actionTitle}</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">FamilyHub Motor Water System</p>
        </div>

        <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border-left: 4px solid ${actionColor}; margin-bottom: 20px;">
          <h3 style="color: #0f172a; margin-top: 0;">Motor Activity:</h3>
          <p style="color: #334155; font-size: 15px; line-height: 22px; margin-bottom: 0;">${bodyMsg}</p>
        </div>

        <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          FamilyHub Automatic Email Notification Service
        </div>
      </div>
    `;

    return await sendResendEmail({
      to: recipientEmails,
      subject,
      html: htmlContent,
      text: `${actionTitle}: ${bodyMsg}`,
    });
  } catch (err) {
    console.error('Error sending motor email:', err);
    return { success: false, error: String(err) };
  }
}

/** Send email notification when a custom Alarm / Task timer finishes */
export async function sendTimerAlarmEmail(
  familyId: string,
  alarmTitle: string,
  senderName: string
) {
  try {
    const { data: members } = await supabase
      .from('profiles')
      .select('email, display_name, id')
      .eq('family_id', familyId);

    let recipientEmails: string[] = [];
    if (members && members.length > 0) {
      recipientEmails = members.filter((m) => m.email).map((m) => m.email as string);
    }
    if (recipientEmails.length === 0) {
      recipientEmails = [DEFAULT_OWNER_EMAIL];
    } else if (!recipientEmails.includes(DEFAULT_OWNER_EMAIL)) {
      recipientEmails.push(DEFAULT_OWNER_EMAIL);
    }

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #7c3aed; margin: 0; font-size: 22px;">⏰ Alarm Timer Completed!</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">FamilyHub Alarm Notification</p>
        </div>

        <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border-left: 4px solid #7c3aed; margin-bottom: 20px;">
          <h3 style="color: #0f172a; margin-top: 0;">Task Alarm Alert:</h3>
          <p style="color: #334155; font-size: 16px; line-height: 24px; margin-bottom: 0;">
            The timer for <strong>"${alarmTitle}"</strong> set by ${senderName} has completed!
          </p>
        </div>

        <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          FamilyHub Automatic Email Notification Service
        </div>
      </div>
    `;

    return await sendResendEmail({
      to: recipientEmails,
      subject: `⏰ FamilyHub Alarm: "${alarmTitle}" timer completed!`,
      html: htmlContent,
      text: `Alarm Completed: "${alarmTitle}" timer set by ${senderName} has finished!`,
    });
  } catch (err) {
    console.error('Error sending timer alarm email:', err);
    return { success: false, error: String(err) };
  }
}

/** Send email notification when a specific user is rung */
export async function sendRingUserEmail(
  familyId: string,
  senderId: string,
  senderName: string,
  targetId?: string | null
) {
  try {
    let recipientEmails: string[] = [];

    if (targetId) {
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('email, display_name')
        .eq('id', targetId)
        .maybeSingle();

      if (targetProfile?.email) {
        recipientEmails.push(targetProfile.email);
      }
    } else {
      const { data: members } = await supabase
        .from('profiles')
        .select('email, id')
        .eq('family_id', familyId);

      if (members) {
        recipientEmails = members.filter((m) => m.id !== senderId && m.email).map((m) => m.email as string);
      }
    }

    if (recipientEmails.length === 0) {
      recipientEmails = [DEFAULT_OWNER_EMAIL];
    } else if (!recipientEmails.includes(DEFAULT_OWNER_EMAIL)) {
      recipientEmails.push(DEFAULT_OWNER_EMAIL);
    }

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #2563eb; margin: 0; font-size: 22px;">🔔 Ring Notification Alert</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">FamilyHub Device Ring Network</p>
        </div>

        <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin-bottom: 20px;">
          <h3 style="color: #0f172a; margin-top: 0;">${senderName} is ringing you!</h3>
          <p style="color: #334155; font-size: 15px; line-height: 22px; margin-bottom: 0;">
            ${senderName} sent an active ring alert to your device. Open FamilyHub to view and respond!
          </p>
        </div>

        <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          FamilyHub Automatic Email Notification Service
        </div>
      </div>
    `;

    return await sendResendEmail({
      to: recipientEmails,
      subject: `🔔 ${senderName} is ringing you on FamilyHub!`,
      html: htmlContent,
      text: `${senderName} is ringing you! Open FamilyHub to respond.`,
    });
  } catch (err) {
    console.error('Error sending ring user email:', err);
    return { success: false, error: String(err) };
  }
}

/** Send Emergency Alert Email to all family members */
export async function sendEmergencyEmailToFamily(
  familyId: string,
  senderId: string,
  senderName: string,
  alertTitle: string,
  alertBody: string
) {
  try {
    const { data: members } = await supabase
      .from('profiles')
      .select('email, display_name, id')
      .eq('family_id', familyId);

    let recipientEmails: string[] = [];
    if (members && members.length > 0) {
      recipientEmails = members
        .filter((m) => m.id !== senderId && m.email)
        .map((m) => m.email as string);
    }

    if (recipientEmails.length === 0) {
      recipientEmails = [DEFAULT_OWNER_EMAIL];
    } else if (!recipientEmails.includes(DEFAULT_OWNER_EMAIL)) {
      recipientEmails.push(DEFAULT_OWNER_EMAIL);
    }

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #ef4444; margin: 0; font-size: 24px;">🚨 ${alertTitle}</h1>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">FamilyHub Emergency System Alert</p>
        </div>

        <div style="background-color: #ffffff; padding: 20px; border-radius: 8px; border-left: 4px solid #ef4444; margin-bottom: 20px;">
          <h3 style="color: #0f172a; margin-top: 0;">Message from ${senderName}:</h3>
          <p style="color: #334155; font-size: 16px; line-height: 24px; margin-bottom: 0;">${alertBody}</p>
        </div>

        <div style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          FamilyHub Real-Time Emergency Network
        </div>
      </div>
    `;

    return await sendResendEmail({
      to: recipientEmails,
      subject: `🚨 FamilyHub Alert: ${alertTitle} from ${senderName}`,
      html: htmlContent,
      text: `${alertTitle}: ${alertBody} (from ${senderName})`,
    });
  } catch (err) {
    console.error('Error sending emergency email to family:', err);
    return { success: false, error: String(err) };
  }
}
