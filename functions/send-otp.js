export async function onRequestPost(context) {
  const { request, env } = context;
  const { email, name, service } = await request.json();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = new Date(Date.now() + 10 * 60000).toISOString();

  await env.DB.prepare(`
    INSERT INTO users (email, name, last_service, otp_code, otp_expiry) 
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET otp_code = excluded.otp_code, otp_expiry = excluded.otp_expiry
  `).bind(email, name, service, otp, expiry).run();

  return new Response(JSON.stringify({ debug_code: otp }), { headers: {"Content-Type": "application/json"} });
}
