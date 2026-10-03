import { useState, useEffect } from 'react';
import type { LocationData } from '../types';

interface GoogleRoutePlannerProps {
  selectedStops: LocationData[];
  onRemoveStop: (id: number) => void;
  onReorder: (stops: LocationData[]) => void;
  onSetStart: (lat: number, lng: number) => void;
  start: { lat: number; lng: number } | null;
  addingActive: boolean;
  onToggleAdding: () => void;
}

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const GoogleRoutePlanner = ({
  selectedStops,
  onRemoveStop,
  onReorder,
  onSetStart,
  start,
  addingActive,
  onToggleAdding,
}: GoogleRoutePlannerProps) => {
  const [startLat, setStartLat] = useState('');
  const [startLng, setStartLng] = useState('');

  useEffect(() => {
    if (start) { setStartLat(start.lat.toFixed(6)); setStartLng(start.lng.toFixed(6)); }
  }, [start]);

  const handleApplyStart = () => {
    const lat = parseFloat(startLat);
    const lng = parseFloat(startLng);
    if (!isNaN(lat) && !isNaN(lng)) onSetStart(lat, lng);
  };

  // Routing through a record that has no position would anchor the whole
  // sequence to 0,0, so unpositioned stops are dropped before any distance
  // math rather than being treated as valid coordinates.
  const positionedStops = selectedStops.filter(
    (s): s is LocationData & { lat: number; lng: number } =>
      typeof s.lat === 'number' && Number.isFinite(s.lat) && s.lat !== 0 &&
      typeof s.lng === 'number' && Number.isFinite(s.lng) && s.lng !== 0
  );

  const handleOptimize = () => {
    if (positionedStops.length < 2) return;
    const origin = start || { lat: positionedStops[0].lat, lng: positionedStops[0].lng };
    const route: LocationData[] = [];
    let current = origin;
    const remaining = [...positionedStops];
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = haversine(current, remaining[0]);
      for (let i = 1; i < remaining.length; i++) {
        const d = haversine(current, remaining[i]);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      route.push(next);
      current = next;
    }
    onReorder(route);
  };

  const handleOpenRoute = () => {
    if (positionedStops.length === 0) return;
    const origin = start
      ? `${start.lat},${start.lng}`
      : `${positionedStops[0].lat},${positionedStops[0].lng}`;
    const waypoints = positionedStops.map(l => `${l.lat},${l.lng}`).join('|');
    const url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&waypoints=${encodeURIComponent(waypoints)}&travelmode=driving&dir_action=navigate`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...selectedStops];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onReorder(next);
  };
  const moveDown = (i: number) => {
    if (i === selectedStops.length - 1) return;
    const next = [...selectedStops];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onReorder(next);
  };

  return (
    <div className="route-planner">
      <h4>🗺️ Daily Route Builder</h4>
      <p className="route-hint">
        Add merchants to your route, reorder them, then open Google Maps directions.
      </p>

      <button
        className={`btn btn-block ${addingActive ? 'btn-secondary' : 'btn-primary'}`}
        onClick={onToggleAdding}
      >
        {addingActive ? '✅ Adding Mode ON — click map markers' : '➕ Enable Add Mode (click map markers)'}
      </button>

      <div className="route-coords">
        <label>
          Start Latitude
          <input type="number" step="any" placeholder="-7.566" value={startLat}
            onChange={(e) => setStartLat(e.target.value)} />
        </label>
        <label>
          Start Longitude
          <input type="number" step="any" placeholder="110.810" value={startLng}
            onChange={(e) => setStartLng(e.target.value)} />
        </label>
      </div>
      <button className="btn btn-sm" onClick={handleApplyStart}>Set Start Point</button>

      <div className="route-stops">
        <label>Stops in route: <strong>{selectedStops.length}</strong></label>
      </div>

      {selectedStops.length > 0 ? (
        <div className="route-stop-list">
          {selectedStops.map((s, i) => (
            <div className="route-stop-item" key={s.id}>
              <span className="step-num">{i + 1}</span>
              <div className="step-info">
                <strong>{s.name}</strong>
                <span>{s.branchName} ({s.branchCode})</span>
              </div>
              <div className="route-stop-actions">
                <button onClick={() => moveUp(i)} title="Move up">▲</button>
                <button onClick={() => moveDown(i)} title="Move down">▼</button>
                <button onClick={() => onRemoveStop(s.id)} title="Remove">✕</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="route-hint">No stops added yet. Enable Add Mode and click markers on the map.</p>
      )}

      <div className="route-actions">
        <button className="btn btn-secondary" onClick={handleOptimize} disabled={selectedStops.length < 2}>
          🔀 Auto-Optimize Order
        </button>
        <button className="btn btn-primary" onClick={handleOpenRoute} disabled={selectedStops.length === 0}>
          🚗 Open in Google Maps
        </button>
      </div>
    </div>
  );
};

export default GoogleRoutePlanner;