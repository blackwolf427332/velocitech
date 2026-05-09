export async function onRequestPost(context) {
  try {
    const { email, service, subService, details, instructions } = await context.request.json();
    const orderId = `order_${Date.now()}`;

    const orderData = {
      orderId,
      email,
      service,
      subService,
      details,
      instructions,
      status: "Pending",
      timestamp: new Date().toISOString()
    };

    // Store order in KV for Admin review
    await context.env.KV_DATA.put(`order:${orderId}`, JSON.stringify(orderData));
    
    // Also track which orders belong to this specific user
    const userOrdersRaw = await context.env.KV_DATA.get(`user_orders:${email}`) || "[]";
    const userOrders = JSON.parse(userOrdersRaw);
    userOrders.push(orderId);
    await context.env.KV_DATA.put(`user_orders:${email}`, JSON.stringify(userOrders));

    return new Response(JSON.stringify({ success: true, orderId }), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
