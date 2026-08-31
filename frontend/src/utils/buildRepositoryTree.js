/**
 * Builds a real, nested directory tree from a flat list of real file
 * paths (Task 69's Architecture page). Only `type === 'file'` entries
 * from the existing `GET .../branches/:branchId/files` response
 * (Task 58) are used as leaves -- every intermediate directory node is
 * therefore guaranteed to be a real ancestor of at least one real,
 * indexed file, never an empty directory entry GitHub returned but
 * nothing was ever synced under (same "only build from realFiles"
 * choice Task 68's own ArchitectureSection already made for its
 * top-level-only summary; this just extends it to every depth).
 *
 * No relationship/dependency edges are ever attached here -- a tree
 * built from path segments encodes containment ("this file is under
 * this directory"), never an import/dependency relationship, which
 * this codebase has no way to detect (Task 69 §"do not fabricate
 * dependency relationships").
 */
export function buildRepositoryTree(files) {
  const root = { name: '', path: '', type: 'directory', children: new Map() };

  for (const file of files) {
    if (file.type !== 'file') continue;
    const parts = file.path.split('/').filter(Boolean);
    let node = root;
    let currentPath = '';
    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLeaf = index === parts.length - 1;
      if (!node.children.has(part)) {
        node.children.set(part, {
          name: part,
          path: currentPath,
          type: isLeaf ? 'file' : 'directory',
          language: isLeaf ? file.language ?? null : null,
          size: isLeaf ? file.size ?? null : null,
          children: new Map(),
        });
      }
      node = node.children.get(part);
    });
  }

  return root;
}

/** Real, recursive file count under `node` (including `node` itself if
 * it's a file) -- counts only actual leaves this tree was built from. */
export function countFilesUnder(node) {
  if (node.type === 'file') return 1;
  let count = 0;
  for (const child of node.children.values()) count += countFilesUnder(child);
  return count;
}

/** Real per-language file counts under `node`, derived the same way --
 * never a fabricated split, just a tally of the real `language` field
 * already present on every synced file. */
export function languageBreakdownUnder(node) {
  const counts = new Map();
  const walk = (n) => {
    if (n.type === 'file') {
      const lang = n.language || 'Unknown';
      counts.set(lang, (counts.get(lang) || 0) + 1);
      return;
    }
    for (const child of n.children.values()) walk(child);
  };
  walk(node);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([language, count]) => ({ language, count }));
}

/**
 * Resolves a real path (e.g. a Copilot citation's `file_path`) against an
 * already-built tree, walking one path segment at a time -- no separate
 * lookup index, no second tree representation, just a traversal of the
 * exact same `children` Maps `buildRepositoryTree` already produced.
 * Returns `null` when any segment doesn't exist in the currently synced
 * tree (wrong branch, deleted/renamed file, or a malformed path) --
 * callers must treat `null` as "not found here", never fall back to
 * selecting a different node (Task 75 §"invalid file paths must never
 * select another file").
 */
export function findNodeByPath(root, targetPath) {
  if (!targetPath) return null;
  const parts = targetPath.split('/').filter(Boolean);
  let node = root;
  for (const part of parts) {
    if (!node || node.type !== 'directory' || !node.children.has(part)) return null;
    node = node.children.get(part);
  }
  return node && node !== root ? node : null;
}

/** Real, flat list of every file path under `node` -- used for a
 * module-details "contained files" list. */
export function filePathsUnder(node) {
  const paths = [];
  const walk = (n) => {
    if (n.type === 'file') {
      paths.push({ path: n.path, language: n.language, size: n.size });
      return;
    }
    for (const child of n.children.values()) walk(child);
  };
  walk(node);
  return paths.sort((a, b) => a.path.localeCompare(b.path));
}
