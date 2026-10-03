import { useState } from 'react';
import type { Stats } from '../types';
import { STATUS_COLORS } from '../utils/statusConfig';

interface FilterPanelProps {
  stats: Stats | null;
  selectedStatuses: string[];
  selectedBranches: string[];
  onStatusToggle: (status: string) => void;
  onBranchToggle: (branch: string) => void;
  onSelectAllStatuses: () => void;
  onClearAllStatuses: () => void;
  onSelectAllBranches: () => void;
  onClearAllBranches: () => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({ 
  stats, 
  selectedStatuses, 
  selectedBranches, 
  onStatusToggle, 
  onBranchToggle,
  onSelectAllStatuses,
  onClearAllStatuses,
  onSelectAllBranches,
  onClearAllBranches
}) => {
  const [showStatuses, setShowStatuses] = useState(true);
  const [showBranches, setShowBranches] = useState(false);

  if (!stats) return null;

  const allStatuses = Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1]);
  const allBranches = Object.entries(stats.byBranch).sort((a, b) => b[1] - a[1]);
  const allStatusKeys = Object.keys(stats.byStatus);
  const allBranchKeys = Object.keys(stats.byBranch);

  return (
    <div className="filter-panel">
      <details className="filter-section" open={showStatuses}>
        <summary onClick={(e) => { e.preventDefault(); setShowStatuses(!showStatuses); }}>
          <span className="filter-title">📍 Filter by Status</span>
          <span className="filter-count">{selectedStatuses.length}/{allStatuses.length}</span>
        </summary>
        <div className="filter-options">
          {allStatuses.map(([status, count]) => (
            <label key={status} className="filter-option">
              <input
                type="checkbox"
                checked={selectedStatuses.includes(status)}
                onChange={() => onStatusToggle(status)}
              />
              <span className="status-indicator" style={{ backgroundColor: STATUS_COLORS[status] || '#6b7280' }}></span>
              <span className="status-name">{status}</span>
              <span className="status-count">({count})</span>
            </label>
          ))}
        </div>
        <div className="filter-actions">
          <button 
            className="btn btn-sm btn-secondary"
            onClick={onSelectAllStatuses}
            disabled={selectedStatuses.length === allStatusKeys.length}
          >
            Select All
          </button>
          <button 
            className="btn btn-sm btn-secondary"
            onClick={onClearAllStatuses}
            disabled={selectedStatuses.length === 0}
          >
            Clear
          </button>
        </div>
      </details>

      <details className="filter-section" open={showBranches}>
        <summary onClick={(e) => { e.preventDefault(); setShowBranches(!showBranches); }}>
          <span className="filter-title">🏢 Filter by Branch</span>
          <span className="filter-count">{selectedBranches.length}/{allBranches.length}</span>
        </summary>
        <div className="filter-options">
          {allBranches.map(([branch, count]) => (
            <label key={branch} className="filter-option">
              <input
                type="checkbox"
                checked={selectedBranches.includes(branch)}
                onChange={() => onBranchToggle(branch)}
              />
              <span className="branch-name">{branch}</span>
              <span className="branch-count">({count})</span>
            </label>
          ))}
        </div>
        <div className="filter-actions">
          <button 
            className="btn btn-sm btn-secondary"
            onClick={onSelectAllBranches}
            disabled={selectedBranches.length === allBranchKeys.length}
          >
            Select All
          </button>
          <button 
            className="btn btn-sm btn-secondary"
            onClick={onClearAllBranches}
            disabled={selectedBranches.length === 0}
          >
            Clear
          </button>
        </div>
      </details>
    </div>
  );
};

export default FilterPanel;