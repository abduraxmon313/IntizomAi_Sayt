"use strict";
/**
 * IntizomAI sayti uchun kichik statik server (tashqi kutubxonasiz).
 *
 * - public/ dagi fayllar ishga tushganda xotiraga o'qiladi va gzip/brotli
 *   bilan oldindan siqiladi (sayt kichik, shuning uchun bu eng tezkor yo'l).
 * - HTML'dagi {{...}} joylari muhit o'zgaruvchilaridan to'ldiriladi
 *   (APP_STORE_URL, PLAY_STORE_URL). Havola berilmasa tugma "Tez kunda" bo'ladi.
 * - www → asosiy domen va http → https ga 301 yo'naltiradi.
 * - *.up.railway.app manzili Google'da takror sahifa bo'lmasligi uchun noindex.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT) || 3000;
const CANONICAL_HOST = (process.env.CANONICAL_HOST || "intizom.app").toLowerCase();
const PUBLIC_DIR = path.join(__dirname, "public");
const CHANNEL_URL = "https://t.me/Intizom_AI";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
const COMPRESSIBLE = new Set([".html", ".css", ".js", ".json", ".webmanifest", ".xml", ".txt", ".svg", ".ico"]);

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function storeUrl(name) {
  const v = (process.env[name] || "").trim();
  if (!v) return "";
  if (!/^https:\/\/[^\s"'<>]+$/i.test(v)) {
    console.warn(`[sayt] ${name} e'tiborsiz qoldirildi: https:// bilan boshlanuvchi to'g'ri havola emas`);
    return "";
  }
  return v;
}

function storeVars(prefix, storeName, url) {
  if (url) {
    return {
      [`${prefix}_HREF`]: escapeAttr(url),
      [`${prefix}_CLASS`]: "",
      [`${prefix}_SMALL`]: "Yuklab oling",
      [`${prefix}_LABEL`]: `IntizomAI ilovasini ${storeName}'dan yuklab olish`,
    };
  }
  return {
    [`${prefix}_HREF`]: CHANNEL_URL,
    [`${prefix}_CLASS`]: "is-soon",
    [`${prefix}_SMALL`]: "Tez kunda",
    [`${prefix}_LABEL`]: `${storeName} — tez kunda. Yangiliklar uchun Telegram kanalimiz`,
  };
}

const TEMPLATE_VARS = {
  ...storeVars("APPSTORE", "App Store", storeUrl("APP_STORE_URL")),
  ...storeVars("PLAY", "Google Play", storeUrl("PLAY_STORE_URL")),
};

function render(html) {
  return html.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => (key in TEMPLATE_VARS ? TEMPLATE_VARS[key] : m));
}

/** public/ ni o'qib, xotirada { urlPath: entry } xaritasini quradi. */
function loadFiles() {
  const files = new Map();
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(full); continue; }
      const ext = path.extname(ent.name).toLowerCase();
      if (!TYPES[ext]) continue;
      let body = fs.readFileSync(full);
      if (ext === ".html") body = Buffer.from(render(body.toString("utf8")), "utf8");
      const rel = "/" + path.relative(PUBLIC_DIR, full).split(path.sep).join("/");
      const entry = {
        body,
        type: TYPES[ext],
        etag: `"${crypto.createHash("sha1").update(body).digest("base64url").slice(0, 20)}"`,
        cache: cacheControl(rel, ext),
      };
      if (COMPRESSIBLE.has(ext) && body.length > 512) {
        entry.br = zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
        entry.gzip = zlib.gzipSync(body, { level: 9 });
      }
      files.set(rel, entry);
    }
  };
  walk(PUBLIC_DIR);
  return files;
}

function cacheControl(rel, ext) {
  if (ext === ".html" || ext === ".xml" || ext === ".txt" || ext === ".webmanifest") return "public, max-age=0, must-revalidate";
  if (rel.startsWith("/fonts/")) return "public, max-age=31536000, immutable";
  // CSS/JS ?v= bilan versiyalanadi; rasmlar uchun bir hafta yetarli.
  return "public, max-age=604800, stale-while-revalidate=86400";
}

const FILES = loadFiles();

// Toza manzillar: /privacy → privacy.html
const ROUTES = new Map([["/", "/index.html"], ["/privacy", "/privacy.html"]]);
const REDIRECTS = new Map([["/index.html", "/"], ["/privacy.html", "/privacy"], ["/maxfiylik", "/privacy"]]);

function send(req, res, status, entry, extra = {}) {
  const headers = { ...SECURITY_HEADERS, "Content-Type": entry.type, "Cache-Control": entry.cache, ETag: entry.etag, Vary: "Accept-Encoding", ...extra };
  if (status === 200 && req.headers["if-none-match"] === entry.etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  let body = entry.body;
  const ae = String(req.headers["accept-encoding"] || "");
  if (entry.br && /\bbr\b/.test(ae)) { body = entry.br; headers["Content-Encoding"] = "br"; }
  else if (entry.gzip && /\bgzip\b/.test(ae)) { body = entry.gzip; headers["Content-Encoding"] = "gzip"; }
  headers["Content-Length"] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}

function redirect(res, location) {
  res.writeHead(301, { ...SECURITY_HEADERS, Location: location, "Cache-Control": "public, max-age=3600" });
  res.end();
}

const server = http.createServer((req, res) => {
  const host = String(req.headers.host || "").toLowerCase().replace(/:\d+$/, "");
  let url;
  try {
    url = new URL(req.url || "/", "http://localhost");
  } catch {
    res.writeHead(400).end();
    return;
  }
  const pathname = url.pathname;

  if (pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" });
    return res.end("ok");
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end();
  }

  const isRailwayHost = host.endsWith(".up.railway.app");
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";
  // www.intizom.app → intizom.app
  if (host === `www.${CANONICAL_HOST}`) return redirect(res, `https://${CANONICAL_HOST}${pathname}${url.search}`);
  // Railway TLS'ni o'zi tugatadi va asl protokolni shu sarlavhada beradi.
  if (!isLocal && req.headers["x-forwarded-proto"] === "http") return redirect(res, `https://${host}${pathname}${url.search}`);

  if (REDIRECTS.has(pathname)) return redirect(res, REDIRECTS.get(pathname) + url.search);

  const extra = isRailwayHost ? { "X-Robots-Tag": "noindex" } : {};
  // HTML faqat toza manzil orqali beriladi; boshqa fayllar o'z yo'li bilan.
  const routed = ROUTES.get(pathname);
  const entry = routed ? FILES.get(routed) : pathname.endsWith(".html") ? undefined : FILES.get(pathname);
  if (entry) return send(req, res, 200, entry, extra);
  // Oxiridagi "/" bilan kelgan toza manzil: /privacy/ → /privacy
  if (pathname !== "/" && pathname.endsWith("/") && ROUTES.has(pathname.replace(/\/+$/, ""))) {
    return redirect(res, pathname.replace(/\/+$/, "") + url.search);
  }
  return send(req, res, 404, FILES.get("/404.html"), { ...extra, "Cache-Control": "no-store" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[sayt] ${FILES.size} ta fayl yuklandi, port ${PORT}`);
  console.log(`[sayt] App Store: ${TEMPLATE_VARS.APPSTORE_CLASS ? "tez kunda" : "havola bor"}, Google Play: ${TEMPLATE_VARS.PLAY_CLASS ? "tez kunda" : "havola bor"}`);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
