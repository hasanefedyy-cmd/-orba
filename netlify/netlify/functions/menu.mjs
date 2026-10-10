const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
function reply(statusCode, body) { return { statusCode, headers, body: JSON.stringify(body) }; }
function authorized(event) {
  const expected = process.env.ADMIN_PASSWORD;
  const supplied = event.headers?.["x-admin-password"] || event.headers?.["X-Admin-Password"];
  return Boolean(expected && supplied && supplied === expected);
}
async function supabase(path, options = {}) {
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) throw new Error("Netlify ortam değişkenleri eksik: SUPABASE_URL ve SUPABASE_SECRET_KEY gerekli.");
  const response = await fetch(`${base.replace(/\/$/, "")}/rest/v1/${path}`, { ...options, headers: {
    apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
    "Content-Type": "application/json", ...(options.headers || {})
  }});
  const text = await response.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!response.ok) throw new Error(data?.message || data?.hint || data?.details || "Supabase isteği başarısız oldu.");
  return data;
}
export default async (event) => {
  try {
    const method = event.httpMethod;
    const params = new URLSearchParams(event.rawQuery || Object.entries(event.queryStringParameters || {}).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? "")}`).join("&"));
    if (method === "POST" && params.get("action") === "login") {
      const body = JSON.parse(event.body || "{}"); const expected = process.env.ADMIN_PASSWORD;
      if (!expected) return reply(500, { error: "Netlify ADMIN_PASSWORD değişkeni ayarlanmamış." });
      return body.password === expected ? reply(200, { ok: true }) : reply(401, { error: "Şifre yanlış." });
    }
    if (method === "GET") return reply(200, (await supabase("menu?select=id,name,category,price&order=id.asc")) || []);
    if (!["POST", "PUT", "DELETE"].includes(method)) return reply(405, { error: "Bu işlem desteklenmiyor." });
    if (!authorized(event)) return reply(401, { error: "Yönetici girişi gerekli. Lütfen yeniden giriş yap." });
    const id = params.get("id");
    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      if (!body.name || !body.category || !Number.isFinite(Number(body.price)) || Number(body.price) < 0) return reply(400, { error: "Ürün adı, kategori ve geçerli fiyat gerekli." });
      return reply(201, await supabase("menu", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name: String(body.name).trim(), category: String(body.category), price: Number(body.price) }) }));
    }
    if (!id) return reply(400, { error: "Ürün kimliği eksik." });
    if (method === "PUT") {
      const body = JSON.parse(event.body || "{}");
      if (!body.name || !body.category || !Number.isFinite(Number(body.price)) || Number(body.price) < 0) return reply(400, { error: "Ürün adı, kategori ve geçerli fiyat gerekli." });
      return reply(200, await supabase(`menu?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ name: String(body.name).trim(), category: String(body.category), price: Number(body.price) }) }));
    }
    await supabase(`menu?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
    return reply(200, { ok: true });
  } catch (error) { return reply(500, { error: error?.message || "Sunucu hatası." }); }
};
