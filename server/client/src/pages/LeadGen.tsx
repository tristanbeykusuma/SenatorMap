import { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import LeadUpload from '../components/LeadUpload';
import OSMBusinessDiscovery from '../components/OSMBusinessDiscovery';
import type { BranchPerformance, OSMBusiness } from '../types';

const PERFORMANCE_COLORS: Record<string, string> = {
  stagnant: '#ef4444',
  growing: '#22c55e',
  important: '#3b82f6'
};

const PERFORMANCE_LABELS: Record<string, string> = {
  stagnant: 'Stagnant',
  growing: 'Growing',
  important: 'Important'
};

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

interface LeadGenProps {
  branches: BranchPerformance[];
  onUpload: (data: BranchPerformance[]) => void;
}

const LeadGen: React.FC<LeadGenProps> = ({ branches, onUpload }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPerf, setFilterPerf] = useState<string[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [localBranches, setLocalBranches] = useState<BranchPerformance[]>(() => [...branches]);
  const [osmBusinesses, setOsmBusinesses] = useState<OSMBusiness[]>([]);

  const filtered = localBranches.filter(b => {
    const matchName = b.branchName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.branchCode.toLowerCase().includes(searchQuery.toLowerCase());
    const matchPerf = filterPerf.length === 0 || filterPerf.includes(b.performance);
    return matchName && matchPerf;
  });

  const togglePerf = (p: string) => {
    setFilterPerf(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const handleGeocode = async () => {
    setGeocoding(true);
    const updated = [...localBranches];
    for (const b of updated) {
      const c = BRANCH_COORDS[String(b.branchCode)];
      if (c) {
        b.lat = c[0];
        b.lng = c[1];
        b.address = 'Known location';
      }
    }
    setLocalBranches([...updated]);
    setGeocoding(false);
  };

  const handleOSMBusinesses = (businesses: OSMBusiness[]) => {
    setOsmBusinesses(businesses);
  };

  const stats = {
    stagnant: localBranches.filter(b => b.performance === 'stagnant').length,
    growing: localBranches.filter(b => b.performance === 'growing').length,
    important: localBranches.filter(b => b.performance === 'important').length
  };

  const mappedBranches = localBranches.filter(b => b.lat != null && b.lat !== 0 && b.lng != null && b.lng !== 0);
  const center: [number, number] = mappedBranches.length > 0
    ? [mappedBranches.reduce((s, b) => s + b.lat, 0) / mappedBranches.length, mappedBranches.reduce((s, b) => s + b.lng, 0) / mappedBranches.length]
    : [-7.56695, 110.81022];

  return (
    <div className="leadgen-page">
      <div className="leadgen-layout">
        <aside className="leadgen-sidebar">
          <LeadUpload onUpload={onUpload} />

          {branches.length > 0 && mappedBranches.length > 0 && (
            <OSMBusinessDiscovery
              centerLat={center[0]}
              centerLng={center[1]}
              onBusinessesFound={handleOSMBusinesses}
            />
          )}

          {branches.length > 0 && (
            <>
              <div className="perf-stats">
                <div className="perf-stat stagnant">
                  <span className="perf-value">{stats.stagnant}</span>
                  <span className="perf-label">Stagnant</span>
                </div>
                <div className="perf-stat growing">
                  <span className="perf-value">{stats.growing}</span>
                  <span className="perf-label">Growing</span>
                </div>
                <div className="perf-stat important">
                  <span className="perf-value">{stats.important}</span>
                  <span className="perf-label">Important</span>
                </div>
              </div>

              {mappedBranches.length < localBranches.length && (
                <button
                  className="btn btn-primary"
                  onClick={handleGeocode}
                  disabled={geocoding}
                  style={{ width: '100%' }}
                >
                  {geocoding ? 'Geocoding...' : `📍 Geocode ${localBranches.length - mappedBranches.length} Branches`}
                </button>
              )}

              <div className="leadgen-filters">
                <input
                  type="text"
                  placeholder="Search branches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="search-input"
                />
                <div className="perf-filter">
                  <button
                    className={filterPerf.includes('stagnant') ? 'active' : ''}
                    onClick={() => togglePerf('stagnant')}
                    style={{ color: PERFORMANCE_COLORS.stagnant }}
                  >
                    Stagnant
                  </button>
                  <button
                    className={filterPerf.includes('growing') ? 'active' : ''}
                    onClick={() => togglePerf('growing')}
                    style={{ color: PERFORMANCE_COLORS.growing }}
                  >
                    Growing
                  </button>
                  <button
                    className={filterPerf.includes('important') ? 'active' : ''}
                    onClick={() => togglePerf('important')}
                    style={{ color: PERFORMANCE_COLORS.important }}
                  >
                    Important
                  </button>
                </div>
              </div>

              <div className="leadgen-list">
                <h4>Branches ({filtered.length})</h4>
                {filtered.map(b => (
                  <div className="branch-item" key={b.id}>
                    <span className="branch-dot" style={{ backgroundColor: PERFORMANCE_COLORS[b.performance] }}></span>
                    <div className="branch-info">
                      <strong>{b.branchName}</strong>
                      <span>{b.branchCode} - {PERFORMANCE_LABELS[b.performance]}</span>
                      <span className="branch-metric">Overall: {b.performanceValue}%</span>
                      {b.totalCredit != null && b.totalCredit > 0 && (
                        <span className="branch-metric">Credit: {b.totalCredit.toLocaleString('id-ID')} ({b.creditPerformance}%)</span>
                      )}
                      {b.totalDpk != null && b.totalDpk > 0 && (
                        <span className="branch-metric">DPK: {b.totalDpk.toLocaleString('id-ID')} ({b.dpkPerformance}%)</span>
                      )}
                      {b.products && b.products.length > 0 && (
                        <span className="branch-metric">Products: {b.products.length}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>

        <main className="leadgen-map-container">
          {localBranches.length === 0 ? (
            <div className="empty-state">
              <div className="upload-icon">🏦</div>
              <h2>Upload Bank Branch Data</h2>
              <p>Upload Excel/CSV with branch codes, names, and performance metrics.</p>
              <p className="hint">Supported: REKAM MEDIS CABANG format or custom CSV with lat, lng, branchCode, branchName, performance</p>
            </div>
          ) : mappedBranches.length === 0 ? (
            <div className="empty-state">
              <div className="upload-icon">📍</div>
              <h2>No Coordinates Yet</h2>
              <p>Click the Geocode button to find branch locations using OpenStreetMap.</p>
            </div>
          ) : (
            <MapContainer center={center} zoom={13} className="leaflet-map" zoomControl={true}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {filtered.filter(b => b.lat != null && b.lat !== 0 && b.lng != null && b.lng !== 0).map(b => (
                <Marker
                  key={b.id}
                  position={[b.lat, b.lng]}
                  icon={
                    new (window as any).L.Icon({
                      iconUrl: `data:image/svg+xml,${encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
                          <circle cx="12" cy="12" r="10" fill="${PERFORMANCE_COLORS[b.performance]}" stroke="white" stroke-width="2"/>
                          <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">${b.performance === 'stagnant' ? '▼' : b.performance === 'growing' ? '▲' : '★'}</text>
                        </svg>
                      `)}`,
                      iconSize: [32, 32],
                      iconAnchor: [16, 32],
                      popupAnchor: [0, -32]
                    })
                  }
                >
                  <Popup>
                    <div className="popup-content">
                      <h4>{b.branchName}</h4>
                      <p><strong>Code:</strong> {b.branchCode}</p>
                      <p><strong>Performance:</strong> {PERFORMANCE_LABELS[b.performance]}</p>
                      <p><strong>Overall Score:</strong> {b.performanceValue}%</p>
                      
                      {/* Summary totals */}
                      {b.totalCredit != null && b.totalCredit > 0 && (
                        <p><strong>Total Credit:</strong> {b.totalCredit.toLocaleString('id-ID')}</p>
                      )}
                      {b.totalDpk != null && b.totalDpk > 0 && (
                        <p><strong>Total DPK/Dana:</strong> {b.totalDpk.toLocaleString('id-ID')}</p>
                      )}
                      {b.creditPerformance != null && b.creditPerformance > 0 && (
                        <p><strong>Credit Perf:</strong> {b.creditPerformance}%</p>
                      )}
                      {b.dpkPerformance != null && b.dpkPerformance > 0 && (
                        <p><strong>DPK Perf:</strong> {b.dpkPerformance}%</p>
                      )}
                      
                      {/* All products list */}
                      {b.products && b.products.length > 0 && (
                        <div className="product-list">
                          <strong>Products ({b.products.length}):</strong>
                          {b.products.map((p, idx) => (
                            <div className="product-item" key={idx}>
                              <span className="product-name">{p.product || '(Umum)'}</span>
                              <span className="product-value">{p.performanceValue}%</span>
                              {p.aum != null && <span className="product-aum">AUM: {p.aum}</span>}
                              {p.growthRate != null && <span className="product-growth">Growth: {p.growthRate}%</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="popup-links">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="popup-link"
                        >
                          🗺️ Google Maps
                        </a>
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${b.lat}&mlon=${b.lng}&zoom=17`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="popup-link"
                        >
                          🗺️ OpenStreetMap
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}

              {osmBusinesses.map(biz => (
                <Marker
                  key={biz.osmId}
                  position={[biz.lat, biz.lng]}
                  icon={
                    new (window as any).L.Icon({
                      iconUrl: `data:image/svg+xml,${encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                          <circle cx="12" cy="12" r="8" fill="#f59e0b" stroke="white" stroke-width="2"/>
                          <text x="12" y="15" text-anchor="middle" fill="white" font-size="8" font-weight="bold">B</text>
                        </svg>
                      `)}`,
                      iconSize: [24, 24],
                      iconAnchor: [12, 24],
                      popupAnchor: [0, -24]
                    })
                  }
                >
                  <Popup>
                    <div className="popup-content">
                      <h4>{biz.name}</h4>
                      <p><strong>Kategori:</strong> {biz.category}</p>
                      <p><strong>OSM ID:</strong> {biz.osmId}</p>
                      <div className="popup-links">
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${biz.lat},${biz.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="popup-link"
                        >
                          🗺️ Google Maps
                        </a>
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${biz.lat}&mlon=${biz.lng}&zoom=17`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="popup-link"
                        >
                          🗺️ OpenStreetMap
                        </a>
                        <a
                          href={`https://www.openstreetmap.org/node/${biz.osmId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="popup-link"
                        >
                          📋 OSM Details
                        </a>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </main>
      </div>
    </div>
  );
};

export default LeadGen;