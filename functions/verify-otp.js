import { json, err, cors } from './_shared.js';

export async function onRequestOptions() {
  return cors();
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON body.'); }

  const { email, otp } = body;
  if (!email || !otp) return err('Email and OTP are required.');

  const raw = await env.AHITGS_KV.get('otp:' + email.toLowerCase());
  if (!raw) return err('No active code found. Please request a new one.', 404);

  const record = JSON.parse(raw);

  if (Date.now() > record.expiry) {
    await env.AHITGS_KV.delete('otp:' + email.toLowerCase());
    return err('This code has expired. Please request a new one.', 410);
  }

  if (record.attempts >= 5) {
    await env.AHITGS_KV.delete('otp:' + email.toLowerCase());
    return err('Too many incorrect attempts. Please request a new code.', 429);
  }

  if (String(otp).trim() !== String(record.code)) {
    record.attempts++;
    await env.AHITGS_KV.put(
      'otp:' + email.toLowerCase(),
      JSON.stringify(record),
      { expirationTtl: Math.ceil((record.expiry - Date.now()) / 1000) }
    );
    const remaining = 5 - record.attempts;
    return err('Incorrect code. ' + remaining + ' attempt' + (remaining !== 1 ? 's' : '') + ' remaining.', 401);
  }

  await env.AHITGS_KV.delete('otp:' + email.toLowerCase());
  await env.AHITGS_KV.put(
    'session:' + email.toLowerCase() + ':' + Date.now(),
    JSON.stringify({ email, name: record.name, service: record.service, verifiedAt: Date.now() }),
    { expirationTtl: 86400 }
  );

  return json({ success: true, name: record.name, service: record.service, message: 'Verification successful.' });
}
