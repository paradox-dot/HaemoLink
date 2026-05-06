import React from 'react';

const SHORTCUTS = [
  { keys: ['?'], desc: 'Show this help' },
  { keys: ['Esc'], desc: 'Close modal / dropdown' },
  { keys: ['G', 'H'], desc: 'Go to Dashboard' },
  { keys: ['G', 'I'], desc: 'Go to Inventory' },
  { keys: ['G', 'D'], desc: 'Go to Demand' },
  { keys: ['G', 'M'], desc: 'Go to Matching' },
  { keys: ['G', 'T'], desc: 'Go to Transfers' },
  { keys: ['G', 'R'], desc: 'Go to Received Stock' },
  { keys: ['G', 'U'], desc: 'Go to Users' },
  { keys: ['G', 'A'], desc: 'Go to Audit Trail' },
  { keys: ['G', 'N'], desc: 'Go to Institutions' },
  { keys: ['G', 'P'], desc: 'Go to Pricing' }
];

function ShortcutsHelp({ onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card-bg)', color: 'var(--text)', padding: 28, borderRadius: 12, width: 460, boxShadow: '0 12px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Keyboard Shortcuts</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)' }}>{'\u00D7'}</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SHORTCUTS.map((s, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 13 }}>{s.desc}</span>
              <span style={{ display: 'flex', gap: 4 }}>
                {s.keys.map((k, i) => (
                  <kbd key={i} style={{
                    padding: '3px 8px', borderRadius: 4, background: 'var(--input-bg, #f2f2f2)',
                    border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 11
                  }}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ShortcutsHelp;
