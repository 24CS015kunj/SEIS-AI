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
    <div className="min-h-screen w-full bg-[var(--seis-canvas)] flex flex-col lg:flex-row">
      {/* ---------- Left panel: technical spec + architectural context (desktop only) ---------- */}
      <div className="hidden lg:flex lg:w-[38%] relative overflow-hidden border-r border-[var(--seis-border-subtle)] bg-[var(--seis-surface-1)]">
        <div className="seis-engineering-grid" aria-hidden="true" />
        <div className="relative w-full flex flex-col justify-center px-12 xl:px-14 py-16 z-10">
          <div className="max-w-[420px]">
            <FadeIn>
              <Link
                to="/"
                className="inline-flex items-center gap-2 mb-10 group no-underline"
                aria-label="SEIS-AI — back to homepage"
              >
                <BrandMark size={32} />
                <span className="font-mono text-[15px] font-bold text-[var(--seis-text-primary)] tracking-tight">
                  SEIS-AI
                </span>
                <span className="badge-tag ml-1">v2.4</span>
              </Link>

              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-500 mb-3">
                WORKSPACE TOPOLOGY
              </div>
              <h1 className="text-2xl xl:text-3xl font-extrabold text-[var(--seis-text-primary)] leading-tight tracking-tight mb-4 font-mono">
                Isolated Environments for Living Codebases.
              </h1>
              <p className="text-[13.5px] text-[var(--seis-text-secondary)] leading-relaxed mb-6">
                Workspaces maintain distinct AST index caches, commit churn windows, and vector embeddings for grouped software repositories.
              </p>

              <div className="flex flex-wrap gap-2 mb-8">
                <div className="inline-flex items-center gap-2 border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] rounded px-3 py-1.5 font-mono text-[12px]">
                  <FolderGit2 size={13} className="text-blue-500" aria-hidden="true" />
                  <span className="font-semibold text-[var(--seis-text-primary)]">AST Cache Isolated</span>
                </div>
                <div className="inline-flex items-center gap-2 border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] rounded px-3 py-1.5 font-mono text-[12px]">
                  <LayoutGrid size={13} className="text-indigo-500" aria-hidden="true" />
                  <span className="font-semibold text-[var(--seis-text-primary)]">Multi-Repo Scope</span>
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={150}>
              <div className="rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] font-mono text-[11px] overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2 border-b border-[var(--seis-border-subtle)] bg-[var(--seis-surface-3)]">
                  <span className="text-[var(--seis-text-muted)]">SEIS_CORE // WORKSPACE_MANIFEST</span>
                  <span className="badge-ast">ONLINE</span>
                </div>
                <div className="p-3.5 space-y-2.5 text-[var(--seis-text-secondary)]">
                  <div className="flex items-center justify-between">
                    <span>Index Resolution</span>
                    <strong className="text-[var(--seis-text-primary)] font-mono">AST Tree-Sitter + Git</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Vector Persistence</span>
                    <strong className="text-[var(--seis-text-primary)] font-mono">ChromaDB Local Collection</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Citation Verification</span>
                    <strong className="text-emerald-500 font-mono">Strict File:Line Binding</strong>
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
              <div className="bg-[var(--seis-surface-1)] border border-[var(--seis-border-subtle)] rounded-lg shadow-sm p-6 sm:p-8 lg:p-9">

                {/* ---- Header + stepper ---- */}
                <div className="mb-6">
                  <h2 className="text-lg sm:text-xl font-bold text-[var(--seis-text-primary)] mb-1 font-mono tracking-tight">
                    Workspace Configuration
                  </h2>
                  <p className="text-[13px] text-[var(--seis-text-secondary)] mb-5">
                    Define an isolated analysis workspace for your repositories and AST indexes.
                  </p>
                  <OnboardingStepper currentStep={1} />
                </div>

                {existingWorkspacesStatus === 'ready' && existingWorkspaces.length > 0 && (
                  <div className="flex border-b border-[var(--seis-border-subtle)] mb-6 gap-6 font-mono text-[12px]">
                    <button
                      type="button"
                      onClick={() => setActiveTab('existing')}
                      className={`pb-2.5 font-bold border-b-2 transition-colors cursor-pointer ${
                        activeTab === 'existing'
                          ? 'border-blue-500 text-blue-500'
                          : 'border-transparent text-[var(--seis-text-muted)] hover:text-[var(--seis-text-primary)]'
                      }`}
                    >
                      Available Workspaces ({existingWorkspaces.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('create')}
                      className={`pb-2.5 font-bold border-b-2 transition-colors cursor-pointer ${
                        activeTab === 'create'
                          ? 'border-blue-500 text-blue-500'
                          : 'border-transparent text-[var(--seis-text-muted)] hover:text-[var(--seis-text-primary)]'
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
                    {/* ---- Workspace name ---- */}
                    <div className="mb-4">
                      <label htmlFor="workspace-name" className="flex items-center gap-1 text-[10.5px] font-mono font-bold uppercase tracking-wider text-[var(--seis-text-muted)] mb-1.5">
                        Workspace Identifier
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
                        placeholder="e.g. Core Architecture Lab"
                        className={`w-full h-10 px-3 rounded border text-[13.5px] font-mono text-[var(--seis-text-primary)] bg-[var(--seis-surface-2)] transition-colors ${
                          nameError
                            ? 'border-rose-500 focus-visible:border-rose-500'
                            : 'border-[var(--seis-border-subtle)] focus-visible:border-blue-500'
                        }`}
                      />
                      {nameError && (
                        <p id={nameErrorId} role="alert" className="flex items-center gap-1.5 text-[12px] font-mono text-rose-500 mt-1">
                          <AlertCircle size={12} className="shrink-0" aria-hidden="true" />
                          {nameError}
                        </p>
                      )}
                    </div>

                    {/* ---- Description ---- */}
                    <div className="mb-4">
                      <label htmlFor="workspace-description" className="block text-[10.5px] font-mono font-bold uppercase tracking-wider text-[var(--seis-text-muted)] mb-1.5">
                        Description / Domain Scope
                      </label>
                      <textarea
                        id="workspace-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        placeholder="e.g. Ingestion and evolution telemetry for microservices…"
                        className="w-full min-h-[72px] px-3 py-2 rounded border border-[var(--seis-border-subtle)] text-[13px] font-mono text-[var(--seis-text-primary)] bg-[var(--seis-surface-2)] transition-colors focus-visible:border-blue-500 resize-y"
                      />
                    </div>

                    {/* ---- Type + Org row ---- */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5 font-mono">
                      <div>
                        <label htmlFor="workspace-type" className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--seis-text-muted)] mb-1.5">
                          Deployment Type
                        </label>
                        <div className="relative">
                          <select
                            id="workspace-type"
                            value={workspaceType}
                            onChange={(e) => setWorkspaceType(e.target.value)}
                            className="w-full h-10 pl-3 pr-8 rounded border border-[var(--seis-border-subtle)] text-[12.5px] font-mono text-[var(--seis-text-primary)] appearance-none bg-[var(--seis-surface-2)] transition-colors focus-visible:border-blue-500"
                          >
                            {WORKSPACE_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--seis-text-muted)]" aria-hidden="true" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="org-name" className="block text-[10.5px] font-bold uppercase tracking-wider text-[var(--seis-text-muted)] mb-1.5">
                          Organization Tag <span className="normal-case font-normal text-[var(--seis-text-muted)]">(optional)</span>
                        </label>
                        <input
                          id="org-name"
                          type="text"
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          placeholder="e.g. Systems Engineering"
                          className="w-full h-10 px-3 rounded border border-[var(--seis-border-subtle)] text-[12.5px] font-mono text-[var(--seis-text-primary)] bg-[var(--seis-surface-2)] transition-colors focus-visible:border-blue-500"
                        />
                      </div>
                    </div>

                    {/* ---- Live preview ---- */}
                    <WorkspacePreview name={name.trim() || 'Workspace Preview'} />

                    {submitError && (
                      <p role="alert" className="flex items-center gap-1.5 text-[12px] font-mono text-rose-500 mt-3">
                        <AlertCircle size={12} className="shrink-0" aria-hidden="true" />
                        {submitError}
                      </p>
                    )}

                    {/* ---- Actions ---- */}
                    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 pt-4 border-t border-[var(--seis-border-subtle)]">
                      <Link
                        to="/login"
                        className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] text-[var(--seis-text-secondary)] hover:text-[var(--seis-text-primary)] text-[12px] font-mono font-medium no-underline transition-colors w-full sm:w-auto"
                      >
                        <ArrowLeft size={14} aria-hidden="true" />
                        Back to Auth
                      </Link>
                      <button
                        type="submit"
                        disabled={submitStatus === 'submitting'}
                        aria-busy={submitStatus === 'submitting'}
                        className="btn-tool-primary inline-flex items-center justify-center gap-2 h-9 px-4 rounded text-[12.5px] font-mono font-semibold cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-70 w-full sm:w-auto whitespace-nowrap"
                      >
                        {submitStatus === 'submitting' ? (
                          <>
                            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            Creating Workspace…
                          </>
                        ) : (
                          <>
                            <span>Initialize Workspace</span>
                            <ArrowRight size={14} aria-hidden="true" />
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

            <div className="flex items-center justify-center gap-6 mt-6 text-[11px] font-mono text-[var(--seis-text-muted)]">
              <a href="#" className="hover:text-[var(--seis-text-primary)] transition-colors no-underline">Telemetry Policy</a>
              <a href="#" className="hover:text-[var(--seis-text-primary)] transition-colors no-underline">Architecture Docs</a>
              <a href="#" className="hover:text-[var(--seis-text-primary)] transition-colors no-underline">Diagnostic Log</a>
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
    <div className="mb-6 font-mono">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--seis-text-muted)]">
          Registered Workspaces ({workspaces.length})
        </span>
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className="text-[11.5px] font-bold text-blue-500 hover:underline cursor-pointer"
          >
            + Create New
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5">
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
              className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--seis-surface-2)] border border-[var(--seis-border-subtle)] hover:border-[var(--seis-border-strong)] rounded p-3.5 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded bg-[var(--seis-surface-3)] text-[var(--seis-brand-blue)] border border-[var(--seis-border-subtle)] flex items-center justify-center shrink-0">
                  <LayoutGrid size={15} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-[13.5px] font-bold text-[var(--seis-text-primary)] truncate m-0 font-mono">
                    {workspace.name}
                  </h4>
                  {defaultRepoName ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--seis-text-secondary)] font-mono mt-0.5 truncate" title={`Default: ${defaultRepoName}`}>
                      <FolderGit2 size={11} className="text-blue-500 shrink-0" />
                      <span className="truncate">Default: <strong className="text-[var(--seis-text-primary)] font-semibold">{defaultRepoName}</strong></span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-[var(--seis-text-muted)] block mt-0.5 font-mono">
                      No linked repository
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto font-mono text-[12px]">
                {defaultRepoId ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onChangeRepo(workspace)}
                      className="inline-flex items-center gap-1 h-8 px-2.5 rounded bg-[var(--seis-surface-1)] hover:bg-[var(--seis-surface-3)] text-[var(--seis-text-secondary)] hover:text-[var(--seis-text-primary)] font-medium border border-[var(--seis-border-subtle)] cursor-pointer transition-colors"
                      title="Switch or choose a different repository for this workspace"
                    >
                      <FolderGit2 size={12} className="text-[var(--seis-text-muted)]" />
                      <span>Switch Repo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpen(workspace, defaultRepoId)}
                      className="btn-tool-primary inline-flex items-center gap-1.5 h-8 px-3 rounded font-semibold cursor-pointer transition-colors"
                      title="Open telemetry command center"
                    >
                      <span>Open Workspace</span>
                      <ArrowRight size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => onChangeRepo(workspace)}
                    className="btn-tool-primary inline-flex items-center gap-1.5 h-8 px-3 rounded font-semibold cursor-pointer transition-colors"
                  >
                    <span>Link Repository</span>
                    <ArrowRight size={13} />
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
      className="rounded border border-[var(--seis-border-subtle)] bg-[var(--seis-surface-2)] p-3 font-mono"
      aria-label="Workspace preview"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-[var(--seis-surface-3)] border border-[var(--seis-border-subtle)] flex items-center justify-center shrink-0">
          <BrandGlyph size={15} tone="neutral" />
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-[var(--seis-text-primary)] truncate">{name}</div>
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--seis-text-muted)] mt-0.5">
            <span className="badge-ast">READY FOR INGESTION</span>
            <span>·</span>
            <span className="flex items-center gap-1"><FolderGit2 size={10} aria-hidden="true" />Multi-Repo AST Target</span>
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
    <div className="min-h-screen w-full bg-[var(--seis-canvas)] flex items-center justify-center px-6 py-16 font-mono">
      <FadeIn direction="scale">
        <div
          role="status"
          aria-live="polite"
          className="w-full max-w-[460px] bg-[var(--seis-surface-1)] border border-[var(--seis-border-subtle)] rounded-lg shadow-sm px-8 py-10 text-center"
        >
          <div className="w-12 h-12 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={24} />
          </div>
          <h1 className="text-lg font-bold text-[var(--seis-text-primary)] mb-2 tracking-tight">
            Workspace Initialized
          </h1>
          <p className="text-[13px] text-[var(--seis-text-secondary)] leading-relaxed mb-6 font-sans">
            <span className="font-semibold text-[var(--seis-text-primary)] font-mono">{workspace.name}</span> active. Routing to repository selection…
          </p>
          <button
            type="button"
            onClick={handleContinue}
            className="btn-tool-primary w-full inline-flex items-center justify-center gap-2 h-10 px-5 rounded text-[13px] font-semibold transition-colors cursor-pointer"
          >
            Continue to Repository Selection
            <ArrowRight size={14} />
          </button>
        </div>
      </FadeIn>
    </div>
  );
}
