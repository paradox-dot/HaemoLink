import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';

const COMPONENT_LABELS = {
  whole_blood: 'Whole Blood',
  rbc:         'Packed RBC',
  plasma:      'Plasma (FFP)',
  platelets:   'Platelet Concentrate',
};

const COMPONENTS = ['whole_blood', 'rbc', 'plasma', 'platelets'];

function formatInr(val) {
  if (val == null || val === '') return '—';
  return '₹' + parseFloat(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Pricing({ role }) {
  const { user } = useAuth();
  const toast = useToast();

  // SA can switch institution; others are locked to their own
  const [institutions, setInstitutions] = useState([]);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState(
    role === 'System Admin' ? '' : user?.institution_id
  );

  // pricing rows keyed by `${component_type}_${hospital_tier}`
  const [pricing, setPricing] = useState({});
  const [activeTab, setActiveTab] = useState('private'); // 'private' | 'government'
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load blood bank institutions list for SA
  useEffect(() => {
    if (role === 'System Admin') {
      authFetch('/pricing/institutions')
        .then(r => r.json())
        .then(data => {
          setInstitutions(data);
          if (data.length > 0 && !selectedInstitutionId) {
            setSelectedInstitutionId(data[0].institution_id);
          }
        })
        .catch(() => {});
    }
  }, [role]);

  // Load pricing for selected institution
  useEffect(() => {
    if (!selectedInstitutionId) return;
    setLoading(true);
    authFetch(`/pricing/${selectedInstitutionId}`)
      .then(r => r.json())
      .then(rows => {
        const map = {};
        rows.forEach(r => {
          map[`${r.component_type}_${r.hospital_tier}`] = {
            unit_price: r.unit_price != null ? String(r.unit_price) : '',
            nat_charge: r.nat_charge != null ? String(r.nat_charge) : '',
            nat_includes_gst: !!r.nat_includes_gst,
          };
        });
        setPricing(map);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedInstitutionId]);

  const getRow = (component, tier) =>
    pricing[`${component}_${tier}`] || { unit_price: '', nat_charge: '', nat_includes_gst: false };

  const setRow = (component, tier, field, value) => {
    const key = `${component}_${tier}`;
    setPricing(prev => ({
      ...prev,
      [key]: { ...getRow(component, tier), [field]: value }
    }));
  };

  const loadDefaults = async () => {
    const res = await authFetch('/pricing/defaults');
    const defaults = await res.json();
    const map = {};
    defaults.forEach(r => {
      map[`${r.component_type}_${r.hospital_tier}`] = {
        unit_price: String(r.unit_price),
        nat_charge: String(r.nat_charge),
        nat_includes_gst: !!r.nat_includes_gst,
      };
    });
    setPricing(map);
    toast.info('Reset to Indian standard rates — click Save to apply');
  };

  const savePricing = async () => {
    if (!selectedInstitutionId) return;
    setSaving(true);
    const rows = [];
    COMPONENTS.forEach(comp => {
      ['private', 'government'].forEach(tier => {
        const r = getRow(comp, tier);
        rows.push({
          component_type: comp,
          hospital_tier: tier,
          unit_price: parseFloat(r.unit_price) || 0,
          nat_charge: parseFloat(r.nat_charge) || 0,
          nat_includes_gst: !!r.nat_includes_gst,
        });
      });
    });
    const res = await authFetch(`/pricing/${selectedInstitutionId}`, {
      method: 'PUT',
      body: JSON.stringify(rows),
    });
    setSaving(false);
    if (res.ok) {
      toast.success('Pricing saved successfully');
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Failed to save pricing');
    }
  };

  const tabStyle = (tab) => ({
    padding: '8px 20px',
    borderRadius: 6,
    border: activeTab === tab ? '2px solid #c0392b' : '1px solid var(--border)',
    background: activeTab === tab ? '#fdf2f0' : 'var(--card-bg)',
    color: activeTab === tab ? '#c0392b' : 'var(--text)',
    fontWeight: activeTab === tab ? 600 : 400,
    cursor: 'pointer',
    fontSize: 13,
  });

  const inputStyle = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--border)',
    borderRadius: 4,
    background: 'var(--input-bg, #fafafa)',
    color: 'var(--text)',
    fontSize: 13,
    fontFamily: 'monospace',
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>💰 Pricing Management</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadDefaults}>
              ↺ Reset to Standard Rates
            </button>
            <button className="btn btn-primary" onClick={savePricing} disabled={saving || !selectedInstitutionId}>
              {saving ? 'Saving...' : 'Save Pricing'}
            </button>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Set per-unit prices for each blood component. Prices are applied automatically when transfers are created.
          NAT (Nucleic Acid Testing) is a separate per-unit charge. The total payable is shown to the receiving institution before dispatch.
        </p>

        {/* Institution selector for System Admin; read-only label for others */}
        {role === 'System Admin' ? (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, marginRight: 8, color: 'var(--text)' }}>Institution:</label>
            <select
              value={selectedInstitutionId}
              onChange={e => setSelectedInstitutionId(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg, #fafafa)', color: 'var(--text)', fontSize: 13 }}
            >
              {institutions.map(inst => (
                <option key={inst.institution_id} value={inst.institution_id}>
                  {inst.name} ({inst.city})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--hover-bg, #f5f5f5)', borderRadius: 6, border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Editing pricing for:</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{user?.institution_name || 'Your Institution'}</span>
          </div>
        )}

        {/* Tier tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <button style={tabStyle('private')} onClick={() => setActiveTab('private')}>
            🏥 Rates for Private Hospitals
          </button>
          <button style={tabStyle('government')} onClick={() => setActiveTab('government')}>
            🏛 Rates for Government Hospitals
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          These are the rates <strong>your institution charges</strong> when supplying to the selected hospital type.
        </p>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading pricing data…</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Component</th>
                  <th style={{ width: '20%' }}>Unit Price (₹)</th>
                  <th style={{ width: '20%' }}>NAT Charge (₹)</th>
                  <th style={{ width: '18%' }}>NAT Incl. 5% GST</th>
                  <th style={{ width: '20%' }}>Total Per Unit</th>
                </tr>
              </thead>
              <tbody>
                {COMPONENTS.map((comp, idx) => {
                  const row = getRow(comp, activeTab);
                  const unitP = parseFloat(row.unit_price) || 0;
                  const natC  = parseFloat(row.nat_charge) || 0;
                  const total = unitP + natC;
                  return (
                    <tr key={comp} style={{ background: idx % 2 === 0 ? 'var(--hover-bg, #fafafa)' : undefined }}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{COMPONENT_LABELS[comp]}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{comp}</div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.unit_price}
                            onChange={e => setRow(comp, activeTab, 'unit_price', e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.nat_charge}
                            onChange={e => setRow(comp, activeTab, 'nat_charge', e.target.value)}
                            style={inputStyle}
                          />
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!row.nat_includes_gst}
                          onChange={e => setRow(comp, activeTab, 'nat_includes_gst', e.target.checked)}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                      </td>
                      <td>
                        <span style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: total > 0 ? '#27ae60' : 'var(--text-muted)'
                        }}>
                          {formatInr(total)}
                        </span>
                        {row.nat_includes_gst && natC > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                            (NAT incl. GST)
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Reference note */}
        <div style={{ marginTop: 16, padding: '10px 14px', background: '#fdf6e3', borderRadius: 6, border: '1px solid #f0d060', fontSize: 12, color: '#856404' }}>
          <strong>Indian Standard Rates Reference:</strong> Packed RBC — Private ₹1,550 + NAT ₹960 | Govt ₹1,100 + NAT ₹960 &nbsp;|&nbsp;
          Plasma (FFP) — Private ₹400 + NAT ₹75 | Govt ₹300 + NAT ₹75 &nbsp;|&nbsp;
          Platelets — Private ₹400 + NAT ₹100 | Govt ₹300 + NAT ₹100
        </div>
      </div>
    </div>
  );
}

export default Pricing;
