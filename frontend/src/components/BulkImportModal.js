import React, { useState } from 'react';
import { getToken } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const TEMPLATE = 'blood_group,component_type,quantity,unit_type,collection_date,expiry_date\n' +
                 'A+,whole_blood,5,units,2026-04-10,2026-05-10\n' +
                 'O-,platelets,3,units,2026-04-12,2026-04-17\n';

function BulkImportModal({ onClose, onSuccess }) {
  const { user } = useAuth();
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [errors, setErrors] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFile = (f) => {
    setErrors([]);
    setFile(f);
    if (!f) { setPreview([]); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim().length);
      setPreview(lines.slice(0, 6));
    };
    reader.readAsText(f);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'inventory_template.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleSubmit = async () => {
    if (!file) { toast.error('Choose a CSV file'); return; }
    setUploading(true);
    setErrors([]);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('institution_id', user.institution_id);
      fd.append('created_by', user.user_id);
      const res = await fetch(`${API}/inventory/bulk`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: fd
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.errors) setErrors(json.errors);
        toast.error(json.error || 'Import failed');
      } else {
        toast.success(`Imported ${json.inserted} inventory items`);
        onSuccess && onSuccess();
        onClose();
      }
    } catch (e) {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--card-bg)', color: 'var(--text)', borderRadius: 12, padding: 28, width: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Bulk Import Inventory</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--text-muted)' }}>{'\u00D7'}</button>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Upload a CSV file with columns: blood_group, component_type, quantity, collection_date, expiry_date (unit_type optional). Max 500 rows per upload.
        </p>

        <button className="btn btn-secondary btn-sm" onClick={downloadTemplate} style={{ marginBottom: 16 }}>
          {'\u2B07'} Download Template
        </button>

        <div style={{ marginBottom: 16 }}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={e => handleFile(e.target.files[0])}
            style={{ display: 'block', fontSize: 13 }}
          />
        </div>

        {preview.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>Preview (first 5 rows + header)</div>
            <div style={{ background: 'var(--input-bg)', padding: 10, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {preview.join('\n')}
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div style={{ marginBottom: 16, background: '#fdedec', color: '#c0392b', padding: 10, borderRadius: 6, maxHeight: 160, overflowY: 'auto' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Validation errors — nothing was imported:</div>
            {errors.map((e, idx) => (
              <div key={idx} style={{ fontSize: 11 }}>Row {e.row} \u00B7 <strong>{e.field}</strong>: {e.reason}</div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={uploading || !file}>
            {uploading ? 'Uploading...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkImportModal;
