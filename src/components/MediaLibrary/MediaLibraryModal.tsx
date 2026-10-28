import React, { useEffect, useRef, useState } from 'react';
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
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  CornerDownRight,
  Maximize2,
} from 'lucide-react';
import { LibraryFolder, LibraryListing, LibraryRoot, MediaItem } from '../../types';
import { formatBytes, validateFileSize, processFileToMediaItem } from '../../utils/mediaUtils';
import { toUserMessage } from '../../utils/errorMessages';
import { friendlyErrorTitle } from '../../utils/explainError';
import { MediaThumb } from './MediaThumb';
import { MediaPreviewModal } from './MediaPreviewModal';
import {
  saveMediaItemToStorage,
  deleteStoredMediaItem,
  clearAllStoredMedia,
  exportMediaManifestJSON,
} from '../../utils/mediaStorage';
import {
  addLibraryRoot,
  getLibraryRoots,
  joinLibraryPath,
  libraryFileToMediaItem,
  listLibraryFolder,
  pickLibraryFolder,
  removeLibraryRoot,
  splitLibraryPath,
} from '../../utils/localLibrary';

interface MediaLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaList: MediaItem[];
  onMediaListChange: (updated: MediaItem[]) => void;
  onSelectMediaForPost: (item: MediaItem) => void;
}

const MAX_STORAGE_POOL = 1024 * 1024 * 1024; // 1 GB pool

const formatDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

type Mode = 'stored' | 'library';

export const MediaLibraryModal: React.FC<MediaLibraryModalProps> = ({
  isOpen,
  onClose,
  mediaList,
  onMediaListChange,
  onSelectMediaForPost,
}) => {
  const [mode, setMode] = useState<Mode>('stored');
  const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [previewState, setPreviewState] = useState<{ items: MediaItem[]; index: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  // ---- Local folder library state ----
  const [roots, setRoots] = useState<LibraryRoot[]>([]);
  const [rootsLoading, setRootsLoading] = useState(false);
  const [newRootPath, setNewRootPath] = useState('');
  const [isAddingRoot, setIsAddingRoot] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [activeRootId, setActiveRootId] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState('');
  const [listing, setListing] = useState<LibraryListing | null>(null);
  const [listingLoading, setListingLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryTypeFilter, setLibraryTypeFilter] = useState<'all' | 'image' | 'video'>('all');
  const [librarySort, setLibrarySort] = useState<'name-asc' | 'name-desc' | 'newest' | 'oldest' | 'largest' | 'smallest'>('name-asc');
  const [treeChildren, setTreeChildren] = useState<Record<string, LibraryFolder[]>>({});
  const [treeLoading, setTreeLoading] = useState<Record<string, boolean>>({});
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  const rootsLoadedRef = useRef(false);

  const loadRoots = async () => {
    setRootsLoading(true);
    setLibraryError(null);
    try {
      const list = await getLibraryRoots();
      setRoots(list);
      setActiveRootId((prev) => (prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null));
    } catch (e) {
      setLibraryError(toUserMessage(e, 'Could not open the local media library. Please try again.'));
    } finally {
      setRootsLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || rootsLoadedRef.current) return;
    rootsLoadedRef.current = true;
    loadRoots();
  }, [isOpen]);

  useEffect(() => {
    if (mode !== 'library' || !activeRootId) return;
    let cancelled = false;
    setListingLoading(true);
    setListing(null);
    setLibraryError(null);
    listLibraryFolder(activeRootId, currentPath)
      .then((result) => {
        if (cancelled) return;
        setListing(result);
        setTreeChildren((prev) => ({ ...prev, [`${activeRootId}:${currentPath}`]: result.folders }));
      })
      .catch((e) => {
        if (!cancelled) setLibraryError(toUserMessage(e, 'This folder could not be scanned. Please try again.'));
      })
      .finally(() => {
        if (!cancelled) setListingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, activeRootId, currentPath, refreshTick]);

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

      try {
        const item = await processFileToMediaItem(file);
        newItems.push(await saveMediaItemToStorage(item));
      } catch (err) {
        const raw = toUserMessage(err, 'the upload did not finish');
        setLibraryError(`${file.name}: ${friendlyErrorTitle(raw) || raw}`);
      }
    }

    onMediaListChange([...newItems, ...mediaList]);
    setIsUploading(false);
  };

  const handleDelete = async (id: string) => {
    await deleteStoredMediaItem(id);
    onMediaListChange(mediaList.filter((m) => m.id !== id));
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
      } catch {
        console.error('The media list could not be imported. Check the file and try again.');
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

  // ---- Local folder actions ----

  const registerRoot = async (folderPath: string) => {
    const root = await addLibraryRoot(folderPath);
    setRoots((prev) => (prev.some((r) => r.id === root.id) ? prev : [...prev, root]));
    setActiveRootId(root.id);
    setCurrentPath('');
    setExpandedFolders((prev) => ({ ...prev, [`${root.id}:`]: true }));
  };

  const handleAddRoot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRootPath.trim()) return;
    setIsAddingRoot(true);
    setLibraryError(null);
    try {
      await registerRoot(newRootPath.trim());
      setNewRootPath('');
    } catch (err) {
      setLibraryError(toUserMessage(err, 'That folder could not be added. Please try again.'));
    } finally {
      setIsAddingRoot(false);
    }
  };

  const handleBrowseFolder = async () => {
    setIsPickingFolder(true);
    setLibraryError(null);
    try {
      const result = await pickLibraryFolder();
      if (!result.canceled && result.path) {
        setNewRootPath(result.path);
        await registerRoot(result.path);
        setNewRootPath('');
      }
    } catch (err) {
      setLibraryError(toUserMessage(err, 'The folder picker could not open. Paste the folder path instead.'));
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleRemoveRoot = async (root: LibraryRoot) => {
    if (!window.confirm(`Remove "${root.name}" from the library? Files are not deleted.`)) return;
    try {
      await removeLibraryRoot(root.id);
      setRoots((prev) => prev.filter((r) => r.id !== root.id));
      if (activeRootId === root.id) {
        const next = roots.find((r) => r.id !== root.id);
        setActiveRootId(next?.id ?? null);
        setCurrentPath('');
        setListing(null);
      }
    } catch (err) {
      setLibraryError(toUserMessage(err, 'That folder could not be removed. Please try again.'));
    }
  };

  const selectFolder = (rootId: string, path: string) => {
    setActiveRootId(rootId);
    setCurrentPath(path);
    setExpandedFolders((prev) => ({ ...prev, [`${rootId}:${path}`]: true }));
  };

  const toggleFolder = async (rootId: string, path: string) => {
    const key = `${rootId}:${path}`;
    const next = !expandedFolders[key];
    setExpandedFolders((prev) => ({ ...prev, [key]: next }));
    if (!next || treeChildren[key] || treeLoading[key]) return;
    setTreeLoading((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await listLibraryFolder(rootId, path);
      setTreeChildren((prev) => ({ ...prev, [key]: result.folders }));
    } catch (err) {
      setLibraryError(toUserMessage(err, 'This folder could not be scanned. Please try again.'));
    } finally {
      setTreeLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const activeRoot = roots.find((r) => r.id === activeRootId) || null;
  const breadcrumbSegments = splitLibraryPath(currentPath);

  const renderTreeNodes = (rootId: string, nodes: LibraryFolder[], depth: number): React.ReactNode =>
    nodes.map((node) => {
      const key = `${rootId}:${node.path}`;
      const isExpanded = Boolean(expandedFolders[key]);
      const isActive = activeRootId === rootId && currentPath === node.path;
      const children = treeChildren[key];
      return (
        <div key={key}>
          <div
            className={`group flex items-center gap-0.5 rounded-[6px] pr-1 ${
              isActive ? 'bg-[#f5f3ff] text-[#6d28d9]' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
            style={{ paddingLeft: `${depth * 12}px` }}
          >
            <button
              type="button"
              onClick={() => toggleFolder(rootId, node.path)}
              className="p-0.5 rounded-[4px] hover:bg-neutral-200/70 shrink-0"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {treeLoading[key] ? (
                <RefreshCw className="w-3 h-3 animate-spin" />
              ) : isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
            <button
              type="button"
              onClick={() => selectFolder(rootId, node.path)}
              className="flex items-center gap-1.5 py-1 text-xs truncate flex-1 min-w-0 text-left"
              title={node.path}
            >
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Folder className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
          </div>
          {isExpanded && children && children.length > 0 && renderTreeNodes(rootId, children, depth + 1)}
          {isExpanded && children && children.length === 0 && (
            <div
              className="text-[10px] text-neutral-400 py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
            >
              No subfolders
            </div>
          )}
        </div>
      );
    });

  // Filtered stored media
  const filtered = mediaList.filter((item) => {
    if (filterType === 'image' && !item.type.startsWith('image/')) return false;
    if (filterType === 'video' && !item.type.startsWith('video/')) return false;
    if (searchQuery.trim()) {
      return item.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const libraryCounts = listing
    ? {
        all: listing.files.length,
        image: listing.files.filter((f) => f.type.startsWith('image/')).length,
        video: listing.files.filter((f) => f.type.startsWith('video/')).length,
      }
    : { all: 0, image: 0, video: 0 };

  const libraryMediaItems: MediaItem[] = listing
    ? [...listing.files]
        .filter((file) => {
          if (libraryTypeFilter === 'image' && !file.type.startsWith('image/')) return false;
          if (libraryTypeFilter === 'video' && !file.type.startsWith('video/')) return false;
          return searchQuery.trim() ? file.name.toLowerCase().includes(searchQuery.toLowerCase()) : true;
        })
        .sort((a, b) => {
          switch (librarySort) {
            case 'name-desc':
              return b.name.localeCompare(a.name, undefined, { numeric: true });
            case 'newest':
              return new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime();
            case 'oldest':
              return new Date(a.modifiedAt).getTime() - new Date(b.modifiedAt).getTime();
            case 'largest':
              return b.size - a.size;
            case 'smallest':
              return a.size - b.size;
            default:
              return a.name.localeCompare(b.name, undefined, { numeric: true });
          }
        })
        .map((file) => libraryFileToMediaItem(listing.root, file))
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[rgba(15,23,42,0.34)] backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="relative w-full max-w-6xl bg-white rounded-2xl shadow-[0_24px_64px_-16px_rgba(15,23,42,0.34)] border border-[#dde3ec] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 flex items-center justify-between gap-4 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-[8px] bg-[rgba(124,58,237,0.08)] border border-[rgba(124,58,237,0.2)] flex items-center justify-center text-[#6d28d9]">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#0f172a] leading-none">
                Media Library & Local Storage
              </h3>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {mode === 'stored'
                  ? 'Saved locally with metadata, duration, resolution and 1.0 GB quota pool'
                  : 'Scan folders on this computer and schedule from them directly'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-neutral-100 p-0.5 rounded-[8px] border border-neutral-200">
              <button
                onClick={() => setMode('stored')}
                className={`px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors ${
                  mode === 'stored'
                    ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                Stored
              </button>
              <button
                onClick={() => setMode('library')}
                className={`px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors flex items-center gap-1 ${
                  mode === 'library'
                    ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                <FolderOpen className="w-3 h-3" />
                Local Folders
              </button>
            </div>

            {mode === 'stored' && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[8px] transition-colors shadow-xs cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Upload to Storage</span>
              </button>
            )}

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
          ref={jsonInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportJSON}
          className="hidden"
        />

        {mode === 'stored' ? (
          <>
            {/* Storage Capacity Gauge & Toolbar */}
            <div className="px-5 py-3 border-b border-neutral-200/80 bg-[#fafbfd] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
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
                      className="h-full bg-[#6d28d9] transition-all"
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
                  className="p-1.5 text-neutral-600 hover:text-[#6d28d9] hover:bg-neutral-100 border border-neutral-200 rounded-[8px] transition-colors"
                  title="Export Media Metadata Manifest JSON"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => jsonInputRef.current?.click()}
                  className="p-1.5 text-neutral-600 hover:text-[#6d28d9] hover:bg-neutral-100 border border-neutral-200 rounded-[8px] transition-colors"
                  title="Import Media Metadata Manifest JSON"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Media Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#fafbfd]">
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
                  {filtered.map((item, idx) => {
                    const isVideo = item.type.startsWith('video/');

                    return (
                      <div
                        key={item.id}
                        className="group rounded-[8px] border border-neutral-200 bg-white overflow-hidden shadow-2xs hover:border-[#6d28d9] hover:shadow-xs transition-all flex flex-col"
                      >
                        {/* Media Thumbnail */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setPreviewState({ items: filtered, index: idx })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setPreviewState({ items: filtered, index: idx });
                            }
                          }}
                          className="relative aspect-square bg-neutral-900 flex items-center justify-center overflow-hidden cursor-zoom-in text-left"
                          title="Preview"
                        >
                          <MediaThumb item={item} />

                          {isVideo && (
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                              <Play className="w-6 h-6 text-white fill-white drop-shadow" />
                            </div>
                          )}

                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none flex items-center justify-center">
                            <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-90 transition-opacity drop-shadow" />
                          </div>

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
                            className="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 p-1 rounded-full bg-[rgba(15,23,42,0.34)] text-white hover:bg-red-600 transition-all cursor-pointer"
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
                            className="mt-2 w-full py-1 text-[11px] font-medium text-[#6d28d9] bg-[#f5f3ff]/70 hover:bg-[#ede9fe]/70 border border-[#ddd6fe] rounded-[6px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
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
            <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between bg-white text-xs">
              <button
                onClick={handleClearAll}
                className="text-neutral-400 hover:text-red-600 transition-colors cursor-pointer"
              >
                Clear Stored Media Cache
              </button>

              <button
                onClick={onClose}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[8px] transition-colors"
              >
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 flex min-h-0">
              {/* Folder tree sidebar */}
              <aside className="w-64 shrink-0 border-r border-neutral-200 bg-[#fafbfd] flex flex-col">
                <div className="px-3 py-2.5 border-b border-neutral-200/80 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                    Folders
                  </span>
                  <button
                    onClick={loadRoots}
                    className="p-1 text-neutral-500 hover:text-[#6d28d9] hover:bg-neutral-100 rounded-[6px] transition-colors"
                    title="Rescan library folders"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${rootsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                  {roots.length === 0 && !rootsLoading && (
                    <div className="text-[11px] text-neutral-400 px-2 py-6 text-center leading-relaxed">
                      No folders added yet.
                      <br />
                      Add a folder path below to scan it.
                    </div>
                  )}

                  {roots.map((root) => {
                    const key = `${root.id}:`;
                    const isExpanded = Boolean(expandedFolders[key]);
                    const isActive = activeRootId === root.id && currentPath === '';
                    const children = treeChildren[key];
                    return (
                      <div key={root.id}>
                        <div
                          className={`group flex items-center gap-0.5 rounded-[6px] pr-1 ${
                            isActive ? 'bg-[#f5f3ff] text-[#6d28d9]' : 'text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleFolder(root.id, '')}
                            className="p-0.5 rounded-[4px] hover:bg-neutral-200/70 shrink-0"
                            title={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {treeLoading[key] ? (
                              <RefreshCw className="w-3 h-3 animate-spin" />
                            ) : isExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => selectFolder(root.id, '')}
                            className="flex items-center gap-1.5 py-1 text-xs font-medium truncate flex-1 min-w-0 text-left"
                            title={root.path}
                          >
                            {isExpanded ? (
                              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Folder className="w-3.5 h-3.5 shrink-0" />
                            )}
                            <span className="truncate">{root.name}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveRoot(root)}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-neutral-400 hover:text-red-600 rounded-[4px] shrink-0"
                            title="Remove folder from library"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        {!root.exists && (
                          <div className="pl-7 text-[10px] text-red-500">Folder not found</div>
                        )}
                        {isExpanded && children && children.length > 0 && renderTreeNodes(root.id, children, 1)}
                        {isExpanded && children && children.length === 0 && (
                          <div className="pl-7 text-[10px] text-neutral-400 py-0.5">No subfolders</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add folder form */}
                <form onSubmit={handleAddRoot} className="p-2 border-t border-neutral-200/80 bg-white">
                  <label className="text-[10px] font-semibold text-neutral-500 flex items-center gap-1 mb-1">
                    <FolderPlus className="w-3 h-3" />
                    Add local folder
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={newRootPath}
                      onChange={(e) => setNewRootPath(e.target.value)}
                      placeholder={'C:\\Users\\you\\Pictures'}
                      className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-white border border-neutral-200 rounded-[6px]"
                    />
                    <button
                      type="submit"
                      disabled={isAddingRoot || !newRootPath.trim()}
                      className="p-1.5 text-white bg-[#0f172a] hover:bg-[#1e293b] disabled:opacity-40 rounded-[6px] transition-colors"
                      title="Scan folder"
                    >
                      {isAddingRoot ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleBrowseFolder}
                    disabled={isPickingFolder}
                    className="mt-1 w-full inline-flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] font-medium text-neutral-700 bg-white hover:bg-neutral-50 disabled:opacity-50 border border-neutral-200 rounded-[6px] transition-colors"
                    title="Open the system folder picker"
                  >
                    {isPickingFolder ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Choosing folder...
                      </>
                    ) : (
                      <>
                        <FolderOpen className="w-3.5 h-3.5" />
                        Browse folder...
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-neutral-400 mt-1">
                    Browse or paste a full path. Files stay in place — nothing is copied.
                  </p>
                </form>
              </aside>

              {/* Browser pane */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="px-4 py-2.5 border-b border-neutral-200/80 flex items-center justify-between gap-3 bg-white">
                  <div className="flex items-center gap-1 text-xs min-w-0 overflow-x-auto">
                    {activeRoot ? (
                      <>
                        <button
                          onClick={() => setCurrentPath('')}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[4px] shrink-0 ${
                            currentPath ? 'text-neutral-500 hover:text-[#6d28d9] hover:bg-neutral-100' : 'font-semibold text-neutral-900'
                          }`}
                          title={activeRoot.path}
                        >
                          <HardDrive className="w-3.5 h-3.5" />
                          {activeRoot.name}
                        </button>
                        {breadcrumbSegments.map((segment, index) => {
                          const target = joinLibraryPath(breadcrumbSegments.slice(0, index + 1));
                          const isLast = index === breadcrumbSegments.length - 1;
                          return (
                            <React.Fragment key={target}>
                              <ChevronRight className="w-3 h-3 text-neutral-300 shrink-0" />
                              <button
                                onClick={() => setCurrentPath(target)}
                                className={`px-1.5 py-0.5 rounded-[4px] shrink-0 ${
                                  isLast ? 'font-semibold text-neutral-900' : 'text-neutral-500 hover:text-[#6d28d9] hover:bg-neutral-100'
                                }`}
                              >
                                {segment}
                              </button>
                            </React.Fragment>
                          );
                        })}
                      </>
                    ) : (
                      <span className="text-neutral-400">No folder selected</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative w-44">
                      <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter this folder..."
                        className="w-full pl-7 pr-2 py-1 text-xs bg-white border border-neutral-200 rounded-[8px]"
                      />
                    </div>
                    <button
                      onClick={() => setRefreshTick((n) => n + 1)}
                      className="p-1.5 text-neutral-500 hover:text-[#6d28d9] hover:bg-neutral-100 border border-neutral-200 rounded-[8px] transition-colors"
                      title="Rescan this folder"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${listingLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="px-4 py-1.5 border-b border-neutral-200/80 bg-white flex items-center justify-between gap-2">
                  <div className="flex items-center bg-neutral-100 p-0.5 rounded-[8px] border border-neutral-200">
                    {([
                      ['all', `All (${libraryCounts.all})`],
                      ['image', `Images (${libraryCounts.image})`],
                      ['video', `Videos (${libraryCounts.video})`],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setLibraryTypeFilter(value)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors ${
                          libraryTypeFilter === value
                            ? 'bg-white text-neutral-900 shadow-2xs font-semibold'
                            : 'text-neutral-600 hover:text-neutral-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-neutral-500">Sort</span>
                    <select
                      value={librarySort}
                      onChange={(e) => setLibrarySort(e.target.value as typeof librarySort)}
                      className="text-[11px] bg-white border border-neutral-200 rounded-[6px] px-1.5 py-1 text-neutral-700"
                    >
                      <option value="name-asc">Name A–Z</option>
                      <option value="name-desc">Name Z–A</option>
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                      <option value="largest">Largest first</option>
                      <option value="smallest">Smallest first</option>
                    </select>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-[#fafbfd]">
                  {libraryError && (
                    <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-[8px] border border-red-200 bg-red-50 text-red-700 text-xs">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div>
                        <p>{libraryError}</p>
                        {(libraryError.toLowerCase().includes('unreachable') ||
                          libraryError.toLowerCase().includes('could not reach')) && (
                          <p className="text-red-600/80 mt-0.5">
                            Start the local server to use folder browsing.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {!activeRoot ? (
                    <div className="text-center py-12">
                      <FolderPlus className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
                      <h4 className="text-sm font-semibold text-neutral-700">Scan a local folder</h4>
                      <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                        Add a folder path in the sidebar. All subfolders and media files will appear here without moving anything.
                      </p>
                    </div>
                  ) : listingLoading && !listing ? (
                    <div className="text-center py-12 text-neutral-400 text-xs">
                      <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin" />
                      Scanning folder...
                    </div>
                  ) : listing && listing.folders.length === 0 && libraryMediaItems.length === 0 ? (
                    <div className="text-center py-12">
                      <Folder className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
                      <h4 className="text-sm font-semibold text-neutral-700">This folder is empty</h4>
                      <p className="text-xs text-neutral-400 mt-1">No subfolders or supported media found.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {listing && listing.folders.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {listing.folders.map((folder) => (
                            <button
                              key={folder.path}
                              onClick={() => setCurrentPath(folder.path)}
                              className="group flex items-center gap-2 px-2.5 py-2 rounded-[8px] border border-neutral-200 bg-white hover:border-[#6d28d9] hover:shadow-xs text-left transition-all"
                              title={folder.path}
                            >
                              <Folder className="w-4 h-4 text-[#6d28d9]/70 shrink-0" />
                              <span className="text-xs font-medium text-neutral-800 truncate">{folder.name}</span>
                              <CornerDownRight className="w-3 h-3 text-neutral-300 ml-auto shrink-0 group-hover:text-[#6d28d9]" />
                            </button>
                          ))}
                        </div>
                      )}

                      {listing && listing.files.length > 0 && libraryMediaItems.length === 0 && (
                        <div className="text-center py-8">
                          <Search className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                          <p className="text-xs text-neutral-500">No files match this filter.</p>
                        </div>
                      )}

                      {libraryMediaItems.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                          {libraryMediaItems.map((mediaItem, idx) => {
                            const isVideo = mediaItem.type.startsWith('video/');
                            return (
                              <div
                                key={mediaItem.id}
                                className="group rounded-[8px] border border-neutral-200 bg-white overflow-hidden shadow-2xs hover:border-[#6d28d9] hover:shadow-xs transition-all flex flex-col"
                              >
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setPreviewState({ items: libraryMediaItems, index: idx })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setPreviewState({ items: libraryMediaItems, index: idx });
                                    }
                                  }}
                                  className="relative aspect-square bg-neutral-900 flex items-center justify-center overflow-hidden cursor-zoom-in"
                                  title="Preview"
                                >
                                  <MediaThumb item={mediaItem} />

                                  {isVideo && (
                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
                                      <Play className="w-6 h-6 text-white fill-white drop-shadow" />
                                    </div>
                                  )}

                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none flex items-center justify-center">
                                    <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-90 transition-opacity drop-shadow" />
                                  </div>

                                  <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-[4px] bg-black/70 text-white text-[9px] font-mono flex items-center gap-1">
                                    {isVideo ? <Film className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                                    <span>{isVideo ? 'VID' : 'IMG'}</span>
                                  </div>
                                </div>

                                <div className="p-2 flex-1 flex flex-col justify-between">
                                  <div>
                                    <h5 className="text-xs font-semibold text-neutral-900 truncate" title={mediaItem.libraryPath}>
                                      {mediaItem.name}
                                    </h5>
                                    <div className="text-[10px] text-neutral-500 font-mono mt-0.5 flex items-center justify-between">
                                      <span>{formatBytes(mediaItem.size)}</span>
                                      <span>{formatDate(mediaItem.uploadedAt)}</span>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => {
                                      onSelectMediaForPost(mediaItem);
                                      onClose();
                                    }}
                                    className="mt-2 w-full py-1 text-[11px] font-medium text-[#6d28d9] bg-[#f5f3ff]/70 hover:bg-[#ede9fe]/70 border border-[#ddd6fe] rounded-[6px] transition-colors flex items-center justify-center gap-1 cursor-pointer"
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

                      {listing?.truncated && (
                        <p className="text-[11px] text-amber-600">
                          Showing the first {listing.files.length} media files in this folder.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="px-5 py-3 border-t border-neutral-200 flex items-center justify-between bg-white text-xs">
                  <span className="text-neutral-500 font-mono truncate" title={activeRoot?.path}>
                    {listing ? `${listing.files.length} file${listing.files.length === 1 ? '' : 's'} · ${listing.folders.length} folder${listing.folders.length === 1 ? '' : 's'}` : ''}
                    {activeRoot
                      ? ` · ${activeRoot.path}${currentPath ? `${activeRoot.path.includes('\\') ? '\\' : '/'}${currentPath.split('/').join(activeRoot.path.includes('\\') ? '\\' : '/')}` : ''}`
                      : ''}
                  </span>
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[8px] transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {previewState && (
        <MediaPreviewModal
          items={previewState.items}
          index={previewState.index}
          onIndexChange={(nextIndex) =>
            setPreviewState((prev) => (prev ? { ...prev, index: nextIndex } : prev))
          }
          onClose={() => setPreviewState(null)}
          onSchedule={(item) => {
            setPreviewState(null);
            onSelectMediaForPost(item);
            onClose();
          }}
          onDelete={
            mode === 'stored'
              ? async (item) => {
                  await handleDelete(item.id);
                  setPreviewState(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
};
