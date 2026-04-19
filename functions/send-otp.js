export async function onRequestPost(context) {
  try {
    const { email, name, service } = await context.request.json();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // 1. SAVE to KV Database (Expires in 5 minutes)
    await context.env.KV_DATA.put(email, otpCode, { expirationTtl: 300 });

    // 2. SEND via Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Velocitech <onboarding@resend.dev>',
        to: email,
        subject: 'Your Access Code',
        html: `<strong>Your code is: ${otpCode}</strong>`,
      }),
    });

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
