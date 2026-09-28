/**
 * Static UI copy only — not repository data. `SourceControlPage` uses this
 * exclusively for the Copilot drawer's suggested-question prompts: there is
 * no backend endpoint that generates repository-specific suggested
 * questions, so this remains a fixed list of prompts to try (same status as
 * CommandCenterPage/ArchitecturePage's own `SUGGESTED_QUESTIONS` constants).
 * Every other field this module previously exported (fabricated branches,
 * commits, pull requests, and insights with invented author names) was dead
 * code — never read by any component — and has been removed.
 */
export function buildSourceControlData() {
  return {
    copilotSuggestedQuestions: [
      'Which commits touched auth/ this week?',
      'Summarize recent changes on the default branch.',
      'Who are the most active contributors right now?',
      'What files change together most often?',
    ],
  };
}
