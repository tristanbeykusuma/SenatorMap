import type { Stats } from '../types';
import { getStatusColor } from '../utils/statusConfig';

interface StatsPanelProps {
  stats: Stats | null;
  filteredCount: number;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ stats, filteredCount }) => {
  if (!stats) return null;

  return (
    <div className="stats-panel">
      <h3>📊 Statistics</h3>
      <div className="stat-cards">
        <div className="stat-card total">
          <span className="stat-value">{filteredCount}</span>
          <span className="stat-label">Showing</span>
        </div>
        <div className="stat-card total">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Total Records</span>
        </div>
      </div>
      
      <div className="stat-breakdown">
        <h4>By Status</h4>
        <div className="stat-bars">
          {Object.entries(stats.byStatus)
            .sort((a, b) => b[1] - a[1])
            .map(([status, count]) => (
              <div key={status} className="stat-bar">
                <span className="stat-bar-label">{status}</span>
                <div className="stat-bar-container">
                  <div 
                    className="stat-bar-fill" 
                    style={{ 
                      width: `${(count / stats.total) * 100}%`,
                      backgroundColor: getStatusColor(status)
                    }} 
                  ></div>
                </div>
                <span className="stat-bar-value">{count}</span>
              </div>
            ))}
        </div>
      </div>

      <div className="stat-breakdown">
        <h4>By Branch</h4>
        <div className="stat-bars">
          {Object.entries(stats.byBranch)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([branch, count]) => (
              <div key={branch} className="stat-bar">
                <span className="stat-bar-label" title={branch}>{branch}</span>
                <div className="stat-bar-container">
                  <div 
                    className="stat-bar-fill" 
                    style={{ width: `${(count / stats.total) * 100}%` }} 
                  ></div>
                </div>
                <span className="stat-bar-value">{count}</span>
              </div>
            ))}
        </div>
        {Object.keys(stats.byBranch).length > 5 && (
          <p className="stat-more">+{Object.keys(stats.byBranch).length - 5} more branches</p>
        )}
      </div>
    </div>
  );
};

export default StatsPanel;