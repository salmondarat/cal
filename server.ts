import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import express from 'express';
import 'dotenv/config';

const PORT = Number(process.env.OAUTH_SERVER_PORT || 8787);
const APP_BASE = process.env.APP_URL || 'http://localhost:3000';
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';

const META_APP_ID = process.env.META_APP_ID || '';
const META_APP_SECRET = process.env.META_APP_SECRET || '';
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || '';
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
// Threads usually needs its OWN Meta app (use cases can't be combined in the new dashboard).
// Falls back to the main Meta app when THREADS_APP_ID/SECRET are not set.
const THREADS_APP_ID = process.env.THREADS_APP_ID || META_APP_ID;
const THREADS_APP_SECRET = process.env.THREADS_APP_SECRET || META_APP_SECRET;
// Instagram API with Instagram Login (works without access to a personal FB account).
const IG_APP_ID = process.env.IG_APP_ID || THREADS_APP_ID;
const IG_APP_SECRET = process.env.IG_APP_SECRET || THREADS_APP_SECRET;

const STORE_DIR = path.resolve('.secrets');
const STORE_FILE = path.join(STORE_DIR, 'connections.json');

interface StoredConnection {
  accessToken: string;
  tokenType: string;
  expiresAt?: number;
  accountIds: string[];
  accountNames: string[];
  scopes: string[];
  connectedAt: string;
  refreshToken?: string;
  metaPages?: { id: string; name: string; accessToken: string; instagramId?: string; instagramUsername?: string }[];
}

interface Store extends Partial<Record<'meta' | 'tiktok' | 'youtube' | 'threads' | 'instagram', StoredConnection>> {
  instagramAccounts?: Record<string, StoredConnection>;
  activeInstagramId?: string;
}

function loadStore(): Store {
  let store: Store = {};
  try {
    store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {}
  // Migrate the legacy single Instagram slot into the multi-account map.
  if (store.instagram) {
    const legacy = store.instagram;
    const key = legacy.accountIds[0];
    store.instagramAccounts = { ...(store.instagramAccounts || {}), [key]: legacy };
    store.activeInstagramId = store.activeInstagramId || key;
  }
  return store;
}

function saveStore(store: Store) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
}

const pendingStates = new Map<string, { platform: string; codeVerifier?: string; redirectUri: string }>();

// Persist in-flight OAuth states so `tsx watch` restarts don't kill a running flow.
const STATE_FILE = path.join(STORE_DIR, 'oauth-states.json');
function persistStates() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(pendingStates)));
}
function rememberState(state: string, entry: { platform: string; codeVerifier?: string; redirectUri: string }) {
  pendingStates.set(state, entry);
  persistStates();
}
function consumeState(state: string | undefined) {
  const pending = state ? pendingStates.get(state) : undefined;
  if (pending) {
    pendingStates.delete(state!);
    persistStates();
  }
  return pending;
}
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')))) pendingStates.set(k, v as any);
} catch {}

function maskToken(token: string): string {
  if (token.length <= 12) return `${token.slice(0, 3)}...`;
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

function logDetail(scope: string, detail: unknown) {
  const text = detail instanceof Error ? detail.message : typeof detail === 'string' ? detail : 'unknown error';
  console.warn(`[relate-oauth] ${scope}: ${text}`);
}

function connectionFailure(platformName: string): string {
  return `${platformName} could not finish signing in. Please try again. If it keeps failing, disconnect the account and reconnect.`;
}

function providerFailure(provider: string, detail: string | undefined): string {
  const text = (detail || '').toLowerCase();
  if (/access_denied|user (denied|cancel)|cancelled|canceled|press cancel/.test(text)) {
    return 'Sign-in was cancelled. No changes were made.';
  }
  if (/invalid|unauthorized|not found|disabled|misconfigur/.test(text)) {
    return `${provider} rejected this app's sign-in settings. Check the app configuration and try again.`;
  }
  if (/redirect|callback|uri/.test(text)) {
    return `${provider} could not return to this app. Check that the callback address in the app settings matches this app.`;
  }
  if (/permission|scope|consent/.test(text)) {
    return 'Some required permissions were not approved. Approve all requested access and try again.';
  }
  if (/expired|session|timeout/.test(text)) {
    return 'The sign-in session expired. Please start again.';
  }
  return connectionFailure(provider);
}

function missingConfig(res: express.Response, keys: string[]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    logDetail('missing configuration', missing.join(', '));
    res.status(400).json({
      error: 'This platform is not fully configured yet. Add its app credentials to the backend, then try again.',
    });
    return true;
  }
  return false;
}

function callbackHtml(platformName: string, ok: boolean, detail: string): string {
  const plain = detail.replace(/<[^>]+>/g, '');
  return `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:40px">
<h2>${ok ? `${platformName} connected` : `${platformName} connection failed`}</h2><p>${detail}</p>
<script>
if (window.opener) window.opener.postMessage({ type: 'relate-oauth', platform: '${platformName}', ok: ${ok}, message: ${JSON.stringify(plain)} }, '*');
setTimeout(() => window.close(), 1500);
</script></body></html>`;
}

function toPublicConnection(conn: StoredConnection) {
  return {
    connected: true,
    maskedToken: maskToken(conn.accessToken),
    accountIds: conn.accountIds,
    accountNames: conn.accountNames,
    scopes: conn.scopes,
    connectedAt: conn.connectedAt,
    expiresAt: conn.expiresAt,
  };
}

function publicConnections() {
  const store = loadStore();
  const out: Record<string, any> = {};
  for (const [platform, conn] of Object.entries(store)) {
    if (platform === 'instagramAccounts' || platform === 'activeInstagramId' || !conn) continue;
    out[platform] = toPublicConnection(conn as StoredConnection);
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
    active: id === activeIgId,
  }));
  return out;
}

// ---------- Meta (Facebook + Instagram) ----------

const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
  'read_insights',
];

app.get('/auth/meta/start', (_req, res) => {
  if (missingConfig(res, ['META_APP_ID', 'META_APP_SECRET'])) return;
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${APP_BASE}/auth/meta/callback`;
  rememberState(state, { platform: 'meta', redirectUri });
  const url =
    `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth` +
    `?client_id=${encodeURIComponent(META_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(META_SCOPES.join(','))}` +
    `&state=${state}`;
  res.redirect(url);
});

async function graphGet(url: string, token: string): Promise<any> {
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(`${url}${sep}access_token=${encodeURIComponent(token)}`);
  const json: any = await res.json();
  if (json.error) {
    logDetail('Meta request failed', json.error.message);
    throw new Error('Meta could not complete the request. Please try again.');
  }
  return json;
}

app.get('/auth/meta/callback', async (req, res) => {
  const { code, state, error_description } = req.query as Record<string, string>;
  if (error_description) {
    logDetail('Meta sign-in declined', error_description);
    return res.send(callbackHtml('Meta', false, providerFailure('Meta', error_description)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'meta') {
    return res.send(callbackHtml('Meta', false, 'The sign-in link expired. Please start again.'));
  }
  try {
    const exchange = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: META_APP_ID,
        client_secret: META_APP_SECRET,
        redirect_uri: pending.redirectUri,
        code,
      }),
    });
    const shortLived: any = await exchange.json();
    if (shortLived.error) {
      logDetail('Meta token exchange failed', shortLived.error.message);
      throw new Error(connectionFailure('Meta'));
    }

    const longRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(META_APP_ID)}&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
        `&fb_exchange_token=${encodeURIComponent(shortLived.access_token)}`,
    );
    const longLived: any = await longRes.json();
    if (longLived.error) {
      logDetail('Meta long-lived token exchange failed', longLived.error.message);
      throw new Error(connectionFailure('Meta'));
    }
    const userToken = longLived.access_token;

    const me = await graphGet(`https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name`, userToken);
    const accounts = await graphGet(
      `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}`,
      userToken,
    );
    const pages = (accounts.data || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      instagramId: p.instagram_business_account?.id,
      instagramUsername: p.instagram_business_account?.username,
    }));

    for (const page of pages) {
      if (page.instagramId) continue;
      try {
        const ig: any = await graphGet(
          `https://graph.facebook.com/${GRAPH_VERSION}/${page.id}/connected_instagram_account?fields=id,username`,
          page.accessToken,
        );
        if (ig.id) {
          page.instagramId = ig.id;
          page.instagramUsername = ig.username;
        }
      } catch {
        // page has no connected Instagram professional account
      }
    }

    // Keep only scopes actually granted — the dialog lets users uncheck some.
    let grantedScopes = META_SCOPES;
    try {
      const perms: any = await graphGet(`https://graph.facebook.com/${GRAPH_VERSION}/me/permissions`, userToken);
      const granted = (perms.data || [])
        .filter((p: any) => p.permission_status === 'granted')
        .map((p: any) => p.permission);
      if (granted.length) grantedScopes = granted;
    } catch {
      // permission list unreadable; keep requested scopes
    }

    const store = loadStore();
    store.meta = {
      accessToken: userToken,
      tokenType: 'meta_long_lived_user',
      expiresAt: Date.now() + (longLived.expires_in ? longLived.expires_in * 1000 : 59 * 86400 * 1000),
      accountIds: [me.id, ...pages.map((p: any) => p.id)],
      accountNames: [me.name, ...pages.map((p: any) => `${p.name}${p.instagramUsername ? ` (@${p.instagramUsername})` : ''}`)],
      scopes: grantedScopes,
      connectedAt: new Date().toISOString(),
      metaPages: pages,
    };
    saveStore(store);
    res.send(callbackHtml('Meta', true, `Connected as <b>${me.name}</b> with ${pages.length} page(s).`));
  } catch (err: any) {
    logDetail('Meta sign-in failed', err);
    res.send(callbackHtml('Meta', false, connectionFailure('Meta')));
  }
});

// ---------- TikTok ----------

const TIKTOK_SCOPES = ['user.info.basic', 'video.list', 'video.publish', 'video.upload'];

app.get('/auth/tiktok/start', (_req, res) => {
  if (missingConfig(res, ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'])) return;
  const state = crypto.randomBytes(16).toString('hex');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = `${APP_BASE}/auth/tiktok/callback`;
  rememberState(state, { platform: 'tiktok', codeVerifier: verifier, redirectUri });
  const url =
    'https://www.tiktok.com/v2/auth/authorize/' +
    `?client_key=${encodeURIComponent(TIKTOK_CLIENT_KEY)}` +
    `&response_type=code&scope=${encodeURIComponent(TIKTOK_SCOPES.join(','))}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}` +
    `&code_challenge=${challenge}&code_challenge_method=S256`;
  res.redirect(url);
});

app.get('/auth/tiktok/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string>;
  if (error) {
    logDetail('TikTok sign-in declined', error);
    return res.send(callbackHtml('TikTok', false, providerFailure('TikTok', error)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'tiktok') {
    return res.send(callbackHtml('TikTok', false, 'The sign-in link expired. Please start again.'));
  }
  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: pending.redirectUri,
        code_verifier: pending.codeVerifier || '',
      }),
    });
    const token: any = await tokenRes.json();
    if (token.error || !token.access_token) {
      logDetail('TikTok token exchange failed', token.error_description || token.error);
      throw new Error(connectionFailure('TikTok'));
    }

    const infoRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const info: any = await infoRes.json();
    const user = info.data?.user;
    if (!user) {
      logDetail('TikTok profile request failed', info.error?.message);
      throw new Error(connectionFailure('TikTok'));
    }

    const store = loadStore();
    store.tiktok = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenType: 'tiktok_access_token',
      expiresAt: Date.now() + (token.expires_in ? token.expires_in * 1000 : 86400 * 1000),
      accountIds: [user.open_id],
      accountNames: [user.display_name],
      scopes: (token.scope ? String(token.scope).split(',') : TIKTOK_SCOPES),
      connectedAt: new Date().toISOString(),
    };
    saveStore(store);
    res.send(callbackHtml('TikTok', true, `Connected as <b>${user.display_name}</b>.`));
  } catch (err: any) {
    logDetail('TikTok sign-in failed', err);
    res.send(callbackHtml('TikTok', false, connectionFailure('TikTok')));
  }
});

// ---------- YouTube (Google OAuth 2.0) ----------

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
];

app.get('/auth/google/start', (_req, res) => {
  if (missingConfig(res, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])) return;
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${APP_BASE}/auth/google/callback`;
  rememberState(state, { platform: 'google', redirectUri });
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    '&response_type=code' +
    '&access_type=offline&prompt=consent' +
    `&scope=${encodeURIComponent(GOOGLE_SCOPES.join(' '))}` +
    `&state=${state}`;
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;
  if (error) {
    logDetail('YouTube sign-in declined', error_description || error);
    return res.send(callbackHtml('YouTube', false, providerFailure('Google', error_description || error)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'google') {
    return res.send(callbackHtml('YouTube', false, 'The sign-in link expired. Please start again.'));
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: pending.redirectUri,
      }),
    });
    const token: any = await tokenRes.json();
    if (token.error) {
      logDetail('YouTube token exchange failed', `${token.error}: ${token.error_description || ''}`);
      throw new Error(connectionFailure('YouTube'));
    }

    const channelsRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const channels: any = await channelsRes.json();
    if (channels.error) {
      logDetail('YouTube channel request failed', channels.error.message);
      throw new Error(connectionFailure('YouTube'));
    }
    const items = channels.items || [];
    if (!items.length) {
      return res.send(callbackHtml('YouTube', false, 'Account authorized, but it owns no YouTube channel. Create a channel first, then reconnect.'));
    }

    const store = loadStore();
    store.youtube = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      tokenType: 'google_oauth',
      expiresAt: Date.now() + (token.expires_in ? token.expires_in * 1000 : 3600 * 1000),
      accountIds: items.map((c: any) => c.id),
      accountNames: items.map((c: any) => c.snippet.title),
      scopes: (token.scope ? String(token.scope).split(' ') : GOOGLE_SCOPES),
      connectedAt: new Date().toISOString(),
    };
    saveStore(store);
    res.send(callbackHtml('YouTube', true, `Connected channel <b>${items[0].snippet.title}</b>.`));
  } catch (err: any) {
    logDetail('YouTube sign-in failed', err);
    res.send(callbackHtml('YouTube', false, connectionFailure('YouTube')));
  }
});

// ---------- Threads (same Meta app, Threads API product enabled) ----------

const THREADS_SCOPES = ['threads_basic', 'threads_content_publish', 'threads_manage_replies'];

function threadsRedirectUri(): string {
  // Threads requires HTTPS redirect URIs; redirectmeto proxies for local dev.
  return APP_BASE.startsWith('http://')
    ? `https://redirectmeto.com/${APP_BASE}/auth/threads/callback`
    : `${APP_BASE}/auth/threads/callback`;
}

app.get('/auth/threads/start', (_req, res) => {
  if (!THREADS_APP_ID || !THREADS_APP_SECRET) {
    logDetail('missing configuration', 'Threads app credentials');
    res.status(400).json({
      error: 'Threads is not fully configured yet. Add its app credentials to the backend, then try again.',
    });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  rememberState(state, { platform: 'threads', redirectUri: threadsRedirectUri() });
  const url =
    'https://www.threads.net/oauth/authorize' +
    `?client_id=${encodeURIComponent(THREADS_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(threadsRedirectUri())}` +
    `&scope=${encodeURIComponent(THREADS_SCOPES.join(','))}` +
    '&response_type=code' +
    `&state=${state}`;
  res.redirect(url);
});

app.get('/auth/threads/callback', async (req, res) => {
  const { code, state, error_description } = req.query as Record<string, string>;
  if (error_description) {
    logDetail('Threads sign-in declined', error_description);
    return res.send(callbackHtml('Threads', false, providerFailure('Threads', error_description)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'threads') {
    return res.send(callbackHtml('Threads', false, 'The sign-in link expired. Please start again.'));
  }
  try {
    const exchange = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: THREADS_APP_ID,
        client_secret: THREADS_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: pending.redirectUri,
        code,
      }),
    });
    const short: any = await exchange.json();
    if (short.error) {
      logDetail('Threads token exchange failed', short.error.message);
      throw new Error(connectionFailure('Threads'));
    }

    const longRes = await fetch(
      'https://graph.threads.net/access_token?grant_type=th_exchange_token' +
        `&client_secret=${encodeURIComponent(THREADS_APP_SECRET)}` +
        `&access_token=${encodeURIComponent(short.access_token)}`,
    );
    const long: any = await longRes.json();
    if (long.error) {
      logDetail('Threads long-lived token exchange failed', long.error.message);
      throw new Error(connectionFailure('Threads'));
    }

    const infoRes = await fetch(
      'https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url',
      { headers: { Authorization: `Bearer ${long.access_token}` } },
    );
    const info: any = await infoRes.json();
    if (info.error) {
      logDetail('Threads profile request failed', info.error.message);
      throw new Error(connectionFailure('Threads'));
    }

    const store = loadStore();
    store.threads = {
      accessToken: long.access_token,
      tokenType: 'threads_long_lived_user',
      expiresAt: Date.now() + (long.expires_in ? long.expires_in * 1000 : 58 * 86400 * 1000),
      accountIds: [info.id],
      accountNames: [`@${info.username}`],
      scopes: THREADS_SCOPES,
      connectedAt: new Date().toISOString(),
    };
    saveStore(store);
    res.send(callbackHtml('Threads', true, `Connected as <b>@${info.username}</b>.`));
  } catch (err: any) {
    logDetail('Threads sign-in failed', err);
    res.send(callbackHtml('Threads', false, connectionFailure('Threads')));
  }
});

// ---------- Instagram (API with Instagram Login — no personal FB account needed) ----------

const IG_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

app.get('/auth/instagram/start', (_req, res) => {
  if (!IG_APP_ID || !IG_APP_SECRET) {
    logDetail('missing configuration', 'Instagram app credentials');
    res.status(400).json({
      error: 'Instagram is not fully configured yet. Add its app credentials to the backend, then try again.',
    });
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = `${APP_BASE}/auth/instagram/callback`;
  rememberState(state, { platform: 'instagram', redirectUri });
  const url =
    'https://www.instagram.com/oauth/authorize' +
    `?client_id=${encodeURIComponent(IG_APP_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    '&response_type=code' +
    `&scope=${encodeURIComponent(IG_SCOPES.join(','))}` +
    '&force_reauth=true' +
    `&state=${state}`;
  res.redirect(url);
});

app.get('/auth/instagram/callback', async (req, res) => {
  const { code, state, error_message, error_type } = req.query as Record<string, string>;
  if (error_message || error_type) {
    logDetail('Instagram sign-in declined', error_message || error_type);
    return res.send(callbackHtml('Instagram', false, providerFailure('Instagram', error_message || error_type)));
  }
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'instagram') {
    return res.send(callbackHtml('Instagram', false, 'The sign-in link expired. Please start again.'));
  }
  try {
    const exchange = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: IG_APP_ID,
        client_secret: IG_APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: pending.redirectUri,
        code,
      }),
    });
    const short: any = await exchange.json();
    if (short.error_message) {
      logDetail('Instagram token exchange failed', `${short.error_type || 'instagram'}: ${short.error_message}`);
      throw new Error(connectionFailure('Instagram'));
    }

    const longRes = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/access_token?grant_type=ig_exchange_token` +
        `&client_secret=${encodeURIComponent(IG_APP_SECRET)}` +
        `&access_token=${encodeURIComponent(short.access_token)}`,
    );
    const long: any = await longRes.json();
    if (long.error_message) {
      logDetail('Instagram long-lived token exchange failed', long.error_message);
      throw new Error(connectionFailure('Instagram'));
    }

    const meRes = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/me?fields=user_id,username`,
      { headers: { Authorization: `Bearer ${long.access_token}` } },
    );
    const me: any = await meRes.json();
    if (me.error) {
      logDetail('Instagram profile request failed', me.error.message);
      throw new Error(connectionFailure('Instagram'));
    }

    const store = loadStore();
    const igAccount: StoredConnection = {
      accessToken: long.access_token,
      tokenType: 'ig_long_lived_user',
      expiresAt: Date.now() + (long.expires_in ? long.expires_in * 1000 : 58 * 86400 * 1000),
      accountIds: [me.user_id || me.id],
      accountNames: [`@${me.username}`],
      scopes: IG_SCOPES,
      connectedAt: new Date().toISOString(),
    };
    const igId = igAccount.accountIds[0];
    store.instagramAccounts = { ...(store.instagramAccounts || {}), [igId]: igAccount };
    store.activeInstagramId = igId;
    store.instagram = igAccount;
    saveStore(store);
    res.send(callbackHtml('Instagram', true, `Connected as <b>@${me.username}</b>.`));
  } catch (err: any) {
    logDetail('Instagram sign-in failed', err);
    res.send(callbackHtml('Instagram', false, connectionFailure('Instagram')));
  }
});

// ---------- Universal media storage (date folders) ----------

const DATA_DIR = process.env.RELATE_DATA_DIR
  ? path.resolve(process.env.RELATE_DATA_DIR)
  : path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'RelateSocial');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DATE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MEDIA_BYTES = 1024 * 1024 * 1024; // 1GB, matches the app's per-file cap

const MEDIA_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

// ---------- Thumbnails (sharp, cached on disk) ----------

const THUMB_DIR = path.join(DATA_DIR, 'thumbnails');
const THUMB_WIDTH = 480;
const THUMB_CONCURRENCY = 4;
const THUMB_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

type SharpModule = typeof import('sharp')['default'];
let sharpModulePromise: Promise<SharpModule | null> | null = null;

function loadSharp(): Promise<SharpModule | null> {
  if (!sharpModulePromise) {
    sharpModulePromise = import('sharp')
      .then((mod) => mod.default)
      .catch((err) => {
        logDetail('thumbnail support unavailable (restart the backend after installing sharp)', err);
        return null;
      });
  }
  return sharpModulePromise;
}

let thumbActive = 0;
const thumbWaiters: (() => void)[] = [];

async function withThumbSlot<T>(task: () => Promise<T>): Promise<T> {
  if (thumbActive >= THUMB_CONCURRENCY) {
    await new Promise<void>((resolve) => thumbWaiters.push(resolve));
  }
  thumbActive++;
  try {
    return await task();
  } finally {
    thumbActive--;
    thumbWaiters.shift()?.();
  }
}

function streamFileWithRange(req: express.Request, res: express.Response, abs: string, mime: string, st: fs.Stats) {
  res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-cache');

  const range = req.headers.range;
  const match = typeof range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, st.size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), st.size - 1) : st.size - 1;
    if (start > end || start >= st.size) {
      res.setHeader('Content-Range', `bytes */${st.size}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
    res.setHeader('Content-Length', String(end - start + 1));
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }

  res.setHeader('Content-Length', String(st.size));
  fs.createReadStream(abs).pipe(res);
}

async function serveThumbnail(req: express.Request, res: express.Response, abs: string) {
  const ext = path.extname(abs).toLowerCase();
  if (!THUMB_IMAGE_EXT.has(ext)) {
    return res.status(415).json({ error: 'Thumbnails are only available for images.' });
  }

  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: 'That file could not be found.' });
  }
  if (!st.isFile()) return res.status(404).json({ error: 'That file could not be found.' });

  const requested = Number(req.query.w);
  const width = Number.isFinite(requested) && requested > 0
    ? Math.min(1200, Math.max(64, Math.round(requested)))
    : THUMB_WIDTH;

  const sharp = await loadSharp();
  if (!sharp) {
    // No sharp installed yet: serve the original so the UI keeps working.
    return streamFileWithRange(req, res, abs, MEDIA_MIME[ext] || 'application/octet-stream', st);
  }

  const key = crypto.createHash('sha1').update(`${abs}|${st.mtimeMs}|${st.size}|${width}`).digest('hex');
  const cachedFile = path.join(THUMB_DIR, `${key}.webp`);

  try {
    const cached = await fs.promises.readFile(cachedFile);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', String(cached.length));
    return res.end(cached);
  } catch {}

  try {
    const buf = await withThumbSlot(async () => {
      await fs.promises.mkdir(THUMB_DIR, { recursive: true });
      return sharp(abs, { animated: false, failOn: 'none' })
        .rotate()
        .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
    });
    fs.promises.writeFile(cachedFile, buf).catch((err) => logDetail('thumbnail cache write failed', err));
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (err) {
    logDetail('thumbnail generation failed', err);
    streamFileWithRange(req, res, abs, MEDIA_MIME[ext] || 'application/octet-stream', st);
  }
}

function isThumbnailableImage(name: string): boolean {
  return THUMB_IMAGE_EXT.has(path.extname(name).toLowerCase());
}

// ---------- Browser-playable video (ffmpeg, cached remux) ----------

const execFileAsync = promisify(execFile);
const nodeRequire = createRequire(import.meta.url);
const STREAM_DIR = path.join(DATA_DIR, 'streams');
const TRANSCODE_TIMEOUT = 15 * 60 * 1000;
const PLAYABLE_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'av1']);
// Re-encoding a huge clip on demand is too slow to be useful in the preview.
const MAX_VIDEO_REENCODE_BYTES = 2 * 1024 * 1024 * 1024;

interface MediaStreamInfo {
  codec_name?: string;
  profile?: string;
}

interface FfmpegTools {
  ffmpeg: string;
  ffprobe: string;
  source: 'bundled' | 'system';
}

let ffmpegTools: FfmpegTools | null | undefined;
const probeCache = new Map<string, MediaProbeResult | null>();

interface TranscodeJob {
  outFile: string;
  percent: number;
  done: boolean;
  error?: string;
  errorAt?: number;
}

const transcodeJobs = new Map<string, TranscodeJob>();

function bundledFfmpeg(): FfmpegTools | null {
  try {
    const ff = nodeRequire('@ffmpeg-installer/ffmpeg');
    const fp = nodeRequire('@ffprobe-installer/ffprobe');
    if (ff?.path && fp?.path) return { ffmpeg: ff.path, ffprobe: fp.path, source: 'bundled' as const };
  } catch {}
  return null;
}

async function detectFfmpeg(): Promise<FfmpegTools | null> {
  if (ffmpegTools !== undefined) return ffmpegTools;

  const bundled = bundledFfmpeg();
  if (bundled) {
    try {
      await execFileAsync(bundled.ffmpeg, ['-version'], { timeout: 15000, windowsHide: true });
      ffmpegTools = bundled;
      return ffmpegTools;
    } catch (err) {
      logDetail('bundled ffmpeg unusable, trying system ffmpeg', err);
    }
  }

  for (const [ffmpeg, ffprobe] of [
    ['ffmpeg', 'ffprobe'],
    ['ffmpeg.exe', 'ffprobe.exe'],
  ]) {
    try {
      await execFileAsync(ffmpeg, ['-version'], { timeout: 15000, windowsHide: true });
      ffmpegTools = { ffmpeg, ffprobe, source: 'system' };
      return ffmpegTools;
    } catch {}
  }
  ffmpegTools = null;
  return null;
}

interface MediaProbeResult {
  video?: MediaStreamInfo;
  audio?: MediaStreamInfo;
  duration: number;
}

async function probeMediaStreams(abs: string, st: fs.Stats): Promise<MediaProbeResult | null> {
  const key = `${abs}|${st.mtimeMs}|${st.size}`;
  if (probeCache.has(key)) return probeCache.get(key) ?? null;
  const tools = await detectFfmpeg();
  if (!tools) return null;
  try {
    const { stdout } = await execFileAsync(
      tools.ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', abs],
      { timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    );
    const parsed = JSON.parse(stdout);
    const streams: any[] = parsed.streams || [];
    const result: MediaProbeResult = {
      video: streams.find((s) => s.codec_type === 'video'),
      audio: streams.find((s) => s.codec_type === 'audio'),
      duration: Number(parsed.format?.duration) || 0,
    };
    probeCache.set(key, result);
    return result;
  } catch (err) {
    logDetail('media probe failed', err);
    return null;
  }
}

// Chrome cannot decode HE-AAC/xHE-AAC audio, so it greys out the volume control.
// An unrecognised AAC profile is treated as unsafe and normalised to AAC-LC.
function audioNeedsRemux(audio?: MediaStreamInfo): boolean {
  if (!audio?.codec_name) return false;
  if (audio.codec_name === 'aac') return !/^lc$/i.test(audio.profile || '');
  return !['aac', 'mp3', 'opus', 'vorbis'].includes(audio.codec_name);
}

function videoNeedsRemux(video?: MediaStreamInfo): boolean {
  return Boolean(video?.codec_name) && !PLAYABLE_VIDEO_CODECS.has(video!.codec_name!);
}

function startTranscode(
  tools: FfmpegTools,
  abs: string,
  st: fs.Stats,
  job: TranscodeJob,
  fixAudio: boolean,
  fixVideo: boolean,
  duration: number,
) {
  fs.mkdirSync(STREAM_DIR, { recursive: true });
  const tmpFile = `${job.outFile}.${process.pid}.tmp.mp4`;
  const big = st.size > 200 * 1024 * 1024;
  const args = ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', abs, '-map', '0:v:0', '-map', '0:a:0?', '-sn'];
  if (fixVideo) {
    // Cap the long edge so 4K clips do not take minutes to re-encode.
    const cap = big ? 1280 : 1920;
    const scale = `scale=w='if(gt(iw\\,ih)\\,min(${cap}\\,iw)\\,-2)':h='if(gt(iw\\,ih)\\,-2\\,min(${cap}\\,ih))'`;
    args.push('-c:v', 'libx264', '-preset', big ? 'ultrafast' : 'veryfast', '-crf', big ? '30' : '24', '-vf', scale, '-pix_fmt', 'yuv420p');
  } else {
    args.push('-c:v', 'copy');
  }
  if (fixAudio) args.push('-c:a', 'aac', '-profile:a', 'aac_low', '-ac', '2');
  else args.push('-c:a', 'copy');
  args.push('-max_muxing_queue_size', '4096', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmpFile);

  const child = spawn(tools.ffmpeg, args, { windowsHide: true });
  let stderr = '';

  const killTimer = setTimeout(() => {
    job.error = 'Conversion timed out.';
    job.errorAt = Date.now();
    child.kill('SIGKILL');
  }, TRANSCODE_TIMEOUT);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    if (!duration) return;
    for (const line of chunk.split('\n')) {
      // ffmpeg prints both out_time_us and out_time_ms; both carry microseconds.
      const match = /^out_time_(?:us|ms|millis)=(\d+)$/.exec(line.trim());
      if (!match) continue;
      const seconds = Number(match[1]) / 1e6;
      // The final +faststart pass rewrites the file, so hold back the last few percent.
      job.percent = Math.max(job.percent, Math.min(95, (seconds / duration) * 100));
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-800);
  });
  child.on('error', (err) => {
    clearTimeout(killTimer);
    job.error = err.message;
    job.errorAt = Date.now();
    job.done = true;
  });
  child.on('close', (code) => {
    clearTimeout(killTimer);
    if (code === 0) {
      fs.promises
        .rename(tmpFile, job.outFile)
        .then(() => {
          job.done = true;
          job.percent = 100;
        })
        .catch((err) => {
          job.error = err.message;
          job.errorAt = Date.now();
          job.done = true;
        });
      return;
    }
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
    job.error = stderr.trim().split('\n').slice(-1)[0] || `ffmpeg exited with code ${code}`;
    job.errorAt = Date.now();
    job.done = true;
    logDetail('playable copy failed', job.error);
  });
}

type PlayableState =
  | { state: 'ready'; percent: number; file: string }
  | { state: 'converting'; percent: number }
  | { state: 'failed'; percent: number; error: string };

// Conversion runs in the background: the HTTP request never waits for ffmpeg,
// which would time out through the dev proxy and the tunnel.
function getPlayableState(
  tools: FfmpegTools,
  abs: string,
  st: fs.Stats,
  fixAudio: boolean,
  fixVideo: boolean,
  duration: number,
): PlayableState {
  const key = crypto
    .createHash('sha1')
    .update(`v3|${abs}|${st.mtimeMs}|${st.size}|${fixAudio ? 'a' : ''}${fixVideo ? 'v' : ''}`)
    .digest('hex');
  const outFile = path.join(STREAM_DIR, `${key}.mp4`);
  if (fs.existsSync(outFile)) return { state: 'ready', percent: 100, file: outFile };

  let job = transcodeJobs.get(outFile);
  if (job?.error && job.errorAt && Date.now() - job.errorAt > 30000) {
    transcodeJobs.delete(outFile);
    job = undefined;
  }
  if (!job) {
    job = { outFile, percent: 0, done: false };
    transcodeJobs.set(outFile, job);
    startTranscode(tools, abs, st, job, fixAudio, fixVideo, duration);
  }

  if (job.error) return { state: 'failed', percent: Math.round(job.percent), error: job.error };
  if (job.done && fs.existsSync(outFile)) return { state: 'ready', percent: 100, file: outFile };
  return { state: 'converting', percent: Math.round(job.percent) };
}

interface PlayableResolution {
  st: fs.Stats;
  needsConversion: boolean;
  playable: PlayableState | null;
  hasAudio: boolean;
}

// Returns null when the response (404) has already been sent.
async function resolvePlayable(req: express.Request, res: express.Response, abs: string): Promise<PlayableResolution | null> {
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    res.status(404).json({ error: 'That file could not be found.' });
    return null;
  }

  const [info, tools] = await Promise.all([probeMediaStreams(abs, st), detectFfmpeg()]);
  if (!info || !tools) return { st, needsConversion: false, playable: null, hasAudio: Boolean(info?.audio) };

  // ?force=1 normalises audio even when the probe looked fine (browser refused to decode it).
  const force = req.query.force === '1' || req.query.force === 'true';
  const fixAudio = force || audioNeedsRemux(info.audio);
  const fixVideo = videoNeedsRemux(info.video) && st.size <= MAX_VIDEO_REENCODE_BYTES;
  if (!fixAudio && !fixVideo) return { st, needsConversion: false, playable: null, hasAudio: Boolean(info.audio) };

  return { st, needsConversion: true, playable: getPlayableState(tools, abs, st, fixAudio, fixVideo, info.duration), hasAudio: Boolean(info.audio) };
}

async function servePlayable(req: express.Request, res: express.Response, abs: string, mime: string) {
  const resolved = await resolvePlayable(req, res, abs);
  if (!resolved) return;
  if (!resolved.needsConversion) return streamFileWithRange(req, res, abs, mime, resolved.st);

  const playable = resolved.playable!;
  if (playable.state === 'converting') {
    return res.status(202).json({ status: 'converting', percent: playable.percent });
  }
  if (playable.state === 'failed') {
    return streamFileWithRange(req, res, abs, mime, resolved.st);
  }
  return streamFileWithRange(req, res, playable.file, 'video/mp4', fs.statSync(playable.file));
}

async function sendPlayableStatus(req: express.Request, res: express.Response, abs: string) {
  const resolved = await resolvePlayable(req, res, abs);
  if (!resolved) return;
  if (!resolved.needsConversion) return res.json({ status: 'original', hasAudio: resolved.hasAudio });

  const playable = resolved.playable!;
  if (playable.state === 'converting') return res.json({ status: 'converting', percent: playable.percent, hasAudio: resolved.hasAudio });
  if (playable.state === 'failed') return res.json({ status: 'failed', percent: playable.percent, error: playable.error, hasAudio: resolved.hasAudio });
  return res.json({ status: 'ready', percent: 100, hasAudio: resolved.hasAudio });
}

// Server-side video poster so unsupported codecs (HEVC) still get a thumbnail
// and the grid never has to download the clip itself.
async function serveVideoThumbnail(req: express.Request, res: express.Response, abs: string) {
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: 'That file could not be found.' });
  }

  const tools = await detectFfmpeg();
  if (!tools) return res.status(501).json({ error: 'ffmpeg is not available for video thumbnails.' });

  const requestedWidth = Number(req.query.w);
  const width = Number.isFinite(requestedWidth) && requestedWidth > 0
    ? Math.min(1280, Math.max(64, Math.round(requestedWidth)))
    : THUMB_WIDTH;
  const requestedTime = Number(req.query.t);
  const seek = Number.isFinite(requestedTime) && requestedTime >= 0 ? Math.min(requestedTime, 60) : 1;

  const key = crypto
    .createHash('sha1')
    .update(`vt|${abs}|${st.mtimeMs}|${st.size}|${width}|${seek}`)
    .digest('hex');
  const cachedFile = path.join(THUMB_DIR, `${key}.jpg`);

  const sendJpeg = async (buf: Buffer) => {
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  };

  try {
    sendJpeg(await fs.promises.readFile(cachedFile));
    return;
  } catch {}

  try {
    await fs.promises.mkdir(THUMB_DIR, { recursive: true });
    const tmpFile = `${cachedFile}.${process.pid}.tmp.jpg`;
    await withThumbSlot(() =>
      execFileAsync(
        tools.ffmpeg,
        [
          '-nostdin', '-loglevel', 'error', '-y',
          '-ss', String(seek),
          '-i', abs,
          '-frames:v', '1',
          '-vf', `scale=w=min(${width}\\,iw):h=-2`,
          '-q:v', '4',
          tmpFile,
        ],
        { timeout: 90000, windowsHide: true },
      ),
    );
    await fs.promises.rename(tmpFile, cachedFile);
    sendJpeg(await fs.promises.readFile(cachedFile));
  } catch (err) {
    logDetail('video thumbnail failed', err);
    if (!res.headersSent) res.status(502).json({ error: 'That video could not be thumbnailed.' });
  }
}

function safeFolder(date: unknown): string | null {
  return typeof date === 'string' && DATE_FOLDER_RE.test(date) ? date : null;
}

function safeFileName(name: unknown): string | null {
  if (typeof name !== 'string' || !name.length || name.length > 180) return null;
  const cleaned = name.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '');
  return cleaned.length ? cleaned : null;
}

function resolveInMediaDir(date: string, name: string): string | null {
  const abs = path.resolve(MEDIA_DIR, date, name);
  return abs.startsWith(path.resolve(MEDIA_DIR) + path.sep) ? abs : null;
}

function listDateFolders(): { date: string; files: number; bytes: number }[] {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(MEDIA_DIR);
  } catch {
    return [];
  }
  const out: { date: string; files: number; bytes: number }[] = [];
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
      } catch {}
    }
    out.push({ date: entry, files, bytes });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

app.get('/api/storage/info', (_req, res) => {
  const dates = listDateFolders();
  res.json({
    dataDir: DATA_DIR,
    mediaDir: MEDIA_DIR,
    exists: fs.existsSync(MEDIA_DIR),
    dateFolders: dates.length,
    totalFiles: dates.reduce((s, d) => s + d.files, 0),
    totalBytes: dates.reduce((s, d) => s + d.bytes, 0),
    maxFileBytes: MAX_MEDIA_BYTES,
  });
});

app.get('/api/storage/media/dates', (_req, res) => {
  res.json(listDateFolders());
});

app.get('/api/storage/media', (req, res) => {
  const date = safeFolder(req.query.date);
  if (!date) return res.status(400).json({ error: 'Choose a valid date in YYYY-MM-DD format.' });
  const dir = path.join(MEDIA_DIR, date);
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return res.json([]);
  }
  const items = [];
  for (const name of names) {
    const abs = resolveInMediaDir(date, name);
    if (!abs) continue;
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    const ext = path.extname(name).toLowerCase();
    const mime = MEDIA_MIME[ext] || 'application/octet-stream';
    const version = Math.round(st.mtimeMs);
    items.push({
      date,
      name,
      size: st.size,
      type: mime,
      modifiedAt: st.mtime.toISOString(),
      url: `/api/storage/media/file?date=${date}&name=${encodeURIComponent(name)}`,
      playUrl: mime.startsWith('video/')
        ? `/api/storage/stream?date=${date}&name=${encodeURIComponent(name)}`
        : undefined,
      thumbUrl: mime.startsWith('video/')
        ? `/api/storage/video-thumbnail?date=${date}&name=${encodeURIComponent(name)}&w=${THUMB_WIDTH}&v=${version}`
        : isThumbnailableImage(name)
          ? `/api/storage/thumbnail?date=${date}&name=${encodeURIComponent(name)}&w=${THUMB_WIDTH}&v=${version}`
          : undefined,
    });
  }
  res.json(items);
});

app.get('/api/storage/thumbnail', (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: 'That file name or date is not valid.' });
  void serveThumbnail(req, res, abs);
});

app.get('/api/storage/media/file', (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: 'That file name or date is not valid.' });
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: 'That file could not be found.' });
  }
  if (!st.isFile()) return res.status(404).json({ error: 'That file could not be found.' });
  streamFileWithRange(
    req,
    res,
    abs,
    MEDIA_MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
    st,
  );
});

app.get('/api/storage/video-thumbnail', (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: 'That file name or date is not valid.' });
  void serveVideoThumbnail(req, res, abs);
});

app.get('/api/storage/stream/status', (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: 'That file name or date is not valid.' });
  void sendPlayableStatus(req, res, abs);
});

app.get('/api/storage/stream', (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: 'That file name or date is not valid.' });
  const mime = MEDIA_MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  if (!mime.startsWith('video/')) return res.status(404).json({ error: 'That file is not a video.' });
  void servePlayable(req, res, abs, mime);
});

app.post(
  '/api/storage/media',
  express.raw({ type: '*/*', limit: `${MAX_MEDIA_BYTES}b` }),
  (req, res) => {
    const date = safeFolder(req.query.date);
    if (!date) return res.status(400).json({ error: 'Choose a valid date in YYYY-MM-DD format.' });
    let name = safeFileName(req.query.name);
    if (!name) name = `upload-${Date.now()}`;
    const ext = path.extname(name).toLowerCase();
    if (!MEDIA_MIME[ext]) {
      return res.status(400).json({ error: 'That file type is not supported. Choose an image or video.' });
    }
    const buf = req.body as Buffer;
    if (!buf?.length) return res.status(400).json({ error: 'No file was included in the upload.' });
    if (buf.length > MAX_MEDIA_BYTES) return res.status(413).json({ error: 'That file is too large. Choose one under 1 GB.' });

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
      modifiedAt: new Date().toISOString(),
      url: `/api/storage/media/file?date=${date}&name=${encodeURIComponent(finalName)}`,
    });
  },
);

app.delete('/api/storage/media', (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: 'That file name or date is not valid.' });
  try {
    fs.unlinkSync(abs);
    res.json({ deleted: `${date}/${name}` });
  } catch (err: any) {
    logDetail('media delete failed', err);
    res.status(500).json({ error: 'We could not delete that file. Please try again.' });
  }
});

// ---------- Local folder library (scan user-added folders) ----------

const LIBRARY_ROOTS_FILE = path.join(DATA_DIR, 'library-roots.json');
const LIBRARY_MEDIA_EXT = new Set([...Object.keys(MEDIA_MIME), '.avif', '.m4v']);
const LIBRARY_MIME: Record<string, string> = {
  ...MEDIA_MIME,
  '.avif': 'image/avif',
  '.m4v': 'video/x-m4v',
};
const LIBRARY_LIST_LIMIT = 2000;

interface LibraryRoot {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

function loadLibraryRoots(): LibraryRoot[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(LIBRARY_ROOTS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((r: any) => typeof r?.path === 'string') : [];
  } catch {
    return [];
  }
}

function saveLibraryRoots(roots: LibraryRoot[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LIBRARY_ROOTS_FILE, JSON.stringify(roots, null, 2));
}

function expandUserPath(input: string): string {
  let p = input.trim().replace(/^"(.*)"$/, '$1');
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    p = path.join(os.homedir(), p.slice(1));
  }
  p = p.replace(/%([^%]+)%/g, (m, name) => process.env[name] ?? m);
  return path.resolve(p);
}

function rootById(id: unknown): LibraryRoot | undefined {
  return typeof id === 'string' ? loadLibraryRoots().find((r) => r.id === id) : undefined;
}

function resolveInRoot(root: LibraryRoot, rel: unknown): string | null {
  if (typeof rel !== 'string' || rel.includes('\0')) return null;
  const base = path.resolve(root.path);
  const abs = path.resolve(base, rel.replace(/^[/\\]+/, ''));
  const norm = process.platform === 'win32' ? (s: string) => s.toLowerCase() : (s: string) => s;
  const a = norm(abs);
  const b = norm(base);
  return a === b || a.startsWith(b + path.sep) ? abs : null;
}

function libraryMime(name: string): string | null {
  const ext = path.extname(name).toLowerCase();
  return LIBRARY_MEDIA_EXT.has(ext) ? LIBRARY_MIME[ext] || 'application/octet-stream' : null;
}

// ---------- Server-side folder browsing (browse roots + GET /api/fs/dirs) ----------

interface BrowseRoot {
  name: string;
  path: string;
  kind: 'home' | 'volume' | 'custom';
}

interface FolderEntry {
  name: string;
  path: string;
}

interface ServerFolderListing {
  path: string;
  name: string;
  parent: string | null;
  isRoot: boolean;
  limit: number;
  places: BrowseRoot[];
  entries: FolderEntry[];
  truncated: boolean;
}

const FS_LIST_LIMIT = () => Math.max(1, Number(process.env.FS_LIST_LIMIT || 1000));

function browseError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

function existingDirectory(candidate: string): string | null {
  try {
    return fs.statSync(candidate).isDirectory() ? candidate : null;
  } catch {
    return null;
  }
}

function childDirectories(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const children: string[] = [];
  for (const name of names) {
    const child = existingDirectory(path.join(dir, name));
    if (child) children.push(child);
  }
  return children;
}

// Read at call time so a test can flip MEDIA_BROWSE_ROOTS between requests.
function browseRoots(): BrowseRoot[] {
  const configured = process.env.MEDIA_BROWSE_ROOTS;
  if (configured && configured.trim()) {
    const roots: BrowseRoot[] = [];
    const seen = new Set<string>();
    for (const segment of configured.split(path.delimiter)) {
      if (!segment.trim()) continue;
      const resolved = expandUserPath(segment);
      if (seen.has(resolved) || !existingDirectory(resolved)) continue;
      seen.add(resolved);
      roots.push({ name: path.basename(resolved) || resolved, path: resolved, kind: 'custom' });
    }
    return roots;
  }

  const roots: BrowseRoot[] = [{ name: 'Home', path: os.homedir(), kind: 'home' }];
  const seen = new Set<string>([roots[0].path]);
  const addVolume = (volumePath: string) => {
    if (seen.has(volumePath) || !existingDirectory(volumePath)) return;
    seen.add(volumePath);
    roots.push({ name: path.basename(volumePath) || volumePath, path: volumePath, kind: 'volume' });
  };

  if (process.platform === 'win32') {
    for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
      const letter = String.fromCharCode(code);
      const drive = `${letter}:\\`;
      if (existingDirectory(drive)) roots.push({ name: `${letter}:`, path: drive, kind: 'volume' });
    }
  } else if (process.platform === 'darwin') {
    for (const volume of childDirectories('/Volumes')) addVolume(volume);
  } else {
    for (const base of ['/media', '/mnt', '/run/media']) {
      for (const volume of childDirectories(base)) {
        addVolume(volume);
        for (const nested of childDirectories(volume)) addVolume(nested);
      }
    }
  }
  return roots;
}

function normalizePath(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p;
}

// Cheap text containment check: works for paths that do not exist yet.
function isPathInside(candidate: string, roots: BrowseRoot[]): boolean {
  const target = normalizePath(path.resolve(candidate));
  return roots.some((root) => {
    const base = normalizePath(path.resolve(root.path));
    return target === base || target.startsWith(base + path.sep);
  });
}

// Realpath containment: closes symlink escapes out of the browse roots.
function isInsideRoot(candidate: string, roots: BrowseRoot[]): boolean {
  let target: string;
  try {
    target = normalizePath(fs.realpathSync(candidate));
  } catch {
    return false;
  }
  return roots.some((root) => {
    let base: string;
    try {
      base = normalizePath(fs.realpathSync(root.path));
    } catch {
      return false;
    }
    return target === base || target.startsWith(base + path.sep);
  });
}

function listFolderListing(target: string): ServerFolderListing {
  const roots = browseRoots();
  if (roots.length === 0) {
    throw browseError(500, 'No folders are available to browse on this computer.');
  }
  const abs = expandUserPath(target);

  if (!isPathInside(abs, roots)) {
    throw browseError(403, 'That folder is outside the folders this app is allowed to browse.');
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(abs);
  } catch (err: any) {
    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      throw browseError(403, 'That folder cannot be read. Check its permissions.');
    }
    throw browseError(404, 'That folder could not be found. Check the path and try again.');
  }
  if (!stat.isDirectory()) {
    throw browseError(400, 'That path points to a file, not a folder.');
  }
  if (!isInsideRoot(abs, roots)) {
    throw browseError(403, 'That folder is outside the folders this app is allowed to browse.');
  }

  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(abs, { withFileTypes: true });
  } catch (err: any) {
    if (err?.code === 'EACCES' || err?.code === 'EPERM') {
      throw browseError(403, 'That folder cannot be read. Check its permissions.');
    }
    throw browseError(404, 'That folder could not be found. Check the path and try again.');
  }

  const limit = FS_LIST_LIMIT();
  const names = dirents
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const truncated = names.length > limit;
  const entries: FolderEntry[] = names.slice(0, limit).map((name) => ({ name, path: path.join(abs, name) }));

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
    truncated,
  };
}

// Read env at call time so a test can flip a flag between requests.
function browseEnabled(): boolean {
  const raw = String(process.env.MEDIA_BROWSE ?? '').trim().toLowerCase();
  if (raw === '') return true; // unset means on
  return !['0', 'off', 'false', 'no'].includes(raw);
}
function browseRemoteAllowed(): boolean { return process.env.MEDIA_BROWSE_REMOTE === '1'; }

function isLocalRequest(req: express.Request): boolean {
  const host = String(req.headers.host || '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) return false;
  if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers['x-real-ip']) return false;
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (!['localhost', '127.0.0.1', '::1'].includes(originHost)) return false;
    } catch { return false; }
  }
  return true;
}

function browseGuard(req: express.Request): string | null {
  if (!browseEnabled()) return 'Folder browsing is turned off on this computer. Paste the folder path instead.';
  if (!browseRemoteAllowed() && !isLocalRequest(req)) {
    return 'Folder browsing from other devices is turned off. Set MEDIA_BROWSE_REMOTE=1 on the computer running the app to allow it.';
  }
  return null;
}

app.get('/api/fs/dirs', (req, res) => {
  const blocked = browseGuard(req);
  if (blocked) return res.status(403).json({ error: blocked });
  try {
    const raw = typeof req.query.path === 'string' ? req.query.path : '';
    const roots = browseRoots();
    if (roots.length === 0) {
      throw Object.assign(new Error('No folders are available to browse on this computer.'), { statusCode: 500 });
    }
    res.json(listFolderListing(raw.trim() ? raw : roots[0].path));
  } catch (err: any) {
    const status = Number(err?.statusCode) || 500;
    const message = err?.statusCode ? err.message : 'That folder could not be found. Check the path and try again.';
    res.status(status).json({ error: message });
  }
});

// Capability probe for the native folder dialog. Reports server-side capability
// only — whether the client may use it is decided in the browser, because a
// dialog opened by a phone would appear on the server's screen.
interface PickerCapability { platform: string; available: boolean; backend: string | null; detail: string | null }

function hasCommand(cmd: string): boolean {
  const dirs = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32' ? [`${cmd}.exe`, `${cmd}.cmd`, cmd] : [cmd];
  return dirs.some((dir) => names.some((n) => {
    try { return fs.statSync(path.join(dir, n)).isFile(); } catch { return false; }
  }));
}

function hasDisplay(): boolean {
  return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

let cachedCapability: { key: string; value: PickerCapability } | null = null;

// python3 on PATH is not enough: without PyGObject (or with a GTK too old for
// Gtk.FileDialog) the gtk4 backend would advertise itself and open nothing.
// The result is cached so the probe spawns python at most once per process —
// a missing PyGObject will not appear while the server runs, so a negative
// answer sticks until `?refresh=1` forces a re-check.
const GTK4_IMPORT_CHECK = 'import gi; gi.require_version("Gtk", "4.0"); from gi.repository import Gtk; Gtk.FileDialog';
let cachedGtk4Import: boolean | null = null;

function gtk4Importable(force = false): boolean {
  if (cachedGtk4Import !== null && !force) return cachedGtk4Import;
  let ok = false;
  if (hasCommand('python3')) {
    try {
      execFileSync('python3', ['-c', GTK4_IMPORT_CHECK], { timeout: 5000 });
      ok = true;
    } catch (err: any) {
      // execFileSync failures report status/signal/error, not a numeric exit
      // code: logging code/killed rendered `code=none killed=false` for every
      // one. status falls back to code so ENOENT-style failures still show.
      logDetail(
        'gtk4 import check failed',
        `status=${err?.status ?? err?.code ?? 'none'} signal=${err?.signal ?? 'none'} error=${err?.error?.message ?? 'none'} stderr=${String(err?.stderr ?? '').trim() || 'none'}`,
      );
    }
  }
  cachedGtk4Import = ok;
  return ok;
}

// MEDIA_PICKER_BACKEND pins one backend id (lowercased so `Zenity` and `zenity`
// behave identically); `none` = no native dialog; `auto` (the default) probes
// the platform chain below.
function resolvePickerBackend(force = false): string | null {
  const forced = String(process.env.MEDIA_PICKER_BACKEND || 'auto').trim().toLowerCase();
  if (forced === 'none') return null;
  if (forced !== 'auto') return forced;
  if (process.platform === 'win32') return hasCommand('powershell') ? 'powershell' : null;
  if (process.platform === 'darwin') return hasCommand('osascript') ? 'osascript' : null;
  if (hasDisplay()) {
    if (hasCommand('zenity')) return 'zenity';
    if (hasCommand('kdialog')) return 'kdialog';
    if (gtk4Importable(force)) return 'gtk4';
  }
  return 'portal';
}

function probeFolderPicker(force = false): PickerCapability {
  const platform = process.platform;
  const enabled = browseEnabled();
  // Key covers every env input the value depends on (platform, the pinned
  // MEDIA_PICKER_BACKEND id, MEDIA_BROWSE), so a flag flipped inside this
  // process is picked up on the next request; `force` bypasses the cache for
  // inputs the key cannot see, such as PATH, the display or the GTK4 import
  // check above.
  const forced = String(process.env.MEDIA_PICKER_BACKEND || 'auto').trim().toLowerCase();
  const key = `${platform}|${forced}|${enabled}`;
  if (!force && cachedCapability && cachedCapability.key === key) return cachedCapability.value;

  let value: PickerCapability;
  if (!enabled) {
    value = {
      platform,
      available: false,
      backend: null,
      detail: 'Folder browsing is turned off on this computer. Paste the folder path instead.',
    };
  } else {
    const backend = resolvePickerBackend(force);
    value = {
      platform,
      available: Boolean(backend),
      backend,
      detail: backend ? null : 'No zenity, kdialog, GTK4 or desktop portal backend was found.',
    };
  }
  cachedCapability = { key, value };
  return value;
}

// Not gated by browseGuard: the probe exposes no filesystem data, and an
// unavailable capability must read as 200 { available: false }, not a 403.
app.get('/api/fs/folder-picker', (req, res) => {
  res.json(probeFolderPicker(req.query.refresh === '1'));
});

// ---------- Native folder picker (Windows / macOS / Linux) ----------

type PickerResult = { canceled: true } | { canceled: false; path: string };
interface PickerBackend {
  id: string;
  run(): Promise<PickerResult>;
  // Per-backend cancellation detection; a backend without it is never treated
  // as cancelled by an error (its cancel signal is empty stdout, not an error).
  isCancellation?: (err: any) => boolean;
}

const PICKER_TIMEOUT = 5 * 60 * 1000;

const WINDOWS_FOLDER_DIALOG_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
  "$dialog.Description = 'Select a media folder'",
  '$dialog.ShowNewFolderButton = $false',
  'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }',
].join('; ');

// Cancellation is per backend: zenity/kdialog exit code 1, osascript -128.
// PowerShell signals a cancel with empty stdout (handled on the success path),
// so it gets no predicate.
const exitCodeOne = (err: any) => err?.code === 1;
const osascriptCanceled = (err: any) => /cancel|-128/i.test(`${err?.stderr || ''} ${err?.message || ''}`);

function commandBackend(id: string, cmd: string, args: string[], isCancellation?: (err: any) => boolean): PickerBackend {
  return {
    id,
    isCancellation,
    run: async () => {
      const { stdout } = await execFileAsync(cmd, args, { timeout: PICKER_TIMEOUT, windowsHide: true });
      const chosen = stdout.trim();
      return chosen ? { canceled: false, path: chosen } : { canceled: true };
    },
  };
}

// The gtk4 backend drives a GTK4 FileDialog from an inline Python script: it
// prints the chosen absolute path, or the sentinel `__CANCELED__` when the
// dialog is dismissed (exit code 0 either way). It needs no isCancellation
// predicate — a python failure (no PyGObject, GTK too old, script error) exits
// non-zero and must fall through to the next backend, never read as a cancel.
const GTK4_SCRIPT = [
  'import sys',
  'import gi',
  'gi.require_version("Gtk", "4.0")',
  'from gi.repository import GLib, Gtk',
  'app = Gtk.Application(application_id="app.cal.folderpicker")',
  'def on_activate(application):',
  // hold() keeps the GtkApplication alive while the dialog is open: with no
  // window of its own, GApplication would drop its use count to zero and exit
  // as soon as activate returns, killing the portal request mid-flight.
  '    application.hold()',
  '    dialog = Gtk.FileDialog(title="Select a media folder")',
  '    def on_done(source, result):',
  '        try:',
  '            folder = source.select_folder_finish(result)',
  '            print(folder.get_path(), flush=True)',
  '        except GLib.Error:',
  '            print("__CANCELED__", flush=True)',
  // finally: quit even when a non-GLib.Error escapes select_folder_finish —
  // otherwise the held application lives until the 5-minute timeout, which
  // the chain would classify as a cancel rather than a backend failure.
  '        finally:',
  '            application.quit()',
  '    dialog.select_folder(None, None, on_done)',
  'app.connect("activate", on_activate)',
  'app.run([])',
].join('\n');

function gtk4PickerBackend(): PickerBackend {
  return {
    id: 'gtk4',
    run: async () => {
      const { stdout } = await execFileAsync('python3', ['-c', GTK4_SCRIPT], { timeout: PICKER_TIMEOUT });
      const chosen = stdout.trim();
      if (!chosen || chosen === '__CANCELED__') return { canceled: true };
      return { canceled: false, path: chosen };
    },
  };
}
const PORTAL_TIMEOUT = 5 * 60 * 1000;

// The portal backend asks xdg-desktop-portal (through gdbus) to open its
// native folder chooser, then waits for the Request.Response signal. Two
// facts from spiking gdbus on this machine:
//   - gdbus monitor filters object paths EXACTLY, but the portal answers on
//     the request sub-path (.../request/<sender>/<token>), never on
//     /org/freedesktop/portal/desktop itself — so the monitor runs without
//     --object-path (sender filter only).
//   - xdg-desktop-portal is one bus name serving every app, so its bus also
//     carries other apps' portal responses: the response line is anchored to
//     the request handle OpenFile returned, never matched globally.
function portalPickerBackend(): PickerBackend {
  return {
    id: 'portal',
    run: async () => {
      const token = `cal${Date.now().toString(36)}`;
      const monitor = spawn('gdbus', [
        'monitor', '--session', '--dest', 'org.freedesktop.portal.Desktop',
      ], { stdio: ['ignore', 'pipe', 'ignore'] });
      // spawn() reports a missing gdbus through this event; with no listener
      // Node turns it into an uncaught exception and kills the server. The
      // execFile below fails with ENOENT too, and the chain logs that branch.
      monitor.on('error', (err) => {
        logDetail('folder picker portal monitor failed', `message=${err?.message ?? 'none'}`);
      });
      let out = '';
      monitor.stdout.on('data', (chunk) => { out += String(chunk); });

      try {
        const { stdout } = await execFileAsync('gdbus', [
          'call', '--session', '--dest', 'org.freedesktop.portal.Desktop',
          '--object-path', '/org/freedesktop/portal/desktop',
          '--method', 'org.freedesktop.portal.FileChooser.OpenFile',
          '', 'Select a media folder',
          `{'handle_token': <'${token}'>, 'directory': <true>, 'multiple': <false>}`,
        ], { timeout: PORTAL_TIMEOUT });

        const requestPath = (stdout.match(/'([^']*\/request\/[^']*)'/) || [])[1];
        if (!requestPath) {
          throw Object.assign(new Error('portal did not return a request handle'), { code: 'ENOENT' });
        }

        // gdbus prints one line per signal: `<path>: <iface>.<member> <args>`,
        // and g_variant_print never wraps lines, so a prefix match is exact.
        const marker = `${requestPath}: org.freedesktop.portal.Request.Response (uint32 `;
        const deadline = Date.now() + PORTAL_TIMEOUT;
        while (Date.now() < deadline) {
          const line = out.split('\n').find((l) => l.startsWith(marker));
          if (line) {
            const code = Number(line.match(/uint32 (\d+)/)![1]);
            if (code !== 0) return { canceled: true };
            // Only file:// URIs are readable here: a GVFS location (smb://,
            // dav://, mtp://) has no file:// match, and is refused with the
            // message below instead of failing silently later.
            const uri = (line.match(/'file:\/\/[^']+'/) || [])[0];
            if (!uri) {
              throw Object.assign(new Error('That folder is a network or device location this app cannot read. Choose a folder on this computer.'), { statusCode: 400 });
            }
            // Percent-decoded by hand: the URI is captured from gdbus output,
            // not parsed with new URL().
            return { canceled: false, path: decodeURIComponent(uri.replace(/^'file:\/\//, '').replace(/'$/, '')) };
          }
          await new Promise((r) => setTimeout(r, 200));
        }
        return { canceled: true };
      } finally {
        // Reap the monitor on every exit path: the call itself can fail
        // (gdbus missing, portal refusing) and a leaked monitor would
        // outlive each attempt.
        monitor.kill();
      }
    },
  };
}

// Read MEDIA_PICKER_BACKEND at call time so a test can flip it between calls.
export function defaultPickerChain(): PickerBackend[] {
  const forced = (process.env.MEDIA_PICKER_BACKEND || 'auto').trim().toLowerCase();
  const chain: PickerBackend[] = [];
  const add = (id: string, make: () => PickerBackend) => {
    if (forced === 'auto' || forced === id) chain.push(make());
  };
  if (process.platform === 'win32') {
    add('powershell', () => commandBackend('powershell', 'powershell.exe', [
      '-NoProfile', '-NonInteractive', '-STA', '-Command', WINDOWS_FOLDER_DIALOG_SCRIPT,
    ]));
  }
  if (process.platform === 'darwin') {
    add('osascript', () => commandBackend('osascript', 'osascript', [
      '-e', 'POSIX path of (choose folder with prompt "Select a media folder")',
    ], osascriptCanceled));
  }
  add('zenity', () => commandBackend('zenity', 'zenity', ['--file-selection', '--directory', '--title=Select a media folder'], exitCodeOne));
  add('kdialog', () => commandBackend('kdialog', 'kdialog', ['--getexistingdirectory', os.homedir(), '--title', 'Select a media folder'], exitCodeOne));
  add('gtk4', () => gtk4PickerBackend());
  add('portal', () => portalPickerBackend());
  return chain;
}

export async function pickFolderNative(chain: PickerBackend[] = defaultPickerChain()): Promise<PickerResult> {
  for (const backend of chain) {
    try {
      return await backend.run();
    } catch (err: any) {
      // Every classification branch logs the id, exit code, signal and stderr,
      // so a user who sees "nothing happened" still leaves a trace.
      const detail = `code=${err?.code ?? 'none'} signal=${err?.signal ?? 'none'} killed=${Boolean(err?.killed)} stderr=${String(err?.stderr ?? '').trim() || 'none'} message=${err?.message ?? 'none'}`;
      if (err?.code === 'ENOENT') {
        logDetail(`folder picker backend unavailable: ${backend.id}`, detail);
        continue;
      }
      if (err?.killed) {
        // Node killed the child (timeout): nobody answered the dialog.
        logDetail(`folder picker timed out: ${backend.id}`, detail);
        return { canceled: true };
      }
      if (err?.signal) {
        // Crashed on its own (signal without Node killing it) — not a dismissal.
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
  throw Object.assign(new Error('No native folder picker is available. Paste the folder path instead.'), { statusCode: 501 });
}

// Exposed so tests can drive the real backends without going through the chain.
export const __pickerBackends = { gtk4: gtk4PickerBackend, portal: portalPickerBackend };

export function createPickerGate() {
  let busy = false;
  return {
    isBusy: () => busy,
    run: async <T,>(fn: () => Promise<T>): Promise<T> => {
      if (busy) throw Object.assign(new Error('A folder picker is already open. Finish it first.'), { statusCode: 409 });
      busy = true;
      try { return await fn(); } finally { busy = false; }
    },
  };
}

const pickerGate = createPickerGate();

app.get('/api/library/roots', (_req, res) => {
  res.json(
    loadLibraryRoots().map((r) => ({ ...r, exists: fs.existsSync(r.path) })),
  );
});

app.post('/api/library/roots', (req, res) => {
  const raw = typeof req.body?.path === 'string' ? req.body.path : '';
  if (!raw.trim()) return res.status(400).json({ error: 'Enter a folder path first.' });
  const abs = expandUserPath(raw);
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: 'That folder could not be found. Check the path and try again.' });
  }
  if (!st.isDirectory()) return res.status(400).json({ error: 'That path points to a file, not a folder.' });

  const roots = loadLibraryRoots();
  const norm = process.platform === 'win32' ? (s: string) => s.toLowerCase() : (s: string) => s;
  const existing = roots.find((r) => norm(path.resolve(r.path)) === norm(abs));
  if (existing) return res.json({ ...existing, exists: true });

  const id = crypto.createHash('sha1').update(norm(abs)).digest('hex').slice(0, 10);
  const root: LibraryRoot = {
    id,
    name: path.basename(abs) || abs,
    path: abs,
    addedAt: new Date().toISOString(),
  };
  roots.push(root);
  saveLibraryRoots(roots);
  res.status(201).json({ ...root, exists: true });
});

app.delete('/api/library/roots/:id', (req, res) => {
  const roots = loadLibraryRoots();
  const next = roots.filter((r) => r.id !== req.params.id);
  if (next.length === roots.length) return res.status(404).json({ error: 'That library folder is no longer available.' });
  saveLibraryRoots(next);
  res.json({ removed: req.params.id });
});

app.get('/api/library/list', (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: 'That library folder is not available.' });
  const rel = typeof req.query.path === 'string' ? req.query.path : '';
  const abs = resolveInRoot(root, rel);
  if (!abs) return res.status(400).json({ error: 'That folder path is not valid.' });

  let names: string[];
  try {
    names = fs.readdirSync(abs);
  } catch {
    return res.status(404).json({ error: 'That folder could not be found. Check the path and try again.' });
  }

  const folders: { name: string; path: string }[] = [];
  const files: any[] = [];
  let truncated = false;
  for (const name of names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    if (name.startsWith('.')) continue;
    const childRel = rel ? `${rel}/${name}` : name;
    const childAbs = path.join(abs, name);
    let st: fs.Stats;
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
    const fileMime = libraryMime(name)!;
    const fileUrl = `/api/library/file?root=${root.id}&path=${encodeURIComponent(childRel)}`;
    const version = Math.round(st.mtimeMs);
    files.push({
      name,
      path: childRel,
      size: st.size,
      type: fileMime,
      modifiedAt: st.mtime.toISOString(),
      url: fileUrl,
      playUrl: fileMime.startsWith('video/')
        ? `/api/library/stream?root=${root.id}&path=${encodeURIComponent(childRel)}`
        : undefined,
      thumbUrl: fileMime.startsWith('video/')
        ? `/api/library/video-thumbnail?root=${root.id}&path=${encodeURIComponent(childRel)}&w=${THUMB_WIDTH}&v=${version}`
        : isThumbnailableImage(name)
          ? `/api/library/thumbnail?root=${root.id}&path=${encodeURIComponent(childRel)}&w=${THUMB_WIDTH}&v=${version}`
          : undefined,
    });
  }

  res.json({ root: { id: root.id, name: root.name, path: root.path }, path: rel, folders, files, truncated });
});

app.get('/api/library/thumbnail', (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: 'That library folder is not available.' });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: 'That folder path is not valid.' });
  void serveThumbnail(req, res, abs);
});

app.post('/api/library/pick-folder', async (req, res) => {
  const blocked = browseGuard(req);
  if (blocked) return res.status(403).json({ error: blocked });
  try {
    const result = await pickerGate.run(() => pickFolderNative());
    if (result.canceled || !('path' in result)) return res.json({ canceled: true });
    const abs = path.resolve(expandUserPath(result.path));
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      return res.status(404).json({ error: `Folder not found: ${abs}` });
    }
    if (!st.isDirectory()) return res.status(400).json({ error: `Not a folder: ${abs}` });
    res.json({ canceled: false, path: abs });
  } catch (err: any) {
    logDetail('folder picker failed', err);
    const status = Number(err?.statusCode) || 500;
    res.status(status === 501 ? 501 : status === 409 ? 409 : 500).json({
      error: status === 501
        ? 'No native folder picker is available on this system. Paste the folder path instead.'
        : status === 409
          ? 'A folder picker is already open. Finish it first.'
          : 'The folder picker could not open. Paste the folder path instead.',
    });
  }
});

app.get('/api/library/file', (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: 'That library folder is not available.' });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: 'That folder path is not valid.' });

  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: 'That file could not be found.' });
  }
  const mime = st.isFile() ? libraryMime(abs) : null;
  if (!mime) return res.status(404).json({ error: 'That file is not a supported image or video.' });

  streamFileWithRange(req, res, abs, mime, st);
});

app.get('/api/library/video-thumbnail', (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: 'That library folder is not available.' });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: 'That folder path is not valid.' });
  void serveVideoThumbnail(req, res, abs);
});

app.get('/api/library/stream', (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: 'That library folder is not available.' });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: 'That folder path is not valid.' });
  const mime = libraryMime(abs);
  if (!mime || !mime.startsWith('video/')) return res.status(404).json({ error: 'That file is not a supported video.' });
  void servePlayable(req, res, abs, mime);
});

app.get('/api/library/stream/status', (req, res) => {
  const root = rootById(req.query.root);
  if (!root) return res.status(404).json({ error: 'That library folder is not available.' });
  const abs = resolveInRoot(root, req.query.path);
  if (!abs) return res.status(400).json({ error: 'That folder path is not valid.' });
  void sendPlayableStatus(req, res, abs);
});

function needsRefresh(conn: StoredConnection): boolean {
  return Boolean(conn.expiresAt && conn.expiresAt - Date.now() < 5 * 60 * 1000);
}

async function freshAccessToken(storeKey: 'tiktok' | 'youtube' | 'threads' | 'instagram'): Promise<string> {
  const store = loadStore();
  const conn = store[storeKey];
  if (!conn) throw new Error('This account is not connected yet. Connect it first.');
  if (!needsRefresh(conn)) return conn.accessToken;

  let next: any;
  if (storeKey === 'tiktok') {
    if (!conn.refreshToken) throw new Error('Your TikTok session has expired. Reconnect TikTok to continue.');
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: conn.refreshToken,
      }),
    });
    next = await res.json();
    if (next.error || !next.access_token) {
      logDetail('TikTok token refresh failed', next.error_description || next.error);
      throw new Error('We could not renew your TikTok session. Reconnect TikTok to continue.');
    }
  } else if (storeKey === 'youtube') {
    if (!conn.refreshToken) throw new Error('Your Google session has expired. Reconnect YouTube to continue.');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: conn.refreshToken,
      }),
    });
    next = await res.json();
    if (next.error || !next.access_token) {
      logDetail('Google token refresh failed', `${next.error}: ${next.error_description || ''}`);
      throw new Error('We could not renew your Google session. Reconnect YouTube to continue.');
    }
  } else if (storeKey === 'instagram') {
    const res = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(conn.accessToken)}`,
    );
    next = await res.json();
    if (next.error_message || next.error) {
      logDetail('Instagram token refresh failed', next.error_message || next.error?.message);
      throw new Error('We could not renew your Instagram session. Reconnect Instagram to continue.');
    }
  } else {
    const res = await fetch(
      `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(conn.accessToken)}`,
    );
    next = await res.json();
    if (next.error) {
      logDetail('Threads token refresh failed', next.error.message);
      throw new Error('We could not renew your Threads session. Reconnect Threads to continue.');
    }
  }

  conn.accessToken = next.access_token;
  if (next.refresh_token) conn.refreshToken = next.refresh_token;
  conn.expiresAt = Date.now() + (next.expires_in ? next.expires_in * 1000 : 3600 * 1000);
  const s2 = loadStore();
  s2[storeKey] = conn;
  if (storeKey === 'instagram') {
    s2.instagramAccounts = { ...(s2.instagramAccounts || {}), [conn.accountIds[0]]: conn };
  }
  saveStore(s2);
  return conn.accessToken;
}

// ---------- Shared API ----------

app.get('/api/health', (_req, res) => {
  res.json({
    metaConfigured: Boolean(META_APP_ID && META_APP_SECRET),
    tiktokConfigured: Boolean(TIKTOK_CLIENT_KEY && TIKTOK_CLIENT_SECRET),
    youtubeConfigured: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    threadsConfigured: Boolean(META_APP_ID && META_APP_SECRET),
    instagramLoginConfigured: Boolean(IG_APP_ID && IG_APP_SECRET),
    graphVersion: GRAPH_VERSION,
    redirectBase: APP_BASE,
  });
});

app.get('/api/connections', (_req, res) => {
  res.json(publicConnections());
});

app.post('/api/verify/:platform', async (req, res) => {
  const platform = req.params.platform;
  const store = loadStore();

  try {
    if (platform === 'instagram' && store.instagram) {
      const accessToken = await freshAccessToken('instagram');
      const meRes = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/me?fields=user_id,username`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const me: any = await meRes.json();
      if (me.error) {
        logDetail('Instagram verification failed', me.error.message);
        return res.status(502).json({ error: 'Instagram could not confirm this connection. Reconnect Instagram and try again.' });
      }
      return res.json({
        platform,
        ok: true,
        identity: `@${me.username} (${me.user_id})`,
        via: 'Instagram Login',
        checkedAt: new Date().toISOString(),
      });
    }

    if (platform === 'facebook' || platform === 'instagram') {
      const conn = store.meta;
      if (!conn) return res.status(400).json({ error: 'Facebook and Instagram are not connected yet. Connect them first, then try again.' });
      const me = await graphGet(`https://graph.facebook.com/${GRAPH_VERSION}/me?fields=id,name`, conn.accessToken);
      const pages = conn.metaPages || [];
      const result = {
        platform,
        ok: true,
        identity: `${me.name} (${me.id})`,
        pages: pages.map((p) => ({ id: p.id, name: p.name })),
        instagram: pages.filter((p) => p.instagramId).map((p) => ({ id: p.instagramId, username: p.instagramUsername })),
        checkedAt: new Date().toISOString(),
      };
      if (platform === 'instagram' && result.instagram.length === 0) {
        return res.json({ ...result, ok: false, warning: 'No Instagram professional account is connected to any of your Facebook Pages.' });
      }
      return res.json(result);
    }

    if (platform === 'tiktok') {
      const conn = store.tiktok;
      if (!conn) return res.status(400).json({ error: 'TikTok is not connected yet. Connect it first, then try again.' });
      const accessToken = await freshAccessToken('tiktok');
      const infoRes = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const info: any = await infoRes.json();
      const user = info.data?.user;
      if (!user) {
        logDetail('TikTok verification failed', info.error?.message);
        return res.status(502).json({ error: 'TikTok could not confirm this connection. Reconnect TikTok and try again.' });
      }
      return res.json({
        platform,
        ok: true,
        identity: `${user.display_name} (${user.open_id})`,
        checkedAt: new Date().toISOString(),
      });
    }

    if (platform === 'youtube') {
      const conn = store.youtube;
      if (!conn) return res.status(400).json({ error: 'YouTube is not connected yet. Connect it first, then try again.' });
      const accessToken = await freshAccessToken('youtube');
      const channelsRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const channels: any = await channelsRes.json();
      if (channels.error) {
        logDetail('YouTube verification failed', channels.error.message);
        return res.status(502).json({ error: 'YouTube could not confirm this connection. Reconnect YouTube and try again.' });
      }
      const items = channels.items || [];
      if (!items.length) return res.status(404).json({ error: 'This Google account has no YouTube channel yet. Create one, then reconnect.' });
      return res.json({
        platform,
        ok: true,
        identity: `${items[0].snippet.title} (${items[0].id})`,
        channels: items.map((c: any) => ({ id: c.id, title: c.snippet.title })),
        checkedAt: new Date().toISOString(),
      });
    }

    if (platform === 'threads') {
      const conn = store.threads;
      if (!conn) return res.status(400).json({ error: 'Threads is not connected yet. Connect it first, then try again.' });
      const accessToken = await freshAccessToken('threads');
      const infoRes = await fetch(
        'https://graph.threads.net/v1.0/me?fields=id,username',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const info: any = await infoRes.json();
      if (info.error) {
        logDetail('Threads verification failed', info.error.message);
        return res.status(502).json({ error: 'Threads could not confirm this connection. Reconnect Threads and try again.' });
      }
      return res.json({
        platform,
        ok: true,
        identity: `@${info.username} (${info.id})`,
        checkedAt: new Date().toISOString(),
      });
    }

    res.status(404).json({ error: 'That platform is not supported.' });
  } catch (err: any) {
    logDetail('connection verification failed', err);
    res.status(502).json({ error: 'We could not verify this connection right now. Please try again.' });
  }
});

app.post('/api/disconnect/:platform', (req, res) => {
  const platform = req.params.platform as 'meta' | 'tiktok' | 'youtube' | 'threads' | 'instagram';
  if (!['meta', 'tiktok', 'youtube', 'threads', 'instagram'].includes(platform)) {
    return res.status(400).json({ error: 'That connection type is not supported.' });
  }
  const store = loadStore();

  if (platform === 'instagram' && store.instagramAccounts) {
    const accountId = (req.query.accountId as string) || store.activeInstagramId;
    if (accountId) delete store.instagramAccounts[accountId];
    const remaining = Object.keys(store.instagramAccounts);
    if (accountId === store.activeInstagramId) {
      store.activeInstagramId = remaining[0];
      if (remaining[0]) store.instagram = store.instagramAccounts[remaining[0]];
      else delete store.instagram;
    }
    if (remaining.length === 0) delete store.instagramAccounts;
    saveStore(store);
    return res.json({ disconnected: 'instagram', accountId, remaining: remaining.length });
  }

  delete store[platform];
  saveStore(store);
  res.json({ disconnected: platform });
});

app.post('/api/instagram/active', (req, res) => {
  const { accountId } = req.body as { accountId?: string };
  const store = loadStore();
  const accounts = store.instagramAccounts || {};
  if (!accountId || !accounts[accountId]) {
    return res.status(404).json({ error: 'That Instagram account is no longer connected.' });
  }
  store.activeInstagramId = accountId;
  store.instagram = accounts[accountId];
  saveStore(store);
  res.json({ active: accountId, accountNames: accounts[accountId].accountNames });
});

if (process.env.MEDIA_NO_LISTEN !== '1') {
  app.listen(PORT, () => {
    console.log(`[relate-oauth] listening on http://localhost:${PORT}`);
    console.log(`[relate-oauth] redirect base: ${APP_BASE}`);
    console.log(`[relate-oauth] media data dir: ${MEDIA_DIR}`);
    void detectFfmpeg().then((tools) => {
      console.log(
        tools
          ? `[relate-oauth] video conversion: ${tools.source} ffmpeg`
          : '[relate-oauth] video conversion disabled (no ffmpeg): unsupported clips may not preview',
      );
    });
    if (!META_APP_ID || !META_APP_SECRET) console.warn('[relate-oauth] Meta sign-in is turned off because its app credentials are missing. See docs/platform-setup.md');
    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) console.warn('[relate-oauth] TikTok sign-in is turned off because its app credentials are missing. See docs/platform-setup.md');
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) console.warn('[relate-oauth] YouTube sign-in is turned off because its app credentials are missing. See docs/platform-setup.md');
  });
}

export { app };
