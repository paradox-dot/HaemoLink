import React, { useState } from 'react';
import { authFetch } from '../services/api';

function PasswordChangeModal({ onClose }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.new_password !== form.confirm_password) {
      setError('New passwords do not match');
      return;
    }
    if (form.new_password.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await authFetch('/auth/change-password', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: form.current_password,
          new_password: form.new_password
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 7,
    border: '1.5px solid #e0d6d3', fontSize: 14, outline: 'none', boxSizing: 'border-box'
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 28, width: 380,
        boxShadow: '0 12px 40px rgba(0,0,0,0.2)'
      }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: '#2c2c2c' }}>Change Password</h3>

        {success ? (
          <div>
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>{'\u2705'}</div>
              <p style={{ color: '#27ae60', fontWeight: 600 }}>Password changed successfully!</p>
            </div>
            <button onClick={onClose} style={{
              width: '100%', padding: 10, background: '#c0392b', color: '#fff',
              border: 'none', borderRadius: 7, fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}>
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#fdedec', color: '#e74c3c', padding: '8px 12px',
                borderRadius: 6, fontSize: 12, marginBottom: 12, border: '1px solid #f5c6cb'
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#777', marginBottom: 4 }}>Current Password</label>
              <input type="password" style={inputStyle} value={form.current_password}
                onChange={e => setForm({ ...form, current_password: e.target.value })} required />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#777', marginBottom: 4 }}>New Password</label>
              <input type="password" style={inputStyle} placeholder="Min 8 characters" value={form.new_password}
                onChange={e => setForm({ ...form, new_password: e.target.value })} required />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#777', marginBottom: 4 }}>Confirm New Password</label>
              <input type="password" style={inputStyle} value={form.confirm_password}
                onChange={e => setForm({ ...form, confirm_password: e.target.value })} required />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} style={{
                flex: 1, padding: 10, background: '#f2f3f4', color: '#555',
                border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}>
                Cancel
              </button>
              <button type="submit" disabled={loading} style={{
                flex: 1, padding: 10, background: loading ? '#95a5a6' : '#c0392b', color: '#fff',
                border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer'
              }}>
                {loading ? 'Saving...' : 'Change Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default PasswordChangeModal;
