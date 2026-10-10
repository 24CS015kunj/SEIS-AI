import React, { useState, useRef, useEffect } from 'react';
import {
  Network,
  Search,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

/**
 * GraphToolbar.jsx
 *
 * Obsidian-Inspired Top Navigation & Control Toolbar.
 * - Branding & Project breadcrumb
 * - Quick search input with shortcut hint (⌘K / Ctrl+K)
 * - Scope & dependency type dropdowns
 * - Architecture vs Files view segmented switch
 * - Zoom in/out, 100% reset, re-layout, and fullscreen toggle
 */
export default function GraphToolbar({
  projectName = 'Codebase Graph',
  breadcrumbPath = 'project / src',
  searchQuery,
  onSearchChange,
  scope,
  onScopeChange,
  edgeFilter,
  onEdgeFilterChange,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onReLayout,
  isFullView,
  onToggleFullView,
  searchResults = [],
  onSelectSearchResult,
  cycleCount = 0,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchContainerRef = useRef(null);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-11 bg-[#10141D] border-b border-[#242B38] px-3 flex items-center justify-between gap-3 select-none text-[11.5px] font-sans shrink-0 z-30">
      {/* Left: Branding & Breadcrumb */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1.5 text-[#E2E8F0] font-semibold">
          <div className="w-5 h-5 rounded bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Network size={12} />
          </div>
          <span>{projectName}</span>
        </div>

        <div className="h-3.5 w-[1px] bg-[#242B38] hidden sm:block" />

        <div className="hidden md:flex items-center gap-1 font-mono text-[10.5px] text-[#8995A8]">
          <span className="text-[#64748B]">{breadcrumbPath}</span>
        </div>
      </div>

      {/* Center: Search & Scope / Filters */}
      <div className="flex items-center gap-2 flex-1 max-w-xl mx-2">
        {/* Search Input with Shortcut Badge */}
        <div ref={searchContainerRef} className="relative flex-1 min-w-[170px]">
          <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
          <input
            type="text"
            placeholder="Search modules, files or paths..."
            value={searchQuery}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              onSearchChange?.(e.target.value);
              setSearchOpen(true);
            }}
            className="w-full pl-7 pr-11 py-1 bg-[#0B0E14] text-[#E2E8F0] placeholder-[#64748B] border border-[#242B38] rounded text-[11px] font-mono focus:outline-none focus:border-blue-500 focus:bg-[#0E131C] transition-colors"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                onSearchChange?.('');
                setSearchOpen(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#CBD5E1]"
            >
              <X size={11} />
            </button>
          ) : (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] text-[#64748B] bg-[#161D2B] px-1 py-0.2 rounded border border-[#242B38] pointer-events-none hidden sm:inline">
              ⌘K
            </span>
          )}

          {/* Autocomplete Dropdown */}
          {searchOpen && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-[#10141D] border border-[#242B38] rounded-md shadow-xl z-50 max-h-56 overflow-y-auto py-1 divide-y divide-[#1A2230]">
              {searchResults.slice(0, 10).map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => {
                    onSelectSearchResult?.(node);
                    setSearchOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#161D2B] flex items-center justify-between text-[11px] font-mono text-[#E2E8F0] cursor-pointer"
                >
                  <span className="truncate max-w-[240px]" title={node.path || node.name}>
                    {node.path || node.name}
                  </span>
                  <span className="text-[10px] text-blue-400 font-sans font-semibold shrink-0 ml-1">
                    Select →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scope Dropdown */}
        <div className="relative hidden lg:block">
          <select
            value={scope}
            onChange={(e) => onScopeChange?.(e.target.value)}
            className="appearance-none bg-[#0B0E14] border border-[#242B38] text-[#CBD5E1] rounded px-2.5 py-1 pr-6 text-[11px] font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="modules">All modules</option>
            <option value="files">All files</option>
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
        </div>

        {/* Dependency Filter Dropdown */}
        <div className="relative hidden xl:block">
          <select
            value={edgeFilter}
            onChange={(e) => onEdgeFilterChange?.(e.target.value)}
            className="appearance-none bg-[#0B0E14] border border-[#242B38] text-[#CBD5E1] rounded px-2.5 py-1 pr-6 text-[11px] font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">All dependencies</option>
            <option value="internal">Internal only</option>
            {cycleCount > 0 && <option value="cycles">Cycles only ({cycleCount})</option>}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none" />
        </div>

        {/* Architecture vs Files Segmented View Toggle */}
        <div
          role="group"
          aria-label="View toggle"
          className="inline-flex items-center rounded border border-[#242B38] bg-[#0B0E14] p-0.5 shrink-0"
        >
          <button
            type="button"
            onClick={() => onScopeChange?.('modules')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              scope === 'modules'
                ? 'bg-[#1C2638] text-[#E2E8F0] font-semibold border border-[#3B82F6]/30 shadow-2xs'
                : 'text-[#8995A8] hover:text-[#E2E8F0]'
            }`}
          >
            Architecture
          </button>
          <button
            type="button"
            onClick={() => onScopeChange?.('files')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
              scope === 'files'
                ? 'bg-[#1C2638] text-[#E2E8F0] font-semibold border border-[#3B82F6]/30 shadow-2xs'
                : 'text-[#8995A8] hover:text-[#E2E8F0]'
            }`}
          >
            Files
          </button>
        </div>
      </div>

      {/* Right: Layout Action, Zoom & Fullscreen */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Re-stabilize Force Layout */}
        {onReLayout && (
          <button
            type="button"
            onClick={onReLayout}
            className="p-1 text-[#8995A8] hover:text-[#E2E8F0] hover:bg-[#161D2B] rounded border border-[#242B38] transition-colors cursor-pointer"
            title="Re-stabilize force layout"
            aria-label="Re-layout graph"
          >
            <RefreshCw size={11} />
          </button>
        )}

        {/* Zoom Controls */}
        <div className="inline-flex items-center rounded border border-[#242B38] bg-[#0B0E14] p-0.5 font-mono text-[11px]">
          <button
            type="button"
            onClick={onZoomOut}
            className="p-1 text-[#8995A8] hover:text-[#E2E8F0] rounded hover:bg-[#161D2B] transition-colors cursor-pointer"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut size={11} />
          </button>
          <button
            type="button"
            onClick={onResetZoom}
            className="px-1.5 py-0.5 text-[#CBD5E1] hover:text-blue-400 font-semibold rounded hover:bg-[#161D2B] text-center transition-colors cursor-pointer w-10 text-[10.5px]"
            title="Reset zoom to 100%"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            type="button"
            onClick={onZoomIn}
            className="p-1 text-[#8995A8] hover:text-[#E2E8F0] rounded hover:bg-[#161D2B] transition-colors cursor-pointer"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn size={11} />
          </button>
        </div>

        {/* Fullscreen Toggle */}
        {onToggleFullView && (
          <button
            type="button"
            onClick={onToggleFullView}
            className="p-1 text-[#8995A8] hover:text-[#E2E8F0] hover:bg-[#161D2B] rounded border border-[#242B38] transition-colors cursor-pointer ml-0.5"
            title={isFullView ? 'Exit Full View' : 'Full Screen'}
            aria-label="Toggle full view"
          >
            {isFullView ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
        )}
      </div>
    </header>
  );
}
