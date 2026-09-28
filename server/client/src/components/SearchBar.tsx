import { useState, useEffect, useCallback } from 'react';
import type { LocationData } from '../types';

interface SearchBarProps {
  locations: LocationData[];
  onSearch: (results: LocationData[]) => void;
  onClear: () => void;
  hasResults: boolean;
  onResultFocus?: (location: LocationData) => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ 
  locations, 
  onSearch, 
  onClear, 
  hasResults,
  onResultFocus
}) => {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const filteredResults = locations.filter(loc => 
    loc.name.toLowerCase().includes(query.toLowerCase()) ||
    loc.address.toLowerCase().includes(query.toLowerCase()) ||
    loc.branchName.toLowerCase().includes(query.toLowerCase()) ||
    loc.status.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10);

  const handleSelect = useCallback((location: LocationData) => {
    setQuery(location.name);
    setShowResults(false);
    setSelectedIndex(-1);
    onSearch([location]);
    if (onResultFocus) {
      onResultFocus(location);
    }
  }, [onSearch, onResultFocus]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showResults) return;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        handleSelect(filteredResults[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowResults(false);
        setSelectedIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResults, filteredResults, selectedIndex, handleSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowResults(value.length > 0);
    setSelectedIndex(-1);
    
    if (value.length === 0) {
      onClear();
    } else {
      onSearch(filteredResults);
    }
  };

  const handleFocus = () => {
    if (query.length > 0) setShowResults(true);
  };

  const handleBlur = () => {
    setTimeout(() => setShowResults(false), 200);
  };

  return (
    <div className="search-bar">
      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="Search merchants by name, address, branch, status..."
          className="search-input"
          autoComplete="off"
        />
        {query && (
          <button 
            className="search-clear" 
            onClick={() => {
              setQuery('');
              setShowResults(false);
              onClear();
            }}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {showResults && query.length > 0 && (
        <div className="search-results">
          {filteredResults.length === 0 ? (
            <div className="search-no-results">No merchants found</div>
          ) : (
            filteredResults.map((loc, idx) => (
              <button
                key={loc.id}
                className={`search-result-item ${selectedIndex === idx ? 'selected' : ''}`}
                onClick={() => handleSelect(loc)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span className="result-name">{loc.name}</span>
                <span className="result-meta">
                  {loc.branchName} · {loc.status}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {hasResults && query.length === 0 && (
        <button className="btn btn-sm btn-secondary" onClick={onClear}>
          Clear Filters
        </button>
      )}
    </div>
  );
};

export default SearchBar;