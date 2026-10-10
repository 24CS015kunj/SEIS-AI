import React from 'react';
import {
  FolderTree,
  GitBranch,
  Layers,
  GitCommit,
  Search,
} from 'lucide-react';

/**
 * GraphSidebar.jsx
 *
 * Obsidian-Inspired Left Navigation & Filter Sidebar.
 * - Navigation links: Project Overview, Dependencies (active), Architecture, Changes Impact
 * - Functional filters for Dependency Types (Imports, Uses, Cycles) with real counts
 * - Functional filters for Module Types (Source, Config, Test, Other) with real counts
 * - Quick search input with "Show only selected" toggle
 * - Live analysis status telemetry footer
 */
export default function GraphSidebar({
  activeNav = 'dependencies',
  onNavChange,
  filterImports = true,
  onToggleFilterImports,
  filterUses = true,
  onToggleFilterUses,
  filterCyclesOnly = false,
  onToggleFilterCycles,
  filterSourceOnly = true,
  onToggleFilterSource,
  filterConfig = true,
  onToggleFilterConfig,
  filterTest = false,
  onToggleFilterTest,
  searchQuery,
  onSearchChange,
  showOnlySelected,
  onToggleShowOnlySelected,
  moduleCount = 0,
  edgeCount = 0,
  importsCount = 0,
  usesCount = 0,
  cyclesCount = 0,
  sourceCount = 0,
  configCount = 0,
  testCount = 0,
  otherCount = 0,
}) {
  return (
    <aside
      aria-label="Graph Navigation and Filters"
      className="w-52 h-full bg-[#10141D] border-r border-[#242B38] flex flex-col justify-between select-none text-[11px] font-sans shrink-0 overflow-y-auto"
    >
      <div className="p-3 space-y-4">
        {/* Project Section */}
        <div>
          <span className="block text-[9.5px] font-bold uppercase tracking-wider text-[#64748B] mb-1.5 px-1 font-mono">
            Project
          </span>
          <nav className="space-y-0.5">
            <button
              type="button"
              onClick={() => onNavChange?.('overview')}
              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded transition-colors cursor-pointer ${
                activeNav === 'overview'
                  ? 'bg-blue-600/15 text-blue-400 font-semibold'
                  : 'text-[#8995A8] hover:text-[#E2E8F0] hover:bg-[#161D2B]'
              }`}
            >
              <FolderTree size={12} className="shrink-0" />
              <span>Overview</span>
            </button>

            <button
              type="button"
              onClick={() => onNavChange?.('dependencies')}
              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded transition-colors cursor-pointer ${
                activeNav === 'dependencies'
                  ? 'bg-blue-600/15 text-blue-400 font-semibold'
                  : 'text-[#8995A8] hover:text-[#E2E8F0] hover:bg-[#161D2B]'
              }`}
            >
              <GitBranch size={12} className="shrink-0" />
              <span>Dependencies</span>
            </button>

            <button
              type="button"
              onClick={() => onNavChange?.('architecture')}
              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded transition-colors cursor-pointer ${
                activeNav === 'architecture'
                  ? 'bg-blue-600/15 text-blue-400 font-semibold'
                  : 'text-[#8995A8] hover:text-[#E2E8F0] hover:bg-[#161D2B]'
              }`}
            >
              <Layers size={12} className="shrink-0" />
              <span>Architecture</span>
            </button>

            <button
              type="button"
              onClick={() => onNavChange?.('changes')}
              className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded transition-colors cursor-pointer ${
                activeNav === 'changes'
                  ? 'bg-blue-600/15 text-blue-400 font-semibold'
                  : 'text-[#8995A8] hover:text-[#E2E8F0] hover:bg-[#161D2B]'
              }`}
            >
              <GitCommit size={12} className="shrink-0" />
              <span>Changes Impact</span>
            </button>
          </nav>
        </div>

        {/* Filters Section */}
        <div>
          <span className="block text-[9.5px] font-bold uppercase tracking-wider text-[#64748B] mb-2 px-1 font-mono">
            Filters
          </span>

          {/* Dependency Type Filter */}
          <div className="mb-3">
            <span className="block text-[10px] text-[#8995A8] mb-1 px-1">
              Dependency type
            </span>
            <div className="space-y-1">
              <label className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-[#161D2B] text-[#CBD5E1] cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filterImports}
                    onChange={(e) => onToggleFilterImports?.(e.target.checked)}
                    className="w-3 h-3 rounded bg-[#10141D] border-[#242B38] text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Imports</span>
                </div>
                <span className="font-mono text-[9.5px] text-[#64748B]">{importsCount}</span>
              </label>

              <label className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-[#161D2B] text-[#CBD5E1] cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filterUses}
                    onChange={(e) => onToggleFilterUses?.(e.target.checked)}
                    className="w-3 h-3 rounded bg-[#10141D] border-[#242B38] text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Uses / Requires</span>
                </div>
                <span className="font-mono text-[9.5px] text-[#64748B]">{usesCount}</span>
              </label>

              {cyclesCount > 0 && (
                <label className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-[#161D2B] text-amber-400 cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={filterCyclesOnly}
                      onChange={(e) => onToggleFilterCycles?.(e.target.checked)}
                      className="w-3 h-3 rounded bg-[#10141D] border-[#242B38] text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Cycles Only</span>
                  </div>
                  <span className="font-mono text-[9.5px] text-amber-500">{cyclesCount}</span>
                </label>
              )}
            </div>
          </div>

          {/* Module Type Filter */}
          <div>
            <span className="block text-[10px] text-[#8995A8] mb-1 px-1">
              Module type
            </span>
            <div className="space-y-1">
              <label className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-[#161D2B] text-[#CBD5E1] cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filterSourceOnly}
                    onChange={(e) => onToggleFilterSource?.(e.target.checked)}
                    className="w-3 h-3 rounded bg-[#10141D] border-[#242B38] text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Source</span>
                </div>
                <span className="font-mono text-[9.5px] text-[#64748B]">{sourceCount}</span>
              </label>

              <label className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-[#161D2B] text-[#CBD5E1] cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filterConfig}
                    onChange={(e) => onToggleFilterConfig?.(e.target.checked)}
                    className="w-3 h-3 rounded bg-[#10141D] border-[#242B38] text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Config</span>
                </div>
                <span className="font-mono text-[9.5px] text-[#64748B]">{configCount}</span>
              </label>

              <label className="flex items-center justify-between px-1.5 py-0.5 rounded hover:bg-[#161D2B] text-[#CBD5E1] cursor-pointer">
                <div className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={filterTest}
                    onChange={(e) => onToggleFilterTest?.(e.target.checked)}
                    className="w-3 h-3 rounded bg-[#10141D] border-[#242B38] text-blue-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Test</span>
                </div>
                <span className="font-mono text-[9.5px] text-[#64748B]">{testCount}</span>
              </label>

              {otherCount > 0 && (
                <div className="flex items-center justify-between px-1.5 py-0.5 text-[#64748B]">
                  <span>Other</span>
                  <span className="font-mono text-[9.5px]">{otherCount}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* In-Graph Search & Selection Toggle */}
        <div className="pt-2 border-t border-[#242B38]">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-[#64748B] font-mono">
              Search
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative mb-2">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#64748B]" />
            <input
              type="text"
              placeholder="Search in graph..."
              value={searchQuery}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="w-full pl-6 pr-2 py-1 bg-[#0B0E14] text-[#E2E8F0] placeholder-[#64748B] border border-[#242B38] rounded text-[10.5px] font-mono focus:outline-none focus:border-blue-500"
            />
          </div>

          <label className="flex items-center justify-between px-1 py-1 text-[#8995A8] hover:text-[#E2E8F0] cursor-pointer">
            <span>Show only selected</span>
            <input
              type="checkbox"
              checked={showOnlySelected}
              onChange={(e) => onToggleShowOnlySelected?.(e.target.checked)}
              className="w-3.5 h-3.5 rounded bg-[#10141D] border-[#242B38] text-blue-600 focus:ring-0 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Sidebar Footer: Analysis Telemetry */}
      <div className="p-3 border-t border-[#242B38] bg-[#0B0E14]/40">
        <div className="flex items-center gap-1.5 text-[10.5px] text-emerald-400 font-semibold mb-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Analysis complete</span>
        </div>
        <div className="font-mono text-[9.5px] text-[#64748B]">
          {moduleCount} modules · {edgeCount} dependencies
        </div>
      </div>
    </aside>
  );
}
