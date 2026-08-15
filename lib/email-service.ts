import { supabase } from '@/lib/supabase';

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

/** Send an email notification via Resend API */
export async function sendResendEmail(payload: EmailPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = getResendApiKey();
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  const validRecipients = recipients.filter((email) => email && email.includes('@'));

  if (validRecipients.length === 0) {
    return { success: false, error: 'No valid recipient email addresses.' };
  }

  if (!apiKey) {
    console.log('📧 [Resend Simulated Preview] (Add EXPO_PUBLIC_RESEND_API_KEY to send live Gmail emails):');
    console.log(`To: ${validRecipients.join(', ')}`);
    console.log(`Subject: ${payload.subject}`);
    return { success: true, id: 'simulated_resend_email_id' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FamilyHub <onboarding@resend.dev>',
        to: validRecipients,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    const data = await response.json();
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

/** Send Emergency Alert Email to all family members */
export async function sendEmergencyEmailToFamily(
  familyId: string,
  senderId: string,
  senderName: string,
  alertTitle: string,
  alertBody: string
) {
  try {
    // 1. Fetch family member emails
    const { data: members } = await supabase
      .from('profiles')
      .select('email, display_name, id')
      .eq('family_id', familyId);

    if (!members || members.length === 0) return;

    // Filter out sender & members without email
    const recipientEmails = members
      .filter((m) => m.id !== senderId && m.email)
      .map((m) => m.email as string);

    if (recipientEmails.length === 0) return;

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
          FamilyHub Real-Time Emergency Network • Sent to ${recipientEmails.length} family member(s)
        </div>
      </div>
    `;

    await sendResendEmail({
      to: recipientEmails,
      subject: `🚨 FamilyHub Alert: ${alertTitle} from ${senderName}`,
      html: htmlContent,
      text: `${alertTitle}: ${alertBody} (from ${senderName})`,
    });
  } catch (err) {
    console.error('Error sending emergency email to family:', err);
  }
}
