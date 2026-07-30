import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';

interface ResizableSidebarProps {
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  className?: string;
}

const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH = 650;
const KEYBOARD_STEP = 8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readStoredWidth(storageKey: string, defaultWidth: number): number {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) return parsed;
    }
  } catch { /* */ }
  return defaultWidth;
}

export function ResizableSidebar({
  children,
  defaultWidth = DEFAULT_WIDTH,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
  storageKey = 'resizableSidebarWidth',
  className = '',
}: ResizableSidebarProps) {
  const [width, setWidth] = useState<number>(() =>
    readStoredWidth(storageKey, defaultWidth)
  );
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const handleRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  // Clamp against viewport on mount and resize
  useEffect(() => {
    function applyViewportClamp() {
      setWidth(w => {
        const maxAllowed = Math.min(maxWidth, Math.floor(window.innerWidth * 0.45));
        const clamped = clamp(w, minWidth, maxAllowed);
        if (clamped !== w) {
          try { localStorage.setItem(storageKey, String(clamped)); } catch { /* */ }
        }
        return clamped;
      });
    }
    applyViewportClamp();
    window.addEventListener('resize', applyViewportClamp);
    return () => window.removeEventListener('resize', applyViewportClamp);
  }, [minWidth, maxWidth, storageKey]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging.current) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const delta = e.clientX - startX.current;
        const maxAllowed = Math.min(maxWidth, Math.floor(window.innerWidth * 0.45));
        const next = clamp(startWidth.current + delta, minWidth, maxAllowed);
        setWidth(next);
      });
    }
    function onMouseUp() {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Persist on mouse-up to avoid thrashing localStorage during drag
      setWidth(w => {
        try { localStorage.setItem(storageKey, String(w)); } catch { /* */ }
        return w;
      });
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [minWidth, maxWidth, storageKey]);

  // Touch support
  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (!isDragging.current) return;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        const delta = e.touches[0].clientX - startX.current;
        const maxAllowed = Math.min(maxWidth, Math.floor(window.innerWidth * 0.45));
        const next = clamp(startWidth.current + delta, minWidth, maxAllowed);
        setWidth(next);
      });
    }
    function onTouchEnd() {
      if (!isDragging.current) return;
      isDragging.current = false;
      setWidth(w => {
        try { localStorage.setItem(storageKey, String(w)); } catch { /* */ }
        return w;
      });
    }
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [minWidth, maxWidth, storageKey]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    isDragging.current = true;
    startX.current = e.touches[0].clientX;
    startWidth.current = width;
  }, [width]);

  function onDoubleClick() {
    const next = defaultWidth;
    setWidth(next);
    try { localStorage.setItem(storageKey, String(next)); } catch { /* */ }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setWidth(w => {
        const maxAllowed = Math.min(maxWidth, Math.floor(window.innerWidth * 0.45));
        const next = clamp(w + KEYBOARD_STEP, minWidth, maxAllowed);
        try { localStorage.setItem(storageKey, String(next)); } catch { /* */ }
        return next;
      });
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setWidth(w => {
        const next = clamp(w - KEYBOARD_STEP, minWidth, maxWidth);
        try { localStorage.setItem(storageKey, String(next)); } catch { /* */ }
        return next;
      });
    }
  }

  return (
    <div
      className={`relative flex-shrink-0 flex flex-col ${className}`}
      style={{ width }}
    >
      {/* Sidebar content fills full height */}
      <div className="flex-1 flex flex-col overflow-hidden h-full">
        {children}
      </div>

      {/* Resize handle — right edge */}
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize conversation panel"
        aria-valuenow={width}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        tabIndex={0}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        className="absolute top-0 right-0 h-full w-1 group cursor-col-resize z-10 focus:outline-none"
      >
        {/* Visual indicator — subtle line that brightens on hover/focus/drag */}
        <div className="absolute inset-y-0 right-0 w-px bg-slate-200 group-hover:bg-blue-400 group-focus:bg-blue-500 transition-colors duration-150" />
        {/* Wider invisible hit-zone */}
        <div className="absolute inset-y-0 -right-1.5 -left-1.5" />
      </div>
    </div>
  );
}
