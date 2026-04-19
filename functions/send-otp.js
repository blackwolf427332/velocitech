export async function onRequestPost(context) {
  try {
    const { email, name, service } = await context.request.json();
    const otpCode = Math.floor(100000 + Math.random() * 900000); // Generates 6-digit code

    // Direct Call to Resend API
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer re_7mkeSziq_2LTTCWoy5xsoibpTcxsj9rq2',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Velocitech <onboarding@resend.dev>',
        to: email,
        subject: 'Your Secure Login Code',
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #064E3B;">
            <h2 style="color: #064E3B;">Velocitech Authentication</h2>
            <p>Assalam-o-Alaikum ${name || 'Client'},</p>
            <p>Your secure access code is:</p>
            <h1 style="background: #f3f4f6; padding: 10px; text-align: center; letter-spacing: 5px;">${otpCode}</h1>
            <p>This code was requested for: <strong>${service || 'General Inquiry'}</strong></p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json();
      return new Response(JSON.stringify({ error: errorData.message }), { status: 500 });
    }

    // Returning the code in debug mode so you can test it immediately
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
