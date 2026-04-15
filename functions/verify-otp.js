export async function onRequestPost(context) {
  const { request, env } = context;
  const { email, otp } = await request.json();
  const now = new Date().toISOString();

  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? AND otp_code = ? AND otp_expiry > ?")
    .bind(email, otp, now).first();

  if (!user) return new Response(JSON.stringify({ error: "Fail" }), { status: 401 });

  await env.DB.prepare("UPDATE users SET otp_code = NULL WHERE email = ?").bind(email).run();

  return new Response(JSON.stringify({ success: true, name: user.name, last_service: user.last_service }), { headers: {"Content-Type":"application/json"} });
}
