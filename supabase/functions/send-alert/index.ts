// @ts-nocheck
import { withSupabase } from 'npm:@supabase/server';

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        },
      });
    }

    try {
      const body = await req.json();
      const { family_id, sender_id, sender_name, title, alert_message, resend_api_key } = body;

      if (!family_id) {
        return Response.json({ error: 'family_id is required' }, { status: 400 });
      }

      // Query profiles of all family members in family_id
      const { data: members, error: dbError } = await ctx.supabaseAdmin
        .from('profiles')
        .select('id, display_name, email, push_token')
        .eq('family_id', family_id);

      if (dbError) {
        return Response.json({ error: dbError.message }, { status: 500 });
      }

      const otherMembers = (members || []).filter((m: any) => m.id !== sender_id);

      // 1. Dispatch Expo Push Notifications
      const pushTokens = otherMembers
        .map((m: any) => m.push_token)
        .filter((token: string | null) => token && token.startsWith('ExponentPushToken'));

      let pushResult = null;
      if (pushTokens.length > 0) {
        const pushMessages = pushTokens.map((token: string) => ({
          to: token,
          sound: 'default',
          title: title || `🔔 Alert from ${sender_name || 'Family Member'}`,
          body: alert_message || 'Emergency family notification',
          data: { family_id, sender_id },
          priority: 'high',
          channelId: 'familyhub-alarms',
        }));

        const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(pushMessages),
        });
        pushResult = await pushRes.json();
      }

      // 2. Dispatch Resend Email Notifications
      const emails = otherMembers
        .map((m: any) => m.email)
        .filter((email: string | null) => email && email.includes('@'));

      let emailResult = null;
      const apiKey = resend_api_key || Deno.env.get('RESEND_API_KEY');

      if (emails.length > 0 && apiKey) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'FamilyHub <onboarding@resend.dev>',
            to: emails,
            subject: `🚨 ${title || 'Emergency Alert'} from ${sender_name || 'Family Member'}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #ef4444;">🚨 ${title || 'Family Hub Alert'}</h2>
                <p><strong>${sender_name || 'Family Member'}</strong> sent an emergency notification:</p>
                <blockquote style="background: #f1f5f9; padding: 12px; border-left: 4px solid #ef4444;">
                  ${alert_message || 'Emergency notification triggered'}
                </blockquote>
                <p style="font-size: 12px; color: #64748b;">FamilyHub Emergency Alerting Network</p>
              </div>
            `,
          }),
        });
        emailResult = await emailRes.json();
      }

      return Response.json({
        success: true,
        push_sent_count: pushTokens.length,
        email_sent_count: emails.length,
        pushResult,
        emailResult,
      });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }),
};
