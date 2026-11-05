import { useEffect, useRef } from 'react';

// Escape closes the topmost open dialog only: each modal registers a closer
// while open, and the newest registration wins.
const closers: Array<() => void> = [];
let listening = false;

function ensureListener() {
  if (listening) return;
  listening = true;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closers.length > 0) {
      e.stopPropagation();
      closers[closers.length - 1]();
    }
  });
}

export function useEscapeClose(isOpen: boolean, onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    if (!isOpen) return;
    ensureListener();
    const entry = () => latest.current();
    closers.push(entry);
    return () => {
      const i = closers.lastIndexOf(entry);
      if (i >= 0) closers.splice(i, 1);
    };
  }, [isOpen]);
}
