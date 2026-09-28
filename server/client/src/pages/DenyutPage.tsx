import { useState, useEffect, useCallback, useRef } from 'react';
import './DenyutPage.css';

interface APICustomer {
  cifno: string;
  name: string;
  segment: string;
  branch_code: string;
  branch_name: string;
  hub_id: string;
  status: string;
  account_count: number;
  latest_balance: number;
  lending_outstanding?: number;
}

interface APIPortfolio {
  actype: string;
  template_period: string;
  cbalrp: number;
  avgbalrp: number;
  rate: number;
  status: string;
  ddctyp: string;
}

interface APILendingProduct {
  cifno: string;
  product_type: string;
  limit_amount: number;
  outstanding_balance: number;
  account_count: number;
}

interface APIYearData {
  template_period: string;
  total_balance: number;
  avg_balance: number;
  account_count: number;
  product_types: string;
}

interface APISignal {
  id: number;
  cifno: string;
  customer_name: string;
  signal_type: string;
  suggested_product: string;
  urgency: string;
  status: string;
  assigned_rm: string;
  detected_at: string;
}

const URGENCY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: 'rgba(239,68,68,0.15)', border: '#ef4444', text: '#ef4444' },
  high: { bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', text: '#f59e0b' },
  medium: { bg: 'rgba(234,179,8,0.15)', border: '#eab308', text: '#eab308' },
  low: { bg: 'rgba(107,114,128,0.15)', border: '#6b7280', text: '#6b7280' },
};

const STATUS_COLORS: Record<string, string> = {
  new: '#ef4444',
  assigned: '#3b82f6',
  contacted: '#f59e0b',
  converted: '#22c55e',
  dismissed: '#6b7280',
};

const PRODUCT_COLORS: Record<string, string> = {
  GIRO: '#3b82f6',
  MICRO: '#22c55e',
  DEPO: '#f59e0b',
  TABFP: '#8b5cf6',
  TABMIKRO: '#ec4899',
  TABU: '#06b6d4',
  TABNOW2: '#14b8a3',
};

const LENDING_PRODUCT_COLORS: Record<string, string> = {
  CC: '#f59e0b',
  KPR: '#ef4444',
  KUM: '#3b82f6',
  KUR: '#8b5cf6',
  KSM: '#ec4899',
  COMMERCIAL: '#14b8a3',
  CORPORATE: '#06b6d4',
  SME: '#f97316',
};

const formatBalance = (val: number | null | undefined): string => {
  if (val == null || !isFinite(val) || isNaN(val)) return 'Rp 0';
  if (Math.abs(val) >= 1e9) return `Rp ${(val / 1e9).toFixed(2)} M`;
  if (Math.abs(val) >= 1e6) return `Rp ${(val / 1e6).toFixed(2)} M`;
  if (Math.abs(val) >= 1e3) return `Rp ${(val / 1e3).toFixed(1)} K`;
  return `Rp ${val.toLocaleString('id-ID')}`;
};

const formatPeriod = (period: string): string => {
  const y = period.slice(0, 4);
  const m = period.slice(4);
  return `${y} ${m}`;
};

export default function DenyutPage() {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<APICustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<APICustomer | null>(null);
  const [customerDetail, setCustomerDetail] = useState<{
    customer: APICustomer;
    portfolio: APIPortfolio[];
    yearData: APIYearData[];
    signals: APISignal[];
    lendingPortfolio: APILendingProduct[];
    productBreakdown: Record<string, { cbalrp: number; avgbalrp: number; count: number }>;
  } | null>(null);
  const [stats, setStats] = useState<{ totalCustomers: number; totalAccounts: number; totalBalance: number; signalCounts: Record<string, number>; urgencyCounts: Record<string, number>; periods: string[] } | null>(null);
  const [signalStatusFilter, setSignalStatusFilter] = useState('new');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSearch = useCallback((q: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!q.trim()) { setCustomers([]); return; }
      try {
        const res = await fetch(`/api/denyut/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setCustomers(data.customers || []);
      } catch { /* ignore */ }
    }, 300);
  }, []);

  useEffect(() => {
    debouncedSearch(query);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, debouncedSearch]);

  useEffect(() => {
    fetch('/api/denyut/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const handleCustomerClick = useCallback(async (customer: APICustomer) => {
    setSelectedCustomer(customer);
    try {
      const res = await fetch(`/api/denyut/customer/${customer.cifno}`);
      const data = await res.json();
      setCustomerDetail(data);
    } catch { /* ignore */ }
  }, []);

  const handleCloseDetail = useCallback(() => {
    setCustomerDetail(null);
    setSelectedCustomer(null);
  }, []);

  const handleSignalStatusChange = useCallback(async (signalId: number, newStatus: string) => {
    try {
      await fetch(`/api/denyut/signal/${signalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      setCustomerDetail(prev => prev ? {
        ...prev,
        signals: prev.signals.map(s => s.id === signalId ? { ...s, status: newStatus } : s)
      } : null);
    } catch { /* ignore */ }
  }, []);

  const totalSignals = customerDetail?.signals.length || 0;
  const convertedSignals = customerDetail?.signals.filter(s => s.status === 'converted').length || 0;
  const conversionRate = totalSignals > 0 ? Math.round((convertedSignals / totalSignals) * 100) : 0;

  return (
    <div className="denyut-page">
      <div className="denyut-layout">
        <aside className="denyut-sidebar">
          <div className="denyut-header">
            <h2>📡 DENYUT</h2>
            <p>Customer Search & Signal Detection</p>
          </div>

          {stats && (
            <div className="denyut-stats">
              <div className="denyut-stat">
                <span className="denyut-stat-value">{stats.totalCustomers.toLocaleString()}</span>
                <span className="denyut-stat-label">Customers</span>
              </div>
              <div className="denyut-stat">
                <span className="denyut-stat-value">{stats.totalAccounts.toLocaleString()}</span>
                <span className="denyut-stat-label">Accounts</span>
              </div>
              <div className="denyut-stat">
                <span className="denyut-stat-value">{formatBalance(stats.totalBalance)}</span>
                <span className="denyut-stat-label">Balance</span>
              </div>
            </div>
          )}

          <div className="denyut-search">
            <input
              type="text"
              placeholder="Cari nasabah (nama, CIF, rekening, cabang)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {query && (
            <div className="denyut-results">
              <h4>Hasil ({customers.length})</h4>
              {customers.length === 0 && (
                <div className="no-results">Tidak ada nasabah ditemukan</div>
              )}
              {customers.map(c => (
                <div
                  key={c.cifno}
                  className={`customer-item ${selectedCustomer?.cifno === c.cifno ? 'selected' : ''}`}
                  onClick={() => handleCustomerClick(c)}
                >
                  <div className="customer-name">{c.name}</div>
                  <div className="customer-meta">
                    <span>{c.cifno}</span>
                    <span>{c.branch_name}</span>
                    <span className="customer-badge" style={{ color: PRODUCT_COLORS[c.segment] || '#89b4fa' }}>{c.segment}</span>
                  </div>
                   <div className="customer-summary">
                     <span>{c.account_count} rekening</span>
                     <span className="customer-balance">{formatBalance(c.latest_balance)}</span>
                      {(c.lending_outstanding ?? 0) > 0 && (
                        <span className="customer-lending">Kredit: {formatBalance(c.lending_outstanding)}</span>
                      )}
                   </div>
                </div>
              ))}
            </div>
          )}

          {stats && (
            <div className="denyut-signals-summary">
              <h4>Sinyal Cross-Sell</h4>
              <div className="signal-counts">
                {Object.entries(stats.signalCounts || {}).map(([status, count]) => (
                  <button
                    key={status}
                    className={`signal-filter-btn ${signalStatusFilter === status ? 'active' : ''}`}
                    onClick={() => setSignalStatusFilter(status)}
                    style={{ borderColor: STATUS_COLORS[status] || '#6b7280', color: STATUS_COLORS[status] || '#6b7280' }}
                  >
                    {status}: {count}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main className="radar-map-container">
          {!customerDetail && !selectedCustomer && (
            <div className="denyut-empty">
              <div className="upload-icon">📡</div>
              <h2>DENYUT — Dynamic Needs Dashboard</h2>
              <p>Cari nasabah untuk melihat kondisi ekonomi & kebutuhan finansial</p>
              <p className="denyut-hint">Gunakan kolom pencarian di sidebar kiri</p>
              {stats && (
                <div className="denyut-quick-stats">
                  <div><strong>{stats.totalCustomers.toLocaleString()}</strong> Nasabah</div>
                  <div><strong>{stats.totalAccounts.toLocaleString()}</strong> Rekening</div>
                  <div><strong>{formatBalance(stats.totalBalance)}</strong> Total Saldo</div>
                </div>
              )}
            </div>
          )}

          {customerDetail && (
            <div className="denyut-detail">
              <div className="denyut-detail-toolbar">
                <button className="detail-back" onClick={handleCloseDetail}>← Kembali</button>
                <div className="detail-customer-info">
                  <h3>{customerDetail.customer.name}</h3>
                  <span className="detail-cifno">{customerDetail.customer.cifno}</span>
                  <span className="detail-segment" style={{ color: PRODUCT_COLORS[customerDetail.customer.segment] || '#89b4fa' }}>
                    {customerDetail.customer.segment}
                  </span>
                  <span className="detail-branch">{customerDetail.customer.branch_name}</span>
                </div>
              </div>

              <div className="denyut-detail-content">
                <div className="detail-left">
                   <div className="detail-section">
                     <h4>📊 Portfolio Produk</h4>
                     <div className="product-grid">
                       {(() => {
                         const byType: Record<string, { cbalrp: number; avgbalrp: number; count: number }> = {};
                         Object.entries(customerDetail.productBreakdown).forEach(([type, vals]) => {
                           byType[type] = vals;
                         });
                         const types = Object.keys(byType);
                         if (types.length === 0) {
                           customerDetail.portfolio.forEach(p => {
                             byType[p.actype] = byType[p.actype] || { cbalrp: 0, avgbalrp: 0, count: 0 };
                             byType[p.actype].cbalrp += p.cbalrp;
                             byType[p.actype].count += 1;
                           });
                         }
                         const maxBalance = Math.max(1, ...Object.values(byType).map(v => v.cbalrp));
                         return Object.entries(byType).map(([type, data]) => {
                           return (
                             <div key={type} className="product-bar" style={{ borderLeftColor: PRODUCT_COLORS[type] || '#6b7280' }}>
                               <span className="product-bar-name">{type}</span>
                               <span className="product-bar-value">{formatBalance(data.cbalrp)}</span>
                               <div className="product-bar-track">
                                 <div className="product-bar-fill" style={{
                                   width: `${Math.min(100, (data.cbalrp / maxBalance) * 100)}%`,
                                   backgroundColor: PRODUCT_COLORS[type] || '#6b7280'
                                 }} />
                               </div>
                             </div>
                           );
                         });
                       })()}
                     </div>
                   </div>

                  <div className="detail-section">
                    <h4>💰 Produk Kredit</h4>
                    {customerDetail.lendingPortfolio.length === 0 ? (
                      <div className="no-signals">Tidak memiliki produk kredit</div>
                    ) : (
                      <div className="lending-grid">
                        {customerDetail.lendingPortfolio.map((lp, i) => {
                          const color = LENDING_PRODUCT_COLORS[lp.product_type] || '#6b7280';
                          return (
                            <div key={i} className="lending-card" style={{ borderLeft: `3px solid ${color}` }}>
                              <div className="lending-card-header">
                                <span className="lending-type" style={{ color }}>{lp.product_type}</span>
                                <span className="lending-count">{lp.account_count} rekening</span>
                              </div>
                              <div className="lending-limits">
                                <div className="lending-item">
                                  <span className="lending-label">Limit</span>
                                  <span className="lending-value">{formatBalance(lp.limit_amount)}</span>
                                </div>
                                <div className="lending-item">
                                  <span className="lending-label">Baki Debit</span>
                                  <span className="lending-value">{formatBalance(lp.outstanding_balance)}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="detail-section">
                    <h4>📈 Perubahan Tahunan (YoY/YTD/MoM)</h4>
                    <div className="year-comparison">
                      {customerDetail.yearData.map((yd, i) => (
                        <div key={yd.template_period} className="year-card">
                          <div className="year-period">{formatPeriod(yd.template_period)}</div>
                          <div className="year-balance">{formatBalance(yd.total_balance)}</div>
                          <div className="year-meta">
                            <span>{yd.account_count} rekening</span>
                            <span>{yd.product_types}</span>
                          </div>
                          {i > 0 && (
                            <div className="year-change">
                              {(() => {
                                const prev = customerDetail.yearData[i - 1];
                                const change = prev.total_balance > 0 ? ((yd.total_balance - prev.total_balance) / prev.total_balance) * 100 : 0;
                                const isPositive = change >= 0;
                                return (
                                  <span style={{ color: isPositive ? '#22c55e' : '#ef4444' }}>
                                    {isPositive ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
                                  </span>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="detail-section">
                    <h4>🔔 Sinyal Cross-Sell</h4>
                    {customerDetail.signals.length === 0 && (
                      <div className="no-signals">Tidak ada sinyal aktif</div>
                    )}
                    {customerDetail.signals.map(signal => (
                      <div key={signal.id} className="signal-card" style={{ borderLeftColor: URGENCY_COLORS[signal.urgency]?.border || '#6b7280' }}>
                        <div className="signal-header">
                          <span className="signal-type">{signal.signal_type}</span>
                          <span className="signal-urgency" style={{ background: URGENCY_COLORS[signal.urgency]?.bg, color: URGENCY_COLORS[signal.urgency]?.text }}>
                            {signal.urgency}
                          </span>
                        </div>
                        <div className="signal-detail">
                          <div><strong>Produk:</strong> {signal.suggested_product}</div>
                          <div><strong>Tanggal:</strong> {signal.detected_at}</div>
                          {signal.assigned_rm && <div><strong>RM:</strong> {signal.assigned_rm}</div>}
                        </div>
                        <select
                          className="signal-status-select"
                          value={signal.status}
                          onChange={(e) => handleSignalStatusChange(signal.id, e.target.value)}
                          style={{ borderColor: STATUS_COLORS[signal.status], color: STATUS_COLORS[signal.status] }}
                        >
                          <option value="new">🟠 New</option>
                          <option value="assigned">🔵 Assigned</option>
                          <option value="contacted">🟡 Contacted</option>
                          <option value="converted">🟢 Converted</option>
                          <option value="dismissed">⚫ Dismissed</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="detail-right">
                  <div className="conversion-widget">
                    <div className="conversion-value">{conversionRate}%</div>
                    <div className="conversion-label">Conversion Rate</div>
                    <div className="conversion-target">Target: ~50%</div>
                  </div>

                  <div className="account-table">
                    <h4>Rekening ({customerDetail.portfolio.length})</h4>
                    {customerDetail.portfolio.slice(0, 20).map((acc, i) => (
                      <div key={i} className="account-row">
                        <span className="account-type" style={{ color: PRODUCT_COLORS[acc.actype] || '#89b4fa' }}>{acc.actype}</span>
                        <span className="account-period">{formatPeriod(acc.template_period)}</span>
                        <span className="account-balance">{formatBalance(acc.cbalrp)}</span>
                        <span className="account-status" style={{ color: STATUS_COLORS[acc.status] || '#6b7280' }}>{acc.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
