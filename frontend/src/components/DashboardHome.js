import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

function DashboardHome({ role, onNavigate }) {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/notification/summary')
      .then(r => r.json())
      .then(d => { setSummary(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="card"><div className="empty-state"><p>Loading dashboard...</p></div></div>;
  }

  if (!summary) {
    return <div className="card"><div className="empty-state"><p>Failed to load summary.</p></div></div>;
  }

  const s = summary;
  const invAvailable = s.inventory?.available || 0;
  const invReserved = s.inventory?.reserved || 0;
  const invInTransfer = s.inventory?.in_transfer || 0;
  const invTotal = invAvailable + invReserved + invInTransfer;
  const isSystemAdmin = role === 'System Admin';
  // Use institution-scoped demand for non-admins
  const demSrc = !isSystemAdmin && s.demand_institution ? s.demand_institution : s.demand;
  const demNetSrc = s.demand; // always network-wide
  const demActive = (demSrc?.active || 0);
  const demPartial = (demSrc?.partial || 0);
  const demUnder = (demSrc?.under_matching || 0);
  const demFulfilled = (demSrc?.fulfilled || 0);
  const demNetworkActive = (demNetSrc?.active || 0);
  const matchProposed = s.matches?.proposed || 0;
  const matchAccepted = s.matches?.accepted || 0;
  const transActive = Object.entries(s.transfers || {})
    .filter(([k]) => !['completed', 'cancelled', 'failed'].includes(k))
    .reduce((sum, [, v]) => sum + v, 0);
  const transCompleted = s.transfers?.completed || 0;
  const rsAvailable = s.received_stock?.available || 0;
  const rsUsed = s.received_stock?.used || 0;
  const expCritical = s.expiry_alerts?.critical || 0;
  const expWarning = s.expiry_alerts?.warning || 0;
  const wastage = s.wastage || { wastage_pct: 0, expired_count: 0, discarded_count: 0, total_count: 0 };
  const wastageColor = wastage.wastage_pct > 10 ? '#e74c3c' : wastage.wastage_pct >= 5 ? '#f39c12' : '#27ae60';
  const myActions = s.my_actions || [];

  const StatCard = ({ icon, label, value, color, sub, onClick }) => (
    <div
      onClick={onClick}
      style={{
        background: '#fff', borderRadius: 10, padding: 20,
        border: '1px solid #e0d6d3', boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
        display: 'flex', alignItems: 'center', gap: 16,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 0.2s'
      }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
    >
      <div style={{
        width: 48, height: 48, borderRadius: 12,
        background: color + '15', color: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, flexShrink: 0
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, color: '#2c2c2c' }}>{value}</div>
        <div style={{ fontSize: 12, color: '#777', fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>Welcome, {user?.name}</h2>
          <span className="text-muted text-sm">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
        <p className="text-muted text-sm" style={{ marginTop: -8 }}>
          {role === 'System Admin' ? 'System-wide overview' : `Overview for ${user?.institution_name || 'your institution'}`}
        </p>
      </div>

      {/* Alert banner for critical items */}
      {(expCritical > 0 || (role === 'System Admin' && s.pending_institutions > 0)) && (
        <div style={{
          background: '#fdedec', border: '1px solid #f5c6cb', borderRadius: 10,
          padding: '12px 20px', marginBottom: 20, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center'
        }}>
          {expCritical > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#e74c3c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => onNavigate('inventory')}
            >
              {'\u26A0\uFE0F'} {expCritical} inventory item{expCritical > 1 ? 's' : ''} expiring within 24 hours
            </div>
          )}
          {role === 'System Admin' && s.pending_institutions > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#e74c3c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => onNavigate('institutions')}
            >
              {'\u{1F3E5}'} {s.pending_institutions} institution{s.pending_institutions > 1 ? 's' : ''} awaiting approval
            </div>
          )}
        </div>
      )}

      {/* My Open Actions */}
      {myActions.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2>{'\u{1F4CC}'} My Open Actions</h2>
            <span className="text-muted text-sm">{myActions.length} pending</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myActions.map((a, idx) => (
              <div
                key={`${a.type}-${a.id}-${idx}`}
                onClick={() => onNavigate(a.tab)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: a.urgency === 'high' ? '#fdf2f0' : 'var(--card-bg)',
                  cursor: 'pointer', transition: 'transform 0.1s'
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: a.urgency === 'high' ? '#e74c3c' : a.urgency === 'low' ? '#95a5a6' : '#f39c12'
                  }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</span>
                </div>
                <span style={{ fontSize: 11, color: '#999' }}>{'\u2192'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stat cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>
        <StatCard
          icon={'\u{1FA78}'}
          label="Available Inventory"
          value={invAvailable}
          color="#27ae60"
          sub={`${invReserved} reserved \u00B7 ${invInTransfer} in transit`}
          onClick={() => onNavigate('inventory')}
        />
        <StatCard
          icon={'\u{1F4CB}'}
          label={isSystemAdmin ? 'Unmatched Demands' : 'My Unmatched Demands'}
          value={demActive}
          color="#2980b9"
          sub={isSystemAdmin
            ? `${demUnder + demPartial} in matching \u00B7 ${demFulfilled} fulfilled`
            : `${demUnder + demPartial} in matching \u00B7 ${demFulfilled} fulfilled \u00B7 ${demNetworkActive} network-wide`}
          onClick={() => onNavigate('demand')}
        />
        <StatCard
          icon={'\u{1F517}'}
          label="Pending Matches"
          value={matchProposed}
          color="#f39c12"
          sub={`${matchAccepted} accepted`}
          onClick={() => onNavigate('matching')}
        />
        <StatCard
          icon={'\u{1F69A}'}
          label="Active Transfers"
          value={transActive}
          color="#8e44ad"
          sub={`${transCompleted} completed`}
          onClick={() => onNavigate('transfer')}
        />
        {['System Admin', 'Institutional Admin', 'Transfusion Officer'].includes(role) && (
          <StatCard
            icon={'\u{1F4E6}'}
            label="Received Stock"
            value={rsAvailable}
            color="#16a085"
            sub={`${rsUsed} used`}
            onClick={() => onNavigate('received_stock')}
          />
        )}
        <StatCard
          icon={'\u{1F5D1}\uFE0F'}
          label="Wastage (30d)"
          value={`${wastage.wastage_pct}%`}
          color={wastageColor}
          sub={`${wastage.expired_count} expired \u00B7 ${wastage.discarded_count} discarded \u00B7 ${wastage.total_count} total`}
        />
      </div>

      {/* Expiry warnings */}
      {(expCritical > 0 || expWarning > 0) && (
        <div className="card">
          <div className="card-header">
            <h2>Expiry Alerts</h2>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            {expCritical > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#e74c3c', display: 'inline-block' }} />
                <span style={{ fontSize: 13 }}><strong>{expCritical}</strong> critical (&lt; 24h)</span>
              </div>
            )}
            {expWarning > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f39c12', display: 'inline-block' }} />
                <span style={{ fontSize: 13 }}><strong>{expWarning}</strong> warning (&lt; 72h)</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardHome;
