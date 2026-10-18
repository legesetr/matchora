// ============================================================
// Matchora Proxy — Deno Deploy (TR Saati + Zamanlayıcı)
// ============================================================

const MATCHORA_BASE = "https://matchora.to";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const SESSION_COOKIE = "mcp_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface Channel {
  id: string;
  name: string;
  tvgId: string;
  group: string;
  enabled: boolean;
  schedule: { days: number[]; start: string; end: string }[];
}

const DEFAULT_CHANNELS: Channel[] = [
  { id: "913461", name: "beIN Sports 1-61test", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913460", name: "beIN Sports 1-60-FHD", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913459", name: "beIN Sports 1-59-HD İY", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913458", name: "beIN Sports 1-58-", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913457", name: "beIN Sports 1-57", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913456", name: "beIN Sports 1-56", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913455", name: "beIN Sports 2-55-FHD", tvgId: "beinsports2.tr", group: "beIN" },
  { id: "913446", name: "beIN Sports 1-46", tvgId: "beinsports2.tr", group: "beIN" },
  { id: "913454", name: "beIN Sports 3-54", tvgId: "beinsports3.tr", group: "beIN" },
  { id: "913453", name: "beIN Sports 4-53", tvgId: "beinsports4.tr", group: "beIN" },
  { id: "913452", name: "beIN Sports 1-max1 52", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913451", name: "beIN Sports 1-max 2-51", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "913450", name: "beIN Sports -50", tvgId: "beinsports1.tr", group: "beIN" },
  { id: "1091502", name: "beIN Sports 5-1091502", tvgId: "beinsports5.tr", group: "beIN" },
  { id: "1091501", name: "beIN Sports 5 +-1091501", tvgId: "beinsports5p.tr", group: "beIN" },
  { id: "913440", name: "beIN Sports Haber-40", tvgId: "beinsportshaber.tr", group: "beIN" },
  { id: "913379", name: "S Sport-913379", tvgId: "ssport.tr", group: "S Sport" },
  { id: "913380", name: "S Sport 2-913380", tvgId: "ssport2.tr", group: "S Sport" },
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
  { id: "913384", name: "EXXEN Spor 7", tvgId: "exxen7.tr", group: "EXXEN" }
].map(c => ({ ...c, enabled: true, schedule: [] }));

const READY_MAX_ATTEMPTS = 10;
const READY_DELAY_MS = 2500;
const CAPACITY_DELAY_MS = 4000;
const MANIFEST_CACHE_MS = 800;
const SEGMENT_CACHE_MS = 30000;
const TOKEN_SAFETY_MS = 60000;
const CHANNELS_CACHE_MS = 60000;

const tokenCache: Record<string, { streamUrl: string; expiresAt: number }> = {};
const manifestCache: Record<string, { body: string; expiresAt: number }> = {};
const pendingFetch: Record<string, Promise<any> | null> = {};

let channelsStore: Channel[] = DEFAULT_CHANNELS.map(c => ({ ...c }));
let channelsCacheExpires = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- Deno KV ----------
let kvInstance: Deno.Kv | null = null;
function getKv(): Promise<Deno.Kv> {
  if (!kvInstance) kvInstance = Deno.openKv() as any;
  return Promise.resolve(kvInstance as any);
}

async function loadChannels(force = false): Promise<Channel[]> {
  if (!force && channelsCacheExpires > Date.now()) return channelsStore;
  try {
    const kv = await getKv();
    const res = await kv.get<Channel[]>(["channels"]);
    if (res.value) {
      channelsStore = res.value.map(c => ({
        ...c,
        enabled: c.enabled !== false,
        schedule: Array.isArray(c.schedule) ? c.schedule : [],
      }));
    } else if (channelsStore.length === 0) {
      channelsStore = DEFAULT_CHANNELS.map(c => ({ ...c }));
    }
  } catch (e) {
    console.error("KV read error:", e);
    if (channelsStore.length === 0) channelsStore = DEFAULT_CHANNELS.map(c => ({ ...c }));
  }
  channelsCacheExpires = Date.now() + CHANNELS_CACHE_MS;
  return channelsStore;
}

async function persistChannels(channels: Channel[]) {
  channelsStore = channels;
  channelsCacheExpires = Date.now() + CHANNELS_CACHE_MS;
  try {
    const kv = await getKv();
    await kv.set(["channels"], channels);
  } catch (e) {
    console.error("KV write error:", e);
  }
}

Deno.cron("purge-closed-channels", "* * * * *", async () => {
  try {
    const channels = await loadChannels(true);
    const now = nowInTR();
    let purged = 0;
    for (const ch of channels) {
      if (!isChannelLiveNow(ch, now)) {
        if (tokenCache[ch.id] || manifestCache[ch.id + ":m"] || manifestCache[ch.id + ":p"]) {
          purgeChannelCache(ch.id);
          purged++;
        }
      }
    }
    if (purged > 0) console.log(`[cron] ${purged} kanal önbelleği temizlendi`);
  } catch (e) { console.error("[cron] hata:", e); }
});

// ---------- Auth ----------
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return match ? match[1] : null;
}
async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
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
  const parts = cookie.split(".");
  try {
    const expected = await hmacSign(parts[0], secret);
    if (!timingSafeEqual(parts[1], expected)) return false;
    const data = JSON.parse(atob(parts[0]));
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch { return false; }
}
async function requireAuth(request: Request): Promise<boolean> {
  const pw = Deno.env.get("ADMIN_PASSWORD");
  if (!pw) return false;
  return await verifySession(getCookie(request, SESSION_COOKIE), pw);
}
function isNumericId(s: string): boolean {
  if (typeof s !== "string" || s.length === 0) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

// ---------- Schedule ----------
function cleanHM(s: any): string {
  if (s == null) return "";
  return String(s).replace(/[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]/g, "");
}
function parseHM(hm: any): number | null {
  if (hm == null) return null;
  const s = cleanHM(hm);
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}
function normalizeHM(s: any): string {
  const cleaned = cleanHM(s);
  const mins = parseHM(cleaned);
  if (mins === null) return cleaned;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function nowInTR() {
  const d = new Date(Date.now() + 3 * 60 * 60 * 1000);
  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function isChannelLiveNow(channel: Channel, now?: { day: number; minutes: number }): boolean {
  now = now || nowInTR();
  if (!channel || channel.enabled === false) return false;
  const schedule = channel.schedule;
  if (!Array.isArray(schedule) || schedule.length === 0) return true;
  for (const slot of schedule) {
    if (!slot || !Array.isArray(slot.days) || slot.days.length === 0) continue;
    const start = parseHM(slot.start);
    const end = parseHM(slot.end);
    if (start === null || end === null) continue;
    if (!slot.days.includes(now.day)) continue;
    if (start <= end) {
      if (now.minutes >= start && now.minutes < end) return true;
    } else {
      if (now.minutes >= start) return true;
      const prevDay = (now.day + 6) % 7;
      for (const s2 of schedule) {
        if (!s2 || !Array.isArray(s2.days) || !s2.days.includes(prevDay)) continue;
        const st2 = parseHM(s2.start), en2 = parseHM(s2.end);
        if (st2 === null || en2 === null) continue;
        if (st2 > en2 && now.minutes < en2) return true;
      }
    }
  }
  return false;
}
function purgeChannelCache(channelId: string) {
  delete tokenCache[channelId];
  delete manifestCache[channelId + ":m"];
  delete manifestCache[channelId + ":p"];
}

// ---------- Upstream ----------
async function fetchFreshToken(channelId: string) {
  const playApi = MATCHORA_BASE + "/api/play/" + channelId;
  const embedUrl = MATCHORA_BASE + "/embed/channel/" + channelId;
  for (let attempt = 1; attempt <= READY_MAX_ATTEMPTS; attempt++) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(playApi, {
        headers: { "User-Agent": UA, Referer: embedUrl, Origin: MATCHORA_BASE, Accept: "application/json, */*" },
        signal: ctrl.signal,
      });
      clearTimeout(to);
      const body = await resp.text();
      if (!resp.ok) {
        if (attempt < READY_MAX_ATTEMPTS) { await sleep(READY_DELAY_MS); continue; }
        throw new Error("API " + resp.status);
      }
      const json = JSON.parse(body);
      if (json.ready && json.url && !json.url.includes("%3C")) {
        const streamUrl = json.url.replace(/\\\//g, "/");
        const expiresAt = Date.now() + (json.expires_in || 600) * 1000 - TOKEN_SAFETY_MS;
        tokenCache[channelId] = { streamUrl, expiresAt };
        return tokenCache[channelId];
      }
      const reason = json.reason || "unknown";
      if (attempt < READY_MAX_ATTEMPTS) await sleep(reason === "capacity" ? CAPACITY_DELAY_MS : READY_DELAY_MS);
    } catch (e) {
      if (attempt < READY_MAX_ATTEMPTS) await sleep(READY_DELAY_MS);
      else throw e;
    }
  }
  throw new Error("Yayın hazır değil");
}
async function getToken(channelId: string, force = false) {
  if (force) delete tokenCache[channelId];
  const cache = tokenCache[channelId];
  if (cache && cache.expiresAt > Date.now()) return cache;
  if (pendingFetch[channelId]) return await pendingFetch[channelId];
  pendingFetch[channelId] = (async () => {
    try { return await fetchFreshToken(channelId); }
    finally { pendingFetch[channelId] = null; }
  })();
  return await pendingFetch[channelId];
}
async function proxyM3U8(streamUrl: string, channelId: string, baseOrigin: string) {
  const cacheKey = channelId + ":" + (streamUrl.includes("master") ? "m" : "p");
  const cached = manifestCache[cacheKey];
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
  let hasIndependent = false;
  for (const line of text.split("\n")) {
    const tr = line.trim();
    if (!tr) { out.push(line); continue; }
    if (tr.startsWith("#EXT-X-INDEPENDENT-SEGMENTS")) hasIndependent = true;
    if (tr.startsWith("#") && tr.includes('URI="')) {
      out.push(tr.replace(/URI="([^"]+)"/g, (_, u) => {
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
  if (!hasIndependent) {
    const idx = out.findIndex(l => l.trim().startsWith("#EXTM3U"));
    out.splice(idx >= 0 ? idx + 1 : 0, 0, "#EXT-X-INDEPENDENT-SEGMENTS");
  }
  const finalBody = out.join("\n");
  manifestCache[cacheKey] = { body: finalBody, expiresAt: Date.now() + MANIFEST_CACHE_MS };
  return new Response(finalBody, {
    headers: { "Content-Type": "application/vnd.apple.mpegurl", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" },
  });
}
async function handleSegment(channelId: string, originalUrl: string) {
  const cache = await getToken(channelId);
  const buildUrl = (baseStreamUrl: string) => {
    const orig = new URL(originalUrl);
    const cur = new URL(baseStreamUrl);
    const newToken = cur.searchParams.get("t");
    const oldToken = orig.searchParams.get("t");
    if (newToken && oldToken && oldToken !== newToken) orig.searchParams.set("t", newToken);
    return orig.href;
  };
  const doFetch = async (href: string) => {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 12000);
    try {
      return await fetch(href, {
        headers: { "User-Agent": UA, Referer: MATCHORA_BASE + "/", Origin: MATCHORA_BASE },
        signal: ctrl.signal,
      });
    } finally { clearTimeout(to); }
  };
  let resp = await doFetch(buildUrl(cache.streamUrl));
  if (!resp.ok && (resp.status === 403 || resp.status === 401)) {
    const fresh = await getToken(channelId, true);
    resp = await doFetch(buildUrl(fresh.streamUrl));
  }
  if (!resp.ok) return new Response("Segment " + resp.status, { status: resp.status });
  const headers: Record<string, string> = {
    "Content-Type": resp.headers.get("Content-Type") || "video/mp2t",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=" + (SEGMENT_CACHE_MS / 1000),
  };
  const len = resp.headers.get("Content-Length");
  if (len) headers["Content-Length"] = len;
  return new Response(resp.body, { headers });
}
function buildM3U(channels: Channel[], baseOrigin: string): string {
  const lines = ["#EXTM3U"];
  const now = nowInTR();
  for (const ch of channels) {
    if (!isChannelLiveNow(ch, now)) continue;
    lines.push(
      '#EXTINF:-1 tvg-id="' + (ch.tvgId || ch.id) + '" tvg-name="' + ch.name + '" group-title="' + (ch.group || "Genel") + '",' + ch.name
    );
    lines.push(baseOrigin + "/play/" + ch.id);
  }
  lines.push("");
  return lines.join("\n");
}
async function fetchTurkishChannels(): Promise<Channel[]> {
  const resp = await fetch(MATCHORA_BASE + "/api/v1/channels", {
    headers: { "User-Agent": UA, Referer: MATCHORA_BASE, Accept: "application/json" },
  });
  const json = await resp.json();
  const list = json.channels || json.data || (Array.isArray(json) ? json : []);
  const out: Channel[] = [];
  const seen = new Set<string>();
  for (const ch of list) {
    for (const feed of (ch.feeds || [])) {
      if (feed.country !== "TR") continue;
      const m = (feed.embed_url || "").match(/\/(\d+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      out.push({ id: m[1], name: feed.label || ch.name, tvgId: "", group: ch.name || "TR", enabled: true, schedule: [] });
    }
  }
  return out;
}

// ---------- Admin HTML (JS ayrı string'de tutuluyor, parse güvenli) ----------
const ADMIN_CSS = `
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px;background:#0f0f1a;color:#e5e7eb;min-height:100vh}
.hidden{display:none!important}
#login-view{max-width:400px;margin:100px auto;background:#1a1a2e;padding:40px;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.5)}
#login-view h1{margin:0 0 24px;text-align:center;font-size:22px}
input,button,select{font-family:inherit;font-size:14px}
input[type=password],input[type=text],input[type=time]{width:100%;padding:10px;background:#0f0f1a;border:1px solid #333;border-radius:8px;color:#e5e7eb}
input:focus,select:focus{outline:none;border-color:#6366f1}
button{background:#6366f1;color:#fff;border:none;padding:10px 18px;border-radius:8px;cursor:pointer;font-weight:600}
button:hover{background:#4f46e5}
button:disabled{opacity:.4;cursor:not-allowed}
button.danger{background:#dc2626}
button.danger:hover{background:#b91c1c}
button.secondary{background:#374151}
button.secondary:hover{background:#4b5563}
button.success{background:#059669}
button.success:hover{background:#047857}
button.small{padding:5px 10px;font-size:12px}
#admin-view{max-width:1300px;margin:0 auto}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #333;gap:10px;flex-wrap:wrap}
header h1{margin:0;font-size:20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#channel-count{font-size:14px;color:#9ca3af;font-weight:400}
.toolbar{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center}
table{width:100%;border-collapse:collapse;background:#1a1a2e;border-radius:8px;overflow:hidden}
th,td{padding:10px;text-align:left;border-bottom:1px solid #333;font-size:13px;vertical-align:middle}
th{background:#16162a;font-weight:600;font-size:11px;text-transform:uppercase;color:#9ca3af;letter-spacing:.5px}
tr:hover{background:#1e1e33}
td input[type=text]{padding:6px 8px;margin:0;font-size:12px;font-family:monospace}
td input.invalid{border-color:#dc2626;background:#2a0f0f}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
.dot.on{background:#10b981;box-shadow:0 0 6px #10b981}
.dot.off{background:#6b7280}
.dot.sched-on{background:#f59e0b;box-shadow:0 0 6px #f59e0b}
.toggle{position:relative;display:inline-block;width:44px;height:22px;flex-shrink:0}
.toggle input{opacity:0;width:0;height:0}
.toggle span{position:absolute;inset:0;background:#374151;border-radius:22px;cursor:pointer;transition:.2s}
.toggle span::before{content:"";position:absolute;height:16px;width:16px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s}
.toggle input:checked+span{background:#10b981}
.toggle input:checked+span::before{transform:translateX(22px)}
.status-msg{position:fixed;top:20px;right:20px;padding:14px 24px;border-radius:8px;font-weight:500;z-index:1000;animation:slideIn .3s;max-width:600px;box-shadow:0 10px 30px rgba(0,0,0,.5);word-break:break-word}
.status-msg.success{background:#059669;color:#fff}
.status-msg.error{background:#dc2626;color:#fff}
.status-msg.info{background:#2563eb;color:#fff}
@keyframes slideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}
.empty{text-align:center;padding:40px;color:#6b7280}
.actions{display:flex;gap:5px;flex-wrap:wrap}
#dirty-indicator{color:#f59e0b;font-size:14px;font-weight:500}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:500;padding:20px}
.modal{background:#1a1a2e;border-radius:12px;padding:24px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.modal h2{margin:0 0 16px;font-size:18px}
.slot{background:#0f0f1a;border:1px solid #333;border-radius:8px;padding:12px;margin-bottom:10px}
.slot-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px}
.slot-head strong{font-size:13px;color:#9ca3af}
.days{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px}
.day-btn{padding:6px 10px;font-size:12px;background:#374151;border-radius:6px;border:none;cursor:pointer;color:#e5e7eb;font-weight:500}
.day-btn.active{background:#6366f1}
.times{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.times label{font-size:12px;color:#9ca3af}
.times input{width:auto;padding:6px 8px;font-family:monospace;flex:1;min-width:100px}
.modal-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}
.badge.green{background:#065f46;color:#6ee7b7}
.badge.gray{background:#374151;color:#9ca3af}
.badge.orange{background:#7c2d12;color:#fdba74}
#js-error-banner{position:fixed;top:0;left:0;right:0;background:#dc2626;color:#fff;padding:12px;z-index:9999;font-family:monospace;font-size:12px;display:none}
#debug-log{position:fixed;bottom:10px;left:10px;right:10px;max-height:120px;overflow:auto;background:rgba(0,0,0,.85);color:#10b981;font-family:monospace;font-size:11px;padding:8px;border-radius:6px;z-index:9998;display:none;border:1px solid #333}
@media(max-width:768px){table{font-size:11px}th,td{padding:6px}header h1{font-size:16px}.status-msg{max-width:90vw}}
`;

const ADMIN_JS = [
  "window.addEventListener('error', function(e) {",
  "  var b = document.getElementById('js-error-banner');",
  "  if (b) { b.style.display = 'block'; b.textContent = 'JS HATASI: ' + (e.message || '?') + ' @ ' + (e.lineno || '?'); }",
  "});",
  "function dbg(m) {",
  "  var d = document.getElementById('debug-log');",
  "  if (d) { d.style.display = 'block'; d.textContent += m + '\\n'; d.scrollTop = d.scrollHeight; }",
  "  console.log('[DBG] ' + m);",
  "}",
  "var channels = [];",
  "var editingIdx = -1;",
  "function el(id) { return document.getElementById(id); }",
  "function esc(s) { return String(s == null ? '' : s).replace(/[&<>\"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]; }); }",
  "var DAYS = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];",
  "function isNumericId(s) {",
  "  if (typeof s !== 'string' || s.length === 0) return false;",
  "  for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 48 || c > 57) return false; }",
  "  return true;",
  "}",
  "function cleanHM(s) {",
  "  if (s == null) return '';",
  "  return String(s).replace(/[\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]/g, '');",
  "}",
  "function parseHM(hm) {",
  "  if (hm == null) return null;",
  "  var s = cleanHM(hm);",
  "  var m = s.match(/^(\\d{1,2}):(\\d{2})(?::\\d{2}(?:\\.\\d+)?)?$/);",
  "  if (!m) return null;",
  "  var h = +m[1], mi = +m[2];",
  "  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;",
  "  return h * 60 + mi;",
  "}",
  "function normalizeHM(s) {",
  "  var cleaned = cleanHM(s);",
  "  var mins = parseHM(cleaned);",
  "  if (mins === null) return cleaned;",
  "  var h = Math.floor(mins / 60);",
  "  var m = mins % 60;",
  "  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');",
  "}",
  "function nowInTR() {",
  "  var d = new Date(Date.now() + 3 * 60 * 60 * 1000);",
  "  return { day: d.getUTCDay(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };",
  "}",
  "function trClockString() {",
  "  var d = new Date(Date.now() + 3 * 60 * 60 * 1000);",
  "  var pad = function(n){return String(n).padStart(2,'0');};",
  "  return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());",
  "}",
  "function isChannelLiveNow(ch, now) {",
  "  now = now || nowInTR();",
  "  if (!ch || ch.enabled === false) return false;",
  "  var schedule = ch.schedule;",
  "  if (!Array.isArray(schedule) || schedule.length === 0) return true;",
  "  for (var i = 0; i < schedule.length; i++) {",
  "    var s = schedule[i];",
  "    if (!s || !Array.isArray(s.days) || s.days.length === 0) continue;",
  "    var start = parseHM(s.start), end = parseHM(s.end);",
  "    if (start === null || end === null) continue;",
  "    if (s.days.indexOf(now.day) === -1) continue;",
  "    if (start <= end) {",
  "      if (now.minutes >= start && now.minutes < end) return true;",
  "    } else {",
  "      if (now.minutes >= start) return true;",
  "      var prevDay = (now.day + 6) % 7;",
  "      for (var j = 0; j < schedule.length; j++) {",
  "        var s2 = schedule[j];",
  "        if (!s2 || !Array.isArray(s2.days) || s2.days.indexOf(prevDay) === -1) continue;",
  "        var st2 = parseHM(s2.start), en2 = parseHM(s2.end);",
  "        if (st2 === null || en2 === null) continue;",
  "        if (st2 > en2 && now.minutes < en2) return true;",
  "      }",
  "    }",
  "  }",
  "  return false;",
  "}",
  "function setDirty(v) {",
  "  var b = el('save-btn'); if (b) b.disabled = !v;",
  "  var d = el('dirty-indicator'); if (d) d.textContent = v ? '⚠ Kaydedilmemiş değişiklikler' : '';",
  "}",
  "function msg(text, type, duration) {",
  "  type = type || 'success'; duration = duration || 5000;",
  "  var d = document.createElement('div');",
  "  d.className = 'status-msg ' + type;",
  "  d.textContent = text;",
  "  document.body.appendChild(d);",
  "  setTimeout(function() { d.remove(); }, duration);",
  "  dbg(text);",
  "}",
  "function updateCount() {",
  "  var c = el('channel-count');",
  "  if (c) c.textContent = channels.length ? '(' + channels.length + ' kanal)' : '(boş)';",
  "}",
  "function scheduleSummary(schedule) {",
  "  if (!Array.isArray(schedule) || schedule.length === 0) return '<span class=\"badge gray\">program yok</span>';",
  "  return schedule.map(function(s) {",
  "    var d = (s.days || []).map(function(x){return DAYS[x];}).join(',');",
  "    return '<span class=\"badge orange\" style=\"margin:1px\">' + d + ' ' + esc(s.start) + '-' + esc(s.end) + '</span>';",
  "  }).join(' ');",
  "}",
  "function statusBadge(ch, now) {",
  "  if (ch.enabled === false) return '<span class=\"dot off\"></span><span class=\"badge gray\">kapalı</span>';",
  "  if (!Array.isArray(ch.schedule) || ch.schedule.length === 0) return '<span class=\"dot on\"></span><span class=\"badge green\">açık</span>';",
  "  return isChannelLiveNow(ch, now)",
  "    ? '<span class=\"dot sched-on\"></span><span class=\"badge orange\">programda açık</span>'",
  "    : '<span class=\"dot off\"></span><span class=\"badge gray\">programda kapalı</span>';",
  "}",
  "function render() {",
  "  var tb = el('channels-body');",
  "  if (!tb) { dbg('HATA: channels-body yok'); return; }",
  "  tb.innerHTML = '';",
  "  updateCount();",
  "  var now = nowInTR();",
  "  if (!channels.length) {",
  "    tb.innerHTML = '<tr><td colspan=\"8\" class=\"empty\">Henüz kanal yok.</td></tr>';",
  "    return;",
  "  }",
  "  channels.forEach(function(ch, i) {",
  "    var tr = document.createElement('tr');",
  "    tr.innerHTML =",
  "      '<td>' + statusBadge(ch, now) + '</td>' +",
  "      '<td><label class=\"toggle\"><input type=\"checkbox\" data-en=\"' + i + '\"' + (ch.enabled !== false ? ' checked' : '') + '><span></span></label></td>' +",
  "      '<td><input type=\"text\" value=\"' + esc(ch.id) + '\" data-f=\"id\" data-i=\"' + i + '\"></td>' +",
  "      '<td><input type=\"text\" value=\"' + esc(ch.name) + '\" data-f=\"name\" data-i=\"' + i + '\"></td>' +",
  "      '<td><input type=\"text\" value=\"' + esc(ch.tvgId || '') + '\" data-f=\"tvgId\" data-i=\"' + i + '\"></td>' +",
  "      '<td><input type=\"text\" value=\"' + esc(ch.group || '') + '\" data-f=\"group\" data-i=\"' + i + '\"></td>' +",
  "      '<td>' + scheduleSummary(ch.schedule) + '</td>' +",
  "      '<td class=\"actions\">' +",
  "        '<button class=\"secondary small\" data-sched=\"' + i + '\">🕐 Program</button>' +",
  "        '<button class=\"danger small\" data-del=\"' + i + '\">Sil</button>' +",
  "      '</td>';",
  "    tb.appendChild(tr);",
  "  });",
  "  tb.querySelectorAll('[data-en]').forEach(function(tg) {",
  "    tg.addEventListener('change', function(e) {",
  "      var i = +e.target.dataset.en;",
  "      channels[i].enabled = e.target.checked;",
  "      setDirty(true); render();",
  "    });",
  "  });",
  "  tb.querySelectorAll('input[data-f]').forEach(function(inp) {",
  "    inp.addEventListener('input', function(e) {",
  "      var i = +e.target.dataset.i, f = e.target.dataset.f;",
  "      channels[i][f] = e.target.value;",
  "      setDirty(true);",
  "    });",
  "    inp.addEventListener('blur', function(e) {",
  "      var i = +e.target.dataset.i, f = e.target.dataset.f;",
  "      var trimmed = String(e.target.value || '').trim();",
  "      if (trimmed !== e.target.value) { e.target.value = trimmed; channels[i][f] = trimmed; }",
  "    });",
  "  });",
  "  tb.querySelectorAll('[data-del]').forEach(function(b) {",
  "    b.addEventListener('click', function() {",
  "      var i = +b.dataset.del;",
  "      if (confirm('\"' + channels[i].name + '\" silinsin mi?')) {",
  "        channels.splice(i, 1); render(); setDirty(true);",
  "      }",
  "    });",
  "  });",
  "  tb.querySelectorAll('[data-sched]').forEach(function(b) {",
  "    b.addEventListener('click', function() { openScheduleModal(+b.dataset.sched); });",
  "  });",
  "}",
  "function openScheduleModal(idx) {",
  "  editingIdx = idx;",
  "  var schedule = JSON.parse(JSON.stringify(channels[idx].schedule || []));",
  "  schedule.forEach(function(s) { s.start = normalizeHM(s.start); s.end = normalizeHM(s.end); });",
  "  renderModal(schedule);",
  "}",
  "function renderModal(schedule) {",
  "  var root = el('modal-root');",
  "  if (!root) return;",
  "  var html = '<div class=\"modal-bg\" id=\"modal-bg\"><div class=\"modal\">' +",
  "    '<h2>🕐 Program — ' + esc(channels[editingIdx].name) + '</h2>' +",
  "    '<p style=\"font-size:12px;color:#9ca3af;margin:0 0 16px\">Saatler <b>Türkiye saatiyle (UTC+3)</b> girilir.</p>' +",
  "    '<div id=\"slot-list\">';",
  "  if (!schedule.length) html += '<div style=\"color:#6b7280;padding:20px;text-align:center;font-size:13px\">Program yok. \"Aralık Ekle\" ile başla.</div>';",
  "  schedule.forEach(function(s, i) {",
  "    html += '<div class=\"slot\"><div class=\"slot-head\"><strong>Aralık ' + (i+1) + '</strong><button class=\"danger small\" data-rmslot=\"' + i + '\">Kaldır</button></div><div class=\"days\">';",
  "    for (var d = 0; d < 7; d++) {",
  "      var active = s.days.indexOf(d) !== -1 ? ' active' : '';",
  "      html += '<button class=\"day-btn' + active + '\" data-day=\"' + d + '\" data-slot=\"' + i + '\">' + DAYS[d] + '</button>';",
  "    }",
  "    html += '</div><div class=\"times\"><label>Başlangıç</label><input type=\"time\" data-slot=\"' + i + '\" data-time=\"start\" value=\"' + esc(s.start) + '\"><label>Bitiş</label><input type=\"time\" data-slot=\"' + i + '\" data-time=\"end\" value=\"' + esc(s.end) + '\"></div></div>';",
  "  });",
  "  html += '</div><div style=\"margin-top:12px\"><button id=\"add-slot-btn\" class=\"secondary small\">+ Aralık Ekle</button></div>' +",
  "    '<div class=\"modal-actions\"><button id=\"cancel-modal\" class=\"secondary\">İptal</button><button id=\"save-modal\" class=\"success\">Kaydet</button></div></div></div>';",
  "  root.innerHTML = html;",
  "  root.querySelectorAll('[data-day]').forEach(function(btn) {",
  "    btn.addEventListener('click', function() {",
  "      var i = +btn.dataset.slot, d = +btn.dataset.day;",
  "      var arr = schedule[i].days;",
  "      var pos = arr.indexOf(d);",
  "      if (pos === -1) arr.push(d); else arr.splice(pos, 1);",
  "      arr.sort(); renderModal(schedule);",
  "    });",
  "  });",
  "  root.querySelectorAll('input[data-time]').forEach(function(inp) {",
  "    inp.addEventListener('change', function() {",
  "      var i = +inp.dataset.slot, f = inp.dataset.time;",
  "      var v = normalizeHM(inp.value);",
  "      inp.value = v; schedule[i][f] = v;",
  "    });",
  "  });",
  "  root.querySelectorAll('[data-rmslot]').forEach(function(btn) {",
  "    btn.addEventListener('click', function() { schedule.splice(+btn.dataset.rmslot, 1); renderModal(schedule); });",
  "  });",
  "  el('add-slot-btn').addEventListener('click', function() {",
  "    schedule.push({ days: [1,2,3,4,5], start: '19:00', end: '23:00' });",
  "    renderModal(schedule);",
  "  });",
  "  el('cancel-modal').addEventListener('click', closeModal);",
  "  el('save-modal').addEventListener('click', function() {",
  "    root.querySelectorAll('input[data-time]').forEach(function(inp) {",
  "      var i = +inp.dataset.slot, f = inp.dataset.time;",
  "      var v = normalizeHM(inp.value);",
  "      inp.value = v; schedule[i][f] = v;",
  "    });",
  "    for (var i = 0; i < schedule.length; i++) {",
  "      var s = schedule[i];",
  "      if (!s.days.length) { msg('Aralık ' + (i+1) + ': gün seçin', 'error'); return; }",
  "      var st = parseHM(s.start), en = parseHM(s.end);",
  "      if (st === null || en === null) { msg('Aralık ' + (i+1) + ': saat geçersiz', 'error'); return; }",
  "      if (st === en) { msg('Aralık ' + (i+1) + ': başlangıç=bitiş olamaz', 'error'); return; }",
  "    }",
  "    channels[editingIdx].schedule = schedule;",
  "    setDirty(true); closeModal(); render();",
  "    msg('Program güncellendi. Kaydet butonuna bas.', 'info');",
  "  });",
  "  el('modal-bg').addEventListener('click', function(e) {",
  "    if (e.target.id === 'modal-bg') closeModal();",
  "  });",
  "}",
  "function closeModal() { el('modal-root').innerHTML = ''; editingIdx = -1; }",
  "function showLogin() { el('login-view').classList.remove('hidden'); el('admin-view').classList.add('hidden'); }",
  "function showAdmin() { el('login-view').classList.add('hidden'); el('admin-view').classList.remove('hidden'); }",
  "async function doLogin() {",
  "  dbg('doLogin başladı');",
  "  var pwInput = el('password-input');",
  "  if (!pwInput) { dbg('HATA: password-input yok'); return; }",
  "  var pw = pwInput.value;",
  "  if (!pw) { msg('Şifre girin', 'error'); return; }",
  "  dbg('POST /api/admin/login gönderiliyor');",
  "  var r;",
  "  try {",
  "    r = await fetch('/api/admin/login', {",
  "      method: 'POST',",
  "      headers: { 'Content-Type': 'application/json' },",
  "      credentials: 'same-origin',",
  "      body: JSON.stringify({ password: pw })",
  "    });",
  "  } catch (err) { msg('Ağ hatası: ' + err.message, 'error'); return; }",
  "  dbg('login status=' + r.status);",
  "  if (!r.ok) {",
  "    var j = await r.json().catch(function(){ return {}; });",
  "    msg(j.error || ('Giriş başarısız HTTP ' + r.status), 'error');",
  "    return;",
  "  }",
  "  pwInput.value = '';",
  "  dbg('GET /api/admin/channels');",
  "  var check;",
  "  try {",
  "    check = await fetch('/api/admin/channels', { credentials: 'same-origin', cache: 'no-store' });",
  "  } catch (err) { msg('Kanallar: ' + err.message, 'error'); return; }",
  "  dbg('channels status=' + check.status);",
  "  if (check.status === 401) {",
  "    msg('Cookie yazılamadı. Tarayıcı çerezleri engelliyor olabilir.', 'error', 15000);",
  "    return;",
  "  }",
  "  if (!check.ok) { msg('Kanallar HTTP ' + check.status, 'error'); return; }",
  "  var data = await check.json();",
  "  dbg('kanal sayısı=' + data.length);",
  "  channels = data.map(function(c) {",
  "    return { id: c.id, name: c.name, tvgId: c.tvgId || '', group: c.group || 'Genel', enabled: c.enabled !== false,",
  "      schedule: (Array.isArray(c.schedule) ? c.schedule : []).map(function(s) {",
  "        return { days: s.days || [], start: normalizeHM(s.start), end: normalizeHM(s.end) };",
  "      }) };",
  "  });",
  "  render(); setDirty(false); showAdmin();",
  "  dbg('showAdmin çağrıldı');",
  "  msg('Hoş geldiniz! ' + channels.length + ' kanal', 'success');",
  "}",
  "document.addEventListener('DOMContentLoaded', function() {",
  "  dbg('DOMContentLoaded');",
  "  var loginBtn = document.getElementById('login-btn');",
  "  dbg('login-btn: ' + (loginBtn ? 'VAR' : 'YOK'));",
  "  if (loginBtn) loginBtn.addEventListener('click', function(e) { e.preventDefault(); doLogin(); });",
  "  var pwInput = document.getElementById('password-input');",
  "  if (pwInput) pwInput.addEventListener('keydown', function(e) {",
  "    if (e.key === 'Enter') { e.preventDefault(); doLogin(); }",
  "  });",
  "  var logoutBtn = document.getElementById('logout-btn');",
  "  if (logoutBtn) logoutBtn.addEventListener('click', async function() {",
  "    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });",
  "    channels = []; showLogin();",
  "  });",
  "  var addBtn = document.getElementById('add-btn');",
  "  if (addBtn) addBtn.addEventListener('click', function() {",
  "    channels.push({ id: '', name: 'Yeni Kanal', tvgId: '', group: 'Genel', enabled: true, schedule: [] });",
  "    render(); setDirty(true);",
  "    setTimeout(function() {",
  "      var rows = document.querySelectorAll('#channels-body tr');",
  "      var last = rows[rows.length - 1];",
  "      if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' });",
  "        var idInput = last.querySelector('input[data-f=\"id\"]'); if (idInput) idInput.focus(); }",
  "    }, 50);",
  "  });",
  "  var refreshBtn = document.getElementById('refresh-view-btn');",
  "  if (refreshBtn) refreshBtn.addEventListener('click', async function() {",
  "    var r = await fetch('/api/admin/channels', { credentials: 'same-origin', cache: 'no-store' });",
  "    if (r.ok) {",
  "      var d = await r.json();",
  "      channels = d.map(function(c) { return { id: c.id, name: c.name, tvgId: c.tvgId || '', group: c.group || 'Genel', enabled: c.enabled !== false, schedule: (Array.isArray(c.schedule) ? c.schedule : []).map(function(s) { return { days: s.days || [], start: normalizeHM(s.start), end: normalizeHM(s.end) }; }) }; });",
  "      render(); msg('Yenilendi', 'info', 2000);",
  "    }",
  "  });",
  "  var saveBtn = document.getElementById('save-btn');",
  "  if (saveBtn) saveBtn.addEventListener('click', async function() {",
  "    channels = channels.map(function(c) {",
  "      return { id: String(c.id || '').trim(), name: String(c.name || '').trim(), tvgId: String(c.tvgId || '').trim(), group: String(c.group || '').trim(), enabled: c.enabled !== false,",
  "        schedule: (Array.isArray(c.schedule) ? c.schedule : []).map(function(s) { return { days: (s.days || []).slice().sort(function(a,b){return a-b;}), start: normalizeHM(s.start), end: normalizeHM(s.end) }; }) };",
  "    });",
  "    for (var i = 0; i < channels.length; i++) {",
  "      if (!channels[i].id) { msg('Satır ' + (i+1) + ': ID boş', 'error'); return; }",
  "      if (!isNumericId(channels[i].id)) { msg('Satır ' + (i+1) + ': ID sayı olmalı', 'error'); return; }",
  "      if (!channels[i].name) { msg('Satır ' + (i+1) + ': isim boş', 'error'); return; }",
  "    }",
  "    try {",
  "      var r = await fetch('/api/admin/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(channels) });",
  "      var bodyText = await r.text();",
  "      var j = {}; try { j = JSON.parse(bodyText); } catch(_) {}",
  "      if (r.ok) { setDirty(false); msg('✅ Kaydedildi! (' + channels.length + ' kanal)', 'success', 6000); }",
  "      else { msg('HTTP ' + r.status + ' — ' + (j.error || 'hata'), 'error', 15000); }",
  "    } catch (e) { msg('Ağ hatası: ' + e.message, 'error', 15000); }",
  "  });",
  "  setInterval(function() {",
  "    var c = el('tr-clock');",
  "    if (c) c.textContent = '🇹🇷 TR saati: ' + trClockString() + ' (UTC+3)';",
  "  }, 1000);",
  "  fetch('/api/admin/channels', { credentials: 'same-origin', cache: 'no-store' }).then(function(r) {",
  "    if (r.ok) return r.json().then(function(d) {",
  "      channels = d.map(function(c) { return { id: c.id, name: c.name, tvgId: c.tvgId || '', group: c.group || 'Genel', enabled: c.enabled !== false, schedule: (Array.isArray(c.schedule) ? c.schedule : []).map(function(s) { return { days: s.days || [], start: normalizeHM(s.start), end: normalizeHM(s.end) }; }) }; });",
  "      render(); showAdmin();",
  "    });",
  "  }).catch(function() {});",
  "});"
].join("\n");

const ADMIN_HTML = "<!DOCTYPE html>\n" +
  "<html lang=\"tr\">\n" +
  "<head>\n" +
  "<meta charset=\"UTF-8\">\n" +
  "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n" +
  "<title>Matchora Proxy — Yönetim</title>\n" +
  "<style>" + ADMIN_CSS + "</style>\n" +
  "</head>\n" +
  "<body>\n" +
  "<div id=\"js-error-banner\"></div>\n" +
  "<div id=\"debug-log\"></div>\n" +
  "<div id=\"login-view\">\n" +
  "  <h1>🔒 Yönetim Girişi</h1>\n" +
  "  <input type=\"password\" id=\"password-input\" placeholder=\"Şifre\" autofocus style=\"margin-bottom:16px\">\n" +
  "  <button type=\"button\" id=\"login-btn\" style=\"width:100%\">Giriş Yap</button>\n" +
  "</div>\n" +
  "<div id=\"admin-view\" class=\"hidden\">\n" +
  "  <header>\n" +
  "    <h1>📺 Matchora Proxy <span id=\"channel-count\"></span></h1>\n" +
  "    <div style=\"display:flex;gap:8px\">\n" +
  "      <button id=\"refresh-view-btn\" class=\"secondary small\">🔄 Yenile</button>\n" +
  "      <button id=\"logout-btn\" class=\"secondary small\">Çıkış</button>\n" +
  "    </div>\n" +
  "  </header>\n" +
  "  <div class=\"toolbar\">\n" +
  "    <button id=\"add-btn\">+ Yeni Kanal</button>\n" +
  "    <button id=\"save-btn\" disabled>💾 Kaydet</button>\n" +
  "    <span id=\"dirty-indicator\"></span>\n" +
  "    <span style=\"margin-left:auto;font-size:12px;color:#6b7280\" id=\"tr-clock\">Saat dilimi: TR (UTC+3)</span>\n" +
  "  </div>\n" +
  "  <table>\n" +
  "    <thead>\n" +
  "      <tr>\n" +
  "        <th style=\"width:40px\">Durum</th>\n" +
  "        <th style=\"width:50px\">Aç/Kapa</th>\n" +
  "        <th style=\"width:100px\">ID</th>\n" +
  "        <th>İsim</th>\n" +
  "        <th style=\"width:130px\">TVG ID</th>\n" +
  "        <th style=\"width:100px\">Grup</th>\n" +
  "        <th style=\"width:150px\">Program</th>\n" +
  "        <th style=\"width:140px\">İşlem</th>\n" +
  "      </tr>\n" +
  "    </thead>\n" +
  "    <tbody id=\"channels-body\"></tbody>\n" +
  "  </table>\n" +
  "</div>\n" +
  "<div id=\"modal-root\"></div>\n" +
  "<script>" + ADMIN_JS + "</scr" + "ipt>\n" +
  "</body>\n" +
  "</html>";

// ---------- HTTP Handler ----------
async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const baseOrigin = url.origin;

  if (path === "/api/admin/debug") {
    const pw = Deno.env.get("ADMIN_PASSWORD");
    const chs = await loadChannels();
    const cookie = getCookie(request, SESSION_COOKIE);
    return new Response(JSON.stringify({
      ADMIN_PASSWORD_set: !!pw,
      storage: "Deno KV",
      channels_count: chs.length,
      timezone: "TR (UTC+3)",
      nowTR: nowInTR(),
      has_session_cookie: !!cookie,
      cookie_len: cookie ? cookie.length : 0,
      origin: baseOrigin,
      admin_html_len: ADMIN_HTML.length,
      admin_js_len: ADMIN_JS.length,
    }, null, 2), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  if (path === "/admin" || path === "/admin/") {
    return new Response(ADMIN_HTML, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  }

  if (path === "/api/admin/login" && request.method === "POST") {
    const pw = Deno.env.get("ADMIN_PASSWORD");
    if (!pw) {
      return new Response(JSON.stringify({ error: "ADMIN_PASSWORD ayarlanmamış" }), {
        status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    let body: any;
    try { body = await request.json(); } catch { body = {}; }
    if (!timingSafeEqual(body.password || "", pw)) {
      return new Response(JSON.stringify({ error: "Yanlış şifre" }), {
        status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    const session = await createSession(pw);
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Set-Cookie": SESSION_COOKIE + "=" + session + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge,
      },
    });
  }

  if (path === "/api/admin/logout") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": SESSION_COOKIE + "=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      },
    });
  }

  if (path === "/api/admin/channels") {
    const ok = await requireAuth(request);
    if (!ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (request.method === "GET") {
      const channels = await loadChannels();
      const now = nowInTR();
      const enriched = channels.map(c => ({ ...c, liveNow: isChannelLiveNow(c, now) }));
      return new Response(JSON.stringify(enriched), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (request.method === "POST") {
      let channels: any[];
      try { channels = await request.json(); } catch (e: any) {
        return new Response(JSON.stringify({ error: "JSON parse: " + e.message }), {
          status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      if (!Array.isArray(channels)) {
        return new Response(JSON.stringify({ error: "Dizi bekleniyor" }), {
          status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      const idMap = new Map<string, number[]>();
      for (let i = 0; i < channels.length; i++) {
        const c = channels[i];
        const id = String((c && c.id) || "").trim();
        if (!isNumericId(id)) {
          return new Response(JSON.stringify({ error: "Satır " + (i + 1) + ": ID sayısal olmalı" }), {
            status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }
        const name = String((c && c.name) || "").trim();
        if (!name) {
          return new Response(JSON.stringify({ error: "Satır " + (i + 1) + ": isim zorunlu" }), {
            status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }
        if (!idMap.has(id)) idMap.set(id, []);
        idMap.get(id)!.push(i + 1);
      }
      const dupes = [...idMap.entries()].filter(([_, rows]) => rows.length > 1);
      if (dupes.length) {
        return new Response(JSON.stringify({ error: "Tekrarlanan ID: " + dupes.map(([id, r]) => id + ' (satır ' + r.join(',') + ')').join(' | ') }), {
          status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      }
      const cleaned: Channel[] = [];
      for (let i = 0; i < channels.length; i++) {
        const c = channels[i];
        const rawSchedule = Array.isArray(c.schedule) ? c.schedule : [];
        const cleanSchedule: { days: number[]; start: string; end: string }[] = [];
        for (const s of rawSchedule) {
          if (!Array.isArray(s.days) || s.days.length === 0) {
            return new Response(JSON.stringify({ error: "Satır " + (i + 1) + ": gün seçin" }), {
              status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            });
          }
          const st = normalizeHM(s.start);
          const en = normalizeHM(s.end);
          if (parseHM(st) === null || parseHM(en) === null) {
            return new Response(JSON.stringify({ error: "Satır " + (i + 1) + ": saat geçersiz (" + JSON.stringify(s.start) + " / " + JSON.stringify(s.end) + ")" }), {
              status: 400, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            });
          }
          cleanSchedule.push({
            days: [...new Set(s.days)].sort((a: number, b: number) => a - b),
            start: st, end: en,
          });
        }
        cleaned.push({
          id: String(c.id || "").trim(),
          name: String(c.name || "").trim(),
          tvgId: c.tvgId ? String(c.tvgId).trim() : "",
          group: c.group ? String(c.group).trim() : "Genel",
          enabled: c.enabled !== false,
          schedule: cleanSchedule,
        });
      }
      await persistChannels(cleaned);
      for (const id of idMap.keys()) purgeChannelCache(id);
      return new Response(JSON.stringify({ ok: true, count: cleaned.length, persistent: true }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    return new Response("Method not allowed", { status: 405 });
  }

  const channels = await loadChannels();
  const now = nowInTR();

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
    const ch = channels.find(c => c.id === channelId);
    if (!ch) {
      return new Response(JSON.stringify({ error: "Kanal bulunamadı" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }
    if (!isChannelLiveNow(ch, now)) {
      purgeChannelCache(channelId);
      return new Response(JSON.stringify({
        error: "Kanal şu an kapalı",
        reason: ch.enabled === false ? "manual-disabled" : "outside-schedule",
        id: channelId, name: ch.name,
        nowTR: { day: now.day, minutes: now.minutes },
      }), {
        status: 410, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    try {
      let t;
      try { t = await getToken(channelId); }
      catch (e) { t = await getToken(channelId, true); }
      return await proxyM3U8(t.streamUrl, channelId, baseOrigin);
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502, headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (path === "/seg") {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    const c = url.searchParams.get("c");
    const u = url.searchParams.get("u");
    if (!c || !u) return new Response("Missing params", { status: 400 });
    const ch = channels.find(x => x.id === c);
    if (!ch || !isChannelLiveNow(ch, now)) {
      purgeChannelCache(c);
      return new Response("Kanal kapalı", { status: 410 });
    }
    try { return await handleSegment(c, u); }
    catch (e: any) { return new Response("Segment error: " + e.message, { status: 502 }); }
  }

  if (path === "/status") {
    const result: Record<string, any> = {};
    for (const ch of channels) {
      const cache = tokenCache[ch.id];
      result[ch.id] = {
        name: ch.name, enabled: ch.enabled !== false,
        scheduleCount: (ch.schedule || []).length,
        liveNow: isChannelLiveNow(ch, now),
        hasToken: !!(cache && cache.streamUrl),
        expiresInMin: cache ? (Math.max(0, cache.expiresAt - Date.now()) / 60000).toFixed(1) : "0",
      };
    }
    return new Response(JSON.stringify({ nowTR: now, channels: result }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path === "/refresh") {
    const c = url.searchParams.get("c") || (channels[0] && channels[0].id);
    if (!c) return new Response("Kanal yok", { status: 400 });
    try {
      await getToken(c, true);
      delete manifestCache[c + ":m"]; delete manifestCache[c + ":p"];
      return new Response(JSON.stringify({ ok: true, channelId: c }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (path === "/debug-tr") {
    try {
      const tr = await fetchTurkishChannels();
      return new Response(JSON.stringify({ count: tr.length, channels: tr }, null, 2), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("ohooooho", { status: 404, headers: { "Content-Type": "text/plain" } });
}

Deno.serve(handler);
