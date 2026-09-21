import { describe, it, expect } from "vitest";
import {
    parseImportsFromContent,
    isExternalPackage,
    resolveImportPath,
    detectCircularDependencies,
    buildDependencyGraph,
} from "../../src/services/dependencyAnalyzer.service.js";

describe("Dependency Analyzer Service", () => {
    describe("parseImportsFromContent", () => {
        it("parses JS/JSX static imports, require, dynamic import, and re-exports", () => {
            const code = `
                import React from 'react';
                import { getRepositoryDashboard } from '../services/repositoryService';
                import './styles.css';
                const axios = require('axios');
                const helper = require('./utils/helper');
                export { foo } from './foo';
                const dynamicMod = await import('../dynamic/module');
            `;

            const imports = parseImportsFromContent(code, "javascript");
            const rawImports = imports.map((i) => i.rawImport);

            expect(rawImports).toContain("react");
            expect(rawImports).toContain("../services/repositoryService");
            expect(rawImports).toContain("./styles.css");
            expect(rawImports).toContain("axios");
            expect(rawImports).toContain("./utils/helper");
            expect(rawImports).toContain("./foo");
            expect(rawImports).toContain("../dynamic/module");
        });

        it("parses Python import and from ... import statements", () => {
            const pythonCode = `
                import os
                import sys
                from app.services.repository_service import RepositoryService
                from .models import User
                from ..core import config
            `;

            const imports = parseImportsFromContent(pythonCode, "python");
            const rawImports = imports.map((i) => i.rawImport);

            expect(rawImports).toContain("os");
            expect(rawImports).toContain("sys");
            expect(rawImports).toContain("app.services.repository_service");
            expect(rawImports).toContain(".models");
            expect(rawImports).toContain("..core");
        });
    });

    describe("isExternalPackage", () => {
        it("correctly identifies external packages vs internal relative paths", () => {
            expect(isExternalPackage("react")).toBe(true);
            expect(isExternalPackage("axios")).toBe(true);
            expect(isExternalPackage("express")).toBe(true);
            expect(isExternalPackage("lucide-react")).toBe(true);

            expect(isExternalPackage("./components/Button")).toBe(false);
            expect(isExternalPackage("../services/api")).toBe(false);
            expect(isExternalPackage("../../utils/helper")).toBe(false);
        });
    });

    describe("resolveImportPath", () => {
        const fileSet = new Set([
            "frontend/src/pages/ArchitecturePage.jsx",
            "frontend/src/services/repositoryService.js",
            "frontend/src/components/common/Button.jsx",
            "frontend/src/utils/index.js",
            "backend/src/models/user.model.js",
            "fastapi-ai-service/app/main.py",
            "fastapi-ai-service/app/services/__init__.py",
        ]);

        it("resolves relative paths with extensions", () => {
            const resolved = resolveImportPath(
                "frontend/src/pages/ArchitecturePage.jsx",
                "../services/repositoryService",
                fileSet
            );
            expect(resolved).toBe("frontend/src/services/repositoryService.js");
        });

        it("resolves relative index files", () => {
            const resolved = resolveImportPath(
                "frontend/src/pages/ArchitecturePage.jsx",
                "../utils",
                fileSet
            );
            expect(resolved).toBe("frontend/src/utils/index.js");
        });

        it("returns null for external packages", () => {
            const resolved = resolveImportPath(
                "frontend/src/pages/ArchitecturePage.jsx",
                "react",
                fileSet
            );
            expect(resolved).toBeNull();
        });
    });

    describe("detectCircularDependencies", () => {
        it("detects directed cycles correctly", () => {
            const edges = [
                { source: "A.js", target: "B.js" },
                { source: "B.js", target: "C.js" },
                { source: "C.js", target: "A.js" },
                { source: "C.js", target: "D.js" },
            ];

            const cycles = detectCircularDependencies(edges);
            expect(cycles.length).toBe(1);
            expect(cycles[0].length).toBe(3);
            expect(cycles[0].cycle).toContain("A.js");
            expect(cycles[0].cycle).toContain("B.js");
            expect(cycles[0].cycle).toContain("C.js");
        });

        it("returns empty array when graph has no cycles", () => {
            const edges = [
                { source: "A.js", target: "B.js" },
                { source: "B.js", target: "C.js" },
            ];

            const cycles = detectCircularDependencies(edges);
            expect(cycles.length).toBe(0);
        });
    });

    describe("buildDependencyGraph", () => {
        it("builds a full dependency graph model", () => {
            const allFiles = [
                { path: "src/index.js", language: "javascript" },
                { path: "src/app.js", language: "javascript" },
                { path: "src/utils.js", language: "javascript" },
            ];

            const fileContents = [
                {
                    path: "src/index.js",
                    content: "import { app } from './app';\nimport axios from 'axios';",
                },
                {
                    path: "src/app.js",
                    content: "import { helper } from './utils';",
                },
                {
                    path: "src/utils.js",
                    content: "export const helper = () => {};",
                },
            ];

            const graph = buildDependencyGraph(fileContents, allFiles);

            expect(graph.summary.totalFiles).toBe(3);
            expect(graph.summary.totalInternalEdges).toBe(2);
            expect(graph.summary.externalPackagesCount).toBe(1);
            expect(graph.summary.circularDependenciesCount).toBe(0);

            const indexNode = graph.nodes.find((n) => n.path === "src/index.js");
            expect(indexNode).toBeDefined();
            expect(indexNode.importCount).toBe(1);
        });
    });
});
