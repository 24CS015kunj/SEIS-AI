import React, { useMemo } from 'react';
import { Boxes, CheckCircle2 } from 'lucide-react';

const RISK_DOT = { low: 'bg-emerald-400', moderate: 'bg-amber-400', elevated: 'bg-rose-400' };
const RISK_LABEL = { low: 'Low risk', moderate: 'Moderate risk', elevated: 'Elevated risk' };

const COLUMN_WIDTH = 176;
const NODE_WIDTH = 148;
const NODE_HEIGHT = 52;
const ROW_GAP = 22;
const TOP_PADDING = 28;

/**
 * Fixes the Figma audit's "architecture diagram clipping" finding: the SVG
 * canvas is sized to fit every node (never cropped) and lives inside an
 * `overflow-x-auto` track, so on narrow viewports it becomes horizontally
 * scrollable instead of cutting nodes off. The module list underneath
 * repeats the same information in a format that never requires scrolling
 * at all, so nothing is locked behind the diagram alone.
 */
export default function ArchitectureSection({ architecture }) {
  const { positioned, width, height } = useMemo(() => layoutGraph(architecture), [architecture]);

  return (
    <section id="architecture" className="scroll-mt-20">
      <div className="flex items-center gap-2 mb-3">
        <Boxes size={15} className="text-blue-400" aria-hidden="true" />
        <h2 className="text-[13.5px] font-bold text-slate-100">Architecture</h2>
      </div>

      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-4">
        <div className="overflow-x-auto -mx-1 px-1">
          <svg width={width} height={height} className="block" role="img" aria-label="Module dependency diagram, layered by architectural layer">
            {architecture.relationships.map((rel) => {
              const from = positioned.find((n) => n.id === rel.from);
              const to = positioned.find((n) => n.id === rel.to);
              if (!from || !to) return null;
              return (
                <line
                  key={`${rel.from}-${rel.to}`}
                  x1={from.cx + NODE_WIDTH / 2}
                  y1={from.cy}
                  x2={to.cx - NODE_WIDTH / 2}
                  y2={to.cy}
                  stroke="#334155"
                  strokeWidth={1.5}
                />
              );
            })}
            {positioned.map((node) => (
              <foreignObject
                key={node.id}
                x={node.cx - NODE_WIDTH / 2}
                y={node.cy - NODE_HEIGHT / 2}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
              >
                <div className="w-full h-full rounded-lg bg-[#0B1220] border border-[#1E293B] px-3 py-1.5 flex flex-col justify-center">
                  <span className="text-[11.5px] font-mono font-semibold text-slate-100 truncate">{node.name}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOT[node.risk]}`} aria-hidden="true" />
                    {node.files} files
                  </span>
                </div>
              </foreignObject>
            ))}
          </svg>
        </div>

        <div className="flex items-center gap-1.5 text-[12px] font-mono text-emerald-400 mt-3 pt-3 border-t border-[#1E293B]">
          <CheckCircle2 size={13} aria-hidden="true" />
          {architecture.circularDependencies} circular dependencies detected across {architecture.nodes.length} modules
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-3">
        {architecture.nodes.map((node) => (
          <li key={node.id} className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-3.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[12.5px] font-mono font-semibold text-slate-100 truncate">{node.name}</span>
              <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-400 shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${RISK_DOT[node.risk]}`} aria-hidden="true" />
                <span className="sr-only">{RISK_LABEL[node.risk]}</span>
                {RISK_LABEL[node.risk]}
              </span>
            </div>
            <div className="flex gap-3 text-[11px] font-mono text-slate-500">
              <span>{node.files} files</span>
              <span>{node.dependencies} deps</span>
              <span>{node.layer}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function layoutGraph(architecture) {
  const columns = architecture.layers.map((layer) =>
    architecture.nodes.filter((n) => n.layer === layer)
  );
  const maxRows = Math.max(...columns.map((c) => c.length), 1);

  const positioned = [];
  columns.forEach((col, colIndex) => {
    const colHeight = col.length * NODE_HEIGHT + (col.length - 1) * ROW_GAP;
    const totalHeight = maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP;
    const offsetY = TOP_PADDING + (totalHeight - colHeight) / 2;
    col.forEach((node, rowIndex) => {
      positioned.push({
        ...node,
        cx: COLUMN_WIDTH * colIndex + COLUMN_WIDTH / 2,
        cy: offsetY + rowIndex * (NODE_HEIGHT + ROW_GAP) + NODE_HEIGHT / 2,
      });
    });
  });

  return {
    positioned,
    width: COLUMN_WIDTH * columns.length,
    height: TOP_PADDING * 2 + maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP,
  };
}
