import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const API = 'http://localhost:5000';

function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1 = form, 2 = success
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    inst_name: '', inst_type: 'private', inst_sub_type: 'blood_bank',
    license_number: '', city: '', contact_email: '', contact_phone: '',
    admin_name: '', admin_email: '', admin_password: '', confirm_password: ''
  });
  const [file, setFile] = useState(null);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.admin_password !== form.confirm_password) {
      setError('Passwords do not match');
      return;
    }
    if (form.admin_password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!file) {
      setError('Please upload your license document');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, val]) => {
        if (key !== 'confirm_password') formData.append(key, val);
      });
      formData.append('license_document', file);

      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        body: formData
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Registration failed');
      }

      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid #ddd', fontSize: 14, outline: 'none', boxSizing: 'border-box'
  };

  const labelStyle = { display: 'block', fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6 };

  if (step === 2) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #7f1d1d 0%, #c0392b 50%, #e74c3c 100%)'
      }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 40, width: 480, textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>{'\u2705'}</div>
          <h2 style={{ color: '#27ae60', marginBottom: 8 }}>Registration Submitted!</h2>
          <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6 }}>
            Your institution registration is pending approval by the System Administrator.
            You will be able to log in once your registration is approved.
          </p>
          <Link to="/login" style={{
            display: 'inline-block', marginTop: 24, padding: '10px 24px',
            background: '#c0392b', color: '#fff', borderRadius: 8,
            textDecoration: 'none', fontWeight: 600, fontSize: 14
          }}>
            Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #7f1d1d 0%, #c0392b 50%, #e74c3c 100%)',
      padding: '40px 16px'
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 40, width: 560,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>{'\u{1FA78}'}</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#c0392b', margin: 0 }}>Register Institution</h1>
          <p style={{ color: '#95a5a6', fontSize: 13, marginTop: 4 }}>
            Submit your institution details for approval
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{
              background: '#fdedec', color: '#e74c3c', padding: '10px 14px',
              borderRadius: 8, fontSize: 13, marginBottom: 16, border: '1px solid #f5c6cb'
            }}>
              {error}
            </div>
          )}

          {/* Institution Details */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, color: '#c0392b', borderBottom: '2px solid #fdf2f0', paddingBottom: 6, marginBottom: 16 }}>
              Institution Details
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Institution Name *</label>
              <input style={inputStyle} placeholder="e.g. City Blood Bank" value={form.inst_name} onChange={e => set('inst_name', e.target.value)} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Type *</label>
                <select style={inputStyle} value={form.inst_type} onChange={e => set('inst_type', e.target.value)}>
                  <option value="government">Government</option>
                  <option value="private">Private</option>
                  <option value="trust">Trust</option>
                  <option value="ngo">NGO</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sub Type *</label>
                <select style={inputStyle} value={form.inst_sub_type} onChange={e => set('inst_sub_type', e.target.value)}>
                  <option value="blood_bank">Blood Bank</option>
                  <option value="hospital">Hospital</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>License Number *</label>
                <input style={inputStyle} placeholder="License #" value={form.license_number} onChange={e => set('license_number', e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>City *</label>
                <input style={inputStyle} placeholder="City" value={form.city} onChange={e => set('city', e.target.value)} required />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Contact Email</label>
                <input style={inputStyle} type="email" placeholder="email@institution.org" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Contact Phone</label>
                <input style={inputStyle} type="tel" placeholder="+91 XXXXX XXXXX" value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>License Document * (PDF, JPG, PNG — max 5MB)</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={e => setFile(e.target.files[0])}
                style={{ fontSize: 13 }}
                required
              />
              {file && (
                <div style={{ fontSize: 12, color: '#27ae60', marginTop: 4 }}>
                  Selected: {file.name} ({(file.size / 1024).toFixed(0)} KB)
                </div>
              )}
            </div>
          </div>

          {/* Admin User Details */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, color: '#c0392b', borderBottom: '2px solid #fdf2f0', paddingBottom: 6, marginBottom: 16 }}>
              Admin User Details
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Full Name *</label>
              <input style={inputStyle} placeholder="Admin full name" value={form.admin_name} onChange={e => set('admin_name', e.target.value)} required />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Email *</label>
              <input style={inputStyle} type="email" placeholder="admin@institution.org" value={form.admin_email} onChange={e => set('admin_email', e.target.value)} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Password *</label>
                <input style={inputStyle} type="password" placeholder="Min 8 characters" value={form.admin_password} onChange={e => set('admin_password', e.target.value)} required />
              </div>
              <div>
                <label style={labelStyle}>Confirm Password *</label>
                <input style={inputStyle} type="password" placeholder="Re-enter password" value={form.confirm_password} onChange={e => set('confirm_password', e.target.value)} required />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', background: loading ? '#95a5a6' : '#c0392b',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 15,
              fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Submitting...' : 'Submit Registration'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#7f8c8d' }}>
          Already registered?{' '}
          <Link to="/login" style={{ color: '#c0392b', fontWeight: 600, textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Register;
