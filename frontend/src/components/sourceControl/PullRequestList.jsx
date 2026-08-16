import React from 'react';
import PullRequestRow from './PullRequestRow';

export default function PullRequestList({ pullRequests, onOpenPr }) {
  return (
    <ul className="flex flex-col gap-2">
      {pullRequests.map((pr) => (
        <PullRequestRow key={pr.id} pr={pr} onOpen={onOpenPr} />
      ))}
    </ul>
  );
}
