/**
 * Utility to calculate directory/module aggregations, hierarchical layouts,
 * focus graphs, and circular dependency maps from real dependency data.
 * Zero mock, fake, or random data.
 */

/**
 * Computes directory/module aggregated nodes and edges from file nodes & edges.
 * @param {Array} nodes - File nodes
 * @param {Array} edges - File-level directed edges
 * @param {Array} externalImports - Raw external imports
 * @returns {Object} { moduleNodes, moduleEdges, moduleMap, isolatedCount }
 */
export function aggregateModulesFromGraph(nodes = [], edges = [], externalImports = []) {
  const moduleMap = new Map();

  // Group files into directories
  nodes.forEach((node) => {
    const dir = node.directory || '(root)';
    let mod = moduleMap.get(dir);
    if (!mod) {
      mod = {
        id: dir,
        path: dir,
        name: dir.split('/').pop() || dir,
        type: 'module',
        fileCount: 0,
        files: [],
        importCount: 0,
        dependentCount: 0,
        totalRelationships: 0,
        isPartOfCycle: false,
        mostConnectedFile: null,
        externalPackagesCount: 0,
      };
      moduleMap.set(dir, mod);
    }
    mod.fileCount += 1;
    mod.files.push(node);
    if (node.isPartOfCycle) mod.isPartOfCycle = true;
  });

  // Aggregate file edges into module-to-module edges
  const moduleEdgeMap = new Map();

  edges.forEach((edge) => {
    const sourceDir = pathDirname(edge.source);
    const targetDir = pathDirname(edge.target);

    if (sourceDir !== targetDir) {
      const key = `${sourceDir}->${targetDir}`;
      let mEdge = moduleEdgeMap.get(key);
      if (!mEdge) {
        mEdge = {
          source: sourceDir,
          target: targetDir,
          weight: 0,
          sampleEdges: [],
        };
        moduleEdgeMap.set(key, mEdge);
      }
      mEdge.weight += 1;
      if (mEdge.sampleEdges.length < 5) {
        mEdge.sampleEdges.push(edge);
      }
    }
  });

  const moduleEdges = [...moduleEdgeMap.values()];

  // Calculate importCount and dependentCount for modules
  moduleEdges.forEach((mEdge) => {
    const srcMod = moduleMap.get(mEdge.source);
    if (srcMod) srcMod.importCount += 1;

    const tgtMod = moduleMap.get(mEdge.target);
    if (tgtMod) tgtMod.dependentCount += 1;
  });

  let isolatedCount = 0;

  // Calculate mostConnectedFile and externalPackagesCount per module
  const moduleNodes = [...moduleMap.values()].map((m) => {
    const sortedFiles = [...m.files].sort(
      (a, b) => b.importCount + b.dependentCount - (a.importCount + a.dependentCount)
    );
    const mostConnected = sortedFiles.length > 0 ? sortedFiles[0] : null;

    const modFileSet = new Set(m.files.map((f) => f.id));
    const modExternals = new Set(
      externalImports
        .filter((ext) => modFileSet.has(ext.source))
        .map((ext) => ext.packageName)
    );

    const totalRels = m.importCount + m.dependentCount;
    if (totalRels === 0) isolatedCount += 1;

    return {
      ...m,
      totalRelationships: totalRels,
      mostConnectedFile: mostConnected ? mostConnected.name : 'N/A',
      externalPackagesCount: modExternals.size,
    };
  }).sort((a, b) => b.totalRelationships - a.totalRelationships);

  return {
    moduleNodes,
    moduleEdges,
    moduleMap,
    isolatedCount,
  };
}

/**
 * Architectural Tiers definitions for clear, meaningful system mapping
 */
export const ARCHITECTURAL_TIERS = {
  PRESENTATION: {
    id: 0,
    name: 'Presentation & UI',
    short: 'UI / Client',
    color: '#0284C7', // Sky
    bg: '#F0F9FF',
    border: '#BAE6FD',
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  ROUTING: {
    id: 1,
    name: 'API & Routing',
    short: 'API & Routing',
    color: '#6366F1', // Indigo
    bg: '#EEF2FF',
    border: '#C7D2FE',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  SERVICES: {
    id: 2,
    name: 'Domain & Core Services',
    short: 'Core Logic',
    color: '#10B981', // Emerald
    bg: '#ECFDF5',
    border: '#A7F3D0',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  DATA: {
    id: 3,
    name: 'Data Models & Schemas',
    short: 'Data & Models',
    color: '#8B5CF6', // Purple
    bg: '#F5F3FF',
    border: '#DDD6FE',
    badge: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  INFRA: {
    id: 4,
    name: 'Infrastructure & Utils',
    short: 'Utils & Infra',
    color: '#64748B', // Slate
    bg: '#F8FAFC',
    border: '#CBD5E1',
    badge: 'bg-slate-50 text-slate-700 border-slate-200',
  },
};

/**
 * Categorizes a module directory path into an architectural tier
 */
export function getModuleArchitecturalTier(dirPath = '') {
  const low = dirPath.toLowerCase();
  if (
    low.includes('landing') ||
    low.includes('layout') ||
    low.includes('component') ||
    low.includes('view') ||
    low.includes('page') ||
    low.includes('frontend') ||
    low.includes('ui') ||
    low === 'src'
  ) {
    return ARCHITECTURAL_TIERS.PRESENTATION;
  }
  if (
    low.includes('route') ||
    low.includes('controller') ||
    low.includes('middleware') ||
    low.includes('api') ||
    low.includes('endpoint') ||
    low.includes('handler') ||
    low.includes('v1')
  ) {
    return ARCHITECTURAL_TIERS.ROUTING;
  }
  if (
    low.includes('service') ||
    low.includes('intelligence') ||
    low.includes('evolution') ||
    low.includes('generation') ||
    low.includes('retrieval') ||
    low.includes('processing') ||
    low.includes('domain') ||
    low.includes('core') ||
    low.includes('llm')
  ) {
    return ARCHITECTURAL_TIERS.SERVICES;
  }
  if (
    low.includes('model') ||
    low.includes('schema') ||
    low.includes('db') ||
    low.includes('database') ||
    low.includes('entity') ||
    low.includes('store') ||
    low.includes('vectorstore')
  ) {
    return ARCHITECTURAL_TIERS.DATA;
  }
  return ARCHITECTURAL_TIERS.INFRA;
}

/**
 * Computes an intuitive, structured Architecture Flow Layout:
 * - Separates connected modules from isolated directories
 * - Arranges connected modules into distinct tier columns (Presentation -> Routing -> Services -> Data -> Infra)
 * - Generates smooth cubic Bezier paths avoiding card collision
 * - Provides clean positioning bounds for SVG viewport
 */
export function computeArchitectureFlowLayout(moduleNodes = [], moduleEdges = [], options = {}) {
  const { showIsolated = false } = options;

  const cardW = 186;
  const cardH = 68;
  const colPitch = 275;
  const rowPitch = 88;
  const padX = 40;
  const padY = 56; // Top padding under tier title

  // Enrich modules with their architectural tier
  const enriched = moduleNodes.map((m) => ({
    ...m,
    tier: getModuleArchitecturalTier(m.path || m.id),
  }));

  const connected = enriched.filter((m) => m.totalRelationships > 0);
  const isolated = enriched.filter((m) => m.totalRelationships === 0);

  // Group connected modules by Tier (0 to 4)
  const tierBuckets = [[], [], [], [], []];
  connected.forEach((m) => {
    tierBuckets[m.tier.id].push(m);
  });

  // Determine active columns (tiers with at least 1 module)
  const activeTiers = [];
  tierBuckets.forEach((bucket, tierId) => {
    if (bucket.length > 0) {
      activeTiers.push({
        tierId,
        tierInfo: Object.values(ARCHITECTURAL_TIERS).find((t) => t.id === tierId),
        modules: bucket,
      });
    }
  });

  // Calculate layout coordinates
  const nodePositions = new Map();
  let maxColHeight = 0;

  activeTiers.forEach((colData, colIdx) => {
    const colX = padX + colIdx * colPitch;
    const count = colData.modules.length;
    colData.x = colX;
    colData.width = cardW;

    colData.modules.forEach((mod, rowIdx) => {
      const cardY = padY + rowIdx * rowPitch;
      nodePositions.set(mod.id, {
        x: colX,
        y: cardY,
        width: cardW,
        height: cardH,
        mod,
        tier: mod.tier,
        isIsolated: false,
      });
    });

    const colH = padY + count * rowPitch;
    if (colH > maxColHeight) maxColHeight = colH;
  });

  let totalHeight = Math.max(380, maxColHeight + 20);
  let totalWidth = Math.max(760, padX * 2 + activeTiers.length * colPitch);

  // If showing isolated modules, layout in a neat categorized tray below
  if (showIsolated && isolated.length > 0) {
    const isolatedStartY = totalHeight + 40;
    const isolatedCols = Math.min(5, Math.max(3, Math.floor((totalWidth - padX * 2) / 170)));
    const isoCardW = 160;
    const isoCardH = 46;
    const isoPitchX = (totalWidth - padX * 2) / isolatedCols;
    const isoPitchY = 56;

    isolated.forEach((mod, idx) => {
      const c = idx % isolatedCols;
      const r = Math.floor(idx / isolatedCols);
      const isoX = padX + c * isoPitchX;
      const isoY = isolatedStartY + r * isoPitchY;

      nodePositions.set(mod.id, {
        x: isoX,
        y: isoY,
        width: isoCardW,
        height: isoCardH,
        mod,
        tier: mod.tier,
        isIsolated: true,
      });
    });

    const numRows = Math.ceil(isolated.length / isolatedCols);
    totalHeight = isolatedStartY + numRows * isoPitchY + 30;
  }

  // Pre-calculate smooth cubic Bezier edge curves
  const edgePaths = [];
  moduleEdges.forEach((edge) => {
    const src = nodePositions.get(edge.source);
    const tgt = nodePositions.get(edge.target);
    if (!src || !tgt) return;

    let startX, startY, endX, endY, c1x, c1y, c2x, c2y;

    if (tgt.x > src.x) {
      // Natural forward flow (Left to Right)
      startX = src.x + src.width;
      startY = src.y + src.height / 2;
      endX = tgt.x;
      endY = tgt.y + tgt.height / 2;
      const dx = endX - startX;
      c1x = startX + Math.max(35, dx * 0.45);
      c1y = startY;
      c2x = endX - Math.max(35, dx * 0.45);
      c2y = endY;
    } else if (tgt.x < src.x) {
      // Reverse / Feedback flow
      startX = src.x;
      startY = src.y + src.height / 2;
      endX = tgt.x + tgt.width;
      endY = tgt.y + tgt.height / 2;
      c1x = startX - 50;
      c1y = startY - 35;
      c2x = endX + 50;
      c2y = endY - 35;
    } else {
      // Intra-column connection
      startX = src.x + src.width;
      startY = src.y + src.height / 2;
      endX = tgt.x + tgt.width;
      endY = tgt.y + tgt.height / 2;
      const curveOffset = Math.abs(endY - startY) * 0.4 + 25;
      c1x = startX + curveOffset;
      c1y = startY;
      c2x = endX + curveOffset;
      c2y = endY;
    }

    const d = `M ${startX.toFixed(1)},${startY.toFixed(1)} C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${endX.toFixed(1)},${endY.toFixed(1)}`;
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;

    edgePaths.push({
      edge,
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      d,
      midX,
      midY,
    });
  });

  return {
    nodePositions,
    edgePaths,
    activeTiers,
    connectedCount: connected.length,
    isolatedCount: isolated.length,
    totalWidth,
    totalHeight,
  };
}

/**
 * Extracts directory path from file path
 */
function pathDirname(filePath) {
  if (!filePath) return '(root)';
  const idx = filePath.lastIndexOf('/');
  if (idx === -1) return '(root)';
  return filePath.slice(0, idx);
}

/**
 * Categorizes files into layered architectural tiers for deterministic placement
 * (Layer 0: Entry/Pages/Controllers -> Layer 1: Components/Views -> Layer 2: Services/Hooks -> Layer 3: Utils/Models)
 */
export function getFileArchitecturalTier(filePath = '') {
  const low = filePath.toLowerCase();
  if (low.includes('page') || low.includes('app') || low.includes('index') || low.includes('main') || low.includes('route') || low.includes('controller') || low.includes('server')) {
    return 0; // Layer 0: Entry/Pages/Controllers
  }
  if (low.includes('component') || low.includes('view') || low.includes('panel') || low.includes('drawer') || low.includes('card') || low.includes('modal')) {
    return 1; // Layer 1: Components/Views
  }
  if (low.includes('service') || low.includes('hook') || low.includes('context') || low.includes('api') || low.includes('client') || low.includes('middleware')) {
    return 2; // Layer 2: Services/Hooks
  }
  return 3; // Layer 3: Utils/Models/Helpers
}

/**
 * Calculates deterministic 2D coordinates for layered graph layout
 */
export function computeHierarchicalLayout(nodes = [], width = 740, height = 400) {
  if (!nodes || nodes.length === 0) return new Map();

  // Group nodes into 4 architectural layers
  const layers = [[], [], [], []];
  nodes.forEach((n) => {
    const tier = getFileArchitecturalTier(n.path || n.id);
    layers[tier].push(n);
  });

  const posMap = new Map();
  const marginX = 80;
  const colWidth = (width - marginX * 2) / 3;

  layers.forEach((layerNodes, layerIdx) => {
    const x = marginX + layerIdx * colWidth;
    const count = layerNodes.length;
    layerNodes.forEach((n, idx) => {
      const y = count === 1 ? height / 2 : 45 + (idx / Math.max(1, count - 1)) * (height - 90);
      posMap.set(n.id, { x, y, node: n, layerIdx });
    });
  });

  return posMap;
}

/**
 * Computes direct 1-hop focus graph for a specific target node
 */
export function computeFocusGraph(targetId, nodes = [], edges = [], externalImports = []) {
  const targetNode = nodes.find((n) => n.id === targetId);
  if (!targetNode) return null;

  const incomingEdges = edges.filter((e) => e.target === targetId);
  const outgoingEdges = edges.filter((e) => e.source === targetId);

  const incomingNodeIds = new Set(incomingEdges.map((e) => e.source));
  const outgoingNodeIds = new Set(outgoingEdges.map((e) => e.target));

  const incomingNodes = nodes.filter((n) => incomingNodeIds.has(n.id));
  const outgoingNodes = nodes.filter((n) => outgoingNodeIds.has(n.id));
  const fileExternals = externalImports.filter((e) => e.source === targetId);

  return {
    targetNode,
    incomingEdges,
    outgoingEdges,
    incomingNodes,
    outgoingNodes,
    fileExternals,
    totalDirectRelationships: incomingEdges.length + outgoingEdges.length + fileExternals.length,
  };
}

/**
 * Computes circular dependency highlight maps for a selected cycle.
 */
export function computeCycleHighlightMap(cycle) {
  if (!cycle || !cycle.cycle || cycle.cycle.length === 0) {
    return { cycleNodeSet: new Set(), cycleEdgeSet: new Set() };
  }

  const cycleNodeSet = new Set(cycle.cycle);
  const cycleEdgeSet = new Set();

  for (let i = 0; i < cycle.cycle.length - 1; i++) {
    const src = cycle.cycle[i];
    const tgt = cycle.cycle[i + 1];
    cycleEdgeSet.add(`${src}->${tgt}`);
  }

  return { cycleNodeSet, cycleEdgeSet };
}
