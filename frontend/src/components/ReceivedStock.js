import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import ExportButton from './ExportButton';

const formatComponent = (val) => {
  const map = { whole_blood: 'Whole Blood', platelets: 'Platelets', plasma: 'Plasma', rbc: 'Packed RBC' };
  return map[val] || val;
};

function ReceivedStock({ role }) {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [statusFilter, setStatusFilter] = useState('available');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const fetchData = async () => {
    const url = statusFilter === 'all'
      ? '/received-stock'
      : `/received-stock?status=${statusFilter}`;
    const res = await authFetch(url);
    const json = await res.json();
    setData(json);
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const updateStatus = async (id, newStatus) => {
    const label = newStatus === 'used' ? 'Mark as Used' : 'Discard';
    if (!window.confirm(`${label}? This cannot be undone.`)) return;
    const res = await authFetch(`/received-stock/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      toast.success(`Received stock marked as ${newStatus}`);
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || `Failed to update status`);
    }
  };

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  const filteredData = data.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (i.blood_group || '').toLowerCase().includes(q) ||
           (formatComponent(i.component_type) || '').toLowerCase().includes(q) ||
           (i.source_institution_name || '').toLowerCase().includes(q) ||
           (i.status || '').toLowerCase().includes(q) ||
           (i.received_stock_id || '').toLowerCase().includes(q);
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortBy) return 0;
    let valA = a[sortBy] ?? '';
    let valB = b[sortBy] ?? '';
    if (sortBy === 'expiry_date' || sortBy === 'received_at') {
      valA = new Date(valA || 0).getTime();
      valB = new Date(valB || 0).getTime();
    } else if (sortBy === 'quantity') {
      valA = parseFloat(valA) || 0;
      valB = parseFloat(valB) || 0;
    } else {
      valA = String(valA).toLowerCase();
      valB = String(valB).toLowerCase();
    }
    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const SortHeader = ({ field, children }) => (
    <th
      onClick={() => toggleSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {children} {sortBy === field ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u25BD'}
    </th>
  );

  const statusBadge = (status) => <span className={`badge badge-${status}`}>{status}</span>;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>Received Stock</h2>
          <span className="text-muted text-sm">Blood received via completed transfers</span>
        </div>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['available', 'used', 'expired', 'discarded', 'all'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: statusFilter === s ? '2px solid #16a085' : '1px solid #ddd',
              background: statusFilter === s ? '#e8f8f5' : '#fff',
              color: statusFilter === s ? '#16a085' : '#555',
              fontWeight: statusFilter === s ? 600 : 400,
              cursor: 'pointer',
              fontSize: 13,
              textTransform: 'capitalize'
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Stock Received</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="text"
              placeholder="Search blood group, source, ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, width: 250 }}
            />
            <button className="btn btn-secondary" onClick={fetchData}>Refresh</button>
            <ExportButton endpoint="/received-stock" filename="received_stock" params={statusFilter === 'all' ? {} : { status: statusFilter }} />
            <span className="text-muted text-sm">{sortedData.length} record{sortedData.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {data.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{'\u{1F4E6}'}</div>
            <p>No received stock records found.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <SortHeader field="blood_group">Blood Group</SortHeader>
                  <SortHeader field="component_type">Component</SortHeader>
                  <th>Quantity</th>
                  <SortHeader field="source_institution_name">Source Institution</SortHeader>
                  <SortHeader field="expiry_date">Expiry</SortHeader>
                  <th>Expiry Status</th>
                  <SortHeader field="status">Status</SortHeader>
                  <SortHeader field="received_at">Received At</SortHeader>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map(i => (
                  <tr key={i.received_stock_id}>
                    <td><strong>{i.blood_group}</strong></td>
                    <td>{formatComponent(i.component_type)}</td>
                    <td>{i.quantity} {i.unit_type || 'units'}</td>
                    <td style={{ fontSize: 12 }}>{i.source_institution_name || '\u2014'}</td>
                    <td>{i.expiry_date ? new Date(i.expiry_date).toLocaleDateString() : '\u2014'}</td>
                    <td><span className={`badge badge-${i.expiry_category}`}>{i.expiry_category}</span></td>
                    <td>{statusBadge(i.status)}</td>
                    <td style={{ fontSize: 12 }}>{i.received_at ? new Date(i.received_at).toLocaleString() : '\u2014'}</td>
                    <td>
                      {i.status === 'available' ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => updateStatus(i.received_stock_id, 'used')}
                          >
                            Mark Used
                          </button>
                          <button
                            className="btn btn-sm"
                            style={{ background: '#fdf2f0', color: '#c0392b', border: '1px solid #e8b4b8' }}
                            onClick={() => updateStatus(i.received_stock_id, 'discarded')}
                          >
                            Discard
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted text-sm">\u2014</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReceivedStock;
