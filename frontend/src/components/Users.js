import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

function Users({ role }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '', role_id: '', institution_id: ''
  });
  const [institutions, setInstitutions] = useState([]);
  const [changingRole, setChangingRole] = useState(null); // user_id currently being changed
  const [editingName, setEditingName] = useState(null); // user_id being renamed
  const [nameValue, setNameValue] = useState('');

  const toast = useToast();
  const canEdit = role === 'System Admin' || role === 'Institutional Admin';
  const canChangeRoles = role === 'System Admin';

  const fetchUsers = async () => {
    const res = await authFetch('/user');
    if (res.ok) {
      const json = await res.json();
      setUsers(json);
    }
  };

  const fetchRoles = async () => {
    const res = await authFetch('/user/roles');
    if (res.ok) {
      const json = await res.json();
      setRoles(json);
    }
  };

  const fetchInstitutions = async () => {
    const res = await authFetch('/institution');
    if (res.ok) {
      const json = await res.json();
      setInstitutions(json);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchRoles();
    fetchInstitutions();
  }, []);

  // Roles that Institutional Admin can assign
  const allowedRolesForInstAdmin = ['Blood Bank Ops Manager', 'Transfusion Officer'];
  const filteredRoles = role === 'Institutional Admin'
    ? roles.filter(r => allowedRolesForInstAdmin.includes(r.role_name))
    : roles;

  const createUser = async () => {
    // Inst Admin doesn't need institution_id in form — backend auto-sets it
    const needsInstitution = role === 'System Admin';
    if (!form.name || !form.email || !form.password || !form.role_id) return;
    if (needsInstitution && !form.institution_id) return;
    const res = await authFetch('/user', {
      method: 'POST',
      body: JSON.stringify(form)
    });
    if (res.ok) {
      toast.success('User created successfully');
      setForm({ name: '', email: '', phone: '', password: '', role_id: '', institution_id: '' });
      setShowForm(false);
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to create user');
    }
  };

  const changeRole = async (user_id, newRoleId) => {
    const targetUser = users.find(u => u.user_id === user_id);
    const newRole = roles.find(r => r.role_id === newRoleId);
    if (!targetUser || !newRole) return;

    const confirmed = window.confirm(
      `Change ${targetUser.name}'s role from "${targetUser.role_name}" to "${newRole.role_name}"?\n\nThis will log them out immediately.`
    );
    if (!confirmed) return;

    const res = await authFetch(`/user/${user_id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role_id: newRoleId })
    });

    if (res.ok) {
      toast.success('Role updated successfully');
      setChangingRole(null);
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to change role');
    }
  };

  const saveName = async (user_id) => {
    if (!nameValue.trim()) return;
    const res = await authFetch(`/user/${user_id}/name`, {
      method: 'PUT',
      body: JSON.stringify({ name: nameValue.trim() })
    });
    if (res.ok) {
      toast.success('Name updated successfully');
      setEditingName(null);
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to update name');
    }
  };

  const toggleUserStatus = async (user_id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const targetUser = users.find(u => u.user_id === user_id);
    const action = newStatus === 'suspended' ? 'Suspend' : 'Reactivate';
    const confirmed = window.confirm(
      `${action} ${targetUser.name}?${newStatus === 'suspended' ? '\n\nThis will log them out immediately and block further access.' : ''}`
    );
    if (!confirmed) return;

    const res = await authFetch(`/user/${user_id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      toast.success(`User ${newStatus === 'suspended' ? 'suspended' : 'reactivated'} successfully`);
      fetchUsers();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to update status');
    }
  };

  const statusColor = (status) => {
    if (status === 'active') return '#27ae60';
    if (status === 'suspended') return '#e74c3c';
    return '#95a5a6';
  };

  const isSelf = (user_id) => currentUser?.user_id === user_id;

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>User Management</h2>
          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : '+ New User'}
            </button>
          )}
        </div>

        {showForm && canEdit && (
          <div style={{ background: '#f8f9fa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <div className="form-row">
              <div className="form-group">
                <label>Full Name</label>
                <input type="text" placeholder="Full name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={form.role_id} onChange={e => setForm({ ...form, role_id: e.target.value })}>
                  <option value="">Select role</option>
                  {filteredRoles.map(r => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
                </select>
              </div>
              {role === 'System Admin' && (
                <div className="form-group">
                  <label>Institution</label>
                  <select value={form.institution_id} onChange={e => setForm({ ...form, institution_id: e.target.value })}>
                    <option value="">Select institution</option>
                    {institutions.map(i => <option key={i.institution_id} value={i.institution_id}>{i.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={createUser}>Create User</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>All Users</h2>
          <span className="text-muted text-sm">{users.length} user{users.length !== 1 ? 's' : ''}</span>
        </div>
        {users.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{'\u{1F465}'}</div>
            <p>No users found.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  {canChangeRoles && <th>Change Role</th>}
                  {canEdit && <th>Access</th>}
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.user_id}>
                    <td>
                      {editingName === u.user_id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input
                            type="text"
                            value={nameValue}
                            onChange={e => setNameValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveName(u.user_id); if (e.key === 'Escape') setEditingName(null); }}
                            style={{ fontSize: 13, padding: '3px 8px', borderRadius: 4, border: '1px solid #ddd', width: 160 }}
                            autoFocus
                          />
                          <button
                            onClick={() => saveName(u.user_id)}
                            style={{ fontSize: 11, padding: '3px 8px', background: '#27ae60', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingName(null)}
                            style={{ fontSize: 11, padding: '3px 8px', background: '#f2f3f4', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <strong>{u.name}</strong>
                          {isSelf(u.user_id) && (
                            <span style={{ fontSize: 10, color: '#95a5a6' }}>(you)</span>
                          )}
                          {canChangeRoles && !isSelf(u.user_id) && (
                            <button
                              onClick={() => { setEditingName(u.user_id); setNameValue(u.name); }}
                              title="Edit name"
                              style={{ fontSize: 10, padding: '1px 5px', background: 'none', border: '1px solid #ddd', borderRadius: 3, cursor: 'pointer', color: '#95a5a6', lineHeight: 1 }}
                            >
                              {'\u270E'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                        fontSize: 12, fontWeight: 600, color: '#555', background: '#f0f0f0'
                      }}>
                        {u.role_name}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                        fontSize: 12, fontWeight: 600,
                        color: statusColor(u.status),
                        background: statusColor(u.status) + '15'
                      }}>
                        {u.status}
                      </span>
                    </td>
                    <td className="text-muted text-sm">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}
                    </td>
                    {canChangeRoles && (
                      <td>
                        {isSelf(u.user_id) ? (
                          <span style={{ fontSize: 11, color: '#bdc3c7' }}>N/A</span>
                        ) : changingRole === u.user_id ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <select
                              defaultValue={u.role_id}
                              onChange={e => changeRole(u.user_id, e.target.value)}
                              style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid #ddd' }}
                            >
                              {roles.map(r => (
                                <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => setChangingRole(null)}
                              style={{ fontSize: 11, padding: '4px 8px', background: '#f2f3f4', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setChangingRole(u.user_id)}
                            style={{
                              fontSize: 11, padding: '4px 10px',
                              background: '#fff', border: '1px solid #ddd',
                              borderRadius: 4, cursor: 'pointer', color: '#555'
                            }}
                          >
                            Change
                          </button>
                        )}
                      </td>
                    )}
                    {canEdit && (
                      <td>
                        {isSelf(u.user_id) ? (
                          <span style={{ fontSize: 11, color: '#bdc3c7' }}>N/A</span>
                        ) : (role === 'Institutional Admin' && (u.role_name === 'System Admin' || u.role_name === 'Institutional Admin')) ? (
                          <span style={{ fontSize: 11, color: '#bdc3c7' }}>N/A</span>
                        ) : u.status === 'active' ? (
                          <button
                            onClick={() => toggleUserStatus(u.user_id, u.status)}
                            style={{
                              fontSize: 11, padding: '4px 10px',
                              background: '#fdedec', border: '1px solid #f5c6cb',
                              borderRadius: 4, cursor: 'pointer', color: '#e74c3c', fontWeight: 600
                            }}
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleUserStatus(u.user_id, u.status)}
                            style={{
                              fontSize: 11, padding: '4px 10px',
                              background: '#eafaf1', border: '1px solid #a9dfbf',
                              borderRadius: 4, cursor: 'pointer', color: '#27ae60', fontWeight: 600
                            }}
                          >
                            Reactivate
                          </button>
                        )}
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

export default Users;
