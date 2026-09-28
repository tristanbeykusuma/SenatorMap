import { useState, useRef, useEffect } from 'react';
import ColumnMappingDialog from '../components/ColumnMappingDialog';
import type { LocationData, Stats, BranchPerformance, ColumnMapping } from '../types';

interface PreviewData {
  columns: string[];
  sampleRows: any[];
  totalRows: number;
}

interface AdminPageProps {
  onSenatorUpload: (data: LocationData[], stats: Stats) => void;
  onRadarUpload: (data: BranchPerformance[]) => void;
  onDenyutUpload: () => void;
}

const AdminPage: React.FC<AdminPageProps> = ({ onSenatorUpload, onRadarUpload, onDenyutUpload }) => {
  const [status, setStatus] = useState<any>(null);
  const [senatorLoading, setSenatorLoading] = useState(false);
  const [radarLoading, setRadarLoading] = useState(false);
  const [denyutLoading, setDenyutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [pendingSenatorFile, setPendingSenatorFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [showMappingDialog, setShowMappingDialog] = useState(false);

  const senatorInputRef = useRef<HTMLInputElement>(null);
  const radarInputRef = useRef<HTMLInputElement>(null);
  const denyutInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    try {
      const r = await fetch('/api/admin/status');
      const d = await r.json();
      setStatus(d);
    } catch (e) {
      console.error('Failed to fetch status:', e);
    }
  };

  useEffect(() => {
    fetch('/api/admin/status')
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(e => console.error('Failed to fetch status:', e));
  }, []);

  const handleSenatorSelect = async (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      setError('Invalid file type. Use .xlsx, .xls, or .csv');
      return;
    }

    setPendingSenatorFile(file);
    setError(null);
    setSenatorLoading(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload/preview', { method: 'POST', body: formData });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(txt || 'Preview failed');
      }
      const result = await response.json();
      setPreviewData({
        columns: result.columns,
        sampleRows: result.sampleRows,
        totalRows: result.totalRows,
      });
      setShowMappingDialog(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
      setPendingSenatorFile(null);
    } finally {
      setSenatorLoading(false);
    }
  };

  const handleSenatorConfirm = async (mapping: ColumnMapping) => {
    if (!pendingSenatorFile) return;

    setSenatorLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', pendingSenatorFile);
    if (Object.keys(mapping).length > 0) {
      formData.append('mapping', JSON.stringify(mapping));
    }

    try {
      const response = await fetch('/api/admin/upload/senator', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(txt || 'Upload failed');
      }
      const result = await response.json();
      if (result.success) {
        setSuccess('Senator data uploaded as default successfully');
        setShowMappingDialog(false);
        setPreviewData(null);
        setPendingSenatorFile(null);
        onSenatorUpload(result.data, result.stats);
        fetchStatus();
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSenatorLoading(false);
    }
  };

  const handleSenatorCancel = () => {
    setShowMappingDialog(false);
    setPreviewData(null);
    setPendingSenatorFile(null);
  };

  const handleRadarSelect = async (file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      setError('Invalid file type. Use .xlsx, .xls, or .csv');
      return;
    }

    setRadarLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/admin/upload/radar', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(txt || 'Upload failed');
      }
      const result = await response.json();
      if (result.success) {
        setSuccess('Radar data uploaded as default successfully');
        onRadarUpload(result.data);
        fetchStatus();
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setRadarLoading(false);
    }
  };

  const handleDenyutSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setDenyutLoading(true);
    setError(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch('/api/admin/upload/denyut?clear=true', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const txt = await response.text();
        throw new Error(txt || 'Upload failed');
      }
      const result = await response.json();
      if (result.success) {
        setSuccess(`DENYUT template uploaded: ${result.rowsProcessed} rows, periods: ${result.periods.join(', ')}`);
        onDenyutUpload();
        fetchStatus();
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setDenyutLoading(false);
      if (denyutInputRef.current) denyutInputRef.current.value = '';
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-header">
          <h2>⚙️ Admin Dashboard</h2>
          <p>Upload default data that will be displayed for every user on app startup</p>
        </div>

        {error && (
          <div className="error-message" role="alert">
            &#9888; {error}
          </div>
        )}
        {success && (
          <div className="success-message" role="alert">
            &#9989; {success}
          </div>
        )}

        <div className="admin-grid">
          {/* Senator Data Upload */}
          <div className="admin-card">
            <h3>🗺️ Senator Map Data</h3>
            <p>Upload default merchant location data. Users will see this on the map until they upload their own file.</p>
            <div
              className={`drop-zone ${senatorLoading ? 'loading' : ''}`}
              onClick={() => senatorInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleSenatorSelect(file);
              }}
              style={{ cursor: 'pointer' }}
            >
              <input
                type="file"
                ref={senatorInputRef}
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSenatorSelect(file);
                  e.target.value = '';
                }}
                className="file-input"
                disabled={senatorLoading}
              />
              <div className="upload-content">
                <div className="upload-icon">📁</div>
                <h4>Upload Senator Data</h4>
                <p>Drop file or click to browse</p>
                <p className="formats">Supports: .xlsx, .xls, .csv</p>
              </div>
            </div>

            {status?.senator && (
              <div className="admin-status">
                <span className="status-badge done">✓ Active</span>
                <span className="status-text">Last updated: {new Date(status.senator.uploadedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Radar Data Upload */}
          <div className="admin-card">
            <h3>📊 Radar Map Data</h3>
            <p>Upload default branch performance data (REKAM MEDIS CABANG format). Users will see this on the radar map.</p>
            <div
              className={`drop-zone ${radarLoading ? 'loading' : ''}`}
              onClick={() => radarInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files[0];
                if (file) handleRadarSelect(file);
              }}
              style={{ cursor: 'pointer' }}
            >
              <input
                type="file"
                ref={radarInputRef}
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleRadarSelect(file);
                  e.target.value = '';
                }}
                className="file-input"
                disabled={radarLoading}
              />
              <div className="upload-content">
                <div className="upload-icon">📁</div>
                <h4>Upload Radar Data</h4>
                <p>Drop file or click to browse</p>
                <p className="formats">Supports: .xlsx, .xls, .csv</p>
              </div>
            </div>

            {status?.radar && (
              <div className="admin-status">
                <span className="status-badge done">✓ Active</span>
                <span className="status-text">Last updated: {new Date(status.radar.uploadedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* DENYUT Data Upload */}
          <div className="admin-card">
            <h3>📡 DENYUT Template Data</h3>
            <p>Upload customer template files. Existing data will be cleared and replaced.</p>
            <div
              className={`drop-zone ${denyutLoading ? 'loading' : ''}`}
              onClick={() => denyutInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDenyutSelect(e.dataTransfer.files);
              }}
              style={{ cursor: 'pointer' }}
            >
              <input
                type="file"
                ref={denyutInputRef}
                accept=".xlsx,.xls,.csv"
                multiple
                onChange={(e) => {
                  handleDenyutSelect(e.target.files);
                }}
                className="file-input"
                disabled={denyutLoading}
              />
              <div className="upload-content">
                <div className="upload-icon">📁</div>
                <h4>Upload DENYUT Templates</h4>
                <p>Drop files or click to browse</p>
                <p className="formats">Supports: .xlsx, .xls, .csv (multiple files)</p>
              </div>
            </div>

            {status?.denyut && (
              <div className="admin-status">
                <span className="status-badge done">✓ {status.denyut.customerCount} customers</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <ColumnMappingDialog
        isOpen={showMappingDialog}
        file={pendingSenatorFile}
        previewData={previewData}
        onConfirm={handleSenatorConfirm}
        onCancel={handleSenatorCancel}
        isProcessing={senatorLoading}
      />
    </div>
  );
};

export default AdminPage;
