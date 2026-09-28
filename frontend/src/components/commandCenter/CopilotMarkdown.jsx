import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SAFE_URL_PATTERN = /^(https?:|mailto:|#|\/)/i;

/** Rejects `javascript:`/`data:`/any other unsafe scheme -- only real
 * http(s)/mailto/anchor/relative links render as clickable. */
function isSafeUrl(href) {
  return typeof href === 'string' && SAFE_URL_PATTERN.test(href.trim());
}

/**
 * Task 78: renders one real Copilot assistant answer as Markdown.
 *
 * Reconnaissance finding: `prompt_builder.py`'s system prompt
 * (`fastapi-ai-service/app/core/generation/prompt_builder.py`) never
 * instructs the model to use or avoid Markdown -- it only governs
 * grounding/citation-tag rules. `CopilotDrawer.jsx` previously rendered
 * `message.content` as plain text inside a `<div>` (React's normal JSX
 * text-escaping, never `dangerouslySetInnerHTML`), so any Markdown syntax
 * a real answer contained (headings, lists, bold, fenced code) rendered
 * as literal punctuation rather than structure -- confirmed by
 * inspection, not assumed broken.
 *
 * Security: `react-markdown` parses the source into an AST and renders a
 * real React element tree -- it never uses `dangerouslySetInnerHTML`,
 * and raw HTML embedded in the Markdown source is dropped by default
 * (no `rehype-raw` plugin is used here), so a prompt-injection attempt
 * embedded in retrieved repository content cannot execute as HTML/script
 * through this renderer. The `a` override below additionally rejects any
 * `javascript:`/unsafe-scheme href, rendering it as plain text instead of
 * a link.
 *
 * Citation independence: citations are never parsed out of this content.
 * `message.citations` (Task 75) is a separate array rendered by
 * `CopilotDrawer` entirely outside this component. This renderer does
 * not scan prose or fenced code for file-like strings and never turns
 * one into a link -- Task 75's citation pills remain the only clickable
 * file destinations, unaffected by anything here (Task 78 §8, Case C:
 * "code must remain code").
 */
export default function CopilotMarkdown({ content }) {
  return (
    <div className="min-w-0 text-[12.5px] leading-relaxed text-slate-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="m-0 mb-2 last:mb-0">{children}</p>,
          h1: ({ children }) => <h4 className="text-[13.5px] font-bold text-slate-900 mt-3 mb-1.5 first:mt-0">{children}</h4>,
          h2: ({ children }) => <h4 className="text-[13.5px] font-bold text-slate-900 mt-3 mb-1.5 first:mt-0">{children}</h4>,
          h3: ({ children }) => <h5 className="text-[12.5px] font-bold text-slate-900 mt-2.5 mb-1 first:mt-0">{children}</h5>,
          h4: ({ children }) => <h5 className="text-[12.5px] font-bold text-slate-900 mt-2.5 mb-1 first:mt-0">{children}</h5>,
          h5: ({ children }) => <h5 className="text-[12.5px] font-bold text-slate-900 mt-2 mb-1 first:mt-0">{children}</h5>,
          h6: ({ children }) => <h5 className="text-[12.5px] font-bold text-slate-900 mt-2 mb-1 first:mt-0">{children}</h5>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 flex flex-col gap-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 flex flex-col gap-1">{children}</ol>,
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) =>
            isSafeUrl(href) ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 underline hover:text-blue-800 break-words"
              >
                {children}
              </a>
            ) : (
              <span className="text-slate-700 underline decoration-dotted">{children}</span>
            ),
          // `[&_code]:...` on `pre` resets the inline-code pill styling
          // for any `code` nested inside a fenced block -- more robust
          // than relying on react-markdown's `code` component props to
          // distinguish inline vs. fenced (that signal was removed from
          // react-markdown's own API in v8+; a plain descendant-selector
          // override works identically regardless of that).
          pre: ({ children }) => (
            <pre className="max-w-full overflow-x-auto rounded-lg bg-white border border-slate-200 p-2.5 mb-2 last:mb-0 text-[11.5px] leading-relaxed [&_code]:bg-transparent [&_code]:border-0 [&_code]:p-0 [&_code]:rounded-none [&_code]:text-slate-800">
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => (
            <code
              className={`font-mono text-[11.5px] text-blue-700 bg-blue-50 border border-blue-100 rounded px-1 py-0.5 ${className ?? ''}`}
              {...props}
            >
              {children}
            </code>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-200 pl-3 text-slate-600 italic mb-2 last:mb-0">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-slate-200 my-2" />,
          table: ({ children }) => (
            <div className="max-w-full overflow-x-auto mb-2 last:mb-0">
              <table className="text-[11.5px] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold text-slate-700 whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-slate-200 px-2 py-1 text-slate-700">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
