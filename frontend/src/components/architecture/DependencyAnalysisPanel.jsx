import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { aggregateModulesFromGraph } from '../../utils/moduleGraphAnalytics';
import { computeObsidianForceLayout } from './graphLayoutAlgorithms';
import GraphToolbar from './GraphToolbar';
import GraphSidebar from './GraphSidebar';
import GraphCanvas from './GraphCanvas';
import GraphDetailsPanel from './GraphDetailsPanel';

/**
 * DependencyAnalysisPanel.jsx
 *
 * Obsidian-Inspired Code Intelligence Dependency Graph.
 * - Spacious near-black canvas (#0B0E14) with circular nodes and thin directional curves
 * - Three-part developer layout: Top Toolbar, Left Navigation Sidebar, Right Context Inspector
 * - Organic force-directed layout with real-time node dragging and collision avoidance
 * - Functional filters for dependency types and module types with real AST metrics
 * - Accessible keyboard shortcuts (Esc to deselect/exit)
 */
export default function DependencyAnalysisPanel({
  dependencyStatus,
  dependencyData,
  analysisStatus: _analysisStatus,
  analysis: _analysis,
  onRefresh,
  onSelectFile,
}) {
  // Navigation & Scope State
  const [activeNav, setActiveNav] = useState('dependencies');
  const [scope, setScope] = useState('modules'); // 'modules' | 'files'
  const [edgeFilter, setEdgeFilter] = useState('all'); // 'all' | 'internal' | 'cycles'

  // Sidebar Filter Checkboxes
  const [filterImports, setFilterImports] = useState(true);
  const [filterUses, setFilterUses] = useState(true);
  const [filterCyclesOnly, setFilterCyclesOnly] = useState(false);
  const [filterSourceOnly, setFilterSourceOnly] = useState(true);
  const [filterConfig, setFilterConfig] = useState(true);
  const [filterTest, setFilterTest] = useState(false);
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  // Search & Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);

  // Viewport State
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 40, y: 30 });
  const [layoutSeed, setLayoutSeed] = useState(0); // Incremented to trigger re-layout
  const [isFullView, setIsFullView] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(true);

  const containerRef = useRef(null);

  // Raw data from repository AST
  const summary = dependencyData?.summary || null;
  const rawNodes = useMemo(() => dependencyData?.nodes || [], [dependencyData]);
  const rawEdges = useMemo(() => dependencyData?.edges || [], [dependencyData]);
  const cycles = useMemo(() => dependencyData?.cycles || [], [dependencyData]);
  const externalImports = useMemo(() => dependencyData?.externalImports || [], [dependencyData]);

  // Directory / Module Aggregations
  const { moduleNodes, moduleEdges } = useMemo(() => {
    return aggregateModulesFromGraph(rawNodes, rawEdges, externalImports);
  }, [rawNodes, rawEdges, externalImports]);

  // Compute Module Category Counts for the Sidebar
  const moduleCounts = useMemo(() => {
    let sourceCount = 0;
    let configCount = 0;
    let testCount = 0;
    let otherCount = 0;

    const targetList = scope === 'modules' ? moduleNodes : rawNodes;
    targetList.forEach((n) => {
      const p = (n.path || n.name || '').toLowerCase();
      if (p.includes('config') || p.includes('env') || p.includes('setting')) {
        configCount++;
      } else if (p.includes('test') || p.includes('spec') || p.includes('mock') || p.includes('fixture')) {
        testCount++;
      } else if (p.includes('src') || p.includes('app') || p.includes('component') || p.includes('model') || p.includes('route') || p.includes('controller') || p.includes('service') || p.includes('util')) {
        sourceCount++;
      } else {
        otherCount++;
      }
    });

    return {
      sourceCount: Math.max(1, sourceCount),
      configCount,
      testCount,
      otherCount,
    };
  }, [scope, moduleNodes, rawNodes]);

  // Filter Nodes based on Sidebar Module Type Checkboxes
  const filteredNodes = useMemo(() => {
    const list = scope === 'modules' ? moduleNodes : rawNodes;

    return list.filter((n) => {
      const p = (n.path || n.name || '').toLowerCase();
      const isConf = p.includes('config') || p.includes('env') || p.includes('setting');
      const isTest = p.includes('test') || p.includes('spec') || p.includes('mock');

      if (!filterConfig && isConf) return false;
      if (!filterTest && isTest) return false;
      if (!filterSourceOnly && !isConf && !isTest) return false;

      if (showOnlySelected && selectedNodeId) {
        if (n.id === selectedNodeId) return true;
        const isConnected = rawEdges.some(
          (e) => (e.source === selectedNodeId && e.target === n.id) || (e.target === selectedNodeId && e.source === n.id)
        );
        return isConnected;
      }

      return true;
    });
  }, [scope, moduleNodes, rawNodes, filterConfig, filterTest, filterSourceOnly, showOnlySelected, selectedNodeId, rawEdges]);

  // Filter Edges based on Sidebar & Toolbar Filters
  const filteredEdges = useMemo(() => {
    let edges = scope === 'modules' ? moduleEdges : rawEdges;

    if (edgeFilter === 'cycles' || filterCyclesOnly) {
      const cycleSet = new Set();
      cycles.forEach((c) => {
        if (Array.isArray(c.cycle)) {
          for (let i = 0; i < c.cycle.length - 1; i++) {
            cycleSet.add(`${c.cycle[i]}->${c.cycle[i + 1]}`);
          }
        }
      });
      edges = edges.filter((e) => cycleSet.has(`${e.source}->${e.target}`) || e.isPartOfCycle);
    } else if (edgeFilter === 'internal') {
      edges = edges.filter((e) => !e.isExternal);
    }

    // Keep edges only if both source and target exist in filteredNodes
    const nodeSet = new Set(filteredNodes.map((n) => n.id));
    return edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target));
  }, [scope, moduleEdges, rawEdges, edgeFilter, filterCyclesOnly, cycles, filteredNodes]);

  // Force-Directed Graph Layout Simulation
  const layout = useMemo(() => {
    return computeObsidianForceLayout(filteredNodes, filteredEdges, {
      width: 960,
      height: 640,
      iterations: 180,
      repulsionStrength: 17500,
      springLength: scope === 'modules' ? 180 : 150,
      springStrength: 0.038,
      gravityStrength: 0.018,
    });
    // layoutSeed forces re-run when user clicks re-stabilize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredNodes, filteredEdges, scope, layoutSeed]);

  // Selected Node Details Object
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return filteredNodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, filteredNodes]);

  // Search autocomplete results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return filteredNodes.filter(
      (n) => n.name.toLowerCase().includes(q) || (n.path && n.path.toLowerCase().includes(q))
    );
  }, [filteredNodes, searchQuery]);

  // Center on selected node
  const handleCenterOnSelected = useCallback(() => {
    if (!selectedNodeId) return;
    const pos = layout.nodePositions.get(selectedNodeId);
    if (!pos) return;

    const viewportW = containerRef.current?.clientWidth || 900;
    const viewportH = containerRef.current?.clientHeight || 600;

    const targetX = viewportW / 2 - pos.x * zoomLevel;
    const targetY = viewportH / 2 - pos.y * zoomLevel;

    setPanOffset({ x: Math.round(targetX), y: Math.round(targetY) });
  }, [selectedNodeId, layout.nodePositions, zoomLevel]);

  // Fit entire graph to screen
  const handleFitToScreen = useCallback(() => {
    const viewportW = containerRef.current?.clientWidth || 900;
    const viewportH = containerRef.current?.clientHeight || 600;

    const pad = 80;
    const availW = Math.max(100, viewportW - pad * 2);
    const availH = Math.max(100, viewportH - pad * 2);

    const fitScaleX = availW / Math.max(100, layout.totalWidth);
    const fitScaleY = availH / Math.max(100, layout.totalHeight);
    const targetScale = Math.min(1.2, Math.max(0.25, Math.min(fitScaleX, fitScaleY)));

    const centeredX = (viewportW - layout.totalWidth * targetScale) / 2;
    const centeredY = (viewportH - layout.totalHeight * targetScale) / 2;

    setZoomLevel(+targetScale.toFixed(2));
    setPanOffset({
      x: Math.round(centeredX),
      y: Math.round(centeredY),
    });
  }, [layout.totalWidth, layout.totalHeight]);

  // Reset zoom & pan
  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 40, y: 30 });
  }, []);

  // Handle Search Result Selection
  const handleSelectSearchResult = (node) => {
    setSelectedNodeId(node.id);
    setShowDetailsPanel(true);
    setSearchQuery('');
  };

  // Keyboard shortcut listener: Escape to deselect active node or exit full view
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

  // Auto-center when a node is selected from details panel or search
  useEffect(() => {
    if (selectedNodeId) {
      handleCenterOnSelected();
    }
  }, [selectedNodeId, handleCenterOnSelected]);

  return (
    <>
      {/* Obsidian-Inspired Developer Visualization Container */}
      <section
        aria-labelledby="dependency-analysis-heading"
        className="w-full rounded-md border border-[#242B38] bg-[#0B0E14] overflow-hidden flex flex-col font-sans select-none shadow-xl"
        style={{ height: '620px' }}
      >
        {/* 1. Top Toolbar */}
        <GraphToolbar
          projectName="Codebase Graph"
          breadcrumbPath={`project / ${scope === 'modules' ? 'modules' : 'src'}`}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          scope={scope}
          onScopeChange={(newScope) => {
            setScope(newScope);
            setSelectedNodeId(null);
          }}
          edgeFilter={edgeFilter}
          onEdgeFilterChange={setEdgeFilter}
          zoomLevel={zoomLevel}
          onZoomIn={() => setZoomLevel((z) => +(Math.min(3.5, z + 0.15)).toFixed(2))}
          onZoomOut={() => setZoomLevel((z) => +(Math.max(0.2, z - 0.15)).toFixed(2))}
          onResetZoom={handleResetZoom}
          onReLayout={() => {
            if (onRefresh) onRefresh();
            setLayoutSeed((s) => s + 1);
          }}
          isFullView={isFullView}
          onToggleFullView={() => setIsFullView(true)}
          searchResults={searchResults}
          onSelectSearchResult={handleSelectSearchResult}
          cycleCount={cycles.length}
        />

        {/* 2. Main Three-Part Interface */}
        <div className="flex-1 flex overflow-hidden min-h-0 relative">
          {/* Left Navigation & Filter Sidebar */}
          <GraphSidebar
            activeNav={activeNav}
            onNavChange={setActiveNav}
            filterImports={filterImports}
            onToggleFilterImports={setFilterImports}
            filterUses={filterUses}
            onToggleFilterUses={setFilterUses}
            filterCyclesOnly={filterCyclesOnly}
            onToggleFilterCycles={setFilterCyclesOnly}
            filterSourceOnly={filterSourceOnly}
            onToggleFilterSource={setFilterSourceOnly}
            filterConfig={filterConfig}
            onToggleFilterConfig={setFilterConfig}
            filterTest={filterTest}
            onToggleFilterTest={setFilterTest}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            showOnlySelected={showOnlySelected}
            onToggleShowOnlySelected={setShowOnlySelected}
            moduleCount={filteredNodes.length}
            edgeCount={filteredEdges.length}
            importsCount={summary?.totalInternalEdges || rawEdges.length}
            usesCount={summary?.externalPackagesCount || externalImports.length}
            cyclesCount={cycles.length}
            sourceCount={moduleCounts.sourceCount}
            configCount={moduleCounts.configCount}
            testCount={moduleCounts.testCount}
            otherCount={moduleCounts.otherCount}
          />

          {/* Center: Spacious Near-Black Graph Canvas */}
          <div ref={containerRef} className="flex-1 relative h-full w-full overflow-hidden">
            {dependencyStatus === 'loading' ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-[#8995A8]">
                <div className="w-5 h-5 border-2 border-[#242B38] border-t-blue-500 rounded-full animate-spin mb-2" />
                <span className="font-mono text-[11px]">Computing organic dependency layout…</span>
              </div>
            ) : dependencyStatus === 'error' || filteredNodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-[#64748B]">
                <span className="font-mono text-[11.5px] text-[#8995A8] mb-1">
                  No dependency nodes matched active filters.
                </span>
                <span className="text-[10.5px]">Adjust sidebar filters or search term to view nodes.</span>
              </div>
            ) : (
              <GraphCanvas
                layout={layout}
                selectedNodeId={selectedNodeId}
                hoveredNodeId={hoveredNodeId}
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  if (nodeId) setShowDetailsPanel(true);
                }}
                onHoverNode={setHoveredNodeId}
                zoomLevel={zoomLevel}
                setZoomLevel={setZoomLevel}
                panOffset={panOffset}
                setPanOffset={setPanOffset}
                onFitToScreen={handleFitToScreen}
                onCenterSelected={handleCenterOnSelected}
                onResetZoom={handleResetZoom}
              />
            )}
          </div>

          {/* Right: Contextual Module Details Panel */}
          {showDetailsPanel && selectedNode && (
            <div className="w-80 h-full shrink-0">
              <GraphDetailsPanel
                node={selectedNode}
                edges={scope === 'modules' ? moduleEdges : rawEdges}
                allNodes={scope === 'modules' ? moduleNodes : rawNodes}
                cycles={cycles}
                onDeselect={() => setSelectedNodeId(null)}
                onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                onSelectFile={onSelectFile}
              />
            </div>
          )}
        </div>
      </section>

      {/* Full-Screen Edge-to-Edge Studio Workspace */}
      {isFullView && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full Screen Architecture Studio"
          className="fixed inset-0 z-[9999] bg-[#0B0E14] w-screen h-screen flex flex-col select-none overflow-hidden font-sans"
        >
          {/* Studio Header */}
          <GraphToolbar
            projectName="Codebase Graph Studio"
            breadcrumbPath={`project / ${scope === 'modules' ? 'modules' : 'src'}`}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            scope={scope}
            onScopeChange={(newScope) => {
              setScope(newScope);
              setSelectedNodeId(null);
            }}
            edgeFilter={edgeFilter}
            onEdgeFilterChange={setEdgeFilter}
            zoomLevel={zoomLevel}
            onZoomIn={() => setZoomLevel((z) => +(Math.min(3.5, z + 0.15)).toFixed(2))}
            onZoomOut={() => setZoomLevel((z) => +(Math.max(0.2, z - 0.15)).toFixed(2))}
            onResetZoom={handleResetZoom}
            onReLayout={() => {
            if (onRefresh) onRefresh();
            setLayoutSeed((s) => s + 1);
          }}
            isFullView={true}
            onToggleFullView={() => setIsFullView(false)}
            searchResults={searchResults}
            onSelectSearchResult={handleSelectSearchResult}
            cycleCount={cycles.length}
          />

          {/* Studio Body: Left Sidebar + Center Canvas + Right Details */}
          <div className="flex-1 flex overflow-hidden min-h-0 relative">
            <GraphSidebar
              activeNav={activeNav}
              onNavChange={setActiveNav}
              filterImports={filterImports}
              onToggleFilterImports={setFilterImports}
              filterUses={filterUses}
              onToggleFilterUses={setFilterUses}
              filterCyclesOnly={filterCyclesOnly}
              onToggleFilterCycles={setFilterCyclesOnly}
              filterSourceOnly={filterSourceOnly}
              onToggleFilterSource={setFilterSourceOnly}
              filterConfig={filterConfig}
              onToggleFilterConfig={setFilterConfig}
              filterTest={filterTest}
              onToggleFilterTest={setFilterTest}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              showOnlySelected={showOnlySelected}
              onToggleShowOnlySelected={setShowOnlySelected}
              moduleCount={filteredNodes.length}
              edgeCount={filteredEdges.length}
              importsCount={summary?.totalInternalEdges || rawEdges.length}
              usesCount={summary?.externalPackagesCount || externalImports.length}
              cyclesCount={cycles.length}
              sourceCount={moduleCounts.sourceCount}
              configCount={moduleCounts.configCount}
              testCount={moduleCounts.testCount}
              otherCount={moduleCounts.otherCount}
            />

            <div className="flex-1 relative h-full w-full overflow-hidden">
              <GraphCanvas
                layout={layout}
                selectedNodeId={selectedNodeId}
                hoveredNodeId={hoveredNodeId}
                onSelectNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  if (nodeId) setShowDetailsPanel(true);
                }}
                onHoverNode={setHoveredNodeId}
                zoomLevel={zoomLevel}
                setZoomLevel={setZoomLevel}
                panOffset={panOffset}
                setPanOffset={setPanOffset}
                onFitToScreen={handleFitToScreen}
                onCenterSelected={handleCenterOnSelected}
                onResetZoom={handleResetZoom}
              />
            </div>

            {showDetailsPanel && selectedNode && (
              <div className="w-80 h-full shrink-0">
                <GraphDetailsPanel
                  node={selectedNode}
                  edges={scope === 'modules' ? moduleEdges : rawEdges}
                  allNodes={scope === 'modules' ? moduleNodes : rawNodes}
                  cycles={cycles}
                  onDeselect={() => setSelectedNodeId(null)}
                  onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                  onSelectFile={onSelectFile}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
