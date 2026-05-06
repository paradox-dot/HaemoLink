import { useEffect, useRef } from 'react';

/**
 * Global keyboard shortcuts for the authenticated dashboard.
 * - Ctrl/Cmd+K: focus search
 * - ?: show shortcuts help
 * - Esc: close modal
 * - G <letter>: navigate to tab (chord)
 */
export default function useKeyboardShortcuts({ onNavigate, onFocusSearch, onShowHelp, onEscape, visibleTabs = [] }) {
  const chordTimer = useRef(null);
  const waitingForChord = useRef(false);

  useEffect(() => {
    const tabMap = {
      h: 'home',
      i: 'inventory',
      d: 'demand',
      m: 'matching',
      t: 'transfer',
      r: 'received_stock',
      u: 'users',
      a: 'audit',
      n: 'institutions',
      p: 'pricing'
    };

    const isTypingElement = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const handler = (e) => {
      const typing = isTypingElement(document.activeElement);

      // Ctrl+K / Cmd+K — always works
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onFocusSearch?.();
        return;
      }

      // Escape — always works
      if (e.key === 'Escape') {
        onEscape?.();
        return;
      }

      if (typing) return;

      // Help
      if (e.key === '?') { e.preventDefault(); onShowHelp?.(); return; }

      // Chord: G then <letter>
      if (waitingForChord.current) {
        waitingForChord.current = false;
        clearTimeout(chordTimer.current);
        const target = tabMap[e.key.toLowerCase()];
        if (target && visibleTabs.includes(target)) {
          e.preventDefault();
          onNavigate?.(target);
        }
        return;
      }

      if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        waitingForChord.current = true;
        chordTimer.current = setTimeout(() => { waitingForChord.current = false; }, 1200);
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (chordTimer.current) clearTimeout(chordTimer.current);
    };
  }, [onNavigate, onFocusSearch, onShowHelp, onEscape, visibleTabs]);
}
