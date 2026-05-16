import { json, err, cors, generateOTP, getExpiryTime, checkRateLimit, sendEmail } from './_shared.js';

export async function onRequestOptions() {
  return cors();
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON body.'); }

  const { email, name, service } = body;

  if (!email || !email.includes('@'))   return err('A valid email address is required.');
  if (!name  || name.trim().length < 2) return err('Please provide your full name.');

  const allowed = await checkRateLimit(env, 'otp_req:' + email.toLowerCase(), 3, 15 * 60 * 1000);
  if (!allowed) return err('Too many attempts. Please wait 15 minutes before trying again.', 429);

  const code   = generateOTP();
  const expiry = Date.now() + 10 * 60 * 1000;

  await env.AHITGS_KV.put(
    'otp:' + email.toLowerCase(),
    JSON.stringify({ code, expiry, name: name.trim(), service: service || 'General', attempts: 0 }),
    { expirationTtl: 600 }
  );

  try {
    await sendEmail(env, email, name.trim(), code, getExpiryTime());
  } catch (e) {
    console.error('sendEmail failed:', e.message);
    return err('Could not send the verification email. Please try again.', 500);
  }

  return json({ success: true, message: 'Verification code sent. Please check your email.' });
}
