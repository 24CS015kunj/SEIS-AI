import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildCommandCenterData } from '../services/commandCenterMockData';
import CommandCenterSidebar from '../components/commandCenter/CommandCenterSidebar';
import CommandCenterHeader from '../components/commandCenter/CommandCenterHeader';
import OverviewMetrics from '../components/commandCenter/OverviewMetrics';
import TechStackStrip from '../components/commandCenter/TechStackStrip';
import AiInsightsPanel from '../components/commandCenter/AiInsightsPanel';
import ArchitectureSection from '../components/commandCenter/ArchitectureSection';
import HotspotsSection from '../components/commandCenter/HotspotsSection';
import ActivitySection from '../components/commandCenter/ActivitySection';
import CopilotDrawer from '../components/commandCenter/CopilotDrawer';

/**
 * MOCK ONLY — used when this page is opened directly (no router state from
 * AI Repository Analysis). No auth guard exists yet in this frontend-only
 * phase, so the page must still render something sensible.
 */
const DEFAULT_REPO = {
  name: 'seis-ai-copilot',
  owner: 'seis-ai',
  language: 'JavaScript',
};

export default function CommandCenterPage() {
  const location = useLocation();
  const sourceRepo = location.state?.repo ?? DEFAULT_REPO;

  const data = useMemo(() => buildCommandCenterData(sourceRepo), [sourceRepo]);

  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 550);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#0F172A] flex">
      <CommandCenterSidebar
        repository={data.repository}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <CommandCenterHeader
          repository={data.repository}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onOpenCopilot={() => setCopilotOpen(true)}
        />

        <main id="overview" className="flex-1 px-4 sm:px-6 py-6 scroll-mt-14">
          <p className="sr-only" role="status" aria-live="polite">
            {loading ? 'Loading Command Center dashboard.' : 'Command Center dashboard loaded.'}
          </p>

          {loading ? (
            <CommandCenterSkeleton />
          ) : (
            <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-6 lg:items-start max-w-[1240px] mx-auto">
              <div className="flex flex-col gap-6 min-w-0">
                <section aria-label="Key engineering overview">
                  <OverviewMetrics overview={data.overview} />
                </section>
                <AiInsightsPanel insights={data.insights} />
                <HotspotsSection hotspots={data.hotspots} />
                <ArchitectureSection architecture={data.architecture} />
              </div>

              <div className="flex flex-col gap-6 mt-6 lg:mt-0 min-w-0">
                <TechStackStrip languages={data.overview.languages} />
                <ActivitySection activity={data.activity} />
              </div>
            </div>
          )}
        </main>
      </div>

      {copilotOpen && (
        <CopilotDrawer
          repository={data.repository}
          suggestedQuestions={data.copilot.suggestedQuestions}
          onClose={() => setCopilotOpen(false)}
        />
      )}
    </div>
  );
}

function CommandCenterSkeleton() {
  return (
    <div className="max-w-[1240px] mx-auto animate-pulse motion-reduce:animate-none" aria-hidden="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[84px] rounded-xl bg-[#111A2C] border border-[#1E293B]" />
        ))}
      </div>
      <div className="h-40 rounded-xl bg-[#111A2C] border border-[#1E293B] mb-6" />
      <div className="h-64 rounded-xl bg-[#111A2C] border border-[#1E293B]" />
    </div>
  );
}
