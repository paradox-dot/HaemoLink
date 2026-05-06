import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import ExportButton from './ExportButton';

const TABS = [
  { id: 'logs', label: 'Audit Logs', icon: '\uD83D\uDCDD' },
  { id: 'inventory', label: 'Inventory Transitions', icon: '\uD83E\uDE78' },
  { id: 'demand', label: 'Demand Transitions', icon: '\uD83D\uDCCB' },
  { id: 'transfer', label: 'Transfer Transitions', icon: '\uD83D\uDE9A' },
  { id: 'ownership', label: 'Ownership History', icon: '\uD83C\uDFE5' },
];

function AuditTrail({ role }) {
  const [activeTab, setActiveTab] = useState('logs');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [entityFilter, setEntityFilter] = useState('');
  const [entityIdFilter, setEntityIdFilter] = useState('');

  const fetchData = async () => {
    setLoading(true);
    let url;
    switch (activeTab) {
      case 'logs': {
        const params = new URLSearchParams();
        if (entityFilter) params.set('entity_type', entityFilter);
        if (entityIdFilter) params.set('entity_id', entityIdFilter);
        url = `/audit/logs?${params.toString()}`;
        break;
      }
      case 'inventory':
        url = entityIdFilter ? `/audit/inventory-transitions?inventory_id=${entityIdFilter}` : '/audit/inventory-transitions';
        break;
      case 'demand':
        url = entityIdFilter ? `/audit/demand-transitions?request_id=${entityIdFilter}` : '/audit/demand-transitions';
        break;
      case 'transfer':
        url = entityIdFilter ? `/audit/transfer-transitions?transfer_id=${entityIdFilter}` : '/audit/transfer-transitions';
        break;
      case 'ownership':
        url = entityIdFilter ? `/audit/ownership-history?inventory_id=${entityIdFilter}` : '/audit/ownership-history';
        break;
      default:
        url = '/audit/logs';
    }

    try {
      const res = await authFetch(url);
      const json = await res.json();
      setData(json);
    } catch {
      setData([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const formatDate = (d) => d ? new Date(d).toLocaleString() : '-';

  const stateArrow = (from, to) => (
    <span>
      <span className={`badge badge-${from}`}>{from}</span>
      {' \u2192 '}
      <span className={`badge badge-${to}`}>{to}</span>
    </span>
  );

  const renderAuditLogs = () => (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>User</th>
            <th>Action</th>
            <th>Entity Type</th>
            <th>Entity ID</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.log_id}>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(row.created_at)}</td>
              <td>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{row.user_name || '-'}</div>
                <div className="text-muted" style={{ fontSize: 11 }}>{row.user_email}</div>
              </td>
              <td>
                <span style={{
                  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: actionColor(row.action_type).bg,
                  color: actionColor(row.action_type).color
                }}>
                  {row.action_type}
                </span>
              </td>
              <td style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>{row.entity_type}</td>
              <td className="font-mono text-muted" style={{ fontSize: 11 }}>{row.entity_id}</td>
              <td>
                <DetailsToggle details={row.details} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderInventoryTransitions = () => (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Inventory</th>
            <th>Blood Group</th>
            <th>Transition</th>
            <th>Changed By</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.id}>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(row.created_at)}</td>
              <td className="font-mono text-muted" style={{ fontSize: 11 }}>{row.inventory_id}</td>
              <td><strong>{row.blood_group}</strong> {formatComponent(row.component_type)}</td>
              <td>{stateArrow(row.from_state, row.to_state)}</td>
              <td style={{ fontSize: 13 }}>{row.changed_by_name || '-'}</td>
              <td className="text-muted" style={{ fontSize: 12 }}>{row.reason || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderDemandTransitions = () => (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Request</th>
            <th>Blood Group</th>
            <th>Transition</th>
            <th>Changed By</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.id}>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(row.created_at)}</td>
              <td className="font-mono text-muted" style={{ fontSize: 11 }}>{row.request_id}</td>
              <td><strong>{row.blood_group}</strong> {formatComponent(row.component_type)}</td>
              <td>{stateArrow(row.from_state, row.to_state)}</td>
              <td style={{ fontSize: 13 }}>{row.changed_by_name || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderTransferTransitions = () => (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Transfer ID</th>
            <th>Transition</th>
            <th>Changed By</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.id}>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(row.created_at)}</td>
              <td className="font-mono text-muted" style={{ fontSize: 11 }}>{row.transfer_id}</td>
              <td>{stateArrow(row.from_state, row.to_state)}</td>
              <td style={{ fontSize: 13 }}>{row.changed_by_name || '-'}</td>
              <td className="text-muted" style={{ fontSize: 12 }}>{row.reason || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderOwnershipHistory = () => (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Inventory ID</th>
            <th>Blood Group</th>
            <th>Institution</th>
            <th>From</th>
            <th>To</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.id}>
              <td className="font-mono text-muted" style={{ fontSize: 11 }}>{row.inventory_id}</td>
              <td><strong>{row.blood_group}</strong> {formatComponent(row.component_type)}</td>
              <td style={{ fontWeight: 600, fontSize: 13 }}>{row.institution_name || '-'}</td>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatDate(row.from_date)}</td>
              <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{row.to_date ? formatDate(row.to_date) : '-'}</td>
              <td>
                <span className={`badge badge-${row.to_date ? 'expired' : 'available'}`}>
                  {row.to_date ? 'Transferred' : 'Current Owner'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <div className="empty-state">
          <p>Loading...</p>
        </div>
      );
    }
    if (data.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">{'\uD83D\uDCDC'}</div>
          <p>No records found.</p>
        </div>
      );
    }
    switch (activeTab) {
      case 'logs': return renderAuditLogs();
      case 'inventory': return renderInventoryTransitions();
      case 'demand': return renderDemandTransitions();
      case 'transfer': return renderTransferTransitions();
      case 'ownership': return renderOwnershipHistory();
      default: return null;
    }
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>Audit Trail</h2>
          <span className="text-muted text-sm">
            {role === 'System Admin' ? 'System-wide' : 'Your institution'}
          </span>
        </div>
        <p className="text-muted text-sm" style={{ marginTop: -8 }}>
          Complete history of all state changes, actions, and ownership transfers across the system.
        </p>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => { setActiveTab(t.id); setEntityIdFilter(''); setEntityFilter(''); }}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: activeTab === t.id ? '2px solid #c0392b' : '1px solid #ddd',
              background: activeTab === t.id ? '#fdf2f0' : '#fff',
              color: activeTab === t.id ? '#c0392b' : '#555',
              fontWeight: activeTab === t.id ? 600 : 400,
              cursor: 'pointer', fontSize: 13
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {activeTab === 'logs' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Entity Type</label>
              <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
                <option value="">All</option>
                <option value="INVENTORY">Inventory</option>
                <option value="DEMAND">Demand</option>
                <option value="MATCH">Match</option>
                <option value="TRANSFER">Transfer</option>
                <option value="USER">User</option>
                <option value="INSTITUTION">Institution</option>
              </select>
            </div>
          )}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>
              {activeTab === 'logs' ? 'Entity ID' :
               activeTab === 'inventory' || activeTab === 'ownership' ? 'Inventory ID' :
               activeTab === 'demand' ? 'Request ID' :
               'Transfer ID'}
            </label>
            <input
              type="text"
              placeholder="Paste UUID to filter..."
              value={entityIdFilter}
              onChange={e => setEntityIdFilter(e.target.value)}
              style={{ minWidth: 320 }}
            />
          </div>
          <button className="btn btn-primary" onClick={fetchData} style={{ marginBottom: 0 }}>
            Search
          </button>
          {(entityFilter || entityIdFilter) && (
            <button
              className="btn btn-secondary"
              onClick={() => { setEntityFilter(''); setEntityIdFilter(''); }}
              style={{ marginBottom: 0 }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="card">
        <div className="card-header">
          <h2>{TABS.find(t => t.id === activeTab)?.label}</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="text-muted text-sm">{data.length} record{data.length !== 1 ? 's' : ''}</span>
            {activeTab === 'logs' && (
              <ExportButton
                endpoint="/audit/logs"
                filename="audit_log"
                params={{ ...(entityFilter ? { entity_type: entityFilter } : {}), ...(entityIdFilter ? { entity_id: entityIdFilter } : {}) }}
              />
            )}
          </div>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}

/* Helper: collapsible JSON details */
function DetailsToggle({ details }) {
  const [open, setOpen] = useState(false);
  if (!details || Object.keys(details).length === 0) return <span className="text-muted">-</span>;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: '1px solid #ddd', borderRadius: 4,
          padding: '2px 8px', fontSize: 11, cursor: 'pointer', color: '#3498db'
        }}
      >
        {open ? 'Hide' : 'View'}
      </button>
      {open && (
        <pre style={{
          marginTop: 6, padding: 8, background: '#f8f9fa', borderRadius: 6,
          fontSize: 11, maxWidth: 400, overflow: 'auto', maxHeight: 200,
          border: '1px solid #ecf0f1'
        }}>
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
    </div>
  );
}

function actionColor(action) {
  if (action?.includes('created')) return { bg: '#eafaf1', color: '#27ae60' };
  if (action?.includes('accepted') || action?.includes('approved')) return { bg: '#eafaf1', color: '#27ae60' };
  if (action?.includes('rejected') || action?.includes('suspended')) return { bg: '#fdedec', color: '#e74c3c' };
  if (action?.includes('updated') || action?.includes('status')) return { bg: '#ebf5fb', color: '#2980b9' };
  return { bg: '#f2f3f4', color: '#555' };
}

function formatComponent(val) {
  const map = { whole_blood: 'Whole Blood', platelets: 'Platelets', plasma: 'Plasma', rbc: 'Packed RBC' };
  return map[val] || val || '';
}

export default AuditTrail;
