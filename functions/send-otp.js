export async function onRequestPost(context) {
  try {
    const { email, name } = await context.request.json();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store user info and OTP in KV
    await context.env.KV_DATA.put(`user:${email}`, JSON.stringify({ name, email }));
    await context.env.KV_DATA.put(`otp:${email}`, otpCode, { expirationTtl: 300 });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AHITGS Portal <onboarding@resend.dev>',
        to: email,
        subject: 'Your AHITGS Secure Access Code',
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #D4AF37;">
                <h2>Security Code: ${otpCode}</h2>
                <p>Welcome to the AHITGS Client Environment.</p>
              </div>`,
      }),
    });

    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
