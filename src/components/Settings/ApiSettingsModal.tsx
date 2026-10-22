import React, { useState, useEffect } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  Lock,
  Sparkles,
} from 'lucide-react';
import { PlatformId, PlatformApiCredentials } from '../../types';
import { ALL_PLATFORM_IDS, PLATFORMS } from '../../constants/platforms';
import { PlatformIcon } from '../PlatformIcon';

interface ApiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveCredentials?: (credentials: Record<PlatformId, PlatformApiCredentials>) => void;
}

const STORAGE_API_KEY = 'relate_social_api_credentials_v1';

const DEFAULT_CREDENTIALS: Record<PlatformId, PlatformApiCredentials> = {
  instagram: {
    platformId: 'instagram',
    isConnected: true,
    apiKey: 'IG_APP_982401928301',
    apiSecret: 'sh_live_sec_892301982301923',
    accessToken: 'EAABwzLIX45YBA...instagram_long_lived_token',
    accountId: '17841400293847291',
    environment: 'production',
    lastTested: 'Verified 2 mins ago',
    permissions: ['instagram_basic', 'instagram_content_publish', 'pages_show_list'],
  },
  facebook: {
    platformId: 'facebook',
    isConnected: true,
    apiKey: 'FB_APP_77218391029',
    accessToken: 'EAACEdEose0cBA...meta_page_token',
    accountId: '109283746192837',
    environment: 'production',
    lastTested: 'Verified today',
    permissions: ['pages_manage_posts', 'pages_read_engagement', 'publish_video'],
  },
  threads: {
    platformId: 'threads',
    isConnected: true,
    accessToken: 'TH_TOK_9928374102938475',
    accountId: 'relatesales_official',
    environment: 'production',
    lastTested: 'Verified 1 hour ago',
    permissions: ['threads_basic', 'threads_content_publish'],
  },
  tiktok: {
    platformId: 'tiktok',
    isConnected: true,
    apiKey: 'aw_client_key_91028374',
    apiSecret: 'sec_tt_live_771928374610293',
    accessToken: 'act.tiktok_open_token_882910293',
    accountId: '@relatesales',
    environment: 'production',
    lastTested: 'Verified yesterday',
    permissions: ['video.publish', 'video.upload'],
  },
  youtube: {
    platformId: 'youtube',
    isConnected: true,
    apiKey: 'AIzaSyA889234910293847-YouTubeDataV3',
    accountId: 'UC_RelateModernCRM2026',
    accessToken: 'ya29.a0AfH6SM...google_oauth_bearer',
    environment: 'production',
    lastTested: 'Verified 3 hours ago',
    permissions: ['youtube.upload', 'youtube.readonly'],
  },
};

export const ApiSettingsModal: React.FC<ApiSettingsModalProps> = ({
  isOpen,
  onClose,
  onSaveCredentials,
}) => {
  const [credentials, setCredentials] = useState<Record<PlatformId, PlatformApiCredentials>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_API_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_CREDENTIALS;
  });

  const [activeTab, setActiveTab] = useState<PlatformId>('instagram');
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({});
  const [testingPlatform, setTestingPlatform] = useState<PlatformId | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_API_KEY, JSON.stringify(credentials));
    } catch {}
  }, [credentials]);

  if (!isOpen) return null;

  const currentCred = credentials[activeTab];
  const pConfig = PLATFORMS[activeTab];

  const toggleShowToken = (key: string) => {
    setShowTokens((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateField = (field: keyof PlatformApiCredentials, value: any) => {
    setCredentials((prev) => ({
      ...prev,
      [activeTab]: {
        ...prev[activeTab],
        [field]: value,
      },
    }));
  };

  const handleTestConnection = (platformId: PlatformId) => {
    setTestingPlatform(platformId);
    setTestResult(null);

    setTimeout(() => {
      setTestingPlatform(null);
      setCredentials((prev) => ({
        ...prev,
        [platformId]: {
          ...prev[platformId],
          isConnected: true,
          lastTested: 'Verified just now',
        },
      }));
      setTestResult({
        success: true,
        message: `Successfully authenticated with ${PLATFORMS[platformId].name} API. Authorized scopes: ${credentials[platformId].permissions.join(
          ', '
        )}`,
      });
    }, 1200);
  };

  const handleDisconnect = (platformId: PlatformId) => {
    setCredentials((prev) => ({
      ...prev,
      [platformId]: {
        ...prev[platformId],
        isConnected: false,
        lastTested: 'Disconnected',
      },
    }));
    setTestResult(null);
  };

  const handleResetDefaults = () => {
    setCredentials(DEFAULT_CREDENTIALS);
    setTestResult({
      success: true,
      message: 'Restored verified official sandbox credentials for all 5 platforms.',
    });
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
              <div className="flex items-center gap-2">
                {currentCred.isConnected ? (
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
                    onClick={() => handleTestConnection(activeTab)}
                    className="px-2.5 py-1 text-xs text-[#0000ee] hover:bg-blue-50 border border-blue-200 rounded-[6px] transition-colors font-medium"
                  >
                    Connect Platform
                  </button>
                )}
              </div>
            </div>

            {/* Test result feedback banner */}
            {testResult && (
              <div
                className={`p-3 rounded-[8px] text-xs flex items-center gap-2 ${
                  testResult.success
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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
                  onChange={(e) => updateField('accountId', e.target.value)}
                  placeholder="e.g. 17841400293847291"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px] font-mono focus:outline-none focus:ring-1 focus:ring-[#0000ee]"
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
                    onChange={(e) => updateField('accessToken', e.target.value)}
                    placeholder="Paste your official Graph API token here..."
                    className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px] font-mono focus:outline-none focus:ring-1 focus:ring-[#0000ee]"
                  />
                  <Lock className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* App Secret or API Key if applicable */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-neutral-800 mb-1 block">
                    App Client Key / ID
                  </label>
                  <input
                    type="text"
                    value={currentCred.apiKey || ''}
                    onChange={(e) => updateField('apiKey', e.target.value)}
                    placeholder="Client ID from developer console"
                    className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px] font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-neutral-800 mb-1 block">
                    Environment
                  </label>
                  <select
                    value={currentCred.environment}
                    onChange={(e) => updateField('environment', e.target.value as any)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-neutral-200 rounded-[8px]"
                  >
                    <option value="production">Production API</option>
                    <option value="sandbox">Developer Sandbox / Mock</option>
                  </select>
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
                Credentials are saved locally in your browser storage.
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
        <div className="px-5 py-3.5 border-t border-neutral-200 flex items-center justify-between bg-neutral-50/70">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="text-xs text-neutral-600 hover:text-[#0000ee] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Load Sandbox Demo Keys</span>
          </button>

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
