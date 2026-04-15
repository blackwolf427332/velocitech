export async function onRequestPost(context) {
  const { request, env } = context;
  const { email } = await request.json();
  const logs = await env.DB.prepare("SELECT topic, summary, date_consulted FROM research_logs WHERE user_email = ?")
    .bind(email).all();
  return new Response(JSON.stringify(logs.results), { headers: {"Content-Type":"application/json"} });
}
