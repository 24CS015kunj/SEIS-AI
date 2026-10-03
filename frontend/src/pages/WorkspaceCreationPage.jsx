import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
  Upload,
  ImagePlus,
  RefreshCw,
  X,
  AlertCircle,
  Loader2,
  CheckCircle2,
  FolderGit2,
  Users,
  LayoutGrid,
} from 'lucide-react';
import BrandMark, { BrandGlyph } from '../components/common/BrandMark';
import FadeIn from '../components/common/FadeIn';
import OnboardingStepper from '../components/onboarding/OnboardingStepper';
import { useAuth } from '../context/AuthContext';
import {
  createWorkspace,
  listWorkspaces,
  setActiveWorkspace,
  getDefaultRepositoryForWorkspace,
  getDefaultRepositoryDetailsForWorkspace,
} from '../services/workspaceService';

const WORKSPACE_TYPES = [
  { value: 'personal', label: 'Personal Workspace' },
  { value: 'team', label: 'Team (Collaborative)' },
  { value: 'org', label: 'Organization (Enterprise)' },
];

const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB — reasonable frontend-only assumption; Figma doesn't specify one.

/**
 * Client-side pre-validation only (required, not-just-whitespace, minimum
 * length). Duplicate-name detection is no longer simulated here (Task 45)
 * -- the real backend enforces a unique {ownerId, name} index
 * (`workspaces.model.js`) and returns a 409 handled in `handleSubmit`.
 */
function validateWorkspaceName(raw) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return 'Workspace name is required.';
  if (trimmed.length < 2) return 'Workspace name must be at least 2 characters.';
  return null;
}

export default function WorkspaceCreationPage() {
  const { user } = useAuth();
  const [name, setName] = useState(() => (user?.githubUsername ? `${user.githubUsername}'s Engineering Lab` : 'Engineering Workspace'));
  const [nameError, setNameError] = useState(null);
  const [description, setDescription] = useState('');
  const [workspaceType, setWorkspaceType] = useState('team');
  const [orgName, setOrgName] = useState('');
  const [submitStatus, setSubmitStatus] = useState('idle'); // idle | submitting | success
  const [submitError, setSubmitError] = useState(null);
  const [createdWorkspace, setCreatedWorkspace] = useState(null);
  const [activeTab, setActiveTab] = useState('existing'); // existing | create

  // Existing workspaces (Task 45 §4):
  const [existingWorkspaces, setExistingWorkspaces] = useState([]);
  const [existingWorkspacesStatus, setExistingWorkspacesStatus] = useState('loading'); // loading | ready | error

  const navigate = useNavigate();
  const nameInputRef = useRef(null);
  const nameErrorId = useId();

  useEffect(() => {
    if (user?.githubUsername && name === 'Engineering Workspace') {
      setName(`${user.githubUsername}'s Engineering Lab`);
    }
  }, [user, name]);

  useEffect(() => {
    let cancelled = false;
    listWorkspaces()
      .then((workspaces) => {
        if (!cancelled) {
          setExistingWorkspaces(workspaces);
          setExistingWorkspacesStatus('ready');
          if (!workspaces || workspaces.length === 0) {
            setActiveTab('create');
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExistingWorkspacesStatus('error');
          setActiveTab('create');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenWorkspace = (workspace, defaultRepoId) => {
    setActiveWorkspace(workspace);
    if (defaultRepoId) {
      navigate(`/command-center/${defaultRepoId}`);
    } else {
      navigate('/import-repository', {
        state: { workspaceId: workspace._id, workspaceName: workspace.name },
      });
    }
  };

  const handleChangeRepo = (workspace) => {
    setActiveWorkspace(workspace);
    navigate('/import-repository', {
      state: { workspaceId: workspace._id, workspaceName: workspace.name },
    });
  };

  const handleNameChange = (e) => {
    setName(e.target.value);
    if (nameError) setNameError(null); // clear stale error as soon as the user edits
  };

  const handleNameBlur = () => {
    setNameError(validateWorkspaceName(name));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitStatus === 'submitting') return;

    const error = validateWorkspaceName(name);
    setNameError(error);
    if (error) {
      nameInputRef.current?.focus();
      return;
    }

    setSubmitError(null);
    setSubmitStatus('submitting');
    try {
      const workspace = await createWorkspace(name.trim());
      setActiveWorkspace(workspace);
      setCreatedWorkspace(workspace);
      setSubmitStatus('success');
    } catch (err) {
      setSubmitStatus('idle');
      if (err.response?.status === 409) {
        setNameError('A workspace with this name already exists.');
        nameInputRef.current?.focus();
      } else if (err.response?.status === 401) {
        setSubmitError('Your session has expired. Please log in again.');
      } else {
        setSubmitError(
          err.response?.data?.message || 'Something went wrong creating your workspace. Please try again.'
        );
      }
    }
  };

  if (submitStatus === 'success' && createdWorkspace) {
    return <SuccessScreen workspace={createdWorkspace} />;
  }

  return (
    <div className="min-h-screen w-full bg-[#F5F6FA] flex flex-col lg:flex-row">
      {/* ---------- Left panel: marketing + product preview (desktop only) ---------- */}
      <div className="hidden lg:flex lg:w-[38%] relative overflow-hidden border-r border-[#E2E8F0]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(#E2E8F0 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="relative w-full flex flex-col justify-center px-14 xl:px-16 py-16">
          <div className="max-w-[420px]">
            <FadeIn>
              <Link
                to="/"
                className="inline-flex items-center gap-2.5 mb-10"
                style={{ textDecoration: 'none' }}
                aria-label="SEIS AI Copilot — back to homepage"
              >
                <BrandMark size={36} />
                <span className="text-[15px] font-extrabold text-slate-900 tracking-tight">
                  SEIS AI Copilot
                </span>
              </Link>

              <span className="eyebrow inline-block !mb-4 bg-blue-50 px-3 py-1 rounded-full">
                ENGINEERING INTELLIGENCE PLATFORM
              </span>
              <h1 className="headline-lg mb-5" style={{ fontSize: 'clamp(1.75rem, 2.6vw, 2.5rem)' }}>
                Your Software,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                  Understood by AI.
                </span>
              </h1>
              <p className="body-base mb-8 max-w-[380px]">
                Every workspace connects a GitHub repository to an AI engine that maps
                architecture, tracks evolution, and answers questions about your code.
              </p>

              <div className="flex flex-wrap gap-2.5 mb-10">
                <div className="inline-flex items-center gap-2 border border-[#E2E8F0] bg-white rounded-lg px-3 py-2">
                  <FolderGit2 size={14} className="text-blue-600" aria-hidden="true" />
                  <span className="text-[13px] font-semibold text-slate-700">Repository Analysis</span>
                </div>
                <div className="inline-flex items-center gap-2 border border-[#E2E8F0] bg-white rounded-lg px-3 py-2">
                  <LayoutGrid size={14} className="text-indigo-600" aria-hidden="true" />
                  <span className="text-[13px] font-semibold text-slate-700">Workspace</span>
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={150}>
              <div className="app-window bg-white">
                <div className="app-titlebar bg-white justify-between">
                  <span className="text-[11px] font-mono text-slate-400">seis-ai-copilot/frontend</span>
                  <span className="text-[11px] font-mono font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    92% EXCELLENT
                  </span>
                </div>
                <div className="p-5 bg-[#F8FAFC]">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Languages
                  </div>
                  <div className="flex gap-1.5 h-2 rounded-full overflow-hidden mb-5">
                    <div className="bg-blue-500" style={{ width: '55%' }} />
                    <div className="bg-indigo-400" style={{ width: '25%' }} />
                    <div className="bg-emerald-400" style={{ width: '20%' }} />
                  </div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Architecture Overview
                  </div>
                  <div className="bg-white rounded-lg border border-[#E2E8F0] p-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <BrandGlyph size={16} tone="onLight" />
                    </div>
                    <p className="text-[12.5px] text-slate-500 leading-snug m-0">
                      0 circular dependencies detected across the module graph.
                    </p>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      {/* ---------- Right panel: workspace creation form ---------- */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-start lg:items-center justify-center px-4 sm:px-6 py-10 sm:py-14">
          <div className="w-full max-w-[642px]">

            {/* Mobile-only compact brand header */}
            <Link
              to="/"
              className="lg:hidden flex items-center justify-center gap-2.5 mb-8"
              style={{ textDecoration: 'none' }}
              aria-label="SEIS AI Copilot — back to homepage"
            >
              <BrandMark size={32} />
              <span className="text-[15px] font-extrabold text-slate-900 tracking-tight">
                SEIS AI Copilot
              </span>
            </Link>

            <FadeIn direction="scale">
              <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.06)] p-6 sm:p-9 lg:px-[41px] lg:py-10">

                {/* ---- Header + stepper ---- */}
                <div className="mb-6">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1.5">Workspace Setup</h2>
                  <p className="text-sm text-slate-500 mb-6">
                    Set up or choose the engineering workspace where your repositories and AI insights live.
                  </p>
                  <OnboardingStepper currentStep={1} />
                </div>

                {existingWorkspacesStatus === 'ready' && existingWorkspaces.length > 0 && (
                  <div className="flex border-b border-slate-200 mb-6 gap-6">
                    <button
                      type="button"
                      onClick={() => setActiveTab('existing')}
                      className={`pb-3 text-[13.5px] font-bold border-b-2 transition-colors cursor-pointer ${
                        activeTab === 'existing'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Choose Existing Workspace ({existingWorkspaces.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('create')}
                      className={`pb-3 text-[13.5px] font-bold border-b-2 transition-colors cursor-pointer ${
                        activeTab === 'create'
                          ? 'border-blue-600 text-blue-600'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      + Create New Workspace
                    </button>
                  </div>
                )}

                {existingWorkspacesStatus === 'ready' && existingWorkspaces.length > 0 && activeTab === 'existing' ? (
                  <ExistingWorkspacesPanel
                    workspaces={existingWorkspaces}
                    onOpen={handleOpenWorkspace}
                    onChangeRepo={handleChangeRepo}
                    onCreateNew={() => setActiveTab('create')}
                  />
                ) : (
                  <form onSubmit={handleSubmit} noValidate>
                    {/* ---- Logo upload ---- */}
                    <div className="mb-7">
                      <LogoUpload />
                    </div>

                  {/* ---- Workspace name ---- */}
                  <div className="mb-5">
                    <label htmlFor="workspace-name" className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Workspace Name
                      <span aria-hidden="true" className="text-rose-500">*</span>
                      <span className="sr-only">(required)</span>
                    </label>
                    <input
                      id="workspace-name"
                      ref={nameInputRef}
                      type="text"
                      value={name}
                      onChange={handleNameChange}
                      onBlur={handleNameBlur}
                      required
                      aria-required="true"
                      aria-invalid={nameError ? 'true' : 'false'}
                      aria-describedby={nameError ? nameErrorId : undefined}
                      placeholder="e.g. Platform Engineering"
                      className={`w-full h-11 px-3.5 rounded-lg border text-[15px] text-slate-900 transition-colors ${
                        nameError
                          ? 'border-rose-400 focus-visible:border-rose-500'
                          : 'border-[#E2E8F0] focus-visible:border-blue-500'
                      }`}
                    />
                    {nameError && (
                      <p id={nameErrorId} role="alert" className="flex items-center gap-1.5 text-[13px] text-rose-600 mt-1.5">
                        <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
                        {nameError}
                      </p>
                    )}
                  </div>

                  {/* ---- Description ---- */}
                  <div className="mb-5">
                    <label htmlFor="workspace-description" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Description
                    </label>
                    <textarea
                      id="workspace-description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Briefly describe the purpose of this workspace…"
                      className="w-full min-h-[90px] px-3.5 py-2.5 rounded-lg border border-[#E2E8F0] text-[15px] text-slate-900 transition-colors focus-visible:border-blue-500 resize-y"
                    />
                  </div>

                  {/* ---- Type + Org row ---- */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label htmlFor="workspace-type" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Workspace Type
                      </label>
                      <div className="relative">
                        <select
                          id="workspace-type"
                          value={workspaceType}
                          onChange={(e) => setWorkspaceType(e.target.value)}
                          className="w-full h-11 pl-3.5 pr-9 rounded-lg border border-[#E2E8F0] text-[15px] text-slate-900 appearance-none bg-white transition-colors focus-visible:border-blue-500"
                        >
                          {WORKSPACE_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="org-name" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                        Organization Name <span className="normal-case font-medium text-slate-400">(optional)</span>
                      </label>
                      <input
                        id="org-name"
                        type="text"
                        value={orgName}
                        onChange={(e) => setOrgName(e.target.value)}
                        placeholder="e.g. Acme Corp"
                        className="w-full h-11 px-3.5 rounded-lg border border-[#E2E8F0] text-[15px] text-slate-900 transition-colors focus-visible:border-blue-500"
                      />
                    </div>
                  </div>

                  {/* ---- Live preview ---- */}
                  <WorkspacePreview name={name.trim() || 'Your Workspace'} />

                  {submitError && (
                    <p role="alert" className="flex items-center gap-1.5 text-[13px] text-rose-600 mt-4">
                      <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
                      {submitError}
                    </p>
                  )}

                  {/* ---- Actions ---- */}
                  <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-7">
                    <Link
                      to="/login"
                      className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg border border-[#E2E8F0] text-slate-700 text-[14px] font-semibold no-underline transition-colors hover:bg-slate-50 w-full sm:w-auto"
                    >
                      <ArrowLeft size={16} aria-hidden="true" />
                      Back
                    </Link>
                    <button
                      type="submit"
                      disabled={submitStatus === 'submitting'}
                      aria-busy={submitStatus === 'submitting'}
                      className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-lg bg-blue-600 text-white text-[14px] font-semibold border-0 cursor-pointer transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-80 w-full sm:w-auto whitespace-nowrap"
                    >
                      {submitStatus === 'submitting' ? (
                        <>
                          <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                          Creating Workspace…
                        </>
                      ) : (
                        <>
                          Create Workspace
                          <ArrowRight size={16} aria-hidden="true" />
                        </>
                      )}
                    </button>
                  </div>
                  <span className="sr-only" role="status" aria-live="polite">
                    {submitStatus === 'submitting' ? 'Creating your workspace, please wait.' : ''}
                  </span>
                </form>
                )}
              </div>
            </FadeIn>

            <div className="flex items-center justify-center gap-6 mt-6 text-[13px] text-slate-500">
              <a href="#" className="hover:text-slate-900 transition-colors no-underline">Privacy Policy</a>
              <a href="#" className="hover:text-slate-900 transition-colors no-underline">Documentation</a>
              <a href="#" className="hover:text-slate-900 transition-colors no-underline">Support</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



function LogoUpload() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const errorId = useId();

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const acceptFile = (selected) => {
    if (!selected) return;

    if (!ACCEPTED_LOGO_TYPES.includes(selected.type)) {
      setError('Please upload a PNG, JPG, or WEBP image.');
      setFile(null);
      return;
    }
    if (selected.size > MAX_LOGO_BYTES) {
      setError('Image is too large — please choose a file under 5MB.');
      setFile(null);
      return;
    }

    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(selected));
    setFile(selected);
  };

  const handleInputChange = (e) => {
    acceptFile(e.target.files?.[0] ?? null);
    e.target.value = ''; // allow re-selecting the same file later
  };

  const handleRemove = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setError(null);
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div>
      <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
        Workspace Logo
      </span>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_LOGO_TYPES.join(',')}
        onChange={handleInputChange}
        className="sr-only"
        aria-describedby={error ? errorId : undefined}
      />

      {file && previewUrl ? (
        <div className="flex items-center gap-4">
          <img
            src={previewUrl}
            alt={`Selected workspace logo: ${file.name}`}
            className="w-16 h-16 rounded-xl object-cover border border-[#E2E8F0]"
          />
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-slate-600 max-w-[220px] truncate" title={file.name}>
              {file.name}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openPicker}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[#E2E8F0] text-[12.5px] font-semibold text-slate-700 cursor-pointer transition-colors hover:bg-slate-50"
              >
                <RefreshCw size={13} aria-hidden="true" />
                Replace
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[#E2E8F0] text-[12.5px] font-semibold text-rose-600 cursor-pointer transition-colors hover:bg-rose-50"
              >
                <X size={13} aria-hidden="true" />
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-[#CBD5E1] bg-slate-50/50 cursor-pointer text-left transition-colors hover:border-blue-400 hover:bg-blue-50/40 focus-visible:ring-2 focus-visible:ring-blue-500/30"
        >
          <span className="shrink-0 w-16 h-16 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center">
            {error ? <AlertCircle size={22} className="text-rose-500" aria-hidden="true" /> : <ImagePlus size={22} className="text-slate-400" aria-hidden="true" />}
          </span>
          <span>
            <span className="flex items-center gap-1.5 text-[14px] font-semibold text-slate-900">
              <Upload size={14} aria-hidden="true" />
              Click to upload a logo
            </span>
            <span className="block text-[12.5px] text-slate-500 mt-0.5">
              Recommended 256×256px, PNG, JPG or WEBP (max 5MB).
            </span>
          </span>
        </button>
      )}

      {error && (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-[13px] text-rose-600 mt-2">
          <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}

function ExistingWorkspacesPanel({ workspaces, onOpen, onChangeRepo, onCreateNew }) {
  return (
    <div className="mb-7">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Your Workspaces ({workspaces.length})
        </span>
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className="text-[12px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
          >
            + Create New
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3">
        {workspaces.map((workspace) => {
          const defaultRepoId =
            typeof workspace.defaultRepositoryId === 'object'
              ? workspace.defaultRepositoryId?._id
              : (workspace.defaultRepositoryId || getDefaultRepositoryForWorkspace(workspace._id));

          const defaultRepoDetails = getDefaultRepositoryDetailsForWorkspace(workspace._id);
          const defaultRepoName =
            typeof workspace.defaultRepositoryId === 'object'
              ? (workspace.defaultRepositoryId?.fullName || workspace.defaultRepositoryId?.name)
              : (defaultRepoDetails?.repositoryName || null);

          return (
            <div
              key={workspace._id}
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md rounded-xl p-4 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <LayoutGrid size={18} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[14.5px] font-bold text-slate-900 truncate m-0">
                    {workspace.name}
                  </h4>
                  {defaultRepoName ? (
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 font-mono mt-0.5 truncate" title={`Default: ${defaultRepoName}`}>
                      <FolderGit2 size={12} className="text-blue-600 shrink-0" />
                      <span className="truncate">Default: <strong className="text-slate-800 font-semibold">{defaultRepoName}</strong></span>
                    </div>
                  ) : (
                    <span className="text-[12px] text-slate-400 block mt-0.5">
                      No repository linked yet
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                {defaultRepoId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onChangeRepo(workspace)}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-[12px] font-semibold border border-slate-200 cursor-pointer transition-colors"
                      title="Switch or choose a different repository for this workspace"
                    >
                      <FolderGit2 size={13} className="text-slate-500" />
                      <span>Switch Repo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpen(workspace, defaultRepoId)}
                      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold border-0 cursor-pointer transition-colors shadow-xs"
                      title="Directly open Command Center with default repository"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight size={14} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onChangeRepo(workspace)}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold border-0 cursor-pointer transition-colors shadow-xs"
                  >
                    <span>Select Repository</span>
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkspacePreview({ name }) {
  return (
    <div
      className="relative rounded-xl p-[1.5px] bg-gradient-to-r from-blue-500 to-indigo-500"
      aria-label="Workspace preview"
    >
      <div className="rounded-[10px] bg-white p-4 flex items-center gap-3.5">
        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
          <BrandGlyph size={18} tone="onLight" />
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-bold text-slate-900 truncate">{name}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-slate-500 mt-0.5">
            <span className="whitespace-nowrap">Engineering Space</span>
            <span aria-hidden="true">·</span>
            <span className="flex items-center gap-1 whitespace-nowrap"><FolderGit2 size={11} aria-hidden="true" />Ready for Repos</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuccessScreen({ workspace }) {
  const navigate = useNavigate();

  const handleContinue = () => {
    navigate('/import-repository', {
      state: { workspaceId: workspace._id, workspaceName: workspace.name },
    });
  };

  useEffect(() => {
    const timer = window.setTimeout(handleContinue, 800);
    return () => window.clearTimeout(timer);
  }, [workspace]);

  return (
    <div className="min-h-screen w-full bg-[#F5F6FA] flex items-center justify-center px-6 py-16">
      <FadeIn direction="scale">
        <div
          role="status"
          aria-live="polite"
          className="w-full max-w-[460px] bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_8px_30px_rgba(15,23,42,0.08)] px-8 py-10 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-5 shadow-inner">
            <CheckCircle2 size={32} />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Workspace Created Successfully</h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">
            <span className="font-semibold text-slate-700">{workspace.name}</span> is ready. Moving to repository selection…
          </p>
          <button
            type="button"
            onClick={handleContinue}
            className="w-full inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-semibold transition-colors cursor-pointer"
          >
            Continue to Repository Setup
            <ArrowRight size={15} />
          </button>
        </div>
      </FadeIn>
    </div>
  );
}
