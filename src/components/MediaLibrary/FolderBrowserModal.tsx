import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  X,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  AlertCircle,
  HardDrive,
  Home,
} from 'lucide-react';
import { listServerFolders } from '../../utils/localLibrary';
import { toUserMessage } from '../../utils/errorMessages';
import type { BrowsePlace, FolderEntry, ServerFolderListing } from '../../types';

interface FolderBrowserModalProps {
  isOpen: boolean;
  initialPath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}

// Browses the server's filesystem. The folders it lists belong to the machine
// running the backend, which is why this works from a phone too — the browser
// is only a client.
export const FolderBrowserModal: React.FC<FolderBrowserModalProps> = ({
  isOpen,
  initialPath,
  onClose,
  onSelect,
}) => {
  const [listing, setListing] = useState<ServerFolderListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [placesOpen, setPlacesOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const requestIdRef = useRef(0);

  const open = useCallback(async (path?: string, silentFallback = false) => {
    // A request id, so a slow response cannot overwrite a newer navigation:
    // double-clicking two folders in quick succession must not leave the
    // listing showing the one the user already navigated away from.
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await listServerFolders(path);
      if (requestId !== requestIdRef.current) return;
      setListing(next);
      setHighlight(0);
      listRef.current?.focus();
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      if (!silentFallback) {
        setError(toUserMessage(err, 'That folder could not be opened. Please try again.'));
        return;
      }
      // The hint missed (it was outside the browsable folders, or is gone).
      // Start at the server's first browse root instead of showing an error.
      try {
        const next = await listServerFolders();
        if (requestId !== requestIdRef.current) return;
        setListing(next);
        setHighlight(0);
        listRef.current?.focus();
      } catch (fallbackErr) {
        if (requestId !== requestIdRef.current) return;
        setError(toUserMessage(fallbackErr, 'That folder could not be opened. Please try again.'));
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  // Open the browser at the hinted folder, or at the server's first browse root.
  // The hint is read through a ref so that a parent re-render with a new
  // (derived) initialPath does not reload the listing underneath the user.
  const initialPathRef = useRef(initialPath);
  initialPathRef.current = initialPath;

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const hint = initialPathRef.current;
    void open(hint, Boolean(hint));
  }, [isOpen, open]);

  // Give focus back to whatever opened the browser.
  useEffect(() => {
    if (isOpen) return;
    const target = restoreFocusRef.current;
    if (target && typeof target.focus === 'function') target.focus();
  }, [isOpen]);

  const goUp = useCallback(() => {
    if (listing?.parent) void open(listing.parent);
  }, [listing, open]);

  const enter = useCallback(
    (entry: FolderEntry | undefined) => {
      if (entry) void open(entry.path);
    },
    [open],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      // Buttons outside the list (close, back, places, Cancel, "Use this
      // folder") keep their native Enter behaviour — hijacking it would make
      // the primary action unreachable by keyboard.
      if (target instanceof HTMLButtonElement && !listRef.current?.contains(target)) return;
      const count = listing?.entries.length ?? 0;
      if (event.key === 'ArrowDown') {
        setHighlight((h) => Math.min(h + 1, Math.max(count - 1, 0)));
        event.preventDefault();
      } else if (event.key === 'ArrowUp') {
        setHighlight((h) => Math.max(h - 1, 0));
        event.preventDefault();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goUp();
      } else if (event.key === 'Enter') {
        // preventDefault, or a focused button would ALSO be activated by the
        // browser's default key handling — Enter on "Use this folder" would
        // both pick the current folder and open the highlighted subfolder.
        event.preventDefault();
        enter(listing?.entries[highlight]);
      } else if (event.key === 'Backspace') {
        // Backspace would otherwise leave the page in some browsers.
        event.preventDefault();
        goUp();
      } else if (event.key === 'Tab') {
        // Keep focus inside the dialog: Tab must not walk into the page
        // behind it.
        const root = dialogRef.current;
        if (!root) return;
        const focusable = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey && (active === first || !root.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !root.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, listing, highlight, enter, goUp, onClose]);

  if (!isOpen) return null;

  const places = listing?.places ?? [];

  const renderPlaces = (compact: boolean) => (
    <div className={compact ? 'mb-2' : ''}>
      {!compact && (
        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wide px-1 mb-1">
          Places
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {places.map((place: BrowsePlace) => (
          <button
            key={place.path}
            type="button"
            onClick={() => {
              setPlacesOpen(false);
              void open(place.path);
            }}
            className="flex items-center gap-1.5 px-1.5 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100 rounded-[6px] text-left"
            title={place.path}
          >
            {place.kind === 'home' ? (
              <Home className="w-3 h-3 shrink-0" />
            ) : (
              <HardDrive className="w-3 h-3 shrink-0" />
            )}
            <span className="truncate">{place.name}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Browse folders"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="flex flex-col w-full max-w-2xl max-h-[85vh] mx-auto my-auto bg-white rounded-lg shadow-xl overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200">
          <div className="min-w-0 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-neutral-500 shrink-0" />
            <h2 className="text-sm font-semibold text-neutral-900 truncate">Browse folders</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-500 hover:bg-neutral-100 rounded-[6px] shrink-0"
            title="Close"
            aria-label="Close the folder browser"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Path row */}
        <div className="shrink-0 flex items-center gap-1 px-3 py-2 border-b border-neutral-200">
          <button
            type="button"
            onClick={goUp}
            disabled={!listing?.parent}
            className="p-1 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent rounded-[6px] shrink-0"
            title="Go to the parent folder"
            aria-label="Go to the parent folder"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <p
            className="text-[11px] text-neutral-500 truncate flex-1"
            title={listing?.path ?? ''}
            aria-live="polite"
          >
            {listing?.path ?? ''}
          </p>
          <button
            type="button"
            onClick={() => setPlacesOpen((open) => !open)}
            className="sm:hidden p-1 text-neutral-500 hover:bg-neutral-100 rounded-[6px] shrink-0"
            title="Places"
            aria-label="Show places"
          >
            <HardDrive className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex">
          <aside className="hidden sm:flex sm:w-40 shrink-0 flex-col gap-1 p-2 border-r border-neutral-200 overflow-y-auto">
            {renderPlaces(false)}
          </aside>

          <div className="flex-1 min-w-0 flex flex-col">
            {placesOpen && <div className="sm:hidden p-2 border-b border-neutral-200">{renderPlaces(true)}</div>}

            {error && (
              <div className="flex items-start gap-2 m-3 p-2 rounded-[6px] bg-red-50 border border-red-200">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700 flex-1">{error}</p>
                <button
                  type="button"
                  onClick={() => void open(listing?.path)}
                  className="text-[11px] font-medium text-red-700 hover:underline shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            <div
              ref={listRef}
              tabIndex={-1}
              className="flex-1 min-h-0 overflow-y-auto outline-none"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-neutral-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Loading folders...
                </div>
              ) : !listing ? null : listing.entries.length === 0 ? (
                <p className="px-3 py-8 text-center text-[11px] text-neutral-400">
                  This folder has no subfolders.
                </p>
              ) : (
                <ul className="p-1">
                  {listing.entries.map((entry: FolderEntry, index: number) => (
                    <li key={entry.path}>
                      <button
                        type="button"
                        onClick={() => setHighlight(index)}
                        onDoubleClick={() => enter(entry)}
                        aria-current={index === highlight ? 'true' : undefined}
                        className={`w-full min-h-[44px] sm:min-h-0 flex items-center gap-2 px-2 py-2 sm:py-1 text-left text-[11px] rounded-[6px] ${
                          index === highlight
                            ? 'bg-blue-50 text-[#0000ee]'
                            : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        <Folder className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{entry.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {listing?.truncated && (
              <p className="shrink-0 px-3 py-1.5 text-[10px] text-neutral-400 border-t border-neutral-200">
                Showing the first {listing.limit} folders.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-neutral-200 bg-neutral-50">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-[6px] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => listing && onSelect(listing.path)}
            disabled={loading || !listing || Boolean(error)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white bg-[#020520] hover:bg-[#0f1f3d] disabled:opacity-40 rounded-[6px] transition-colors"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Use this folder
          </button>
        </div>
      </div>
    </div>
  );
};
