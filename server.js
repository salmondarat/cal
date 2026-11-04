// server.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import express from "express";
import "dotenv/config";
var PORT = Number(process.env.OAUTH_SERVER_PORT || 8787);
var APP_BASE = process.env.APP_URL || "http://localhost:3000";
var GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v26.0";
var META_APP_ID = process.env.META_APP_ID || "";
var META_APP_SECRET = process.env.META_APP_SECRET || "";
var TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || "";
var TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || "";
var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
var THREADS_APP_ID = process.env.THREADS_APP_ID || META_APP_ID;
var THREADS_APP_SECRET = process.env.THREADS_APP_SECRET || META_APP_SECRET;
var IG_APP_ID = process.env.IG_APP_ID || THREADS_APP_ID;
var IG_APP_SECRET = process.env.IG_APP_SECRET || THREADS_APP_SECRET;
var STORE_DIR = path.resolve(".secrets");
var STORE_FILE = path.join(STORE_DIR, "connections.json");
function loadStore() {
  let store = {};
  try {
    store = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  } catch {
  }
  if (store.instagram) {
    const legacy = store.instagram;
    const key = legacy.accountIds[0];
    store.instagramAccounts = { ...store.instagramAccounts || {}, [key]: legacy };
    store.activeInstagramId = store.activeInstagramId || key;
  }
  return store;
}
function saveStore(store) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), { mode: 384 });
}
var pendingStates = /* @__PURE__ */ new Map();
var STATE_FILE = path.join(STORE_DIR, "oauth-states.json");
function persistStates() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(pendingStates)));
}
function rememberState(state, entry) {
  pendingStates.set(state, entry);
  persistStates();
}
function consumeState(state) {
  const pending = state ? pendingStates.get(state) : void 0;
  if (pending) {
    pendingStates.delete(state);
    persistStates();
  }
  return pending;
}
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(STATE_FILE, "utf8")))) pendingStates.set(k, v);
} catch {
}
function maskToken(token) {
  if (token.length <= 12) return `${token.slice(0, 3)}...`;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}
var app = express();
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: false }));
function logDetail(scope, detail) {
  const text = detail instanceof Error ? detail.message : typeof detail === "string" ? detail : "unknown error";
  console.warn(`[relate-oauth] ${scope}: ${text}`);
}
function connectionFailure(platformName) {
  return `${platformName} could not finish signing in. Please try again. If it keeps failing, disconnect the account and reconnect.`;
}
function providerFailure(provider, detail) {
  const text = (detail || "").toLowerCase();
  if (/access_denied|user (denied|cancel)|cancelled|canceled|press cancel/.test(text)) {
    return "Sign-in was cancelled. No changes were made.";
  }
  if (/invalid|unauthorized|not found|disabled|misconfigur/.test(text)) {
    return `${provider} rejected this app's sign-in settings. Check the app configuration and try again.`;
  }
  if (/redirect|callback|uri/.test(text)) {
    return `${provider} could not return to this app. Check that the callback address in the app settings matches this app.`;
  }
  if (/permission|scope|consent/.test(text)) {
    return "Some required permissions were not approved. Approve all requested access and try again.";
  }
  if (/expired|session|timeout/.test(text)) {
    return "The sign-in session expired. Please start again.";
  }
  return connectionFailure(provider);
}
function missingConfig(res, keys) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    logDetail("missing configuration", missing.join(", "));
    res.status(400).json({
      error: "This platform is not fully configured yet. Add its app credentials to the backend, then try again."
    });
    return true;
  }
  return false;
}
function callbackHtml(platformName, ok, detail) {
  const plain = detail.replace(/<[^>]+>/g, "");
  const safe = plain.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:40px">
<h2>${ok ? `${platformName} connected` : `${platformName} connection failed`}</h2><p>${safe}</p>
<script>
if (window.opener) window.opener.postMessage({ type: 'relate-oauth', platform: '${platformName}', ok: ${ok}, message: ${JSON.stringify(plain)} }, '*');
setTimeout(() => window.close(), 1500);
</script></body></html>`;
}
function toPublicConnection(conn) {
  return {
    connected: true,
    maskedToken: maskToken(conn.accessToken),
    accountIds: conn.accountIds,
    accountNames: conn.accountNames,
    scopes: conn.scopes,
    connectedAt: conn.connectedAt,
    expiresAt: conn.expiresAt
  };
}
function publicConnections() {
  const store = loadStore();
  const out = {};
  for (const [platform, conn] of Object.entries(store)) {
    if (platform === "instagramAccounts" || platform === "activeInstagramId" || !conn) continue;
    out[platform] = toPublicConnection(conn);
  }
  const igAccounts = store.instagramAccounts || {};
  const activeIgId = store.activeInstagramId;
  if (activeIgId && igAccounts[activeIgId]) {
    out.instagram = toPublicConnection(igAccounts[activeIgId]);
  }
  out.instagramAccounts = Object.entries(igAccounts).map(([id, conn]) => ({
    id,
    accountName: conn.accountNames[0],
    connectedAt: conn.connectedAt,
    expiresAt: conn.expiresAt,
    active: id === activeIgId
  }));
  return out;
}
var META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "business_management",
  "read_insights"
];
app.get("/auth/meta/start", (_req, res) => {
  if (missingConfig(res, ["META_APP_ID", "META_APP_SECRET"])) return;
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${APP_BASE}/auth/meta/callback`;
  rememberState(state, { platform: "meta", redirectUri });
  const url = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?client_id=${encodeURIComponent(META_APP_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(META_SCOPES.join(","))}&state=${state}`;
  res.redirect(url);
});
async function graphGet(url, token) {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}access_token=${encodeURIComponent(token)}`);
  const json = await res.json();
  if (json.error) {
    logDetail("Meta request failed", json.error.message);
    throw new Error("Meta could not complete the request. Please try again.");
  }
  return json;
}
app.get("/auth/meta/callback", async (req, res) => {
  const { code, state, error_description } = req.query;
  if (error_description) {
    logDetail("Meta sign-in declined", error_description);
    return res.send(callbackHtml("Meta", false, providerFailure("Meta", error_description)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== "meta") {
    return res.send(callbackHtml("Meta", false, "The sign-in link expired. Please start again."));
  }
  try {
    const exchange = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: pending.redirectUri,
        code
      })
    });
    const shortLived = await exchange.json();
    if (shortLived.error) {
      logDetail("Meta token exchange failed", shortLived.error.message);
      throw new Error(connectionFailure("Meta"));
    }
    const longRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(META_APP_ID)}&client_secret=${encodeURIComponent(META_APP_SECRET)}&fb_exchange_token=${encodeURIComponent(shortLived.access_token)}`
    );
    const longLived = await longRes.json();
    if (longLived.error) {
      logDetail("Meta long-lived token exchange failed", longLived.error.message);
      throw new Error(connectionFailure("Meta"));
    }
    const userToken = longLived.access_token;
    const me = await graphGet(`https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name`, userToken);
    const accounts = await graphGet(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}`,
      userToken
    );
    const pages = (accounts.data || []).map((p) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      instagramId: p.instagram_business_account?.id,
      instagramUsername: p.instagram_business_account?.username
    }));
    for (const page of pages) {
      if (page.instagramId) continue;
      try {
        const ig = await graphGet(
          `https://graph.facebook.com/${GRAPH_VERSION}/${page.id}/connected_instagram_account?fields=id,username`,
          page.accessToken
        );
        if (ig.id) {
          page.instagramId = ig.id;
          page.instagramUsername = ig.username;
        }
      } catch {
      }
    }
    let grantedScopes = META_SCOPES;
    try {
      const perms = await graphGet(`https://graph.facebook.com/${GRAPH_VERSION}/me/permissions`, userToken);
      const granted = (perms.data || []).filter((p) => p.permission_status === "granted").map((p) => p.permission);
      if (granted.length) grantedScopes = granted;
    } catch {
    }
    const store = loadStore();
    store.meta = {
      accessToken: userToken,
      tokenType: "meta_long_lived_user",
      expiresAt: Date.now() + (longLived.expires_in ? longLived.expires_in * 1e3 : 59 * 86400 * 1e3),
      accountIds: [me.id, ...pages.map((p) => p.id)],
      accountNames: [me.name, ...pages.map((p) => `${p.name}${p.instagramUsername ? ` (@${p.instagramUsername})` : ""}`)],
      scopes: grantedScopes,
      connectedAt: (/* @__PURE__ */ new Date()).toISOString(),
      metaPages: pages
    };
    saveStore(store);
    res.send(callbackHtml("Meta", true, `Connected as <b>${me.name}</b> with ${pages.length} page(s).`));
  } catch (err) {
    logDetail("Meta sign-in failed", err);
    res.send(callbackHtml("Meta", false, connectionFailure("Meta")));
  }
});
var TIKTOK_SCOPES = ["user.info.basic", "video.list", "video.publish", "video.upload"];
app.get("/auth/tiktok/start", (_req, res) => {
  if (missingConfig(res, ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"])) return;
  const state = crypto.randomBytes(16).toString("hex");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = `${APP_BASE}/auth/tiktok/callback`;
  rememberState(state, { platform: "tiktok", codeVerifier: verifier, redirectUri });
  const url = `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(TIKTOK_CLIENT_KEY)}&response_type=code&scope=${encodeURIComponent(TIKTOK_SCOPES.join(","))}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`;
  res.redirect(url);
});
app.get("/auth/tiktok/callback", async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    logDetail("TikTok sign-in declined", error);
    return res.send(callbackHtml("TikTok", false, providerFailure("TikTok", error)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== "tiktok") {
    return res.send(callbackHtml("TikTok", false, "The sign-in link expired. Please start again."));
  }
  try {
    const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: pending.redirectUri,
        code_verifier: pending.codeVerifier || ""
      })
    });
    const token = await tokenRes.json();
    if (token.error || !token.access_token) {
      logDetail("TikTok token exchange failed", token.error_description || token.error);
      throw new Error(connectionFailure("TikTok"));
    }
    const infoRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name",
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );
    const info = await infoRes.json();
    const user = info.data?.user;
    if (!user) {
      logDetail("TikTok profile request failed", info.error?.message);
      throw new Error(connectionFailure("TikTok"));
    }
    const store = loadStore();
    store.tiktok = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenType: "tiktok_access_token",
      expiresAt: Date.now() + (token.expires_in ? token.expires_in * 1e3 : 86400 * 1e3),
      accountIds: [user.open_id],
      accountNames: [user.display_name],
      scopes: token.scope ? String(token.scope).split(",") : TIKTOK_SCOPES,
      connectedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveStore(store);
    res.send(callbackHtml("TikTok", true, `Connected as <b>${user.display_name}</b>.`));
  } catch (err) {
    logDetail("TikTok sign-in failed", err);
    res.send(callbackHtml("TikTok", false, connectionFailure("TikTok")));
  }
});
var GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload"
];
app.get("/auth/google/start", (_req, res) => {
  if (missingConfig(res, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])) return;
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${APP_BASE}/auth/google/callback`;
  rememberState(state, { platform: "google", redirectUri });
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&access_type=offline&prompt=consent&scope=${encodeURIComponent(GOOGLE_SCOPES.join(" "))}&state=${state}`;
  res.redirect(url);
});
app.get("/auth/google/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    logDetail("YouTube sign-in declined", error_description || error);
    return res.send(callbackHtml("YouTube", false, providerFailure("Google", error_description || error)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== "google") {
    return res.send(callbackHtml("YouTube", false, "The sign-in link expired. Please start again."));
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: pending.redirectUri
      })
    });
    const token = await tokenRes.json();
    if (token.error) {
      logDetail("YouTube token exchange failed", `${token.error}: ${token.error_description || ""}`);
      throw new Error(connectionFailure("YouTube"));
    }
    const channelsRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true",
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );
    const channels = await channelsRes.json();
    if (channels.error) {
      logDetail("YouTube channel request failed", channels.error.message);
      throw new Error(connectionFailure("YouTube"));
    }
    const items = channels.items || [];
    if (!items.length) {
      return res.send(callbackHtml("YouTube", false, "Account authorized, but it owns no YouTube channel. Create a channel first, then reconnect."));
    }
    const store = loadStore();
    store.youtube = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenType: "google_oauth",
      expiresAt: Date.now() + (token.expires_in ? token.expires_in * 1e3 : 3600 * 1e3),
      accountIds: items.map((c) => c.id),
      accountNames: items.map((c) => c.snippet.title),
      scopes: token.scope ? String(token.scope).split(" ") : GOOGLE_SCOPES,
      connectedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveStore(store);
    res.send(callbackHtml("YouTube", true, `Connected channel <b>${items[0].snippet.title}</b>.`));
  } catch (err) {
    logDetail("YouTube sign-in failed", err);
    res.send(callbackHtml("YouTube", false, connectionFailure("YouTube")));
  }
});
var THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_delete", "threads_manage_replies"];
function threadsRedirectUri() {
  return APP_BASE.startsWith("http://") ? `https://redirectmeto.com/${APP_BASE}/auth/threads/callback` : `${APP_BASE}/auth/threads/callback`;
}
app.get("/auth/threads/start", (_req, res) => {
  if (!THREADS_APP_ID || !THREADS_APP_SECRET) {
    logDetail("missing configuration", "Threads app credentials");
    res.status(400).json({
      error: "Threads is not fully configured yet. Add its app credentials to the backend, then try again."
    });
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  rememberState(state, { platform: "threads", redirectUri: threadsRedirectUri() });
  const url = `https://www.threads.net/oauth/authorize?client_id=${encodeURIComponent(THREADS_APP_ID)}&redirect_uri=${encodeURIComponent(threadsRedirectUri())}&scope=${encodeURIComponent(THREADS_SCOPES.join(","))}&response_type=code&state=${state}`;
  res.redirect(url);
});
app.get("/auth/threads/callback", async (req, res) => {
  const { code, state, error_description } = req.query;
  if (error_description) {
    logDetail("Threads sign-in declined", error_description);
    return res.send(callbackHtml("Threads", false, providerFailure("Threads", error_description)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== "threads") {
    return res.send(callbackHtml("Threads", false, "The sign-in link expired. Please start again."));
  }
  try {
    const exchange = await fetch("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: THREADS_APP_ID,
        client_secret: THREADS_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: pending.redirectUri,
        code
      })
    });
    const short = await exchange.json();
    if (short.error) {
      logDetail("Threads token exchange failed", short.error.message);
      throw new Error(connectionFailure("Threads"));
    }
    const longRes = await fetch(
      `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(THREADS_APP_SECRET)}&access_token=${encodeURIComponent(short.access_token)}`
    );
    const long = await longRes.json();
    if (long.error) {
      logDetail("Threads long-lived token exchange failed", long.error.message);
      throw new Error(connectionFailure("Threads"));
    }
    const infoRes = await fetch(
      "https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url",
      { headers: { Authorization: `Bearer ${long.access_token}` } }
    );
    const info = await infoRes.json();
    if (info.error) {
      logDetail("Threads profile request failed", info.error.message);
      throw new Error(connectionFailure("Threads"));
    }
    const store = loadStore();
    store.threads = {
      accessToken: long.access_token,
      tokenType: "threads_long_lived_user",
      expiresAt: Date.now() + (long.expires_in ? long.expires_in * 1e3 : 58 * 86400 * 1e3),
      accountIds: [info.id],
      accountNames: [`@${info.username}`],
      scopes: THREADS_SCOPES,
      connectedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    saveStore(store);
    res.send(callbackHtml("Threads", true, `Connected as <b>@${info.username}</b>.`));
  } catch (err) {
    logDetail("Threads sign-in failed", err);
    res.send(callbackHtml("Threads", false, connectionFailure("Threads")));
  }
});
var IG_SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];
app.get("/auth/instagram/start", (_req, res) => {
  if (!IG_APP_ID || !IG_APP_SECRET) {
    logDetail("missing configuration", "Instagram app credentials");
    res.status(400).json({
      error: "Instagram is not fully configured yet. Add its app credentials to the backend, then try again."
    });
    return;
  }
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${APP_BASE}/auth/instagram/callback`;
  rememberState(state, { platform: "instagram", redirectUri });
  const url = `https://www.instagram.com/oauth/authorize?client_id=${encodeURIComponent(IG_APP_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(IG_SCOPES.join(","))}&force_reauth=true&state=${state}`;
  res.redirect(url);
});
app.get("/auth/instagram/callback", async (req, res) => {
  const { code, state, error_message, error_type } = req.query;
  if (error_message || error_type) {
    logDetail("Instagram sign-in declined", error_message || error_type);
    return res.send(callbackHtml("Instagram", false, providerFailure("Instagram", error_message || error_type)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== "instagram") {
    return res.send(callbackHtml("Instagram", false, "The sign-in link expired. Please start again."));
  }
  try {
    const exchange = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: IG_APP_ID,
        client_secret: IG_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: pending.redirectUri,
        code
      })
    });
    const short = await exchange.json();
    if (short.error_message) {
      logDetail("Instagram token exchange failed", `${short.error_type || "instagram"}: ${short.error_message}`);
      throw new Error(connectionFailure("Instagram"));
    }
    const longRes = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(IG_APP_SECRET)}&access_token=${encodeURIComponent(short.access_token)}`
    );
    const long = await longRes.json();
    if (long.error_message) {
      logDetail("Instagram long-lived token exchange failed", long.error_message);
      throw new Error(connectionFailure("Instagram"));
    }
    const meRes = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/me?fields=user_id,username`,
      { headers: { Authorization: `Bearer ${long.access_token}` } }
    );
    const me = await meRes.json();
    if (me.error) {
      logDetail("Instagram profile request failed", me.error.message);
      throw new Error(connectionFailure("Instagram"));
    }
    const store = loadStore();
    const igAccount = {
      accessToken: long.access_token,
      tokenType: "ig_long_lived_user",
      expiresAt: Date.now() + (long.expires_in ? long.expires_in * 1e3 : 58 * 86400 * 1e3),
      accountIds: [me.user_id || me.id],
      accountNames: [`@${me.username}`],
      scopes: IG_SCOPES,
      connectedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const igId = igAccount.accountIds[0];
    store.instagramAccounts = { ...store.instagramAccounts || {}, [igId]: igAccount };
    store.activeInstagramId = igId;
    store.instagram = igAccount;
    saveStore(store);
    res.send(callbackHtml("Instagram", true, `Connected as <b>@${me.username}</b>.`));
  } catch (err) {
    logDetail("Instagram sign-in failed", err);
    res.send(callbackHtml("Instagram", false, connectionFailure("Instagram")));
  }
});
var DATA_DIR = process.env.RELATE_DATA_DIR ? path.resolve(process.env.RELATE_DATA_DIR) : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "RelateSocial");
var MEDIA_DIR = path.join(DATA_DIR, "media");
var DATE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}$/;
var MAX_MEDIA_BYTES = 1024 * 1024 * 1024;
var MEDIA_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime"
};
var THUMB_DIR = path.join(DATA_DIR, "thumbnails");
var THUMB_WIDTH = 480;
var THUMB_CONCURRENCY = 4;
var THUMB_IMAGE_EXT = /* @__PURE__ */ new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);
var sharpModulePromise = null;
function loadSharp() {
  if (!sharpModulePromise) {
    sharpModulePromise = import("sharp").then((mod) => mod.default).catch((err) => {
      logDetail("thumbnail support unavailable (restart the backend after installing sharp)", err);
      return null;
    });
  }
  return sharpModulePromise;
}
var thumbActive = 0;
var thumbWaiters = [];
async function withThumbSlot(task) {
  if (thumbActive >= THUMB_CONCURRENCY) {
    await new Promise((resolve) => thumbWaiters.push(resolve));
  }
  thumbActive++;
  try {
    return await task();
  } finally {
    thumbActive--;
    thumbWaiters.shift()?.();
  }
}
function streamFileWithRange(req, res, abs, mime, st) {
  res.setHeader("Content-Type", mime);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-cache");
  const range = req.headers.range;
  const match = typeof range === "string" ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, st.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) {
      res.setHeader("Content-Range", `bytes */${st.size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${st.size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }
  res.setHeader("Content-Length", String(st.size));
  fs.createReadStream(abs).pipe(res);
}
async function serveThumbnail(req, res, abs) {
  const ext = path.extname(abs).toLowerCase();
  if (!THUMB_IMAGE_EXT.has(ext)) {
    return res.status(415).json({ error: "Thumbnails are only available for images." });
  }
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: "That file could not be found." });
  }
  if (!st.isFile()) return res.status(404).json({ error: "That file could not be found." });
  const requested = Number(req.query.w);
  const width = Number.isFinite(requested) && requested > 0 ? Math.min(1200, Math.max(64, Math.round(requested))) : THUMB_WIDTH;
  const sharp = await loadSharp();
  if (!sharp) {
    return streamFileWithRange(req, res, abs, MEDIA_MIME[ext] || "application/octet-stream", st);
  }
  const key = crypto.createHash("sha1").update(`${abs}|${st.mtimeMs}|${st.size}|${width}`).digest("hex");
  const cachedFile = path.join(THUMB_DIR, `${key}.webp`);
  try {
    const cached = await fs.promises.readFile(cachedFile);
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", String(cached.length));
    return res.end(cached);
  } catch {
  }
  try {
    const buf = await withThumbSlot(async () => {
      await fs.promises.mkdir(THUMB_DIR, { recursive: true });
      return sharp(abs, { animated: false, failOn: "none" }).rotate().resize({ width, height: width, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    });
    fs.promises.writeFile(cachedFile, buf).catch((err) => logDetail("thumbnail cache write failed", err));
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
  } catch (err) {
    logDetail("thumbnail generation failed", err);
    streamFileWithRange(req, res, abs, MEDIA_MIME[ext] || "application/octet-stream", st);
  }
}
function isThumbnailableImage(name) {
  return THUMB_IMAGE_EXT.has(path.extname(name).toLowerCase());
}
var execFileAsync = promisify(execFile);
var nodeRequire = createRequire(import.meta.url);
var STREAM_DIR = path.join(DATA_DIR, "streams");
var TRANSCODE_TIMEOUT = 15 * 60 * 1e3;
var PLAYABLE_VIDEO_CODECS = /* @__PURE__ */ new Set(["h264", "vp8", "vp9", "av1"]);
var MAX_VIDEO_REENCODE_BYTES = 2 * 1024 * 1024 * 1024;
var ffmpegTools;
var probeCache = /* @__PURE__ */ new Map();
var transcodeJobs = /* @__PURE__ */ new Map();
function bundledFfmpeg() {
  try {
    const ff = nodeRequire("@ffmpeg-installer/ffmpeg");
    const fp = nodeRequire("@ffprobe-installer/ffprobe");
    if (ff?.path && fp?.path) return { ffmpeg: ff.path, ffprobe: fp.path, source: "bundled" };
  } catch {
  }
  return null;
}
async function detectFfmpeg() {
  if (ffmpegTools !== void 0) return ffmpegTools;
  const bundled = bundledFfmpeg();
  if (bundled) {
    try {
      await execFileAsync(bundled.ffmpeg, ["-version"], { timeout: 15e3, windowsHide: true });
      ffmpegTools = bundled;
      return ffmpegTools;
    } catch (err) {
      logDetail("bundled ffmpeg unusable, trying system ffmpeg", err);
    }
  }
  for (const [ffmpeg, ffprobe] of [
    ["ffmpeg", "ffprobe"],
    ["ffmpeg.exe", "ffprobe.exe"]
  ]) {
    try {
      await execFileAsync(ffmpeg, ["-version"], { timeout: 15e3, windowsHide: true });
      ffmpegTools = { ffmpeg, ffprobe, source: "system" };
      return ffmpegTools;
    } catch {
    }
  }
  ffmpegTools = null;
  return null;
}
async function probeMediaStreams(abs, st) {
  const key = `${abs}|${st.mtimeMs}|${st.size}`;
  if (probeCache.has(key)) return probeCache.get(key) ?? null;
  const tools = await detectFfmpeg();
  if (!tools) return null;
  try {
    const { stdout } = await execFileAsync(
      tools.ffprobe,
      ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", abs],
      { timeout: 3e4, maxBuffer: 4 * 1024 * 1024, windowsHide: true }
    );
    const parsed = JSON.parse(stdout);
    const streams = parsed.streams || [];
    const result = {
      video: streams.find((s) => s.codec_type === "video"),
      audio: streams.find((s) => s.codec_type === "audio"),
      duration: Number(parsed.format?.duration) || 0
    };
    probeCache.set(key, result);
    return result;
  } catch (err) {
    logDetail("media probe failed", err);
    return null;
  }
}
function audioNeedsRemux(audio) {
  if (!audio?.codec_name) return false;
  if (audio.codec_name === "aac") return !/^lc$/i.test(audio.profile || "");
  return !["aac", "mp3", "opus", "vorbis"].includes(audio.codec_name);
}
function videoNeedsRemux(video) {
  return Boolean(video?.codec_name) && !PLAYABLE_VIDEO_CODECS.has(video.codec_name);
}
function startTranscode(tools, abs, st, job, fixAudio, fixVideo, duration) {
  fs.mkdirSync(STREAM_DIR, { recursive: true });
  const tmpFile = `${job.outFile}.${process.pid}.tmp.mp4`;
  const big = st.size > 200 * 1024 * 1024;
  const args = ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", abs, "-map", "0:v:0", "-map", "0:a:0?", "-sn"];
  if (fixVideo) {
    const cap = big ? 1280 : 1920;
    const scale = `scale=w='if(gt(iw\\,ih)\\,min(${cap}\\,iw)\\,-2)':h='if(gt(iw\\,ih)\\,-2\\,min(${cap}\\,ih))'`;
    args.push("-c:v", "libx264", "-preset", big ? "ultrafast" : "veryfast", "-crf", big ? "30" : "24", "-vf", scale, "-pix_fmt", "yuv420p");
  } else {
    args.push("-c:v", "copy");
  }
  if (fixAudio) args.push("-c:a", "aac", "-profile:a", "aac_low", "-ac", "2");
  else args.push("-c:a", "copy");
  args.push("-max_muxing_queue_size", "4096", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", tmpFile);
  const child = spawn(tools.ffmpeg, args, { windowsHide: true });
  let stderr = "";
  const killTimer = setTimeout(() => {
    job.error = "Conversion timed out.";
    job.errorAt = Date.now();
    child.kill("SIGKILL");
  }, TRANSCODE_TIMEOUT);
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (!duration) return;
    for (const line of chunk.split("\n")) {
      const match = /^out_time_(?:us|ms|millis)=(\d+)$/.exec(line.trim());
      if (!match) continue;
      const seconds = Number(match[1]) / 1e6;
      job.percent = Math.max(job.percent, Math.min(95, seconds / duration * 100));
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk).slice(-800);
  });
  child.on("error", (err) => {
    clearTimeout(killTimer);
    job.error = err.message;
    job.errorAt = Date.now();
    job.done = true;
  });
  child.on("close", (code) => {
    clearTimeout(killTimer);
    if (code === 0) {
      fs.promises.rename(tmpFile, job.outFile).then(() => {
        job.done = true;
        job.percent = 100;
      }).catch((err) => {
        job.error = err.message;
        job.errorAt = Date.now();
        job.done = true;
      });
      return;
    }
    try {
      fs.unlinkSync(tmpFile);
    } catch {
    }
    job.error = stderr.trim().split("\n").slice(-1)[0] || `ffmpeg exited with code ${code}`;
    job.errorAt = Date.now();
    job.done = true;
    logDetail("playable copy failed", job.error);
  });
}
function getPlayableState(tools, abs, st, fixAudio, fixVideo, duration) {
  const key = crypto.createHash("sha1").update(`v3|${abs}|${st.mtimeMs}|${st.size}|${fixAudio ? "a" : ""}${fixVideo ? "v" : ""}`).digest("hex");
  const outFile = path.join(STREAM_DIR, `${key}.mp4`);
  if (fs.existsSync(outFile)) return { state: "ready", percent: 100, file: outFile };
  let job = transcodeJobs.get(outFile);
  if (job?.error && job.errorAt && Date.now() - job.errorAt > 3e4) {
    transcodeJobs.delete(outFile);
    job = void 0;
  }
  if (!job) {
    job = { outFile, percent: 0, done: false };
    transcodeJobs.set(outFile, job);
    startTranscode(tools, abs, st, job, fixAudio, fixVideo, duration);
  }
  if (job.error) return { state: "failed", percent: Math.round(job.percent), error: job.error };
  if (job.done && fs.existsSync(outFile)) return { state: "ready", percent: 100, file: outFile };
  return { state: "converting", percent: Math.round(job.percent) };
}
async function resolvePlayable(req, res, abs) {
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    res.status(404).json({ error: "That file could not be found." });
    return null;
  }
  const [info, tools] = await Promise.all([probeMediaStreams(abs, st), detectFfmpeg()]);
  if (!info || !tools) return { st, needsConversion: false, playable: null, hasAudio: Boolean(info?.audio) };
  const force = req.query.force === "1" || req.query.force === "true";
  const fixAudio = force || audioNeedsRemux(info.audio);
  const fixVideo = videoNeedsRemux(info.video) && st.size <= MAX_VIDEO_REENCODE_BYTES;
  if (!fixAudio && !fixVideo) return { st, needsConversion: false, playable: null, hasAudio: Boolean(info.audio) };
  return { st, needsConversion: true, playable: getPlayableState(tools, abs, st, fixAudio, fixVideo, info.duration), hasAudio: Boolean(info.audio) };
}
async function servePlayable(req, res, abs, mime) {
  const resolved = await resolvePlayable(req, res, abs);
  if (!resolved) return;
  if (!resolved.needsConversion) return streamFileWithRange(req, res, abs, mime, resolved.st);
  const playable = resolved.playable;
  if (playable.state === "converting") {
    return res.status(202).json({ status: "converting", percent: playable.percent });
  }
  if (playable.state === "failed") {
    return streamFileWithRange(req, res, abs, mime, resolved.st);
  }
  return streamFileWithRange(req, res, playable.file, "video/mp4", fs.statSync(playable.file));
}
async function sendPlayableStatus(req, res, abs) {
  const resolved = await resolvePlayable(req, res, abs);
  if (!resolved) return;
  if (!resolved.needsConversion) return res.json({ status: "original", hasAudio: resolved.hasAudio });
  const playable = resolved.playable;
  if (playable.state === "converting") return res.json({ status: "converting", percent: playable.percent, hasAudio: resolved.hasAudio });
  if (playable.state === "failed") return res.json({ status: "failed", percent: playable.percent, error: playable.error, hasAudio: resolved.hasAudio });
  return res.json({ status: "ready", percent: 100, hasAudio: resolved.hasAudio });
}
async function serveVideoThumbnail(req, res, abs) {
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: "That file could not be found." });
  }
  const tools = await detectFfmpeg();
  if (!tools) return res.status(501).json({ error: "ffmpeg is not available for video thumbnails." });
  const requestedWidth = Number(req.query.w);
  const width = Number.isFinite(requestedWidth) && requestedWidth > 0 ? Math.min(1280, Math.max(64, Math.round(requestedWidth))) : THUMB_WIDTH;
  const requestedTime = Number(req.query.t);
  const seek = Number.isFinite(requestedTime) && requestedTime >= 0 ? Math.min(requestedTime, 60) : 1;
  const key = crypto.createHash("sha1").update(`vt|${abs}|${st.mtimeMs}|${st.size}|${width}|${seek}`).digest("hex");
  const cachedFile = path.join(THUMB_DIR, `${key}.jpg`);
  const sendJpeg = async (buf) => {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
  };
  try {
    sendJpeg(await fs.promises.readFile(cachedFile));
    return;
  } catch {
  }
  try {
    await fs.promises.mkdir(THUMB_DIR, { recursive: true });
    const tmpFile = `${cachedFile}.${process.pid}.tmp.jpg`;
    await withThumbSlot(
      () => execFileAsync(
        tools.ffmpeg,
        [
          "-nostdin",
          "-loglevel",
          "error",
          "-y",
          "-ss",
          String(seek),
          "-i",
          abs,
          "-frames:v",
          "1",
          "-vf",
          `scale=w=min(${width}\\,iw):h=-2`,
          "-q:v",
          "4",
          tmpFile
        ],
        { timeout: 9e4, windowsHide: true }
      )
    );
    await fs.promises.rename(tmpFile, cachedFile);
    sendJpeg(await fs.promises.readFile(cachedFile));
  } catch (err) {
    logDetail("video thumbnail failed", err);
    if (!res.headersSent) res.status(502).json({ error: "That video could not be thumbnailed." });
  }
}
function safeFolder(date) {
  return typeof date === "string" && DATE_FOLDER_RE.test(date) ? date : null;
}
function safeFileName(name) {
  if (typeof name !== "string" || !name.length || name.length > 180) return null;
  const cleaned = name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "");
  return cleaned.length ? cleaned : null;
}
function resolveInMediaDir(date, name) {
  const abs = path.resolve(MEDIA_DIR, date, name);
  return abs.startsWith(path.resolve(MEDIA_DIR) + path.sep) ? abs : null;
}
function listDateFolders() {
  let entries = [];
  try {
    entries = fs.readdirSync(MEDIA_DIR);
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    if (!safeFolder(entry)) continue;
    const dir = path.join(MEDIA_DIR, entry);
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    let files = 0;
    let bytes = 0;
    for (const name of fs.readdirSync(dir)) {
      try {
        const st = fs.statSync(path.join(dir, name));
        if (st.isFile()) {
          files++;
          bytes += st.size;
        }
      } catch {
      }
    }
    out.push({ date: entry, files, bytes });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
app.get("/api/storage/info", (_req, res) => {
  const dates = listDateFolders();
  res.json({
    dataDir: DATA_DIR,
    mediaDir: MEDIA_DIR,
    exists: fs.existsSync(MEDIA_DIR),
    dateFolders: dates.length,
    totalFiles: dates.reduce((s, d) => s + d.files, 0),
    totalBytes: dates.reduce((s, d) => s + d.bytes, 0),
    maxFileBytes: MAX_MEDIA_BYTES
  });
});
app.get("/api/storage/media/dates", (_req, res) => {
  res.json(listDateFolders());
});
app.get("/api/storage/media", (req, res) => {
  const date = safeFolder(req.query.date);
  if (!date) return res.status(400).json({ error: "Choose a valid date in YYYY-MM-DD format." });
  const dir = path.join(MEDIA_DIR, date);
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return res.json([]);
  }
  const items = [];
  for (const name of names) {
    const abs = resolveInMediaDir(date, name);
    if (!abs) continue;
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    const mime = MEDIA_MIME[ext] || "application/octet-stream";
    const version = Math.round(st.mtimeMs);
    items.push({
      date,
      name,
      size: st.size,
      type: mime,
      modifiedAt: st.mtime.toISOString(),
      url: `/api/storage/media/file?date=${date}&name=${encodeURIComponent(name)}`,
      playUrl: mime.startsWith("video/") ? `/api/storage/stream?date=${date}&name=${encodeURIComponent(name)}` : void 0,
      thumbUrl: mime.startsWith("video/") ? `/api/storage/video-thumbnail?date=${date}&name=${encodeURIComponent(name)}&w=${THUMB_WIDTH}&v=${version}` : isThumbnailableImage(name) ? `/api/storage/thumbnail?date=${date}&name=${encodeURIComponent(name)}&w=${THUMB_WIDTH}&v=${version}` : void 0
    });
  }
  res.json(items);
});
app.get("/api/storage/thumbnail", (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: "That file name or date is not valid." });
  void serveThumbnail(req, res, abs);
});
app.get("/api/storage/media/file", (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: "That file name or date is not valid." });
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: "That file could not be found." });
  }
  if (!st.isFile()) return res.status(404).json({ error: "That file could not be found." });
  streamFileWithRange(
    req,
    res,
    abs,
    MEDIA_MIME[path.extname(abs).toLowerCase()] || "application/octet-stream",
    st
  );
});
app.get("/api/storage/video-thumbnail", (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: "That file name or date is not valid." });
  void serveVideoThumbnail(req, res, abs);
});
app.get("/api/storage/stream/status", (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: "That file name or date is not valid." });
  void sendPlayableStatus(req, res, abs);
});
app.get("/api/storage/stream", (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: "That file name or date is not valid." });
  const mime = MEDIA_MIME[path.extname(abs).toLowerCase()] || "application/octet-stream";
  if (!mime.startsWith("video/")) return res.status(404).json({ error: "That file is not a video." });
  void servePlayable(req, res, abs, mime);
});
app.post(
  "/api/storage/media",
  // Browsers send an empty Blob without a Content-Type, and body-parser then
  // skips the body entirely — accept any (or missing) type and read the bytes.
  express.raw({ type: () => true, limit: `${MAX_MEDIA_BYTES}b` }),
  (req, res) => {
    const date = safeFolder(req.query.date);
    if (!date) return res.status(400).json({ error: "Choose a valid date in YYYY-MM-DD format." });
    let name = safeFileName(req.query.name);
    if (!name) name = `upload-${Date.now()}`;
    const ext = path.extname(name).toLowerCase();
    if (!MEDIA_MIME[ext]) {
      return res.status(400).json({ error: "That file type is not supported. Choose an image or video." });
    }
    const buf = req.body;
    if (!buf?.length) return res.status(400).json({ error: "No file was included in the upload." });
    if (buf.length > MAX_MEDIA_BYTES) return res.status(413).json({ error: "That file is too large. Choose one under 1 GB." });
    const dir = path.join(MEDIA_DIR, date);
    fs.mkdirSync(dir, { recursive: true });
    let finalName = name;
    for (let i = 1; fs.existsSync(path.join(dir, finalName)); i++) {
      finalName = safeFileName(`${path.parse(name).name}-${i}${ext}`) || `upload-${Date.now()}-${i}${ext}`;
    }
    fs.writeFileSync(path.join(dir, finalName), buf);
    res.status(201).json({
      date,
      name: finalName,
      size: buf.length,
      type: MEDIA_MIME[ext],
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      url: `/api/storage/media/file?date=${date}&name=${encodeURIComponent(finalName)}`
    });
  }
);
app.delete("/api/storage/media", (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: "That file name or date is not valid." });
  try {
    fs.unlinkSync(abs);
    res.json({ deleted: `${date}/${name}` });
  } catch (err) {
    logDetail("media delete failed", err);
    res.status(500).json({ error: "We could not delete that file. Please try again." });
  }
});
var LIBRARY_ROOTS_FILE = path.join(DATA_DIR, "library-roots.json");
var LIBRARY_MEDIA_EXT = /* @__PURE__ */ new Set([...Object.keys(MEDIA_MIME), ".avif", ".m4v"]);
var LIBRARY_MIME = {
  ...MEDIA_MIME,
  ".avif": "image/avif",
  ".m4v": "video/x-m4v"
};
var LIBRARY_LIST_LIMIT = 2e3;
function loadLibraryRoots() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LIBRARY_ROOTS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r?.path === "string") : [];
  } catch {
    return [];
  }
}
function saveLibraryRoots(roots) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LIBRARY_ROOTS_FILE, JSON.stringify(roots, null, 2));
}
function expandUserPath(input) {
  let p = input.trim().replace(/^"(.*)"$/, "$1");
  if (p === "~" || p.startsWith("~/") || p.startsWith("~\\")) {
    p = path.join(os.homedir(), p.slice(1));
  }
  p = p.replace(/%([^%]+)%/g, (m, name) => process.env[name] ?? m);
  return path.resolve(p);
}
function rootById(id) {
  return typeof id === "string" ? loadLibraryRoots().find((r) => r.id === id) : void 0;
}
function resolveInRoot(root, rel) {
  if (typeof rel !== "string" || rel.includes("\0")) return null;
  const base = path.resolve(root.path);
  const abs = path.resolve(base, rel.replace(/^[/\\]+/, ""));
  const norm = process.platform === "win32" ? (s) => s.toLowerCase() : (s) => s;
  const a = norm(abs);
  const b = norm(base);
  return a === b || a.startsWith(b + path.sep) ? abs : null;
}
function libraryMime(name) {
  const ext = path.extname(name).toLowerCase();
  return LIBRARY_MEDIA_EXT.has(ext) ? LIBRARY_MIME[ext] || "application/octet-stream" : null;
}
var FS_LIST_LIMIT = () => Math.max(1, Number(process.env.FS_LIST_LIMIT || 1e3));
function browseError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}
function existingDirectory(candidate) {
  try {
    return fs.statSync(candidate).isDirectory() ? candidate : null;
  } catch {
    return null;
  }
}
function childDirectories(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const children = [];
  for (const name of names) {
    const child = existingDirectory(path.join(dir, name));
    if (child) children.push(child);
  }
  return children;
}
var VOLUME_ARTIFACTS = /* @__PURE__ */ new Set(["$recycle.bin", "system volume information", "lost+found"]);
function linuxMountPoints() {
  try {
    const mounts = fs.readFileSync("/proc/mounts", "utf8");
    const points = [];
    for (const line of mounts.split("\n")) {
      const fields = line.trim().split(/\s+/);
      const mountPoint = fields[1];
      if (!mountPoint) continue;
      const decoded = mountPoint.replace(/\\040/g, " ");
      if (!/^\/(media|mnt|run\/media)\/.+/.test(decoded)) continue;
      points.push(decoded);
    }
    return points;
  } catch {
    return [];
  }
}
function browseRoots() {
  const configured = process.env.MEDIA_BROWSE_ROOTS;
  if (configured && configured.trim()) {
    const roots2 = [];
    const seen2 = /* @__PURE__ */ new Set();
    for (const segment of configured.split(path.delimiter)) {
      if (!segment.trim()) continue;
      const resolved = expandUserPath(segment);
      if (seen2.has(resolved) || !existingDirectory(resolved)) continue;
      seen2.add(resolved);
      roots2.push({ name: path.basename(resolved) || resolved, path: resolved, kind: "custom" });
    }
    return roots2;
  }
  const roots = [{ name: "Home", path: os.homedir(), kind: "home" }];
  const seen = /* @__PURE__ */ new Set([roots[0].path]);
  const addVolume = (volumePath) => {
    if (seen.has(volumePath) || !existingDirectory(volumePath)) return;
    const name = path.basename(volumePath) || volumePath;
    if (name.startsWith(".") || VOLUME_ARTIFACTS.has(name.toLowerCase())) return;
    seen.add(volumePath);
    roots.push({ name, path: volumePath, kind: "volume" });
  };
  if (process.platform === "win32") {
    for (let code = "A".charCodeAt(0); code <= "Z".charCodeAt(0); code++) {
      const letter = String.fromCharCode(code);
      const drive = `${letter}:\\`;
      if (existingDirectory(drive)) roots.push({ name: `${letter}:`, path: drive, kind: "volume" });
    }
  } else if (process.platform === "darwin") {
    for (const volume of childDirectories("/Volumes")) addVolume(volume);
  } else {
    const mounts = linuxMountPoints();
    if (mounts.length > 0) {
      for (const mount of mounts) addVolume(mount);
    } else {
      for (const base of ["/media", "/mnt", "/run/media"]) {
        for (const volume of childDirectories(base)) addVolume(volume);
      }
    }
  }
  return roots;
}
function normalizePath(p) {
  return process.platform === "win32" ? p.toLowerCase() : p;
}
function isPathInside(candidate, roots) {
  const target = normalizePath(path.resolve(candidate));
  return roots.some((root) => {
    const base = normalizePath(path.resolve(root.path));
    return target === base || target.startsWith(base + path.sep);
  });
}
function isInsideRoot(candidate, roots) {
  let target;
  try {
    target = normalizePath(fs.realpathSync(candidate));
  } catch {
    return false;
  }
  return roots.some((root) => {
    let base;
    try {
      base = normalizePath(fs.realpathSync(root.path));
    } catch {
      return false;
    }
    return target === base || target.startsWith(base + path.sep);
  });
}
function listFolderListing(target) {
  const roots = browseRoots();
  if (roots.length === 0) {
    throw browseError(500, "No folders are available to browse on this computer.");
  }
  const abs = expandUserPath(target);
  if (abs.includes("\0")) {
    throw browseError(400, "That path points to a file, not a folder.");
  }
  if (!isPathInside(abs, roots)) {
    throw browseError(403, "That folder is outside the folders this app is allowed to browse.");
  }
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch (err) {
    if (err?.code === "EACCES" || err?.code === "EPERM") {
      throw browseError(403, "That folder cannot be read. Check its permissions.");
    }
    throw browseError(404, "That folder could not be found. Check the path and try again.");
  }
  if (!stat.isDirectory()) {
    throw browseError(400, "That path points to a file, not a folder.");
  }
  if (!isInsideRoot(abs, roots)) {
    throw browseError(403, "That folder is outside the folders this app is allowed to browse.");
  }
  let dirents;
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true });
  } catch (err) {
    if (err?.code === "EACCES" || err?.code === "EPERM") {
      throw browseError(403, "That folder cannot be read. Check its permissions.");
    }
    throw browseError(404, "That folder could not be found. Check the path and try again.");
  }
  const limit = FS_LIST_LIMIT();
  const candidates = dirents.filter((entry) => (entry.isDirectory() || entry.isSymbolicLink()) && !entry.name.startsWith(".")).map((entry) => ({ name: entry.name, symlink: entry.isSymbolicLink() })).sort((a, b) => a.name.localeCompare(b.name, void 0, { numeric: true }));
  let selfReal;
  try {
    selfReal = fs.realpathSync(abs);
  } catch {
    selfReal = abs;
  }
  const entries = [];
  let truncated = false;
  for (const candidate of candidates) {
    if (entries.length >= limit) {
      truncated = true;
      break;
    }
    const child = path.join(abs, candidate.name);
    if (candidate.symlink) {
      try {
        const real = fs.realpathSync(child);
        if (real === selfReal) continue;
        if (!fs.statSync(child).isDirectory()) continue;
        if (!isInsideRoot(child, roots)) continue;
      } catch {
        continue;
      }
    }
    entries.push({ name: candidate.name, path: child });
  }
  const parentDir = path.dirname(abs);
  const hasParent = isPathInside(parentDir, roots);
  return {
    path: abs,
    name: path.basename(abs) || abs,
    parent: hasParent ? parentDir : null,
    isRoot: !hasParent,
    limit,
    places: roots,
    entries,
    truncated
  };
}
function browseEnabled() {
  const raw = String(process.env.MEDIA_BROWSE ?? "").trim().toLowerCase();
  if (raw === "") return true;
  return !["0", "off", "false", "no"].includes(raw);
}
function browseRemoteAllowed() {
  return process.env.MEDIA_BROWSE_REMOTE === "1";
}
function isLocalRequest(req) {
  const host = String(req.headers.host || "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) return false;
  if (req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || req.headers["x-real-ip"]) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.replace(/^\[|\]$/g, "").toLowerCase();
      if (!["localhost", "127.0.0.1", "::1"].includes(originHost)) return false;
    } catch {
      return false;
    }
  }
  return true;
}
function browseGuard(req) {
  if (!browseEnabled()) return "Folder browsing is turned off on this computer. Paste the folder path instead.";
  if (!browseRemoteAllowed() && !isLocalRequest(req)) {
    return "Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.";
  }
  return null;
}
app.get("/api/fs/dirs", (req, res) => {
  const blocked = browseGuard(req);
  if (blocked) return res.status(403).json({ error: blocked });
  try {
    const raw = typeof req.query.path === "string" ? req.query.path : "";
    const roots = browseRoots();
    if (roots.length === 0) {
      throw Object.assign(new Error("No folders are available to browse on this computer."), { statusCode: 500 });
    }
    res.json(listFolderListing(raw.trim() ? raw : roots[0].path));
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    const message = err?.statusCode ? err.message : "That folder could not be found. Check the path and try again.";
    res.status(status).json({ error: message });
  }
});
function hasCommand(cmd) {
  const dirs = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const names = process.platform === "win32" ? [`${cmd}.exe`, `${cmd}.cmd`, cmd] : [cmd];
  return dirs.some((dir) => names.some((n) => {
    try {
      return fs.statSync(path.join(dir, n)).isFile();
    } catch {
      return false;
    }
  }));
}
function hasDisplay() {
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}
var cachedCapability = null;
var GTK4_IMPORT_CHECK = 'import gi; gi.require_version("Gtk", "4.0"); from gi.repository import Gtk; Gtk.FileDialog';
var cachedGtk4Import = null;
function gtk4Importable(force = false) {
  if (cachedGtk4Import !== null && !force) return cachedGtk4Import;
  let ok = false;
  if (hasCommand("python3")) {
    try {
      execFileSync("python3", ["-c", GTK4_IMPORT_CHECK], { timeout: 5e3 });
      ok = true;
    } catch (err) {
      logDetail(
        "gtk4 import check failed",
        `status=${err?.status ?? err?.code ?? "none"} signal=${err?.signal ?? "none"} error=${err?.error?.message ?? "none"} stderr=${String(err?.stderr ?? "").trim() || "none"}`
      );
    }
  }
  cachedGtk4Import = ok;
  return ok;
}
var cachedPortal = null;
function portalAvailable(force = false) {
  if (!force && cachedPortal !== null) return cachedPortal;
  if (!hasCommand("gdbus")) {
    cachedPortal = false;
    return false;
  }
  try {
    execFileSync(
      "gdbus",
      [
        "introspect",
        "--session",
        "--dest",
        "org.freedesktop.portal.Desktop",
        "--object-path",
        "/org/freedesktop/portal/desktop"
      ],
      { timeout: 5e3, stdio: ["ignore", "ignore", "ignore"] }
    );
    cachedPortal = true;
  } catch (err) {
    logDetail(
      "portal introspect failed",
      `status=${err?.status ?? err?.code ?? "none"} signal=${err?.signal ?? "none"} message=${err?.message ?? "none"}`
    );
    cachedPortal = false;
  }
  return cachedPortal;
}
var PICKER_BACKEND_IDS = /* @__PURE__ */ new Set([
  "zenity",
  "kdialog",
  "gtk4",
  "portal",
  "powershell",
  "pwsh",
  "osascript"
]);
function chainBuildsBackend(id) {
  if (id === "powershell" || id === "pwsh") return process.platform === "win32";
  if (id === "osascript") return process.platform === "darwin";
  return true;
}
function resolvePickerBackend(force = false) {
  const forced = String(process.env.MEDIA_PICKER_BACKEND || "auto").trim().toLowerCase();
  if (forced === "none") return null;
  if (forced !== "auto") {
    if (!PICKER_BACKEND_IDS.has(forced)) return null;
    return chainBuildsBackend(forced) ? forced : null;
  }
  if (process.platform === "win32") {
    if (hasCommand("powershell")) return "powershell";
    if (hasCommand("pwsh")) return "pwsh";
    return null;
  }
  if (process.platform === "darwin") return hasCommand("osascript") ? "osascript" : null;
  if (hasDisplay()) {
    if (hasCommand("zenity")) return "zenity";
    if (hasCommand("kdialog")) return "kdialog";
    if (gtk4Importable(force)) return "gtk4";
  }
  return portalAvailable(force) ? "portal" : null;
}
function probeFolderPicker(force = false) {
  const platform = process.platform;
  const enabled = browseEnabled();
  const forced = String(process.env.MEDIA_PICKER_BACKEND || "auto").trim().toLowerCase();
  const key = `${platform}|${forced}|${enabled}`;
  if (!force && cachedCapability && cachedCapability.key === key) return cachedCapability.value;
  let value;
  if (!enabled) {
    value = {
      platform,
      available: false,
      backend: null,
      detail: "Folder browsing is turned off on this computer. Paste the folder path instead."
    };
  } else {
    const backend = resolvePickerBackend(force);
    value = {
      platform,
      available: Boolean(backend),
      backend,
      detail: backend ? null : "No zenity, kdialog, GTK4 or desktop portal backend was found."
    };
  }
  cachedCapability = { key, value };
  return value;
}
app.get("/api/fs/folder-picker", (req, res) => {
  res.json(probeFolderPicker(req.query.refresh === "1"));
});
var PICKER_TIMEOUT = 5 * 60 * 1e3;
var WINDOWS_FOLDER_DIALOG_SCRIPT = [
  "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "$dialog.Description = 'Select a media folder'",
  "$dialog.ShowNewFolderButton = $false",
  "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }"
].join("; ");
var exitCodeOne = (err) => err?.code === 1;
var osascriptCanceled = (err) => /cancel|-128/i.test(`${err?.stderr || ""} ${err?.message || ""}`);
function commandBackend(id, cmd, args, isCancellation) {
  return {
    id,
    isCancellation,
    run: async () => {
      const { stdout } = await execFileAsync(cmd, args, { timeout: PICKER_TIMEOUT, windowsHide: true });
      const chosen = stdout.trim();
      return chosen ? { canceled: false, path: chosen } : { canceled: true };
    }
  };
}
var GTK4_SCRIPT = [
  "import sys",
  "import gi",
  'gi.require_version("Gtk", "4.0")',
  "from gi.repository import GLib, Gtk",
  'app = Gtk.Application(application_id="app.cal.folderpicker")',
  "def on_activate(application):",
  // hold() keeps the GtkApplication alive while the dialog is open: with no
  // window of its own, GApplication would drop its use count to zero and exit
  // as soon as activate returns, killing the portal request mid-flight.
  "    application.hold()",
  '    dialog = Gtk.FileDialog(title="Select a media folder")',
  "    def on_done(source, result):",
  "        try:",
  "            folder = source.select_folder_finish(result)",
  "            print(folder.get_path(), flush=True)",
  "        except GLib.Error:",
  '            print("__CANCELED__", flush=True)',
  // finally: quit even when a non-GLib.Error escapes select_folder_finish —
  // otherwise the held application lives until the 5-minute timeout, which
  // the chain would classify as a cancel rather than a backend failure.
  "        finally:",
  "            application.quit()",
  "    dialog.select_folder(None, None, on_done)",
  'app.connect("activate", on_activate)',
  "app.run([])"
].join("\n");
function gtk4PickerBackend() {
  return {
    id: "gtk4",
    run: async () => {
      const { stdout } = await execFileAsync("python3", ["-c", GTK4_SCRIPT], { timeout: PICKER_TIMEOUT });
      const chosen = stdout.trim();
      if (!chosen || chosen === "__CANCELED__") return { canceled: true };
      return { canceled: false, path: chosen };
    }
  };
}
var PORTAL_TIMEOUT = 5 * 60 * 1e3;
function portalPickerBackend() {
  return {
    id: "portal",
    run: async () => {
      const token = `cal${Date.now().toString(36)}`;
      const monitor = spawn("gdbus", [
        "monitor",
        "--session",
        "--dest",
        "org.freedesktop.portal.Desktop"
      ], { stdio: ["ignore", "pipe", "ignore"] });
      monitor.on("error", (err) => {
        logDetail("folder picker portal monitor failed", `message=${err?.message ?? "none"}`);
      });
      let out = "";
      monitor.stdout.on("data", (chunk) => {
        out += String(chunk);
      });
      try {
        const { stdout } = await execFileAsync("gdbus", [
          "call",
          "--session",
          "--dest",
          "org.freedesktop.portal.Desktop",
          "--object-path",
          "/org/freedesktop/portal/desktop",
          "--method",
          "org.freedesktop.portal.FileChooser.OpenFile",
          "",
          "Select a media folder",
          `{'handle_token': <'${token}'>, 'directory': <true>, 'multiple': <false>}`
        ], { timeout: PORTAL_TIMEOUT });
        const requestPath = (stdout.match(/'([^']*\/request\/[^']*)'/) || [])[1];
        if (!requestPath) {
          throw Object.assign(new Error("portal did not return a request handle"), { code: "ENOENT" });
        }
        const marker = `${requestPath}: org.freedesktop.portal.Request.Response (uint32 `;
        const deadline = Date.now() + PORTAL_TIMEOUT;
        let answered = false;
        while (Date.now() < deadline) {
          const line = out.split("\n").find((l) => l.startsWith(marker));
          if (line) {
            answered = true;
            const code = Number(line.match(/uint32 (\d+)/)[1]);
            if (code !== 0) return { canceled: true };
            const uri = (line.match(/'file:\/\/(?:[^'\\]|\\.)*'/) || [])[0];
            if (!uri) {
              throw Object.assign(new Error("That folder is a network or device location this app cannot read. Choose a folder on this computer."), { statusCode: 400 });
            }
            const raw = uri.replace(/^'file:\/\//, "").replace(/'$/, "");
            const unescaped = raw.replace(/\\'/g, "'").replace(/\\\\/g, "\\");
            return { canceled: false, path: decodeURIComponent(unescaped) };
          }
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!answered) {
          try {
            await execFileAsync("gdbus", [
              "call",
              "--session",
              "--dest",
              "org.freedesktop.portal.Desktop",
              "--object-path",
              requestPath,
              "--method",
              "org.freedesktop.portal.Request.Close"
            ], { timeout: 5e3 });
          } catch (err) {
            logDetail("folder picker portal close failed", `message=${err?.message ?? "none"}`);
          }
        }
        return { canceled: true };
      } finally {
        monitor.kill();
      }
    }
  };
}
function defaultPickerChain() {
  const forced = (process.env.MEDIA_PICKER_BACKEND || "auto").trim().toLowerCase();
  const chain = [];
  const add = (id, make) => {
    if (forced === "auto" || forced === id) chain.push(make());
  };
  if (process.platform === "win32") {
    add("powershell", () => commandBackend("powershell", "powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-Command",
      WINDOWS_FOLDER_DIALOG_SCRIPT
    ]));
    add("pwsh", () => commandBackend("pwsh", "pwsh", [
      "-NoProfile",
      "-NonInteractive",
      "-STA",
      "-Command",
      WINDOWS_FOLDER_DIALOG_SCRIPT
    ]));
  }
  if (process.platform === "darwin") {
    add("osascript", () => commandBackend("osascript", "osascript", [
      "-e",
      'POSIX path of (choose folder with prompt "Select a media folder")'
    ], osascriptCanceled));
  }
  add("zenity", () => commandBackend("zenity", "zenity", ["--file-selection", "--directory", "--title=Select a media folder"], exitCodeOne));
  add("kdialog", () => commandBackend("kdialog", "kdialog", ["--getexistingdirectory", os.homedir(), "--title", "Select a media folder"], exitCodeOne));
  add("gtk4", () => gtk4PickerBackend());
  add("portal", () => portalPickerBackend());
  return chain;
}
async function pickFolderNative(chain = defaultPickerChain()) {
  for (const backend of chain) {
    try {
      return await backend.run();
    } catch (err) {
      const detail = `code=${err?.code ?? "none"} signal=${err?.signal ?? "none"} killed=${Boolean(err?.killed)} stderr=${String(err?.stderr ?? "").trim() || "none"} message=${err?.message ?? "none"}`;
      if (err?.code === "ENOENT") {
        logDetail(`folder picker backend unavailable: ${backend.id}`, detail);
        continue;
      }
      if (err?.statusCode) {
        logDetail(`folder picker backend refused: ${backend.id}`, detail);
        throw err;
      }
      if (err?.killed) {
        logDetail(`folder picker timed out: ${backend.id}`, detail);
        return { canceled: true };
      }
      if (err?.signal) {
        logDetail(`folder picker backend crashed: ${backend.id}`, detail);
        continue;
      }
      if (backend.isCancellation?.(err)) {
        logDetail(`folder picker canceled: ${backend.id}`, detail);
        return { canceled: true };
      }
      logDetail(`folder picker backend failed: ${backend.id}`, detail);
      continue;
    }
  }
  throw Object.assign(new Error("No native folder picker is available. Paste the folder path instead."), { statusCode: 501 });
}
var __pickerBackends = { gtk4: gtk4PickerBackend, portal: portalPickerBackend };
function createPickerGate() {
  let busy = false;
  return {
    isBusy: () => busy,
    run: async (fn) => {
      if (busy) throw Object.assign(new Error("A folder picker is already open. Finish it first."), { statusCode: 409 });
      busy = true;
      try {
        return await fn();
      } finally {
        busy = false;
      }
    }
  };
}
var pickerGate = createPickerGate();
app.get("/api/library/roots", (req, res) => {
  if (!isLocalRequest(req)) {
    const blocked = browseGuard(req);
    if (blocked) return res.status(403).json({ error: blocked });
  }
  res.json(
    loadLibraryRoots().map((r) => ({ ...r, exists: fs.existsSync(r.path) }))
  );
});
function libraryReadGuard(req, rootPath) {
  if (isLocalRequest(req)) return null;
  return browseGuard(req) ?? (isInsideRoot(rootPath, browseRoots()) ? null : "That folder is outside the folders this app is allowed to browse.");
}
app.post("/api/library/roots", (req, res) => {
  const raw = typeof req.body?.path === "string" ? req.body.path : "";
  if (!raw.trim()) return res.status(400).json({ error: "Enter a folder path first." });
  const abs = expandUserPath(raw);
  if (!isLocalRequest(req)) {
    const blocked = browseGuard(req);
    if (blocked) return res.status(403).json({ error: blocked });
    if (!isPathInside(abs, browseRoots())) {
      return res.status(403).json({ error: "That folder is outside the folders this app is allowed to browse." });
    }
  }
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: "That folder could not be found. Check the path and try again." });
  }
  if (!st.isDirectory()) return res.status(400).json({ error: "That path points to a file, not a folder." });
  if (!isLocalRequest(req) && !isInsideRoot(abs, browseRoots())) {
    return res.status(403).json({ error: "That folder is outside the folders this app is allowed to browse." });
  }
  const roots = loadLibraryRoots();
  const norm = process.platform === "win32" ? (s) => s.toLowerCase() : (s) => s;
  const existing = roots.find((r) => norm(path.resolve(r.path)) === norm(abs));
  if (existing) return res.json({ ...existing, exists: true });
  const id = crypto.createHash("sha1").update(norm(abs)).digest("hex").slice(0, 10);
  const root = {
    id,
    name: path.basename(abs) || abs,
    path: abs,
    addedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  roots.push(root);
  saveLibraryRoots(roots);
  res.status(201).json({ ...root, exists: true });
});
app.delete("/api/library/roots/:id", (req, res) => {
  if (!isLocalRequest(req)) {
    const blocked = browseGuard(req);
    if (blocked) return res.status(403).json({ error: blocked });
  }
  const roots = loadLibraryRoots();
  const next = roots.filter((r) => r.id !== req.params.id);
  if (next.length === roots.length) return res.status(404).json({ error: "That library folder is no longer available." });
  saveLibraryRoots(next);
  res.json({ removed: req.params.id });
});
app.get("/api/library/list", (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: "That library folder is not available." });
  const blocked = libraryReadGuard(req, root.path);
  if (blocked) return res.status(403).json({ error: blocked });
  const rel = typeof req.query.path === "string" ? req.query.path : "";
  const abs = resolveInRoot(root, rel);
  if (!abs) return res.status(400).json({ error: "That folder path is not valid." });
  let names;
  try {
    names = fs.readdirSync(abs);
  } catch {
    return res.status(404).json({ error: "That folder could not be found. Check the path and try again." });
  }
  const folders = [];
  const files = [];
  let truncated = false;
  for (const name of names.sort((a, b) => a.localeCompare(b, void 0, { numeric: true }))) {
    if (name.startsWith(".")) continue;
    const childRel = rel ? `${rel}/${name}` : name;
    const childAbs = path.join(abs, name);
    let st;
    try {
      st = fs.statSync(childAbs);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      folders.push({ name, path: childRel });
      continue;
    }
    if (!st.isFile() || !libraryMime(name)) continue;
    if (files.length >= LIBRARY_LIST_LIMIT) {
      truncated = true;
      continue;
    }
    const fileMime = libraryMime(name);
    const fileUrl = `/api/library/file?root=${root.id}&path=${encodeURIComponent(childRel)}`;
    const version = Math.round(st.mtimeMs);
    files.push({
      name,
      path: childRel,
      size: st.size,
      type: fileMime,
      modifiedAt: st.mtime.toISOString(),
      url: fileUrl,
      playUrl: fileMime.startsWith("video/") ? `/api/library/stream?root=${root.id}&path=${encodeURIComponent(childRel)}` : void 0,
      thumbUrl: fileMime.startsWith("video/") ? `/api/library/video-thumbnail?root=${root.id}&path=${encodeURIComponent(childRel)}&w=${THUMB_WIDTH}&v=${version}` : isThumbnailableImage(name) ? `/api/library/thumbnail?root=${root.id}&path=${encodeURIComponent(childRel)}&w=${THUMB_WIDTH}&v=${version}` : void 0
    });
  }
  res.json({ root: { id: root.id, name: root.name, path: root.path }, path: rel, folders, files, truncated });
});
app.get("/api/library/thumbnail", (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: "That library folder is not available." });
  const blocked = libraryReadGuard(req, root.path);
  if (blocked) return res.status(403).json({ error: blocked });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: "That folder path is not valid." });
  void serveThumbnail(req, res, abs);
});
app.post("/api/library/pick-folder", async (req, res) => {
  const blocked = browseGuard(req);
  if (blocked) return res.status(403).json({ error: blocked });
  try {
    const result = await pickerGate.run(() => pickFolderNative());
    if (result.canceled || !("path" in result)) return res.json({ canceled: true });
    const abs = path.resolve(expandUserPath(result.path));
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      return res.status(404).json({ error: `Folder not found: ${abs}` });
    }
    if (!st.isDirectory()) return res.status(400).json({ error: `Not a folder: ${abs}` });
    res.json({ canceled: false, path: abs });
  } catch (err) {
    logDetail("folder picker failed", err);
    const status = Number(err?.statusCode) || 500;
    const ownStatus = Number.isInteger(err?.statusCode) && err.statusCode >= 100 && err.statusCode <= 599 ? err.statusCode : null;
    res.status(status === 501 ? 501 : status === 409 ? 409 : ownStatus ?? 500).json({
      error: status === 501 ? "No native folder picker is available on this system. Paste the folder path instead." : status === 409 ? "A folder picker is already open. Finish it first." : ownStatus ? String(err.message) : "The folder picker could not open. Paste the folder path instead."
    });
  }
});
app.get("/api/library/file", (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: "That library folder is not available." });
  const blocked = libraryReadGuard(req, root.path);
  if (blocked) return res.status(403).json({ error: blocked });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: "That folder path is not valid." });
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: "That file could not be found." });
  }
  const mime = st.isFile() ? libraryMime(abs) : null;
  if (!mime) return res.status(404).json({ error: "That file is not a supported image or video." });
  streamFileWithRange(req, res, abs, mime, st);
});
app.get("/api/library/video-thumbnail", (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: "That library folder is not available." });
  const blocked = libraryReadGuard(req, root.path);
  if (blocked) return res.status(403).json({ error: blocked });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: "That folder path is not valid." });
  void serveVideoThumbnail(req, res, abs);
});
app.get("/api/library/stream", (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: "That library folder is not available." });
  const blocked = libraryReadGuard(req, root.path);
  if (blocked) return res.status(403).json({ error: blocked });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: "That folder path is not valid." });
  const mime = libraryMime(abs);
  if (!mime || !mime.startsWith("video/")) return res.status(404).json({ error: "That file is not a supported video." });
  void servePlayable(req, res, abs, mime);
});
app.get("/api/library/stream/status", (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: "That library folder is not available." });
  const blocked = libraryReadGuard(req, root.path);
  if (blocked) return res.status(403).json({ error: blocked });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: "That folder path is not valid." });
  void sendPlayableStatus(req, res, abs);
});
function needsRefresh(conn) {
  return Boolean(conn.expiresAt && conn.expiresAt - Date.now() < 5 * 60 * 1e3);
}
async function freshAccessToken(storeKey) {
  const store = loadStore();
  const conn = store[storeKey];
  if (!conn) throw new Error("This account is not connected yet. Connect it first.");
  if (!needsRefresh(conn)) return conn.accessToken;
  let next;
  if (storeKey === "tiktok") {
    if (!conn.refreshToken) throw new Error("Your TikTok session has expired. Reconnect TikTok to continue.");
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: conn.refreshToken
      })
    });
    next = await res.json();
    if (next.error || !next.access_token) {
      logDetail("TikTok token refresh failed", next.error_description || next.error);
      throw new Error("We could not renew your TikTok session. Reconnect TikTok to continue.");
    }
  } else if (storeKey === "youtube") {
    if (!conn.refreshToken) throw new Error("Your Google session has expired. Reconnect YouTube to continue.");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: conn.refreshToken
      })
    });
    next = await res.json();
    if (next.error || !next.access_token) {
      logDetail("Google token refresh failed", `${next.error}: ${next.error_description || ""}`);
      throw new Error("We could not renew your Google session. Reconnect YouTube to continue.");
    }
  } else if (storeKey === "instagram") {
    const res = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(conn.accessToken)}`
    );
    next = await res.json();
    if (next.error_message || next.error) {
      logDetail("Instagram token refresh failed", next.error_message || next.error?.message);
      throw new Error("We could not renew your Instagram session. Reconnect Instagram to continue.");
    }
  } else {
    const res = await fetch(
      `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(conn.accessToken)}`
    );
    next = await res.json();
    if (next.error) {
      logDetail("Threads token refresh failed", next.error.message);
      throw new Error("We could not renew your Threads session. Reconnect Threads to continue.");
    }
  }
  conn.accessToken = next.access_token;
  if (next.refresh_token) conn.refreshToken = next.refresh_token;
  conn.expiresAt = Date.now() + (next.expires_in ? next.expires_in * 1e3 : 3600 * 1e3);
  const s2 = loadStore();
  s2[storeKey] = conn;
  if (storeKey === "instagram") {
    s2.instagramAccounts = { ...s2.instagramAccounts || {}, [conn.accountIds[0]]: conn };
  }
  saveStore(s2);
  return conn.accessToken;
}
app.get("/api/health", (_req, res) => {
  res.json({
    metaConfigured: Boolean(META_APP_ID && META_APP_SECRET),
    tiktokConfigured: Boolean(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET),
    youtubeConfigured: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    threadsConfigured: Boolean(META_APP_ID && META_APP_SECRET),
    instagramLoginConfigured: Boolean(IG_APP_ID && IG_APP_SECRET),
    graphVersion: GRAPH_VERSION,
    redirectBase: APP_BASE
  });
});
app.get("/api/connections", (_req, res) => {
  res.json(publicConnections());
});
app.post("/api/verify/:platform", async (req, res) => {
  const platform = req.params.platform;
  const store = loadStore();
  try {
    if (platform === "instagram" && store.instagram) {
      const accessToken = await freshAccessToken("instagram");
      const meRes = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me?fields=user_id,username`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const me = await meRes.json();
      if (me.error) {
        logDetail("Instagram verification failed", me.error.message);
        return res.status(502).json({ error: "Instagram could not confirm this connection. Reconnect Instagram and try again." });
      }
      return res.json({
        platform,
        ok: true,
        identity: `@${me.username} (${me.user_id})`,
        via: "Instagram Login",
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (platform === "facebook" || platform === "instagram") {
      const conn = store.meta;
      if (!conn) return res.status(400).json({ error: "Facebook and Instagram are not connected yet. Connect them first, then try again." });
      const me = await graphGet(`https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name`, conn.accessToken);
      const pages = conn.metaPages || [];
      const result = {
        platform,
        ok: true,
        identity: `${me.name} (${me.id})`,
        pages: pages.map((p) => ({ id: p.id, name: p.name })),
        instagram: pages.filter((p) => p.instagramId).map((p) => ({ id: p.instagramId, username: p.instagramUsername })),
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (platform === "instagram" && result.instagram.length === 0) {
        return res.json({ ...result, ok: false, warning: "No Instagram professional account is connected to any of your Facebook Pages." });
      }
      return res.json(result);
    }
    if (platform === "tiktok") {
      const conn = store.tiktok;
      if (!conn) return res.status(400).json({ error: "TikTok is not connected yet. Connect it first, then try again." });
      const accessToken = await freshAccessToken("tiktok");
      const infoRes = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const info = await infoRes.json();
      const user = info.data?.user;
      if (!user) {
        logDetail("TikTok verification failed", info.error?.message);
        return res.status(502).json({ error: "TikTok could not confirm this connection. Reconnect TikTok and try again." });
      }
      return res.json({
        platform,
        ok: true,
        identity: `${user.display_name} (${user.open_id})`,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (platform === "youtube") {
      const conn = store.youtube;
      if (!conn) return res.status(400).json({ error: "YouTube is not connected yet. Connect it first, then try again." });
      const accessToken = await freshAccessToken("youtube");
      const channelsRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const channels = await channelsRes.json();
      if (channels.error) {
        logDetail("YouTube verification failed", channels.error.message);
        return res.status(502).json({ error: "YouTube could not confirm this connection. Reconnect YouTube and try again." });
      }
      const items = channels.items || [];
      if (!items.length) return res.status(404).json({ error: "This Google account has no YouTube channel yet. Create one, then reconnect." });
      return res.json({
        platform,
        ok: true,
        identity: `${items[0].snippet.title} (${items[0].id})`,
        channels: items.map((c) => ({ id: c.id, title: c.snippet.title })),
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (platform === "threads") {
      const conn = store.threads;
      if (!conn) return res.status(400).json({ error: "Threads is not connected yet. Connect it first, then try again." });
      const accessToken = await freshAccessToken("threads");
      const infoRes = await fetch(
        "https://graph.threads.net/v1.0/me?fields=id,username",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const info = await infoRes.json();
      if (info.error) {
        logDetail("Threads verification failed", info.error.message);
        return res.status(502).json({ error: "Threads could not confirm this connection. Reconnect Threads and try again." });
      }
      return res.json({
        platform,
        ok: true,
        identity: `@${info.username} (${info.id})`,
        checkedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    res.status(404).json({ error: "That platform is not supported." });
  } catch (err) {
    logDetail("connection verification failed", err);
    res.status(502).json({ error: "We could not verify this connection right now. Please try again." });
  }
});
app.post("/api/disconnect/:platform", (req, res) => {
  const platform = req.params.platform;
  if (!["meta", "tiktok", "youtube", "threads", "instagram"].includes(platform)) {
    return res.status(400).json({ error: "That connection type is not supported." });
  }
  const store = loadStore();
  if (platform === "instagram" && store.instagramAccounts) {
    const accountId = req.query.accountId || store.activeInstagramId;
    if (accountId) delete store.instagramAccounts[accountId];
    const remaining = Object.keys(store.instagramAccounts);
    if (accountId === store.activeInstagramId) {
      store.activeInstagramId = remaining[0];
      if (remaining[0]) store.instagram = store.instagramAccounts[remaining[0]];
      else delete store.instagram;
    }
    if (remaining.length === 0) delete store.instagramAccounts;
    saveStore(store);
    return res.json({ disconnected: "instagram", accountId, remaining: remaining.length });
  }
  delete store[platform];
  saveStore(store);
  res.json({ disconnected: platform });
});
app.post("/api/instagram/active", (req, res) => {
  const { accountId } = req.body;
  const store = loadStore();
  const accounts = store.instagramAccounts || {};
  if (!accountId || !accounts[accountId]) {
    return res.status(404).json({ error: "That Instagram account is no longer connected." });
  }
  store.activeInstagramId = accountId;
  store.instagram = accounts[accountId];
  saveStore(store);
  res.json({ active: accountId, accountNames: accounts[accountId].accountNames });
});
var PUBLISH_PLATFORMS = ["instagram", "facebook", "threads", "tiktok", "youtube"];
var PLATFORM_NAMES = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
  tiktok: "TikTok",
  youtube: "YouTube"
};
var PLATFORM_CHAR_LIMITS = {
  instagram: 2200,
  facebook: 63206,
  threads: 500,
  tiktok: 4e3,
  youtube: 5e3
};
var POSTS_FILE = path.join(DATA_DIR, "posts.json");
var LOG_DIR = path.join(DATA_DIR, "logs");
var LOG_FILE = path.join(LOG_DIR, "publish.jsonl");
var MEDIA_SIGNING_FILE = path.join(STORE_DIR, "media-signing.key");
var PUBLIC_MEDIA_TTL_MS = 6 * 60 * 60 * 1e3;
var RETRY_BACKOFF_MS = [2 * 6e4, 10 * 6e4, 30 * 6e4];
function loadPosts() {
  try {
    const parsed = JSON.parse(fs.readFileSync(POSTS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === "string") : [];
  } catch {
    return [];
  }
}
function savePosts(posts) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${POSTS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(posts, null, 2));
  fs.renameSync(tmp, POSTS_FILE);
}
function upsertStoredPost(next) {
  const posts = loadPosts();
  const i = posts.findIndex((p) => p.id === next.id);
  if (i >= 0) posts[i] = next;
  else posts.unshift(next);
  savePosts(posts);
  return next;
}
function getStoredPost(id) {
  return loadPosts().find((p) => p.id === id);
}
function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
function computePublishAt(date, time) {
  const d = typeof date === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  const t = typeof time === "string" ? /^(\d{1,2}):(\d{2})$/.exec(time) : null;
  if (!d || !t) return null;
  const dt = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function logPublish(event, fields = {}) {
  const line = { ts: (/* @__PURE__ */ new Date()).toISOString(), event, ...fields };
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(line)}
`);
  } catch (err) {
    logDetail("publish log write failed", err);
  }
  const error = typeof line.error === "string" ? ` \u2014 ${line.error}` : "";
  console.log(`[relate-publish] ${line.ts} ${event} ${line.postId || "-"} ${line.platform || "-"}${error}`);
}
function readPublishLog(limit, postId) {
  let raw;
  try {
    raw = fs.readFileSync(LOG_FILE, "utf8");
  } catch {
    return [];
  }
  const lines = raw.split("\n").filter(Boolean);
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (!postId || entry.postId === postId) out.push(entry);
    } catch {
    }
  }
  return out;
}
function publicBaseUrl() {
  const raw = process.env.PUBLIC_MEDIA_BASE_URL || "";
  const candidate = raw || APP_BASE;
  if (!/^https?:\/\//i.test(candidate)) return null;
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(candidate)) return null;
  return candidate.replace(/\/+$/, "");
}
var signingKey = null;
function getSigningKey() {
  if (signingKey) return signingKey;
  try {
    const existing = Buffer.from(fs.readFileSync(MEDIA_SIGNING_FILE, "utf8").trim(), "hex");
    if (existing.length === 32) {
      signingKey = existing;
      return signingKey;
    }
  } catch {
  }
  signingKey = crypto.randomBytes(32);
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(MEDIA_SIGNING_FILE, signingKey.toString("hex"), { mode: 384 });
  return signingKey;
}
function publicMediaToken(ref) {
  const payload = { k: ref.kind, d: ref.date, n: ref.path, r: ref.rootId, e: Date.now() + PUBLIC_MEDIA_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", getSigningKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function readPublicMediaToken(token) {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return { ok: false, error: "That media link is not valid." };
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", getSigningKey()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, error: "That media link failed its signature check." };
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, error: "That media link is not valid." };
  }
  if (!payload.e || payload.e < Date.now()) return { ok: false, error: "That media link has expired." };
  return { ok: true, ref: { kind: payload.k, name: payload.n || "media", type: "", size: 0, date: payload.d, path: payload.n, rootId: payload.r } };
}
function resolveMediaRef(item) {
  const name = typeof item?.name === "string" ? item.name : "media";
  const type = typeof item?.type === "string" ? item.type : "";
  const size = Number(item?.size) || 0;
  const url = typeof item?.url === "string" ? item.url : "";
  const fromFields = (date, fileName) => {
    if (!safeFolder(date) || typeof fileName !== "string") return null;
    const safe = safeFileName(fileName);
    if (!safe) return null;
    const abs = resolveInMediaDir(date, safe);
    return abs && fs.existsSync(abs) ? { date, path: safe, abs } : null;
  };
  const direct = fromFields(item?.folderDate, name);
  const fromUrl = /^\/api\/storage\/media\/file\?/.test(url) ? new URL(url, "http://local") : null;
  const viaUrl = fromUrl?.searchParams ? fromFields(fromUrl.searchParams.get("date"), fromUrl.searchParams.get("name")) : null;
  const hit = direct || viaUrl;
  if (hit) {
    return {
      kind: "media",
      name,
      type: type || MEDIA_MIME[path.extname(hit.abs).toLowerCase()] || "application/octet-stream",
      size: size || fs.statSync(hit.abs).size,
      date: hit.date,
      path: hit.path
    };
  }
  const libraryRel = typeof item?.libraryPath === "string" ? item.libraryPath : null;
  let rootId = typeof item?.libraryRootId === "string" ? item.libraryRootId : "";
  if (!rootId && typeof item?.id === "string") rootId = /^library:([^/]+)\//.exec(item.id)?.[1] || "";
  const libUrl = /^\/api\/library\/file\?/.test(url) ? new URL(url, "http://local") : null;
  if (!rootId && libUrl) rootId = libUrl.searchParams.get("root") || "";
  const relPath = libraryRel || (libUrl ? libUrl.searchParams.get("path") : null);
  if (rootId && relPath) {
    const root = rootById(rootId);
    if (root) {
      const abs = resolveInRoot(root, relPath);
      if (abs && fs.existsSync(abs)) {
        return {
          kind: "library",
          name,
          type: type || libraryMime(path.basename(relPath)) || "application/octet-stream",
          size: size || fs.statSync(abs).size,
          rootId: root.id,
          path: relPath
        };
      }
    }
  }
  if (/^https:\/\//i.test(url)) return { kind: "remote", name, type, size, url };
  return { kind: "missing", name, type, size };
}
function postMediaRefs(post) {
  return (post.media || []).map(resolveMediaRef);
}
function publicUrlForRef(ref) {
  if (ref.kind === "remote") return { url: ref.url };
  if (ref.kind === "missing") return { error: `"${ref.name}" is not in shared media storage, so the platform cannot download it.` };
  if (ref.kind !== "media" && ref.kind !== "library") return { error: `"${ref.name}" cannot be served publicly.` };
  const base = publicBaseUrl();
  if (!base) {
    return {
      error: "No public web address is configured. Instagram and Threads download the file themselves, so set PUBLIC_MEDIA_BASE_URL (or a non-localhost APP_URL) to your tunnel or domain."
    };
  }
  return { url: `${base}/api/public-media/${publicMediaToken(ref)}` };
}
function absForRef(ref) {
  if (ref.kind === "media" && ref.date && ref.path) return resolveInMediaDir(ref.date, ref.path);
  if (ref.kind === "library" && ref.rootId && ref.path) {
    const root = rootById(ref.rootId);
    return root ? resolveInRoot(root, ref.path) : null;
  }
  return null;
}
function servePublicMedia(req, res) {
  const parsed = readPublicMediaToken(String(req.params.token || ""));
  if (!parsed.ok) return res.status(403).json({ error: parsed.error });
  const ref = parsed.ref;
  const abs = absForRef(ref);
  if (!abs) return res.status(400).json({ error: "That media link is not valid." });
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: "That file could not be found." });
  }
  if (!st.isFile()) return res.status(404).json({ error: "That file could not be found." });
  const mime = MEDIA_MIME[path.extname(abs).toLowerCase()] || libraryMime(path.basename(abs)) || "application/octet-stream";
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(path.basename(abs))}"`);
  res.setHeader("Cache-Control", "public, max-age=300");
  streamFileWithRange(req, res, abs, mime, st);
}
app.get("/api/public-media/:token", servePublicMedia);
app.head("/api/public-media/:token", servePublicMedia);
async function probePublicMediaUrl(url) {
  try {
    const res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0", "User-Agent": "relate-social-preflight/1.0" }, redirect: "follow" });
    if (res.status === 200 || res.status === 206) {
      await res.body?.cancel?.();
      return { ok: true, status: res.status };
    }
    await res.body?.cancel?.();
    return {
      ok: false,
      status: res.status,
      error: res.status === 530 ? `your public address is not reachable right now (Cloudflare error ${res.status}: the tunnel is down \u2014 restart it and retry)` : `your public address returned HTTP ${res.status}`
    };
  } catch (err) {
    return { ok: false, error: `your public address could not be reached (${err?.message || "network error"})` };
  }
}
async function readyPublicUrls(refs) {
  const base = publicBaseUrl();
  const urls = [];
  const problems = [];
  for (const ref of refs) {
    const { url, error } = publicUrlForRef(ref);
    if (!url) {
      problems.push(error || `"${ref.name}" has no public URL.`);
      continue;
    }
    if (base && url.startsWith(base)) {
      const probe = await probePublicMediaUrl(url);
      if (!probe.ok) {
        problems.push(`"${ref.name}" cannot be downloaded by the platform: ${probe.error}`);
        logPublish("media-probe-failed", { host: base, file: ref.name, status: probe.status, error: probe.error });
        continue;
      }
    }
    urls.push(url);
  }
  if (problems.length) throw new Error(problems.join(" "));
  return urls;
}
function buildCaption(post, platform) {
  const override = post.platformOverrides?.[platform];
  const caption = typeof override?.caption === "string" ? override.caption : post.baseCaption;
  const tags = Array.isArray(override?.hashtags) ? override.hashtags : post.baseHashtags || [];
  const cleanedTags = tags.filter((t) => typeof t === "string" && t.trim().length > 1);
  const body = (caption || "").trim();
  const text = body && cleanedTags.length ? `${body}

${cleanedTags.join(" ")}` : body || cleanedTags.join(" ");
  const limit = PLATFORM_CHAR_LIMITS[platform];
  if (text.length > limit) {
    throw new Error(`${PLATFORM_NAMES[platform]} allows ${limit} characters; this caption is ${text.length}. Shorten the caption or hashtags.`);
  }
  return text;
}
async function graphPostForm(url, params, scope = "graph") {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const json = await res.json().catch(() => ({}));
  if (json.error) {
    const e = json.error;
    const detail = [
      e.code ? `code ${e.code}` : "",
      e.error_subcode ? `subcode ${e.error_subcode}` : "",
      e.error_data && Object.keys(e.error_data).length ? `data ${JSON.stringify(e.error_data)}` : "",
      e.fbtrace_id ? `trace ${e.fbtrace_id}` : ""
    ].filter(Boolean).join(" | ");
    logPublish("provider-error", {
      scope,
      endpoint: url.replace(/\d{8,}/g, ":id"),
      httpStatus: res.status,
      error: e.message,
      detail
    });
    throw new Error(`${e.message || "The platform rejected the request."}${detail ? ` (${detail})` : ""}`);
  }
  return json;
}
async function graphDelete(url) {
  const res = await fetch(url, { method: "DELETE" });
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new Error(json.error?.message || "The platform could not delete this post.");
  return json;
}
async function graphRead(url) {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new Error(json.error?.message || "The platform did not answer this request.");
  return json;
}
async function readPermalink(url, attempts = 4) {
  let lastError;
  let returnedFields;
  for (let i = 0; i < attempts; i++) {
    try {
      const json = await graphRead(url);
      if (json.permalink) return json.permalink;
      returnedFields = Object.keys(json).join(",") || "(empty)";
    } catch (err) {
      lastError = err?.message || String(err);
    }
    if (i < attempts - 1) await sleep(2500);
  }
  logPublish("permalink-unavailable", {
    endpoint: url.split("?")[0].replace(/\d{8,}/g, ":id"),
    error: lastError,
    returnedFields
  });
  return void 0;
}
async function instagramTokenFor(conn) {
  if (!needsRefresh(conn)) return conn.accessToken;
  const res = await fetch(
    `https://graph.instagram.com/access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(conn.accessToken)}`
  );
  const next = await res.json();
  if (next.error || next.error_message || !next.access_token) {
    logDetail("Instagram token refresh failed", next.error_message || next.error?.message);
    throw new Error("We could not renew your Instagram session. Reconnect Instagram to continue.");
  }
  conn.accessToken = next.access_token;
  conn.expiresAt = Date.now() + (next.expires_in ? next.expires_in * 1e3 : 3600 * 1e3);
  const store = loadStore();
  store.instagramAccounts = { ...store.instagramAccounts || {}, [conn.accountIds[0]]: conn };
  if (!store.instagram || store.activeInstagramId === conn.accountIds[0]) store.instagram = conn;
  saveStore(store);
  return conn.accessToken;
}
async function resolveInstagramTarget(post) {
  const store = loadStore();
  const wanted = post.platformAccounts?.instagram;
  const accounts = store.instagramAccounts || {};
  const conn = wanted && accounts[wanted] || store.activeInstagramId && accounts[store.activeInstagramId] || store.instagram;
  if (conn?.accountIds?.[0]) {
    return {
      igUserId: conn.accountIds[0],
      token: await instagramTokenFor(conn),
      accountName: conn.accountNames[0] || conn.accountIds[0],
      via: "Instagram Login"
    };
  }
  if (store.meta?.metaPages?.length) {
    const page = store.meta.metaPages.find((p) => p.instagramId && (!wanted || p.instagramId === wanted));
    if (page) {
      return {
        igUserId: page.instagramId,
        token: page.accessToken,
        accountName: page.instagramUsername ? `@${page.instagramUsername}` : page.name,
        via: `Instagram via Page "${page.name}"`
      };
    }
  }
  throw new Error("Instagram is not connected on this machine yet. Connect it in Platform API settings first.");
}
async function waitInstagramContainer(containerId, token, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let status = "";
  while (Date.now() < deadline) {
    const info = await graphRead(
      `https://graph.instagram.com/${GRAPH_VERSION}/${containerId}?fields=status_code,error_message&access_token=${encodeURIComponent(token)}`
    );
    status = info.status_code || "";
    if (status === "FINISHED") return;
    if (status === "ERROR") throw new Error(info.error_message || "Instagram could not process this media.");
    await sleep(3e3);
  }
  throw new Error(`Instagram was still processing this media after ${Math.round(timeoutMs / 1e3)}s (status: ${status || "unknown"}).`);
}
async function publishInstagram(post) {
  const started = Date.now();
  const target = await resolveInstagramTarget(post);
  const override = post.platformOverrides?.instagram;
  const format = override?.format || post.format;
  const caption = buildCaption(post, "instagram");
  const refs = postMediaRefs(post);
  if (!refs.length) throw new Error("This post has no media attached, so there is nothing to publish to Instagram.");
  const urls = await readyPublicUrls(refs);
  const media = async (params, timeoutMs) => {
    const created = await graphPostForm(`https://graph.instagram.com/${GRAPH_VERSION}/${target.igUserId}/media`, {
      access_token: target.token,
      ...params
    }, "instagram/create-container");
    if (!created.id) throw new Error("Instagram did not return a media container id.");
    await waitInstagramContainer(created.id, target.token, timeoutMs);
    return created.id;
  };
  const imageTimeout = 9e4;
  const videoTimeout = Number(process.env.PUBLISH_VIDEO_TIMEOUT_MS || 3e5);
  let containerId;
  if (format === "carousel") {
    if (urls.length < 2) throw new Error("An Instagram carousel needs at least 2 files; this post has one.");
    if (urls.length > 10) throw new Error(`An Instagram carousel holds at most 10 files; this post has ${urls.length}.`);
    const children = [];
    for (let i = 0; i < refs.length; i++) {
      const isVideo = refs[i].type.startsWith("video/");
      children.push(
        await media(
          {
            is_carousel_item: "true",
            ...isVideo ? { media_type: "VIDEO", video_url: urls[i] } : { media_type: "IMAGE", image_url: urls[i] }
          },
          isVideo ? videoTimeout : imageTimeout
        )
      );
      logPublish("carousel-child-ready", { postId: post.id, platform: "instagram", containerId: children[children.length - 1], index: i });
    }
    containerId = await media({ media_type: "CAROUSEL", caption, children: children.join(",") }, imageTimeout);
  } else if (format === "video") {
    const videoRef = refs.find((r) => r.type.startsWith("video/"));
    if (!videoRef) throw new Error("This post is set to Reel but none of the attached files is a video.");
    const index = refs.indexOf(videoRef);
    containerId = await media({ media_type: "REELS", caption, video_url: urls[index] }, videoTimeout);
  } else {
    const imageRef = refs.find((r) => !r.type.startsWith("video/"));
    if (!imageRef) throw new Error("This post is set to Feed Post but none of the attached files is an image. Switch the Instagram format to Reel or Carousel.");
    const index = refs.indexOf(imageRef);
    containerId = await media({ media_type: "IMAGE", caption, image_url: urls[index] }, imageTimeout);
  }
  logPublish("container-finished", { postId: post.id, platform: "instagram", containerId });
  const published = await graphPostForm(`https://graph.instagram.com/${GRAPH_VERSION}/${target.igUserId}/media_publish`, {
    creation_id: containerId,
    access_token: target.token
  }, "instagram/media_publish");
  if (!published.id) throw new Error("Instagram accepted the publish call but returned no media id.");
  const permalink = await readPermalink(
    `https://graph.instagram.com/${GRAPH_VERSION}/${published.id}?fields=permalink&access_token=${encodeURIComponent(target.token)}`
  );
  return {
    status: "success",
    attemptedAt: (/* @__PURE__ */ new Date()).toISOString(),
    platformPostId: published.id,
    containerId,
    permalink,
    profileUrl: target.accountName ? `https://www.instagram.com/${target.accountName.replace(/^@/, "")}` : void 0,
    via: `${target.via} ${target.accountName}`,
    durationMs: Date.now() - started
  };
}
async function deleteInstagramMedia(post, result) {
  if (!result.platformPostId) throw new Error("There is no Instagram media id recorded for this post, so it cannot be deleted through the API.");
  const target = await resolveInstagramTarget(post);
  if (target.via.startsWith("Instagram Login")) {
    throw new Error(
      "Instagram deleted through the API only works when the account is connected via a Facebook Page. This connection uses Instagram Login, so remove the post in the Instagram app instead."
    );
  }
  const res = await graphDelete(
    `https://graph.instagram.com/${GRAPH_VERSION}/${target.igUserId}/media?media_id=${encodeURIComponent(result.platformPostId)}&access_token=${encodeURIComponent(target.token)}`
  );
  if (res.success !== true) throw new Error("Instagram reported the delete request but did not confirm removal.");
}
async function waitThreadsContainer(containerId, token, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  let supported = true;
  while (Date.now() < deadline) {
    let info;
    try {
      info = await graphRead(
        `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(token)}`
      );
    } catch (err) {
      if (/nonexisting field|unsupported get request/i.test(err?.message || "")) {
        supported = false;
        logDetail("Threads container status unavailable", err);
        return;
      }
      throw err;
    }
    last = String(info.status || "").toUpperCase();
    if (last === "FINISHED" || last === "PUBLISHED" || !last) return;
    if (last === "ERROR" || last === "EXPIRED") {
      throw new Error(info.error_message || `Threads could not process this media (${last.toLowerCase()}).`);
    }
    await sleep(2500);
  }
  if (supported) {
    throw new Error(`Threads was still processing this media after ${Math.round(timeoutMs / 1e3)}s (status: ${last || "unknown"}).`);
  }
}
async function publishThreads(post) {
  const started = Date.now();
  const store = loadStore();
  const conn = store.threads;
  if (!conn?.accountIds?.[0]) throw new Error("Threads is not connected on this machine yet. Connect it in Platform API settings first.");
  const token = await freshAccessToken("threads");
  const userId = conn.accountIds[0];
  const override = post.platformOverrides?.threads;
  const format = override?.format || post.format;
  const text = buildCaption(post, "threads");
  const refs = postMediaRefs(post);
  const urls = await readyPublicUrls(refs);
  const containerBase = `https://graph.threads.net/v1.0/${userId}/threads`;
  const videoTimeout = Number(process.env.PUBLISH_VIDEO_TIMEOUT_MS || 3e5);
  const createContainer = async (params, scope, timeoutMs) => {
    const created = await graphPostForm(containerBase, { access_token: token, ...params }, scope);
    if (!created.id) throw new Error("Threads did not return a container id.");
    await waitThreadsContainer(created.id, token, timeoutMs);
    return created.id;
  };
  let containerId;
  if (format === "carousel") {
    if (urls.length < 2) throw new Error("A Threads carousel needs at least 2 files.");
    if (refs.length > 20) throw new Error(`A Threads carousel holds at most 20 files; this post has ${refs.length}.`);
    const children = [];
    for (let i = 0; i < refs.length; i++) {
      const isVideo = refs[i].type.startsWith("video/");
      children.push(
        await createContainer(
          {
            is_carousel_item: "true",
            media_type: isVideo ? "VIDEO" : "IMAGE",
            ...isVideo ? { video_url: urls[i] } : { image_url: urls[i] }
          },
          "threads/create-child",
          isVideo ? videoTimeout : 9e4
        )
      );
    }
    containerId = await createContainer({ media_type: "CAROUSEL", children: children.join(","), text }, "threads/create-carousel", 9e4);
  } else if (format === "video") {
    const videoRef = refs.find((r) => r.type.startsWith("video/"));
    if (!videoRef) throw new Error("This post is set to Video Thread but no video file is attached.");
    containerId = await createContainer(
      { media_type: "VIDEO", video_url: urls[refs.indexOf(videoRef)], text },
      "threads/create-video",
      videoTimeout
    );
  } else {
    const imageRef = refs.find((r) => !r.type.startsWith("video/"));
    if (!imageRef) throw new Error("This post is set to Photo Thread but no image file is attached.");
    containerId = await createContainer({ media_type: "IMAGE", image_url: urls[refs.indexOf(imageRef)], text }, "threads/create-image", 9e4);
  }
  const published = await graphPostForm(`${containerBase}_publish`, { access_token: token, creation_id: containerId }, "threads/publish");
  if (!published.id) throw new Error("Threads accepted the publish call but returned no thread id.");
  const permalink = await readPermalink(
    `https://graph.threads.net/v1.0/${published.id}?fields=permalink&access_token=${encodeURIComponent(token)}`,
    2
  );
  const handle = (conn.accountNames[0] || "").replace(/^@/, "");
  return {
    status: "success",
    attemptedAt: (/* @__PURE__ */ new Date()).toISOString(),
    platformPostId: published.id,
    containerId,
    permalink,
    profileUrl: handle ? `https://www.threads.net/@${handle}` : void 0,
    via: `Threads ${conn.accountNames[0] || userId}`,
    durationMs: Date.now() - started
  };
}
async function deleteThreadsPost(result) {
  const store = loadStore();
  const conn = store.threads;
  if (!conn?.accountIds?.[0]) throw new Error("Threads is not connected on this machine anymore.");
  if (!result.platformPostId) throw new Error("There is no Threads post id recorded for this post.");
  if (!conn.scopes?.includes("threads_delete")) {
    throw new Error("Deleting a thread needs the threads_delete permission, which this connection does not have yet. Reconnect Threads in API Connections (and enable the permission on the Meta app if asked), then retry.");
  }
  const token = await freshAccessToken("threads");
  await graphDelete(`https://graph.threads.net/v1.0/${encodeURIComponent(result.platformPostId)}?access_token=${encodeURIComponent(token)}`);
}
var SUPPORTED_PUBLISH = ["instagram", "threads"];
var inFlight = /* @__PURE__ */ new Set();
async function publishOnePlatform(post, platform) {
  if (!SUPPORTED_PUBLISH.includes(platform)) {
    return {
      status: "skipped",
      attemptedAt: (/* @__PURE__ */ new Date()).toISOString(),
      error: `Publishing to ${PLATFORM_NAMES[platform]} is not implemented in this build, so nothing was sent there.`
    };
  }
  try {
    return platform === "instagram" ? await publishInstagram(post) : await publishThreads(post);
  } catch (err) {
    const message = err?.message ? String(err.message) : "unknown error";
    logDetail(`publish to ${platform} failed`, message);
    return { status: "failed", attemptedAt: (/* @__PURE__ */ new Date()).toISOString(), error: message };
  }
}
function finalizeStatus(post) {
  const results = post.results || {};
  const attempted = post.platforms.filter((p) => results[p]);
  const succeeded = attempted.filter((p) => results[p].status === "success");
  const skipped = attempted.filter((p) => results[p].status === "skipped");
  const failed = attempted.filter((p) => results[p].status === "failed");
  const sentSomewhere = succeeded.length > 0;
  if (failed.length === 0 && succeeded.length === post.platforms.length) {
    post.status = "published";
    post.publishedAt = post.publishedAt || (/* @__PURE__ */ new Date()).toISOString();
    post.lastError = void 0;
    post.nextTryAt = void 0;
  } else if (sentSomewhere && failed.length) {
    post.status = "partial";
    post.lastError = failed.map((p) => `${PLATFORM_NAMES[p]}: ${results[p].error}`).join(" | ");
  } else if (failed.length) {
    post.status = "failed";
    post.lastError = failed.map((p) => `${PLATFORM_NAMES[p]}: ${results[p].error}`).join(" | ");
  } else {
    post.status = skipped.length === post.platforms.length ? "failed" : "partial";
    post.lastError = skipped.map((p) => `${PLATFORM_NAMES[p]}: ${results[p].error || "not sent"}`).join(" | ");
  }
  return post;
}
async function publishPost(postId, trigger) {
  if (inFlight.has(postId)) {
    logPublish("publish-skipped-busy", { postId, trigger });
    return getStoredPost(postId) || null;
  }
  const initial = getStoredPost(postId);
  if (!initial) return null;
  inFlight.add(postId);
  let post = { ...initial, status: "publishing", startedAt: (/* @__PURE__ */ new Date()).toISOString(), attempts: (initial.attempts || 0) + 1, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
  upsertStoredPost(post);
  logPublish("publish-start", { postId, trigger, platforms: post.platforms, attempt: post.attempts, format: post.format, files: postMediaRefs(post).map((r) => `${r.kind}:${r.name}`) });
  const results = { ...post.results || {} };
  try {
    for (const platform of post.platforms) {
      if (results[platform]?.status === "success") {
        logPublish("platform-already-published", { postId, platform, platformPostId: results[platform].platformPostId });
        continue;
      }
      const current = getStoredPost(postId);
      current.results = results;
      const result = await publishOnePlatform(current, platform);
      results[platform] = result;
      post = { ...post, results: { ...results } };
      upsertStoredPost(post);
      logPublish(result.status === "success" ? "platform-success" : "platform-failed", {
        postId,
        platform,
        status: result.status,
        platformPostId: result.platformPostId,
        permalink: result.permalink,
        via: result.via,
        durationMs: result.durationMs,
        error: result.error
      });
    }
  } finally {
    inFlight.delete(postId);
  }
  post = finalizeStatus({ ...post, startedAt: void 0 });
  const failures = post.platforms.filter((p) => post.results?.[p]?.status === "failed");
  if (failures.length && post.attempts < 3 && (post.status === "failed" || post.status === "partial")) {
    post.nextTryAt = new Date(Date.now() + RETRY_BACKOFF_MS[Math.min(post.attempts - 1, RETRY_BACKOFF_MS.length - 1)]).toISOString();
  } else {
    post.nextTryAt = void 0;
  }
  upsertStoredPost(post);
  logPublish("publish-finish", { postId, status: post.status, attempts: post.attempts, nextTryAt: post.nextTryAt, error: post.lastError });
  return post;
}
async function removeFromPlatforms(postId) {
  const post = getStoredPost(postId);
  if (!post) throw new Error("That post is no longer in the schedule.");
  const results = { ...post.results || {} };
  const problems = [];
  for (const platform of post.platforms) {
    const result = results[platform];
    if (!result || result.status !== "success" || !result.platformPostId) continue;
    try {
      if (platform === "instagram") await deleteInstagramMedia(post, result);
      else if (platform === "threads") await deleteThreadsPost(result);
      else throw new Error(`${PLATFORM_NAMES[platform]} cannot be deleted through this app.`);
      results[platform] = { ...result, deletedAt: (/* @__PURE__ */ new Date()).toISOString(), status: "skipped", error: "Removed from the platform.", permalink: void 0 };
      logPublish("platform-deleted", { postId, platform, platformPostId: result.platformPostId });
    } catch (err) {
      problems.push(`${PLATFORM_NAMES[platform]}: ${err?.message || "delete failed"}`);
      logPublish("platform-delete-failed", { postId, platform, error: err?.message });
    }
  }
  const next = {
    ...post,
    results,
    status: problems.length ? post.status : "draft",
    deletedAt: problems.length ? post.deletedAt : (/* @__PURE__ */ new Date()).toISOString(),
    lastError: problems.length ? problems.join(" | ") : void 0,
    nextTryAt: void 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  return upsertStoredPost(next);
}
var SCHEDULE_TICK_MS = Number(process.env.SCHEDULE_TICK_SECONDS || 20) * 1e3;
var SCHEDULE_GRACE_MS = Number(process.env.SCHEDULE_GRACE_MINUTES || 120) * 6e4;
var PUBLISH_MAX_ATTEMPTS = Number(process.env.PUBLISH_MAX_ATTEMPTS || 3);
var STALE_PUBLISHING_MS = 10 * 6e4;
var schedulerTimer = null;
var schedulerRunning = false;
function duePosts(now) {
  const out = [];
  for (const post of loadPosts()) {
    if (post.status === "draft") continue;
    const dueAt = Date.parse(post.publishAt);
    if (Number.isNaN(dueAt)) continue;
    const lateMs = now - dueAt;
    if (post.status === "publishing") {
      const startedAt = Date.parse(post.startedAt || "");
      if (Number.isNaN(startedAt) || now - startedAt > STALE_PUBLISHING_MS) out.push({ post, lateMs });
      continue;
    }
    if (post.status === "scheduled") {
      if (lateMs >= 0) out.push({ post, lateMs });
      continue;
    }
    if ((post.status === "failed" || post.status === "partial") && post.nextTryAt && now >= Date.parse(post.nextTryAt) && post.attempts < PUBLISH_MAX_ATTEMPTS) {
      out.push({ post, lateMs });
    }
  }
  return out;
}
async function schedulerTick() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  const now = Date.now();
  try {
    for (const { post, lateMs } of duePosts(now)) {
      if (inFlight.has(post.id)) continue;
      if (post.status === "scheduled" && lateMs > SCHEDULE_GRACE_MS) {
        const lateMinutes = Math.round(lateMs / 6e4);
        upsertStoredPost({
          ...post,
          status: "failed",
          lastError: `Scheduled window passed \u2014 the app was offline ${lateMinutes} minutes past ${post.scheduledTime}, so publishing was skipped. Press Publish to send it now.`,
          nextTryAt: void 0,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        logPublish("missed-window", { postId: post.id, lateMs, graceMs: SCHEDULE_GRACE_MS });
        continue;
      }
      await publishPost(post.id, post.attempts > 0 ? "retry" : "scheduler");
    }
  } catch (err) {
    logDetail("scheduler tick failed", err);
    logPublish("scheduler-error", { error: err instanceof Error ? err.message : String(err) });
  } finally {
    schedulerRunning = false;
  }
}
function startScheduler() {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => void schedulerTick(), SCHEDULE_TICK_MS);
  setTimeout(() => void schedulerTick(), 4e3);
  logPublish("scheduler-start", {
    tickSeconds: SCHEDULE_TICK_MS / 1e3,
    graceMinutes: SCHEDULE_GRACE_MS / 6e4,
    maxAttempts: PUBLISH_MAX_ATTEMPTS,
    timezone: localZone(),
    supported: SUPPORTED_PUBLISH
  });
}
function sanitizeIncomingPost(body, existing) {
  const id = typeof body?.id === "string" ? body.id.slice(0, 64) : "";
  if (!/^[A-Za-z0-9_.:-]{4,64}$/.test(id)) return { error: "That post id is not valid." };
  if (!Array.isArray(body?.platforms) || !body.platforms.length) return { error: "Choose at least one channel." };
  const platforms = body.platforms.filter((p) => PUBLISH_PLATFORMS.includes(p));
  if (!platforms.length) return { error: "None of the selected channels is supported." };
  const publishAt = computePublishAt(body?.scheduledDate, body?.scheduledTime);
  if (!publishAt) return { error: "Scheduled date and time must read as YYYY-MM-DD and HH:mm." };
  const media = (Array.isArray(body?.media) ? body.media : []).slice(0, 20).map((item) => ({
    id: typeof item?.id === "string" ? item.id.slice(0, 300) : "",
    name: typeof item?.name === "string" ? item.name.slice(0, 200) : "media",
    type: typeof item?.type === "string" ? item.type : "",
    size: Number(item?.size) || 0,
    url: typeof item?.url === "string" && item.url.length < 4e3 ? item.url : "",
    folderDate: safeFolder(item?.folderDate) || void 0,
    libraryPath: typeof item?.libraryPath === "string" ? item.libraryPath.slice(0, 500) : void 0,
    libraryRoot: typeof item?.libraryRoot === "string" ? item.libraryRoot.slice(0, 200) : void 0,
    libraryRootId: typeof item?.libraryRootId === "string" ? item.libraryRootId.slice(0, 80) : void 0,
    duration: Number(item?.duration) || void 0
  }));
  const status = body?.status === "draft" ? "draft" : "scheduled";
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const post = {
    id,
    title: typeof body?.title === "string" ? body.title.slice(0, 200) : "Untitled Social Campaign",
    campaignName: typeof body?.campaignName === "string" ? body.campaignName.slice(0, 200) : void 0,
    scheduledDate: String(body.scheduledDate),
    scheduledTime: String(body.scheduledTime),
    platforms,
    format: ["image", "video", "carousel"].includes(body?.format) ? body.format : "image",
    media,
    baseCaption: typeof body?.baseCaption === "string" ? body.baseCaption.slice(0, 2e4) : "",
    baseHashtags: (Array.isArray(body?.baseHashtags) ? body.baseHashtags : []).filter((t) => typeof t === "string").map((t) => t.slice(0, 100)),
    platformOverrides: body?.platformOverrides && typeof body.platformOverrides === "object" ? body.platformOverrides : {},
    platformAccounts: body?.platformAccounts && typeof body.platformAccounts === "object" ? body.platformAccounts : existing?.platformAccounts,
    status,
    createdAt: existing?.createdAt || (typeof body?.createdAt === "string" ? body.createdAt : now),
    updatedAt: now,
    publishAt,
    timezone: localZone(),
    results: existing?.results,
    // An edit means the human took control: clear the retry timer, and give a
    // previously failed post its full attempt budget back.
    attempts: existing && ["failed", "partial"].includes(existing.status) && status === "scheduled" ? 0 : existing?.attempts || 0,
    nextTryAt: void 0,
    lastError: existing?.lastError,
    publishedAt: existing?.publishedAt,
    deletedAt: existing?.deletedAt
  };
  return { post };
}
function postWithDiagnostics(post) {
  const refs = postMediaRefs(post);
  const warnings = [];
  for (const ref of refs) {
    if (ref.kind === "missing") warnings.push(`"${ref.name}" is not in shared media storage \u2014 re-upload it or pick it from the media library before publishing.`);
  }
  if (!refs.length) warnings.push("No media attached \u2014 Instagram and Threads need at least one file.");
  if (!publicBaseUrl()) warnings.push("No public web address configured \u2014 set PUBLIC_MEDIA_BASE_URL or APP_URL to your tunnel/domain.");
  for (const platform of post.platforms) {
    try {
      buildCaption(post, platform);
    } catch (err) {
      warnings.push(err?.message || `${PLATFORM_NAMES[platform]} caption is too long.`);
    }
    if (!SUPPORTED_PUBLISH.includes(platform)) warnings.push(`${PLATFORM_NAMES[platform]} is scheduled but not sent by this build.`);
  }
  return { ...post, mediaRefs: refs.map((r) => ({ name: r.name, kind: r.kind })), warnings };
}
app.get("/api/posts", (_req, res) => {
  const posts = loadPosts().map(postWithDiagnostics);
  res.json({ posts, timezone: localZone(), serverTime: (/* @__PURE__ */ new Date()).toISOString(), scheduler: { tickSeconds: SCHEDULE_TICK_MS / 1e3, graceMinutes: SCHEDULE_GRACE_MS / 6e4, maxAttempts: PUBLISH_MAX_ATTEMPTS, supported: SUPPORTED_PUBLISH } });
});
app.get("/api/posts/:id", (req, res) => {
  const post = getStoredPost(req.params.id);
  if (!post) return res.status(404).json({ error: "That post is no longer in the schedule." });
  res.json(postWithDiagnostics(post));
});
app.put("/api/posts/:id", (req, res) => {
  const existing = getStoredPost(req.params.id);
  const { post, error } = sanitizeIncomingPost(req.body, existing);
  if (!post) return res.status(400).json({ error });
  const saved = upsertStoredPost(post);
  logPublish(existing ? "post-updated" : "post-created", {
    postId: saved.id,
    status: saved.status,
    publishAt: saved.publishAt,
    platforms: saved.platforms,
    warnings: postWithDiagnostics(saved).warnings
  });
  res.json(postWithDiagnostics(saved));
});
app.post("/api/posts/sync", (req, res) => {
  const incoming = Array.isArray(req.body?.posts) ? req.body.posts : [];
  const known = new Set(loadPosts().map((p) => p.id));
  const imported = [];
  const skipped = [];
  for (const body of incoming) {
    const { post, error } = sanitizeIncomingPost(body, getStoredPost(body?.id));
    if (!post) {
      skipped.push(`${body?.id || "unknown"}: ${error}`);
      continue;
    }
    if (known.has(post.id)) continue;
    imported.push(upsertStoredPost(post));
  }
  logPublish("posts-imported", { count: imported.length, skipped: skipped.length });
  res.json({ imported: imported.map((p) => p.id), skipped, posts: loadPosts().map(postWithDiagnostics) });
});
app.delete("/api/posts/:id", (req, res) => {
  const post = getStoredPost(req.params.id);
  if (!post) return res.status(404).json({ error: "That post is no longer in the schedule." });
  const live = Object.entries(post.results || {}).filter(([, r]) => r.status === "success" && !r.deletedAt);
  savePosts(loadPosts().filter((p) => p.id !== post.id));
  logPublish("post-removed", { postId: post.id, liveOnPlatforms: live.map(([p]) => p) });
  res.json({
    removed: post.id,
    stillLiveOn: live.map(([platform, r]) => ({ platform, permalink: r.permalink, platformPostId: r.platformPostId })),
    note: live.length ? "Removing the schedule does not delete what is already live on the platforms. Use Remove from platforms first." : void 0
  });
});
async function validatePost(post) {
  const checks = [];
  const refs = postMediaRefs(post);
  const missing = refs.filter((r) => r.kind === "missing");
  checks.push({
    label: "Media files",
    ok: refs.length > 0 && missing.length === 0,
    detail: refs.length ? missing.length ? `${missing.length} of ${refs.length} file(s) are not on shared storage: ${missing.map((m) => m.name).join(", ")}` : `${refs.length} file(s) ready (${refs.map((r) => r.kind).join(", ")})` : "No media attached."
  });
  const urls = [];
  let urlCheckOk = refs.length > 0 && missing.length === 0;
  let urlDetail = "No media to serve.";
  for (const ref of refs) {
    const { url, error } = publicUrlForRef(ref);
    if (!url) {
      urlCheckOk = false;
      urlDetail = error || "No public URL.";
      break;
    }
    urls.push(url);
    if (publicBaseUrl() && url.startsWith(publicBaseUrl())) {
      const probe = await probePublicMediaUrl(url);
      if (!probe.ok) {
        urlCheckOk = false;
        urlDetail = `"${ref.name}" \u2014 ${probe.error}`;
        break;
      }
      urlDetail = `${urls.length} file(s) downloadable by the platform through ${publicBaseUrl()}`;
    }
  }
  checks.push({ label: "Public download", ok: urlCheckOk && urls.length > 0, detail: urls.length ? urlDetail : urlDetail });
  for (const platform of post.platforms) {
    if (!SUPPORTED_PUBLISH.includes(platform)) {
      checks.push({ label: `${PLATFORM_NAMES[platform]}`, ok: false, detail: "Not implemented in this build; nothing will be sent." });
      continue;
    }
    try {
      const caption = buildCaption(post, platform);
      if (platform === "instagram") {
        const target = await resolveInstagramTarget(post);
        let accountNote = "";
        let reachable = true;
        try {
          const me = await graphRead(`https://graph.instagram.com/${GRAPH_VERSION}/${target.igUserId}?fields=user_type,username&access_token=${encodeURIComponent(target.token)}`);
          accountNote = `; account type ${me.user_type || "not returned by Meta"}`;
          if (me.username) logPublish("instagram-account-read", { postId: post.id, username: me.username, userType: me.user_type || null });
        } catch (err) {
          reachable = false;
          accountNote = `; /me read failed: ${err?.message || "unknown error"}`;
          logPublish("instagram-account-read-failed", { postId: post.id, error: err?.message });
        }
        checks.push({
          label: "Instagram",
          ok: reachable,
          detail: `${target.accountName} via ${target.via}${accountNote}; caption ${caption.length} characters`
        });
      } else {
        const store = loadStore();
        if (!store.threads?.accountIds?.[0]) throw new Error("Threads is not connected on this machine.");
        const token = await freshAccessToken("threads");
        let accountNote = "";
        try {
          const me = await graphRead(`https://graph.threads.net/v1.0/${store.threads.accountIds[0]}?fields=id,username&access_token=${encodeURIComponent(token)}`);
          accountNote = me.username ? `; read as @${me.username}` : "; /me returned no username";
        } catch (err) {
          accountNote = `; /me read failed: ${err?.message || "unknown error"}`;
          logPublish("threads-account-read-failed", { postId: post.id, error: err?.message });
        }
        checks.push({ label: "Threads", ok: !accountNote.includes("failed"), detail: `${store.threads.accountNames[0]}${accountNote}; caption ${caption.length} characters` });
      }
    } catch (err) {
      checks.push({ label: PLATFORM_NAMES[platform] || platform, ok: false, detail: err?.message || "Not ready." });
    }
  }
  const ready = checks.every((c) => c.ok);
  logPublish("validate", { postId: post.id, ready, failures: checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`) });
  return { ready, checks, mediaCount: refs.length, publicBaseUrl: publicBaseUrl(), timezone: localZone(), publishAt: post.publishAt };
}
app.post("/api/posts/:id/reset-platform", (req, res) => {
  const post = getStoredPost(req.params.id);
  if (!post) return res.status(404).json({ error: "That post is no longer in the schedule." });
  const platform = req.body?.platform;
  if (!post.platforms.includes(platform)) return res.status(400).json({ error: "That channel is not part of this post." });
  const results = { ...post.results || {} };
  delete results[platform];
  const delivered = post.platforms.filter((p) => results[p]?.status === "success" && !results[p]?.deletedAt);
  const status = delivered.length === post.platforms.length ? "published" : delivered.length ? "partial" : "scheduled";
  const next = upsertStoredPost({
    ...post,
    results,
    status,
    attempts: 0,
    nextTryAt: void 0,
    lastError: void 0,
    deletedAt: void 0,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  logPublish("platform-reset", { postId: post.id, platform, status });
  res.json(postWithDiagnostics(next));
});
app.post("/api/posts/:id/refresh-links", async (req, res) => {
  const post = getStoredPost(req.params.id);
  if (!post) return res.status(404).json({ error: "That post is no longer in the schedule." });
  const results = { ...post.results || {} };
  const updated = [];
  const igResult = results.instagram;
  if (igResult?.status === "success" && igResult.platformPostId) {
    try {
      const target = await resolveInstagramTarget(post);
      const link = await readPermalink(
        `https://graph.instagram.com/${GRAPH_VERSION}/${igResult.platformPostId}?fields=permalink&access_token=${encodeURIComponent(target.token)}`,
        1
      );
      results.instagram = {
        ...igResult,
        permalink: link || igResult.permalink,
        profileUrl: igResult.profileUrl || (target.accountName ? `https://www.instagram.com/${target.accountName.replace(/^@/, "")}` : void 0)
      };
      if (link) updated.push("instagram");
    } catch (err) {
      logPublish("refresh-link-failed", { postId: post.id, platform: "instagram", error: err?.message });
    }
  }
  const threadsResult = results.threads;
  if (threadsResult?.status === "success" && !threadsResult.profileUrl) {
    const handle = (loadStore().threads?.accountNames?.[0] || "").replace(/^@/, "");
    if (handle) results.threads = { ...threadsResult, profileUrl: `https://www.threads.net/@${handle}` };
  }
  const next = upsertStoredPost({ ...post, results, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
  logPublish("links-refreshed", { postId: post.id, updated });
  res.json({ post: postWithDiagnostics(next), updated });
});
app.post("/api/posts/:id/validate", async (req, res) => {
  const post = getStoredPost(req.params.id);
  if (!post) return res.status(404).json({ error: "That post is no longer in the schedule." });
  try {
    res.json(await validatePost(post));
  } catch (err) {
    res.status(502).json({ error: err?.message || "Validation did not finish." });
  }
});
app.post("/api/posts/:id/publish", async (req, res) => {
  const post = getStoredPost(req.params.id);
  if (!post) return res.status(404).json({ error: "That post is no longer in the schedule." });
  if (inFlight.has(post.id)) return res.status(409).json({ error: "This post is already being published. Watch its status." });
  const platforms = Array.isArray(req.body?.platforms) ? req.body.platforms.filter((p) => post.platforms.includes(p)) : post.platforms;
  if (!platforms.length) return res.status(400).json({ error: "Pick at least one channel to publish." });
  res.status(202).json({ started: true, postId: post.id, platforms, status: "publishing" });
  void publishPost(post.id, "manual").catch((err) => logDetail("manual publish crashed", err));
});
app.post("/api/posts/:id/unpublish", async (req, res) => {
  try {
    const next = await removeFromPlatforms(req.params.id);
    res.json(postWithDiagnostics(next));
  } catch (err) {
    res.status(502).json({ error: err?.message || "The platform could not remove this post." });
  }
});
app.get("/api/publish/log", (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 80));
  const postId = typeof req.query.postId === "string" ? req.query.postId : void 0;
  res.json({ entries: readPublishLog(limit, postId), file: LOG_FILE });
});
app.get("/api/publish/readiness", async (_req, res) => {
  const base = publicBaseUrl();
  const store = loadStore();
  const probe = base ? await probePublicMediaUrl(`${base}/api/health`) : { ok: false, error: "no public address configured" };
  const accounts = Object.values(store.instagramAccounts || {});
  res.json({
    publicBaseUrl: base,
    publicReachable: probe.ok,
    publicProbeError: probe.error,
    publicProbeStatus: probe.status,
    timezone: localZone(),
    serverTime: (/* @__PURE__ */ new Date()).toISOString(),
    scheduler: { tickSeconds: SCHEDULE_TICK_MS / 1e3, graceMinutes: SCHEDULE_GRACE_MS / 6e4, maxAttempts: PUBLISH_MAX_ATTEMPTS, supported: SUPPORTED_PUBLISH },
    accounts: {
      instagram: accounts.map((a) => ({ id: a.accountIds[0], name: a.accountNames[0], expiresAt: a.expiresAt })),
      threads: store.threads ? { id: store.threads.accountIds[0], name: store.threads.accountNames[0], expiresAt: store.threads.expiresAt } : null
    },
    logFile: LOG_FILE
  });
});
if (process.env.MEDIA_NO_LISTEN !== "1") {
  app.listen(PORT, () => {
    console.log(`[relate-oauth] listening on http://localhost:${PORT}`);
    console.log(`[relate-oauth] redirect base: ${APP_BASE}`);
    console.log(`[relate-oauth] media data dir: ${MEDIA_DIR}`);
    startScheduler();
    console.log(
      `[relate-publish] scheduler armed for ${localZone()}, public media base: ${publicBaseUrl() || "none (platforms cannot download media)"}`
    );
    void detectFfmpeg().then((tools) => {
      console.log(
        tools ? `[relate-oauth] video conversion: ${tools.source} ffmpeg` : "[relate-oauth] video conversion disabled (no ffmpeg): unsupported clips may not preview"
      );
    });
    if (!META_APP_ID || !META_APP_SECRET) console.warn("[relate-oauth] Meta sign-in is turned off because its app credentials are missing. See docs/platform-setup.md");
    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) console.warn("[relate-oauth] TikTok sign-in is turned off because its app credentials are missing. See docs/platform-setup.md");
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) console.warn("[relate-oauth] YouTube sign-in is turned off because its app credentials are missing. See docs/platform-setup.md");
  });
}
export {
  __pickerBackends,
  app,
  createPickerGate,
  defaultPickerChain,
  pickFolderNative
};
