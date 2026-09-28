import { useState } from 'react';
import type { Stats } from '../types';

interface ExportButtonProps {
  locations: any[];
  stats: Stats | null;
  selectedStatuses: string[];
  selectedBranches: string[];
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

function getExportFilename(format: 'xlsx' | 'csv' | 'json'): string {
  const ext = format === 'xlsx' ? 'xlsx' : format;
  return `merchants_export_${Date.now()}.${ext}`;
}

const ExportButton: React.FC<ExportButtonProps> = ({ 
  locations, 
  stats, 
  selectedStatuses, 
  selectedBranches 
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv' | 'json'>('xlsx');

  const handleExport = async (format: 'xlsx' | 'csv' | 'json') => {
    setIsExporting(true);
    
    try {
      const params = new URLSearchParams();
      if (selectedStatuses.length > 0 && selectedStatuses.length < (stats?.byStatus ? Object.keys(stats.byStatus).length : 0)) {
        params.append('status', selectedStatuses.join(','));
      }
      if (selectedBranches.length > 0 && selectedBranches.length < (stats?.byBranch ? Object.keys(stats.byBranch).length : 0)) {
        params.append('branch', selectedBranches.join(','));
      }

      const response = await fetch(`/api/export/${format}?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      if (format === 'json') {
        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, getExportFilename('json'));
      } else {
        const blob = await response.blob();
        downloadBlob(blob, getExportFilename(format));
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const filteredCount = locations.length;
  const totalCount = stats?.total || 0;

  return (
    <div className="export-dropdown">
      <button 
        className="btn btn-primary export-trigger"
        onClick={() => setExportFormat('xlsx')}
        disabled={isExporting || locations.length === 0}
      >
        {isExporting ? (
          <>
            <span className="spinner-sm"></span>
            Exporting...
          </>
        ) : (
          '📥 Export'
        )}
      </button>
      
      <div className="export-menu">
        <div className="export-info">
          <span>{filteredCount} of {totalCount} records</span>
        </div>
        <div className="export-options">
          <button 
            className={`export-option ${exportFormat === 'xlsx' ? 'active' : ''}`}
            onClick={() => { setExportFormat('xlsx'); handleExport('xlsx'); }}
            disabled={isExporting}
          >
            <span className="option-icon">📊</span>
            <span>Excel (.xlsx)</span>
            <span className="option-desc">Best for analysis</span>
          </button>
          <button 
            className={`export-option ${exportFormat === 'csv' ? 'active' : ''}`}
            onClick={() => { setExportFormat('csv'); handleExport('csv'); }}
            disabled={isExporting}
          >
            <span className="option-icon">📄</span>
            <span>CSV (.csv)</span>
            <span className="option-desc">Universal format</span>
          </button>
          <button 
            className={`export-option ${exportFormat === 'json' ? 'active' : ''}`}
            onClick={() => { setExportFormat('json'); handleExport('json'); }}
            disabled={isExporting}
          >
            <span className="option-icon">📋</span>
            <span>JSON (.json)</span>
            <span className="option-desc">For developers</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportButton;