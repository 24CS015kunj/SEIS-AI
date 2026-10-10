import React from 'react';

/**
 * GraphNode.jsx
 *
 * Obsidian-Inspired Circular Node for Software Architecture Exploration.
 * - Circular node marker (no cards, boxes, or rectangular containers)
 * - Concentric electric blue halo for selected node
 * - Clear text label displayed directly beside the circular marker
 * - Compact metadata line showing: file count, fan-in, and fan-out
 * - Semantic node colors with muted slate defaults
 * - Supports drag events and accessible focus states
 */

// Helper to determine semantic node colors based on directory or category
function getNodeSemanticColor(node, isSelected, isCaller, isDependency, isCycle) {
  if (isSelected) return '#3B82F6'; // Electric blue
  if (isCycle || node.isPartOfCycle) return '#F59E0B'; // Amber
  if (isCaller) return '#38BDF8'; // Sky blue (caller)
  if (isDependency) return '#818CF8'; // Indigo (dependency)

  const name = (node.name || '').toLowerCase();
  const path = (node.path || '').toLowerCase();

  if (name.includes('route') || path.includes('route')) return '#10B981'; // Emerald
  if (name.includes('controller') || path.includes('controller')) return '#38BDF8'; // Sky
  if (name.includes('model') || name.includes('db') || name.includes('database')) return '#F59E0B'; // Amber
  if (name.includes('service') || name.includes('logic')) return '#6366F1'; // Indigo
  if (name.includes('config') || name.includes('env')) return '#94A3B8'; // Slate
  if (name.includes('util') || name.includes('helper') || name.includes('type')) return '#CBD5E1'; // Light slate

  return '#94A3B8'; // Default slate
}

export default function GraphNode({
  node,
  x,
  y,
  radius = 12,
  isSelected,
  isHovered,
  isCaller,
  isDependency,
  isDimmed,
  isCycle,
  onSelect,
  onHover,
  onNodeMouseDown,
}) {
  const isModule = node.type === 'module';
  const nodeColor = getNodeSemanticColor(node, isSelected, isCaller, isDependency, isCycle);

  const fanIn = node.dependentCount ?? 0;
  const fanOut = node.importCount ?? 0;
  const displayName = isModule ? `${node.name}` : node.name;
  const fileCount = node.fileCount !== undefined ? node.fileCount : 1;

  const handleMouseDown = (e) => {
    e.stopPropagation();
    onNodeMouseDown?.(node.id, e);
  };

  return (
    <g
      data-node-id={node.id}
      transform={`translate(${x}, ${y})`}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(node.id);
      }}
      onMouseEnter={() => onHover?.(node.id)}
      onMouseLeave={() => onHover?.(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onSelect?.(node.id);
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`${displayName}, ${fileCount} files, in: ${fanIn}, out: ${fanOut}`}
      aria-pressed={isSelected}
      className="cursor-pointer focus:outline-none"
      style={{
        opacity: isDimmed ? 0.16 : 1,
        transition: 'opacity 120ms ease',
      }}
    >
      {/* 1. Concentric Selected Ring (Obsidian Halo) */}
      {isSelected && (
        <>
          <circle
            cx={0}
            cy={0}
            r={radius + 7}
            fill="rgba(59, 130, 246, 0.18)"
            stroke="#3B82F6"
            strokeWidth={1.75}
          />
          <circle
            cx={0}
            cy={0}
            r={radius + 12}
            fill="none"
            stroke="rgba(59, 130, 246, 0.35)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        </>
      )}

      {/* 2. Hover Ring */}
      {isHovered && !isSelected && (
        <circle
          cx={0}
          cy={0}
          r={radius + 4}
          fill="rgba(255, 255, 255, 0.08)"
          stroke={nodeColor}
          strokeWidth={1.25}
        />
      )}

      {/* 3. Main Circular Node Marker */}
      <circle
        cx={0}
        cy={0}
        r={radius}
        fill={nodeColor}
        stroke="#0B0E14"
        strokeWidth={2}
      />

      {/* Subtle Inner Highlight Dot */}
      <circle
        cx={0}
        cy={0}
        r={Math.max(3, radius * 0.35)}
        fill="#FFFFFF"
        opacity={isSelected ? 0.9 : 0.25}
        pointerEvents="none"
      />

      {/* 4. Text Label Beside the Node */}
      <g transform={`translate(${radius + 8}, 0)`}>
        {/* Module / File Name */}
        <text
          x={0}
          y={-1}
          className={`font-mono text-[12px] font-semibold select-none pointer-events-none ${
            isSelected
              ? 'fill-blue-400 font-bold'
              : isHovered
              ? 'fill-white'
              : 'fill-slate-200'
          }`}
          style={{ letterSpacing: '-0.01em' }}
        >
          {displayName}
        </text>

        {/* Compact Metadata Subtitle */}
        <text
          x={0}
          y={13}
          className="font-mono text-[9.5px] select-none pointer-events-none fill-slate-400"
        >
          {fileCount} {fileCount === 1 ? 'file' : 'files'} · in {fanIn} / out {fanOut}
        </text>
      </g>
    </g>
  );
}
