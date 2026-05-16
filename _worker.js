/**
 * ══════════════════════════════════════════════════════
 *  AHITGS — Cloudflare Worker Backend
 *  Routes:
 *    POST /send-otp          → generate & email OTP
 *    POST /verify-otp        → verify OTP code
 *    POST /submit-project    → save project request to KV
 *    GET  /admin/requests    → list all requests (admin key required)
 *
 *  Required Bindings (Cloudflare Pages → Settings → Environment Variables):
 *    KV Namespace : AHITGS_KV
 *    Secret       : EMAILJS_SERVICE_ID
 *    Secret       : EMAILJS_TEMPLATE_ID
 *    Secret       : EMAILJS_PUBLIC_KEY
 *    Secret       : ADMIN_KEY
 *    Secret       : ADMIN_EMAIL
 * ══════════════════════════════════════════════════════
 */

// ─── CORS Headers ─────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ─── Response helpers ─────────────────────────────────────────────────────────
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });

const err = (msg, status = 400) => json({ error: msg }, status);

// ─── OTP Generator ────────────────────────────────────────────────────────────
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── Rate Limiter (KV-based) ──────────────────────────────────────────────────
async function checkRateLimit(env, key, max, windowMs) {
  const rlKey = `rl:${key}`;
  const raw   = await env.AHITGS_KV.get(rlKey);
  const now   = Date.now();

  let record = raw ? JSON.parse(raw) : { count: 0, resetAt: now + windowMs };

  if (now > record.resetAt) {
    record = { count: 0, resetAt: now + windowMs };
  }

  if (record.count >= max) return false;

  record.count++;
  const ttl = Math.ceil((record.resetAt - now) / 1000);
  await env.AHITGS_KV.put(rlKey, JSON.stringify(record), { expirationTtl: ttl });
  return true;
}

// ─── HTML escape ──────────────────────────────────────────────────────────────
function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Email Sender (via EmailJS REST API) ──────────────────────────────────────
async function sendOTPEmail(env, { to, name, code, service }) {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service_id:  env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id:     env.EMAILJS_PUBLIC_KEY,
      template_params: {
      to_email:     to,
      to_name:      name,
      passcode:     code,
      time:         new Date(Date.now() + 10 * 60 * 1000).toLocaleTimeString(),
      service_name: service,
      reply_to:     'reach.ahitgs@hotmail.com',
},
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('EmailJS error:', body);
    throw new Error('Email delivery failed.');
  }

  return true;
}

// ─── Admin notification (via EmailJS REST API) ────────────────────────────────
async function notifyAdmin(env, { name, email, service, subservice, description }) {
  if (!env.ADMIN_EMAIL || !env.EMAILJS_SERVICE_ID) return;

  await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      service_id:  env.EMAILJS_SERVICE_ID,
      template_id: env.EMAILJS_TEMPLATE_ID,
      user_id:     env.EMAILJS_PUBLIC_KEY,
      template_params: {
        to_email:     env.ADMIN_EMAIL,
        to_name:      'Abdul Haseeb',
        otp_code:     `NEW REQUEST from ${name}`,
        service_name: `${service} — ${subservice || 'General'} | ${description || ''}`,
        reply_to:     email,
      },
    }),
  });
}

// ══════════════════════════════════════════════════════
//  ROUTE HANDLERS
// ══════════════════════════════════════════════════════

// POST /send-otp
async function handleSendOTP(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON body.'); }

  const { email, name, service } = body;

  if (!email || !email.includes('@'))   return err('A valid email address is required.');
  if (!name  || name.trim().length < 2) return err('Please provide your full name.');

  const allowed = await checkRateLimit(env, `otp_req:${email.toLowerCase()}`, 3, 15 * 60 * 1000);
  if (!allowed) return err('Too many attempts. Please wait 15 minutes before trying again.', 429);

  const code   = generateOTP();
  const expiry = Date.now() + 10 * 60 * 1000;

  await env.AHITGS_KV.put(
    `otp:${email.toLowerCase()}`,
    JSON.stringify({ code, expiry, name: name.trim(), service: service || 'General', attempts: 0 }),
    { expirationTtl: 600 }
  );

  try {
    await sendOTPEmail(env, { to: email, name: name.trim(), code, service: service || 'General' });
  } catch (e) {
    console.error('sendOTPEmail failed:', e.message);
    return err('Could not send the verification email. Please try again.', 500);
  }

  return json({ success: true, message: 'Verification code sent. Please check your email.' });
}

// POST /verify-otp
async function handleVerifyOTP(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON body.'); }

  const { email, otp } = body;
  if (!email || !otp) return err('Email and OTP are required.');

  const raw = await env.AHITGS_KV.get(`otp:${email.toLowerCase()}`);
  if (!raw) return err('No active code found. Please request a new one.', 404);

  const record = JSON.parse(raw);

  if (Date.now() > record.expiry) {
    await env.AHITGS_KV.delete(`otp:${email.toLowerCase()}`);
    return err('This code has expired. Please request a new one.', 410);
  }

  if (record.attempts >= 5) {
    await env.AHITGS_KV.delete(`otp:${email.toLowerCase()}`);
    return err('Too many incorrect attempts. Please request a new code.', 429);
  }

  if (String(otp).trim() !== String(record.code)) {
    record.attempts++;
    await env.AHITGS_KV.put(
      `otp:${email.toLowerCase()}`,
      JSON.stringify(record),
      { expirationTtl: Math.ceil((record.expiry - Date.now()) / 1000) }
    );
    const remaining = 5 - record.attempts;
    return err(`Incorrect code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`, 401);
  }

  await env.AHITGS_KV.delete(`otp:${email.toLowerCase()}`);

  await env.AHITGS_KV.put(
    `session:${email.toLowerCase()}:${Date.now()}`,
    JSON.stringify({ email, name: record.name, service: record.service, verifiedAt: Date.now() }),
    { expirationTtl: 86400 }
  );

  return json({
    success: true,
    name:    record.name,
    service: record.service,
    message: 'Verification successful. Welcome to the portal.',
  });
}

// POST /submit-project
async function handleSubmitProject(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON body.'); }

  const { email, name, service, subservice, description } = body;

  if (!email || !name)      return err('Client details are missing.');
  if (!description?.trim()) return err('Project description is required.');

  const allowed = await checkRateLimit(env, `submit:${email.toLowerCase()}`, 5, 60 * 60 * 1000);
  if (!allowed) return err('Too many submissions. Please wait before submitting again.', 429);

  const timestamp = Date.now();
  const reqKey    = `req:${timestamp}:${email.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

  const requestData = {
    type:        'project',
    name:        name.trim(),
    email:       email.trim().toLowerCase(),
    service:     service    || 'General',
    subservice:  subservice || '',
    description: description.trim(),
    timestamp,
    resolved:    false,
  };

  await env.AHITGS_KV.put(reqKey, JSON.stringify(requestData));

  notifyAdmin(env, requestData).catch(e => console.error('Admin notify failed:', e.message));

  return json({ success: true, message: 'Your project request has been submitted. We will be in touch within 24 hours.' });
}

// GET /admin/requests
async function handleAdminRequests(request, env) {
  const url    = new URL(request.url);
  const key    = url.searchParams.get('key') || '';
  const adminK = env.ADMIN_KEY || '';

  if (!adminK || key !== adminK) return err('Unauthorised.', 401);

  const list   = await env.AHITGS_KV.list({ prefix: 'req:' });
  const keys   = list.keys.map(k => k.name);

  const values = await Promise.all(
    keys.map(k => env.AHITGS_KV.get(k).then(v => v ? JSON.parse(v) : null))
  );

  const requests = values.filter(Boolean);
  return json({ success: true, total: requests.length, requests });
}

// ══════════════════════════════════════════════════════
//  MAIN FETCH HANDLER
// ══════════════════════════════════════════════════════
export default {
  async fetch(request, env, ctx) {
    const url    = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'OPTIONS')
      return new Response(null, { status: 204, headers: CORS_HEADERS });

    if (method === 'POST' && url.pathname === '/send-otp')
      return handleSendOTP(request, env);

    if (method === 'POST' && url.pathname === '/verify-otp')
      return handleVerifyOTP(request, env);

    if (method === 'POST' && url.pathname === '/submit-project')
      return handleSubmitProject(request, env);

    if (method === 'GET' && url.pathname === '/admin/requests')
      return handleAdminRequests(request, env);

    if (url.pathname === '/health')
      return json({ status: 'ok', service: 'AHITGS Worker', ts: Date.now() });

    return env.ASSETS.fetch(request);
  },
};
