import { useState } from 'react';
import { sessionManager, type SavedSession } from '../utils/sessionManager';
import type { LocationData, Stats, BranchPerformance } from '../types';

interface SessionPanelProps {
  onRestore: (session: SavedSession) => void;
  currentData: {
    locations: LocationData[];
    stats: Stats | null;
    leadBranches: BranchPerformance[];
    selectedStatuses: string[];
    selectedBranches: string[];
    currentPage: string;
    mapCenter: [number, number];
    mapZoom: number;
  };
}

const SessionPanel: React.FC<SessionPanelProps> = ({ onRestore, currentData }) => {
  const [sessions, setSessions] = useState<SavedSession[]>(() => sessionManager.getAllSessions());
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const refreshSessions = () => {
    setSessions(sessionManager.getAllSessions());
  };

  const handleSave = () => {
    const name = editingId
      ? (sessions.find(s => s.id === editingId)?.name || 'Session')
      : `Session ${sessionManager.formatTimestamp(Date.now())}`;
    sessionManager.saveSession(
      name,
      currentData.locations,
      currentData.stats,
      currentData.leadBranches,
      currentData.selectedStatuses,
      currentData.selectedBranches,
      currentData.currentPage,
      currentData.mapCenter,
      currentData.mapZoom
    );
    setEditingId(null);
    setEditName('');
    refreshSessions();
  };

  const handleRename = (session: SavedSession) => {
    setEditingId(session.id);
    setEditName(session.name);
  };

  const handleRenameConfirm = (id: string) => {
    if (editName.trim()) {
      sessionManager.updateSession(id, { name: editName.trim() });
    }
    setEditingId(null);
    setEditName('');
    refreshSessions();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this session?')) {
      sessionManager.deleteSession(id);
      refreshSessions();
    }
  };

  const handleLoad = (session: SavedSession) => {
    onRestore(session);
    setIsOpen(false);
  };

  const handleClearAll = () => {
    if (confirm('Delete ALL sessions? This cannot be undone.')) {
      sessionManager.clearAll();
      refreshSessions();
    }
  };

  const hasCurrentData = currentData.locations.length > 0 || currentData.leadBranches.length > 0;

  return (
    <div className="session-panel">
      <button
        className="session-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title="Session History"
      >
        💾 {isOpen ? '✕' : 'Sessions'} ({sessions.length})
      </button>

      {isOpen && (
        <div className="session-dropdown">
          <div className="session-header">
            <h4>Session History</h4>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={!hasCurrentData}>
              💾 Save Current
            </button>
          </div>

          {sessions.length === 0 ? (
            <div className="session-empty">
              <p>No saved sessions</p>
              <p className="hint">Upload data and click "Save Current" to create one.</p>
            </div>
          ) : (
            <div className="session-list">
              {sessions.map(s => (
                <div className="session-item" key={s.id}>
                  {editingId === s.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => handleRenameConfirm(s.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRenameConfirm(s.id);
                        if (e.key === 'Escape') { setEditingId(null); setEditName(''); }
                      }}
                      autoFocus
                    />
                  ) : (
                    <div className="session-info" onClick={() => handleLoad(s)}>
                      <div className="session-name">{s.name}</div>
                      <div className="session-meta">
                        <span>{sessionManager.formatTimestamp(s.timestamp)}</span>
                        <span>📍 {s.locations.length} merchants</span>
                        <span>🎯 {s.leadBranches.length} branches</span>
                        <span>📄 {s.currentPage}</span>
                      </div>
                    </div>
                  )}
                  <div className="session-actions">
                    <button
                      className="session-action-btn"
                      onClick={() => handleRename(s)}
                      title="Rename"
                    >
                      ✏️
                    </button>
                    <button
                      className="session-action-btn"
                      onClick={e => handleDelete(s.id, e)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {sessions.length > 0 && (
            <div className="session-footer">
              <button className="btn btn-sm btn-danger" onClick={handleClearAll}>
                Clear All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SessionPanel;