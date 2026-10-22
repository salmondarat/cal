import React, { useState, useRef } from 'react';
import {
  X,
  HardDrive,
  UploadCloud,
  Play,
  Film,
  Image as ImageIcon,
  Trash2,
  Download,
  Upload,
  Plus,
  Search,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import { MediaItem } from '../../types';
import { formatBytes, validateFileSize, processFileToMediaItem } from '../../utils/mediaUtils';
import {
  saveMediaItemToStorage,
  deleteStoredMediaItem,
  clearAllStoredMedia,
  exportMediaManifestJSON,
} from '../../utils/mediaStorage';

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaList: MediaItem[];
  onMediaListChange: (updated: MediaItem[]) => void;
  onSelectMediaForPost: (item: MediaItem) => void;
}

const MAX_STORAGE_POOL = 1024 * 1024 * 1024; // 1 GB pool

export const MediaLibraryModal: React.FC<MediaLibraryModalProps> = ({
  isOpen,
  onClose,
  mediaList,
  onMediaListChange,
  onSelectMediaForPost,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedItemForPreview, setSelectedItemForPreview] = useState<MediaItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const totalBytes = mediaList.reduce((acc, m) => acc + m.size, 0);
  const usagePercentage = Math.min(100, Math.round((totalBytes / MAX_STORAGE_POOL) * 100));

  const handleUploadFiles = async (files: FileList | File[]) => {
    setIsUploading(true);
    const newItems: MediaItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const val = validateFileSize(file);
      if (!val.valid) continue;

      const item = await processFileToMediaItem(file);
      await saveMediaItemToStorage(item);
      newItems.push(item);
    }

    onMediaListChange([...newItems, ...mediaList]);
    setIsUploading(false);
  };

  const handleDelete = async (id: string) => {
    await deleteStoredMediaItem(id);
    onMediaListChange(mediaList.filter((m) => m.id !== id));
    if (selectedItemForPreview?.id === id) {
      setSelectedItemForPreview(null);
    }
  };

  const handleExportJSON = () => {
    exportMediaManifestJSON(mediaList);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            await saveMediaItemToStorage(item);
          }
          onMediaListChange([...parsed, ...mediaList]);
        }
      } catch (err) {
        console.error('Import JSON error:', err);
      }
    };
    reader.readAsText(file);
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear your local stored media assets?')) {
      await clearAllStoredMedia();
      onMediaListChange([]);
    }
  };

  // Filtered media
  const filtered = mediaList.filter((item) => {
    if (filterType === 'image' && !item.type.startsWith('image/')) return false;
    if (filterType === 'video' && !item.type.startsWith('video/')) return false;
    if (searchQuery.trim()) {
      return item.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-5xl bg-white rounded-[12px] shadow-2xl border border-neutral-200/80 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-4 bg-neutral-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[8px] bg-[rgba(24,144,255,0.08)] border border-[rgba(24,144,255,0.2)] flex items-center justify-center text-[#0000ee]">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#020520] leading-none">
                Persistent Media Library & Local Storage
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Saved locally with metadata, duration, resolution and 1.0 GB quota pool
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#020520] hover:bg-[#0f1f3d] rounded-[8px] transition-colors shadow-xs cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Upload to Storage</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded-[8px] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={(e) => {
            if (e.target.files) handleUploadFiles(e.target.files);
          }}
          className="hidden"
        />
        <input
          ref={jsonImportRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportJSON}
          className="hidden"
        />

        {/* Storage Capacity Gauge & Toolbar */}
        <div className="px-5 py-3 border-b border-neutral-200/80 bg-[#fcfcfc] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Storage Bar */}
          <div className="flex items-center gap-3 flex-1 max-w-md">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs font-mono text-neutral-600 mb-1">
                <span>Storage Quota Used</span>
                <span className="font-semibold text-neutral-900">
                  {formatBytes(totalBytes)} / 1.0 GB ({usagePercentage}%)
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0000ee] transition-all"
                  style={{ width: `${Math.max(usagePercentage, 2)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Filter, Search & Export Controls */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
            {/* Filter Pills */}
            <div className="flex items-center bg-neutral-100 p-0.5 rounded-[8px] border border-neutral-200">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors ${
                  filterType === 'all'
                    ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                All ({mediaList.length})
              </button>
              <button
                onClick={() => setFilterType('video')}
                className={`px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors ${
                  filterType === 'video'
                    ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Videos
              </button>
              <button
                onClick={() => setFilterType('image')}
                className={`px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors ${
                  filterType === 'image'
                    ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Images
              </button>
            </div>

            {/* Search */}
            <div className="relative w-40">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-7 pr-2 py-1 text-xs bg-white border border-neutral-200 rounded-[8px]"
              />
            </div>

            {/* Manifest JSON Export/Import */}
            <button
              onClick={handleExportJSON}
              className="p-1.5 text-neutral-600 hover:text-[#0000ee] hover:bg-neutral-100 border border-neutral-200 rounded-[8px] transition-colors"
              title="Export Media Metadata Manifest JSON"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => jsonImportRef.current?.click()}
              className="p-1.5 text-neutral-600 hover:text-[#0000ee] hover:bg-neutral-100 border border-neutral-200 rounded-[8px] transition-colors"
              title="Import Media Metadata Manifest JSON"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Media Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fcfcfc]">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <HardDrive className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
              <h4 className="text-sm font-semibold text-neutral-700">No media assets found</h4>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                Drag and drop files here or click "Upload to Storage" to store your media library locally.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map((item) => {
                const isVideo = item.type.startsWith('video/');

                return (
                  <div
                    key={item.id}
                    className="group rounded-[8px] border border-neutral-200 bg-white overflow-hidden shadow-2xs hover:border-[#0000ee] hover:shadow-xs transition-all flex flex-col"
                  >
                    {/* Media Thumbnail */}
                    <div className="relative aspect-square bg-neutral-900 flex items-center justify-center overflow-hidden">
                      {isVideo ? (
                        <>
                          <video
                            src={item.url}
                            className="w-full h-full object-cover"
                            playsInline
                            muted
                          />
                          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                            <Play className="w-6 h-6 text-white fill-white" />
                          </div>
                        </>
                      ) : (
                        <img
                          src={item.url}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      )}

                      {/* Top Badges */}
                      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-[4px] bg-black/70 text-white text-[9px] font-mono flex items-center gap-1">
                        {isVideo ? (
                          <>
                            <Film className="w-2.5 h-2.5" />
                            <span>{item.duration ? `${item.duration}s` : 'VID'}</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-2.5 h-2.5" />
                            <span>IMG</span>
                          </>
                        )}
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-red-600 transition-all cursor-pointer"
                        title="Delete from local storage"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Metadata specs */}
                    <div className="p-2 flex-1 flex flex-col justify-between">
                      <div>
                        <h5 className="text-xs font-semibold text-neutral-900 truncate" title={item.name}>
                          {item.name}
                        </h5>
                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5 flex items-center justify-between">
                          <span>{formatBytes(item.size)}</span>
                          {item.width && item.height && (
                            <span>
                              {item.width}x{item.height}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          onSelectMediaForPost(item);
                          onClose();
                        }}
                        className="mt-2 w-full py-1 text-[11px] font-medium text-[#0000ee] bg-blue-50/70 hover:bg-blue-100/70 border border-blue-200 rounded-[6px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Schedule Post</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between bg-neutral-50/70 text-xs">
          <button
            onClick={handleClearAll}
            className="text-neutral-400 hover:text-red-600 transition-colors cursor-pointer"
          >
            Clear Stored Media Cache
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-[#020520] hover:bg-[#0f1f3d] rounded-[8px] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
