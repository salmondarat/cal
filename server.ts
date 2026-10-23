import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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

type Store = Partial<Record<'meta' | 'tiktok' | 'youtube' | 'threads' | 'instagram', StoredConnection>>;

function loadStore(): Store {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  } catch {
    return {};
  }
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

function missingConfig(res: express.Response, keys: string[]) {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    res.status(400).json({
      error: `Missing environment configuration: ${missing.join(', ')}. See docs/platform-setup.md`,
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

function publicConnections() {
  const store = loadStore();
  const out: Record<string, any> = {};
  for (const [platform, conn] of Object.entries(store)) {
    if (!conn) continue;
    out[platform] = {
      connected: true,
      maskedToken: maskToken(conn.accessToken),
      accountIds: conn.accountIds,
      accountNames: conn.accountNames,
      scopes: conn.scopes,
      connectedAt: conn.connectedAt,
      expiresAt: conn.expiresAt,
    };
  }
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
  if (json.error) throw new Error(`Graph API: ${json.error.message}`);
  return json;
}

app.get('/auth/meta/callback', async (req, res) => {
  const { code, state, error_description } = req.query as Record<string, string>;
  if (error_description) return res.send(callbackHtml('Meta', false, error_description));
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'meta') {
    return res.send(callbackHtml('Meta', false, 'Invalid or expired OAuth state.'));
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
    if (shortLived.error) throw new Error(shortLived.error.message);

    const longRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${encodeURIComponent(META_APP_ID)}&client_secret=${encodeURIComponent(META_APP_SECRET)}` +
        `&fb_exchange_token=${encodeURIComponent(shortLived.access_token)}`,
    );
    const longLived: any = await longRes.json();
    if (longLived.error) throw new Error(longLived.error.message);
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
    res.send(callbackHtml('Meta', false, err.message));
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
  if (error) return res.send(callbackHtml('TikTok', false, error));
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'tiktok') {
    return res.send(callbackHtml('TikTok', false, 'Invalid or expired OAuth state.'));
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
      throw new Error(token.error_description || token.error || 'TikTok token exchange failed');
    }

    const infoRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const info: any = await infoRes.json();
    const user = info.data?.user;
    if (!user) throw new Error(info.error?.message || 'Could not read TikTok profile.');

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
    res.send(callbackHtml('TikTok', false, err.message));
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
  if (error) return res.send(callbackHtml('YouTube', false, error_description || error));
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'google') {
    return res.send(callbackHtml('YouTube', false, 'Invalid or expired OAuth state.'));
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
    if (token.error) throw new Error(`${token.error}: ${token.error_description || ''}`);

    const channelsRes = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&mine=true',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const channels: any = await channelsRes.json();
    if (channels.error) throw new Error(`YouTube Data API: ${channels.error.message}`);
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
    res.send(callbackHtml('YouTube', false, err.message));
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
    res.status(400).json({
      error: 'Missing THREADS_APP_ID / THREADS_APP_SECRET (falls back to META_APP_ID / META_APP_SECRET). See docs/platform-setup.md',
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
  if (error_description) return res.send(callbackHtml('Threads', false, error_description));
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'threads') {
    return res.send(callbackHtml('Threads', false, 'Invalid or expired OAuth state.'));
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
    if (short.error) throw new Error(short.error.message);

    const longRes = await fetch(
      'https://graph.threads.net/access_token?grant_type=th_exchange_token' +
        `&client_secret=${encodeURIComponent(THREADS_APP_SECRET)}` +
        `&access_token=${encodeURIComponent(short.access_token)}`,
    );
    const long: any = await longRes.json();
    if (long.error) throw new Error(long.error.message);

    const infoRes = await fetch(
      'https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url',
      { headers: { Authorization: `Bearer ${long.access_token}` } },
    );
    const info: any = await infoRes.json();
    if (info.error) throw new Error(info.error.message);

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
    res.send(callbackHtml('Threads', false, err.message));
  }
});

// ---------- Instagram (API with Instagram Login — no personal FB account needed) ----------

const IG_SCOPES = ['instagram_business_basic', 'instagram_business_content_publish'];

app.get('/auth/instagram/start', (_req, res) => {
  if (!IG_APP_ID || !IG_APP_SECRET) {
    res.status(400).json({
      error: 'Missing IG_APP_ID / IG_APP_SECRET (falls back to THREADS_* then META_*). See docs/platform-setup.md',
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
    `&state=${state}`;
  res.redirect(url);
});

app.get('/auth/instagram/callback', async (req, res) => {
  const { code, state, error_message, error_type } = req.query as Record<string, string>;
  if (error_message || error_type) return res.send(callbackHtml('Instagram', false, error_message || error_type));
  const pending = consumeState(state);
  if (!code || !pending || pending.platform !== 'instagram') {
    return res.send(callbackHtml('Instagram', false, 'Invalid or expired OAuth state.'));
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
    if (short.error_message) throw new Error(`${short.error_type || 'instagram'}: ${short.error_message}`);

    const longRes = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/access_token?grant_type=ig_exchange_token` +
        `&client_secret=${encodeURIComponent(IG_APP_SECRET)}` +
        `&access_token=${encodeURIComponent(short.access_token)}`,
    );
    const long: any = await longRes.json();
    if (long.error_message) throw new Error(long.error_message);

    const meRes = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/me?fields=user_id,username`,
      { headers: { Authorization: `Bearer ${long.access_token}` } },
    );
    const me: any = await meRes.json();
    if (me.error) throw new Error(me.error.message);

    const store = loadStore();
    store.instagram = {
      accessToken: long.access_token,
      tokenType: 'ig_long_lived_user',
      expiresAt: Date.now() + (long.expires_in ? long.expires_in * 1000 : 58 * 86400 * 1000),
      accountIds: [me.user_id || me.id],
      accountNames: [`@${me.username}`],
      scopes: IG_SCOPES,
      connectedAt: new Date().toISOString(),
    };
    saveStore(store);
    res.send(callbackHtml('Instagram', true, `Connected as <b>@${me.username}</b>.`));
  } catch (err: any) {
    res.send(callbackHtml('Instagram', false, err.message));
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
  if (!date) return res.status(400).json({ error: 'date query must be YYYY-MM-DD' });
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
    items.push({
      date,
      name,
      size: st.size,
      type: MEDIA_MIME[ext] || 'application/octet-stream',
      modifiedAt: st.mtime.toISOString(),
      url: `/api/storage/media/file?date=${date}&name=${encodeURIComponent(name)}`,
    });
  }
  res.json(items);
});

app.get('/api/storage/media/file', (req, res) => {
  const date = safeFolder(req.query.date);
  const name = safeFileName(req.query.name);
  const abs = date && name && resolveInMediaDir(date, name);
  if (!abs) return res.status(400).json({ error: 'Invalid date/name' });
  let st: fs.Stats;
  try {
    st = fs.statSync(abs);
  } catch {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Content-Type', MEDIA_MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', String(st.size));
  res.setHeader('Cache-Control', 'no-cache');
  fs.createReadStream(abs).pipe(res);
});

app.post(
  '/api/storage/media',
  express.raw({ type: '*/*', limit: `${MAX_MEDIA_BYTES}b` }),
  (req, res) => {
    const date = safeFolder(req.query.date);
    if (!date) return res.status(400).json({ error: 'date query must be YYYY-MM-DD' });
    let name = safeFileName(req.query.name);
    if (!name) name = `upload-${Date.now()}`;
    const ext = path.extname(name).toLowerCase();
    if (!MEDIA_MIME[ext]) {
      return res.status(400).json({ error: `Unsupported file type: ${ext || '(none)'}` });
    }
    const buf = req.body as Buffer;
    if (!buf?.length) return res.status(400).json({ error: 'Empty upload body' });
    if (buf.length > MAX_MEDIA_BYTES) return res.status(413).json({ error: 'File exceeds 1GB limit' });

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
  if (!abs) return res.status(400).json({ error: 'Invalid date/name' });
  try {
    fs.unlinkSync(abs);
    res.json({ deleted: `${date}/${name}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function needsRefresh(conn: StoredConnection): boolean {
  return Boolean(conn.expiresAt && conn.expiresAt - Date.now() < 5 * 60 * 1000);
}

async function freshAccessToken(storeKey: 'tiktok' | 'youtube' | 'threads' | 'instagram'): Promise<string> {
  const store = loadStore();
  const conn = store[storeKey];
  if (!conn) throw new Error('Not connected.');
  if (!needsRefresh(conn)) return conn.accessToken;

  let next: any;
  if (storeKey === 'tiktok') {
    if (!conn.refreshToken) throw new Error('TikTok access token expired and no refresh token was stored — reconnect.');
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
    if (next.error || !next.access_token) throw new Error(next.error_description || 'TikTok token refresh failed.');
  } else if (storeKey === 'youtube') {
    if (!conn.refreshToken) throw new Error('Google access token expired and no refresh token was stored — reconnect.');
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
    if (next.error || !next.access_token) throw new Error(`${next.error}: ${next.error_description || 'Google refresh failed'}`);
  } else if (storeKey === 'instagram') {
    const res = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(conn.accessToken)}`,
    );
    next = await res.json();
    if (next.error_message || next.error) throw new Error(next.error_message || next.error?.message || 'Instagram token refresh failed — reconnect.');
  } else {
    const res = await fetch(
      `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(conn.accessToken)}`,
    );
    next = await res.json();
    if (next.error) throw new Error(`${next.error.message} — reconnect Threads.`);
  }

  conn.accessToken = next.access_token;
  if (next.refresh_token) conn.refreshToken = next.refresh_token;
  conn.expiresAt = Date.now() + (next.expires_in ? next.expires_in * 1000 : 3600 * 1000);
  const s2 = loadStore();
  s2[storeKey] = conn;
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
      if (me.error) return res.status(502).json({ error: `Instagram API: ${me.error.message}` });
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
      if (!conn) return res.status(400).json({ error: 'Meta is not connected. Use Connect Platform first.' });
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
      if (!conn) return res.status(400).json({ error: 'TikTok is not connected. Use Connect Platform first.' });
      const accessToken = await freshAccessToken('tiktok');
      const infoRes = await fetch(
        'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const info: any = await infoRes.json();
      const user = info.data?.user;
      if (!user) return res.status(502).json({ error: info.error?.message || 'TikTok API rejected the token.' });
      return res.json({
        platform,
        ok: true,
        identity: `${user.display_name} (${user.open_id})`,
        checkedAt: new Date().toISOString(),
      });
    }

    if (platform === 'youtube') {
      const conn = store.youtube;
      if (!conn) return res.status(400).json({ error: 'YouTube is not connected. Use Connect Platform first.' });
      const accessToken = await freshAccessToken('youtube');
      const channelsRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&mine=true',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const channels: any = await channelsRes.json();
      if (channels.error) return res.status(502).json({ error: `YouTube Data API: ${channels.error.message}` });
      const items = channels.items || [];
      if (!items.length) return res.status(404).json({ error: 'The connected Google account owns no YouTube channel.' });
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
      if (!conn) return res.status(400).json({ error: 'Threads is not connected. Use Connect Platform first.' });
      const accessToken = await freshAccessToken('threads');
      const infoRes = await fetch(
        'https://graph.threads.net/v1.0/me?fields=id,username',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      const info: any = await infoRes.json();
      if (info.error) return res.status(502).json({ error: `Threads API: ${info.error.message}` });
      return res.json({
        platform,
        ok: true,
        identity: `@${info.username} (${info.id})`,
        checkedAt: new Date().toISOString(),
      });
    }

    res.status(404).json({ error: `Unknown platform: ${platform}` });
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/api/disconnect/:platform', (req, res) => {
  const platform = req.params.platform as 'meta' | 'tiktok' | 'youtube' | 'threads' | 'instagram';
  if (!['meta', 'tiktok', 'youtube', 'threads', 'instagram'].includes(platform)) {
    return res.status(400).json({ error: 'Unknown connection.' });
  }
  const store = loadStore();
  delete store[platform];
  saveStore(store);
  res.json({ disconnected: platform });
});

app.listen(PORT, () => {
  console.log(`[relate-oauth] listening on http://localhost:${PORT}`);
  console.log(`[relate-oauth] redirect base: ${APP_BASE}`);
  console.log(`[relate-oauth] media data dir: ${MEDIA_DIR}`);
  if (!META_APP_ID || !META_APP_SECRET) console.warn('[relate-oauth] META_APP_ID / META_APP_SECRET not set — Meta flows disabled');
  if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) console.warn('[relate-oauth] TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET not set — TikTok flows disabled');
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) console.warn('[relate-oauth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — YouTube flows disabled');
});
