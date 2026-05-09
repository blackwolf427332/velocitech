export async function onRequestGet(context) {
  try {
    const list = await context.env.KV_DATA.list({ prefix: "order:" });
    const orders = await Promise.all(
      list.keys.map(async (key) => {
        const val = await context.env.KV_DATA.get(key.name);
        return JSON.parse(val);
      })
    );
    return new Response(JSON.stringify(orders), { headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
