/**
 * ══════════════════════════════════════════════════════
 *  AHITGS — Cloudflare Worker Backend
 *  Routes:
 *    POST /send-otp          → generate & email OTP
 *    POST /verify-otp        → verify OTP code
 *    POST /submit-project    → save project request to KV
 *    GET  /admin/requests    → list all requests (admin key required)
 *
 *  Required Bindings (Cloudflare Pages → Settings):
 *    KV Namespace : AHITGS_KV
 *    Secret       : MAILJET_API_KEY
 *    Secret       : MAILJET_SECRET_KEY
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

// ─── Email Sender (via Mailjet) ───────────────────────────────────────────────
async function sendOTPEmail(env, { to, name, code, service }) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background:#060A14;font-family:'Helvetica Neue',Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#060A14;min-height:100vh;padding:40px 16px;">
        <tr><td align="center">
          <table width="520" cellpadding="0" cellspacing="0" style="background:#0C1324;border:1px solid rgba(255,255,255,0.08);border-radius:20px;overflow:hidden;max-width:100%;">
            <tr>
              <td style="background:linear-gradient(135deg,rgba(13,92,65,0.4),rgba(6,10,20,0.9));padding:36px 40px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="display:inline-block;width:48px;height:48px;background:rgba(201,150,63,0.15);border:1px solid rgba(201,150,63,0.3);border-radius:14px;margin-bottom:16px;line-height:48px;text-align:center;">
                  <span style="color:#C9963F;font-size:22px;font-weight:700;font-family:Georgia,serif;">A</span>
                </div>
                <div style="color:#FFFFFF;font-size:22px;font-weight:700;">AH<span style="color:#C9963F;">ITGS</span></div>
                <div style="color:#475569;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin-top:4px;">IT &amp; Research Group</div>
              </td>
            </tr>
            <tr>
              <td style="padding:40px;">
                <p style="color:#94A3B8;font-size:13px;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.15em;font-weight:700;">Assalam-o-Alaikum,</p>
                <p style="color:#F1F5F9;font-size:22px;font-weight:700;margin:0 0 20px 0;">${escapeHtml(name)}</p>
                <p style="color:#94A3B8;font-size:14px;line-height:1.7;margin:0 0 32px 0;">
                  Your secure access code for the AHITGS Client Portal is below.
                  This code grants access to the <strong style="color:#CBD5E1;">${escapeHtml(service)}</strong> dashboard.
                  It expires in <strong style="color:#CBD5E1;">10 minutes</strong>.
                </p>
                <div style="background:rgba(201,150,63,0.08);border:1px solid rgba(201,150,63,0.25);border-radius:16px;padding:28px;text-align:center;margin-bottom:32px;">
                  <p style="color:#94A3B8;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;margin:0 0 12px 0;font-weight:700;">Verification Code</p>
                  <p style="font-size:42px;font-weight:800;letter-spacing:0.22em;color:#C9963F;margin:0;font-family:'Courier New',monospace;">${code}</p>
                </div>
                <p style="color:#64748B;font-size:12px;line-height:1.7;margin:0 0 28px 0;padding:16px;background:rgba(239,68,68,0.05);border-left:2px solid rgba(239,68,68,0.3);border-radius:0 8px 8px 0;">
                  If you did not request this code, please ignore this email. Do not share this code with anyone.
                </p>
                <div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:24px;text-align:center;">
                  <p style="color:#334155;font-size:11px;margin:0;line-height:1.8;">
                    AHITGS — Abdul Haseeb IT, Graphics &amp; Research Group<br>
                    <a href="https://velocitech.pages.dev" style="color:#C9963F;text-decoration:none;">velocitech.pages.dev</a>
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  const response = await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(env.MAILJET_API_KEY + ':' + env.MAILJET_SECRET_KEY),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Messages: [
        {
          From:     { Email: 'reach.ahitgs@hotmail.com', Name: 'AHITGS Portal' },
          To:       [{ Email: to, Name: name }],
          Subject:  `${code} — Your AHITGS Access Code`,
          HTMLPart: html,
        }
      ]
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error('Mailjet error:', body);
    throw new Error('Email delivery failed.');
  }

  return true;
}

// ─── Admin notification email (via Mailjet) ───────────────────────────────────
async function notifyAdmin(env, { name, email, service, subservice, description }) {
  if (!env.ADMIN_EMAIL || !env.MAILJET_API_KEY) return;

  await fetch('https://api.mailjet.com/v3.1/send', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(env.MAILJET_API_KEY + ':' + env.MAILJET_SECRET_KEY),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Messages: [
        {
          From:     { Email: 'reach.ahitgs@hotmail.com', Name: 'AHITGS Portal' },
          To:       [{ Email: env.ADMIN_EMAIL }],
          Subject:  `New Request — ${name} (${service})`,
          HTMLPart: `
            <div style="font-family:Arial,sans-serif;background:#060A14;color:#D8D3C8;padding:32px;border-radius:12px;">
              <h2 style="color:#C9963F;margin-top:0;">New Project Request</h2>
              <p><strong>Client:</strong> ${escapeHtml(name)}</p>
              <p><strong>Email:</strong> ${escapeHtml(email)}</p>
              <p><strong>Service:</strong> ${escapeHtml(service)}</p>
              ${subservice  ? `<p><strong>Sub-service:</strong> ${escapeHtml(subservice)}</p>` : ''}
              ${description ? `<p><strong>Description:</strong><br>${escapeHtml(description)}</p>` : ''}
              <p style="color:#64748B;font-size:12px;margin-top:24px;">
                View in admin panel:
                <a href="https://velocitech.pages.dev/?view=admin" style="color:#C9963F;">velocitech.pages.dev/?view=admin</a>
              </p>
            </div>
          `,
        }
      ]
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
