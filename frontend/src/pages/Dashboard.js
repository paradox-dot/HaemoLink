import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import DashboardHome from '../components/DashboardHome';
import Inventory from '../components/Inventory';
import Demand from '../components/Demand';
import Matching from '../components/Matching';
import Transfer from '../components/Transfer';
import Users from '../components/Users';
import Institutions from '../components/Institutions';
import AuditTrail from '../components/AuditTrail';
import ReceivedStock from '../components/ReceivedStock';
import NotificationBell from '../components/NotificationBell';
import PasswordChangeModal from '../components/PasswordChangeModal';
import ShortcutsHelp from '../components/ShortcutsHelp';
import Pricing from '../components/Pricing';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';

const tabConfig = {
  'System Admin':           ['home', 'inventory', 'demand', 'matching', 'transfer', 'received_stock', 'users', 'institutions', 'audit', 'pricing'],
  'Institutional Admin':    ['home', 'inventory', 'demand', 'matching', 'transfer', 'received_stock', 'users', 'audit', 'pricing'],
  'Blood Bank Ops Manager': ['home', 'inventory', 'matching', 'transfer', 'demand'],
  'Transfusion Officer':    ['home', 'demand', 'matching', 'transfer', 'received_stock', 'inventory'],
  'Hospital Administrator': ['home', 'demand', 'transfer', 'inventory'],
};

const tabMeta = {
  home:         { label: 'Dashboard',    icon: '\u{1F3E0}' },
  inventory:    { label: 'Inventory',    icon: '\u{1FA78}' },
  demand:       { label: 'Demand',       icon: '\u{1F4CB}' },
  matching:     { label: 'Matching',     icon: '\u{1F517}' },
  transfer:     { label: 'Transfers',    icon: '\u{1F69A}' },
  received_stock: { label: 'Received Stock', icon: '\u{1F4E6}' },
  users:        { label: 'Users',        icon: '\u{1F465}' },
  institutions: { label: 'Institutions', icon: '\u{1F3E5}' },
  audit:        { label: 'Audit Trail',  icon: '\uD83D\uDCDC' },
  pricing:      { label: 'Pricing',      icon: '\u20B9' },
};

function Dashboard() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const role = user?.role_name || '';
  const visibleTabs = tabConfig[role] || ['home', 'inventory'];
  const [activeTab, setActiveTab] = useState('home');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useKeyboardShortcuts({
    onNavigate: setActiveTab,
    onShowHelp: () => setShowShortcuts(true),
    onEscape: () => { setShowShortcuts(false); setShowPasswordModal(false); },
    visibleTabs
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'home':         return <DashboardHome role={role} onNavigate={setActiveTab} />;
      case 'inventory':    return <Inventory role={role} />;
      case 'demand':       return <Demand role={role} />;
      case 'matching':     return <Matching role={role} />;
      case 'transfer':     return <Transfer role={role} />;
      case 'received_stock': return <ReceivedStock role={role} />;
      case 'users':        return <Users role={role} />;
      case 'institutions': return <Institutions role={role} />;
      case 'audit':        return <AuditTrail role={role} />;
      case 'pricing':      return <Pricing role={role} />;
      default:             return <DashboardHome role={role} onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setSidebarOpen(o => !o)}
            className="hamburger-btn"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
          <h1>
            <span className="logo-icon">{'\u{1FA78}'}</span>
            HaemoLink
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NotificationBell onNavigate={setActiveTab} />
          {user && (
            <div style={{ textAlign: 'right', fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{user.name}</div>
              <div style={{ opacity: 0.7, fontSize: 11 }}>{role}</div>
              {role !== 'System Admin' && user.institution_name && (
                <div style={{ opacity: 0.5, fontSize: 10 }}>{user.institution_name}</div>
              )}
            </div>
          )}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 6,
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 16, color: '#fff'
            }}
          >
            {theme === 'dark' ? '\u2600\uFE0F' : '\u{1F319}'}
          </button>
          <button
            onClick={() => setShowPasswordModal(true)}
            title="Change password"
            style={{
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 6,
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 14
            }}
          >
            {'\u{1F512}'}
          </button>
          <button
            onClick={handleLogout}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff',
              padding: '6px 14px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="app-body">
        {sidebarOpen && (
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
        )}

        <nav className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
          {visibleTabs.map(tabId => {
            const meta = tabMeta[tabId];
            return (
              <button
                key={tabId}
                className={`sidebar-item ${activeTab === tabId ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(tabId);
                  if (window.innerWidth < 768) setSidebarOpen(false);
                }}
                title={meta.label}
              >
                <span className="nav-icon">{meta.icon}</span>
                <span className="sidebar-label">{meta.label}</span>
              </button>
            );
          })}
        </nav>

        <main className="main-content">
          {renderContent()}
        </main>
      </div>

      {showPasswordModal && <PasswordChangeModal onClose={() => setShowPasswordModal(false)} />}
      {showShortcuts && <ShortcutsHelp onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

export default Dashboard;
