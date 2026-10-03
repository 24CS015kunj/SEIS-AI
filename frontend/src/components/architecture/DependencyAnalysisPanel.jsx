import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Eye,
  FileCode,
  Filter,
  Folder,
  GitCommit,
  Layers,
  Maximize2,
  Minimize2,
  Network,
  RotateCcw,
  Search,
  Target,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  aggregateModulesFromGraph,
  computeCycleHighlightMap,
  computeFocusGraph,
  computeHierarchicalLayout,
  computeArchitectureFlowLayout,
  ARCHITECTURAL_TIERS,
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
  const [isFullView, setIsFullView] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  const canvasContainerRef = useRef(null);
  const studioCanvasContainerRef = useRef(null);
  const dragDistanceRef = useRef(0);
  const dragStartPosRef = useRef({ x: 0, y: 0 });

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
    dragDistanceRef.current = 0;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartPosRef.current.x;
    const dy = e.clientY - dragStartPosRef.current.y;
    dragDistanceRef.current = Math.hypot(dx, dy);
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = (e) => {
    setIsDragging(false);
    // If user clicked (did not drag significantly) and target was outside any node card or button, deselect:
    if (dragDistanceRef.current < 5) {
      if (
        !e.target.closest('[data-node-card]') &&
        !e.target.closest('button') &&
        !e.target.closest('input') &&
        !e.target.closest('select')
      ) {
        setSelectedNodeId(null);
      }
    }
  };

  const handleResetCanvas = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
    setSelectedNodeId(null);
    setSelectedCycleIndex(null);
    setEdgeFilter('all');
  }, []);

  const handleFitToView = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleToggleFullView = useCallback(() => {
    setIsFullView((prev) => {
      const next = !prev;
      setTimeout(() => {
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
      }, 50);
      return next;
    });
  }, []);

  // Smooth mouse wheel zoom listener for both normal and studio canvas containers
  useEffect(() => {
    const attachWheel = (el) => {
      if (!el) return null;
      const handleWheel = (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
        setZoomLevel((prev) => {
          const next = +(prev * zoomFactor).toFixed(2);
          return Math.min(3, Math.max(0.3, next));
        });
      };
      el.addEventListener('wheel', handleWheel, { passive: false });
      return () => el.removeEventListener('wheel', handleWheel);
    };

    const cleanupNormal = attachWheel(canvasContainerRef.current);
    const cleanupStudio = attachWheel(studioCanvasContainerRef.current);

    return () => {
      if (cleanupNormal) cleanupNormal();
      if (cleanupStudio) cleanupStudio();
    };
  }, [isFullView]);

  // Keyboard shortcut: Escape to deselect active node or exit full view
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedNodeId) {
          setSelectedNodeId(null);
        } else if (isFullView) {
          setIsFullView(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, isFullView]);

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

  // Shared Canvas Render Helper
  const renderCanvasContent = () => {
    if (viewMode === 'overview') {
      return (
        <OverviewModuleGraphCanvas
          moduleNodes={moduleNodes}
          moduleEdges={moduleEdges}
          selectedNodeId={selectedNodeId}
          hoveredNodeId={hoveredNodeId}
          zoomLevel={zoomLevel}
          panOffset={panOffset}
          onSelectModule={(id) => {
            setSelectedNodeId((prev) => (prev === id ? null : id));
            if (id) setShowSidebar(true);
          }}
          onHoverModule={(id) => setHoveredNodeId(id)}
        />
      );
    }
    if (viewMode === 'files') {
      return (
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
          onSelectNode={(id) => {
            setSelectedNodeId((prev) => (prev === id ? null : id));
            if (id) setShowSidebar(true);
          }}
          onHoverNode={(id) => setHoveredNodeId(id)}
        />
      );
    }
    return (
      <FocusModeCanvas
        focusGraph={focusGraph}
        onSelectNode={(id) => {
          setSelectedNodeId((prev) => (prev === id ? null : id));
          if (id) setShowSidebar(true);
        }}
      />
    );
  };

  // Shared Details Panel Render Helper
  const renderNodeDetails = () => {
    if (!selectedNode) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center py-16">
          <FileCode size={24} className="text-slate-300 mb-2" />
          <p className="text-[12.5px] font-semibold text-slate-700 m-0">No node selected</p>
          <p className="text-[11.5px] text-slate-400 m-0 mt-1">
            Click any module or file node to inspect detailed relationships & source code.
          </p>
        </div>
      );
    }
    return (
      <EnhancedNodeDetailsPanel
        node={selectedNode}
        edges={rawEdges}
        externalImports={externalImports}
        cycles={cycles}
        onDeselect={() => setSelectedNodeId(null)}
        onSelectRelated={(id) => {
          setSelectedNodeId(id);
          setViewMode('focus');
        }}
        onSelectFile={onSelectFile}
      />
    );
  };

  return (
    <>
      {/* Normal In-Page Architecture Panel */}
      <section aria-labelledby="dependency-analysis-heading" className="space-y-4">
        {/* Header & Status Indicator */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <Network size={16} className="text-blue-600 shrink-0" aria-hidden="true" />
            <h2 id="dependency-analysis-heading" className="text-[14px] font-bold text-slate-900 m-0">
              Interactive Architecture & Dependency Graph
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {dependencyStatus === 'ready' && (
              <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Real AST Parsed
              </span>
            )}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Re-analyze dependency graph"
              >
                <RotateCcw size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={handleToggleFullView}
              className="flex items-center gap-1.5 px-3 py-1 text-[12px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer ml-1"
              title="Expand to Full View"
            >
              <Maximize2 size={13} />
              <span>Full View</span>
            </button>
          </div>
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
                      className="text-[11px] font-semibold text-amber-800 underline hover:text-amber-950 cursor-pointer"
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
                        className={`font-mono text-[11px] px-2.5 py-1 rounded-lg border transition-all text-left flex items-center gap-1.5 cursor-pointer ${
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
                  className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors cursor-pointer ${
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
                  className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors cursor-pointer ${
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
                  className={`px-3 py-1 text-[12px] font-semibold rounded-md transition-colors cursor-pointer ${
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
                  className="bg-slate-50 border border-slate-200 rounded-md text-[11.5px] px-2 py-1 font-semibold text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">Show All Edges</option>
                  <option value="internal">Internal Only</option>
                  <option value="selected">Selected Node Only</option>
                  {cycles.length > 0 && <option value="circular">Circular Cycles Only</option>}
                </select>
              </div>

              {/* Search Box with Dropdown */}
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
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
                        className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center justify-between text-[12px] font-mono border-b border-slate-100 last:border-0 cursor-pointer"
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

              {/* Zoom, Fit & Full View Controls */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(0.3, +(z - 0.15).toFixed(2)))}
                  aria-label="Zoom out"
                  title="Zoom out (-)"
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoomLevel(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  title="Reset zoom to 100%"
                  className="text-[11px] font-mono text-slate-600 hover:text-slate-900 px-1 py-1 rounded hover:bg-slate-200/60 w-11 text-center font-semibold transition-colors cursor-pointer"
                >
                  {Math.round(zoomLevel * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(3, +(z + 0.15).toFixed(2)))}
                  aria-label="Zoom in"
                  title="Zoom in (+)"
                  className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleFitToView}
                  title="Fit diagram to view"
                  className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors ml-0.5 cursor-pointer"
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={handleResetCanvas}
                  title="Reset zoom, pan, and selection"
                  className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                >
                  Reset
                </button>
                <div className="w-[1px] h-4 bg-slate-200 mx-1" />
                <button
                  type="button"
                  onClick={handleToggleFullView}
                  title="Expand to Full View"
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors shadow-2xs cursor-pointer bg-slate-100 text-slate-700 hover:text-slate-900 hover:bg-slate-200"
                >
                  <Maximize2 size={13} />
                  <span>Full View</span>
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
                Drag canvas to pan · Scroll to zoom · Click outside to deselect
              </span>
            </div>

            {/* Main Interactive Canvas Area & Side Details */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-stretch">
              <div
                ref={canvasContainerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                  backgroundColor: '#F8FAFC',
                  backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.3) 1.15px, transparent 1.15px)',
                  backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
                  backgroundSize: `${Math.max(12, Math.round(24 * zoomLevel))}px ${Math.max(12, Math.round(24 * zoomLevel))}px`,
                }}
                className={`border border-slate-200 rounded-xl p-4 relative overflow-hidden select-none min-h-[460px] h-[520px] transition-[background-size] duration-75 ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
                {/* In-Canvas Floating Dock for Quick Zoom, Fit & Full View */}
                <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1 bg-white/95 backdrop-blur-xs border border-slate-200/90 rounded-lg p-1 shadow-md font-mono text-[11px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomLevel((z) => Math.min(3, +(z + 0.15).toFixed(2)));
                    }}
                    title="Zoom In (+)"
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                    aria-label="Zoom In"
                  >
                    <ZoomIn size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomLevel(1);
                      setPanOffset({ x: 0, y: 0 });
                    }}
                    title="Reset Zoom to 100%"
                    className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors text-[11px] font-semibold cursor-pointer"
                  >
                    {Math.round(zoomLevel * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setZoomLevel((z) => Math.max(0.3, +(z - 0.15).toFixed(2)));
                    }}
                    title="Zoom Out (-)"
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                    aria-label="Zoom Out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFitToView();
                    }}
                    title="Fit Entire Graph to View"
                    className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                  >
                    Fit
                  </button>
                  <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleFullView();
                    }}
                    title="Expand to Full View"
                    className="p-1.5 rounded text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                    aria-label="Expand to Full View"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>

                {renderCanvasContent()}
              </div>

              {/* Node Details Side Panel */}
              <div className="border border-slate-200 rounded-xl bg-white p-4 flex flex-col gap-3 min-h-[460px] h-[520px] overflow-y-auto">
                {renderNodeDetails()}
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

      {/* Dedicated Edge-to-Edge Architecture Studio (Full Screen View) */}
      {isFullView && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full Screen Architecture Studio"
          className="fixed inset-0 z-[9999] bg-white w-screen h-screen flex flex-col select-none overflow-hidden font-sans"
        >
          {/* Top Studio Header (Clean Light Theme) */}
          <div className="h-13 bg-white border-b border-slate-200/90 px-4 flex items-center justify-between gap-3 shrink-0 z-30 shadow-2xs">
            {/* Left: Branding & High-Level Telemetry */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 font-bold shrink-0">
                  <Network size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-bold text-slate-900 tracking-tight leading-tight">
                    Architecture Studio
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono leading-none">
                    AST Directed Dependency Graph
                  </span>
                </div>
              </div>

              <div className="h-5 w-[1px] bg-slate-200 hidden md:block" />

              <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono">
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80 font-semibold">
                  {summary?.analyzedFiles || summary?.totalFiles || rawNodes.length} files
                </span>
                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200/80 font-semibold">
                  {summary?.totalInternalEdges || rawEdges.length} deps
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80 font-semibold">
                  {moduleNodes.length} modules
                </span>

                {cycles.length > 0 ? (
                  <div className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5 text-[11px]">
                    <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                    <span className="text-amber-900 font-bold">{cycles.length} Cycles:</span>
                    {cycles.map((c, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setSelectedCycleIndex(i);
                          setEdgeFilter('circular');
                          if (c.cycle?.[0]) {
                            setSelectedNodeId(c.cycle[0]);
                            setViewMode('files');
                          }
                        }}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          selectedCycleIndex === i
                            ? 'bg-amber-600 text-white font-bold'
                            : 'text-amber-800 hover:bg-amber-100'
                        }`}
                        title={`Focus Loop ${i + 1}`}
                      >
                        L{i + 1}
                      </button>
                    ))}
                    {selectedCycleIndex !== null && (
                      <button
                        type="button"
                        onClick={() => setSelectedCycleIndex(null)}
                        className="text-amber-700 hover:text-amber-900 text-[10px] ml-0.5 cursor-pointer"
                        title="Clear cycle filter"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Clean DAG
                  </span>
                )}
              </div>
            </div>

            {/* Center: Controls Toolbar */}
            <div className="flex items-center gap-2">
              {/* View Mode Switcher */}
              <div
                role="group"
                aria-label="Studio view modes"
                className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200"
              >
                <button
                  type="button"
                  onClick={() => setViewMode('overview')}
                  className={`px-2.5 py-1 text-[11.5px] rounded font-semibold transition-colors cursor-pointer ${
                    viewMode === 'overview'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('files')}
                  className={`px-2.5 py-1 text-[11.5px] rounded font-semibold transition-colors cursor-pointer ${
                    viewMode === 'files'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Files ({rawNodes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('focus')}
                  className={`px-2.5 py-1 text-[11.5px] rounded font-semibold transition-colors cursor-pointer ${
                    viewMode === 'focus'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  Focus {selectedNode ? `(${selectedNode.name || 'Active'})` : ''}
                </button>
              </div>

              {/* Edge Filter */}
              <div className="hidden sm:flex items-center gap-1 text-[11.5px]">
                <select
                  value={edgeFilter}
                  onChange={(e) => setEdgeFilter(e.target.value)}
                  className="bg-slate-50 text-slate-700 border border-slate-200 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">All Edges</option>
                  <option value="internal">Internal Only</option>
                  <option value="selected">Selected Only</option>
                  {cycles.length > 0 && <option value="circular">Cycles Only</option>}
                </select>
              </div>

              {/* Quick File Search with Autocomplete */}
              <div className="relative w-44 md:w-56 lg:w-64">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Quick find file/path..."
                  value={searchQuery}
                  onFocus={() => setSearchFocused(true)}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchFocused(true);
                  }}
                  className="w-full pl-7 pr-2.5 py-1 text-[11.5px] font-mono bg-slate-50 text-slate-800 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                />

                {searchFocused && searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-40 max-h-60 overflow-y-auto py-1">
                    {searchResults.slice(0, 8).map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => handleSelectSearchResult(node)}
                        className="w-full text-left px-3 py-1.5 hover:bg-blue-50 flex items-center justify-between text-[11.5px] font-mono border-b border-slate-100 last:border-0 cursor-pointer"
                      >
                        <span className="font-semibold text-slate-800 truncate" title={node.path}>
                          {node.path}
                        </span>
                        <span className="text-[10px] text-blue-600 shrink-0 ml-2">Focus →</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Actions, Inspector Toggle & Exit */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleFitToView}
                title="Fit diagram to view"
                className="hidden sm:inline-flex px-2.5 py-1 text-[11.5px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Fit
              </button>
              <button
                type="button"
                onClick={handleResetCanvas}
                title="Reset zoom and offset"
                className="hidden sm:inline-flex px-2.5 py-1 text-[11.5px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Reset
              </button>

              <div className="h-5 w-[1px] bg-slate-200 mx-0.5 hidden sm:block" />

              {/* Toggle Slide-Over Inspector */}
              <button
                type="button"
                onClick={() => setShowSidebar((s) => !s)}
                className={`px-2.5 py-1 text-[11.5px] font-semibold rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
                  showSidebar
                    ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200/80'
                }`}
                title={showSidebar ? 'Collapse Inspector (maximize canvas)' : 'Open Node Inspector'}
              >
                <FileCode size={13} />
                <span>{showSidebar ? 'Hide Details' : 'Inspector'}</span>
                {selectedNode && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />}
              </button>

              {/* Exit Full View */}
              <button
                type="button"
                onClick={() => setIsFullView(false)}
                className="flex items-center gap-1.5 px-3 py-1 text-[11.5px] font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-all shadow-2xs cursor-pointer ml-1"
                title="Exit Full View (Esc)"
              >
                <Minimize2 size={13} />
                <span>Exit (Esc)</span>
              </button>
            </div>
          </div>

          {/* Studio Main Workspace: Max-Height Canvas + Collapsible Inspector */}
          <div className="flex-1 relative flex overflow-hidden min-h-0 bg-[#F8FAFC]">
            {/* Edge-to-Edge Canvas Area with Engineering Dotted Background */}
            <div
              ref={studioCanvasContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                backgroundColor: '#F8FAFC',
                backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.3) 1.15px, transparent 1.15px)',
                backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
                backgroundSize: `${Math.max(12, Math.round(24 * zoomLevel))}px ${Math.max(12, Math.round(24 * zoomLevel))}px`,
              }}
              className={`flex-1 relative h-full w-full overflow-hidden select-none transition-[background-size] duration-75 ${
                isDragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              {/* Floating Active Node Context Bar (Top-Left) */}
              {selectedNode && (
                <div className="absolute top-3 left-3 z-30 flex items-center gap-2.5 bg-white/95 backdrop-blur-md border border-blue-200 rounded-xl px-3 py-2 shadow-md text-[12px] text-slate-800">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span className="font-mono font-bold text-slate-900 max-w-[280px] truncate" title={selectedNode.path || selectedNode.name}>
                    {selectedNode.name || selectedNode.path}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 uppercase font-semibold">
                    {selectedNode.tier || 'file'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(null);
                    }}
                    className="ml-1 text-slate-400 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    title="Deselect Node (Esc)"
                  >
                    <X size={12} />
                    <span>Deselect</span>
                  </button>
                  {!showSidebar && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowSidebar(true);
                      }}
                      className="text-blue-600 hover:text-blue-700 font-semibold text-[11px] underline cursor-pointer ml-1"
                    >
                      Inspect →
                    </button>
                  )}
                </div>
              )}

              {/* Floating Legend Pill (Bottom-Left) */}
              <div className="absolute bottom-4 left-4 z-20 hidden md:flex items-center gap-3.5 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl px-3.5 py-2 shadow-md text-[11px] text-slate-600">
                <span className="font-semibold text-slate-700">Legend:</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> File
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-md bg-indigo-500 inline-block" /> Module
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-amber-600 inline-block" /> Cycle
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-blue-600 inline-block" /> A → B (Import)
                </span>
                <div className="w-[1px] h-3 bg-slate-200 mx-1" />
                <span className="text-slate-400">Scroll: Zoom · Drag: Pan · Esc: Deselect</span>
              </div>

              {/* Floating Studio Zoom Dock (Bottom-Right) */}
              <div className="absolute bottom-4 right-4 z-30 flex items-center gap-1 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl p-1 shadow-md font-mono text-[11px] text-slate-700">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomLevel((z) => Math.min(3, +(z + 0.15).toFixed(2)));
                  }}
                  title="Zoom In (+)"
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                  aria-label="Zoom In"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomLevel(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  title="Reset Zoom to 100%"
                  className="px-2 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors text-[11px] font-semibold cursor-pointer"
                >
                  {Math.round(zoomLevel * 100)}%
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomLevel((z) => Math.max(0.3, +(z - 0.15).toFixed(2)));
                  }}
                  title="Zoom Out (-)"
                  className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                  aria-label="Zoom Out"
                >
                  <ZoomOut size={14} />
                </button>
                <div className="w-[1px] h-4 bg-slate-200 mx-0.5" />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFitToView();
                  }}
                  title="Fit Graph to View"
                  className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                >
                  Fit
                </button>
              </div>

              {/* Actual Diagram Graph */}
              {renderCanvasContent()}
            </div>

            {/* Slide-Over Collapsible Inspector Panel */}
            {showSidebar && (
              <aside
                aria-label="Node Inspector"
                className="w-[360px] xl:w-[400px] h-full bg-white border-l border-slate-200 shadow-xl flex flex-col z-20 shrink-0 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
                  <div className="flex items-center gap-2 text-slate-800 font-bold text-[13px]">
                    <FileCode size={15} className="text-blue-600" />
                    <span>Architecture Inspector</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSidebar(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                    title="Hide Inspector"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  {renderNodeDetails()}
                </div>
              </aside>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Overview Mode Canvas — Rich Tiered Architecture Flow Graph */
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
  const [showIsolated, setShowIsolated] = useState(false);

  // Compute clean, non-overlapping architectural layout
  const layout = useMemo(() => {
    return computeArchitectureFlowLayout(moduleNodes, moduleEdges, { showIsolated });
  }, [moduleNodes, moduleEdges, showIsolated]);

  const {
    nodePositions,
    edgePaths,
    activeTiers,
    connectedCount,
    isolatedCount,
    totalWidth,
    totalHeight,
  } = layout;

  const activeId = hoveredNodeId || selectedNodeId;

  // Active node dependency sets for interactive tracing
  const traceSets = useMemo(() => {
    if (!activeId) return null;
    const callers = new Set();
    const dependencies = new Set();
    moduleEdges.forEach((e) => {
      if (e.target === activeId) callers.add(e.source);
      if (e.source === activeId) dependencies.add(e.target);
    });
    return { callers, dependencies };
  }, [activeId, moduleEdges]);

  const activeNode = activeId ? nodePositions.get(activeId)?.mod : null;

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col select-none">
      {/* Floating Canvas Controls & Mode Toggle */}
      <div className="absolute top-2.5 left-2.5 z-20 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg bg-white/95 border border-slate-200 shadow-xs p-0.5 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setShowIsolated(false)}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              !showIsolated
                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Core Architecture Flow ({connectedCount})
          </button>
          <button
            type="button"
            onClick={() => setShowIsolated(true)}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              showIsolated
                ? 'bg-blue-600 text-white font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Modules ({connectedCount + isolatedCount})
          </button>
        </div>

        {activeNode && (
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900/90 text-white text-[11px] font-mono shadow-xs border border-slate-700">
            <span className="font-bold text-blue-300">{activeNode.name}/</span>
            {traceSets && (
              <>
                <span className="text-emerald-400">← {traceSets.callers.size} callers</span>
                <span className="text-slate-400">·</span>
                <span className="text-indigo-300">→ {traceSets.dependencies.size} deps</span>
              </>
            )}
            {selectedNodeId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectModule(null);
                }}
                className="ml-1 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-sans transition-colors cursor-pointer"
                title="Deselect node (Esc)"
              >
                ✕ Deselect
              </button>
            )}
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        className="w-full h-full"
        style={{ cursor: 'grab' }}
      >
        <defs>
          <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.06" />
          </filter>
          <marker id="flowArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#94A3B8" />
          </marker>
          <marker id="flowArrowOutgoing" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#6366F1" />
          </marker>
          <marker id="flowArrowIncoming" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#10B981" />
          </marker>
          <marker id="flowArrowCycle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#F59E0B" />
          </marker>
        </defs>

        <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`} style={{ transformOrigin: 'center' }}>
          {/* Background click catcher to deselect */}
          <rect
            id="canvas-bg-modules"
            x={-3000}
            y={-3000}
            width={totalWidth + 6000}
            height={totalHeight + 6000}
            fill="transparent"
            onClick={(e) => {
              e.stopPropagation();
              onSelectModule(null);
            }}
          />
          {/* Column Background Tier Banners & Vertical Guidelines */}
          {activeTiers.map((col) => (
            <g key={col.tierId}>
              <line
                x1={col.x + col.width / 2}
                y1={38}
                x2={col.x + col.width / 2}
                y2={totalHeight - 20}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.5"
              />
              <rect
                x={col.x}
                y={12}
                width={col.width}
                height={26}
                rx={6}
                fill={col.tierInfo.bg}
                stroke={col.tierInfo.border}
                strokeWidth="1"
              />
              <text
                x={col.x + col.width / 2}
                y={29}
                textAnchor="middle"
                className="text-[9.5px] font-mono font-bold"
                fill={col.tierInfo.color}
              >
                {col.tierInfo.name.toUpperCase()}
              </text>
            </g>
          ))}

          {/* Smooth Cubic Bezier Edges */}
          {edgePaths.map((item, idx) => {
            const isOutgoing = activeId && item.source === activeId;
            const isIncoming = activeId && item.target === activeId;
            const isDimmed = activeId && !isOutgoing && !isIncoming;
            const isCycle = item.edge.isPartOfCycle;

            let strokeColor = '#94A3B8';
            let strokeWidth = 1.5;
            let marker = 'url(#flowArrow)';

            if (isCycle) {
              strokeColor = '#F59E0B';
              strokeWidth = 2.5;
              marker = 'url(#flowArrowCycle)';
            } else if (isOutgoing) {
              strokeColor = '#6366F1';
              strokeWidth = 2.5;
              marker = 'url(#flowArrowOutgoing)';
            } else if (isIncoming) {
              strokeColor = '#10B981';
              strokeWidth = 2.5;
              marker = 'url(#flowArrowIncoming)';
            }

            return (
              <g key={idx} opacity={isDimmed ? 0.15 : 1} className="transition-opacity duration-150">
                <path
                  d={item.d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isOutgoing || isIncoming ? '5 3' : 'none'}
                  markerEnd={marker}
                />
                {/* Edge weight badge */}
                <g transform={`translate(${item.midX}, ${item.midY})`}>
                  <rect
                    x={-24}
                    y={-9}
                    width={48}
                    height={18}
                    rx={5}
                    fill="#FFFFFF"
                    stroke={isOutgoing ? '#6366F1' : isIncoming ? '#10B981' : '#CBD5E1'}
                    strokeWidth={isOutgoing || isIncoming ? '1.5' : '1'}
                    filter="url(#cardShadow)"
                  />
                  <text
                    x={0}
                    y={3.5}
                    textAnchor="middle"
                    className="text-[9px] font-mono font-bold"
                    fill={isOutgoing ? '#4F46E5' : isIncoming ? '#059669' : '#64748B'}
                  >
                    {item.weight} {item.weight === 1 ? 'dep' : 'deps'}
                  </text>
                </g>
              </g>
            );
          })}

          {/* Module Nodes rendered as Architecture Cards */}
          {[...nodePositions.values()].map(({ x, y, width, height, mod, tier, isIsolated }) => {
            const isSelected = mod.id === selectedNodeId;
            const isHovered = mod.id === hoveredNodeId;
            const isCaller = traceSets?.callers.has(mod.id);
            const isDependency = traceSets?.dependencies.has(mod.id);
            const isDimmed = activeId && activeId !== mod.id && !isCaller && !isDependency;

            let borderColor = isSelected ? '#1D4ED8' : isHovered ? tier.color : '#E2E8F0';
            let borderWidth = isSelected || isHovered ? 2 : 1;
            let bgColor = '#FFFFFF';

            if (isCaller) {
              borderColor = '#10B981';
              borderWidth = 2;
              bgColor = '#F0FDF4';
            } else if (isDependency) {
              borderColor = '#6366F1';
              borderWidth = 2;
              bgColor = '#F5F3FF';
            }

            return (
              <g
                key={mod.id}
                data-node-card="true"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectModule(mod.id);
                }}
                onMouseEnter={() => onHoverModule(mod.id)}
                onMouseLeave={() => onHoverModule(null)}
                className="cursor-pointer"
                opacity={isDimmed ? 0.25 : 1}
              >
                {/* Main Card Shape */}
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  rx={8}
                  fill={bgColor}
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                  filter="url(#cardShadow)"
                />

                {/* Tier Accent Left Edge */}
                <rect
                  x={x}
                  y={y}
                  width={4}
                  height={height}
                  rx={2}
                  fill={tier.color}
                />

                {/* Tier Badge & File Count */}
                <rect
                  x={x + 10}
                  y={y + 8}
                  width={74}
                  height={15}
                  rx={3}
                  fill={tier.bg}
                />
                <text
                  x={x + 14}
                  y={y + 19}
                  className="text-[8.5px] font-mono font-bold"
                  fill={tier.color}
                >
                  {tier.short.toUpperCase()}
                </text>

                <text
                  x={x + width - 10}
                  y={y + 19}
                  textAnchor="end"
                  className="text-[9.5px] font-mono fill-slate-400 font-semibold"
                >
                  {mod.fileCount} {mod.fileCount === 1 ? 'file' : 'files'}
                </text>

                {/* Module Name */}
                <text
                  x={x + 10}
                  y={y + 38}
                  className="text-[12px] font-mono font-bold fill-slate-800"
                >
                  {mod.name}/
                </text>

                {/* Metrics Footer */}
                {!isIsolated ? (
                  <text x={x + 10} y={y + 54} className="text-[9.5px] font-mono">
                    <tspan fill="#4F46E5" fontWeight="600">↑ {mod.importCount} deps</tspan>
                    <tspan fill="#CBD5E1"> · </tspan>
                    <tspan fill="#059669" fontWeight="600">↓ {mod.dependentCount} callers</tspan>
                  </text>
                ) : (
                  <text x={x + 10} y={y + 54} className="text-[9.5px] font-mono fill-slate-400">
                    Standalone module
                  </text>
                )}

                {/* Circular Dependency Badge */}
                {mod.isPartOfCycle && (
                  <g transform={`translate(${x + width - 16}, ${y + 32})`}>
                    <circle cx={4} cy={4} r={6} fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1" />
                    <text x={4} y={7} textAnchor="middle" className="text-[8px] font-bold fill-amber-700">!</text>
                  </g>
                )}
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
        className="w-full h-full"
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
          {/* Background click catcher to deselect */}
          <rect
            id="canvas-bg-files"
            x={-3000}
            y={-3000}
            width={width + 6000}
            height={height + 6000}
            fill="transparent"
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode(null);
            }}
          />
          {/* Directed File Edges with Bezier Curves */}
          {visibleEdges.map((e, idx) => {
            const srcPos = nodePositions.get(e.source);
            const tgtPos = nodePositions.get(e.target);
            if (!srcPos || !tgtPos) return null;

            const isCycleEdge = cycleHighlight.cycleEdgeSet.has(`${e.source}->${e.target}`);
            const isHighlighted = activeNodeId && (e.source === activeNodeId || e.target === activeNodeId);

            const dx = tgtPos.x - srcPos.x;
            const c1x = srcPos.x + Math.max(30, dx * 0.45);
            const c1y = srcPos.y;
            const c2x = tgtPos.x - Math.max(30, dx * 0.45);
            const c2y = tgtPos.y;
            const d = `M ${srcPos.x},${srcPos.y} C ${c1x},${c1y} ${c2x},${c2y} ${tgtPos.x},${tgtPos.y}`;

            return (
              <path
                key={idx}
                d={d}
                fill="none"
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
                data-node-card="true"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectNode(node.id);
                }}
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
                  <g transform={`translate(${x}, ${y + radius + 4})`}>
                    <rect
                      x={-(node.name.length * 3.4 + 4)}
                      y={-1}
                      width={node.name.length * 6.8 + 8}
                      height={14}
                      rx={3}
                      fill="#FFFFFF"
                      fillOpacity={0.92}
                      stroke="#E2E8F0"
                      strokeWidth={0.5}
                    />
                    <text
                      textAnchor="middle"
                      y={10}
                      className="text-[9.5px] font-mono font-semibold fill-slate-800 pointer-events-none"
                    >
                      {node.name}
                    </text>
                  </g>
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
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelectNode(null);
      }}
      className="w-full h-full relative overflow-auto p-4 flex flex-col items-center justify-center select-none"
    >
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
                className="p-2 rounded-lg bg-white border border-slate-200 text-[11.5px] font-mono font-bold text-slate-800 hover:border-blue-500 shadow-2xs truncate text-left cursor-pointer"
              >
                ← {n.name}
              </button>
            ))
          )}
        </div>

        {/* Center: Selected Target Node with Deselect Button */}
        <div className="relative p-4 rounded-xl bg-blue-600 text-white shadow-md flex flex-col items-center text-center max-w-[220px] shrink-0">
          <button
            type="button"
            onClick={() => onSelectNode(null)}
            className="absolute top-2 right-2 p-1 text-blue-200 hover:text-white hover:bg-blue-700/60 rounded-md transition-colors cursor-pointer"
            title="Deselect node (Esc)"
            aria-label="Deselect"
          >
            <X size={14} />
          </button>
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
              className="p-2 rounded-lg bg-white border border-slate-200 text-[11.5px] font-mono font-bold text-slate-800 hover:border-blue-500 shadow-2xs truncate text-left cursor-pointer"
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
  onDeselect,
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
        <div className="flex items-center justify-between gap-1 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            {isModule ? <Folder size={14} className="text-blue-600 shrink-0" /> : <FileCode size={14} className="text-blue-600 shrink-0" />}
            <span className="font-mono text-slate-400 text-[11px] uppercase truncate">
              {isModule ? 'DIRECTORY MODULE' : node.language || 'FILE'}
            </span>
            {node.isPartOfCycle && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 shrink-0">
                ⚠️ In Cycle
              </span>
            )}
          </div>
          {onDeselect && (
            <button
              type="button"
              onClick={onDeselect}
              className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
              title="Deselect node (Esc)"
              aria-label="Deselect node"
            >
              <X size={15} />
            </button>
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
