import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Sparkles, Send, Loader2, AlertCircle, ArrowUpRight, RotateCcw, Eye } from 'lucide-react';
import { sendChatMessage, streamRepositoryChat } from '../../services/repositoryService';
import CopilotMarkdown from './CopilotMarkdown';
import CitationDrawer from '../chat/CitationDrawer';

/**
 * Categorizes and formats errors into actionable, human-friendly messages
 * with clear troubleshooting guidance and retry capability.
 */
function formatChatError(err) {
  const status = err.response?.status;
  const code = err.response?.data?.code;
  const rawMsg = err.response?.data?.message || err.message || '';

  if (
    status === 429 ||
    code === 'RATE_LIMIT_EXCEEDED' ||
    code === 'LLM_RATE_LIMIT' ||
    /rate[- ]limit|quota/i.test(rawMsg)
  ) {
    return {
      title: 'Rate Limit / Quota Exceeded',
      message:
        'The AI service rate limit or API quota has been reached. Please check your API credits or try again in a few moments.',
      canRetry: true,
    };
  }

  if (
    status === 503 ||
    code === 'SERVICE_UNAVAILABLE' ||
    code === 'SERVICE_DISCONNECTED' ||
    /socket hang up|ECONNREFUSED|ECONNRESET|offline/i.test(rawMsg)
  ) {
    return {
      title: 'AI Service Disconnected / Quota Limited',
      message:
        'The AI service connection was interrupted. This occurs when the AI container is restarting or when the external AI provider (NVIDIA API) is quota-limited.',
      canRetry: true,
    };
  }

  if (status === 504 || code === 'TIMEOUT' || /timeout|timed out/i.test(rawMsg)) {
    return {
      title: 'Request Timed Out',
      message:
        'The AI service took too long to generate a response. Please try asking again.',
      canRetry: true,
    };
  }

  return {
    title: 'Assistant Error',
    message: rawMsg || 'The AI Copilot could not answer that question. Please try again.',
    canRetry: true,
  };
}

/**
 * Task 75: a citation is only ever rendered as clickable when its
 * `file_path` looks like a real repository-relative path.
 */
function isRepositoryRelativePath(filePath) {
  if (typeof filePath !== 'string') return false;
  const trimmed = filePath.trim();
  if (!trimmed) return false;
  if (/^([a-z][a-z0-9+.-]*:)?\/\//i.test(trimmed)) return false; // absolute URL
  if (trimmed.startsWith('/')) return false; // rooted filesystem path, not repo-relative
  return true;
}
export default function CopilotDrawer({ repository, repositoryId, suggestedQuestions, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [activeCitation, setActiveCitation] = useState(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const messagesEndRef = useRef(null);
  const hadMessagesRef = useRef(false);
  const conversationIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `conv-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  const canChat = Boolean(repositoryId);

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

  async function submitMessage(text, options = {}) {
    const trimmed = text.trim();
    if (!trimmed || sending || !canChat) return;

    const { retryErrorId } = options;
    const assistantId = `a-${Date.now()}`;

    if (retryErrorId) {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== retryErrorId),
        { id: assistantId, role: 'assistant', content: '', citations: [], isStreaming: true }
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: 'user', content: trimmed },
        { id: assistantId, role: 'assistant', content: '', citations: [], isStreaming: true }
      ]);
    }
    setInput('');
    setSending(true);

    try {
      await streamRepositoryChat(
        repositoryId,
        trimmed,
        conversationIdRef.current,
        {
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: msg.content + token }
                  : msg
              )
            );
          },
          onDone: (data) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? {
                      ...msg,
                      citations: Array.isArray(data.citations) ? data.citations : [],
                      isStreaming: false,
                    }
                  : msg
              )
            );
          },
          onError: (errMsg) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, isError: true, content: errMsg || 'Error streaming response.', isStreaming: false }
                  : msg
              )
            );
          },
        }
      );
    } catch (err) {
      // Fallback to non-streaming sendChatMessage if streaming connection fails
      try {
        const result = await sendChatMessage(repositoryId, trimmed, conversationIdRef.current);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: result.answer,
                  citations: Array.isArray(result.citations) ? result.citations : [],
                  isStreaming: false,
                }
              : msg
          )
        );
      } catch (fallbackErr) {
        const formatted = formatChatError(fallbackErr);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  isError: true,
                  errorTitle: formatted.title,
                  content: formatted.message,
                  retryPrompt: trimmed,
                  canRetry: formatted.canRetry,
                  isStreaming: false,
                }
              : msg
          )
        );
      }
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
                    <div className="flex flex-col gap-1.5 min-w-0 max-w-[85%]">
                      {m.isError ? (
                        <div className="min-w-0 rounded-[2px_12px_12px_12px] p-3 border bg-rose-50 border-rose-200 text-rose-800 text-[12.5px] leading-relaxed flex flex-col gap-2">
                          <div className="flex items-center gap-1.5 font-semibold text-rose-900 text-[12.5px]">
                            <span>{m.errorTitle || 'Assistant Error'}</span>
                          </div>
                          <p className="m-0 text-slate-700 text-[12px] leading-relaxed">{m.content}</p>
                          {m.canRetry && m.retryPrompt && (
                            <div className="pt-1 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={() => submitMessage(m.retryPrompt, { retryErrorId: m.id })}
                                disabled={sending}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-medium text-rose-700 bg-white border border-rose-200 rounded-md hover:bg-rose-100/70 active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                              >
                                <RotateCcw size={11} className={sending ? 'animate-spin' : ''} aria-hidden="true" />
                                <span>Retry</span>
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="min-w-0 rounded-[2px_12px_12px_12px] px-3.5 py-3 border bg-slate-50 border-slate-200 text-slate-800">
                          <CopilotMarkdown content={m.content} />
                        </div>
                      )}
                      {m.citations && m.citations.length > 0 && (
                        <div className="flex flex-wrap gap-1 px-0.5">
                          {m.citations.map((c, i) => {
                            const label = `${c.file_path}${c.start_line != null ? `:${c.start_line}-${c.end_line}` : ''}`;
                            return (
                              <button
                                key={`${m.id}-cite-${i}`}
                                type="button"
                                onClick={() => setActiveCitation(c)}
                                aria-label={`Inspect citation ${c.file_path}`}
                                className="inline-flex items-center gap-1 max-w-full text-[11px] font-mono text-blue-700 bg-blue-50 border border-blue-100 rounded-full pl-2 pr-2 py-0.5 cursor-pointer transition-colors hover:bg-blue-100 hover:border-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                              >
                                <Eye size={10} className="shrink-0 text-blue-500" aria-hidden="true" />
                                <span className="truncate">{label}</span>
                              </button>
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

        <CitationDrawer
          repositoryId={repositoryId}
          citation={activeCitation}
          isOpen={Boolean(activeCitation)}
          onClose={() => setActiveCitation(null)}
        />
      </aside>
  );
}
