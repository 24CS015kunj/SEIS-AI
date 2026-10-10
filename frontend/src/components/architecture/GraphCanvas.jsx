import React, { useRef, useState, useEffect, useMemo } from 'react';
import GraphNode from './GraphNode';
import GraphEdge from './GraphEdge';
import GraphMinimap from './GraphMinimap';
import { recalculateEdgesForMovedNode } from './graphLayoutAlgorithms';

/**
 * GraphCanvas.jsx
 *
 * Obsidian-Inspired Dark Canvas for Software Dependency Exploration.
 * - Background: near-black charcoal (#0B0E14) with subtle muted dot grid
 * - Interactive node dragging with real-time spline edge recalculation
 * - Smooth canvas panning and mouse wheel zooming
 * - Directional curved connectors with dark theme arrow markers
 * - Integrated low-contrast minimap in the bottom-left corner
 */
export default function GraphCanvas({
  layout,
  selectedNodeId,
  hoveredNodeId,
  onSelectNode,
  onHoverNode,
  zoomLevel,
  setZoomLevel,
  panOffset,
  setPanOffset,
  onFitToScreen,
  onCenterSelected,
  onResetZoom,
  onNodeMoved,
}) {
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 900, height: 600 });

  // Canvas Pan State
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const panDistanceRef = useRef(0);
  const panStartPosRef = useRef({ x: 0, y: 0 });

  // Node Drag State
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const dragStartOffsetRef = useRef({ x: 0, y: 0 });

  // Dynamic positions map (allows real-time dragging updates)
  const [dynamicPositions, setDynamicPositions] = useState(() => layout.nodePositions);
  const [dynamicEdges, setDynamicEdges] = useState(() => layout.edgePaths);

  // Sync when layout changes
  useEffect(() => {
    setDynamicPositions(layout.nodePositions);
    setDynamicEdges(layout.edgePaths);
  }, [layout]);

  // Track container dimensions via ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Mouse wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoomLevel((prev) => {
        const next = +(prev * zoomFactor).toFixed(2);
        return Math.min(3.5, Math.max(0.2, next));
      });
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [setZoomLevel]);

  // Canvas Mouse Down (Panning)
  const handleCanvasMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    panDistanceRef.current = 0;
    panStartPosRef.current = { x: e.clientX, y: e.clientY };
  };

  // Node Mouse Down (Node Dragging)
  const handleNodeMouseDown = (nodeId, e) => {
    e.stopPropagation();
    setDraggingNodeId(nodeId);

    const pos = dynamicPositions.get(nodeId);
    if (!pos) return;

    // Record offset between cursor and node center in graph coordinate space
    const graphMouseX = (e.clientX - panOffset.x) / zoomLevel;
    const graphMouseY = (e.clientY - panOffset.y) / zoomLevel;

    dragStartOffsetRef.current = {
      offsetX: graphMouseX - pos.x,
      offsetY: graphMouseY - pos.y,
    };
  };

  // Global Mouse Move (handles either panning or node dragging)
  const handleMouseMove = (e) => {
    if (draggingNodeId) {
      // Reposition dragged node in graph coordinates
      const graphMouseX = (e.clientX - panOffset.x) / zoomLevel;
      const graphMouseY = (e.clientY - panOffset.y) / zoomLevel;

      const newX = Math.round(graphMouseX - dragStartOffsetRef.current.offsetX);
      const newY = Math.round(graphMouseY - dragStartOffsetRef.current.offsetY);

      setDynamicPositions((prev) => {
        const next = new Map(prev);
        const current = next.get(draggingNodeId);
        if (current) {
          next.set(draggingNodeId, { ...current, x: newX, y: newY });
        }
        return next;
      });

      // Recalculate connected edges in real time
      setDynamicEdges((prev) => {
        const rawEdges = prev.map((p) => p.edge);
        return recalculateEdgesForMovedNode(dynamicPositions, rawEdges);
      });
      return;
    }

    if (isPanning) {
      const dx = e.clientX - panStartPosRef.current.x;
      const dy = e.clientY - panStartPosRef.current.y;
      panDistanceRef.current = Math.hypot(dx, dy);
      setPanOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  };

  // Global Mouse Up
  const handleMouseUp = (e) => {
    if (draggingNodeId) {
      onNodeMoved?.(dynamicPositions);
      setDraggingNodeId(null);
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      // Deselect when clicking background without dragging
      if (panDistanceRef.current < 5) {
        if (
          !e.target.closest('[data-node-id]') &&
          !e.target.closest('button') &&
          !e.target.closest('input') &&
          !e.target.closest('select')
        ) {
          onSelectNode?.(null);
        }
      }
    }
  };

  // Relationship set for highlight propagation
  const activeId = hoveredNodeId || selectedNodeId;

  const relationshipSets = useMemo(() => {
    if (!activeId) return { callers: new Set(), dependencies: new Set() };
    const callers = new Set();
    const dependencies = new Set();

    dynamicEdges.forEach((ep) => {
      if (ep.target === activeId) callers.add(ep.source);
      if (ep.source === activeId) dependencies.add(ep.target);
    });

    return { callers, dependencies };
  }, [activeId, dynamicEdges]);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        backgroundColor: '#0B0E14',
        backgroundImage: 'radial-gradient(rgba(36, 43, 56, 0.45) 1px, transparent 1px)',
        backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
        backgroundSize: `${Math.max(14, Math.round(28 * zoomLevel))}px ${Math.max(14, Math.round(28 * zoomLevel))}px`,
      }}
      className={`w-full h-full relative overflow-hidden select-none ${
        draggingNodeId ? 'cursor-grabbing' : isPanning ? 'cursor-grabbing' : 'cursor-grab'
      }`}
    >
      <svg
        viewBox={`0 0 ${containerSize.width} ${containerSize.height}`}
        className="w-full h-full block"
      >
        <defs>
          {/* Subtle Obsidian Neutral Arrow */}
          <marker
            id="arrow-obsidian"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#334155" />
          </marker>

          {/* Incoming Caller Arrow (Sky) */}
          <marker
            id="arrow-incoming"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#38BDF8" />
          </marker>

          {/* Outgoing Dependency Arrow (Electric Blue) */}
          <marker
            id="arrow-outgoing"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#3B82F6" />
          </marker>

          {/* Circular Dependency Warning Arrow (Amber) */}
          <marker
            id="arrow-cycle"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#F59E0B" />
          </marker>
        </defs>

        {/* Scaled & Translated Obsidian Graph Canvas */}
        <g
          transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoomLevel})`}
          style={{ transformOrigin: '0 0' }}
        >
          {/* Background catch-rect to deselect */}
          <rect
            x={-6000}
            y={-6000}
            width={layout.totalWidth + 12000}
            height={layout.totalHeight + 12000}
            fill="transparent"
            onClick={(e) => {
              e.stopPropagation();
              onSelectNode?.(null);
            }}
          />

          {/* 1. Curved Directional Connecting Lines (Edges) */}
          {dynamicEdges.map((ep, idx) => {
            const isOutgoing = activeId && ep.source === activeId;
            const isIncoming = activeId && ep.target === activeId;
            const isDimmed = activeId && !isOutgoing && !isIncoming;

            return (
              <GraphEdge
                key={`${ep.source}->${ep.target}-${idx}`}
                edgePath={ep}
                isIncoming={Boolean(isIncoming)}
                isOutgoing={Boolean(isOutgoing)}
                isCycle={Boolean(ep.isCycle)}
                isDimmed={Boolean(isDimmed)}
              />
            );
          })}

          {/* 2. Circular Nodes */}
          {[...dynamicPositions.values()].map((pos) => {
            const isSelected = pos.id === selectedNodeId;
            const isHovered = pos.id === hoveredNodeId;
            const isCaller = relationshipSets.callers.has(pos.id);
            const isDependency = relationshipSets.dependencies.has(pos.id);
            const isDimmed = activeId && activeId !== pos.id && !isCaller && !isDependency;

            return (
              <GraphNode
                key={pos.id}
                node={pos.node}
                x={pos.x}
                y={pos.y}
                radius={pos.radius}
                isSelected={isSelected}
                isHovered={isHovered}
                isCaller={isCaller}
                isDependency={isDependency}
                isDimmed={Boolean(isDimmed)}
                isCycle={Boolean(pos.node?.isPartOfCycle)}
                onSelect={onSelectNode}
                onHover={onHoverNode}
                onNodeMouseDown={handleNodeMouseDown}
              />
            );
          })}
        </g>
      </svg>

      {/* Low-Contrast Obsidian Minimap in Bottom-Left Corner */}
      <GraphMinimap
        nodePositions={dynamicPositions}
        totalWidth={layout.totalWidth}
        totalHeight={layout.totalHeight}
        containerWidth={containerSize.width}
        containerHeight={containerSize.height}
        panOffset={panOffset}
        zoomLevel={zoomLevel}
        onNavigate={setPanOffset}
        onFitToScreen={onFitToScreen}
        onCenterSelected={onCenterSelected}
        onResetZoom={onResetZoom}
        selectedNodeId={selectedNodeId}
      />
    </div>
  );
}
