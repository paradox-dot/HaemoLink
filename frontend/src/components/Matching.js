import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

function Matching({ role }) {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score');

  const toast = useToast();
  const canRunMatching = role === 'Blood Bank Ops Manager' || role === 'System Admin';
  const canDecideMatch = role === 'Transfusion Officer' || role === 'System Admin';

  const fetchMatches = async () => {
    // 'all' excludes superseded — use dedicated 'superseded' tab to see them
    const url = filter === 'all' ? '/match' : `/match?status=${filter}`;
    const res = await authFetch(url);
    const json = await res.json();
    const filtered = filter === 'all' ? json.filter(m => m.status !== 'superseded') : json;
    setMatches(filtered);
  };

  useEffect(() => {
    fetchMatches();
  }, [filter]);

  const runMatching = async () => {
    setLoading(true);
    const res = await authFetch('/match/run', { method: 'POST' });
    await fetchMatches();
    setLoading(false);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.success(`Matching complete${data.total_matches ? ` \u2014 ${data.total_matches} new match${data.total_matches !== 1 ? 'es' : ''}` : ' \u2014 no new matches'}`);
    } else {
      toast.error('Matching engine failed');
    }
  };

  const acceptMatch = async (match_id) => {
    const res = await authFetch(`/match/${match_id}/accept`, {
      method: 'PUT',
      body: JSON.stringify({ decided_by: user.user_id })
    });
    if (res.ok) toast.success('Match accepted');
    else toast.error('Failed to accept match');
    fetchMatches();
  };

  const rejectMatch = async (match_id) => {
    const res = await authFetch(`/match/${match_id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ decided_by: user.user_id })
    });
    if (res.ok) toast.info('Match rejected \u2014 BB Ops has been notified to re-run matching');
    else toast.error('Failed to reject match');
    fetchMatches();
  };

  const deleteMatch = async (match_id) => {
    if (!window.confirm('Delete this match? If accepted, inventory will be released back to available.')) return;
    const res = await authFetch(`/match/${match_id}`, { method: 'DELETE' });
    if (res.ok) toast.success('Match deleted');
    else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to delete match');
    }
    fetchMatches();
  };

  const scoreColor = (score) => {
    const n = parseFloat(score);
    if (n >= 80) return '#27ae60';
    if (n >= 60) return '#f39c12';
    return '#e74c3c';
  };

  const statusConfig = {
    proposed: { color: '#3498db', bg: '#ebf5fb', label: 'Proposed' },
    accepted: { color: '#27ae60', bg: '#eafaf1', label: 'Accepted' },
    rejected: { color: '#e74c3c', bg: '#fdedec', label: 'Rejected' },
    superseded: { color: '#95a5a6', bg: '#f2f3f4', label: 'Superseded' },
    expired: { color: '#7f8c8d', bg: '#f2f3f4', label: 'Expired' }
  };

  const SubScoreBar = ({ label, value, weight }) => {
    const n = parseFloat(value);
    return (
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#7f8c8d', marginBottom: 2 }}>
          <span>{label} ({(weight * 100).toFixed(0)}%)</span>
          <span style={{ fontWeight: 600, color: scoreColor(n) }}>{n.toFixed(0)}</span>
        </div>
        <div style={{ height: 6, background: '#ecf0f1', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${n}%`, background: scoreColor(n), borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
      </div>
    );
  };

  const formatComponent = (val) => {
    const map = { whole_blood: 'Whole Blood', platelets: 'Platelets', plasma: 'Plasma', rbc: 'Packed RBC' };
    return map[val] || val;
  };

  const sortedMatches = [...matches].sort((a, b) => {
    switch (sortBy) {
      case 'expiry_asc':
        return new Date(a.inv_expiry_date || '9999') - new Date(b.inv_expiry_date || '9999');
      case 'expiry_desc':
        return new Date(b.inv_expiry_date || 0) - new Date(a.inv_expiry_date || 0);
      case 'needed_asc':
        return new Date(a.dem_required_by || '9999') - new Date(b.dem_required_by || '9999');
      case 'needed_desc':
        return new Date(b.dem_required_by || 0) - new Date(a.dem_required_by || 0);
      case 'score':
      default:
        return parseFloat(b.match_score) - parseFloat(a.match_score);
    }
  });

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>Matching Engine</h2>
          {canRunMatching && (
            <button
              className="btn btn-primary"
              onClick={runMatching}
              disabled={loading}
            >
              {loading ? 'Running...' : '\u26A1 Run Matching'}
            </button>
          )}
        </div>
        <p className="text-muted text-sm" style={{ marginTop: -8 }}>
          Pairs available inventory with demand requests using compatibility, distance, expiry, and urgency scoring.
        </p>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'proposed', 'accepted', 'fulfilled', 'rejected', 'superseded'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: filter === f ? '2px solid #c0392b' : '1px solid #ddd',
              background: filter === f ? '#fdf2f0' : '#fff',
              color: filter === f ? '#c0392b' : '#555',
              fontWeight: filter === f ? 600 : 400,
              cursor: 'pointer',
              fontSize: 13,
              textTransform: 'capitalize'
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Match Cards */}
      <div className="card">
        <div className="card-header">
          <h2>Match Results</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ fontSize: 12, color: '#7f8c8d', fontWeight: 600 }}>Sort by:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid #ddd' }}
            >
              <option value="score">Score (high to low)</option>
              <option value="expiry_asc">Expiry Date (soonest first)</option>
              <option value="expiry_desc">Expiry Date (latest first)</option>
              <option value="needed_asc">Need By (soonest first)</option>
              <option value="needed_desc">Need By (latest first)</option>
            </select>
            <span className="text-muted text-sm">{matches.length} match{matches.length !== 1 ? 'es' : ''}</span>
          </div>
        </div>

        {matches.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{'\u{1F517}'}</div>
            <p>{loading ? 'Running matching algorithm...' : 'No matches found. Click "Run Matching" to generate results.'}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {sortedMatches.map(m => {
              const sc = statusConfig[m.status] || statusConfig.proposed;
              return (
                <div key={m.match_id} style={{
                  border: `1px solid ${sc.color}22`,
                  borderLeft: `4px solid ${sc.color}`,
                  borderRadius: 8,
                  padding: 20,
                  background: '#fff'
                }}>
                  {/* Top row: score + status + actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      {/* Big score circle */}
                      <div style={{
                        width: 64, height: 64, borderRadius: '50%',
                        background: `conic-gradient(${scoreColor(m.match_score)} ${parseFloat(m.match_score) * 3.6}deg, #ecf0f1 0deg)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        <div style={{
                          width: 50, height: 50, borderRadius: '50%', background: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: 18, color: scoreColor(m.match_score)
                        }}>
                          {parseFloat(m.match_score).toFixed(0)}
                        </div>
                      </div>
                      <div>
                        <span style={{
                          display: 'inline-block', padding: '3px 10px', borderRadius: 12,
                          fontSize: 12, fontWeight: 600, color: sc.color, background: sc.bg
                        }}>
                          {sc.label}
                        </span>
                        <div style={{ fontSize: 12, color: '#95a5a6', marginTop: 4 }}>
                          {new Date(m.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {m.status === 'proposed' && canDecideMatch && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: 13, padding: '6px 16px' }}
                          onClick={() => acceptMatch(m.match_id)}
                        >
                          Accept
                        </button>
                        <button
                          className="btn"
                          style={{ fontSize: 13, padding: '6px 16px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                          onClick={() => rejectMatch(m.match_id)}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {m.status === 'proposed' && !canDecideMatch && (
                      <span style={{ fontSize: 12, color: '#95a5a6' }}>Awaiting TO decision</span>
                    )}
                    {role === 'System Admin' && (
                      <button
                        className="btn"
                        style={{ fontSize: 12, padding: '4px 12px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginLeft: 8 }}
                        onClick={() => deleteMatch(m.match_id)}
                        title="Delete match"
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {/* Supply ↔ Demand details */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 'clamp(8px, 1.5vw, 16px)', marginBottom: 16 }}>
                    {/* Supply side */}
                    <div style={{ padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#95a5a6', textTransform: 'uppercase', marginBottom: 8 }}>
                        Supply (Inventory)
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#c0392b' }}>
                        {m.inv_blood_group || '--'}
                      </div>
                      <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                        {formatComponent(m.inv_component) || '--'}
                      </div>
                      <div style={{ fontSize: 13, marginTop: 6 }}>
                        <strong>{parseFloat(m.inv_quantity || 0).toFixed(0)}</strong> units available
                      </div>
                      <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 4 }}>
                        {m.source_institution || 'Unknown'}
                      </div>
                      {m.inv_expiry_date && (
                        <div style={{ fontSize: 11, color: m.inv_expiry_category === 'critical' ? '#e74c3c' : m.inv_expiry_category === 'warning' ? '#f39c12' : '#27ae60', marginTop: 4 }}>
                          Expires: {new Date(m.inv_expiry_date).toLocaleDateString()}
                          {m.inv_expiry_category && ` (${m.inv_expiry_category})`}
                        </div>
                      )}
                    </div>

                    {/* Arrow */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: 11, color: '#95a5a6', fontWeight: 600, marginBottom: 4 }}>
                        {parseFloat(m.proposed_qty).toFixed(0)} units
                      </div>
                      <div style={{ fontSize: 28, color: '#c0392b' }}>{'\u2192'}</div>
                    </div>

                    {/* Demand side */}
                    <div style={{ padding: 12, background: '#f8f9fa', borderRadius: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#95a5a6', textTransform: 'uppercase', marginBottom: 8 }}>
                        Demand (Request)
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: '#c0392b' }}>
                        {m.dem_blood_group || '--'}
                      </div>
                      <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                        {formatComponent(m.dem_component) || '--'}
                      </div>
                      <div style={{ fontSize: 13, marginTop: 6 }}>
                        <strong>{parseFloat(m.dem_qty_fulfilled || 0).toFixed(0)}</strong> / {parseFloat(m.dem_qty_needed || 0).toFixed(0)} units fulfilled
                      </div>
                      <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 4 }}>
                        {m.dest_institution || 'Unknown'}
                      </div>
                      {m.dem_urgency && (
                        <span className={`badge badge-${m.dem_urgency}`} style={{ marginTop: 4, display: 'inline-block' }}>
                          {m.dem_urgency}
                        </span>
                      )}
                      {m.dem_required_by && (
                        <div style={{ fontSize: 11, color: '#7f8c8d', marginTop: 4 }}>
                          Needed by: {new Date(m.dem_required_by).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sub-scores breakdown */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                    <SubScoreBar label="Compatibility" value={m.compatibility_score} weight={0.30} />
                    <SubScoreBar label="Distance" value={m.distance_score} weight={0.20} />
                    <SubScoreBar label="Expiry" value={m.expiry_score} weight={0.25} />
                    <SubScoreBar label="Urgency" value={m.urgency_score} weight={0.25} />
                  </div>

                  {/* Pricing Estimate */}
                  {m.unit_price != null ? (
                    <div style={{
                      marginTop: 14,
                      padding: '10px 14px',
                      background: 'var(--hover-bg, #f8f9fa)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      fontSize: 12
                    }}>
                      <div style={{ fontWeight: 600, color: '#27ae60', marginBottom: 6, fontSize: 13 }}>
                        💰 Pricing Estimate
                        <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
                          ({m.dest_inst_type === 'government' ? 'Government' : 'Private'} Hospital rates)
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', color: 'var(--text)' }}>
                        <span>Unit Price:</span>
                        <span>₹{parseFloat(m.unit_price).toLocaleString('en-IN')} × {parseFloat(m.proposed_qty).toFixed(0)} units = <strong>₹{(parseFloat(m.unit_price) * parseFloat(m.proposed_qty)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></span>
                        <span>NAT Charges:</span>
                        <span>₹{parseFloat(m.nat_charge).toLocaleString('en-IN')} × {parseFloat(m.proposed_qty).toFixed(0)} units = <strong>₹{(parseFloat(m.nat_charge) * parseFloat(m.proposed_qty)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>{m.nat_includes_gst ? ' (incl. 5% GST)' : ''}</span>
                      </div>
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>Estimated Total:</span>
                        <span style={{ fontWeight: 700, fontSize: 16, color: '#c0392b' }}>
                          ₹{parseFloat(m.estimated_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Supplier pricing not configured — no cost estimate available
                    </div>
                  )}

                  {/* Match ID footer */}
                  <div style={{ fontSize: 11, color: '#bdc3c7', marginTop: 12, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    Match: {m.match_id} &middot; Inv: {m.inventory_id} &middot; Req: {m.request_id}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Matching;
