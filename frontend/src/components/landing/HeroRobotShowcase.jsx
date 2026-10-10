import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  FileSearch,
  GitBranch,
  Layers3,
  Network,
  Zap,
} from 'lucide-react';
import InteractiveRobot from '../common/InteractiveRobot';

const features = [
  {
    id: 'churn',
    icon: GitBranch,
    label: 'Commit Forensics & Churn',
    quote: 'Analyze commit frequency, author patterns, and changed files across all branches with honest telemetry.',
    side: 'left',
    position: 'lg:col-start-1 lg:row-start-1',
  },
  {
    id: 'dependencies',
    icon: Network,
    label: 'Directed Dependency Maps',
    quote: 'Explore internal module imports, calculate coupling ratios, and identify circular loops with AST precision.',
    side: 'right',
    position: 'lg:col-start-3 lg:row-start-1 lg:justify-self-end',
  },
  {
    id: 'architecture',
    icon: BookOpen,
    label: 'Structural Architecture',
    quote: 'Build mental models of unfamiliar repositories through directory trees and auto-generated architecture briefs.',
    side: 'left',
    position: 'lg:col-start-1 lg:row-start-2',
  },
  {
    id: 'hotspots',
    icon: Activity,
    label: 'Hotspot Detection Formula',
    quote: 'Rank files by Hotspot Risk = Change Frequency x Complexity. Identify files that need refactoring before release.',
    side: 'right',
    position: 'lg:col-start-3 lg:row-start-2 lg:justify-self-end',
  },
  {
    id: 'knowledge',
    icon: Layers3,
    label: 'Vector Knowledge Representation',
    quote: 'Convert source code, headings, and configs into semantic vector embeddings with content-hash deduplication.',
    side: 'left',
    position: 'lg:col-start-1 lg:row-start-3',
  },
  {
    id: 'copilot',
    icon: FileSearch,
    label: 'Grounded AI Copilot',
    quote: 'Ask natural-language questions and receive grounded explanations with direct, clickable file citations.',
    side: 'right',
    position: 'lg:col-start-3 lg:row-start-3 lg:justify-self-end',
  },
];

export default function HeroRobotShowcase() {
  const mapRef = useRef(null);
  const robotRef = useRef(null);
  const featureRefs = useRef({});
  const returnTimerRef = useRef(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const [connectorPoints, setConnectorPoints] = useState(null);
  const [selectedFeature, setSelectedFeature] = useState(null);
  const [typedBrief, setTypedBrief] = useState('');
  const [miniRobotPosition, setMiniRobotPosition] = useState(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const updateMap = () => {
      const mapRect = map.getBoundingClientRect();
      const robotRect = robotRef.current?.getBoundingClientRect();
      if (!robotRect) return;

      const robotPoint = {
        x: robotRect.left + robotRect.width / 2 - mapRect.left,
        y: robotRect.top + robotRect.height / 2 - mapRect.top,
      };
      const featurePoints = {};

      features.forEach(({ id, side }) => {
        const feature = featureRefs.current[id];
        if (!feature) return;
        const rect = feature.getBoundingClientRect();
        featurePoints[id] = {
          x: (side === 'left' ? rect.right : rect.left) - mapRect.left,
          y: rect.top + rect.height / 2 - mapRect.top,
        };
      });

      setMapSize({ width: mapRect.width, height: mapRect.height });
      setConnectorPoints({ robot: robotPoint, features: featurePoints });
    };

    updateMap();
    const observer = new ResizeObserver(updateMap);
    observer.observe(map);
    window.addEventListener('resize', updateMap);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateMap);
      window.clearTimeout(returnTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedFeature) return undefined;

    let characterIndex = 0;
    setTypedBrief('');
    const typingTimer = window.setInterval(() => {
      characterIndex += 1;
      setTypedBrief(selectedFeature.quote.slice(0, characterIndex));
      if (characterIndex >= selectedFeature.quote.length) {
        window.clearInterval(typingTimer);
      }
    }, 28);

    return () => window.clearInterval(typingTimer);
  }, [selectedFeature]);

  const handleFeatureClick = (feature) => {
    const featureElement = featureRefs.current[feature.id];
    const robotElement = robotRef.current;
    const mapElement = mapRef.current;
    if (featureElement && robotElement && mapElement) {
      const mapRect = mapElement.getBoundingClientRect();
      const robotRect = robotElement.getBoundingClientRect();
      const featureRect = featureElement.getBoundingClientRect();
      const startPosition = {
        x: robotRect.left + robotRect.width / 2 - mapRect.left,
        y: robotRect.top + robotRect.height / 2 - mapRect.top,
      };
      const targetPosition = {
        x: (feature.side === 'left' ? featureRect.right + 20 : featureRect.left - 20) - mapRect.left,
        y: featureRect.top + featureRect.height / 2 - mapRect.top,
      };

      window.clearTimeout(returnTimerRef.current);
      setMiniRobotPosition(startPosition);
      window.requestAnimationFrame(() => setMiniRobotPosition(targetPosition));
      returnTimerRef.current = window.setTimeout(() => setMiniRobotPosition(null), 4500);
    }
    setSelectedFeature(feature);
  };

  return (
    <div className="relative mx-auto mt-6 w-full max-w-310 select-none">
      <div className="seis-robot-backdrop relative overflow-hidden rounded-2xl border border-(--seis-border-strong) p-5 sm:p-8 lg:p-10">
        <div className="seis-robot-glow-aura" aria-hidden="true" />

        <div className="relative z-20 flex items-center justify-between border-b border-(--seis-border-subtle) pb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-3 w-3 rounded-full bg-(--seis-cyan) shadow-[0_0_8px_var(--seis-cyan)]" />
              <span className="h-3 w-3 rounded-full bg-(--seis-cyan)/70" />
              <span className="h-3 w-3 rounded-full bg-(--seis-cyan)/40" />
            </div>
            <span className="font-mono text-[12px] font-bold tracking-wider text-(--seis-cyan) sm:text-[14px]">
              SEIS-AI // FEATURE MAP
            </span>
          </div>

          <div className="hidden items-center gap-2 font-mono text-[13px] text-(--seis-text-muted) sm:flex">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-(--seis-cyan)" />
            <span className="font-semibold text-(--seis-text-primary)">Interactive Feature Map</span>
          </div>
        </div>

        <div
          ref={mapRef}
          className="relative z-20 mt-5 grid grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:mt-0 lg:grid lg:min-h-140 lg:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)] lg:items-center lg:gap-x-6 lg:gap-y-6 lg:py-5"
        >
          {connectorPoints && (
            <svg
              className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full overflow-visible lg:block"
              viewBox={`0 0 ${mapSize.width} ${mapSize.height}`}
              aria-hidden="true"
            >
              {features.map(({ id }) => {
                const target = connectorPoints.features[id];
                if (!target) return null;
                const isSelected = selectedFeature?.id === id;
                const turnX = connectorPoints.robot.x + (target.x - connectorPoints.robot.x) * 0.58;
                return (
                  <g key={id} className={isSelected ? 'seis-feature-map-branch is-selected' : 'seis-feature-map-branch'}>
                    <path
                      d={`M ${connectorPoints.robot.x} ${connectorPoints.robot.y} H ${turnX} V ${target.y} H ${target.x}`}
                      className="seis-feature-map-line"
                    />
                    <circle cx={target.x} cy={target.y} r="4" className="seis-feature-map-node" />
                  </g>
                );
              })}
            </svg>
          )}

          <div className="relative z-20 flex flex-col items-center justify-center py-5 sm:col-span-2 lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:py-0">
            <div className="relative">
              <div className="absolute -inset-8 rounded-full bg-(--seis-cyan)/10 blur-2xl" aria-hidden="true" />
              <div ref={robotRef} className="relative z-10 animate-[robotBobMaster_5s_ease-in-out_infinite]">
                <InteractiveRobot size={210} showChatBubble={false} />
              </div>
              <div className="pointer-events-none absolute -bottom-1 left-1/2 h-3 w-40 -translate-x-1/2 rounded-[100%] border border-(--seis-cyan)/50 shadow-[0_0_20px_var(--seis-cyan)]" />
            </div>
          </div>

          {features.map((feature) => {
            const Icon = feature.icon;
            const isSelected = selectedFeature?.id === feature.id;
            return (
              <div
                key={feature.id}
                className={`relative z-30 w-full lg:col-span-1 lg:w-[min(100%,340px)] ${feature.position}`}
              >
                <button
                  ref={(element) => { featureRefs.current[feature.id] = element; }}
                  type="button"
                  onClick={() => handleFeatureClick(feature)}
                  aria-pressed={isSelected}
                  className={`flex min-h-21.5 w-full items-center gap-3 rounded-xl border p-3 text-left shadow-lg backdrop-blur-md transition-all duration-300 sm:px-4 sm:py-3 ${
                    isSelected
                      ? 'border-(--seis-cyan) bg-(--seis-highlight) shadow-[0_0_24px_var(--seis-cyan-glow)]'
                      : 'border-(--seis-border-subtle) bg-(--seis-surface-1)/95 hover:border-(--seis-cyan)/50 hover:shadow-[0_0_20px_var(--seis-cyan-glow)]'
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--seis-cyan)/40 bg-(--seis-cyan-subtle) text-(--seis-cyan)">
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-bold text-(--seis-text-primary) sm:text-[16px]">
                      {feature.label}
                    </span>
                  </span>
                </button>
                {isSelected && (
                  <div className="mt-2 flex min-h-12 items-start gap-2 rounded-lg border border-(--seis-cyan)/25 bg-(--seis-surface-1)/95 px-3 py-2 text-[14px] font-medium leading-relaxed text-(--seis-text-primary) shadow-sm sm:text-[15px]">
                    <Zap size={14} className="mt-0.5 shrink-0 text-(--seis-cyan)" />
                    <span>
                      {typedBrief}
                      {typedBrief.length < feature.quote.length && (
                        <span className="ml-0.5 animate-pulse text-(--seis-cyan)" aria-hidden="true">|</span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            );
          })}

          {miniRobotPosition && (
            <div
              className="pointer-events-none absolute z-40 transition-[left,top] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ left: miniRobotPosition.x, top: miniRobotPosition.y, transform: 'translate(-50%, -50%)' }}
              aria-hidden="true"
            >
              <InteractiveRobot size={58} interactive={false} showChatBubble={false} />
            </div>
          )}
        </div>

        <div className="relative z-20 mt-5 flex justify-center border-t border-(--seis-border-subtle) pt-4">
          <span className="font-mono text-[12px] font-bold tracking-[0.2em] text-(--seis-cyan)">
            SEIS-AI
          </span>
        </div>
      </div>
    </div>
  );
}
