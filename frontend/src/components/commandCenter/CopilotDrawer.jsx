import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Sparkles, Send, Loader2, AlertCircle, ArrowUpRight } from 'lucide-react';
import { sendChatMessage } from '../../services/repositoryService';
import CopilotMarkdown from './CopilotMarkdown';

/**
 * Task 75: a citation is only ever rendered as clickable when its
 * `file_path` (`fastapi-ai-service/app/domain/models.py`'s `Citation`
 * model -- `file_path`, `start_line`, `end_line`, `chunk_id`, no
 * `document_type` field) looks like a real repository-relative path, not
 * an absolute URL or a rooted filesystem path. This is a cheap shape
 * check, not an existence claim -- it cannot know whether the file still
 * exists in the currently synced tree (only Architecture's own
 * `findNodeByPath`, run against real synced file data, can determine
 * that). Today every citation the live retrieval pipeline can produce
 * does trace back to a real synced repository file (confirmed by
 * inspection: the only non-file `DocumentType`, `EVOLUTION_REPORT`, is
 * produced by `EvolutionAnalysisService`, which has no reachable API
 * route yet per Task 74's findings) -- this check exists as a durable
 * guard for if that ever changes, not because it's expected to reject
 * anything today.
 */
function isRepositoryRelativePath(filePath) {
  if (typeof filePath !== 'string') return false;
  const trimmed = filePath.trim();
  if (!trimmed) return false;
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(trimmed)) return false; // absolute URL
  if (trimmed.startsWith('/')) return false; // rooted filesystem path, not repo-relative
  return true;
}

/**
 * Real AI Copilot chat (Task 59), proxied through Express to the live,
 * already-verified FastAPI repository chat pipeline (Task 54/55):
 * retrieve -> rerank -> build context -> Gemini -> cite. No mock answers --
 * `suggestedQuestions` remain a static list of prompts to try, but clicking
 * one now sends a real request exactly like typing it would.
 *
 * `repositoryId` is the repository's real Mongo `_id` (Task 48's identity
 * chain), separate from `repository`, which is display-only text (owner/
 * name for the header) and never carries an `_id`. When `repositoryId` is
 * null -- this page wasn't opened from a real, synced repository -- chat is
 * disabled with an honest message instead of silently no-op'ing or, worse,
 * answering from nothing.
 *
 * Task 75: a citation's Architecture deep-link is always built from this
 * exact `repositoryId` prop -- never a cached, stored, or previously seen
 * value -- so a citation from an old conversation can never navigate to a
 * repository other than the one this drawer instance is currently open
 * for. Closing the drawer (this component unmounting) already discards
 * `messages`/citations entirely; the same `key={repositoryId}` remount
 * every host page already applies to itself covers the rest. Rendered as
 * a real `<Link>` (a genuine `<a href>`), not a button with a programmatic
 * `navigate()` call -- navigation is the citation's primary action, so it
 * gets real anchor semantics: middle-click/open-in-new-tab, a visible
 * href on hover, and no dependency on JS re-implementing what an anchor
 * already does.
 */
export default function CopilotDrawer({ repository, repositoryId, suggestedQuestions, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const messagesEndRef = useRef(null);
  const hadMessagesRef = useRef(false);
  // One conversation_id per drawer session, generated once and passed
  // through unchanged on every message. Closing/reopening the drawer
  // unmounts this component (see the parent's `{copilotOpen && ...}`),
  // which discards this ref along with `messages` -- so a fresh open
  // always starts a fresh conversation_id/history pair. FastAPI persists
  // the actual conversation history server-side, keyed by
  // (repository_id, conversation_id), as of Task 65 (see
  // conversation_store.py) -- this id is still only generated here, never
  // the repository id, which always comes from `repositoryId` above.
  const conversationIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  const canChat = Boolean(repositoryId);

  // Independent of focus: if the answer swap unmounts whatever the user had
  // focused (e.g. the suggested-question button they just clicked), focus
  // silently falls back to <body>, which is outside `panelRef` and would
  // otherwise stop Escape/Tab from reaching the handlers below. A
  // document-level listener keeps Escape working regardless of focus state.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Re-anchor focus inside the dialog the first time the suggested-question
  // list unmounts (i.e. the first message is sent), so keyboard users are
  // never dropped back to the page body.
  useEffect(() => {
    const hasMessages = messages.length > 0;
    if (hasMessages && !hadMessagesRef.current) {
      closeRef.current?.focus();
    }
    hadMessagesRef.current = hasMessages;
  }, [messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, sending]);

  async function submitMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || sending || !canChat) return;

    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', content: trimmed }]);
    setInput('');
    setSending(true);

    try {
      const result = await sendChatMessage(repositoryId, trimmed, conversationIdRef.current);
      if (result?.conversationId) {
        conversationIdRef.current = result.conversationId;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: result.answer,
          citations: Array.isArray(result.citations) ? result.citations : [],
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          isError: true,
          content:
            err.response?.data?.message ||
            'The AI Copilot could not answer that question. Please try again.',
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const handleFormSubmit = (e) => {
    e.preventDefault();
    submitMessage(input);
  };

  return (
    <aside
      ref={panelRef}
      role="region"
      aria-label={`AI Copilot for ${repository.owner}/${repository.name}`}
      className="fixed bottom-0 right-0 sm:bottom-4 sm:right-4 z-40 w-full sm:w-[380px] h-[calc(100vh-3.5rem)] sm:h-[580px] max-h-[90vh] bg-white border border-slate-200 shadow-xl rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden transition-all duration-200"
    >
      <div className="flex items-center justify-between gap-3 h-13 px-4 border-b border-slate-200 shrink-0 bg-slate-50/70">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Sparkles size={13} className="text-blue-600" aria-hidden="true" />
          </span>
          <h2 id="copilot-drawer-title" className="text-[13px] font-bold text-slate-900 truncate">
            AI Copilot — {repository.owner}/{repository.name}
          </h2>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close AI Copilot"
          className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 shrink-0 transition-colors"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-4">
          {!canChat ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="text-[12.5px] text-slate-500 leading-relaxed m-0">
                Open this page from a real, synced repository to use AI Copilot.
              </p>
            </div>
          ) : (
            <>
              {messages.length === 0 && (
                <>
                  <p className="text-[12.5px] text-slate-500 leading-relaxed m-0">
                    Ask a question about this repository, or try one of the suggestions below.
                  </p>
                  <div className="flex flex-col gap-2">
                    {suggestedQuestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => submitMessage(q)}
                        className="text-left text-[12.5px] text-slate-600 bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 hover:bg-slate-50 hover:border-blue-300 transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] bg-blue-600 border border-blue-600 rounded-[12px_12px_2px_12px] px-3.5 py-2.5 text-[12.5px] text-white">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-2.5 items-start">
                    <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      {m.isError ? (
                        <AlertCircle size={13} className="text-rose-600" aria-hidden="true" />
                      ) : (
                        <Sparkles size={13} className="text-blue-600" aria-hidden="true" />
                      )}
                    </span>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div
                        className={`min-w-0 rounded-[2px_12px_12px_12px] px-3.5 py-3 border ${
                          m.isError
                            ? 'bg-rose-50 border-rose-200 text-rose-700 text-[12.5px] leading-relaxed'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        {/* Task 78: only real assistant answers go through
                            Markdown rendering -- error bubbles are static,
                            app-generated strings (never model output) and
                            stay plain text exactly as before. */}
                        {m.isError ? m.content : <CopilotMarkdown content={m.content} />}
                      </div>
                      {m.citations && m.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-0.5">
                          {m.citations.map((c, i) => {
                            const label = `${c.file_path}${c.start_line != null ? `:${c.start_line}-${c.end_line}` : ''}`;
                            const clickable = Boolean(repositoryId) && isRepositoryRelativePath(c.file_path);

                            if (!clickable) {
                              return (
                                <span
                                  key={`${m.id}-cite-${i}`}
                                  className="inline-flex items-center max-w-full text-[11px] font-mono text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5"
                                >
                                  <span className="truncate">{label}</span>
                                </span>
                              );
                            }

                            return (
                              <Link
                                key={`${m.id}-cite-${i}`}
                                to={`/architecture/${repositoryId}?file=${encodeURIComponent(c.file_path)}`}
                                onClick={onClose}
                                aria-label={`Open ${c.file_path} in Architecture`}
                                className="inline-flex items-center gap-0.5 max-w-full text-[11px] font-mono text-blue-700 bg-blue-50 border border-blue-100 rounded-full pl-2 pr-1.5 py-0.5 no-underline transition-colors hover:bg-blue-100 hover:border-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                              >
                                <span className="truncate">{label}</span>
                                <ArrowUpRight size={10} className="shrink-0" aria-hidden="true" />
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}

              {sending && (
                <div className="flex gap-2.5 items-start">
                  <span className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <Loader2
                      size={13}
                      className="text-blue-600 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                  </span>
                  <div className="bg-slate-50 border border-slate-200 rounded-[2px_12px_12px_12px] px-3.5 py-3 text-[12.5px] text-slate-500">
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        <form onSubmit={handleFormSubmit} className="px-5 py-4 border-t border-slate-200 shrink-0">
          <label htmlFor="copilot-input" className="sr-only">Ask about this repository</label>
          <div className="flex items-center gap-2 h-11 px-3.5 rounded-lg border border-slate-200 bg-white focus-within:border-blue-500 transition-colors">
            <input
              id="copilot-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!canChat || sending}
              placeholder={canChat ? 'Ask about the repository…' : 'Ask about the repository… (unavailable)'}
              className="flex-1 bg-transparent text-[12.5px] text-slate-900 placeholder:text-slate-400 border-0 outline-none disabled:cursor-not-allowed disabled:text-slate-400"
            />
            <button
              type="submit"
              disabled={!canChat || sending || input.trim().length === 0}
              aria-label="Send"
              className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center bg-blue-600 text-white enabled:hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              <Send size={14} aria-hidden="true" />
            </button>
          </div>
        </form>
      </aside>
  );
}
