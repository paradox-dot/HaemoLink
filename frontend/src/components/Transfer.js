import React, { useState, useEffect } from 'react';
import { authFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import ExportButton from './ExportButton';

function Transfer({ role }) {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    match_id: '',
    transport_mode: 'road',
    expected_dispatch: '',
    expected_delivery: ''
  });

  const [search, setSearch] = useState('');

  const toast = useToast();
  const canCreate = role === 'Blood Bank Ops Manager' || role === 'Transfusion Officer' || role === 'System Admin';
  const canAdvance = role === 'Blood Bank Ops Manager' || role === 'Transfusion Officer' || role === 'System Admin';
  const canCancel = role === 'Institutional Admin' || role === 'System Admin';
  const canPay = role === 'Transfusion Officer' || role === 'System Admin';
  const cancellableStages = ['initiated', 'pending_approval', 'approved'];

  const fetchTransfers = async () => {
    const res = await authFetch('/transfer');
    const json = await res.json();
    setTransfers(json);
  };

  useEffect(() => {
    fetchTransfers();
  }, []);

  const createTransfer = async () => {
    if (!form.match_id || !form.expected_dispatch || !form.expected_delivery) return;
    const res = await authFetch('/transfer', {
      method: 'POST',
      body: JSON.stringify({
        match_id: form.match_id,
        created_by: user.user_id,
        transport_mode: form.transport_mode,
        expected_dispatch: form.expected_dispatch,
        expected_delivery: form.expected_delivery
      })
    });
    if (res.ok) {
      toast.success('Transfer created successfully');
      setForm({ match_id: '', transport_mode: 'road', expected_dispatch: '', expected_delivery: '' });
      setShowForm(false);
      fetchTransfers();
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to create transfer');
    }
  };

  const updateStatus = async (transfer_id, newStatus) => {
    const res = await authFetch(`/transfer/${transfer_id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus, changed_by: user.user_id })
    });
    if (res.ok) {
      toast.success(`Transfer marked as ${newStatus.replace(/_/g, ' ')}`);
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to update transfer status');
    }
    fetchTransfers();
  };

  const confirmPayment = async (transfer_id) => {
    const res = await authFetch(`/transfer/${transfer_id}/pay`, { method: 'POST' });
    if (res.ok) {
      toast.success('Payment confirmed — you can now advance to Dispatched');
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || 'Payment confirmation failed');
    }
    fetchTransfers();
  };

  const cancelTransfer = async (transfer_id) => {
    if (!window.confirm('Are you sure you want to cancel this transfer? The reserved inventory will be released and the match will revert to proposed.')) return;
    const res = await authFetch(`/transfer/${transfer_id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled', changed_by: user.user_id })
    });
    if (res.ok) {
      toast.success('Transfer cancelled — inventory released, match reverted to proposed');
    } else {
      const data = await res.json();
      toast.error(data.error || 'Failed to cancel transfer');
    }
    fetchTransfers();
  };

  const nextStatus = (current) => {
    const flow = {
      initiated: 'pending_approval',
      pending_approval: 'approved',
      approved: 'dispatched',
      dispatched: 'in_transit',
      in_transit: 'received',
      received: 'completed'
    };
    return flow[current] || null;
  };

  const filteredTransfers = transfers.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (t.status || '').toLowerCase().includes(q) ||
           (t.transport_mode || '').toLowerCase().includes(q) ||
           (t.match_id || '').toLowerCase().includes(q) ||
           (t.transfer_id || '').toLowerCase().includes(q);
  });

  const statusBadge = (status) => {
    return <span className={`badge badge-${status}`}>{status}</span>;
  };

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h2>Transfers</h2>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={fetchTransfers}>
              Refresh
            </button>
            <ExportButton endpoint="/transfer" filename="transfers" />
            {canCreate && (
              <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                {showForm ? 'Cancel' : '+ New Transfer'}
              </button>
            )}
          </div>
        </div>

        {showForm && (
          <div style={{ background: '#faf8f7', padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <div className="form-row">
              <div className="form-group">
                <label>Match ID</label>
                <input
                  type="text"
                  placeholder="Paste accepted match ID"
                  value={form.match_id}
                  onChange={e => setForm({ ...form, match_id: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Transport Mode</label>
                <select value={form.transport_mode} onChange={e => setForm({ ...form, transport_mode: e.target.value })}>
                  <option value="road">Road</option>
                  <option value="rail">Rail</option>
                  <option value="air">Air</option>
                  <option value="courier">Courier</option>
                </select>
              </div>
              <div className="form-group">
                <label>Expected Dispatch</label>
                <input
                  type="datetime-local"
                  value={form.expected_dispatch}
                  onChange={e => setForm({ ...form, expected_dispatch: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Expected Delivery</label>
                <input
                  type="datetime-local"
                  value={form.expected_delivery}
                  onChange={e => setForm({ ...form, expected_delivery: e.target.value })}
                />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={createTransfer}>
              Create Transfer
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2>All Transfers</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="text"
              placeholder="Search status, transport, ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13, width: 250 }}
            />
            <span className="text-muted text-sm">{filteredTransfers.length} transfer{filteredTransfers.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {transfers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">{'\u{1F69A}'}</div>
            <p>No transfers yet.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Planned Qty</th>
                  <th>Transport</th>
                  <th>Total Amount</th>
                  <th>Payment</th>
                  <th>Match ID</th>
                  <th>Transfer ID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransfers.map(t => {
                  const next = nextStatus(t.status);
                  const paymentPending = t.status === 'approved' && t.total_amount != null && t.payment_status !== 'paid';
                  const advanceBlocked = next === 'dispatched' && t.total_amount != null && t.payment_status !== 'paid';

                  const paymentBadge = () => {
                    if (t.total_amount == null) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
                    const cfg = {
                      paid:    { bg: '#eafaf1', color: '#27ae60', label: '✓ Paid' },
                      pending: { bg: '#fef6e7', color: '#f39c12', label: '⏳ Pending' },
                      waived:  { bg: '#f2f3f4', color: '#7f8c8d', label: 'Waived' },
                    }[t.payment_status] || { bg: '#fef6e7', color: '#f39c12', label: t.payment_status };
                    return (
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 600 }}>
                        {cfg.label}
                      </span>
                    );
                  };

                  return (
                    <React.Fragment key={t.transfer_id}>
                      <tr>
                        <td>{statusBadge(t.status)}</td>
                        <td>{t.planned_qty} units</td>
                        <td style={{ textTransform: 'capitalize' }}>{t.transport_mode || '-'}</td>
                        <td style={{ fontWeight: 600, color: t.total_amount ? '#2c2c2c' : undefined }}>
                          {t.total_amount != null
                            ? '₹' + parseFloat(t.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Not set</span>
                          }
                        </td>
                        <td>{paymentBadge()}</td>
                        <td className="font-mono text-muted" style={{ fontSize: 11 }}>{t.match_id}</td>
                        <td className="font-mono text-muted" style={{ fontSize: 11 }}>{t.transfer_id}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {next && canAdvance && (
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => updateStatus(t.transfer_id, next)}
                                disabled={advanceBlocked}
                                title={advanceBlocked ? 'Confirm payment first' : undefined}
                                style={advanceBlocked ? { opacity: 0.45, cursor: 'not-allowed' } : {}}
                              >
                                Mark {next.replace(/_/g, ' ')}
                              </button>
                            )}
                            {!next && !canCancel && (
                              <span className="text-muted text-sm">
                                {['completed', 'cancelled', 'failed'].includes(t.status) ? 'Done' : 'Pending'}
                              </span>
                            )}
                            {canCancel && cancellableStages.includes(t.status) && (
                              <button
                                className="btn btn-sm"
                                style={{ background: '#fdf2f0', color: '#c0392b', border: '1px solid #e8b4b8' }}
                                onClick={() => cancelTransfer(t.transfer_id)}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Payment panel — shown below row when payment required */}
                      {paymentPending && canPay && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0 }}>
                            <div style={{
                              margin: '0 0 8px 0',
                              padding: '14px 18px',
                              background: 'linear-gradient(135deg, #fffbf0 0%, #fff8e6 100%)',
                              border: '1px solid #f0d060',
                              borderTop: 'none',
                              borderRadius: '0 0 8px 8px',
                            }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: '#856404', marginBottom: 10 }}>
                                💳 Payment Required Before Dispatch
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: '4px 24px', fontSize: 13, color: '#555', marginBottom: 10 }}>
                                {t.unit_price != null && (
                                  <>
                                    <span>Unit Price:</span>
                                    <span>₹{parseFloat(t.unit_price).toLocaleString('en-IN')} × {parseFloat(t.planned_qty).toFixed(0)} units</span>
                                    <span style={{ fontWeight: 600 }}>= ₹{parseFloat(t.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                  </>
                                )}
                                {t.nat_charge != null && (
                                  <>
                                    <span>NAT Charges:</span>
                                    <span>₹{parseFloat(t.nat_charge).toLocaleString('en-IN')} × {parseFloat(t.planned_qty).toFixed(0)} units</span>
                                    <span style={{ fontWeight: 600 }}>= ₹{(parseFloat(t.nat_charge) * parseFloat(t.planned_qty)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                  </>
                                )}
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid #f0d060' }}>
                                <div>
                                  <span style={{ fontWeight: 700, fontSize: 15, color: '#2c2c2c' }}>
                                    Total Payable: ₹{parseFloat(t.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </span>
                                  <span style={{ fontSize: 11, color: '#856404', marginLeft: 10 }}>
                                    Payable to supplying blood bank
                                  </span>
                                </div>
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '8px 22px', fontSize: 14, background: '#27ae60', borderColor: '#27ae60' }}
                                  onClick={() => confirmPayment(t.transfer_id)}
                                >
                                  💳 Pay Now
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {/* Payment confirmed banner */}
                      {t.status === 'approved' && t.payment_status === 'paid' && (
                        <tr>
                          <td colSpan={8} style={{ padding: 0 }}>
                            <div style={{
                              margin: '0 0 8px 0',
                              padding: '8px 18px',
                              background: '#eafaf1',
                              border: '1px solid #a9dfbf',
                              borderTop: 'none',
                              borderRadius: '0 0 8px 8px',
                              fontSize: 13,
                              color: '#1e8449',
                              fontWeight: 600,
                            }}>
                              ✓ Payment Confirmed — Transfer can now be dispatched
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Transfer;
