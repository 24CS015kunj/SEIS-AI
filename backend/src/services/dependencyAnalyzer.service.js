import path from "path";

/**
 * Dependency Analyzer Service (Task: REAL Dependency Graph Analysis).
 * Parses actual repository source file contents (JS, JSX, TS, TSX, Python, CSS),
 * resolves relative imports, filters external packages, detects directed cycles,
 * and builds a deterministic dependency graph model.
 * Zero mock or fake data.
 */

// Common external libraries and built-in modules to filter from internal nodes
const EXTERNAL_PACKAGE_PREFIXES = [
    "react", "react-dom", "react-router", "axios", "lucide-react", "express",
    "mongoose", "dotenv", "cors", "helmet", "morgan", "vitest", "jest", "vite",
    "tailwindcss", "postcss", "clsx", "tailwind-merge", "pydantic", "fastapi",
    "uvicorn", "celery", "redis", "chromadb", "pytest", "structlog", "requests",
    "numpy", "pandas", "typing", "asyncio", "os", "sys", "fs", "path", "http",
    "https", "events", "util", "stream", "crypto"
];

const CODE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".py", ".css", ".json"]);

/**
 * Parses raw import/require statements from source file content.
 * @param {string} content - Source file raw text content
 * @param {string} language - Detected file language
 * @returns {Array<{rawImport: string, importType: string, statement: string, lineNumber: number}>}
 */
export function parseImportsFromContent(content, language = "javascript") {
    if (!content || typeof content !== "string") return [];

    const lines = content.split("\n");
    const imports = [];

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("/*")) {
            return;
        }

        const lineNum = index + 1;

        if (language === "python") {
            // Python: `from foo.bar import baz` or `from .foo import bar`
            const fromMatch = trimmed.match(/^from\s+([\w\.\-]+)\s+import\s+/);
            if (fromMatch) {
                imports.push({
                    rawImport: fromMatch[1],
                    importType: "static",
                    statement: trimmed,
                    lineNumber: lineNum,
                });
                return;
            }

            // Python: `import foo` or `import foo.bar`
            const importMatch = trimmed.match(/^import\s+([\w\.\-]+)/);
            if (importMatch) {
                imports.push({
                    rawImport: importMatch[1],
                    importType: "static",
                    statement: trimmed,
                    lineNumber: lineNum,
                });
                return;
            }
        } else if (language === "css") {
            // CSS: `@import 'foo.css'` or `@import url('foo.css')`
            const cssMatch = trimmed.match(/@import\s+(?:url\(['"]?|['"])([^'"\)]+)['"]?\)?/);
            if (cssMatch) {
                imports.push({
                    rawImport: cssMatch[1],
                    importType: "css",
                    statement: trimmed,
                    lineNumber: lineNum,
                });
            }
        } else {
            // JS / JSX / TS / TSX static imports: `import ... from '...'` or `import '...'`
            const staticMatch = trimmed.match(/import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/);
            if (staticMatch) {
                imports.push({
                    rawImport: staticMatch[1],
                    importType: "static",
                    statement: trimmed,
                    lineNumber: lineNum,
                });
                return;
            }

            // Re-exports: `export ... from '...'`
            const exportMatch = trimmed.match(/export\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/);
            if (exportMatch) {
                imports.push({
                    rawImport: exportMatch[1],
                    importType: "re-export",
                    statement: trimmed,
                    lineNumber: lineNum,
                });
                return;
            }

            // CommonJS require: `require('...')`
            const requireMatch = trimmed.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
            if (requireMatch) {
                imports.push({
                    rawImport: requireMatch[1],
                    importType: "require",
                    statement: trimmed,
                    lineNumber: lineNum,
                });
                return;
            }

            // Dynamic import: `import('...')`
            const dynamicMatch = trimmed.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
            if (dynamicMatch) {
                imports.push({
                    rawImport: dynamicMatch[1],
                    importType: "dynamic",
                    statement: trimmed,
                    lineNumber: lineNum,
                });
            }
        }
    });

    return imports;
}

/**
 * Checks if an import string represents an external npm package / stdlib module
 * @param {string} rawImport
 * @returns {boolean}
 */
export function isExternalPackage(rawImport) {
    if (!rawImport) return false;
    if (rawImport.startsWith(".") || rawImport.startsWith("/")) return false;

    const basePackage = rawImport.split("/")[0].toLowerCase();
    if (EXTERNAL_PACKAGE_PREFIXES.includes(basePackage)) return true;
    if (!rawImport.includes(".") && !rawImport.includes("/")) return true;

    return false;
}

/**
 * Resolves a raw import string to a repository-relative file path
 * @param {string} sourcePath - Repository relative path of importing file (e.g. `frontend/src/pages/ArchitecturePage.jsx`)
 * @param {string} rawImport - Raw import string (e.g. `../services/repositoryService`)
 * @param {Set<string>} fileSet - Set of all known file paths in the branch
 * @returns {string|null} Resolved repository-relative file path or null if unresolvable
 */
export function resolveImportPath(sourcePath, rawImport, fileSet) {
    if (!sourcePath || !rawImport || !fileSet) return null;

    if (isExternalPackage(rawImport)) {
        return null; // External package
    }

    const sourceDir = path.dirname(sourcePath);
    let normalizedTarget = null;

    if (rawImport.startsWith(".")) {
        normalizedTarget = path.normalize(path.join(sourceDir, rawImport)).replace(/\\/g, "/");
    } else {
        // Root relative path or module-like path
        normalizedTarget = path.normalize(rawImport).replace(/\\/g, "/");
    }

    // 1. Direct match if extension included
    if (fileSet.has(normalizedTarget)) {
        return normalizedTarget;
    }

    // 2. Try adding file extensions (.js, .jsx, .ts, .tsx, .py, .json, .css)
    const extensionsToTry = [".js", ".jsx", ".ts", ".tsx", ".py", ".json", ".css"];
    for (const ext of extensionsToTry) {
        const candidate = `${normalizedTarget}${ext}`;
        if (fileSet.has(candidate)) {
            return candidate;
        }
    }

    // 3. Try directory index files (index.js, index.jsx, index.ts, index.tsx, __init__.py)
    const indexFiles = ["index.js", "index.jsx", "index.ts", "index.tsx", "__init__.py"];
    for (const indexName of indexFiles) {
        const candidate = `${normalizedTarget}/${indexName}`;
        if (fileSet.has(candidate)) {
            return candidate;
        }
    }

    return null;
}

/**
 * Tarjan's / DFS Directed Cycle Detection algorithm.
 * Identifies all directed cycles in the graph.
 * @param {Array<{source: string, target: string}>} edges
 * @returns {Array<{length: number, cycle: Array<string>}>}
 */
export function detectCircularDependencies(edges) {
    const adjMap = new Map();
    edges.forEach(({ source, target }) => {
        if (!adjMap.has(source)) adjMap.set(source, new Set());
        adjMap.get(source).add(target);
    });

    const cycles = [];
    const visited = new Set();
    const recStack = new Set();
    const pathStack = [];
    const foundCycleSignatures = new Set();

    function dfs(node) {
        visited.add(node);
        recStack.add(node);
        pathStack.push(node);

        const neighbors = adjMap.get(node) || [];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                dfs(neighbor);
            } else if (recStack.has(neighbor)) {
                // Cycle detected!
                const cycleStartIndex = pathStack.indexOf(neighbor);
                if (cycleStartIndex !== -1) {
                    const cyclePath = pathStack.slice(cycleStartIndex).concat(neighbor);
                    // Deduplicate cycle signature
                    const signature = cyclePath.slice(0, -1).sort().join("->");
                    if (!foundCycleSignatures.has(signature)) {
                        foundCycleSignatures.add(signature);
                        cycles.push({
                            length: cyclePath.length - 1,
                            cycle: cyclePath,
                        });
                    }
                }
            }
        }

        pathStack.pop();
        recStack.delete(node);
    }

    for (const node of adjMap.keys()) {
        if (!visited.has(node)) {
            dfs(node);
        }
    }

    return cycles;
}

/**
 * Builds the complete directed Dependency Graph model from parsed file contents
 * @param {Array<{path: string, language: string, content: string}>} fileContents - List of files with content
 * @param {Array<{path: string, language?: string}>} allBranchFiles - All files in branch
 * @returns {Object} Graph data model containing summary, nodes, edges, cycles, unresolved, and external imports
 */
export function buildDependencyGraph(fileContents = [], allBranchFiles = []) {
    const fileSet = new Set(allBranchFiles.map((f) => f.path));

    const nodesMap = new Map();
    const edges = [];
    const unresolvedImports = [];
    const externalImports = [];
    const edgeSet = new Set();

    // Initialize nodes for all branch files (or code files)
    allBranchFiles.forEach((f) => {
        const ext = path.extname(f.path).toLowerCase();
        if (CODE_EXTENSIONS.has(ext)) {
            const dir = path.dirname(f.path).replace(/\\/g, "/");
            nodesMap.set(f.path, {
                id: f.path,
                path: f.path,
                name: path.basename(f.path),
                directory: dir === "." ? "(root)" : dir,
                language: f.language || ext.replace(".", ""),
                importCount: 0,
                dependentCount: 0,
            });
        }
    });

    let analyzedFilesCount = 0;
    let skippedFilesCount = 0;

    // Parse each file content
    fileContents.forEach(({ path: sourcePath, language, content }) => {
        if (!content || typeof content !== "string") {
            skippedFilesCount += 1;
            return;
        }

        analyzedFilesCount += 1;
        const fileExt = path.extname(sourcePath).toLowerCase();
        const detectedLang = language || (fileExt === ".py" ? "python" : fileExt === ".css" ? "css" : "javascript");
        const parsedImports = parseImportsFromContent(content, detectedLang);

        parsedImports.forEach(({ rawImport, importType, statement, lineNumber }) => {
            if (isExternalPackage(rawImport)) {
                externalImports.push({
                    source: sourcePath,
                    packageName: rawImport,
                    lineNumber,
                });
                return;
            }

            const targetPath = resolveImportPath(sourcePath, rawImport, fileSet);

            if (targetPath && targetPath !== sourcePath) {
                const edgeKey = `${sourcePath}->${targetPath}`;
                if (!edgeSet.has(edgeKey)) {
                    edgeSet.add(edgeKey);
                    edges.push({
                        source: sourcePath,
                        target: targetPath,
                        importType,
                        statement,
                        lineNumber,
                    });

                    // Update import/dependent counts
                    const sourceNode = nodesMap.get(sourcePath);
                    if (sourceNode) sourceNode.importCount += 1;

                    const targetNode = nodesMap.get(targetPath);
                    if (targetNode) targetNode.dependentCount += 1;
                }
            } else if (!targetPath) {
                unresolvedImports.push({
                    source: sourcePath,
                    rawImport,
                    lineNumber,
                });
            }
        });
    });

    // Detect directed circular dependencies
    const cycles = detectCircularDependencies(edges);

    // Identify circular dependency node set
    const circularNodesSet = new Set();
    cycles.forEach((c) => {
        c.cycle.forEach((nodePath) => circularNodesSet.add(nodePath));
    });

    // Annotate nodes with circular dependency flag
    const nodes = [...nodesMap.values()].map((n) => ({
        ...n,
        isPartOfCycle: circularNodesSet.has(n.path),
    }));

    // Filter nodes to keep only those with imports, dependents, or content parsed
    const activeNodes = nodes.filter(
        (n) => n.importCount > 0 || n.dependentCount > 0 || fileContents.some((fc) => fc.path === n.path)
    );

    // Rank most imported and most dependency heavy files
    const mostImported = [...activeNodes]
        .filter((n) => n.dependentCount > 0)
        .sort((a, b) => b.dependentCount - a.dependentCount)
        .slice(0, 5)
        .map((n) => ({ path: n.path, dependentCount: n.dependentCount }));

    const mostDependencyHeavy = [...activeNodes]
        .filter((n) => n.importCount > 0)
        .sort((a, b) => b.importCount - a.importCount)
        .slice(0, 5)
        .map((n) => ({ path: n.path, importCount: n.importCount }));

    return {
        summary: {
            totalFiles: allBranchFiles.length,
            analyzedFiles: analyzedFilesCount,
            skippedFiles: skippedFilesCount,
            totalInternalEdges: edges.length,
            unresolvedImportsCount: unresolvedImports.length,
            externalPackagesCount: externalImports.length,
            circularDependenciesCount: cycles.length,
            mostImported,
            mostDependencyHeavy,
        },
        nodes: activeNodes,
        edges,
        unresolvedImports,
        externalImports,
        cycles,
    };
}
