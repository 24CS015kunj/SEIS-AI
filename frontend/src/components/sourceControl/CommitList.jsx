import React from 'react';
import { GitCommitHorizontal } from 'lucide-react';
import CommitRow from './CommitRow';

export default function CommitList({ commits, onOpenCommit }) {
  if (commits.length === 0) {
    return (
      <div className="bg-[#111A2C] border border-[#1E293B] rounded-xl p-8 text-center">
        <GitCommitHorizontal size={20} className="text-slate-600 mx-auto mb-2" aria-hidden="true" />
        <p className="text-[13px] text-slate-500 m-0">No commits on this branch yet.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {commits.map((commit) => (
        <CommitRow key={commit.id} commit={commit} onOpen={onOpenCommit} />
      ))}
    </ul>
  );
}
