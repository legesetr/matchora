// ============================================================
// Matchora Proxy — Deno Deploy v17
// Cloudflare Workers v16'nın Deno uyarlaması
// ============================================================

const MATCHORA_BASE = "https://matchora.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const SESSION_COOKIE = "mcp_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CHANNELS = [
  { id: "913461", name: "beIN Sports 1-61", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913460", name: "beIN Sports 1-60-FHD", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913459", name: "beIN Sports 1-59-HD İY", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913458", name: "beIN Sports 1-58", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913457", name: "beIN Sports 1-57", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913456", name: "beIN Sports 1-56", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913455", name: "beIN Sports 2-55-FHD", tvgId: "beinsports2.tr", group: "beIN" },
  { id: "913446", name: "beIN Sports 1-46", tvgId: "beinsports2.tr", group: "beIN" },
  { id: "913454", name: "beIN Sports 3-54", tvgId: "beinsports3.tr", group: "beIN" },
  { id: "913453", name: "beIN Sports 4-53", tvgId: "beinsports4.tr", group: "beIN" },
  { id: "913452", name: "beIN Sports 1-max1 52", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913451", name: "beIN Sports 1-max 2-51", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913450", name: "beIN Sports -50", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "1091502", name: "beIN Sports 5", tvgId: "beinsports5.tr", group: "beIN" },
  { id: "1091501", name: "beIN Sports 5 +", tvgId: "beinsports5p.tr", group: "beIN" },
  { id: "913440", name: "beIN Sports Haber", tvgId: "beinsportshaber.tr", group: "beIN" },
  { id: "913379", name: "S Sport", tvgId: "ssport.tr", group: "S Sport" },
  { id: "913380", name: "S Sport 2", tvgId: "ssport2.tr", group: "S Sport" },
  { id: "913401", name: "TRT Spor", tvgId: "trtspor.tr", group: "TRT" },
  { id: "913405", name: "TRT Spor Yıldız", tvgId: "trtsporyildiz.tr", group: "TRT" },
  { id: "913403", name: "A Spor-03", tvgId: "aspor.tr", group: "Ulusal" },
  { id: "913402", name: "A Spor-02", tvgId: "aspor.tr", group: "Ulusal" },
  { id: "913401", name: "A Spor-01", tvgId: "aspor.tr", group: "Ulusal" },
  { id: "913400", name: "A Spor-00", tvgId: "aspor.tr", group: "Ulusal" },
  { id: "913376", name: "Spor Smart", tvgId: "sporsmart.tr", group: "Ulusal" },
  { id: "913374", name: "Sports TV", tvgId: "sportstv.tr", group: "Ulusal" },
  { id: "913367", name: "TJK TV", tvgId: "tjktv.tr", group: "Ulusal" },
  { id: "1913944", name: "Ekol Sports", tvgId: "ekolsports.tr", group: "Ulusal" },
  { id: "1639118", name: "Haber Türk Spor", tvgId: "haberturkspor.tr", group: "Ulusal" },
  { id: "2142839", name: "İdman TV", tvgId: "idmantv.tr", group: "Ulusal" },
  { id: "1980495", name: "Tabii", tvgId: "tabii.tr", group: "Ulusal" },
  { id: "913396", name: "EXXEN Spor 1", tvgId: "exxen1.tr", group: "EXXEN" },
  { id: "913394", name: "EXXEN Spor 2", tvgId: "exxen2.tr", group: "EXXEN" },
  { id: "913392", name: "EXXEN Spor 3", tvgId: "exxen3.tr", group: "EXXEN" },
  { id: "913390", name: "EXXEN Spor 4", tvgId: "exxen4.tr", group: "EXXEN" },
  { id: "913388", name: "EXXEN Spor 5", tvgId: "exxen5.tr", group: "EXXEN" },
  { id: "913386", name: "EXXEN Spor 6", tvgId: "exxen6.tr", group: "EXXEN" },
  { id: "913384", name: "EXXEN Spor 7", tvgId: "exxen7.tr", group: "EXXEN" },
];

const READY_MAX_ATTEMPTS = 10;
const READY_DELAY_MS = 3000;
const CAPACITY_DELAY_MS = 5000;
const MANIFEST_CACHE_MS = 1500;

const tokenCache: Record<string, any> = {};
const manifestCache: Record<string, any> = {};
const pendingFetch: Record<string, Promise<any> | null> = {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------
// Deno KV
// ------------------------------------------------------------
let kvReady: Promise<Deno.Kv> | null = null;
async function getKv(): Promise<Deno.Kv | null> {
  if (!kvReady) {
    try { kvReady = Deno.openKv(); }
    catch (e) { console.error("KV open failed:", e); return null; }
  }
  try { return await kvReady; }
  catch (e) { console.error("KV await failed:", e); return null; }
}

async function getChannels(): Promise<any[]> {
  const kv = await getKv();
  if (!kv) return DEFAULT_CHANNELS;
  try {
    const r = await kv.get(["channels"]);
    if (Array.isArray(r.value)) return r.value as any[];
    await kv.set(["channels"], DEFAULT_CHANNELS);
    return DEFAULT_CHANNELS;
  } catch (e) {
    console.error("KV get error:", e);
    return DEFAULT_CHANNELS;
  }
}

async function saveChannels(channels: any[]): Promise<void> {
  const kv = await getKv();
  if (!kv) throw new Error("Deno KV kullanılamıyor");
  await kv.set(["channels"], channels);
}

// ------------------------------------------------------------
// Auth helpers
// ------------------------------------------------------------
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return match ? match[1] : null;
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function createSession(secret: string): Promise<string> {
  const payload = btoa(JSON.stringify({ exp: Date.now() + SESSION_TTL_MS }));
  const sig = await hmacSign(payload, secret);
  return payload + "." + sig;
}

async function verifySession(cookie: string | null, secret: string): Promise<boolean> {
  if (!cookie || !cookie.includes(".")) return false;
  const [payload, sig] = cookie.split(".");
  try {
    const expected = await hmacSign(payload, secret);
    if (!timingSafeEqual(sig, expected)) return false;
    const data = JSON.parse(atob(payload));
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch { return false; }
}

async function requireAuth(req: Request): Promise<boolean> {
  const pass = Deno.env.get("ADMIN_PASSWORD");
  if (!pass) return false;
  const cookie = getCookie(req, SESSION_COOKIE);
  return await verifySession(cookie, pass);
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function isNumericId(s: string): boolean {
  if (typeof s !== "string" || s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

function charCodes(s: string): string {
  const r: number[] = [];
  for (let i = 0; i < s.length; i++) r.push(s.charCodeAt(i));
  return r.join(",");
}

function jsonResp(obj: any, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ------------------------------------------------------------
// Matchora token
// ------------------------------------------------------------
async function fetchFreshToken(channelId: string) {
  const playApi = MATCHORA_BASE + "/api/play/" + channelId;
  const embedUrl = MATCHORA_BASE + "/embed/channel/" + channelId;
  for (let attempt = 1; attempt <= READY_MAX_ATTEMPTS; attempt++) {
    try {
      const resp = await fetch(playApi, {
        headers: { "User-Agent": UA, Referer: embedUrl, Origin: MATCHORA_BASE, Accept: "application/json, */*" },
      });
      const body = await resp.text();
      if (!resp.ok) {
        if (attempt < READY_MAX_ATTEMPTS) { await sleep(READY_DELAY_MS); continue; }
        throw new Error("API " + resp.status);
      }
      const json = JSON.parse(body);
      if (json.ready && json.url && !json.url.includes("%3C")) {
        const streamUrl = json.url.replace(/\\\//g, "/");
        const expiresAt = Date.now() + (json.expires_in || 600) * 1000 - 30000;
        tokenCache[channelId] = { streamUrl, expiresAt };
        return tokenCache[channelId];
      }
      const reason = json.reason || "unknown";
      if (attempt < READY_MAX_ATTEMPTS) {
        await sleep(reason === "capacity" ? CAPACITY_DELAY_MS : READY_DELAY_MS);
      }
    } catch (e) {
      if (attempt < READY_MAX_ATTEMPTS) await sleep(READY_DELAY_MS);
      else throw e;
    }
  }
  throw new Error("Yayın hazır değil");
}

async function getToken(channelId: string, force = false) {
  const cache = tokenCache[channelId];
  if (!force && cache && cache.expiresAt > Date.now() + 10000) return cache;
  if (pendingFetch[channelId]) return await pendingFetch[channelId];
  pendingFetch[channelId] = (async () => {
    try { return await fetchFreshToken(channelId); }
    finally { pendingFetch[channelId] = null; }
  })();
  return await pendingFetch[channelId];
}

// ------------------------------------------------------------
// Manifest proxy
// ------------------------------------------------------------
async function proxyM3U8(streamUrl: string, channelId: string, baseOrigin: string): Promise<Response> {
  const cached = manifestCache[channelId];
  if (cached && cached.expiresAt > Date.now()) {
    return new Response(cached.body, {
      headers: { "Content-Type": "application/vnd.apple.mpegurl", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" },
    });
  }
  const resp = await fetch(streamUrl, {
    headers: { "User-Agent": UA, Referer: MATCHORA_BASE + "/", Origin: MATCHORA_BASE },
  });
  if (!resp.ok) throw new Error("Upstream " + resp.status);
  const text = await resp.text();
  const baseUrl = new URL(streamUrl);
  const out: string[] = [];
  let hasStart = false, hasIndependent = false;
  for (const line of text.split("\n")) {
    const tr = line.trim();
    if (!tr) { out.push(line); continue; }
    if (tr.startsWith("#EXT-X-START")) hasStart = true;
    if (tr.startsWith("#EXT-X-INDEPENDENT-SEGMENTS")) hasIndependent = true;
    if (tr.startsWith("#") && tr.includes('URI="')) {
      out.push(tr.replace(/URI="([^"]+)"/g, (_: string, u: string) => {
        try {
          const abs = new URL(u, baseUrl).href;
          return 'URI="' + baseOrigin + "/seg?c=" + channelId + "&u=" + encodeURIComponent(abs) + '"';
        } catch { return 'URI="' + u + '"'; }
      }));
      continue;
    }
    if (tr.startsWith("#")) { out.push(line); continue; }
    try {
      const abs = new URL(tr, baseUrl).href;
      out.push(baseOrigin + "/seg?c=" + channelId + "&u=" + encodeURIComponent(abs));
    } catch { out.push(line); }
  }
  const extras: string[] = [];
  if (!hasIndependent) extras.push("#EXT-X-INDEPENDENT-SEGMENTS");
  if (!hasStart) extras.push("#EXT-X-START:TIME-OFFSET=-6.0,PRECISE=YES");
  if (extras.length) {
    const idx = out.findIndex((l) => l.trim().startsWith("#EXTM3U"));
    out.splice(idx >= 0 ? idx + 1 : 0, 0, ...extras);
  }
  const finalBody = out.join("\n");
  manifestCache[channelId] = { body: finalBody, expiresAt: Date.now() + MANIFEST_CACHE_MS };
  return new Response(finalBody, {
    headers: { "Content-Type": "application/vnd.apple.mpegurl", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" },
  });
}

// ------------------------------------------------------------
// Segment proxy
// ------------------------------------------------------------
async function handleSegment(channelId: string, originalUrl: string): Promise<Response> {
  const cache = await getToken(channelId);
  const orig = new URL(originalUrl);
  const cur = new URL(cache.streamUrl);
  const newToken = cur.searchParams.get("t");
  const oldToken = orig.searchParams.get("t");
  if (newToken && oldToken && oldToken !== newToken) orig.searchParams.set("t", newToken);

  const resp = await fetch(orig.href, {
    headers: { "User-Agent": UA, Referer: MATCHORA_BASE + "/", Origin: MATCHORA_BASE },
  });
  if (!resp.ok && (resp.status === 403 || resp.status === 401)) {
    await getToken(channelId, true);
    const c2 = tokenCache[channelId];
    const o2 = new URL(originalUrl);
    const t2 = new URL(c2.streamUrl).searchParams.get("t");
    if (t2) o2.searchParams.set("t", t2);
    const r2 = await fetch(o2.href, {
      headers: { "User-Agent": UA, Referer: MATCHORA_BASE + "/", Origin: MATCHORA_BASE },
    });
    if (r2.ok) {
      return new Response(r2.body, {
        headers: { "Content-Type": r2.headers.get("Content-Type") || "video/mp2t", "Access-Control-Allow-Origin": "*" },
      });
    }
  }
  if (!resp.ok) return new Response("Segment " + resp.status, { status: resp.status });
  return new Response(resp.body, {
    headers: { "Content-Type": resp.headers.get("Content-Type") || "video/mp2t", "Access-Control-Allow-Origin": "*" },
  });
}

// ------------------------------------------------------------
// M3U builder
// ------------------------------------------------------------
function buildM3U(channels: any[], baseOrigin: string): string {
  const lines: string[] = ["#EXTM3U"];
  for (const ch of channels) {
    lines.push(
      '#EXTINF:-1 tvg-id="' + (ch.tvgId || ch.id) + '" tvg-name="' + ch.name + '" group-title="' + (ch.group || "Genel") + '",' + ch.name
    );
    lines.push(baseOrigin + "/play/" + ch.id);
  }
  lines.push("");
  return lines.join("\n");
}

async function fetchTurkishChannels() {
  const resp = await fetch(MATCHORA_BASE + "/api/v1/channels", {
    headers: { "User-Agent": UA, Referer: MATCHORA_BASE, Accept: "application/json" },
  });
  const json = await resp.json();
  const list = json.channels || json.data || (Array.isArray(json) ? json : []);
  const out: any[] = [];
  const seen = new Set<string>();
  for (const ch of list) {
    for (const feed of (ch.feeds || [])) {
      if (feed.country !== "TR") continue;
      const m = (feed.embed_url || "").match(/\/(\d+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ id: m[1], name: feed.label || ch.name, tvgId: "", group: ch.name || "TR" });
    }
  }
  return out;
}

// ------------------------------------------------------------
// Admin handlers
// ------------------------------------------------------------
async function handleLogin(req: Request): Promise<Response> {
  const pass = Deno.env.get("ADMIN_PASSWORD");
  if (!pass) {
    return jsonResp({
      error: "ADMIN_PASSWORD ayarlanmamış",
      detail: "Deno Deploy panelinde 'Environment Variables' bölümüne ADMIN_PASSWORD ekleyin ve Production context'ini seçin."
    }, 500);
  }
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const password = body.password || "";
  if (!timingSafeEqual(password, pass)) {
    return jsonResp({ error: "Yanlış şifre" }, 401);
  }
  const session = await createSession(pass);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": SESSION_COOKIE + "=" + session + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + maxAge,
    },
  });
}

function handleLogout(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0",
    },
  });
}

async function handleListChannels(): Promise<Response> {
  return jsonResp(await getChannels());
}

async function handleSaveChannels(req: Request): Promise<Response> {
  try {
    let channels: any;
    try { channels = await req.json(); } catch (e: any) {
      return jsonResp({ error: "JSON parse hatası", detail: e.message }, 400);
    }
    if (!Array.isArray(channels)) return jsonResp({ error: "Dizi bekleniyor" }, 400);

    const idMap = new Map<string, number[]>();
    for (let i = 0; i < channels.length; i++) {
      const c = channels[i];
      const id = String((c && c.id) || "").trim();
      if (!isNumericId(id)) {
        return jsonResp({
          error: "Satır " + (i + 1) + ": ID sayısal olmalı",
          detail: 'Gelen: "' + id + '" | uzunluk: ' + id.length + ' | kodlar: ' + charCodes(id),
        }, 400);
      }
      const name = String((c && c.name) || "").trim();
      if (!name) return jsonResp({ error: "Satır " + (i + 1) + ": İsim zorunlu" }, 400);
      if (!idMap.has(id)) idMap.set(id, []);
      idMap.get(id)!.push(i + 1);
    }
    const dupes = [...idMap.entries()].filter(([_, rows]) => rows.length > 1);
    if (dupes.length) {
      const detail = dupes.map(([id, rows]) => '"' + id + '" (satır ' + rows.join(", ") + ")").join(" | ");
      return jsonResp({ error: "Tekrarlanan ID: " + detail }, 400);
    }

    const cleaned = channels.map((c: any) => ({
      id: String((c && c.id) || "").trim(),
      name: String((c && c.name) || "").trim(),
      tvgId: (c && c.tvgId) ? String(c.tvgId).trim() : "",
      group: (c && c.group) ? String(c.group).trim() : "Genel",
    }));

    await saveChannels(cleaned);
    for (const id of idMap.keys()) delete manifestCache[id];
    return jsonResp({ ok: true, count: cleaned.length });
  } catch (e: any) {
    return jsonResp({ error: "Sunucu hatası: " + e.message }, 500);
  }
}

// ------------------------------------------------------------
// Admin HTML
// ------------------------------------------------------------
const ADMIN_HTML = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Matchora Proxy — Yönetim</title>
<style>
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px;background:#0f0f1a;color:#e5e7eb;min-height:100vh}
.hidden{display:none!important}
#login-view{max-width:400px;margin:100px auto;background:#1a1a2e;padding:40px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
#login-view h1{margin:0 0 24px;text-align:center;font-size:22px}
input,button{font-family:inherit;font-size:14px}
input[type=password],input[type=text]{width:100%;padding:12px;margin-bottom:16px;background:#0f0f1a;border:1px solid #333;border-radius:8px;color:#e5e7eb}
input:focus{outline:none;border-color:#6366f1}
button{background:#6366f1;color:#fff;border:none;padding:12px 20px;border-radius:8px;cursor:pointer;font-weight:600}
button:hover{background:#4f46e5}
button:disabled{opacity:.4;cursor:not-allowed}
button.danger{background:#dc2626}
button.danger:hover{background:#b91c1c}
button.secondary{background:#374151}
button.secondary:hover{background:#4b5563}
#admin-view{max-width:1200px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:30px;padding-bottom:20px;border-bottom:1px solid #333}
header h1{margin:0;font-size:20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#channel-count{font-size:14px;color:#9ca3af;font-weight:400}
.toolbar{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center}
table{width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:8px;overflow:hidden}
th,td{padding:12px;text-align:left;border-bottom:1px solid #333}
th{background:#16162a;font-weight:600;font-size:12px;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px}
tr:hover{background:#1e1e33}
td input{width:100%;padding:6px 8px;margin:0;background:#0f0f1a;border:1px solid #333;border-radius:4px;color:#e5e7eb;font-size:13px;font-family:monospace}
td input:focus{outline:none;border-color:#6366f1}
td input.invalid{border-color:#dc2626;background:#2a0f0f}
.status-msg{position:fixed;top:20px;right:20px;padding:14px 24px;border-radius:8px;font-weight:500;z-index:100;animation:slideIn .3s;max-width:600px;box-shadow:0 10px 30px rgba(0,0,0,.5);word-break:break-word}
.status-msg.success{background:#059669;color:#fff}
.status-msg.error{background:#dc2626;color:#fff}
@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}
.empty{text-align:center;padding:40px;color:#6b7280}
.actions{display:flex;gap:6px}
.actions button{padding:6px 12px;font-size:13px}
#dirty-indicator{color:#f59e0b;font-size:14px;font-weight:500}
@media(max-width:768px){table{font-size:12px}th,td{padding:8px}.actions button{padding:4px 8px;font-size:11px}header h1{font-size:16px}.status-msg{max-width:90vw}}
</style>
</head>
<body>

<div id="login-view">
  <h1>🔒 Yönetim Girişi</h1>
  <form id="login-form">
    <input type="password" id="password-input" placeholder="Şifre" required autofocus>
    <button type="submit" style="width:100%">Giriş Yap</button>
  </form>
</div>

<div id="admin-view" class="hidden">
  <header>
    <h1>📺 Matchora Proxy <span id="channel-count"></span></h1>
    <button id="logout-btn" class="secondary">Çıkış</button>
  </header>
  <div class="toolbar">
    <button id="add-btn">+ Yeni Kanal</button>
    <button id="save-btn" disabled>💾 Kaydet</button>
    <span id="dirty-indicator"></span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:110px">ID</th>
        <th>İsim</th>
        <th style="width:150px">TVG ID</th>
        <th style="width:130px">Grup</th>
        <th style="width:80px">İşlem</th>
      </tr>
    </thead>
    <tbody id="channels-body"></tbody>
  </table>
</div>

<script>
var channels = [];
var el = function(id) { return document.getElementById(id); };
var esc = function(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };

function isNumericId(s) {
  if (typeof s !== 'string' || s.length === 0) return false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}
function charCodes(s) {
  var r = [];
  for (var i = 0; i < s.length; i++) r.push(s.charCodeAt(i));
  return r.join(',');
}
function setDirty(v) {
  el('save-btn').disabled = !v;
  el('dirty-indicator').textContent = v ? '⚠ Kaydedilmemiş değişiklikler' : '';
}
function msg(text, type, duration) {
  type = type || 'success'; duration = duration || 5000;
  var d = document.createElement('div');
  d.className = 'status-msg ' + type;
  d.textContent = text;
  document.body.appendChild(d);
  setTimeout(function() { d.remove(); }, duration);
}
function updateCount() {
  var c = el('channel-count');
  if (c) c.textContent = channels.length ? '(' + channels.length + ' kanal)' : '(boş)';
}
function clearHighlights() {
  var rows = document.querySelectorAll('#channels-body tr');
  for (var i = 0; i < rows.length; i++) { rows[i].style.background = ''; rows[i].style.transition = ''; }
  var inps = document.querySelectorAll('#channels-body input');
  for (var j = 0; j < inps.length; j++) inps[j].classList.remove('invalid');
}
function highlightRows(idxList) {
  clearHighlights();
  idxList.forEach(function(idx, n) {
    var row = document.querySelector('#channels-body tr:nth-child(' + (idx + 1) + ')');
    if (row) {
      row.style.background = '#7f1d1d';
      row.style.transition = 'background .3s';
      var idInput = row.querySelector('input[data-f="id"]');
      if (idInput) idInput.classList.add('invalid');
      if (n === 0) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
}
function findDuplicates() {
  var map = {};
  channels.forEach(function(c, i) {
    var id = String(c.id || '').trim();
    if (!id) return;
    if (!map[id]) map[id] = [];
    map[id].push(i);
  });
  var result = [];
  for (var id in map) {
    if (map[id].length > 1) result.push([id, map[id]]);
  }
  return result;
}
function render() {
  var tb = el('channels-body');
  tb.innerHTML = '';
  updateCount();
  if (!channels.length) {
    tb.innerHTML = '<tr><td colspan="5" class="empty">Henüz kanal yok. "+ Yeni Kanal" butonuna tıklayın.</td></tr>';
    return;
  }
  var dupes = findDuplicates();
  var dupeIds = {};
  dupes.forEach(function(d) { dupeIds[d[0]] = true; });
  channels.forEach(function(ch, i) {
    var tr = document.createElement('tr');
    var isDupe = dupeIds[String(ch.id || '').trim()] === true;
    tr.innerHTML =
      '<td><input type="text" value="' + esc(ch.id) + '" data-f="id" data-i="' + i + '"' + (isDupe ? ' class="invalid"' : '') + '></td>' +
      '<td><input type="text" value="' + esc(ch.name) + '" data-f="name" data-i="' + i + '"></td>' +
      '<td><input type="text" value="' + esc(ch.tvgId || '') + '" data-f="tvgId" data-i="' + i + '"></td>' +
      '<td><input type="text" value="' + esc(ch.group || '') + '" data-f="group" data-i="' + i + '"></td>' +
      '<td class="actions"><button class="danger" data-del="' + i + '">Sil</button></td>';
    if (isDupe) tr.style.background = 'rgba(127, 29, 29, 0.4)';
    tb.appendChild(tr);
  });
  var inputs = tb.querySelectorAll('input');
  for (var k = 0; k < inputs.length; k++) {
    (function(inp) {
      inp.addEventListener('input', function(e) {
        var i = +e.target.dataset.i, f = e.target.dataset.f;
        channels[i][f] = e.target.value;
        setDirty(true);
        var d = findDuplicates();
        var dupIds = {};
        d.forEach(function(x) { dupIds[x[0]] = true; });
        var idInps = tb.querySelectorAll('input[data-f="id"]');
        for (var m = 0; m < idInps.length; m++) {
          var iid = String(channels[+idInps[m].dataset.i].id || '').trim();
          if (dupIds[iid]) idInps[m].classList.add('invalid');
          else idInps[m].classList.remove('invalid');
        }
      });
      inp.addEventListener('blur', function(e) {
        var i = +e.target.dataset.i, f = e.target.dataset.f;
        var trimmed = String(e.target.value || '').trim();
        if (trimmed !== e.target.value) {
          e.target.value = trimmed;
          channels[i][f] = trimmed;
        }
      });
    })(inputs[k]);
  }
  var delBtns = tb.querySelectorAll('[data-del]');
  for (var n = 0; n < delBtns.length; n++) {
    (function(b) {
      b.addEventListener('click', function() {
        var i = +b.dataset.del;
        if (confirm('"' + channels[i].name + '" (ID: ' + channels[i].id + ') silinsin mi?')) {
          channels.splice(i, 1);
          render();
          setDirty(true);
        }
      });
    })(delBtns[n]);
  }
}
async function load() {
  var r = await fetch('/api/admin/channels');
  if (r.status === 401) { showLogin(); return; }
  if (!r.ok) { msg('Kanallar yüklenemedi', 'error'); return; }
  channels = await r.json();
  render();
  setDirty(false);
  showAdmin();
}
function showLogin() {
  el('login-view').classList.remove('hidden');
  el('admin-view').classList.add('hidden');
}
function showAdmin() {
  el('login-view').classList.add('hidden');
  el('admin-view').classList.remove('hidden');
}
el('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  var pw = el('password-input').value;
  var r = await fetch('/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: pw })
  });
  if (r.ok) {
    el('password-input').value = '';
    await load();
    msg('Hoş geldiniz!');
  } else {
    var j = await r.json().catch(function(){ return {}; });
    msg(j.error || 'Yanlış şifre', 'error');
  }
});
el('logout-btn').addEventListener('click', async function() {
  await fetch('/api/admin/logout', { method: 'POST' });
  channels = [];
  showLogin();
});
el('add-btn').addEventListener('click', function() {
  channels.push({ id: '', name: 'Yeni Kanal', tvgId: '', group: 'Genel' });
  render();
  setDirty(true);
  setTimeout(function() {
    var rows = document.querySelectorAll('#channels-body tr');
    var last = rows[rows.length - 1];
    if (last) {
      last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var idInput = last.querySelector('input[data-f="id"]');
      if (idInput) idInput.focus();
    }
  }, 50);
});
el('save-btn').addEventListener('click', async function() {
  channels = channels.map(function(c) {
    return {
      id: String(c.id || '').trim(),
      name: String(c.name || '').trim(),
      tvgId: String(c.tvgId || '').trim(),
      group: String(c.group || '').trim()
    };
  });
  for (var i = 0; i < channels.length; i++) {
    if (!channels[i].id) {
      msg('Satır ' + (i + 1) + ': ID boş olamaz', 'error');
      highlightRows([i]); return;
    }
    if (!isNumericId(channels[i].id)) {
      msg('Satır ' + (i + 1) + ': ID sadece sayı olmalı. Gelen: "' + channels[i].id + '" (uzunluk: ' + channels[i].id.length + ', kodlar: ' + charCodes(channels[i].id) + ')', 'error', 12000);
      highlightRows([i]); return;
    }
    if (!channels[i].name) {
      msg('Satır ' + (i + 1) + ': İsim boş olamaz', 'error');
      highlightRows([i]); return;
    }
  }
  var dupes = findDuplicates();
  if (dupes.length) {
    var detail = dupes.map(function(d) { return '"' + d[0] + '" → satır ' + d[1].map(function(i){return i+1;}).join(', '); }).join(' | ');
    msg('Tekrarlanan ID: ' + detail, 'error', 10000);
    highlightRows(dupes.map(function(d) { return d[1]; }).reduce(function(a, b) { return a.concat(b); }, []));
    return;
  }

  try {
    var r = await fetch('/api/admin/channels', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(channels)
    });
    var bodyText = await r.text();
    var j = {};
    try { j = JSON.parse(bodyText); } catch(_) {}

    if (r.ok) {
      render();
      setDirty(false);
      msg('✅ Kaydedildi! (' + channels.length + ' kanal)', 'success');
    } else {
      var errMsg = j.error || 'Kaydetme başarısız';
      var detail = j.detail ? (' — ' + j.detail) : '';
      msg('HTTP ' + r.status + ' | ' + errMsg + detail, 'error', 15000);
    }
  } catch (e) {
    msg('Ağ hatası: ' + e.message, 'error', 15000);
  }
});
fetch('/api/admin/channels').then(function(r) {
  if (r.status === 401) showLogin();
  else if (r.ok) return r.json().then(function(d) { channels = d; render(); showAdmin(); });
}).catch(function() { showLogin(); });
</script>
</body>
</html>`;

// ============================================================
// Ana handler
// ============================================================
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const baseOrigin = url.origin;

  // Debug
  if (path === "/api/admin/debug") {
    const kv = await getKv();
    const result: any = {
      ADMIN_PASSWORD_set: !!Deno.env.get("ADMIN_PASSWORD"),
      ADMIN_PASSWORD_length: (Deno.env.get("ADMIN_PASSWORD") || "").length,
      KV_available: !!kv,
    };
    if (kv) {
      try {
        const r = await kv.get(["channels"]);
        result.kv_read_ok = true;
        result.kv_channel_count = Array.isArray(r.value) ? (r.value as any[]).length : "NOT_ARRAY";
        await kv.set(["_test_" + Date.now()], "ok");
        result.kv_write_ok = true;
      } catch (e: any) {
        result.kv_error = e.message;
      }
    }
    return jsonResp(result);
  }

  // Admin UI
  if (path === "/admin" || path === "/admin/") {
    return new Response(ADMIN_HTML, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // Admin API
  if (path === "/api/admin/login" && req.method === "POST") return await handleLogin(req);
  if (path === "/api/admin/logout") return handleLogout();
  if (path === "/api/admin/channels") {
    const ok = await requireAuth(req);
    if (!ok) return jsonResp({ error: "Unauthorized" }, 401);
    if (req.method === "GET") return await handleListChannels();
    if (req.method === "POST") return await handleSaveChannels(req);
    return new Response("Method not allowed", { status: 405 });
  }

  // Public
  const channels = await getChannels();

  if (path === "/playlist.m3u" || path === "/playlist") {
    return new Response(buildM3U(channels, baseOrigin), {
      headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8", "Cache-Control": "no-cache" },
    });
  }

  if (path === "/playlist-tr.m3u") {
    try {
      const tr = await fetchTurkishChannels();
      return new Response(buildM3U(tr, baseOrigin), {
        headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8", "Cache-Control": "no-cache" },
      });
    } catch (e: any) {
      return new Response("#EXTM3U\n# Hata: " + e.message + "\n", { status: 500 });
    }
  }

  const playMatch = path.match(/^\/play\/(\d+)$/);
  if (playMatch || path === "/play") {
    const channelId = playMatch ? playMatch[1] : (channels[0] && channels[0].id);
    if (!channelId) return new Response("Kanal yok", { status: 400 });
    try {
      const t = await getToken(channelId);
      return await proxyM3U8(t.streamUrl, channelId, baseOrigin);
    } catch (e: any) {
      return jsonResp({ error: e.message }, 502);
    }
  }

  if (path === "/seg") {
    const c = url.searchParams.get("c");
    const u = url.searchParams.get("u");
    if (!c || !u) return new Response("Missing params", { status: 400 });
    try { return await handleSegment(c, u); }
    catch (e: any) { return new Response("Segment error: " + e.message, { status: 502 }); }
  }

  if (path === "/status") {
    const result: any = {};
    for (const ch of channels) {
      const cache = tokenCache[ch.id];
      result[ch.id] = {
        name: ch.name,
        hasToken: !!(cache && cache.streamUrl),
        expiresInMin: cache ? (Math.max(0, cache.expiresAt - Date.now()) / 60000).toFixed(1) : "0",
      };
    }
    return jsonResp(result);
  }

  if (path === "/refresh") {
    const c = url.searchParams.get("c") || (channels[0] && channels[0].id);
    try {
      await getToken(c, true);
      delete manifestCache[c];
      return jsonResp({ ok: true, channelId: c });
    } catch (e: any) {
      return jsonResp({ error: e.message }, 500);
    }
  }

  if (path === "/debug-tr") {
    try {
      const tr = await fetchTurkishChannels();
      return jsonResp({ count: tr.length, channels: tr });
    } catch (e: any) {
      return jsonResp({ error: e.message }, 500);
    }
  }

  return new Response("", {
    status: 404,
    headers: { "Content-Type": "text/plain" },
  });
}

Deno.serve(handler);
