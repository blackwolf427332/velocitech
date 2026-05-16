import { json, err, cors, checkRateLimit, sendEmail, getExpiryTime } from './_shared.js';

export async function onRequestOptions() {
  return cors();
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON body.'); }

  const { email, name, service, subservice, description } = body;

  if (!email || !name)                   return err('Client details are missing.');
  if (!description || !description.trim()) return err('Project description is required.');

  const allowed = await checkRateLimit(env, 'submit:' + email.toLowerCase(), 5, 60 * 60 * 1000);
  if (!allowed) return err('Too many submissions. Please wait before submitting again.', 429);

  const timestamp = Date.now();
  const reqKey    = 'req:' + timestamp + ':' + email.toLowerCase().replace(/[^a-z0-9]/g, '_');

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

  // Notify admin via email
  if (env.ADMIN_EMAIL) {
    const summary = 'NEW REQUEST from ' + name + ' | ' + (service || 'General') + ' | ' + (subservice || '') + ' | ' + description.trim().substring(0, 80);
    sendEmail(env, env.ADMIN_EMAIL, 'Abdul Haseeb', summary, new Date().toLocaleString())
      .catch(function(e) { console.error('Admin notify failed:', e.message); });
  }

  return json({ success: true, message: 'Project request submitted. We will be in touch within 24 hours.' });
}
