import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { PlatformId, PlatformApiCredentials } from '../../types';
import { ALL_PLATFORM_IDS, PLATFORMS } from '../../constants/platforms';
import { PlatformIcon } from '../PlatformIcon';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCredentials?: (credentials: Record<PlatformId, PlatformApiCredentials>) => void;
}

const EMPTY_CREDENTIALS = Object.fromEntries(
  ALL_PLATFORM_IDS.map((id) => [
    id,
    {
      platformId: id,
      isConnected: false,
      environment: 'production',
      lastTested: 'Not connected',
      permissions: [],
    } satisfies PlatformApiCredentials,
  ]),
) as unknown as Record<PlatformId, PlatformApiCredentials>;

interface ServerConnection {
  connected: boolean;
  maskedToken: string;
  accountIds: string[];
  accountNames: string[];
  scopes: string[];
  connectedAt: string;
}

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaveCredentials,
}) => {
  const [credentials, setCredentials] = useState<Record<PlatformId, PlatformApiCredentials>>(EMPTY_CREDENTIALS);

  const [activeTab, setActiveTab] = useState<PlatformId>('instagram');
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [testingPlatform, setTestingPlatform] = useState<PlatformId | null>(null);
  const [connecting, setConnecting] = useState<PlatformId | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const applyServerConnections = (conns: Record<string, ServerConnection>) => {
    setCredentials((prev) => {
      const next = { ...prev };
      const sync = (platforms: PlatformId[], conn?: ServerConnection) => {
        for (const pId of platforms) {
          const connected = Boolean(conn);
          let accountId = conn?.accountNames?.[0] || '';
          if (pId === 'instagram' && conn) {
            accountId = conn.accountNames.find((n) => n.includes('@')) || conn.accountNames[1] || '';
          }
          if (pId === 'facebook' && conn) {
            accountId = conn.accountNames[1] || conn.accountNames[0] || '';
          }
          next[pId] = {
            ...next[pId],
            isConnected: connected,
            accessToken: conn?.maskedToken || next[pId].accessToken || '',
            accountId: conn ? accountId : next[pId].accountId,
            environment: connected ? 'production' : prev[pId].environment,
            permissions: conn ? conn.scopes : prev[pId].permissions,
            lastTested: conn
              ? `OAuth completed ${new Date(conn.connectedAt).toLocaleString()}`
              : 'Not connected',
          };
        }
      };
      sync(['facebook'], conns.meta);
      // Instagram tab: standalone Instagram Login wins; a Meta connection with a
      // connected IG account also counts.
      sync(['instagram'], conns.instagram || (conns.meta && conns.meta.accountNames.some((n) => n.includes('@')) ? conns.meta : undefined));
      sync(['threads'], conns.threads);
      sync(['tiktok'], conns.tiktok);
      sync(['youtube'], conns.youtube);
      return next;
    });
  };

  const [serverConns, setServerConns] = useState<Record<string, ServerConnection>>({});

  const refreshConnections = async () => {
    try {
      const conns = await fetch('/api/connections').then((r) => r.json());
      setServerConns(conns);
      applyServerConnections(conns);
      return conns as Record<string, ServerConnection>;
    } catch {
      setServerError('OAuth backend is not running. Start it with `npm run dev:server`.');
      return null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setServerError(null);
      refreshConnections();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const onMessage = async (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.type !== 'relate-oauth') return;
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      const conns = await refreshConnections();
      setConnecting(null);
      if (d.ok) {
        setTestResult({
          success: true,
          message: d.message || `${d.platform} connected.`,
        });
      } else {
        setTestResult({ success: false, message: `${d.platform}: ${d.message || 'consent failed'}` });
      }
      return conns;
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isOpen) return null;

  const currentCred = credentials[activeTab];
  const pConfig = PLATFORMS[activeTab];
  const instagramViaMeta = Boolean(
    serverConns.meta && !serverConns.instagram && serverConns.meta.accountNames.some((n) => n.includes('@')),
  );

  const toggleShowToken = (key: string) => {
    setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const OAUTH_START_PATH: Record<PlatformId, string> = {
    instagram: '/auth/instagram/start',
    facebook: '/auth/meta/start',
    threads: '/auth/threads/start',
    tiktok: '/auth/tiktok/start',
    youtube: '/auth/google/start',
  };

  const CONNECTION_GROUP: Record<PlatformId, 'meta' | 'threads' | 'tiktok' | 'youtube' | 'instagram'> = {
    instagram: 'instagram',
    facebook: 'meta',
    threads: 'threads',
    tiktok: 'tiktok',
    youtube: 'youtube',
  };

  const OAUTH_PROVIDER: Record<PlatformId, string> = {
    instagram: 'Instagram',
    facebook: 'Meta',
    threads: 'Meta',
    tiktok: 'TikTok',
    youtube: 'Google',
  };

  const handleConnect = async (platformId: PlatformId) => {
    setServerError(null);
    const oauthPath = OAUTH_START_PATH[platformId];
    const probeRes = await fetch(oauthPath, { redirect: 'manual' }).catch(() => null);
    if (!probeRes) {
      setServerError('OAuth backend is not running. Start it with `npm run dev:server`.');
      return;
    }
    if (probeRes.status === 400) {
      const data = await probeRes.json().catch(() => ({}));
      setTestResult({ success: false, message: data.error || 'OAuth provider is not configured on the backend.' });
      return;
    }
    setConnecting(platformId);
    setTestResult(null);
    const tab = window.open(oauthPath, '_blank');
    if (!tab) {
      setConnecting(null);
      setTestResult({ success: false, message: 'The browser blocked the login tab. Allow popups for this site and try again.' });
      return;
    }

    const group = CONNECTION_GROUP[platformId];
    const started = Date.now();
    const finish = (success: boolean, message: string) => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setConnecting(null);
      setTestResult({ success, message });
    };
    const poll = window.setInterval(async () => {
      let conns: Record<string, ServerConnection>;
      try {
        conns = await fetch('/api/connections').then((r) => r.json());
      } catch {
        return finish(false, 'Lost contact with the OAuth backend — is `npm run dev:server` still running?');
      }
      if (conns[group]) {
        applyServerConnections(conns);
        return finish(true, `Live OAuth completed for ${conns[group].accountNames.join(', ')}.`);
      }
      if (tab.closed) {
        return finish(
          false,
          'Login tab was closed before the connection finished — nothing was stored. Click Connect to try again.',
        );
      }
      if (Date.now() - started > 90000) {
        return finish(false, 'No completed connection after 90s. Check the login tab for an error (consent denied, wrong redirect URI, or account not a tester).');
      }
    }, 1500);
    pollTimerRef.current = poll;
  };

  const handleTestConnection = async (platformId: PlatformId) => {
    setTestingPlatform(platformId);
    setTestResult(null);
    try {
      const res = await fetch(`/api/verify/${platformId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setCredentials((prev) => ({
        ...prev,
        [platformId]: {
          ...prev[platformId],
          isConnected: data.ok,
          lastTested: `Live API verified ${new Date(data.checkedAt).toLocaleTimeString()}`,
        },
      }));
      setTestResult({
        success: data.ok,
        message: data.ok
          ? `Live ${PLATFORMS[platformId].name} API handshake OK — identity: ${data.identity}` +
            (data.instagram?.length ? ` · Instagram: ${data.instagram.map((i: any) => `@${i.username}`).join(', ')}` : '')
          : data.warning || 'Verified, but no usable account was returned.',
      });
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTestingPlatform(null);
    }
  };

  const handleDisconnect = async (platformId: PlatformId) => {
    await fetch(`/api/disconnect/${CONNECTION_GROUP[platformId]}`, { method: 'POST' }).catch(() => {});
    await refreshConnections();
    setTestResult(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white rounded-[12px] shadow-2xl border border-neutral-200/80 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-4 bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[8px] bg-[rgba(24,144,255,0.08)] border border-[rgba(24,144,255,0.2)] flex items-center justify-center text-[#0000ee]">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#020520] leading-none">
                Official Platform API & Connection Settings
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Configure direct Graph API, OAuth keys, and tokens for Instagram, Facebook, Threads, TikTok & YouTube
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-[8px] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#fcfcfc]">
          {/* Platform Navigation Tabs */}
          <div className="flex items-center gap-1.5 border-b border-neutral-200 pb-2 overflow-x-auto">
            {ALL_PLATFORM_IDS.map((pId) => {
              const isActive = activeTab === pId;
              const p = PLATFORMS[pId];
              const cred = credentials[pId];

              return (
                <button
                  key={pId}
                  onClick={() => {
                    setActiveTab(pId);
                    setTestResult(null);
                  }}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-[#020520] text-white shadow-xs'
                      : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300'
                  }`}
                >
                  <PlatformIcon platform={pId} size={15} />
                  <span>{p.name}</span>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      cred?.isConnected ? 'bg-emerald-400' : 'bg-neutral-300'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Platform Settings Form */}
          <div className="p-4 rounded-[8px] relate-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <PlatformIcon platform={activeTab} size={22} />
                <div>
                  <h4 className="text-sm font-semibold text-[#020520] leading-tight">
                    {pConfig.name} Integration
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-neutral-500 font-mono mt-0.5">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        currentCred.isConnected ? 'text-emerald-700' : 'text-neutral-500'
                      }`}
                    >
                      {currentCred.isConnected ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Connected ({currentCred.environment})</span>
                        </>
                      ) : (
                        <span>Disconnected</span>
                      )}
                    </span>
                    <span>·</span>
                    <span>{currentCred.lastTested || 'Never tested'}</span>
                  </div>
                </div>
              </div>

              {/* Status Action */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {activeTab === 'instagram' ? (
                  <>
                    {serverConns.instagram ? (
                      <>
                        <span className="text-[11px] text-emerald-700 font-mono">
                          @{serverConns.instagram.accountNames[0]?.replace('@', '')} · Instagram Login
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDisconnect('instagram')}
                          className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-[6px] transition-colors"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={connecting === 'instagram'}
                        onClick={() => handleConnect('instagram')}
                        className="px-2.5 py-1 text-xs text-[#0000ee] hover:bg-blue-50 border border-blue-200 rounded-[6px] transition-colors font-medium disabled:opacity-50"
                      >
                        {connecting === 'instagram' ? 'Waiting for Instagram approval...' : 'Connect via Instagram Login'}
                      </button>
                    )}
                    {instagramViaMeta ? (
                      <span className="text-[11px] text-neutral-500">
                        also connected via Facebook Page ·{' '}
                        <button
                          type="button"
                          onClick={() => handleDisconnect('facebook')}
                          className="text-red-600 hover:underline cursor-pointer"
                        >
                          disconnect
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={connecting === 'facebook'}
                        onClick={() => handleConnect('facebook')}
                        className="px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 border border-neutral-300 rounded-[6px] transition-colors font-medium disabled:opacity-50"
                      >
                        {connecting === 'facebook' ? 'Waiting for Meta approval...' : 'Connect via Facebook Page'}
                      </button>
                    )}
                  </>
                ) : currentCred.isConnected ? (
                  <button
                    type="button"
                    onClick={() => handleDisconnect(activeTab)}
                    className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-[6px] transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={connecting === activeTab}
                    onClick={() => handleConnect(activeTab)}
                    className="px-2.5 py-1 text-xs text-[#0000ee] hover:bg-blue-50 border border-blue-200 rounded-[6px] transition-colors font-medium disabled:opacity-50"
                  >
                    {connecting === activeTab
                      ? 'Waiting for OAuth approval...'
                      : `Connect via ${OAUTH_PROVIDER[activeTab]} OAuth`}
                  </button>
                )}
              </div>
            </div>

            {/* Backend status banner */}
            {serverError && (
              <div className="p-3 rounded-[8px] text-xs flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            {/* Test result feedback banner */}
            {testResult && (
              <div
                className={`p-3 rounded-[8px] text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Form Fields according to platform */}
            <div className="space-y-3 pt-2">
              {/* Account ID / Handle */}
              <div>
                <label className="text-xs font-semibold text-neutral-800 mb-1 block">
                  {activeTab === 'instagram'
                    ? 'Instagram Professional Account ID'
                    : activeTab === 'facebook'
                    ? 'Facebook Page ID'
                    : activeTab === 'youtube'
                    ? 'YouTube Channel ID / Handle'
                    : `${pConfig.name} Account Identifier`}
                </label>
                <input
                  type="text"
                  value={currentCred.accountId || ''}
                  readOnly
                  disabled
                  placeholder="Filled automatically after Connect"
                  className="w-full px-3 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-[8px] font-mono disabled:text-neutral-500"
                />
              </div>

              {/* Access Token / Bearer Key */}
              <div>
                <label className="text-xs font-semibold text-neutral-800 mb-1 flex items-center justify-between">
                  <span>
                    {activeTab === 'youtube' ? 'OAuth 2.0 Access Token / Key' : 'Page Access Token / Bearer Secret'}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleShowToken(`${activeTab}_token`)}
                    className="text-[11px] text-[#0000ee] flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    {showTokens[`${activeTab}_token`] ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        <span>Hide</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        <span>Reveal</span>
                      </>
                    )}
                  </button>
                </label>
                <div className="relative">
                  <input
                    type={showTokens[`${activeTab}_token`] ? 'text' : 'password'}
                    value={currentCred.accessToken || ''}
                    readOnly
                    disabled
                    placeholder="Managed by the OAuth backend after Connect"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px] font-mono focus:outline-none focus:ring-1 focus:ring-[#0000ee] disabled:bg-neutral-50 disabled:text-neutral-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Active Scopes list */}
              <div>
                <label className="text-xs font-semibold text-neutral-800 mb-1 block">
                  Configured API Scopes
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {currentCred.permissions.map((scope, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-[10px] font-mono text-[#0000ee] bg-blue-50/80 border border-blue-200/80 rounded-[4px]"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Test Connection Button */}
            <div className="pt-3 border-t border-[rgba(24,144,255,0.15)] flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                Tokens live in the local OAuth backend (.secrets/connections.json) — the browser only sees a masked preview.
              </span>

              <button
                type="button"
                disabled={testingPlatform === activeTab}
                onClick={() => handleTestConnection(activeTab)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0000ee] hover:bg-[#0000cc] rounded-[8px] transition-colors shadow-xs cursor-pointer disabled:opacity-50"
              >
                {testingPlatform === activeTab ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Verifying Handshake...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Test API Connection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-200 flex items-center justify-end bg-neutral-50/70">
          <button
            onClick={() => {
              onSaveCredentials?.(credentials);
              onClose();
            }}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-[#020520] hover:bg-[#0f1f3d] rounded-[8px] transition-colors shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
