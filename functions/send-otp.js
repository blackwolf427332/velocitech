export async function onRequestPost(context) {
  const { request, env } = context;
  const { email, name, service } = await request.json();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // 1. Save OTP to your D1 Database
  await env.DB.prepare(`
    INSERT INTO users (email, name, last_service, otp_code, otp_expiry) 
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET otp_code = excluded.otp_code, otp_expiry = excluded.otp_expiry
  `).bind(email, name, service, otp, new Date(Date.now() + 600000).toISOString()).run();

  // 2. Direct API call to MailChannels (No API Key needed!)
  const send_request = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
          personalizations: [{ to: [{ email: email, name: name || "Client" }] }],
          from: { email: "support@velocitech.pages.dev", name: "AH Consultancy" },
          subject: "Your Access Code",
          content: [{
              type: "text/plain", 
              value: `Salam'un alaikum, your code is: ${otp}` 
          }],
      }),
  });

  return new Response(JSON.stringify({ success: send_request.ok }), {
    headers: { "Content-Type": "application/json" }
  });
        }
