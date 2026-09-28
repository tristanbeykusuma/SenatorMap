import type { LocationData, Stats, BranchPerformance } from '../types';

export interface SavedSession {
  id: string;
  name: string;
  timestamp: number;
  locations: LocationData[];
  stats: Stats | null;
  leadBranches: BranchPerformance[];
  selectedStatuses: string[];
  selectedBranches: string[];
  currentPage: string;
  mapCenter: [number, number];
  mapZoom: number;
}

const STORAGE_KEY = 'senator-map-sessions';
const CURRENT_KEY = 'senator-map-current';

class SessionManager {
  private sessions: SavedSession[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.sessions = JSON.parse(stored);
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
      this.sessions = [];
    }
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.sessions));
    } catch (e) {
      console.error('Failed to save sessions:', e);
    }
  }

  saveSession(
    name: string,
    locations: LocationData[],
    stats: Stats | null,
    leadBranches: BranchPerformance[],
    selectedStatuses: string[],
    selectedBranches: string[],
    currentPage: string,
    mapCenter: [number, number],
    mapZoom: number
  ): SavedSession {
    const session: SavedSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      timestamp: Date.now(),
      locations,
      stats,
      leadBranches,
      selectedStatuses,
      selectedBranches,
      currentPage,
      mapCenter,
      mapZoom
    };

    this.sessions.unshift(session);
    if (this.sessions.length > 50) {
      this.sessions = this.sessions.slice(0, 50);
    }
    this.save();
    localStorage.setItem(CURRENT_KEY, session.id);
    return session;
  }

  updateSession(
    id: string,
    updates: Partial<Omit<SavedSession, 'id'>>
  ): SavedSession | null {
    const idx = this.sessions.findIndex(s => s.id === id);
    if (idx === -1) return null;

    this.sessions[idx] = { ...this.sessions[idx], ...updates, timestamp: Date.now() };
    this.save();
    return this.sessions[idx];
  }

  deleteSession(id: string) {
    this.sessions = this.sessions.filter(s => s.id !== id);
    this.save();
  }

  getAllSessions(): SavedSession[] {
    return [...this.sessions].sort((a, b) => b.timestamp - a.timestamp);
  }

  getSession(id: string): SavedSession | null {
    return this.sessions.find(s => s.id === id) || null;
  }

  getCurrentSessionId(): string | null {
    return localStorage.getItem(CURRENT_KEY);
  }

  getCurrentSession(): SavedSession | null {
    const id = this.getCurrentSessionId();
    return id ? this.getSession(id) : null;
  }

  clearAll() {
    this.sessions = [];
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CURRENT_KEY);
  }

  formatTimestamp(ts: number): string {
    const d = new Date(ts);
    const date = d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    const time = d.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${date} ${time}`;
  }
}

export const sessionManager = new SessionManager();
export default SessionManager;