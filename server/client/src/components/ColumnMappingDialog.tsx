import React, { useState, useMemo } from 'react';
import type { ColumnMapping } from '../types';

interface PreviewData {
  columns: string[];
  sampleRows: any[];
  totalRows: number;
}

interface ColumnMappingDialogProps {
  isOpen: boolean;
  file: File | null;
  previewData: PreviewData | null;
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

const FIELD_CONFIG: { key: keyof ColumnMapping; label: string; description: string }[] = [
  { key: 'lat', label: 'Latitude', description: 'Merchant latitude (e.g. nearby_lat)' },
  { key: 'lng', label: 'Longitude', description: 'Merchant longitude (e.g. nearby_lng)' },
  { key: 'name', label: 'Merchant Name', description: 'Name of the merchant/location' },
  { key: 'branchCode', label: 'Branch Code', description: 'Branch code (e.g. kode_cabang)' },
  { key: 'branchName', label: 'Branch Name', description: 'Branch name (e.g. nama_cabang)' },
  { key: 'address', label: 'Address', description: 'Formatted address' },
  { key: 'status', label: 'Status', description: 'FU status (e.g. KET)' },
  { key: 'placeId', label: 'Place ID', description: 'Google place ID' },
  { key: 'midNmid', label: 'MID/NMID', description: 'Merchant identifier' },
  ];

const DEFAULT_MAPPING: ColumnMapping = {
  lat: 'nearby_lat',
  lng: 'nearby_lng',
  name: 'nearby_name',
  branchCode: 'kode_cabang',
  branchName: 'nama_cabang',
  address: 'nearby_formatted_address',
  status: 'KET',
  placeId: 'nearby_place_id',
  midNmid: 'MID/NMID',
};

function computeMapping(previewData: PreviewData | null): ColumnMapping {
  if (!previewData) return {};
  const columns = previewData.columns;
  const newMapping: ColumnMapping = {};
  FIELD_CONFIG.forEach(({ key }) => {
    const def = DEFAULT_MAPPING[key];
    if (def && columns.includes(def)) {
      newMapping[key] = def;
    } else if (key === 'lat' || key === 'lng') {
      const match = columns.find(c => {
        const lower = c.toLowerCase();
        if (key === 'lat') return lower.includes('lat') && !lower.includes('src');
        if (key === 'lng') return lower.includes('lng') && !lower.includes('src');
        return false;
      });
      if (match) newMapping[key] = match;
    }
  });
  return newMapping;
}

const ColumnMappingDialog: React.FC<ColumnMappingDialogProps> = ({
  isOpen,
  file,
  previewData,
  onConfirm,
  onCancel,
  isProcessing,
}) => {
  const [overrides, setOverrides] = useState<ColumnMapping>({});

  const mapping = useMemo(() => ({ ...computeMapping(previewData), ...overrides }), [previewData, overrides]);

  if (!isOpen || !previewData) return null;

  const handleSelect = (key: keyof ColumnMapping, value: string) => {
    setOverrides(prev => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    onConfirm(mapping);
  };

  const canConfirm = mapping.lat && mapping.lng;

  return (
    <div className="dialog-overlay">
      <div className="dialog">
        <div className="dialog-header">
          <h3>Map Columns - {file?.name}</h3>
          <button className="dialog-close" onClick={onCancel} disabled={isProcessing}>✕</button>
        </div>

        <div className="dialog-body">
          <p className="dialog-hint">
            Match your Excel/CSV columns to the app fields. {previewData.totalRows} rows total.
            Unmapped fields will be left blank.
          </p>

          <div className="mapping-table">
            <div className="mapping-header">
              <span>App Field</span>
              <span>Your Column</span>
            </div>
            <div className="mapping-rows">
              {FIELD_CONFIG.map(({ key, label, description }) => (
                <div className="mapping-row" key={key}>
                  <div className="field-info">
                    <span className="field-label">{label}</span>
                    <span className="field-desc">{description}</span>
                  </div>
                  <select
                    value={mapping[key] || ''}
                    onChange={(e) => handleSelect(key, e.target.value)}
                    disabled={isProcessing}
                  >
                    <option value="">— Not mapped —</option>
                    {previewData.columns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {previewData.sampleRows.length > 0 && (
            <div className="sample-preview">
              <h4>Sample Data (first row)</h4>
              <pre>{JSON.stringify(previewData.sampleRows[0], null, 2)}</pre>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!canConfirm || isProcessing}
            title="Latitude and Longitude are required"
          >
            {isProcessing ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ColumnMappingDialog;