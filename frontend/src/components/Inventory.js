import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import ExportButton from './ExportButton';
import BulkImportModal from './BulkImportModal';

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

function Inventory({ role }) {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState([]);
  const [statusFilter, setStatusFilter] = useState('available');
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [search, setSearch] = useState('');
  const todayLocal = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const [form, setForm] = useState({
    blood_group: '',
    component_type: '',
    quantity: '',
    collection_date: todayLocal(),
    expiry_date: ''
  });

  const canEdit = role === 'Blood Bank Ops Manager' || role === 'System Admin';
  const canDelete = role === 'System Admin' || role === 'Institutional Admin' || role === 'Blood Bank Ops Manager';
  const canEditExisting = role === 'System Admin';

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showBulkImport, setShowBulkImport] = useState(false);

  const fetchData = async () => {
    const url = statusFilter === 'all'
      ? '/inventory'
      : `/inventory?status=${statusFilter}`;
    const res = await authFetch(url);
    const json = await res.json();
    setData(json);
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const addInventory = async () => {
    if (!form.blood_group || !form.component_type || !form.quantity || !form.expiry_date) return;
    const res = await authFetch('/inventory', {
      method: 'POST',
      body: JSON.stringify({
        institution_id: user.institution_id,
        created_by: user.user_id,
        ...form
      })
    });
    if (res.ok) {
      toast.success('Inventory added successfully');
      setForm({ blood_group: '', component_type: '', quantity: '', collection_date: todayLocal(), expiry_date: '' });
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to add inventory');
    }
  };

  const deleteInventory = async (inventory_id) => {
    if (!window.confirm('Delete this inventory item? This cannot be undone.')) return;
    const res = await authFetch(`/inventory/${inventory_id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Inventory deleted');
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to delete inventory');
    }
  };

  const openEdit = (item) => {
    setEditItem(item);
    setEditForm({
      blood_group: item.blood_group,
      component_type: item.component_type,
      quantity: item.quantity,
      expiry_date: item.expiry_date ? item.expiry_date.substring(0, 10) : ''
    });
  };

  const saveEdit = async () => {
    const res = await authFetch(`/inventory/${editItem.inventory_id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...editForm, changed_by: user.user_id })
    });
    if (res.ok) {
      toast.success('Inventory updated');
      setEditItem(null);
      fetchData();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to update inventory');
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
           (i.status || '').toLowerCase().includes(q) ||
           (i.inventory_id || '').toLowerCase().includes(q);
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortBy) return 0;
    let valA = a[sortBy] ?? '';
    let valB = b[sortBy] ?? '';
    if (sortBy === 'expiry_date' || sortBy === 'collection_date') {
      valA = new Date(valA || 0).getTime();
      valB = new Date(valB || 0).getTime();
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

  return (
    <div>
      {canEdit && (
        <div className="card">
          <div className="card-header">
            <h2>Add Inventory</h2>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkImport(true)}>
              {'\u{1F4C4}'} Bulk Import CSV
            </button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Blood Group</label>
              <select
                value={form.blood_group}
                onChange={e => setForm({ ...form, blood_group: e.target.value })}
              >
                <option value="">Select group</option>
                {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Component</label>
              <select
                value={form.component_type}
                onChange={e => setForm({ ...form, component_type: e.target.value })}
              >
                <option value="">Select component</option>
                {COMPONENTS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Quantity (units)</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 10"
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Collection Date</label>
              <input
                type="date"
                value={form.collection_date}
                onChange={e => setForm({ ...form, collection_date: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Expiry Date</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={e => setForm({ ...form, expiry_date: e.target.value })}
              />
            </div>
            <button className="btn btn-primary" onClick={addInventory}>
              + Add
            </button>
          </div>
        </div>
      )}

      {!canEdit && (
        <div className="card">
          <div className="card-header">
            <h2>Inventory</h2>
            <span style={{ fontSize: 12, color: '#95a5a6', background: '#f2f3f4', padding: '4px 10px', borderRadius: 12 }}>Read-only</span>
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['available', 'reserved', 'in_transfer', 'expired', 'consumed', 'all'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: statusFilter === s ? '2px solid #c0392b' : '1px solid #ddd',
              background: statusFilter === s ? '#fdf2f0' : '#fff',
              color: statusFilter === s ? '#c0392b' : '#555',
              fontWeight: statusFilter === s ? 600 : 400,
              cursor: 'pointer',
              fontSize: 13,
              textTransform: 'capitalize'
            }}
          >
            {s === 'in_transfer' ? 'In Transfer' : s}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Current Stock</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="text"
              placeholder="Search blood group, component, ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, width: 250 }}
            />
            <span className="text-muted text-sm">{sortedData.length} record{sortedData.length !== 1 ? 's' : ''}</span>
            <ExportButton endpoint="/inventory" filename="inventory" params={statusFilter === 'all' ? {} : { status: statusFilter }} />
          </div>
        </div>
        {data.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{'\u{1FA78}'}</div>
            <p>No inventory records found.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <SortHeader field="blood_group">Blood Group</SortHeader>
                  <SortHeader field="component_type">Component</SortHeader>
                  <SortHeader field="collection_date">Age</SortHeader>
                  <th>Quantity</th>
                  <SortHeader field="status">Status</SortHeader>
                  <SortHeader field="expiry_date">Expiry</SortHeader>
                  <SortHeader field="institution_name">Institution</SortHeader>
                  <th>ID</th>
                  {(canDelete || canEditExisting) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sortedData.map(i => (
                  <tr key={i.inventory_id}>
                    <td><strong>{i.blood_group}</strong></td>
                    <td>{formatComponent(i.component_type)}</td>
                    <td>{(() => {
                      if (!i.collection_date) return <span className="text-muted">—</span>;
                      const days = Math.floor((Date.now() - new Date(i.collection_date).getTime()) / 86400000);
                      const color = days < 7 ? '#27ae60' : days <= 14 ? '#f39c12' : '#e74c3c';
                      const bg = days < 7 ? '#e8f8f0' : days <= 14 ? '#fef6e7' : '#fdedec';
                      return <span style={{ background: bg, color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{days}d</span>;
                    })()}</td>
                    <td>{i.quantity} units</td>
                    <td><span className={`badge badge-${i.status}`}>{i.status}</span></td>
                    <td>
                      <span className={`badge badge-${i.expiry_category}`}>{i.expiry_category}</span>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{i.expiry_date ? new Date(i.expiry_date).toLocaleDateString() : ''}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{i.institution_name || '—'}</td>
                    <td className="font-mono text-muted">{i.inventory_id}</td>
                    {(canDelete || canEditExisting) && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {canEditExisting && (
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(i)}>Edit</button>
                          )}
                          {canDelete && (
                            <button
                              className="btn btn-sm"
                              style={{ background: '#fdf2f0', color: '#c0392b', border: '1px solid #e8b4b8' }}
                              onClick={() => deleteInventory(i.inventory_id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showBulkImport && (
        <BulkImportModal onClose={() => setShowBulkImport(false)} onSuccess={fetchData} />
      )}
      {editItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <h3 style={{ marginBottom: 16 }}>Edit Inventory</h3>
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
                <label>Quantity (units)</label>
                <input type="number" min="1" value={editForm.quantity} onChange={e => setEditForm({ ...editForm, quantity: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Expiry Date</label>
                <input type="date" value={editForm.expiry_date} onChange={e => setEditForm({ ...editForm, expiry_date: e.target.value })} />
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

export default Inventory;
