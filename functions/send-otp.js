export async function onRequestPost(context) {
  try {
    const { email, name, service } = await context.request.json();
    const otpCode = Math.floor(100000 + Math.random() * 900000);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${context.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Velocitech <onboarding@resend.dev>',
        to: email,
        subject: 'Your Velocitech Access Code',
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: auto; border: 2px solid #064E3B; border-radius: 15px; overflow: hidden; background-color: #ffffff;">
            <div style="background-color: #064E3B; padding: 20px; text-align: center;">
              <h1 style="color: #D4AF37; margin: 0; font-size: 24px;">Velocitech Authentication</h1>
            </div>
            <div style="padding: 30px; color: #333333;">
              <p style="font-size: 16px; margin-bottom: 20px;">Assalam-o-Alaikum <strong>${name || 'Valued Client'}</strong>,</p>
              <p style="font-size: 14px; color: #666;">Your secure access code for <strong>${service || 'General Inquiry'}</strong> is:</p>
              <div style="background-color: #f4f4f4; padding: 20px; border-radius: 10px; text-align: center; margin: 20px 0;">
                <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #064E3B;">${otpCode}</span>
              </div>
              <p style="font-size: 12px; color: #999; text-align: center;">This code is valid for a single session. If you did not request this, please ignore this email.</p>
            </div>
            <div style="background-color: #f9f9f9; padding: 15px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="font-size: 12px; color: #064E3B; margin: 0;">&copy; 2026 AH IT & Research</p>
            </div>
          </div>
        `,
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
