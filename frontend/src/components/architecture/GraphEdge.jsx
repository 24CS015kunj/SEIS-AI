import React from 'react';

/**
 * GraphEdge.jsx
 *
 * Obsidian-Inspired Directional Connectors for Software Architecture.
 * - Subtle curved connecting lines on near-black canvas
 * - Directional arrowheads matching dark Obsidian palette
 * - Bright blue highlighting for selected node's incoming/outgoing connections
 * - Deep dimming for unrelated edges
 */
export default function GraphEdge({
  edgePath,
  isIncoming,
  isOutgoing,
  isCycle,
  isDimmed,
}) {
  const { d, edge } = edgePath;

  let stroke = '#242B38'; // Dark charcoal edge
  let strokeWidth = 1.2;
  let strokeDasharray = 'none';
  let markerEnd = 'url(#arrow-obsidian)';

  if (isCycle || edge?.isPartOfCycle) {
    stroke = '#F59E0B'; // Amber
    strokeWidth = 1.8;
    strokeDasharray = '4 2';
    markerEnd = 'url(#arrow-cycle)';
  } else if (isIncoming) {
    stroke = '#38BDF8'; // Sky blue
    strokeWidth = 1.75;
    markerEnd = 'url(#arrow-incoming)';
  } else if (isOutgoing) {
    stroke = '#3B82F6'; // Electric blue
    strokeWidth = 1.75;
    markerEnd = 'url(#arrow-outgoing)';
  }

  return (
    <g
      className="transition-opacity duration-100"
      style={{
        opacity: isDimmed ? 0.12 : 1,
      }}
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        markerEnd={markerEnd}
        strokeLinecap="round"
      />
    </g>
  );
}
