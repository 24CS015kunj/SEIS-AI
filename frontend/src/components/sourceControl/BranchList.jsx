import React from 'react';
import BranchRow from './BranchRow';

export default function BranchList({ branches }) {
  if (branches.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center">
        <p className="text-[13px] text-slate-500 m-0">No branches synced for this repository yet.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {branches.map((branch) => (
        // Real Branch documents key on Mongo `_id`, not `id` (Task 57).
        <BranchRow key={branch._id} branch={branch} />
      ))}
    </ul>
  );
}
