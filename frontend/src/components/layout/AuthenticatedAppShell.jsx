import React from 'react';
import EngineeringBackground from '../common/EngineeringBackground';

/**
 * Shared authenticated layout wrapper: optional engineering backdrop +
 * sidebar slot + main column (header + page content).
 */
export default function AuthenticatedAppShell({
  sidebar,
  children,
  showBackground = true,
  className = 'relative min-h-screen w-full bg-[#F8FAFC] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 flex transition-colors duration-200',
}) {
  return (
    <div className={className}>
      {showBackground && <EngineeringBackground />}
      {sidebar}
      <div className="flex-1 min-w-0 flex flex-col relative z-10">{children}</div>
    </div>
  );
}
