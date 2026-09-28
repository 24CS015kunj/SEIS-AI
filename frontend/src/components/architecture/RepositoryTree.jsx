import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, File, Folder, FolderOpen as FolderOpenIcon } from 'lucide-react';
import { countFilesUnder } from '../../utils/buildRepositoryTree';

/**
 * Every proper ancestor directory path of `path` -- e.g.
 * `"backend/services/maze.py"` -> `{"backend", "backend/services"}`.
 * Used to auto-expand the directories leading to a programmatically
 * selected node (Task 75: a Copilot citation deep-link resolves to a
 * node that may be several levels deep, and deeper levels start
 * collapsed by default) without touching any node the user hasn't
 * navigated near.
 */
function ancestorPathsOf(path) {
  if (!path) return new Set();
  const parts = path.split('/').filter(Boolean);
  const ancestors = new Set();
  let current = '';
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    ancestors.add(current);
  }
  return ancestors;
}

/**
 * Real, expandable directory/file tree (Task 69) -- every node comes
 * from `buildRepositoryTree`'s traversal of the real
 * `GET .../branches/:branchId/files` response, never a hardcoded
 * structure. Top-level directories start expanded (so the page is never
 * visually empty on first load); deeper levels start collapsed, matching
 * common file-explorer conventions -- except along the path to whichever
 * node `selectedPath` currently names, which auto-expands so a deep-link
 * (Task 75) or any other programmatic selection is actually visible
 * without the user manually opening every parent folder first.
 */
export default function RepositoryTree({ root, selectedPath, onSelect }) {
  const topLevel = [...root.children.values()].sort(sortDirsFirst);
  const autoExpandPaths = useMemo(() => ancestorPathsOf(selectedPath), [selectedPath]);

  if (topLevel.length === 0) {
    return <p className="text-[13px] text-slate-500 m-0">No files found for this branch.</p>;
  }

  return (
    <ul className="flex flex-col gap-0.5 max-h-[520px] overflow-y-auto pr-1" role="tree" aria-label="Repository structure">
      {topLevel.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          depth={0}
          defaultExpanded
          autoExpandPaths={autoExpandPaths}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}

function sortDirsFirst(a, b) {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function TreeNode({ node, depth, defaultExpanded = false, autoExpandPaths, selectedPath, onSelect }) {
  const [expanded, setExpanded] = useState(defaultExpanded || autoExpandPaths?.has(node.path));
  const isDirectory = node.type === 'directory';

  // Re-expands this directory whenever it becomes an ancestor of a newly
  // (re-)selected path -- e.g. clicking a second Copilot citation while
  // Architecture is already open, which updates `selectedPath` without
  // remounting this already-mounted tree.
  useEffect(() => {
    if (autoExpandPaths?.has(node.path)) setExpanded(true);
  }, [autoExpandPaths, node.path]);
  const isSelected = node.path === selectedPath;
  const children = isDirectory ? [...node.children.values()].sort(sortDirsFirst) : [];

  return (
    <li role="treeitem" aria-expanded={isDirectory ? expanded : undefined}>
      <button
        type="button"
        onClick={() => {
          if (isDirectory) setExpanded((e) => !e);
          onSelect(node);
        }}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className={`w-full flex items-center gap-1.5 py-1.5 pr-2 border-l-2 text-left transition-colors ${
          isSelected
            ? 'bg-blue-50 border-blue-600 text-blue-700 font-semibold'
            : 'border-transparent text-slate-600 hover:bg-slate-50'
        }`}
      >
        {isDirectory ? (
          <ChevronRight
            size={12}
            className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
        ) : (
          <span className="w-3 shrink-0" aria-hidden="true" />
        )}
        {isDirectory ? (
          expanded ? (
            <FolderOpenIcon size={13} className="text-blue-500 shrink-0" aria-hidden="true" />
          ) : (
            <Folder size={13} className="text-slate-400 shrink-0" aria-hidden="true" />
          )
        ) : (
          <File size={13} className="text-slate-400 shrink-0" aria-hidden="true" />
        )}
        <span className="text-[12.5px] font-mono truncate">{node.name}</span>
        {isDirectory && (
          <span className="ml-auto text-[10.5px] font-mono text-slate-400 shrink-0">{countFilesUnder(node)}</span>
        )}
      </button>

      {isDirectory && expanded && children.length > 0 && (
        <ul role="group">
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              autoExpandPaths={autoExpandPaths}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
