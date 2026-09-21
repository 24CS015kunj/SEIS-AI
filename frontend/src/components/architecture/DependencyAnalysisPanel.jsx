import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  FileCode,
  Filter,
  Folder,
  GitCommit,
  Layers,
  Network,
  RotateCcw,
  Search,
  Target,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  aggregateModulesFromGraph,
  computeCycleHighlightMap,
  computeFocusGraph,
  computeHierarchicalLayout,
} from '../../utils/moduleGraphAnalytics';

/**
 * Task #5 — Interactive Architecture & Dependency Graph Exploration UI.
 * Upgrades the dependency graph with layered layouts, intelligent node sizing,
 * directed import arrows, focus mode, search & auto-focus, edge filtering,
 * drag/pan/zoom canvas, enriched real metrics, circular dependency loop highlighting,
 * and direct source code navigation without mock data.
 */
export default function DependencyAnalysisPanel({
  dependencyStatus,
  dependencyData,
  analysisStatus,
  analysis,
  onRefresh,
  onSelectFile,
}) {
  const [viewMode, setViewMode] = useState('overview'); // 'overview' | 'files' | 'focus'
  const [edgeFilter, setEdgeFilter] = useState('all'); // 'all' | 'internal' | 'selected' | 'circular'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [expandedModules, setExpandedModules] = useState(new Set());

  const summary = dependencyData?.summary || null;
  const rawNodes = useMemo(() => dependencyData?.nodes || [], [dependencyData]);
  const rawEdges = useMemo(() => dependencyData?.edges || [], [dependencyData]);
  const cycles = dependencyData?.cycles || [];
  const externalImports = useMemo(() => dependencyData?.externalImports || [], [dependencyData]);

  // Directory/Module Aggregations
  const { moduleNodes, moduleEdges, isolatedCount } = useMemo(() => {
    return aggregateModulesFromGraph(rawNodes, rawEdges, externalImports);
  }, [rawNodes, rawEdges, externalImports]);

  // Selected Cycle Highlight Map
  const cycleHighlight = useMemo(() => {
    if (selectedCycleIndex === null || !cycles[selectedCycleIndex]) {
      return { cycleNodeSet: new Set(), cycleEdgeSet: new Set() };
    }
    return computeCycleHighlightMap(cycles[selectedCycleIndex]);
  }, [selectedCycleIndex, cycles]);

  // Search Results Filtering & Selection
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return rawNodes.filter(
      (n) => n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q)
    );
  }, [rawNodes, searchQuery]);

  // Top Connected Module Insights
  const topConnectedModule = useMemo(() => {
    if (moduleNodes.length === 0) return null;
    return [...moduleNodes].sort((a, b) => b.totalRelationships - a.totalRelationships)[0];
  }, [moduleNodes]);

  // Handle Search Result Selection
  const handleSelectSearchResult = (fileNode) => {
    setSelectedNodeId(fileNode.id);
    setViewMode('focus');
    setSearchQuery('');
    setSearchFocused(false);
  };

  // Toggle Module Expansion in Overview Mode
  const toggleExpandModule = (modId) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(modId)) next.delete(modId);
      else next.add(modId);
      return next;
    });
  };

  const handleExpandAll = () => {
    setExpandedModules(new Set(moduleNodes.map((m) => m.id)));
  };

  const handleCollapseAll = () => {
    setExpandedModules(new Set());
  };

  // Pan Canvas Handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleResetCanvas = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setSelectedNodeId(null);
    setSelectedCycleIndex(null);
    setEdgeFilter('all');
  };

  // Selected Node Details Data
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return rawNodes.find((n) => n.id === selectedNodeId) || moduleNodes.find((m) => m.id === selectedNodeId) || null;
  }, [selectedNodeId, rawNodes, moduleNodes]);

  // Focus Graph calculation when in Focus mode
  const focusGraph = useMemo(() => {
    if (!selectedNodeId) return null;
    return computeFocusGraph(selectedNodeId, rawNodes, rawEdges, externalImports);
  }, [selectedNodeId, rawNodes, rawEdges, externalImports]);

  return (
    <section aria-labelledby="dependency-analysis-heading">
      {/* Header & Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-blue-600 shrink-0" aria-hidden="true" />
          <h2 id="dependency-analysis-heading" className="text-[14px] font-bold text-slate-900 m-0">
            Interactive Architecture & Dependency Graph
          </h2>
        </div>

        {dependencyStatus === 'ready' && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Real AST Parsed
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors"
                title="Re-analyze dependency graph"
              >
                <RotateCcw size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {dependencyStatus === 'loading' ? (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80">
          <p className="text-[12.5px] font-semibold text-slate-700 m-0">
            Parsing repository source code & building directed dependency graph…
          </p>
        </div>
      ) : dependencyStatus === 'error' || !summary || rawNodes.length === 0 ? (
        <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200/80">
          <p className="text-[12.5px] font-semibold text-slate-700 m-0">
            No internal dependency relationships detected.
          </p>
          <p className="text-[11.5px] text-slate-500 m-0 mt-1">
            Dependency analysis parses relative imports across JS, JSX, TS, TSX, Python, and CSS files.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Main Enriched Architecture Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11.5px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Files</span>
              <span className="font-bold text-[15px] font-mono text-slate-900">{summary.analyzedFiles || summary.totalFiles}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11.5px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Internal Edges</span>
              <span className="font-bold text-[15px] font-mono text-blue-600">{summary.totalInternalEdges}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11.5px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">External PKGS</span>
              <span className="font-bold text-[15px] font-mono text-slate-700">{summary.externalPackagesCount}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11.5px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Cycles</span>
              <span className={`font-bold text-[15px] font-mono ${cycles.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{cycles.length}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11.5px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Top Fan-In</span>
              <span className="font-bold text-[13px] font-mono text-emerald-700 truncate block" title={summary.mostImported?.[0]?.path}>
                {summary.mostImported?.[0]?.path ? summary.mostImported[0].path.split('/').pop() : 'N/A'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11.5px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Top Fan-Out</span>
              <span className="font-bold text-[13px] font-mono text-purple-700 truncate block" title={summary.mostDependencyHeavy?.[0]?.path}>
                {summary.mostDependencyHeavy?.[0]?.path ? summary.mostDependencyHeavy[0].path.split('/').pop() : 'N/A'}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/80 text-[11.5px]">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Isolated</span>
              <span className="font-bold text-[15px] font-mono text-slate-500">{isolatedCount}</span>
            </div>
          </div>

          {/* Circular Dependency Highlight Callout */}
          {cycles.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-[12px] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900 font-bold">
                  <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                  <span>Circular Dependency Loops Detected ({cycles.length})</span>
                </div>
                {selectedCycleIndex !== null && (
                  <button
                    type="button"
                    onClick={() => setSelectedCycleIndex(null)}
                    className="text-[11px] font-semibold text-amber-800 underline hover:text-amber-950"
                  >
                    Clear Cycle Focus
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {cycles.map((c, i) => {
                  const isCycleActive = selectedCycleIndex === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setSelectedCycleIndex(i);
                        setEdgeFilter('circular');
                        if (c.cycle.length > 0) {
                          setSelectedNodeId(c.cycle[0]);
                          setViewMode('files');
                        }
                      }}
                      className={`font-mono text-[11px] px-2.5 py-1 rounded-lg border transition-all text-left flex items-center gap-1.5 ${
                        isCycleActive
                          ? 'bg-amber-600 text-white border-amber-700 font-bold shadow-xs'
                          : 'bg-white hover:bg-amber-100/70 text-amber-900 border-amber-200'
                      }`}
                    >
                      <span>Loop {i + 1}:</span>
                      <span className="truncate max-w-[280px]">
                        {c.cycle.map((p) => p.split('/').pop()).join(' → ')}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Toolbar: View Modes, Edge Filtering, Search, Canvas Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-t border-slate-100 pt-3">
            {/* View Mode Switcher */}
            <div
              role="group"
              aria-label="Select dependency graph view mode"
              className="inline-flex items-center rounded-lg bg-slate-100 p-1 shrink-0"
            >
              <button
                type="button"
                onClick={() => setViewMode('overview')}
                className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors ${
                  viewMode === 'overview'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                Overview (Directories)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('files')}
                className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors ${
                  viewMode === 'files'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                Files View ({rawNodes.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('focus')}
                className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors ${
                  viewMode === 'focus'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                Focus Mode {selectedNode ? `(${selectedNode.name || selectedNode.path})` : ''}
              </button>
            </div>

            {/* Edge Visibility Filter */}
            <div className="flex items-center gap-1.5 text-[11.5px]">
              <Filter size={13} className="text-slate-400 shrink-0" />
              <span className="font-semibold text-slate-600">Edges:</span>
              <select
                value={edgeFilter}
                onChange={(e) => setEdgeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-md text-[11.5px] px-2 py-1 font-semibold text-slate-700 focus:outline-none focus:border-blue-500"
              >
                <option value="all">Show All Edges</option>
                <option value="internal">Internal Only</option>
                <option value="selected">Selected Node Only</option>
                {cycles.length > 0 && <option value="circular">Circular Cycles Only</option>}
              </select>
            </div>

            {/* Search Box with Dropdown */}
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search file, path, or directory..."
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSearchFocused(true);
                }}
                className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
              />

              {searchFocused && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-56 overflow-y-auto py-1">
                  {searchResults.slice(0, 8).map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => handleSelectSearchResult(node)}
                      className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center justify-between text-[12px] font-mono border-b border-slate-100 last:border-0"
                    >
                      <span className="font-semibold text-slate-900 truncate" title={node.path}>
                        {node.path}
                      </span>
                      <span className="text-[11px] text-blue-600 shrink-0 ml-2">Focus →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Zoom & Reset Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.2))}
                aria-label="Zoom out"
                className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-[11px] font-mono text-slate-500 w-10 text-center">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
                aria-label="Zoom in"
                className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                onClick={handleResetCanvas}
                className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors ml-1"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Sizing & Legend Bar */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-700">Legend:</span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Internal Node
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-600" /> In Cycle
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-0.5 bg-blue-600" /> Directed Arrow (A → B: A imports B)
              </span>
            </div>
            <span className="hidden sm:inline text-slate-400">
              Drag canvas to pan · Node size = Relationships
            </span>
          </div>

          {/* Main Interactive Canvas Area & Side Details */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
            <div
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`border border-slate-200 rounded-xl bg-slate-50/50 p-4 relative overflow-hidden min-h-[400px] select-none ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              {viewMode === 'overview' ? (
                <OverviewModuleGraphCanvas
                  moduleNodes={moduleNodes}
                  moduleEdges={moduleEdges}
                  selectedNodeId={selectedNodeId}
                  hoveredNodeId={hoveredNodeId}
                  zoomLevel={zoomLevel}
                  panOffset={panOffset}
                  onSelectModule={(id) => setSelectedNodeId(id === selectedNodeId ? null : id)}
                  onHoverModule={(id) => setHoveredNodeId(id)}
                />
              ) : viewMode === 'files' ? (
                <HierarchicalFilesGraphCanvas
                  nodes={rawNodes}
                  edges={rawEdges}
                  externalImports={externalImports}
                  edgeFilter={edgeFilter}
                  cycleHighlight={cycleHighlight}
                  selectedNodeId={selectedNodeId}
                  hoveredNodeId={hoveredNodeId}
                  zoomLevel={zoomLevel}
                  panOffset={panOffset}
                  onSelectNode={(id) => setSelectedNodeId(id === selectedNodeId ? null : id)}
                  onHoverNode={(id) => setHoveredNodeId(id)}
                />
              ) : (
                <FocusModeCanvas
                  focusGraph={focusGraph}
                  onSelectNode={(id) => setSelectedNodeId(id)}
                />
              )}
            </div>

            {/* Node Details Side Panel */}
            <div className="border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3 min-h-[400px]">
              {!selectedNode ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                  <FileCode size={24} className="text-slate-300 mb-2" />
                  <p className="text-[12.5px] font-semibold text-slate-700 m-0">No node selected</p>
                  <p className="text-[11.5px] text-slate-400 m-0 mt-1">
                    Click any module or file node to inspect detailed relationships & source code.
                  </p>
                </div>
              ) : (
                <EnhancedNodeDetailsPanel
                  node={selectedNode}
                  edges={rawEdges}
                  externalImports={externalImports}
                  cycles={cycles}
                  onSelectRelated={(id) => {
                    setSelectedNodeId(id);
                    setViewMode('focus');
                  }}
                  onSelectFile={onSelectFile}
                />
              )}
            </div>
          </div>

          {/* Separator pointer to Evolution Analysis */}
          <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-3 border-t border-slate-100">
            <GitCommit size={14} className="text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-slate-700 m-0 mb-1">
                Related: Repository Evolution Analysis
              </p>
              <p className="text-[11.5px] text-slate-500 leading-relaxed m-0">
                {analysisStatus === 'ready' && analysis
                  ? `A commit-churn-based analysis exists (${analysis.insights?.length ?? 0} finding${
                      analysis.insights?.length === 1 ? '' : 's'
                    }). This groups files by commit co-change history, while the dependency graph above parses actual source code import/require statements.`
                  : 'No evolution analysis has been generated yet.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Overview Mode Canvas — Grouped Directory/Module Graph */
function OverviewModuleGraphCanvas({
  moduleNodes,
  moduleEdges,
  selectedNodeId,
  hoveredNodeId,
  zoomLevel,
  panOffset,
  onSelectModule,
  onHoverModule,
}) {
  const width = 740;
  const height = 380;

  const nodePositions = useMemo(() => {
    if (moduleNodes.length === 0) return new Map();
    const posMap = new Map();
    const cols = Math.ceil(Math.sqrt(moduleNodes.length));
    const rows = Math.ceil(moduleNodes.length / cols);
    const cellW = width / Math.max(1, cols);
    const cellH = height / Math.max(1, rows);

    moduleNodes.forEach((mod, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const x = cellW / 2 + c * cellW;
      const y = cellH / 2 + r * cellH;
      posMap.set(mod.id, { x, y, mod });
    });

    return posMap;
  }, [moduleNodes]);

  return (
    <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full max-h-[420px]"
      >
        <defs>
          <marker id="overviewArrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
          </marker>
        </defs>

        <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`} style={{ transformOrigin: 'center' }}>
          {/* Aggregated Module-to-Module Directed Edges */}
          {moduleEdges.map((mEdge, idx) => {
            const srcPos = nodePositions.get(mEdge.source);
            const tgtPos = nodePositions.get(mEdge.target);
            if (!srcPos || !tgtPos) return null;

            const midX = (srcPos.x + tgtPos.x) / 2;
            const midY = (srcPos.y + tgtPos.y) / 2;

            return (
              <g key={idx}>
                <line
                  x1={srcPos.x}
                  y1={srcPos.y}
                  x2={tgtPos.x}
                  y2={tgtPos.y}
                  stroke="#94A3B8"
                  strokeWidth={Math.min(4, 1 + mEdge.weight * 0.5)}
                  strokeOpacity={0.6}
                  markerEnd="url(#overviewArrow)"
                />
                <text x={midX} y={midY - 4} textAnchor="middle" className="text-[9px] font-mono fill-slate-500 font-bold bg-white px-1">
                  {mEdge.weight} deps
                </text>
              </g>
            );
          })}

          {/* Directory/Module Nodes */}
          {[...nodePositions.values()].map(({ x, y, mod }) => {
            const isSelected = mod.id === selectedNodeId;
            const isHovered = mod.id === hoveredNodeId;
            const radius = Math.min(26, Math.max(16, 14 + mod.fileCount * 1.5));

            return (
              <g
                key={mod.id}
                onClick={() => onSelectModule(mod.id)}
                onMouseEnter={() => onHoverModule(mod.id)}
                onMouseLeave={() => onHoverModule(null)}
                className="cursor-pointer"
              >
                {mod.isPartOfCycle && (
                  <circle cx={x} cy={y} r={radius + 4} fill="none" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3 2" />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill={isSelected ? '#1D4ED8' : isHovered ? '#3B82F6' : '#2563EB'}
                  stroke="#FFFFFF"
                  strokeWidth="2.5"
                />
                <text x={x} y={y + 4} textAnchor="middle" className="text-[11px] font-bold fill-white pointer-events-none">
                  {mod.fileCount}
                </text>
                <text x={x} y={y + radius + 14} textAnchor="middle" className="text-[10.5px] font-mono font-bold fill-slate-800">
                  {mod.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** Files View Canvas — Layered Hierarchical Layout with Edge Filtering & Cycle Highlights */
function HierarchicalFilesGraphCanvas({
  nodes,
  edges,
  externalImports,
  edgeFilter,
  cycleHighlight,
  selectedNodeId,
  hoveredNodeId,
  zoomLevel,
  panOffset,
  onSelectNode,
  onHoverNode,
}) {
  const width = 740;
  const height = 380;

  const nodePositions = useMemo(() => {
    return computeHierarchicalLayout(nodes, width, height);
  }, [nodes]);

  const activeNodeId = hoveredNodeId || selectedNodeId;

  // Filter Edges
  const visibleEdges = useMemo(() => {
    if (edgeFilter === 'circular') {
      return edges.filter((e) => cycleHighlight.cycleEdgeSet.has(`${e.source}->${e.target}`));
    }
    if (edgeFilter === 'selected' && selectedNodeId) {
      return edges.filter((e) => e.source === selectedNodeId || e.target === selectedNodeId);
    }
    return edges;
  }, [edges, edgeFilter, selectedNodeId, cycleHighlight]);

  return (
    <div className="w-full h-full relative overflow-hidden flex items-center justify-center">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full max-h-[420px]"
      >
        <defs>
          <marker id="fileArrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
          </marker>
          <marker id="fileArrowActive" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563EB" />
          </marker>
          <marker id="cycleArrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#F59E0B" />
          </marker>
        </defs>

        <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`} style={{ transformOrigin: 'center' }}>
          {/* Directed File Edges */}
          {visibleEdges.map((e, idx) => {
            const srcPos = nodePositions.get(e.source);
            const tgtPos = nodePositions.get(e.target);
            if (!srcPos || !tgtPos) return null;

            const isCycleEdge = cycleHighlight.cycleEdgeSet.has(`${e.source}->${e.target}`);
            const isHighlighted = activeNodeId && (e.source === activeNodeId || e.target === activeNodeId);

            return (
              <line
                key={idx}
                x1={srcPos.x}
                y1={srcPos.y}
                x2={tgtPos.x}
                y2={tgtPos.y}
                stroke={isCycleEdge ? '#F59E0B' : isHighlighted ? '#2563EB' : '#CBD5E1'}
                strokeWidth={isCycleEdge ? 3 : isHighlighted ? 2.5 : 1}
                strokeOpacity={isCycleEdge ? 1 : activeNodeId ? (isHighlighted ? 1 : 0.15) : 0.5}
                markerEnd={isCycleEdge ? 'url(#cycleArrow)' : isHighlighted ? 'url(#fileArrowActive)' : 'url(#fileArrow)'}
              />
            );
          })}

          {/* File Nodes */}
          {[...nodePositions.values()].map(({ x, y, node }) => {
            const isSelected = node.id === selectedNodeId;
            const isHovered = node.id === activeNodeId;
            const isCycleNode = cycleHighlight.cycleNodeSet.has(node.id);
            const radius = Math.min(18, Math.max(8, 7 + (node.importCount + node.dependentCount) * 1.2));

            return (
              <g
                key={node.id}
                onClick={() => onSelectNode(node.id)}
                onMouseEnter={() => onHoverNode(node.id)}
                onMouseLeave={() => onHoverNode(null)}
                className="cursor-pointer"
              >
                {(node.isPartOfCycle || isCycleNode) && (
                  <circle
                    cx={x}
                    cy={y}
                    r={radius + 4}
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth={isCycleNode ? '3' : '2'}
                    strokeDasharray={isCycleNode ? 'none' : '3 2'}
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={radius}
                  fill={isCycleNode ? '#D97706' : isSelected ? '#1D4ED8' : isHovered ? '#3B82F6' : '#2563EB'}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  opacity={activeNodeId && !isHovered && !isSelected ? 0.3 : 1}
                />
                {(isHovered || isSelected || isCycleNode || nodes.length < 25) && (
                  <text x={x} y={y + radius + 12} textAnchor="middle" className="text-[10px] font-mono font-semibold fill-slate-800">
                    {node.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

/** Focus Mode Canvas — 1-Hop Direct Dependency Inspection View */
function FocusModeCanvas({ focusGraph, onSelectNode }) {
  if (!focusGraph || !focusGraph.targetNode) {
    return (
      <div className="py-16 flex flex-col items-center justify-center text-center">
        <Target size={24} className="text-slate-300 mb-2" />
        <p className="text-[12.5px] font-semibold text-slate-700 m-0">No file selected to focus</p>
        <p className="text-[11.5px] text-slate-400 m-0 mt-1">
          Select a file from the list or search box to enter Focus Mode.
        </p>
      </div>
    );
  }

  const { targetNode, incomingNodes, outgoingNodes, fileExternals } = focusGraph;

  return (
    <div className="w-full h-full relative overflow-auto p-4 flex flex-col items-center justify-center select-none">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 max-w-2xl w-full">
        {/* Left: Incoming Dependents */}
        <div className="flex flex-col gap-2 min-w-[160px]">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 text-center">
            Imported By ({incomingNodes.length})
          </span>
          {incomingNodes.length === 0 ? (
            <span className="text-[11px] text-slate-400 text-center">None</span>
          ) : (
            incomingNodes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onSelectNode(n.id)}
                className="p-2 rounded-lg bg-white border border-slate-200 text-[11.5px] font-mono font-bold text-slate-800 hover:border-blue-500 shadow-2xs truncate text-left"
              >
                ← {n.name}
              </button>
            ))
          )}
        </div>

        {/* Center: Selected Target Node */}
        <div className="p-4 rounded-xl bg-blue-600 text-white shadow-md flex flex-col items-center text-center max-w-[200px] shrink-0">
          <Target size={20} className="mb-1" />
          <span className="font-mono font-bold text-[13px] break-all">{targetNode.name}</span>
          <span className="text-[10.5px] text-blue-100 mt-1">{targetNode.path}</span>
        </div>

        {/* Right: Outgoing Dependencies & External Packages */}
        <div className="flex flex-col gap-2 min-w-[160px]">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 text-center">
            Imports ({outgoingNodes.length + fileExternals.length})
          </span>
          {outgoingNodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelectNode(n.id)}
              className="p-2 rounded-lg bg-white border border-slate-200 text-[11.5px] font-mono font-bold text-slate-800 hover:border-blue-500 shadow-2xs truncate text-left"
            >
              → {n.name}
            </button>
          ))}
          {fileExternals.map((ext, idx) => (
            <div key={idx} className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-[11px] font-mono text-slate-600 truncate">
              pkg: {ext.packageName}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Node Details Panel Side Card */
function EnhancedNodeDetailsPanel({
  node,
  edges,
  externalImports,
  cycles,
  onSelectRelated,
  onSelectFile,
}) {
  const isModule = node.type === 'module';

  const fileImports = useMemo(() => {
    if (isModule) return [];
    return edges.filter((e) => e.source === node.id).map((e) => e.target);
  }, [node.id, edges, isModule]);

  const fileDependents = useMemo(() => {
    if (isModule) return [];
    return edges.filter((e) => e.target === node.id).map((e) => e.source);
  }, [node.id, edges, isModule]);

  const fileExternals = useMemo(() => {
    if (isModule) return [];
    return externalImports.filter((e) => e.source === node.id);
  }, [node.id, externalImports, isModule]);

  return (
    <div className="flex flex-col gap-3 text-[12px] h-full justify-between">
      <div>
        <div className="flex items-center gap-1.5 mb-1">
          {isModule ? <Folder size={14} className="text-blue-600" /> : <FileCode size={14} className="text-blue-600" />}
          <span className="font-mono text-slate-400 text-[11px] uppercase">
            {isModule ? 'DIRECTORY MODULE' : node.language || 'FILE'}
          </span>
          {node.isPartOfCycle && (
            <span className="ml-auto text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              ⚠️ In Cycle
            </span>
          )}
        </div>
        <h3 className="text-[13.5px] font-bold font-mono text-slate-900 m-0 break-all">{node.path}</h3>

        {/* View Source Code Navigation Button */}
        {onSelectFile && !isModule && (
          <button
            type="button"
            onClick={() => onSelectFile(node.path)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[12px] rounded-lg transition-colors shadow-2xs mt-2"
          >
            <ExternalLink size={13} />
            <span>View Source Code</span>
          </button>
        )}
      </div>

      <div className="space-y-3 border-t border-b border-slate-100 py-3 overflow-y-auto max-h-[260px]">
        {isModule ? (
          <div>
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Module Summary
            </span>
            <div className="space-y-1 font-mono text-[11.5px]">
              <div>Files: {node.fileCount}</div>
              <div>Outgoing Dependencies: {node.importCount}</div>
              <div>Incoming Dependents: {node.dependentCount}</div>
              <div>Total Relationships: {node.totalRelationships}</div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Internal Imports ({fileImports.length})
              </span>
              {fileImports.length === 0 ? (
                <span className="text-slate-400 text-[11px]">No internal imports</span>
              ) : (
                <div className="space-y-1">
                  {fileImports.map((target) => (
                    <button
                      key={target}
                      type="button"
                      onClick={() => onSelectRelated(target)}
                      className="w-full text-left font-mono text-[11.5px] text-blue-600 hover:text-blue-800 hover:underline truncate block"
                    >
                      → {target}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Imported By ({fileDependents.length})
              </span>
              {fileDependents.length === 0 ? (
                <span className="text-slate-400 text-[11px]">No internal dependents</span>
              ) : (
                <div className="space-y-1">
                  {fileDependents.map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => onSelectRelated(src)}
                      className="w-full text-left font-mono text-[11.5px] text-slate-700 hover:text-blue-600 hover:underline truncate block"
                    >
                      ← {src}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {fileExternals.length > 0 && (
              <div>
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  External Packages ({fileExternals.length})
                </span>
                <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                  {fileExternals.map((ext, i) => (
                    <span key={i} className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                      {ext.packageName}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
