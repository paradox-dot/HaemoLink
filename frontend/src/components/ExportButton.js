import React, { useState } from 'react';
import { authFetch } from '../services/api';
import { useToast } from './Toast';

function ExportButton({ endpoint, filename = 'export', params = {}, label = 'Export CSV' }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    try {
      setLoading(true);
      const qs = new URLSearchParams({ ...params, format: 'csv' }).toString();
      const url = endpoint.includes('?') ? `${endpoint}&${qs}` : `${endpoint}?${qs}`;
      const res = await authFetch(url);
      if (!res.ok) {
        toast.error('Export failed');
        return;
      }
      const blob = await res.blob();
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${filename}_${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      toast.success('Exported');
    } catch (e) {
      toast.error('Export failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="btn btn-secondary btn-sm"
      onClick={handleExport}
      disabled={loading}
      title="Download CSV"
    >
      {loading ? 'Exporting...' : `\u2B07 ${label}`}
    </button>
  );
}

export default ExportButton;
