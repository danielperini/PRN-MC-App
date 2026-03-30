import React, { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, X } from 'lucide-react';
import { createPageUrl } from '@/utils';

/**
 * Wraps any nav element. After 5s of hovering, shows a mini tooltip.
 * If tooltip stays open 5s more, shows a "Ver no Manual" link.
 */
export default function HoverManualTooltip({ children, text, pageName }) {
  const [visible, setVisible] = useState(false);
  const [showManualLink, setShowManualLink] = useState(false);
  const hoverTimer = useRef(null);
  const manualTimer = useRef(null);

  function startHover() {
    hoverTimer.current = setTimeout(() => {
      setVisible(true);
    }, 5000);
  }

  function endHover() {
    clearTimeout(hoverTimer.current);
    clearTimeout(manualTimer.current);
    setVisible(false);
    setShowManualLink(false);
  }

  useEffect(() => {
    if (visible) {
      manualTimer.current = setTimeout(() => setShowManualLink(true), 5000);
    }
    return () => clearTimeout(manualTimer.current);
  }, [visible]);

  if (!text) return <>{children}</>;

  return (
    <div
      className="relative"
      onMouseEnter={startHover}
      onMouseLeave={endHover}
    >
      {children}

      {visible && (
        <div
          className="absolute left-full top-0 ml-2 z-50 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-sm text-slate-700 animate-fade-in"
          onMouseEnter={() => { clearTimeout(hoverTimer.current); }}
          onMouseLeave={endHover}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="font-semibold text-slate-900 text-xs">{pageName}</span>
            <button onClick={endHover} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="leading-relaxed text-xs text-slate-600">{text}</p>
          {showManualLink && (
            <Link
              to={createPageUrl('Manual')}
              onClick={endHover}
              className="mt-2 flex items-center gap-1 text-xs text-blue-700 hover:underline font-medium"
            >
              <BookOpen className="w-3 h-3" />
              Ver instruções no Manual →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}