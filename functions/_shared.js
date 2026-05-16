// ─── Shared utilities for all AHITGS Pages Functions ─────────────────────────

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });

export const err = (msg, status = 400) => json({ error: msg }, status);

export const cors = () => new Response(null, { status: 204, headers: CORS });

export function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function getExpiryTime() {
  const d = new Date(Date.now() + 10 * 60 * 1000);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export async function checkRateLimit(env, key, max, windowMs) {
  const rlKey = 'rl:' + key;
  const raw   = await env.AHITGS_KV.get(rlKey);
  const now   = Date.now();

  let record = raw ? JSON.parse(raw) : { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) record = { count: 0, resetAt: now + windowMs };
  if (record.count >= max) return false;

  record.count++;
  const ttl = Math.ceil((record.resetAt - now) / 1000);
  await env.AHITGS_KV.put(rlKey, JSON.stringify(record), { expirationTtl: ttl });
  return true;
}

export async function sendEmail(env, toEmail, toName, passcode, time) {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id:  env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id:     env.EMAILJS_PUBLIC_KEY,
      template_params: {
        email:    toEmail,
        to_name:  toName,
        passcode: passcode,
        time:     time,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('EmailJS error:', body);
    throw new Error('Email delivery failed: ' + body);
  }

  return true;
}
