export async function onRequestPost(context) {
  try {
    const { email, name, service } = await context.request.json();
    const otpCode = Math.floor(100000 + Math.random() * 900000);

    // Using context.env to pull your secret safely
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Velocitech <onboarding@resend.dev>',
        to: email,
        subject: 'Your Secure Login Code',
        html: `<strong>Your code is: ${otpCode}</strong>`,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      return new Response(JSON.stringify({ error: errorData.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      debug_code: otpCode 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
