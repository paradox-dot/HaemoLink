import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import { useToast } from './Toast';

const API = 'http://localhost:5000';

function Institutions({ role }) {
  const [institutions, setInstitutions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({
    name: '', type: 'private', sub_type: 'blood_bank', license_number: '',
    city: '', contact_email: '', contact_phone: ''
  });

  const toast = useToast();
  const canEdit = role === 'System Admin';

  const fetchInstitutions = async () => {
    const url = filter === 'all' ? '/institution' : `/institution?status=${filter}`;
    const res = await authFetch(url);
    if (res.ok) {
      const json = await res.json();
      setInstitutions(json);
    }
  };

  useEffect(() => {
    fetchInstitutions();
  }, [filter]);

  const createInstitution = async () => {
    if (!form.name || !form.type || !form.sub_type || !form.city || !form.license_number) return;
    const res = await authFetch('/institution', {
      method: 'POST',
      body: JSON.stringify(form)
    });
    if (res.ok) {
      toast.success('Institution created successfully');
      setForm({ name: '', type: 'private', sub_type: 'blood_bank', license_number: '', city: '', contact_email: '', contact_phone: '' });
      setShowForm(false);
      fetchInstitutions();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to create institution');
    }
  };

  const updateStatus = async (institution_id, status) => {
    const confirmMsg = status === 'verified'
      ? 'Approve this institution? The registered admin will be activated.'
      : status === 'rejected'
        ? 'Reject this institution? The registered admin will remain inactive.'
        : status === 'suspended'
          ? 'Suspend this institution? All its users will be logged out.'
          : 'Update status?';

    if (!window.confirm(confirmMsg)) return;

    const res = await authFetch(`/institution/${institution_id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      const labels = { verified: 'approved', rejected: 'rejected', suspended: 'suspended' };
      toast.success(`Institution ${labels[status] || 'updated'} successfully`);
    } else {
      toast.error('Failed to update institution status');
    }
    fetchInstitutions();
  };

  const statusColor = (status) => {
    if (status === 'verified') return '#27ae60';
    if (status === 'suspended') return '#e74c3c';
    if (status === 'rejected') return '#95a5a6';
    return '#f39c12'; // pending
  };

  const pendingCount = institutions.filter(i => i.status === 'pending').length;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>Institution Management</h2>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : '+ New Institution'}
            </button>
          )}
        </div>

        {showForm && canEdit && (
          <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input type="text" placeholder="Institution name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="government">Government</option>
                  <option value="private">Private</option>
                  <option value="trust">Trust</option>
                  <option value="ngo">NGO</option>
                </select>
              </div>
              <div className="form-group">
                <label>Sub Type</label>
                <select value={form.sub_type} onChange={e => setForm({ ...form, sub_type: e.target.value })}>
                  <option value="blood_bank">Blood Bank</option>
                  <option value="hospital">Hospital</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div className="form-group">
                <label>License Number</label>
                <input type="text" placeholder="License #" value={form.license_number} onChange={e => setForm({ ...form, license_number: e.target.value })} />
              </div>
              <div className="form-group">
                <label>City</label>
                <input type="text" placeholder="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="Contact email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" placeholder="Contact phone" value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={createInstitution}>Create Institution</button>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'pending', 'verified', 'suspended', 'rejected'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: filter === f ? '2px solid #c0392b' : '1px solid #ddd',
              background: filter === f ? '#fdf2f0' : '#fff',
              color: filter === f ? '#c0392b' : '#555',
              fontWeight: filter === f ? 600 : 400,
              cursor: 'pointer', fontSize: 13, textTransform: 'capitalize',
              position: 'relative'
            }}
          >
            {f}
            {f === 'pending' && pendingCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                background: '#e74c3c', color: '#fff', fontSize: 10,
                width: 18, height: 18, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700
              }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>{filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)} Institutions</h2>
          <span className="text-muted text-sm">{institutions.length} institution{institutions.length !== 1 ? 's' : ''}</span>
        </div>
        {institutions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{'\u{1F3E5}'}</div>
            <p>No institutions found.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Sub Type</th>
                  <th>City</th>
                  <th>License</th>
                  <th>Admin</th>
                  <th>Document</th>
                  <th>Status</th>
                  {canEdit && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {institutions.map(i => (
                  <tr key={i.institution_id} style={i.status === 'pending' ? { background: '#fffde7' } : {}}>
                    <td><strong>{i.name}</strong></td>
                    <td style={{ textTransform: 'capitalize' }}>{i.type?.replace('_', ' ')}</td>
                    <td style={{ textTransform: 'capitalize' }}>{i.sub_type?.replace('_', ' ')}</td>
                    <td>{i.city || '-'}</td>
                    <td className="font-mono text-muted" style={{ fontSize: 12 }}>{i.license_number || '-'}</td>
                    <td>
                      {i.admin_name ? (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{i.admin_name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{i.admin_email}</div>
                        </div>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td>
                      {i.license_document ? (
                        <a
                          href={`${API}/uploads/${i.license_document}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: 12, color: '#3498db', fontWeight: 600, textDecoration: 'none' }}
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-muted" style={{ fontSize: 12 }}>-</span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                        fontSize: 12, fontWeight: 600,
                        color: statusColor(i.status),
                        background: statusColor(i.status) + '15'
                      }}>
                        {i.status}
                      </span>
                    </td>
                    {canEdit && (
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {i.status === 'pending' && (
                            <>
                              <button
                                style={{ fontSize: 11, padding: '3px 8px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                onClick={() => updateStatus(i.institution_id, 'verified')}
                              >
                                Approve
                              </button>
                              <button
                                style={{ fontSize: 11, padding: '3px 8px', background: '#95a5a6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                                onClick={() => updateStatus(i.institution_id, 'rejected')}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {i.status === 'verified' && (
                            <button
                              style={{ fontSize: 11, padding: '3px 8px', background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                              onClick={() => updateStatus(i.institution_id, 'suspended')}
                            >
                              Suspend
                            </button>
                          )}
                          {(i.status === 'suspended' || i.status === 'rejected') && (
                            <button
                              style={{ fontSize: 11, padding: '3px 8px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                              onClick={() => updateStatus(i.institution_id, 'verified')}
                            >
                              Approve
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
    </div>
  );
}

export default Institutions;
