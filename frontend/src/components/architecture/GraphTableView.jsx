import React, { useState, useMemo } from 'react';
import {
  ArrowUpDown,
  ExternalLink,
  Focus,
  Folder,
  FileCode,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

/**
 * GraphTableView.jsx
 *
 * Production-grade tabular view for software dependency audits.
 * - Dense, sortable columns for large repository analysis
 * - Fan-in and Fan-out metrics
 * - Verified violation / cycle alerts
 * - Direct row click selection and graph synchronization
 */
export default function GraphTableView({
  nodes = [],
  selectedNodeId,
  onSelectNode,
  onSelectFile,
  onSwitchToGraph,
  searchQuery = '',
}) {
  const [sortField, setSortField] = useState('fanIn'); // 'name' | 'path' | 'fileCount' | 'fanIn' | 'fanOut'
  const [sortAsc, setSortAsc] = useState(false);

  // Filter and sort nodes
  const processedNodes = useMemo(() => {
    let list = [...nodes];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          (n.path && n.path.toLowerCase().includes(q))
      );
    }

    // Sort
    list.sort((a, b) => {
      let valA, valB;
      switch (sortField) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'path':
          valA = (a.path || a.name).toLowerCase();
          valB = (b.path || b.name).toLowerCase();
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        case 'fileCount':
          valA = a.fileCount ?? 1;
          valB = b.fileCount ?? 1;
          break;
        case 'fanIn':
          valA = a.dependentCount ?? 0;
          valB = b.dependentCount ?? 0;
          break;
        case 'fanOut':
          valA = a.importCount ?? 0;
          valB = b.importCount ?? 0;
          break;
        default:
          valA = a.dependentCount ?? 0;
          valB = b.dependentCount ?? 0;
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    return list;
  }, [nodes, searchQuery, sortField, sortAsc]);

  const handleHeaderClick = (field) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="w-full h-full bg-white border border-slate-200 rounded-md overflow-hidden flex flex-col font-sans select-none">
      {/* Table Header / Subtitle */}
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11.5px] text-slate-600">
        <span className="font-semibold text-slate-800">
          Architecture Directory Inventory ({processedNodes.length} items)
        </span>
        <span className="text-[10.5px] text-slate-500 font-mono">
          Click any row to inspect dependencies · Sort by column
        </span>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-left text-[11.5px]">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-[10.5px] font-mono text-slate-500 uppercase tracking-wider">
            <tr>
              <th
                onClick={() => handleHeaderClick('name')}
                className="py-2 px-3 font-semibold hover:text-slate-800 cursor-pointer"
              >
                <div className="flex items-center gap-1">
                  <span>Module / File</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th
                onClick={() => handleHeaderClick('path')}
                className="py-2 px-3 font-semibold hover:text-slate-800 cursor-pointer hidden md:table-cell"
              >
                <div className="flex items-center gap-1">
                  <span>Relative Path</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th
                onClick={() => handleHeaderClick('fileCount')}
                className="py-2 px-3 font-semibold hover:text-slate-800 cursor-pointer text-right"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Files</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th
                onClick={() => handleHeaderClick('fanIn')}
                className="py-2 px-3 font-semibold hover:text-slate-800 cursor-pointer text-right"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Fan-In (Callers)</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th
                onClick={() => handleHeaderClick('fanOut')}
                className="py-2 px-3 font-semibold hover:text-slate-800 cursor-pointer text-right"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Fan-Out (Deps)</span>
                  <ArrowUpDown size={11} />
                </div>
              </th>
              <th className="py-2 px-3 font-semibold text-center">Status</th>
              <th className="py-2 px-3 font-semibold text-right pr-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {processedNodes.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-400 font-sans text-[12px]">
                  No items matched your query.
                </td>
              </tr>
            ) : (
              processedNodes.map((n) => {
                const isSelected = n.id === selectedNodeId;
                const isModule = n.type === 'module';

                return (
                  <tr
                    key={n.id}
                    onClick={() => onSelectNode?.(n.id)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/80 hover:bg-blue-50'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* Name */}
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isModule ? (
                          <Folder size={12} className="text-slate-400 shrink-0" />
                        ) : (
                          <FileCode size={12} className="text-slate-400 shrink-0" />
                        )}
                        <span
                          className={`truncate font-semibold ${
                            isSelected ? 'text-blue-700' : 'text-slate-900'
                          }`}
                          title={n.name}
                        >
                          {n.name}{isModule ? '/' : ''}
                        </span>
                      </div>
                    </td>

                    {/* Path */}
                    <td className="py-2 px-3 text-slate-500 truncate max-w-xs hidden md:table-cell" title={n.path}>
                      {n.path || n.id}
                    </td>

                    {/* Files Count */}
                    <td className="py-2 px-3 text-right text-slate-600">
                      {n.fileCount !== undefined ? n.fileCount : 1}
                    </td>

                    {/* Fan-In */}
                    <td className="py-2 px-3 text-right font-semibold text-slate-800">
                      {n.dependentCount ?? 0}
                    </td>

                    {/* Fan-Out */}
                    <td className="py-2 px-3 text-right font-semibold text-slate-800">
                      {n.importCount ?? 0}
                    </td>

                    {/* Status */}
                    <td className="py-2 px-3 text-center">
                      {n.isPartOfCycle ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                          <AlertTriangle size={10} className="text-amber-600" />
                          Cycle
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-slate-500 font-normal">
                          <CheckCircle2 size={10} className="text-slate-400" />
                          DAG
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-2 px-3 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5 font-sans">
                        {onSwitchToGraph && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSwitchToGraph(n.id);
                            }}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                            title="View in graph canvas"
                            aria-label="View in graph"
                          >
                            <Focus size={12} />
                          </button>
                        )}
                        {onSelectFile && !isModule && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectFile(n.path);
                            }}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition-colors"
                            title="View source code"
                            aria-label="View source code"
                          >
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
