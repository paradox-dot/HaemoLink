import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import ExportButton from './ExportButton';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS = [
  { value: 'whole_blood', label: 'Whole Blood' },
  { value: 'platelets', label: 'Platelets' },
  { value: 'plasma', label: 'Plasma' },
  { value: 'rbc', label: 'Packed RBC' }
];

const formatComponent = (val) => {
  const map = { whole_blood: 'Whole Blood', platelets: 'Platelets', plasma: 'Plasma', rbc: 'Packed RBC' };
  return map[val] || val;
};

function Demand({ role }) {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [statusFilter, setStatusFilter] = useState('active');
  const [scope, setScope] = useState('mine'); // 'mine' or 'network'
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    blood_group: '',
    component_type: '',
    qty_needed: '',
    urgency_level: 'routine',
    demand_type: 'hard',
    required_by: ''
  });

  const canEdit = role === 'Transfusion Officer' || role === 'System Admin';
  const canDelete = role === 'System Admin' || role === 'Institutional Admin' || role === 'Transfusion Officer';
  const canCancel = role === 'System Admin' || role === 'Institutional Admin' || role === 'Transfusion Officer';
  const canEditExisting = role === 'System Admin';

  const isSystemAdmin = role === 'System Admin';

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});

  const fetchData = async () => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (scope === 'network' && !isSystemAdmin) params.set('scope', 'network');
    const qs = params.toString();
    const url = `/demand${qs ? '?' + qs : ''}`;
    const res = await authFetch(url);
    const json = await res.json();
    setData(json);
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, scope]);

  const addDemand = async () => {
    if (!form.blood_group || !form.component_type || !form.qty_needed || !form.required_by) return;
    const res = await authFetch('/demand', {
      method: 'POST',
      body: JSON.stringify({
        institution_id: user.institution_id,
        created_by: user.user_id,
        ...form
      })
    });
    if (res.ok) {
      toast.success('Demand request created successfully');
      setForm({ blood_group: '', component_type: '', qty_needed: '', urgency_level: 'routine', demand_type: 'hard', required_by: '' });
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to create demand request');
    }
  };

  const deleteDemand = async (request_id) => {
    if (!window.confirm('Delete this demand request? This cannot be undone.')) return;
    const res = await authFetch(`/demand/${request_id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Demand deleted');
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to delete demand');
    }
  };

  const cancelDemand = async (request_id) => {
    if (!window.confirm('Cancel this demand request? Any proposed matches will be superseded.')) return;
    const res = await authFetch(`/demand/${request_id}/cancel`, { method: 'PUT' });
    if (res.ok) {
      toast.success('Demand cancelled');
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to cancel demand');
    }
  };

  const openEdit = (item) => {
    setEditItem(item);
    setEditForm({
      blood_group: item.blood_group,
      component_type: item.component_type,
      qty_needed: item.qty_needed,
      urgency_level: item.urgency_level,
      demand_type: item.demand_type,
      required_by: item.required_by ? item.required_by.substring(0, 16) : ''
    });
  };

  const saveEdit = async () => {
    const res = await authFetch(`/demand/${editItem.request_id}`, {
      method: 'PUT',
      body: JSON.stringify(editForm)
    });
    if (res.ok) {
      toast.success('Demand updated');
      setEditItem(null);
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to update demand');
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

  const urgencyOrder = { emergency: 3, urgent: 2, routine: 1 };

  const filteredData = data.filter(d => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (d.blood_group || '').toLowerCase().includes(q) ||
           (formatComponent(d.component_type) || '').toLowerCase().includes(q) ||
           (d.urgency_level || '').toLowerCase().includes(q) ||
           (d.status || '').toLowerCase().includes(q) ||
           (d.request_id || '').toLowerCase().includes(q);
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortBy) return 0;
    let valA, valB;
    if (sortBy === 'required_by') {
      valA = new Date(a.required_by || 0).getTime();
      valB = new Date(b.required_by || 0).getTime();
    } else if (sortBy === 'urgency_level') {
      valA = urgencyOrder[a.urgency_level] || 0;
      valB = urgencyOrder[b.urgency_level] || 0;
    } else if (sortBy === 'priority_score') {
      valA = parseFloat(a.priority_score) || 0;
      valB = parseFloat(b.priority_score) || 0;
    } else {
      valA = String(a[sortBy] ?? '').toLowerCase();
      valB = String(b[sortBy] ?? '').toLowerCase();
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

  const urgencyBadge = (level) => <span className={`badge badge-${level}`}>{level}</span>;
  const statusBadge = (status) => <span className={`badge badge-${status}`}>{status}</span>;

  return (
    <div>
      {canEdit && (
        <div className="card">
          <div className="card-header">
            <h2>Create Demand Request</h2>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Blood Group</label>
              <select value={form.blood_group} onChange={e => setForm({ ...form, blood_group: e.target.value })}>
                <option value="">Select group</option>
                {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Component</label>
              <select value={form.component_type} onChange={e => setForm({ ...form, component_type: e.target.value })}>
                <option value="">Select component</option>
                {COMPONENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Quantity Needed</label>
              <input type="number" min="1" placeholder="e.g. 5" value={form.qty_needed} onChange={e => setForm({ ...form, qty_needed: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Urgency</label>
              <select value={form.urgency_level} onChange={e => setForm({ ...form, urgency_level: e.target.value })}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div className="form-group">
              <label>Demand Type</label>
              <select value={form.demand_type} onChange={e => setForm({ ...form, demand_type: e.target.value })}>
                <option value="hard">Hard (exact match)</option>
                <option value="soft">Soft (compatible)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Required By</label>
              <input type="datetime-local" value={form.required_by} onChange={e => setForm({ ...form, required_by: e.target.value })} />
            </div>
            <button className="btn btn-primary" onClick={addDemand}>+ Create</button>
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="card">
          <div className="card-header">
            <h2>Demand Requests</h2>
            <span style={{ fontSize: 12, color: '#95a5a6', background: '#f2f3f4', padding: '4px 10px', borderRadius: 12 }}>Read-only</span>
          </div>
        </div>
      )}

      {/* Scope toggle */}
      {!isSystemAdmin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#777', textTransform: 'uppercase', letterSpacing: 0.5 }}>View:</span>
          {['mine', 'network'].map(s => (
            <button
              key={s}
              onClick={() => setScope(s)}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: scope === s ? 600 : 400,
                border: scope === s ? '2px solid #2980b9' : '1px solid #ddd',
                background: scope === s ? '#ebf5fb' : '#fff',
                color: scope === s ? '#2980b9' : '#777',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              {s === 'mine' ? 'My Institution' : 'Network-wide'}
            </button>
          ))}
        </div>
      )}

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['active', 'under_matching', 'partial', 'fulfilled', 'expired', 'cancelled', 'all'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: statusFilter === s ? '2px solid #c0392b' : '1px solid #ddd',
              background: statusFilter === s ? '#fdf2f0' : '#fff',
              color: statusFilter === s ? '#c0392b' : '#555',
              fontWeight: statusFilter === s ? 600 : 400,
              cursor: 'pointer', fontSize: 13, textTransform: 'capitalize'
            }}
          >
            {s === 'under_matching' ? 'Under Matching' : s}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Demand Requests</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="text"
              placeholder="Search blood group, urgency, ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, width: 250 }}
            />
            <span className="text-muted text-sm">{sortedData.length} request{sortedData.length !== 1 ? 's' : ''}</span>
            <ExportButton endpoint="/demand" filename="demand" />
          </div>
        </div>
        {data.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{'\u{1F4CB}'}</div>
            <p>No demand requests found.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <SortHeader field="blood_group">Blood Group</SortHeader>
                  <SortHeader field="component_type">Component</SortHeader>
                  <th>Qty Needed</th>
                  <SortHeader field="urgency_level">Urgency</SortHeader>
                  <SortHeader field="priority_score">Priority</SortHeader>
                  <SortHeader field="status">Status</SortHeader>
                  <SortHeader field="required_by">Required By</SortHeader>
                  <th>ID</th>
                  {(canDelete || canCancel || canEditExisting) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sortedData.map(d => {
                  const isClosed = ['fulfilled', 'expired', 'cancelled'].includes(d.status);
                  const isLocked = d.status === 'under_matching';
                  return (
                  <tr key={d.request_id}>
                    <td><strong>{d.blood_group}</strong></td>
                    <td>{formatComponent(d.component_type)}</td>
                    <td>{d.qty_needed} units</td>
                    <td>{urgencyBadge(d.urgency_level)}</td>
                    <td><strong>{d.priority_score}</strong></td>
                    <td>{statusBadge(d.status)}</td>
                    <td>{d.required_by ? new Date(d.required_by).toLocaleString() : '-'}</td>
                    <td className="font-mono text-muted">{d.request_id}</td>
                    {(canDelete || canCancel || canEditExisting) && (
                      <td>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {canEditExisting && !isClosed && !isLocked && (
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(d)}>Edit</button>
                          )}
                          {canCancel && ['active', 'partial'].includes(d.status) && (
                            <button
                              className="btn btn-sm"
                              style={{ background: '#fff8e1', color: '#e67e22', border: '1px solid #f0c060' }}
                              onClick={() => cancelDemand(d.request_id)}
                            >
                              Cancel
                            </button>
                          )}
                          {canDelete && !isLocked && (
                            <button
                              className="btn btn-sm"
                              style={{ background: '#fdf2f0', color: '#c0392b', border: '1px solid #e8b4b8' }}
                              onClick={() => deleteDemand(d.request_id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 520, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ marginBottom: 16 }}>Edit Demand Request</h3>
            <div className="form-row" style={{ flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label>Blood Group</label>
                <select value={editForm.blood_group} onChange={e => setEditForm({ ...editForm, blood_group: e.target.value })}>
                  {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Component</label>
                <select value={editForm.component_type} onChange={e => setEditForm({ ...editForm, component_type: e.target.value })}>
                  {COMPONENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Quantity Needed</label>
                <input type="number" min="1" value={editForm.qty_needed} onChange={e => setEditForm({ ...editForm, qty_needed: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Urgency</label>
                <select value={editForm.urgency_level} onChange={e => setEditForm({ ...editForm, urgency_level: e.target.value })}>
                  <option value="routine">Routine</option>
                  <option value="urgent">Urgent</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div className="form-group">
                <label>Demand Type</label>
                <select value={editForm.demand_type} onChange={e => setEditForm({ ...editForm, demand_type: e.target.value })}>
                  <option value="hard">Hard (exact match)</option>
                  <option value="soft">Soft (compatible)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Required By</label>
                <input type="datetime-local" value={editForm.required_by} onChange={e => setEditForm({ ...editForm, required_by: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEditItem(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEdit}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Demand;
