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
