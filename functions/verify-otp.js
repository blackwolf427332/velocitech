export async function onRequestPost(context) {
  try {
    const { email, otp } = await context.request.json();

    // 1. GET code from KV Database
    const storedOtp = await context.env.KV_DATA.get(email);

    // 2. COMPARE
    if (storedOtp && storedOtp === otp) {
      // Success: Delete code so it can't be used twice
      await context.env.KV_DATA.delete(email);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ success: false, error: "Invalid or expired code" }), { status: 401 });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
