import { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import FileUpload from './components/FileUpload';
import FilterPanel from './components/FilterPanel';
import StatsPanel from './components/StatsPanel';
import SearchBar from './components/SearchBar';
import ExportButton from './components/ExportButton';
import SessionPanel from './components/SessionPanel';
import GoogleRoutePlanner from './components/GoogleRoutePlanner';
import RadarPage from './pages/RadarPage';
import DenyutPage from './pages/DenyutPage';
import AdminPage from './pages/AdminPage';
import { sessionManager } from './utils/sessionManager';
import type { LocationData, Stats, BranchPerformance } from './types';
import {
  STATUS_OPTIONS,
  STATUS_COLORS,
  getStatusGlyph,
} from './utils/statusConfig';

const DEFAULT_CENTER: [number, number] = [-7.56695, 110.81022];
const DEFAULT_ZOOM = 14;

function App() {
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [showSourceMarkers, setShowSourceMarkers] = useState(false);
  const [searchResults, setSearchResults] = useState<LocationData[]>([]);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [currentPage, setCurrentPage] = useState<'map' | 'radar' | 'denyut' | 'about' | 'admin'>('map');
  const [leadBranches, setLeadBranches] = useState<BranchPerformance[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [routeStops, setRouteStops] = useState<LocationData[]>([]);
  const [routeStart, setRouteStart] = useState<{ lat: number; lng: number } | null>(null);
  const [addingActive, setAddingActive] = useState(false);
  const mapRef = useRef<any>(null);

// A coordinate is only usable if it is a real, non-zero number. Uploads
  // missing a lat/lng column used to arrive as 0, and 0/0 is a valid position in
  // the Gulf of Guinea, so a plain truthiness check hides the bug instead of
  // showing it.
  const usableCoord = (...candidates: Array<number | null | undefined>) => {
    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value) && value !== 0) return value;
    }
    return null;
  };

  // Averaging in records that have no coordinates drags the map toward 0,0.
  const centerOf = (rows: LocationData[]): [number, number] | null => {
    let sumLat = 0;
    let sumLng = 0;
    let count = 0;
    for (const row of rows) {
      const lat = usableCoord(row.lat);
      const lng = usableCoord(row.lng);
      if (lat === null || lng === null) continue;
      sumLat += lat;
      sumLng += lng;
      count++;
    }
    return count > 0 ? [sumLat / count, sumLng / count] : null;
  };

  const handleFileUpload = (data: LocationData[], statsData: Stats) => {
    setLocations(data);
    setStats(statsData);
    const statuses = [...new Set(data.map(d => d.status))];
    setSelectedStatuses(statuses);
    const branches = [...new Set(data.map(d => d.branchName))];
    setSelectedBranches(branches);

    const center = centerOf(data);
    if (center) {
      setMapCenter(center);
    }
  };

  const handleLeadUpload = (data: BranchPerformance[]) => {
    setLeadBranches(data);
    setCurrentPage('radar');
  };

  const handleRestoreSession = (session: {
    locations: LocationData[];
    stats: Stats | null;
    leadBranches: BranchPerformance[];
    selectedStatuses: string[];
    selectedBranches: string[];
    currentPage: string;
    mapCenter: [number, number];
    mapZoom: number;
  }) => {
    setLocations(session.locations);
    setStats(session.stats);
    setSelectedStatuses(session.selectedStatuses);
    setSelectedBranches(session.selectedBranches);
    setLeadBranches(session.leadBranches);
    setCurrentPage(session.currentPage as 'map' | 'radar' | 'denyut' | 'about' | 'admin');
    setMapCenter(session.mapCenter);
    setMapZoom(session.mapZoom);
  };

  useEffect(() => {
    const init = async () => {
      const saved = sessionManager.getCurrentSession();
      if (saved && saved.locations.length > 0) {
        setLocations(saved.locations);
        setStats(saved.stats);
        setSelectedStatuses(saved.selectedStatuses);
        setSelectedBranches(saved.selectedBranches);
        setLeadBranches(saved.leadBranches);
        setCurrentPage(saved.currentPage as 'map' | 'radar' | 'denyut' | 'about' | 'admin');
        setMapCenter(saved.mapCenter);
        setMapZoom(saved.mapZoom);
      } else {
        try {
          const senatorRes = await fetch('/api/default/senator');
          const senatorData = await senatorRes.json() as { data?: LocationData[]; stats?: Stats };
          if (senatorData.data && senatorData.data.length > 0) {
            setLocations(senatorData.data);
            setStats(senatorData.stats || null);
            setSelectedStatuses([...new Set(senatorData.data.map((d: LocationData) => d.status))]);
            setSelectedBranches([...new Set(senatorData.data.map((d: LocationData) => d.branchName))]);
            const center = centerOf(senatorData.data);
              if (center) {
                setMapCenter(center);
              }
          }

          const radarRes = await fetch('/api/default/radar');
          const radarData = await radarRes.json();
          if (radarData.data && radarData.data.length > 0) {
            setLeadBranches(radarData.data);
          }
        } catch (e) {
          console.error('Failed to load default data:', e);
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (locations.length > 0 || leadBranches.length > 0) {
        sessionManager.saveSession(
          'Auto-save',
          locations,
          stats,
          leadBranches,
          selectedStatuses,
          selectedBranches,
          currentPage,
          mapCenter,
          mapZoom
        );
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [locations, stats, leadBranches, selectedStatuses, selectedBranches, currentPage, mapCenter, mapZoom]);

  const handleSearch = (results: LocationData[]) => {
    setSearchResults(results);
    setIsSearchActive(true);
    const center = centerOf(results);
    if (center) {
      setMapCenter(center);
      setMapZoom(results.length === 1 ? 17 : 13);
    }
  };

  const handleResultFocus = (location: LocationData) => {
    const lat = usableCoord(location.lat);
    const lng = usableCoord(location.lng);
    if (lat === null || lng === null) return;
    setMapCenter([lat, lng]);
    setMapZoom(17);
    if (mapRef.current) {
      mapRef.current.flyTo([lat, lng], 17, { duration: 0.8 });
    }
  };

  const handleClearSearch = () => {
    setSearchResults([]);
    setIsSearchActive(false);
  };

  const handleMapMarkerClick = (location: LocationData) => {
    if (addingActive) {
      setRouteStops(prev => {
        if (prev.some(s => s.id === location.id)) return prev;
        return [...prev, location];
      });
    }
  };

  const filteredLocations = isSearchActive && searchResults.length > 0
    ? searchResults
    : locations.filter(loc => {
        const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(loc.status);
        const branchMatch = selectedBranches.length === 0 || selectedBranches.includes(loc.branchName);
        return statusMatch && branchMatch;
      });

  // Any status a workbook carries shows up in the marker popup
  // even when it is not one of the nine standard labels.
  const statusOptions = [...new Set([...STATUS_OPTIONS, ...locations.map((l) => l.status)])];

  const handleStatusToggle = (status: string) => {
    setSelectedStatuses(prev => prev.includes(status)
      ? prev.filter(s => s !== status)
      : [...prev, status]);
  };

  const handleBranchToggle = (branch: string) => {
    setSelectedBranches(prev => prev.includes(branch)
      ? prev.filter(b => b !== branch)
      : [...prev, branch]);
  };

  const handleSelectAllStatuses = () => {
    if (stats) {
      setSelectedStatuses(Object.keys(stats.byStatus));
    }
  };

  const handleClearAllStatuses = () => {
    setSelectedStatuses([]);
  };

  const handleSelectAllBranches = () => {
    if (stats) {
      setSelectedBranches(Object.keys(stats.byBranch));
    }
  };

  const handleClearAllBranches = () => {
    setSelectedBranches([]);
  };

  const handleMapClick = (e: any) => {
    const newCenter: [number, number] = [e.latlng.lat, e.latlng.lng];
    setMapCenter(newCenter);
    setMapZoom(e.target.getZoom());
  };

  useEffect(() => {
    const map = mapRef.current;
    if (map) {
      map.on('click', handleMapClick);
    }
    return () => {
      if (map) {
        map.off('click', handleMapClick);
      }
    };
  }, []);

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const response = await fetch(`/api/merchants/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const result = await response.json();
      if (result.success) {
        setLocations(prev => prev.map(loc =>
          loc.id === id ? { ...loc, status: newStatus } : loc
        ));
        if (stats) {
          const oldStatus = locations.find(l => l.id === id)?.status;
          if (oldStatus) {
            setStats(prev => prev ? {
              ...prev,
              byStatus: {
                ...prev.byStatus,
                [oldStatus]: Math.max(0, (prev.byStatus[oldStatus] || 1) - 1),
                [newStatus]: (prev.byStatus[newStatus] || 0) + 1
              }
            } : null);
          }
        }
      }
    } catch (error) {
      console.error('Status update failed:', error);
      alert('Failed to update status');
    }
  };

  const handleSorotLinkChange = async (id: number, contentLink: string) => {
    try {
      const response = await fetch(`/api/merchants/${id}/sorot`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentLink })
      });
      const result = await response.json();
      if (result.success) {
        setLocations(prev => prev.map(loc =>
          loc.id === id ? { ...loc, sorotLink: contentLink } : loc
        ));
      }
    } catch (error) {
      console.error('SOROT link update failed:', error);
      alert('Failed to save content link');
    }
  };

  // Source coordinates predate the nearest-merchant lookup in some uploads and
  // can be stored as 0 rather than null. `??` only falls back on null/undefined,
  // so `0 ?? lat` stayed 0 and every branch centre collapsed onto null island.
  const uniqueBranchCenters = (() => {
    const branchGroups: Record<string, { lat: number; lng: number; count: number; name: string }> = {};
    filteredLocations.forEach(loc => {
      const code = loc.branchCode || loc.branchName;
      if (!code) return;
      const lat = usableCoord(loc.srcLat, loc.lat);
      const lng = usableCoord(loc.srcLng, loc.lng);
      if (lat === null || lng === null) return;
      if (!branchGroups[code]) {
        branchGroups[code] = { lat: 0, lng: 0, count: 0, name: loc.branchName || code };
      }
      branchGroups[code].lat += lat;
      branchGroups[code].lng += lng;
      branchGroups[code].count++;
    });
    return Object.entries(branchGroups).map(([code, g]) => ({
      branchCode: code,
      branchName: g.name,
      srcLat: g.lat / g.count,
      srcLng: g.lng / g.count,
    }));
  })();

  return (
    <div className="app">
      <nav className="nav-menu">
        <button
          className="nav-item mobile-menu-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle menu"
        >
          ☰ Menu
        </button>
        <button
          className={`nav-item ${currentPage === 'map' ? 'active' : ''}`}
          onClick={() => setCurrentPage('map')}
        >
          🗺️ Senator-EasyMap
        </button>
        <button
          className={`nav-item ${currentPage === 'radar' ? 'active' : ''}`}
          onClick={() => setCurrentPage('radar')}
        >
          📊 Radar Map
        </button>
        <button
          className={`nav-item ${currentPage === 'denyut' ? 'active' : ''}`}
          onClick={() => setCurrentPage('denyut')}
        >
          📡 DENYUT
        </button>
        <button
          className={`nav-item ${currentPage === 'admin' ? 'active' : ''}`}
          onClick={() => setCurrentPage('admin')}
        >
          ⚙️ Admin
        </button>
        <button
          className={`nav-item ${currentPage === 'about' ? 'active' : ''}`}
          onClick={() => setCurrentPage('about')}
        >
          ℹ️ About
        </button>
      </nav>

      {currentPage === 'map' ? (
        <div className="layout">
          <div
            className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
            onClick={() => setSidebarOpen(false)}
          />
          <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
            <button
              className="sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              ✕
            </button>
            <SessionPanel
              onRestore={handleRestoreSession}
              currentData={{
                locations,
                stats,
                leadBranches,
                selectedStatuses,
                selectedBranches,
                currentPage,
                mapCenter,
                mapZoom
              }}
            />
            <FileUpload onUpload={handleFileUpload} />

            {locations.length > 0 && (
              <GoogleRoutePlanner
                selectedStops={routeStops}
                onRemoveStop={(id) => setRouteStops(prev => prev.filter(s => s.id !== id))}
                onReorder={(stops) => setRouteStops(stops)}
                onSetStart={(lat, lng) => setRouteStart({ lat, lng })}
                start={routeStart}
                addingActive={addingActive}
                onToggleAdding={() => setAddingActive(prev => !prev)}
              />
            )}

            {locations.length > 0 && (
              <FilterPanel
                stats={stats}
                selectedStatuses={selectedStatuses}
                selectedBranches={selectedBranches}
                onStatusToggle={handleStatusToggle}
                onBranchToggle={handleBranchToggle}
                onSelectAllStatuses={handleSelectAllStatuses}
                onClearAllStatuses={handleClearAllStatuses}
                onSelectAllBranches={handleSelectAllBranches}
                onClearAllBranches={handleClearAllBranches}
              />
            )}

            {locations.length > 0 && (
              <StatsPanel stats={stats} filteredCount={filteredLocations.length} />
            )}

            {locations.length > 0 && (
              <div className="map-controls">
                <label>
                  <input
                    type="checkbox"
                    checked={showSourceMarkers}
                    onChange={(e) => setShowSourceMarkers(e.target.checked)}
                  />
                  Show Branch Centers
                </label>
              </div>
            )}

            {locations.length > 0 && (
              <ExportButton
                locations={filteredLocations}
                stats={stats}
                selectedStatuses={selectedStatuses}
                selectedBranches={selectedBranches}
              />
            )}
          </aside>

          <main className="map-container">
            {locations.length === 0 ? (
              <div className="empty-state">
                <div className="upload-icon">📊</div>
                <h2>Upload Data to Start</h2>
                <p>Drag & drop an Excel (.xlsx, .xls) or CSV file with location data</p>
                <p className="hint">Expected columns: nearby_lat, nearby_lng, nearby_name, KET, kode_cabang, nama_cabang</p>
              </div>
            ) : (
              <>
<div className="map-toolbar">
                   <SearchBar
                     locations={locations}
                     onSearch={handleSearch}
                     onClear={handleClearSearch}
                     hasResults={isSearchActive}
                     onResultFocus={handleResultFocus}
                   />
                 </div>
                 <MapContainer
                   ref={mapRef}
                   center={mapCenter}
                   zoom={mapZoom}
                   className="leaflet-map"
                   zoomControl={true}
                 >
                   <TileLayer
                     attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                     url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                   />

{filteredLocations.map((location) => {
                      // Skip records without usable coordinates rather than
                      // dropping a pin at 0,0.
                      const lat = usableCoord(location.lat);
                      const lng = usableCoord(location.lng);
                      if (lat === null || lng === null) return null;
                      return (
                      <Marker
                        key={location.id}
                        position={[lat, lng]}
                       eventHandlers={{
                         click: () => handleMapMarkerClick(location)
                       }}
                       icon={
                        new (window as any).L.Icon({
                          iconUrl: `data:image/svg+xml,${encodeURIComponent(`
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28">
                              <circle cx="12" cy="12" r="10" fill="${STATUS_COLORS[location.status] || '#6b7280'}" stroke="white" stroke-width="2"/>
                              <text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-weight="bold">${getStatusGlyph(location.status)}</text>
                            </svg>
                          `)}`,
                          iconSize: [28, 28],
                          iconAnchor: [14, 28],
                          popupAnchor: [0, -28]
                        })
                      }
                    >
                      <Popup>
                        <div className="popup-content">
                          <h4>{location.name}</h4>
                          <p><strong>Branch:</strong> {location.branchName} ({location.branchCode})</p>
                          <p><strong>Status:</strong>
                            <select
                              className="status-select"
                              value={location.status}
                              onChange={(e) => handleStatusChange(location.id, e.target.value)}
                            >
                              {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </p>
                          <p><strong>Address:</strong> {location.address}</p>
                          <p><strong>Coordinates:</strong> {lat.toFixed(6)}, {lng.toFixed(6)}</p>
                          <p><strong>MID/NMID:</strong> {location.midNmid}</p>
                          <div className="popup-links">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="popup-link"
                            >
                              🗺️ Google Maps
                            </a>
                            <a
                              href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=17`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="popup-link"
                            >
                              🗺️ OpenStreetMap
                            </a>
                            <a
                              href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(location.name)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="popup-link"
                            >
                              ⭐ Review
                            </a>
                          </div>
                          <div className="sorot-section">
                            <label>
                              <strong>SOROT Content Link:</strong>
                              <input
                                type="url"
                                placeholder="https://... (promo page, social media, etc.)"
                                value={(location as any).sorotLink || ''}
                                onChange={(e) => handleSorotLinkChange(location.id, e.target.value)}
                                className="sorot-input"
                              />
                            </label>
                            {(location as any).sorotLink && (
                              <a href={(location as any).sorotLink} target="_blank" rel="noopener noreferrer" className="sorot-link">
                                🔗 Open Content
                              </a>
                            )}
                          </div>
                        </div>
                      </Popup>
                    </Marker>
                      );
                    })}

                  {showSourceMarkers && uniqueBranchCenters.map(location => (
                    <Marker
                      key={`src-${location.branchCode}-${location.srcLat}-${location.srcLng}`}
                      position={[location.srcLat, location.srcLng]}
                      icon={
                        new (window as any).L.Icon({
                          iconUrl: `data:image/svg+xml,${encodeURIComponent(`
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
                              <path d="M18 3 L33 13 L33 31 L3 31 L3 13 Z" fill="#3b82f6" stroke="white" stroke-width="2.5"/>
                              <rect x="14" y="20" width="8" height="11" fill="white" stroke="none"/>
                              <rect x="14" y="20" width="3" height="11" fill="#3b82f6" stroke="none"/>
                              <rect x="21" y="20" width="3" height="11" fill="#3b82f6" stroke="none"/>
                              <rect x="14" y="20" width="10" height="3" fill="#3b82f6" stroke="none"/>
                            </svg>
                          `)}`,
                          iconSize: [36, 36],
                          iconAnchor: [18, 36],
                          popupAnchor: [0, -36]
                        })
                      }
                    >
                      <Popup>
                        <div className="popup-content">
<h4>Branch Center: {location.branchName} ({location.branchCode})</h4>
                       <p>Aggregate center of all merchants in branch {location.branchCode}</p>
                          <div className="popup-links">
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${location.srcLat},${location.srcLng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="popup-link"
                            >
                              🗺️ Google Maps
                            </a>
                            <a
                              href={`https://www.openstreetmap.org/?mlat=${location.srcLat}&mlon=${location.srcLng}&zoom=17`}
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
                  </MapContainer>
                </>
              )}
            </main>
          </div>
        ) : currentPage === 'radar' ? (
          <RadarPage branches={leadBranches} onUpload={handleLeadUpload} />
        ) : currentPage === 'denyut' ? (
          <DenyutPage />
        ) : currentPage === 'admin' ? (
          <AdminPage
            onSenatorUpload={(data, statsData) => {
              setLocations(data);
              setStats(statsData);
              setSelectedStatuses([...new Set(data.map(d => d.status))]);
              setSelectedBranches([...new Set(data.map(d => d.branchName))]);
              const center = centerOf(data);
              if (center) {
                setMapCenter(center);
              }
              setCurrentPage('map');
            }}
            onRadarUpload={(data) => {
              setLeadBranches(data);
              setCurrentPage('radar');
            }}
            onDenyutUpload={() => setCurrentPage('denyut')}
          />
        ) : (
          <div className="about-page">
            <div className="about-container">
              <div className="about-header">
                <h2>ℹ️ About Senator Map</h2>
                <p className="about-subtitle">
                  A comprehensive mapping solution for merchant acquisition and branch performance analysis
                </p>
              </div>

              <div className="about-grid">
                <div className="about-card">
                  <div className="about-card-icon">🗺️</div>
                  <h3>Merchant Map</h3>
                  <p>Visualize merchant locations, branch centers, and acquisition status on an interactive map powered by OpenStreetMap tiles.</p>
                  <ul>
                    <li>Upload Excel/CSV with location data</li>
                    <li>Filter by status and branch</li>
                    <li>Update merchant status in real-time</li>
                    <li>Export filtered data to Excel/CSV/JSON</li>
                  </ul>
                </div>

                <div className="about-card">
                  <div className="about-card-icon">🎯</div>
                  <h3>R.A.D.A.R</h3>
                  <p>Regional Analysis &amp; Discovery for Acquisition &amp; Retention - identify growth opportunities and analyze branch performance trends.</p>
                  <ul>
                    <li>Upload REKAM MEDIS CABANG format</li>
                    <li>Classify branches as stagnant/growing/important</li>
                    <li>View performance metrics and growth rates</li>
                    <li>Discover nearby businesses via OpenStreetMap</li>
                  </ul>
                </div>

                <div className="about-card">
                  <div className="about-card-icon">📡</div>
                  <h3>Business Discovery</h3>
                  <p>Query OpenStreetMap's Overpass API to find nearby businesses, UMKM listings, and potential expansion areas around anchor branches.</p>
                  <ul>
                    <li>Configurable search radius (100m-2000m)</li>
                    <li>Filter by amenity, shop, office, tourism</li>
                    <li>View business density analysis</li>
                    <li>Identify market gaps and opportunities</li>
                  </ul>
                </div>

                <div className="about-card">
                  <div className="about-card-icon">📡</div>
                  <h3>DENYUT</h3>
                  <p>Dynamic Needs Signal Detection — real-time signal monitoring dashboard that detects customer needs through transaction patterns and triggers RM assignment workflows.</p>
                  <ul>
                    <li>Transaction-based signal detection (spike, dormant, withdrawal, etc.)</li>
                    <li>Color-coded urgency levels (low / medium / high / critical)</li>
                    <li>RM assignment and status tracking (new → assigned → contacted → converted)</li>
                    <li>Customer conversion rate analytics with target tracking</li>
                  </ul>
                </div>

                <div className="about-card">
                  <div className="about-card-icon">🔗</div>
                  <h3>ECHO</h3>
                  <p>Ecosystem mapping and relationship graph overlay on the Radar Map — visualize businesses, partnerships, and supply chains around anchor branches.</p>
                  <ul>
                    <li>Business ecosystem visualization on the map</li>
                    <li>Relationship graph (supplier, buyer, partner, distributor)</li>
                    <li>Toggle overlay on/off per ecosystem</li>
                    <li>Local data entry for ecosystem modeling</li>
                  </ul>
                </div>

                <div className="about-card">
                  <div className="about-card-icon">📊</div>
                  <h3>Performance Analytics</h3>
                  <p>Analyze branch performance data to identify stagnant, growing, and important branches for strategic planning.</p>
                  <ul>
                    <li>Performance value tracking</li>
                    <li>Growth rate calculations</li>
                    <li>AUM (Assets Under Management) monitoring</li>
                    <li>Product-specific performance analysis</li>
                  </ul>
                </div>
              </div>

              <div className="about-footer">
                <p>Built with React, Leaflet, Express, and OpenStreetMap</p>
                <p className="about-version">Senator Map v1.0.0</p>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default App;
