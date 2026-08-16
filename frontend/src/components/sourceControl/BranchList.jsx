import React from 'react';
import BranchRow from './BranchRow';

export default function BranchList({ branches }) {
  return (
    <ul className="flex flex-col gap-2">
      {branches.map((branch) => (
        <BranchRow key={branch.id} branch={branch} />
      ))}
    </ul>
  );
}
