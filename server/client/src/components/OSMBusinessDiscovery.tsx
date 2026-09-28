import { useState } from 'react';
import type { OSMBusiness, BusinessDensity } from '../types';

interface OSMBusinessDiscoveryProps {
  centerLat: number;
  centerLng: number;
  onBusinessesFound: (businesses: OSMBusiness[]) => void;
}

const MOCK_BUSINESSES: OSMBusiness[] = [
  { osmId: '1', name: 'Alfamart', lat: -7.567, lng: 110.810, type: 'node', category: 'shop', distance: 0, tags: { shop: 'convenience' } },
  { osmId: '2', name: 'Indomaret', lat: -7.568, lng: 110.812, type: 'node', category: 'shop', distance: 0, tags: { shop: 'convenience' } },
  { osmId: '3', name: 'Warung Makan Bu Ani', lat: -7.566, lng: 110.809, type: 'node', category: 'amenity', distance: 0, tags: { amenity: 'restaurant' } },
  { osmId: '4', name: 'Kedai Kelontong', lat: -7.569, lng: 110.811, type: 'node', category: 'shop', distance: 0, tags: { shop: 'general' } },
  { osmId: '5', name: 'Pasar Kecil', lat: -7.565, lng: 110.808, type: 'node', category: 'amenity', distance: 0, tags: { amenity: 'marketplace' } },
  { osmId: '6', name: 'ATM Mandiri', lat: -7.5675, lng: 110.8105, type: 'node', category: 'amenity', distance: 0, tags: { amenity: 'atm' } },
  { osmId: '7', name: 'Warung Kopi', lat: -7.5685, lng: 110.8115, type: 'node', category: 'amenity', distance: 0, tags: { amenity: 'cafe' } },
  { osmId: '8', name: 'Toko Bangunan', lat: -7.5665, lng: 110.8095, type: 'node', category: 'shop', distance: 0, tags: { shop: 'hardware' } },
];

const OSMBusinessDiscovery: React.FC<OSMBusinessDiscoveryProps> = ({ centerLat, centerLng, onBusinessesFound }) => {
  const [radius, setRadius] = useState(500);
  const [loading, setLoading] = useState(false);
  const [businesses, setBusinesses] = useState<OSMBusiness[]>([]);
  const [density, setDensity] = useState<BusinessDensity | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryOverpass = async (lat: number, lng: number, r: number) => {
    const response = await fetch('/api/osm/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, radius: r })
    });

    if (!response.ok) {
      throw new Error('API request failed');
    }

    return response.json();
  };

  const discover = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await queryOverpass(centerLat, centerLng, radius);
      const elements = data.elements || [];

      const businesses: OSMBusiness[] = [];
      const byCategory: Record<string, number> = {};

      elements.forEach((el: any) => {
        if (!el.lat || !el.lon) return;
        const tags = el.tags || {};
        const category = tags.amenity || tags.shop || tags.office || tags.tourism || tags.leisure || 'other';
        const name = tags.name || '(tanpa nama)';

        byCategory[category] = (byCategory[category] || 0) + 1;

        businesses.push({
          osmId: String(el.id),
          name,
          lat: el.lat,
          lng: el.lon,
          type: el.type,
          category,
          distance: 0,
          tags
        });
      });

      const densityData: BusinessDensity = {
        total: businesses.length,
        byCategory,
        radius,
        centerLat,
        centerLng
      };

      setBusinesses(businesses);
      setDensity(densityData);
      onBusinessesFound(businesses);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Discovery failed';
      setError(message + ' - using demo data');
      
      // Fallback to mock data
      const businesses = MOCK_BUSINESSES.map(b => ({
        ...b,
        lat: centerLat + (Math.random() - 0.5) * 0.01,
        lng: centerLng + (Math.random() - 0.5) * 0.01
      }));
      
      const byCategory: Record<string, number> = {};
      businesses.forEach(b => {
        byCategory[b.category] = (byCategory[b.category] || 0) + 1;
      });
      
      const densityData: BusinessDensity = {
        total: businesses.length,
        byCategory,
        radius,
        centerLat,
        centerLng
      };
      
      setBusinesses(businesses);
      setDensity(densityData);
      onBusinessesFound(businesses);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="osm-discovery">
      <div className="discovery-controls">
        <label>
          Radius: {radius}m
          <input
            type="range"
            min="100"
            max="2000"
            step="100"
            value={radius}
            onChange={(e) => setRadius(parseInt(e.target.value))}
          />
        </label>
        <button
          className="btn btn-primary"
          onClick={discover}
          disabled={loading}
        >
          {loading ? 'Mencari...' : '🔍 Cari Bisnis di Sekitar'}
        </button>
      </div>

      {error && (
        <div className="error-message" role="alert">
          ⚠️ {error}
        </div>
      )}

      {density && (
        <div className="density-summary">
          <h4>Density Analysis ({radius}m)</h4>
          <div className="density-stats">
            <div className="density-stat">
              <span className="density-value">{density.total}</span>
              <span className="density-label">Total Bisnis</span>
            </div>
            {Object.entries(density.byCategory).map(([cat, count]) => (
              <div className="density-category" key={cat}>
                <span className="density-cat-name">{cat}</span>
                <span className="density-cat-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {businesses.length > 0 && (
        <div className="business-list">
          <h4>Bisnis Ditemukan ({businesses.length})</h4>
          <div className="business-items">
            {businesses.map((b) => (
              <div className="business-item" key={b.osmId}>
                <span className="business-category">{b.category}</span>
                <span className="business-name">{b.name}</span>
                <span className="business-coords">
                  {b.lat.toFixed(6)}, {b.lng.toFixed(6)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OSMBusinessDiscovery;