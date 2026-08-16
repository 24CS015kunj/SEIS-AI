import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  Lock,
  Globe,
  Star,
  GitFork,
  Check,
  Loader2,
  CheckCircle2,
  Download,
  Info,
  FolderGit2,
  FileCode2,
  HardDrive,
  Timer,
  SearchX,
} from 'lucide-react';
import BrandMark from '../components/common/BrandMark';
import FadeIn from '../components/common/FadeIn';

/**
 * MOCK DATA ONLY. Nothing here comes from the GitHub API — this simulates
 * what a future `/api/repositories` response might look like, purely to
 * exercise the UI. Field shape: id, name, owner, description, visibility
 * ('public' | 'private'), language, stars, forks, updatedAt, alreadyImported,
 * plus mock analysis stats (fileCount, sizeLabel, estAnalysisTime) used only
 * by the sidebar preview.
 */
const MOCK_REPOSITORIES = [
  {
    id: 'repo-1',
    name: 'seis-ai-copilot',
    owner: 'seis-ai',
    description: 'AI-powered software evolution intelligence platform — core frontend and API.',
    visibility: 'public',
    language: 'JavaScript',
    stars: 128,
    forks: 24,
    updatedAt: 'Updated 2 hours ago',
    alreadyImported: false,
    fileCount: '~420',
    sizeLabel: '12.4 MB',
    estAnalysisTime: '~2–3 mins',
  },
  {
    id: 'repo-2',
    name: 'platform-api',
    owner: 'acme-corp',
    description: 'Internal REST + GraphQL gateway used across every Acme product surface.',
    visibility: 'private',
    language: 'TypeScript',
    stars: 6,
    forks: 1,
    updatedAt: 'Updated 1 day ago',
    alreadyImported: false,
    fileCount: '~610',
    sizeLabel: '18.7 MB',
    estAnalysisTime: '~3–4 mins',
  },
  {
    id: 'repo-3',
    name: 'resume-skill-extractor',
    owner: 'alex-dev',
    description: 'Python-based ML tool for extracting skills from PDF resumes.',
    visibility: 'public',
    language: 'Python',
    stars: 45,
    forks: 12,
    updatedAt: 'Updated 3 days ago',
    alreadyImported: false,
    fileCount: '~180',
    sizeLabel: '6.1 MB',
    estAnalysisTime: '~1–2 mins',
  },
  {
    id: 'repo-4',
    name: 'design-system',
    owner: 'acme-corp',
    description: 'Shared component library, tokens, and Figma-to-code pipeline.',
    visibility: 'private',
    language: 'TypeScript',
    stars: 19,
    forks: 3,
    updatedAt: 'Updated 5 hours ago',
    alreadyImported: false,
    fileCount: '~275',
    sizeLabel: '9.8 MB',
    estAnalysisTime: '~2 mins',
  },
  {
    id: 'repo-5',
    name: 'docs-site',
    owner: 'seis-ai',
    description: 'Public documentation site for SEIS AI Copilot, built with Vite.',
    visibility: 'public',
    language: 'JavaScript',
    stars: 15,
    forks: 5,
    updatedAt: 'Updated 1 week ago',
    alreadyImported: true,
    fileCount: '~95',
    sizeLabel: '3.2 MB',
    estAnalysisTime: '~1 min',
  },
  {
    id: 'repo-6',
    name: 'legacy-monolith',
    owner: 'acme-corp',
    description: 'The original Acme application, pre-microservices. Still in production.',
    visibility: 'public',
    language: 'Python',
    stars: 302,
    forks: 88,
    updatedAt: 'Updated 2 months ago',
    alreadyImported: true,
    fileCount: '~1,240',
    sizeLabel: '41.5 MB',
    estAnalysisTime: '~6–8 mins',
  },
];

const VISIBILITY_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'public', label: 'Public' },
  { value: 'private', label: 'Private' },
];

const LANGUAGE_FILTERS = [
  { value: 'JavaScript', label: 'JavaScript', dot: '#F7DF1E' },
  { value: 'TypeScript', label: 'TypeScript', dot: '#3178C6' },
];

export default function ImportRepositoryPage() {
  const navigate = useNavigate();
  const [loadStatus, setLoadStatus] = useState('loading'); // loading | ready
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [language, setLanguage] = useState(null);
  const [selectedId, setSelectedId] = useState('repo-1');
  const [importStatus, setImportStatus] = useState('idle'); // idle | importing | success

  const searchId = useId();
  const cardRefs = useRef({});

  // Simulate fetching the repository list from GitHub.
  useEffect(() => {
    const timer = window.setTimeout(() => setLoadStatus('ready'), 900);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredRepos = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOCK_REPOSITORIES.filter((repo) => {
      if (visibility !== 'all' && repo.visibility !== visibility) return false;
      if (language && repo.language !== language) return false;
      if (q && !repo.name.toLowerCase().includes(q) && !repo.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, visibility, language]);

  const selectedRepo = useMemo(
    () => MOCK_REPOSITORIES.find((r) => r.id === selectedId) ?? null,
    [selectedId]
  );

  const selectRepo = (id) => {
    setSelectedId(id);
    cardRefs.current[id]?.focus();
  };

  const handleListKeyDown = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    if (filteredRepos.length === 0) return;
    e.preventDefault();

    const currentIndex = filteredRepos.findIndex((r) => r.id === selectedId);
    let nextIndex;
    if (e.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, filteredRepos.length - 1);
    else if (e.key === 'ArrowUp') nextIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
    else if (e.key === 'Home') nextIndex = 0;
    else nextIndex = filteredRepos.length - 1;

    selectRepo(filteredRepos[nextIndex].id);
  };

  const handleImport = () => {
    if (!selectedRepo || selectedRepo.alreadyImported || importStatus === 'importing') return;
    setImportStatus('importing');
    window.setTimeout(() => setImportStatus('success'), 1500);
  };

  const clearFilters = () => {
    setQuery('');
    setVisibility('all');
    setLanguage(null);
  };

  if (importStatus === 'success' && selectedRepo) {
    return <ImportSuccessScreen repo={selectedRepo} />;
  }

  return (
    <div className="min-h-screen w-full bg-[#F5F6FA] flex items-start lg:items-center justify-center px-4 sm:px-6 py-10 lg:py-12">
      <FadeIn direction="scale" className="w-full max-w-[1024px]">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.08)] overflow-hidden">

          {/* ---------- Header ---------- */}
          <div className="flex items-start justify-between gap-4 px-6 sm:px-8 py-6 border-b border-[#E2E8F0]">
            <div className="flex items-start gap-3">
              <BrandMark size={36} />
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">Import GitHub Repository</h1>
                <p className="text-[13.5px] text-slate-500 mt-1">
                  Search and select a repository to analyze with SEIS AI Copilot.
                </p>
              </div>
            </div>
            <Link
              to="/workspace"
              aria-label="Cancel and return to workspace setup"
              className="shrink-0 w-9 h-9 rounded-lg border border-[#E2E8F0] flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
            >
              <X size={17} aria-hidden="true" />
            </Link>
          </div>

          {/* ---------- Search + filters ---------- */}
          <div className="px-6 sm:px-8 pt-6">
            <label htmlFor={searchId} className="sr-only">Search repositories</label>
            <div className="relative mb-4">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id={searchId}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search repositories…"
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-[#E2E8F0] text-[14.5px] text-slate-900 focus-visible:border-blue-500 transition-colors"
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-5">
              <div role="group" aria-label="Filter by visibility" className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">Visibility</span>
                {VISIBILITY_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={visibility === f.value}
                    onClick={() => setVisibility(f.value)}
                    className={`h-7 px-3 rounded-full text-[12.5px] font-semibold border transition-colors ${
                      visibility === f.value
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-[#E2E8F0] text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div aria-hidden="true" className="hidden sm:block w-px h-5 bg-[#E2E8F0]" />

              <div role="group" aria-label="Filter by language" className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-0.5">Language</span>
                {LANGUAGE_FILTERS.map((f) => {
                  const active = language === f.value;
                  return (
                    <button
                      key={f.value}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setLanguage(active ? null : f.value)}
                      className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12.5px] font-semibold border transition-colors ${
                        active
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-[#E2E8F0] text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: f.dot }} aria-hidden="true" />
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ---------- Body: list + sidebar ---------- */}
          <div className="flex flex-col lg:flex-row gap-5 px-6 sm:px-8 pb-6">
            {/* Repository list */}
            <div className="flex-1 min-w-0">
              <p className="sr-only" role="status" aria-live="polite">
                {loadStatus === 'ready' ? `${filteredRepos.length} repositories found.` : 'Loading repositories…'}
              </p>

              <div className="border border-[#E2E8F0] rounded-xl overflow-y-auto max-h-[360px]">
                {loadStatus === 'loading' ? (
                  <RepoListSkeleton />
                ) : filteredRepos.length === 0 ? (
                  <EmptyResults onClear={clearFilters} />
                ) : (
                  <div
                    role="radiogroup"
                    aria-label="Repositories"
                    onKeyDown={handleListKeyDown}
                    className="divide-y divide-[#EDF0F5]"
                  >
                    {filteredRepos.map((repo) => (
                      <RepoCard
                        key={repo.id}
                        repo={repo}
                        selected={repo.id === selectedId}
                        onSelect={() => selectRepo(repo.id)}
                        cardRef={(el) => { cardRefs.current[repo.id] = el; }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <div className="lg:w-[280px] shrink-0">
              <SidebarPanel repo={selectedRepo} />
            </div>
          </div>

          {/* ---------- Footer actions ---------- */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 px-6 sm:px-8 py-5 border-t border-[#E2E8F0] bg-slate-50/60">
            <Link
              to="/workspace"
              className="inline-flex items-center justify-center h-11 px-5 rounded-lg border border-[#E2E8F0] bg-white text-slate-700 text-[14px] font-semibold no-underline transition-colors hover:bg-slate-50 w-full sm:w-auto"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleImport}
              disabled={!selectedRepo || selectedRepo.alreadyImported || importStatus === 'importing'}
              aria-busy={importStatus === 'importing'}
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[14px] font-semibold border-0 cursor-pointer transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 w-full sm:w-auto whitespace-nowrap"
            >
              {importStatus === 'importing' ? (
                <>
                  <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                  Importing Repository…
                </>
              ) : selectedRepo?.alreadyImported ? (
                <>
                  <Check size={16} aria-hidden="true" />
                  Already Imported
                </>
              ) : (
                <>
                  <Download size={16} aria-hidden="true" />
                  Import Repository
                </>
              )}
            </button>
            <span className="sr-only" role="status" aria-live="polite">
              {importStatus === 'importing' ? 'Importing repository, please wait.' : ''}
            </span>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}

function RepoCard({ repo, selected, onSelect, cardRef }) {
  return (
    <div
      ref={cardRef}
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors focus-visible:bg-blue-50/60 ${
        selected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          selected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 bg-white group-hover:border-blue-400'
        }`}
      >
        {selected && <Check size={12} className="text-white" strokeWidth={3} />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-bold text-slate-900 truncate">
            {repo.owner}/{repo.name}
          </span>
          <VisibilityBadge visibility={repo.visibility} />
          {repo.alreadyImported && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <Check size={10} aria-hidden="true" />
              Already imported
            </span>
          )}
        </div>
        <p className="text-[13px] text-slate-500 mt-1 leading-snug line-clamp-2">{repo.description}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[12px] text-slate-500">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full" style={{ background: LANGUAGE_DOT[repo.language] ?? '#94A3B8' }} aria-hidden="true" />
            {repo.language}
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap"><Star size={11} aria-hidden="true" />{repo.stars}</span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap"><GitFork size={11} aria-hidden="true" />{repo.forks}</span>
          <span className="whitespace-nowrap">{repo.updatedAt}</span>
        </div>
      </div>
    </div>
  );
}

const LANGUAGE_DOT = { JavaScript: '#F7DF1E', TypeScript: '#3178C6', Python: '#3776AB' };

function VisibilityBadge({ visibility }) {
  const isPrivate = visibility === 'private';
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 border border-[#E2E8F0] rounded-full px-2 py-0.5">
      {isPrivate ? <Lock size={10} aria-hidden="true" /> : <Globe size={10} aria-hidden="true" />}
      {isPrivate ? 'Private' : 'Public'}
    </span>
  );
}

function RepoListSkeleton() {
  return (
    <div className="divide-y divide-[#EDF0F5]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3.5 animate-pulse">
          <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-40 bg-slate-200 rounded" />
            <div className="h-3 w-64 bg-slate-100 rounded" />
            <div className="h-3 w-32 bg-slate-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyResults({ onClear }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-12">
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
        <SearchX size={22} className="text-slate-400" aria-hidden="true" />
      </div>
      <p className="text-[14px] font-semibold text-slate-700 mb-1">No repositories found</p>
      <p className="text-[13px] text-slate-500 mb-4">Try a different search term or clear your filters.</p>
      <button
        type="button"
        onClick={onClear}
        className="h-9 px-4 rounded-lg border border-[#E2E8F0] text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        Clear filters
      </button>
    </div>
  );
}

function SidebarPanel({ repo }) {
  return (
    <div className="lg:sticky lg:top-0">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
        Selected Repository
      </span>

      {!repo ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-slate-50/50 px-4 py-8 text-center">
          <p className="text-[13px] text-slate-500 m-0">Select a repository to see its details.</p>
        </div>
      ) : (
        <>
          <div className="relative rounded-xl p-[1.5px] bg-gradient-to-r from-blue-500 to-indigo-500 mb-4">
            <div className="rounded-[10px] bg-white p-4">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <FolderGit2 size={15} className="text-blue-600" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-bold text-slate-900 truncate">{repo.name}</div>
                  <div className="text-[11.5px] text-slate-400 truncate">{repo.owner}</div>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 text-[12px] font-semibold ${repo.alreadyImported ? 'text-slate-500' : 'text-emerald-600'}`}>
                {repo.alreadyImported ? (
                  <>
                    <Check size={12} aria-hidden="true" />
                    Already imported into this workspace
                  </>
                ) : (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    Ready for analysis
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="border border-[#E2E8F0] rounded-xl divide-y divide-[#EDF0F5] mb-4">
            <StatRow icon={FileCode2} label="Files" value={repo.fileCount} />
            <StatRow icon={HardDrive} label="Size" value={repo.sizeLabel} />
            <StatRow icon={Timer} label="Est. Analysis Time" value={repo.estAnalysisTime} accent />
          </div>

          <div className="flex items-start gap-2.5 rounded-xl bg-blue-50/70 border border-blue-100 px-3.5 py-3">
            <Info size={15} className="text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-[12px] text-blue-900 leading-relaxed m-0">
              SEIS will map the architecture and generate foundational documentation upon import.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function StatRow({ icon: Icon, label, value, accent }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5">
      <span className="inline-flex items-center gap-2 text-[12.5px] text-slate-500">
        <Icon size={14} className="text-slate-400" aria-hidden="true" />
        {label}
      </span>
      <span className={`text-[12.5px] font-bold ${accent ? 'text-indigo-600' : 'text-slate-900'}`}>{value}</span>
    </div>
  );
}

function ImportSuccessScreen({ repo }) {
  const navigate = useNavigate();

  // Mock hand-off to AI Repository Analysis — frontend navigation only, the
  // repo record travels via router state so the next page knows what to show.
  useEffect(() => {
    const timer = window.setTimeout(() => navigate('/analysis', { state: { repo } }), 1400);
    return () => window.clearTimeout(timer);
  }, [navigate, repo]);

  return (
    <div className="min-h-screen w-full bg-[#F5F6FA] flex items-center justify-center px-6 py-16">
      <FadeIn direction="scale">
        <div
          role="status"
          aria-live="polite"
          className="w-full max-w-[440px] bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.08)] px-8 py-12 sm:px-[57px] sm:py-[57px] text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={30} className="text-emerald-500" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Repository Imported</h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-2">
            <span className="font-semibold text-slate-700">{repo.owner}/{repo.name}</span> is ready.
          </p>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">
            Next, SEIS will analyze the codebase and map its architecture.
          </p>
          <div className="flex items-center justify-center gap-2 text-slate-400 text-[13px]">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            Preparing AI analysis…
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
