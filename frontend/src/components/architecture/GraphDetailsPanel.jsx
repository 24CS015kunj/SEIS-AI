import React, { useState, useMemo } from 'react';
import {
  X,
  Copy,
  Check,
  AlertTriangle,
  ArrowRight,
  FileCode,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

/**
 * GraphDetailsPanel.jsx
 *
 * Obsidian-Inspired Contextual Module Details Panel.
 * - Circular node dot header with full module path and copy action
 * - Segmented tabs: Overview, Dependencies, Dependents
 * - Key-value metrics: Files, Lines of Code, Module Type, Fan-in, Fan-out
 * - Interactive Direct Dependencies list with "import →" navigation
 * - Interactive Direct Dependents list with "import →" navigation
 * - Verified circular dependency alerts
 * - Contained file list with source navigation integration
 */
export default function GraphDetailsPanel({
  node,
  edges = [],
  allNodes = [],
  cycles = [],
  onDeselect,
  onSelectNode,
  onSelectFile,
}) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'dependencies' | 'dependents'
  const [copied, setCopied] = useState(false);

  const nodeMap = useMemo(() => {
    const map = new Map();
    allNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [allNodes]);

  // Direct dependencies (outgoing)
  const directDependencies = useMemo(() => {
    if (!node) return [];
    const directTargets = edges.filter((e) => e.source === node.id);
    return directTargets.map((e) => {
      const targetNode = nodeMap.get(e.target);
      return {
        id: e.target,
        name: targetNode?.name || e.target.split('/').pop() || e.target,
        path: targetNode?.path || e.target,
        type: targetNode?.type || 'file',
      };
    });
  }, [node, edges, nodeMap]);

  // Direct dependents (incoming)
  const directDependents = useMemo(() => {
    if (!node) return [];
    const directSources = edges.filter((e) => e.target === node.id);
    return directSources.map((e) => {
      const srcNode = nodeMap.get(e.source);
      return {
        id: e.source,
        name: srcNode?.name || e.source.split('/').pop() || e.source,
        path: srcNode?.path || e.source,
        type: srcNode?.type || 'file',
      };
    });
  }, [node, edges, nodeMap]);

  // Verified cycles this node participates in
  const nodeCycles = useMemo(() => {
    if (!node || !cycles || cycles.length === 0) return [];
    return cycles.filter((c) => {
      if (Array.isArray(c.cycle)) {
        return c.cycle.some((p) => p === node.id || p.startsWith(`${node.id}/`));
      }
      return false;
    });
  }, [node, cycles]);

  const handleCopyPath = () => {
    if (!node?.path) return;
    navigator.clipboard?.writeText(node.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-[#64748B] bg-[#10141D]">
        <div className="w-8 h-8 rounded-full border border-[#242B38] bg-[#0B0E14] flex items-center justify-center text-[#64748B] mb-2">
          ●
        </div>
        <p className="text-[12px] font-semibold text-[#8995A8] m-0">No module selected</p>
        <p className="text-[10.5px] text-[#64748B] m-0 mt-1 max-w-[200px]">
          Click any circular node in the graph to inspect architecture relationships.
        </p>
      </div>
    );
  }

  const isModule = node.type === 'module';
  const containedFiles = isModule && Array.isArray(node.files) ? node.files : [];
  const moduleType = isModule
    ? (node.path?.includes('config') ? 'Config' : node.path?.includes('test') ? 'Test' : 'Source')
    : (node.language || 'Source');

  return (
    <div className="flex flex-col h-full bg-[#10141D] select-none text-[11.5px] font-sans border-l border-[#242B38]">
      {/* 1. Header: Node Marker + Name + Path + Close */}
      <div className="p-3.5 border-b border-[#242B38] bg-[#0E131C] shrink-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            <h3 className="font-mono font-bold text-[13.5px] text-[#E2E8F0] m-0 truncate" title={node.name}>
              {node.name}
            </h3>
          </div>

          <div className="flex items-center gap-1">
            {onDeselect && (
              <button
                type="button"
                onClick={onDeselect}
                className="p-1 text-[#64748B] hover:text-[#E2E8F0] hover:bg-[#161D2B] rounded transition-colors cursor-pointer"
                title="Close panel (Esc)"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Path Subtitle with Copy Button */}
        <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-[#8995A8] mt-0.5">
          <span className="truncate max-w-[220px]" title={node.path || node.id}>
            {node.path || node.id}
          </span>
          <button
            type="button"
            onClick={handleCopyPath}
            className="p-0.5 text-[#64748B] hover:text-[#CBD5E1] transition-colors cursor-pointer"
            title="Copy path"
          >
            {copied ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
          </button>
        </div>

        {/* View Source Code Action (for File nodes) */}
        {!isModule && onSelectFile && (
          <button
            type="button"
            onClick={() => onSelectFile(node.path || node.id)}
            className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-1 px-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            <ExternalLink size={11} />
            <span>Open in Editor</span>
          </button>
        )}
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex items-center border-b border-[#242B38] px-3 bg-[#10141D] text-[11px] shrink-0 font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`py-2 px-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'border-blue-500 text-blue-400 font-semibold'
              : 'border-transparent text-[#8995A8] hover:text-[#CBD5E1]'
          }`}
        >
          Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dependencies')}
          className={`py-2 px-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'dependencies'
              ? 'border-blue-500 text-blue-400 font-semibold'
              : 'border-transparent text-[#8995A8] hover:text-[#CBD5E1]'
          }`}
        >
          Dependencies ({directDependencies.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dependents')}
          className={`py-2 px-2.5 border-b-2 transition-colors cursor-pointer ${
            activeTab === 'dependents'
              ? 'border-blue-500 text-blue-400 font-semibold'
              : 'border-transparent text-[#8995A8] hover:text-[#CBD5E1]'
          }`}
        >
          Dependents ({directDependents.length})
        </button>
      </div>

      {/* 3. Panel Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {/* TAB: OVERVIEW */}
        {activeTab === 'overview' && (
          <>
            {/* Key-Value Metrics */}
            <div className="space-y-1.5 pb-3 border-b border-[#242B38] font-mono text-[11px]">
              <div className="flex items-center justify-between py-0.5">
                <span className="text-[#8995A8]">Files</span>
                <span className="font-semibold text-[#E2E8F0]">{node.fileCount ?? 1}</span>
              </div>

              {node.linesOfCode !== undefined && (
                <div className="flex items-center justify-between py-0.5">
                  <span className="text-[#8995A8]">Lines of code</span>
                  <span className="font-semibold text-[#E2E8F0]">{node.linesOfCode}</span>
                </div>
              )}

              <div className="flex items-center justify-between py-0.5">
                <span className="text-[#8995A8]">Module type</span>
                <span className="font-semibold text-[#E2E8F0]">{moduleType}</span>
              </div>

              <div className="flex items-center justify-between py-0.5">
                <span className="text-[#8995A8]">Fan-in</span>
                <span className="font-semibold text-sky-400">{node.dependentCount ?? directDependents.length}</span>
              </div>

              <div className="flex items-center justify-between py-0.5">
                <span className="text-[#8995A8]">Fan-out</span>
                <span className="font-semibold text-blue-400">{node.importCount ?? directDependencies.length}</span>
              </div>
            </div>

            {/* Direct Dependencies Preview */}
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-2 font-mono">
                Direct dependencies
              </span>
              {directDependencies.length === 0 ? (
                <span className="text-[10.5px] text-[#64748B]">No outgoing dependencies</span>
              ) : (
                <div className="space-y-1">
                  {directDependencies.slice(0, 6).map((dep) => (
                    <button
                      key={dep.id}
                      type="button"
                      onClick={() => onSelectNode?.(dep.id)}
                      className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#161D2B] text-[#CBD5E1] transition-colors cursor-pointer group font-mono text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 group-hover:bg-blue-400" />
                        <span className="truncate group-hover:text-blue-400" title={dep.path}>
                          {dep.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#64748B] group-hover:text-blue-400 flex items-center gap-0.5 font-sans">
                        import →
                      </span>
                    </button>
                  ))}
                  {directDependencies.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('dependencies')}
                      className="text-[10.5px] text-blue-400 hover:text-blue-300 font-mono px-2 py-1"
                    >
                      + {directDependencies.length - 6} more dependencies
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Direct Dependents Preview */}
            <div className="pt-2 border-t border-[#242B38]">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-2 font-mono">
                Direct dependents
              </span>
              {directDependents.length === 0 ? (
                <span className="text-[10.5px] text-[#64748B]">No incoming callers</span>
              ) : (
                <div className="space-y-1">
                  {directDependents.slice(0, 6).map((dep) => (
                    <button
                      key={dep.id}
                      type="button"
                      onClick={() => onSelectNode?.(dep.id)}
                      className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#161D2B] text-[#CBD5E1] transition-colors cursor-pointer group font-mono text-[11px]"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                        <span className="truncate group-hover:text-sky-400" title={dep.path}>
                          {dep.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-[#64748B] group-hover:text-sky-400 flex items-center gap-0.5 font-sans">
                        import →
                      </span>
                    </button>
                  ))}
                  {directDependents.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('dependents')}
                      className="text-[10.5px] text-blue-400 hover:text-blue-300 font-mono px-2 py-1"
                    >
                      + {directDependents.length - 6} more callers
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Circular Dependencies Alert */}
            {nodeCycles.length > 0 && (
              <div className="pt-2 border-t border-[#242B38]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-500 mb-1.5 font-mono">
                  Circular dependencies
                </span>
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle size={12} className="shrink-0" />
                    <span>{nodeCycles.length} circular dependency detected</span>
                  </div>
                  <ChevronRight size={12} />
                </div>
              </div>
            )}

            {/* Contained Files List */}
            {isModule && containedFiles.length > 0 && (
              <div className="pt-2 border-t border-[#242B38]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-2 font-mono">
                  Files ({containedFiles.length})
                </span>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {containedFiles.map((file) => (
                    <button
                      key={file.id || file.path}
                      type="button"
                      onClick={() => onSelectFile?.(file.path || file.id)}
                      className="w-full text-left flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#161D2B] text-[#8995A8] hover:text-[#E2E8F0] transition-colors cursor-pointer font-mono text-[10.5px] group"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileCode size={11} className="text-[#64748B] group-hover:text-blue-400" />
                        <span className="truncate" title={file.path || file.name}>
                          {file.name || file.path}
                        </span>
                      </div>
                      <ChevronRight size={11} className="text-[#64748B] group-hover:text-[#CBD5E1]" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* TAB: DEPENDENCIES */}
        {activeTab === 'dependencies' && (
          <div className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-2 font-mono">
              All Direct Dependencies ({directDependencies.length})
            </span>
            {directDependencies.length === 0 ? (
              <p className="text-[11px] text-[#64748B]">No dependencies</p>
            ) : (
              directDependencies.map((dep) => (
                <button
                  key={dep.id}
                  type="button"
                  onClick={() => onSelectNode?.(dep.id)}
                  className="w-full text-left flex items-center justify-between p-2 rounded hover:bg-[#161D2B] text-[#CBD5E1] transition-colors cursor-pointer group font-mono text-[11px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ArrowRight size={11} className="text-blue-400" />
                    <span className="truncate group-hover:text-blue-400" title={dep.path}>
                      {dep.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#64748B] group-hover:text-blue-400 font-sans">
                    import →
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {/* TAB: DEPENDENTS */}
        {activeTab === 'dependents' && (
          <div className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-[#64748B] mb-2 font-mono">
              All Direct Dependents ({directDependents.length})
            </span>
            {directDependents.length === 0 ? (
              <p className="text-[11px] text-[#64748B]">No dependents</p>
            ) : (
              directDependents.map((dep) => (
                <button
                  key={dep.id}
                  type="button"
                  onClick={() => onSelectNode?.(dep.id)}
                  className="w-full text-left flex items-center justify-between p-2 rounded hover:bg-[#161D2B] text-[#CBD5E1] transition-colors cursor-pointer group font-mono text-[11px]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    <span className="truncate group-hover:text-sky-400" title={dep.path}>
                      {dep.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#64748B] group-hover:text-sky-400 font-sans">
                    import →
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
