import { json, err, cors } from '../_shared.js';

export async function onRequestOptions() {
  return cors();
}

export async function onRequestGet({ request, env }) {
  const url    = new URL(request.url);
  const key    = url.searchParams.get('key') || '';
  const adminK = env.ADMIN_KEY || '';

  if (!adminK || key !== adminK) return err('Unauthorised.', 401);

  const list   = await env.AHITGS_KV.list({ prefix: 'req:' });
  const keys   = list.keys.map(function(k) { return k.name; });

  const values = await Promise.all(
    keys.map(function(k) {
      return env.AHITGS_KV.get(k).then(function(v) { return v ? JSON.parse(v) : null; });
    })
  );

  const requests = values.filter(Boolean);
  return json({ success: true, total: requests.length, requests: requests });
}
