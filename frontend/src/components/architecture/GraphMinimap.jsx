import React from 'react';
import { Crosshair, Maximize, RotateCcw } from 'lucide-react';

/**
 * GraphMinimap.jsx
 *
 * Obsidian-Inspired Low-Contrast Minimap in Bottom-Left Corner.
 * - Dark container matching Obsidian palette (#10141D, #242B38 border)
 * - Scaled preview of circular nodes
 * - Active viewport rect
 * - Compact center, fit, and reset controls attached on the right
 */
export default function GraphMinimap({
  nodePositions,
  totalWidth,
  totalHeight,
  containerWidth,
  containerHeight,
  panOffset,
  zoomLevel,
  onNavigate,
  onFitToScreen,
  onCenterSelected,
  onResetZoom,
  selectedNodeId,
}) {
  const minimapWidth = 140;
  const minimapHeight = 90;

  if (totalWidth <= 0 || totalHeight <= 0) return null;

  const scaleX = minimapWidth / totalWidth;
  const scaleY = minimapHeight / totalHeight;
  const scale = Math.min(scaleX, scaleY);

  const contentW = totalWidth * scale;
  const contentH = totalHeight * scale;
  const offsetX = (minimapWidth - contentW) / 2;
  const offsetY = (minimapHeight - contentH) / 2;

  // Viewport rect in minimap coordinates
  const viewportX = offsetX + (-panOffset.x / zoomLevel) * scale;
  const viewportY = offsetY + (-panOffset.y / zoomLevel) * scale;
  const viewportW = (containerWidth / zoomLevel) * scale;
  const viewportH = (containerHeight / zoomLevel) * scale;

  const handleMinimapClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left - offsetX;
    const clickY = e.clientY - rect.top - offsetY;

    const targetGraphX = clickX / scale;
    const targetGraphY = clickY / scale;

    const newPanX = containerWidth / 2 - targetGraphX * zoomLevel;
    const newPanY = containerHeight / 2 - targetGraphY * zoomLevel;

    onNavigate?.({ x: Math.round(newPanX), y: Math.round(newPanY) });
  };

  return (
    <div className="absolute bottom-3 left-3 z-20 flex items-stretch gap-1 select-none font-mono text-[10px]">
      {/* Minimap Box */}
      <div
        className="bg-[#10141D]/90 backdrop-blur-xs border border-[#242B38] rounded overflow-hidden cursor-crosshair relative shadow-lg"
        style={{ width: minimapWidth, height: minimapHeight }}
        onClick={handleMinimapClick}
      >
        <svg
          width={minimapWidth}
          height={minimapHeight}
          className="w-full h-full block"
        >
          <g transform={`translate(${offsetX}, ${offsetY})`}>
            {/* Miniature Circular Node Dots */}
            {[...nodePositions.values()].map((pos) => {
              const isSelected = pos.id === selectedNodeId;
              const miniX = pos.x * scale;
              const miniY = pos.y * scale;

              return (
                <circle
                  key={pos.id}
                  cx={miniX}
                  cy={miniY}
                  r={isSelected ? 3 : 1.75}
                  fill={isSelected ? '#3B82F6' : '#64748B'}
                />
              );
            })}
          </g>

          {/* Viewport Frame */}
          <rect
            x={Math.max(0, Math.min(minimapWidth - 4, viewportX))}
            y={Math.max(0, Math.min(minimapHeight - 4, viewportY))}
            width={Math.max(4, Math.min(minimapWidth, viewportW))}
            height={Math.max(4, Math.min(minimapHeight, viewportH))}
            fill="rgba(59, 130, 246, 0.08)"
            stroke="#3B82F6"
            strokeWidth={1}
            strokeDasharray="2 2"
            pointerEvents="none"
          />
        </svg>
      </div>

      {/* Compact Quick Actions */}
      <div className="flex flex-col justify-between bg-[#10141D]/90 border border-[#242B38] rounded p-0.5 text-[#8995A8]">
        {onFitToScreen && (
          <button
            type="button"
            onClick={onFitToScreen}
            className="p-1 hover:text-[#E2E8F0] hover:bg-[#161D2B] rounded transition-colors cursor-pointer"
            title="Fit to view"
            aria-label="Fit to view"
          >
            <Maximize size={11} />
          </button>
        )}
        {onCenterSelected && (
          <button
            type="button"
            onClick={onCenterSelected}
            className="p-1 hover:text-[#E2E8F0] hover:bg-[#161D2B] rounded transition-colors cursor-pointer"
            title="Center on selection"
            aria-label="Center selection"
          >
            <Crosshair size={11} />
          </button>
        )}
        {onResetZoom && (
          <button
            type="button"
            onClick={onResetZoom}
            className="p-1 hover:text-[#E2E8F0] hover:bg-[#161D2B] rounded transition-colors cursor-pointer"
            title="Reset zoom"
            aria-label="Reset zoom"
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>
    </div>
  );
}
