import { useState, useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, Polyline, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import LeadUpload from '../components/LeadUpload';
import type { BranchPerformance, ProductPerformance, ECHEcosystem, ECHOBusiness } from '../types';
import './RadarPage.css';

const BRANCH_COORDS: Record<string, [number, number]> = {
  '13800': [-7.5671513, 110.8101858],
  '13801': [-7.5651108, 110.8039404],
  '13802': [-7.7129117, 110.5937162],
  '13803': [-7.5715089, 110.8276454],
  '13804': [-7.5753702, 110.8267448],
  '13805': [-7.5661550, 110.8675268],
  '13806': [-7.5382162, 110.6089110],
  '13807': [-7.5975296, 110.8147909],
  '13808': [-7.5518125, 110.7921875],
  '13809': [-7.6163430, 110.7005432],
  '13810': [-7.5945158, 110.9447847],
  '13811': [-7.4305925, 111.0065626],
  '13812': [-7.5554915, 110.7479779],
  '13813': [-7.6851194, 110.8440683],
  '13814': [-7.5637035, 110.8237826],
  '13815': [-7.5742119, 110.8208158],
  '13821': [-7.8129046, 110.9242317],
  '13822': [-7.5634595, 110.8353824],
  '13823': [-7.5502544, 110.8214161],
  '13825': [-7.3980155, 110.8265687],
  '13826': [-7.5640191, 110.8555954],
  '13827': [-7.5814986, 110.8189667],
  '13874': [-7.3658319, 110.6387696],
  '13875': [-7.6963425, 110.7008651],
  '13876': [-7.9795920, 110.9340659],
  '13877': [-7.7552848, 110.4983090],
  '13878': [-7.3846379, 110.9110453],
  '13879': [-7.6153543, 111.0789569],
  '13881': [-7.6372194, 110.6012384],
  '13884': [-7.4392189, 110.6769572],
  '13885': [-7.7598523, 110.6959797],
  '13886': [-7.8268536, 111.1262068],
  '13887': [-7.5239067, 110.9983126],
  '13888': [-7.7357027, 110.7952652],
  '13889': [-7.5822859, 110.7838014],
  '13890': [-7.4067732, 111.1098136],
  '13891': [-7.8468328, 111.2628140],
  '13893': [-8.0562438, 110.8082813],
  '13894': [-7.8146299, 110.9985829],
  '13897': [-7.4699811, 110.9309179],
  '13898': [-7.6654651, 110.7506948],
};

interface RadarPageProps {
  branches: BranchPerformance[];
  onUpload: (data: BranchPerformance[]) => void;
}

const LAG_MAP: Record<string, string> = {
  'non-performing': '#ef4444',
  'partially performing': '#f59e0b',
  'performing': '#22c55e',
};

const PERF_MAP: Record<string, string> = {
  stagnant: '#ef4444',
  growing: '#22c55e',
  important: '#3b82f6',
};

const LAG_LABELS: Record<string, string> = {
  'non-performing': 'Non-Performing',
  'partially performing': 'Partially Performing',
  'performing': 'Performing',
};

const ECHO_BUSINESS_COLORS: Record<string, string> = {
  anchor: '#8b5cf6',
  supplier: '#3b82f8',
  buyer: '#22c55e',
  outlet: '#f59e0b',
  related: '#6b7280',
  individual: '#ec4899',
  pebisnis: '#10b981',
};

const ECHO_RELATIONSHIP_COLORS: Record<string, string> = {
  supplier: '#3b82f8',
  buyer: '#22c55e',
  outlet: '#f59e0b',
  partner: '#f59e0b',
  distributor: '#ef4444',
  social: '#8b5cf6',
  ecommerce: '#ec4899',
};

const ECHO_PRIORITY_COLORS: Record<string, string> = {
  High: '#ef4444',
  Medium: '#f59e0b',
  Low: '#22c55e',
};

const scaleRadius = (potential: number) => {
  const p = Math.min(Math.max(potential || 0, 0), 100);
  return 300 + (p / 100) * 900;
};



const PerfBadge: React.FC<{ label: string; value: string | number | undefined; color?: string }> = ({ label, value, color }) => (
  <div className="perf-badge" style={{ borderLeftColor: color || '#6b7280' }}>
    <span className="perf-badge-label">{label}</span>
    <span className="perf-badge-value" style={{ color: color || '#6b7280' }}>{value ?? '-'}</span>
  </div>
);

const BranchDetailPanel: React.FC<{ branch: BranchPerformance; onClose: () => void; branches: BranchPerformance[]; onSelect: (b: BranchPerformance) => void }> = ({ branch, onClose, branches, onSelect }) => {
  const idx = branches.findIndex(b => b.id === branch.id);
  const prev = idx > 0 ? branches[idx - 1] : null;
  const next = idx < branches.length - 1 ? branches[idx + 1] : null;

  const growthDisplay = branch.growthRate != null ? `${branch.growthRate}%` : '-';
  const growthColor = branch.growthRate != null ? (branch.growthRate >= 0 ? '#22c55e' : '#ef4444') : '#6b7280';

  return (
    <div className="branch-detail-panel">
      <div className="branch-detail-header">
        <h3>{branch.branchName}</h3>
        <span className="branch-code">{branch.branchCode}</span>
        <button className="detail-close" onClick={onClose}>✕</button>
      </div>

      <div className="branch-detail-body">
        <div className="detail-section">
          <h4>Performance Classification</h4>
          <div className="detail-class-grid">
            <PerfBadge label="Lagging Performance" value={branch.laggingScore != null ? `${branch.laggingScore}%` : '-'} color={branch.laggingClass ? LAG_MAP[branch.laggingClass] : undefined} />
            <span className="detail-class-label">{branch.laggingClass ? LAG_LABELS[branch.laggingClass] : '-'}</span>

            <PerfBadge label="Leading Performance" value={branch.leadingScore != null ? `${branch.leadingScore}%` : '-'} color={branch.leadingClass ? PERF_MAP[branch.leadingClass === 'performing' ? 'important' : branch.leadingClass === 'partially performing' ? 'growing' : 'stagnant'] : undefined} />
            <span className="detail-class-label">{branch.leadingClass || '-'}</span>

            <PerfBadge label="Growth Rate" value={growthDisplay} color={growthColor} />
            <span className="detail-class-label">{branch.growthRate != null ? (branch.growthRate >= 0 ? '↑ Growing' : '↓ Declining') : '-'}</span>
          </div>
        </div>

        <div className="detail-section">
          <h4>Financial Overview</h4>
          <div className="detail-financial">
            {branch.totalDpk != null && (
              <div className="detail-fin-item">
                <span>DPK Total</span>
                <strong>{branch.totalDpk.toLocaleString('id-ID')}</strong>
              </div>
            )}
            {branch.totalCredit != null && (
              <div className="detail-fin-item">
                <span>Credit Total</span>
                <strong>{branch.totalCredit.toLocaleString('id-ID')}</strong>
              </div>
            )}
            {branch.dpkPerformance != null && branch.dpkPerformance > 0 && (
              <div className="detail-fin-item">
                <span>DPK Perf.</span>
                <strong>{branch.dpkPerformance}%</strong>
              </div>
            )}
            {branch.creditPerformance != null && branch.creditPerformance > 0 && (
              <div className="detail-fin-item">
                <span>Credit Perf.</span>
                <strong>{branch.creditPerformance}%</strong>
              </div>
            )}
            {branch.performanceValue != null && branch.performanceValue > 0 && (
              <div className="detail-fin-item">
                <span>Overall</span>
                <strong>{branch.performanceValue}%</strong>
              </div>
            )}
          </div>
        </div>

        {branch.products && branch.products.length > 0 && (
          <div className="detail-section">
            <h4>All Products ({branch.products.length})</h4>
            <div className="detail-products">
              {branch.products.map((p, i) => (
                <ProductRow key={i} product={p} />
              ))}
            </div>
          </div>
        )}

        {branch.dpkProducts && branch.dpkProducts.length > 0 && (
          <div className="detail-section">
            <h4>Lagging - DPK Products ({branch.dpkProducts.length})</h4>
            <div className="detail-products">
              {branch.dpkProducts.map((p, i) => (
                <ProductRow key={i} product={p} />
              ))}
            </div>
          </div>
        )}

        {branch.kreditProducts && branch.kreditProducts.length > 0 && (
          <div className="detail-section">
            <h4>Lagging - Kredit Products ({branch.kreditProducts.length})</h4>
            <div className="detail-products">
              {branch.kreditProducts.map((p, i) => (
                <ProductRow key={i} product={p} />
              ))}
            </div>
          </div>
        )}

        <div className="detail-nav">
          {prev && (
            <button className="detail-nav-btn" onClick={() => onSelect(prev)}>
              ← {prev.branchName}
            </button>
          )}
          {next && (
            <button className="detail-nav-btn" onClick={() => onSelect(next)}>
              {next.branchName} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ProductRow: React.FC<{ product: ProductPerformance }> = ({ product }) => (
  <div className="product-row">
    <span className="product-name">{product.product || '(Umum)'}</span>
    <span className="product-value">{product.performanceValue}%</span>
    {product.aum != null && product.aum > 0 && (
      <span className="product-aum">{product.aum.toLocaleString('id-ID')}</span>
    )}
    {product.growthRate != null && (
      <span className="product-growth" style={{ color: product.growthRate >= 0 ? '#22c55e' : '#ef4444' }}>
        {product.growthRate}%
      </span>
    )}
  </div>
);

const MapFocusHandler: React.FC<{ selectedBranch: BranchPerformance | null; mapCenter: [number, number]; branchesCount: number }> = ({ selectedBranch, mapCenter, branchesCount }) => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      if (selectedBranch && selectedBranch.lat != null && selectedBranch.lat !== 0 &&
          selectedBranch.lng != null && selectedBranch.lng !== 0) {
        map.flyTo([selectedBranch.lat, selectedBranch.lng], 15, { duration: 0.8 });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [selectedBranch, map]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (branchesCount > 0 && !selectedBranch) {
        map.flyTo([mapCenter[0], mapCenter[1]], 13, { duration: 0.8 });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [mapCenter, branchesCount, selectedBranch, map]);
  return null;
};

const loadEchoEcosystems = async (): Promise<ECHEcosystem[]> => {
  const response = await fetch('/api/echo/ecosystems');
  if (!response.ok) return [];
  const result = await response.json();
  return result.ecosystems || [];
};

const formatCurrency = (value: number) => new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
}).format(value || 0);

const ProgressBar: React.FC<{ label: string; value: number; max?: number; color?: string }> = ({ label, value, max = 100, color }) => (
  <div className="echo-popup-bar-row">
    <span>{label}</span>
    <div className="echo-bar-track">
      <div className="echo-bar-fill" style={{ width: `${Math.min((value / max) * 100, 100)}%`, backgroundColor: color || '#89b4fa' }} />
    </div>
    <strong>{Math.round(value)}</strong>
  </div>
);

const EchoBusinessPopup: React.FC<{ business: ECHOBusiness; onToggleMandiri: (id: string, v: boolean) => void }> = ({ business, onToggleMandiri }) => {
  const color = ECHO_BUSINESS_COLORS[business.businessType] || ECHO_BUSINESS_COLORS.related || '#6b7280';
  const tierColor = ECHO_PRIORITY_COLORS[business.priorityTier] || '#6b7280';
  return (
    <div className="echo-biz-popup">
      <div className="echo-popup-title" style={{ color }}>{business.name}</div>
      <div className="echo-popup-row"><span>Type / Segment</span><strong>{business.businessType} · {business.segment}</strong></div>
      {business.branchCode && <div className="echo-popup-row"><span>Branch</span><strong>{business.branchCode}</strong></div>}
      {business.productsHeld.length > 0 && <div className="echo-popup-row"><span>Products</span><strong>{business.productsHeld.join(', ')}</strong></div>}
      <ProgressBar label="E-commerce Potential" value={business.ecommercePotential} color={color} />
      <ProgressBar label="Social Network" value={business.socialNetworkStrength} color="#8b5cf6" />
      <div className="echo-popup-row"><span>Priority</span><span className="echo-tier-badge" style={{ backgroundColor: tierColor }}>{business.priorityScore} ({business.priorityTier})</span></div>
      <div className="echo-popup-row"><span>In / Out Value</span><strong>{formatCurrency(business.transactionInValue || 0)} ← {formatCurrency(business.transactionOutValue || 0)}</strong></div>
      <div className="echo-popup-row echo-popup-check"><span>Mandiri Customer</span><input type="checkbox" checked={business.mandiriCustomer} onChange={e => onToggleMandiri(business.id, e.target.checked)} /></div>
    </div>
  );
};

const ECHOMapMarkers: React.FC<{
  ecosystem: ECHEcosystem;
  highlightedBusinessId?: string;
  onToggleMandiri: (id: string, v: boolean) => void;
  onBusinessClick: (id: string) => void;
}> = ({ ecosystem, highlightedBusinessId, onToggleMandiri, onBusinessClick }) => {
  const map = useMap();
  useEffect(() => {
    if (ecosystem.businesses.length > 0) {
      const avgLat = ecosystem.businesses.reduce((s, b) => s + b.lat, 0) / ecosystem.businesses.length;
      const avgLng = ecosystem.businesses.reduce((s, b) => s + b.lng, 0) / ecosystem.businesses.length;
      map.flyTo([avgLat, avgLng], 11, { duration: 0.8 });
    }
  }, [ecosystem.id, ecosystem.businesses, ecosystem.businesses.length, map]);

  return (
    <>
      {ecosystem.businesses.map(b => {
        const color = ECHO_BUSINESS_COLORS[b.businessType] || ECHO_BUSINESS_COLORS.related || '#6b7280';
        const isHighlight = highlightedBusinessId === b.id;
        const radius = scaleRadius(b.ecommercePotential);
        return (
          <Circle
            key={b.id}
            center={[b.lat, b.lng]}
            radius={radius}
            pathOptions={{
              color: isHighlight ? '#ffffff' : color,
              fillColor: isHighlight ? '#ffffff' : color,
              fillOpacity: isHighlight ? 0.5 : 0.18,
              weight: isHighlight ? 4 : 2,
            }}
            eventHandlers={{
              click: () => onBusinessClick(b.id),
            }}
          >
            <title>{b.name} ({b.businessType})</title>
            <Popup>
              <EchoBusinessPopup business={b} onToggleMandiri={onToggleMandiri} />
            </Popup>
          </Circle>
        );
      })}
      {ecosystem.relationships.map((rel, i) => {
        const from = ecosystem.businesses.find(b => b.id === rel.fromBusinessId);
        const to = ecosystem.businesses.find(b => b.id === rel.toBusinessId);
        if (!from || !to) return null;
        return (
          <Polyline
            key={i}
            positions={[[from.lat, from.lng], [to.lat, to.lng]]}
            pathOptions={{
              color: rel.closedLoop ? '#22c55e' : (ECHO_RELATIONSHIP_COLORS[rel.type] || '#888888'),
              weight: rel.transactionVolume > 0 ? 3 : 2,
              opacity: rel.closedLoop ? 0.9 : 0.6,
              dashArray: rel.closedLoop ? undefined : '8, 8',
            }}
          >
            <title>{rel.type}: {rel.category}</title>
            <Popup>
              <div className="echo-rel-popup">
                <div className="echo-popup-row"><span>Type</span><strong>{rel.type}</strong></div>
                {rel.category && <div className="echo-popup-row"><span>Category</span><strong>{rel.category}</strong></div>}
                <div className="echo-popup-row"><span>Transaction Value</span><strong>{formatCurrency(rel.transactionValue)}</strong></div>
                <div className="echo-popup-row"><span>Volume</span><strong>{rel.transactionVolume}</strong></div>
                <div className="echo-popup-row"><span>Closed Loop</span><span className={rel.closedLoop ? 'echo-yes' : 'echo-no'}>{rel.closedLoop ? 'Yes' : 'No'}</span></div>
              </div>
            </Popup>
          </Polyline>
        );
      })}
    </>
  );
};

const RadarPage: React.FC<RadarPageProps> = ({ branches, onUpload }) => {
  const [selectedBranch, setSelectedBranch] = useState<BranchPerformance | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLag, setFilterLag] = useState<string[]>([]);
  const [filterLead, setFilterLead] = useState<string[]>([]);
  const [filterGrowth, setFilterGrowth] = useState<string[]>([]);
  const [echoEnabled, setEchoEnabled] = useState(false);
  const [echoEcosystems, setEchoEcosystems] = useState<ECHEcosystem[]>([]);
  const [activeEcosystemId, setActiveEcosystemId] = useState<string | null>(null);
  const [echoHighlightId, setEchoHighlightId] = useState<string | null>(null);
  const [echoLoading, setEchoLoading] = useState(false);
  const [echoError, setEchoError] = useState<string | null>(null);
  const [echoUploadSuccess, setEchoUploadSuccess] = useState(false);
  const [echoBizTypeFilter, setEchoBizTypeFilter] = useState<string>('all');
  const [echoPriorityFilter, setEchoPriorityFilter] = useState<'all' | 'High' | 'Medium' | 'Low'>('all');
  const echoFileRef = useRef<HTMLInputElement>(null);

  const filtered = branches.filter(b => {
    const matchName = b.branchName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.branchCode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchLag = filterLag.length === 0 || (b.laggingClass && filterLag.includes(b.laggingClass));
    const matchLead = filterLead.length === 0 || (b.leadingClass && filterLead.includes(b.leadingClass));
    const matchGrow = filterGrowth.length === 0 || (b.growthRate != null && (
      (filterGrowth.includes('positive') && b.growthRate >= 0) ||
      (filterGrowth.includes('negative') && b.growthRate < 0)
    ));
    return matchName && matchLag && matchLead && matchGrow;
  });

  const handleBranchClick = useCallback((branch: BranchPerformance) => {
    setSelectedBranch(branch);
    setShowDetail(true);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false);
  }, []);

  const handleSelectBranch = useCallback((branch: BranchPerformance) => {
    setSelectedBranch(branch);
    setShowDetail(true);
  }, []);

  const toggleFilter = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) => {
    setter(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const mappedBranches = filtered.map(b => {
    const coords = BRANCH_COORDS[b.branchCode];
    return { ...b, lat: coords ? coords[0] : b.lat, lng: coords ? coords[1] : b.lng };
  }).filter(b => b.lat != null && b.lat !== 0 && b.lng != null && b.lng !== 0);
  const center: [number, number] = mappedBranches.length > 0
    ? [mappedBranches.reduce((s, b) => s + b.lat, 0) / mappedBranches.length, mappedBranches.reduce((s, b) => s + b.lng, 0) / mappedBranches.length]
    : [-7.56695, 110.81022];

  const stats = {
    total: branches.length,
    performing: branches.filter(b => b.laggingClass === 'performing' && b.leadingClass === 'performing').length,
    partial: branches.filter(b => b.laggingClass === 'partially performing' || b.leadingClass === 'partially performing').length,
    nonPerforming: branches.filter(b => b.laggingClass === 'non-performing' || b.leadingClass === 'non-performing').length,
  };

  const activeEcosystem = echoEcosystems.find(e => e.id === activeEcosystemId) || null;
  const echoBizTypes = activeEcosystem ? [...new Set(activeEcosystem.businesses.map(b => b.businessType))] : [];
  const filteredEcoBusinesses = activeEcosystem
    ? activeEcosystem.businesses
        .filter(b => (echoBizTypeFilter === 'all' || b.businessType === echoBizTypeFilter) && (echoPriorityFilter === 'all' || b.priorityTier === echoPriorityFilter))
        .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0) || (b.ecommercePotential || 0) - (a.ecommercePotential || 0))
    : [];
  const echoMetrics = activeEcosystem?.metrics;
  const echoByType = echoMetrics?.byBusinessType;

  useEffect(() => {
    const load = async () => {
      try {
        const ecosystems = await loadEchoEcosystems();
        setEchoEcosystems(ecosystems);
        if (ecosystems.length > 0) {
          setActiveEcosystemId(prev => prev ?? ecosystems[0].id);
        }
      } catch {
        setEchoError('Failed to load ECHO data');
      }
    };
    load();
  }, []);

  const handleEchoUpload = async (file: File) => {
    setEchoLoading(true);
    setEchoError(null);
    setEchoUploadSuccess(false);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/echo/upload?clear=true', { method: 'POST', body: formData });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Upload failed');
      }

      const result = await response.json();
      const ecosystems = result.ecosystems || [];
      setEchoEcosystems(ecosystems);
      if (ecosystems.length > 0) {
        setActiveEcosystemId(ecosystems[0].id);
        setEchoEnabled(true);
      }
      setEchoUploadSuccess(true);
    } catch (err) {
      setEchoError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setEchoLoading(false);
      if (echoFileRef.current) echoFileRef.current.value = '';
    }
  };

  const handleEchoToggle = () => {
    const next = !echoEnabled;
    setEchoEnabled(next);
    if (next && echoEcosystems.length > 0 && !activeEcosystemId) {
      setActiveEcosystemId(echoEcosystems[0].id);
    }
    if (!next) {
      setActiveEcosystemId(null);
      setEchoHighlightId(null);
    }
  };

  const handleSelectEcosystem = (id: string) => {
    setActiveEcosystemId(id);
    setEchoHighlightId(null);
  };

  const handleToggleMandiri = useCallback(async (businessId: string, value: boolean) => {
    setEchoEcosystems(prev => prev.map(eco => ({
      ...eco,
      businesses: eco.businesses.map(b => b.id === businessId ? { ...b, mandiriCustomer: value } : b),
    })));
    try {
      const response = await fetch(`/api/echo/businesses/${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mandiri_customer: value ? 1 : 0 }),
      });
      if (response.ok) {
        const { ecosystem } = await response.json();
        setEchoEcosystems(prev => prev.map(eco => (eco.id === ecosystem.id ? ecosystem : eco)));
      }
    } catch {
      setEchoError('Failed to update Mandiri customer flag');
    }
  }, []);

  const handleDeleteEcosystem = useCallback(async (id: string) => {
    if (!window.confirm('Delete this ecosystem? This cannot be undone.')) return;
    try {
      const response = await fetch(`/api/echo/ecosystems/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setEchoEcosystems(prev => prev.filter(e => e.id !== id));
        if (activeEcosystemId === id) {
          setActiveEcosystemId(null);
          setEchoHighlightId(null);
        }
      } else {
        setEchoError('Failed to delete ecosystem');
      }
    } catch {
      setEchoError('Failed to delete ecosystem');
    }
  }, [activeEcosystemId]);

  const handleBusinessClick = useCallback((businessId: string) => {
    setEchoHighlightId(businessId);
  }, []);


  return (
    <div className="radar-page">
      <div className="radar-layout">
        <aside className="radar-sidebar">
          <LeadUpload onUpload={onUpload} />

          {branches.length > 0 && (
            <div className="radar-stats">
              <div className="radar-stat performing">
                <span className="radar-stat-value">{stats.performing}</span>
                <span className="radar-stat-label">Performing</span>
              </div>
              <div className="radar-stat partial">
                <span className="radar-stat-value">{stats.partial}</span>
                <span className="radar-stat-label">Partial</span>
              </div>
              <div className="radar-stat non-performing">
                <span className="radar-stat-value">{stats.nonPerforming}</span>
                <span className="radar-stat-label">Non-Performing</span>
              </div>
            </div>
          )}

          {branches.length > 0 && (
            <div className="radar-filters">
              <input
                type="text"
                placeholder="Search branches..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
              <div className="filter-group">
                <label>Lagging:</label>
                <div className="filter-buttons">
                  {['non-performing', 'partially performing', 'performing'].map(lag => (
                    <button
                      key={lag}
                      className={filterLag.includes(lag) ? 'active' : ''}
                      onClick={() => toggleFilter(setFilterLag, lag)}
                      style={{ borderColor: LAG_MAP[lag], color: LAG_MAP[lag] }}
                    >
                      {lag}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <label>Leading:</label>
                <div className="filter-buttons">
                  {['performing', 'partially performing', 'non-performing'].map(lead => (
                    <button
                      key={lead}
                      className={filterLead.includes(lead) ? 'active' : ''}
                      onClick={() => toggleFilter(setFilterLead, lead)}
                      style={{ borderColor: PERF_MAP[lead === 'performing' ? 'important' : lead === 'partially performing' ? 'growing' : 'stagnant'], color: PERF_MAP[lead === 'performing' ? 'important' : lead === 'partially performing' ? 'growing' : 'stagnant'] }}
                    >
                      {lead}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-group">
                <label>Growth:</label>
                <div className="filter-buttons">
                  <button
                    className={filterGrowth.includes('positive') ? 'active' : ''}
                    onClick={() => toggleFilter(setFilterGrowth, 'positive')}
                    style={{ borderColor: '#22c55e', color: '#22c55e' }}
                  >
                    Positive
                  </button>
                  <button
                    className={filterGrowth.includes('negative') ? 'active' : ''}
                    onClick={() => toggleFilter(setFilterGrowth, 'negative')}
                    style={{ borderColor: '#ef4444', color: '#ef4444' }}
                  >
                    Negative
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="echo-upload-card">
            <div className="echo-upload-header">
              <h4>ECHO Import</h4>
              {echoUploadSuccess && <span className="echo-success">Loaded</span>}
            </div>
            <p className="echo-upload-hint">Upload ecosystem Excel with business and relationship sheets.</p>
            <input
              ref={echoFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleEchoUpload(file);
              }}
              disabled={echoLoading}
              className="echo-file-input"
            />
            {echoLoading && <p className="echo-loading">Processing ECHO file...</p>}
            {echoError && <p className="echo-error">{echoError}</p>}
          </div>

          {echoEnabled && echoEcosystems.length > 0 && (
            <div className="echo-section">
              <div className="echo-section-header">
                <h4>ECHO Ecosystem</h4>
              </div>
              <div className="echo-ecosystem-list">
                {echoEcosystems.map(eco => (
                  <div
                    key={eco.id}
                    className={`echo-eco-item ${activeEcosystemId === eco.id ? 'active' : ''}`}
                  >
                    <div className="echo-eco-main" onClick={() => handleSelectEcosystem(eco.id)}>
                      <span className="echo-eco-name">{eco.anchorName}</span>
                      <span className="echo-eco-count">{eco.businesses.length} businesses · {eco.relationships.length} links</span>
                    </div>
                    <button
                      className="echo-eco-delete"
                      title="Delete ecosystem"
                      onClick={(e) => { e.stopPropagation(); handleDeleteEcosystem(eco.id); }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              {activeEcosystem && (
                <>
                  <div className="echo-metrics">
                    <div className="echo-metric-row">
                      <span>Closed Loop</span>
                      <strong>{echoMetrics?.closedLoopPercent ?? 0}%</strong>
                    </div>
                    <div className="echo-metric-row">
                      <span>Leakage</span>
                      <strong>{echoMetrics?.leakagePercent ?? 0}%</strong>
                    </div>
                    <div className="echo-metric-row">
                      <span>Closed-Loop Cycles</span>
                      <strong>{echoMetrics?.closedLoopCycleCount ?? 0}</strong>
                    </div>
                    <div className="echo-metric-row">
                      <span>Rotation Value</span>
                      <strong>{formatCurrency(echoMetrics?.closedLoopCycleValue ?? 0)}</strong>
                    </div>
                    <div className="echo-metric-row">
                      <span>Transaction Value</span>
                      <strong>{formatCurrency(echoMetrics?.totalTransactionValue ?? 0)}</strong>
                    </div>
                    <div className="echo-metric-row">
                      <span>E-commerce Potential</span>
                      <strong>{Math.round(echoMetrics?.ecommercePotentialTotal ?? 0)}</strong>
                    </div>
                    <div className="echo-metric-row">
                      <span>Social Network (avg)</span>
                      <strong>{echoMetrics?.avgSocialNetworkStrength ?? 0}</strong>
                    </div>
                    <div className="echo-metric-row">
                      <span>Mandiri Customers</span>
                      <strong>{echoMetrics?.mandiriCustomerCount ?? 0} / {activeEcosystem.businesses.length}</strong>
                    </div>
                  </div>

                  {echoByType && (
                    <div className="echo-type-breakdown">
                      <h5>By Business Type</h5>
                      {Object.entries(echoByType).map(([type, stat]) => (
                        <div className="echo-type-row" key={type}>
                          <span className="echo-type-label">
                            <i className="echo-type-dot" style={{ backgroundColor: ECHO_BUSINESS_COLORS[type] || '#6b7280' }} />
                            {type}
                          </span>
                          <span className="echo-type-stat">{stat.count}b · out {formatCurrency(stat.transactionOutValue)} · in {formatCurrency(stat.transactionInValue)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {echoMetrics?.topPotential && echoMetrics.topPotential.length > 0 && (
                    <div className="echo-potential">
                      <h5>Top 3P Potential</h5>
                      {echoMetrics.topPotential.map(p => (
                        <div className="echo-potential-item" key={p.id}>
                          <span>{p.name} <i>({p.businessType} / {p.priorityTier})</i></span>
                          <strong>{p.priorityScore}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="echo-filters-bar">
                    <div className="echo-filter-group">
                      <span className="echo-filter-label">Type:</span>
                      <button className={`echo-filter-chip ${echoBizTypeFilter === 'all' ? 'active' : ''}`} onClick={() => setEchoBizTypeFilter('all')}>All</button>
                      {echoBizTypes.map(t => (
                        <button key={t} className={`echo-filter-chip ${echoBizTypeFilter === t ? 'active' : ''}`} onClick={() => setEchoBizTypeFilter(t)}>{t}</button>
                      ))}
                    </div>
                    <div className="echo-filter-group">
                      <span className="echo-filter-label">Priority:</span>
                      {(['all', 'High', 'Medium', 'Low'] as const).map(t => (
                        <button key={t} className={`echo-filter-chip ${echoPriorityFilter === t ? 'active' : ''}`} onClick={() => setEchoPriorityFilter(t)}>{t}</button>
                      ))}
                    </div>
                  </div>

                  <div className="echo-business-list">
                    {filteredEcoBusinesses.map(b => (
                      <div
                        key={b.id}
                        className={`echo-biz-item ${echoHighlightId === b.id ? 'highlighted' : ''}`}
                        onClick={() => handleBusinessClick(b.id)}
                      >
                        <div className="echo-biz-main">
                          <strong>{b.name}</strong>
                          <span className="echo-biz-meta">
                            <i className="echo-type-dot" style={{ backgroundColor: ECHO_BUSINESS_COLORS[b.businessType] || '#6b7280' }} />
                            {b.businessType} · {b.segment}
                          </span>
                          {b.productsHeld.length > 0 && <span className="echo-biz-products">{b.productsHeld.join(', ')}</span>}
                        </div>
                        <div className="echo-biz-stats">
                          <span className="echo-biz-score" style={{ color: ECHO_PRIORITY_COLORS[b.priorityTier] || '#6b7280' }}>{b.priorityScore}</span>
                          <span className="echo-biz-ecomm" title="E-commerce Potential">{Math.round(b.ecommercePotential)}</span>
                          <span className="echo-biz-social" title="Social Network Strength">{Math.round(b.socialNetworkStrength)}</span>
                          {b.mandiriCustomer && <span className="echo-biz-mandiri" title="Mandiri customer">✓</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {branches.length > 0 && (
            <div className="radar-list">
              <h4>Branches ({filtered.length})</h4>
              {filtered.map(b => (
                <div
                  key={b.id}
                  className={`branch-item ${selectedBranch?.id === b.id ? 'selected' : ''}`}
                  onClick={() => handleBranchClick(b)}
                >
                  <span
                    className="branch-dot"
                    style={{
                      backgroundColor: b.performance === 'stagnant' ? '#ef4444' : b.performance === 'growing' ? '#22c55e' : '#3b82f6',
                    }}
                  />
                  <div className="branch-info">
                    <strong>{b.branchName}</strong>
                    <span>{b.branchCode}</span>
                    <span className="branch-metric">
                      Lag: {b.laggingScore != null ? `${b.laggingScore}%` : '-'} | Lead: {b.leadingScore != null ? `${b.leadingScore}%` : '-'}
                    </span>
                    {b.growthRate != null && (
                      <span className="branch-metric" style={{ color: b.growthRate >= 0 ? '#22c55e' : '#ef4444' }}>
                        Growth: {b.growthRate}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>

        <main className="radar-map-container">
          <button
            className={`echo-toggle ${echoEnabled ? 'active' : ''}`}
            onClick={handleEchoToggle}
            title="Toggle ECHO Ecosystem Map"
          >
            🔗 ECHO {echoEnabled ? 'ON' : 'OFF'}
          </button>
          {branches.length === 0 ? (
            <div className="empty-state">
              <div className="upload-icon">🏦</div>
              <h2>Upload Branch Performance Data</h2>
              <p>Upload REKAM MEDIS CABANG Excel file to view performance radar.</p>
            </div>
          ) : (
            <MapContainer center={center} zoom={13} className="leaflet-map" zoomControl={true}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {mappedBranches.map(b => (
                <Marker
                  key={b.id}
                  position={[b.lat, b.lng]}
                  icon={
                    new (window as any).L.Icon({
                      iconUrl: `data:image/svg+xml,${encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28" width="28" height="28">
                          <circle cx="14" cy="14" r="12" fill="${b.performance === 'stagnant' ? '#ef4444' : b.performance === 'growing' ? '#22c55e' : '#3b82f6'}" stroke="white" stroke-width="2"/>
                          <text x="14" y="18" text-anchor="middle" fill="white" font-size="9" font-weight="bold">${b.branchCode}</text>
                        </svg>
                      `)}`,
                      iconSize: [28, 28],
                      iconAnchor: [14, 14],
                      popupAnchor: [0, -16]
                    })
                  }
                  eventHandlers={{
                    click: () => handleBranchClick(b)
                  }}
                />
              ))}

              {echoEnabled && activeEcosystem && activeEcosystem.businesses.length > 0 && (
                <ECHOMapMarkers ecosystem={activeEcosystem} highlightedBusinessId={echoHighlightId || undefined} onToggleMandiri={handleToggleMandiri} onBusinessClick={handleBusinessClick} />
              )}

              <MapFocusHandler selectedBranch={selectedBranch} mapCenter={center} branchesCount={mappedBranches.length} />
            </MapContainer>
          )}

          {showDetail && selectedBranch && (
            <BranchDetailPanel
              branch={selectedBranch}
              onClose={handleCloseDetail}
              branches={branches}
              onSelect={handleSelectBranch}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default RadarPage;
