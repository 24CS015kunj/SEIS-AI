import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, Menu, UserRound, X } from 'lucide-react';
import ThemeToggle from '../common/ThemeToggle';
import { useAuth } from '../../context/AuthContext';

const navLinks = [
  { name: 'Capabilities', href: '#features' },
  { name: 'Pipeline', href: '#how-it-works' },
  { name: 'Roles', href: '#who-uses-seis' },
  { name: 'Documentation', href: '#' },
];

export default function Navbar({ onOpenAuth, onOpenDocs }) {
  const { user, status: authStatus } = useAuth();
  const isAuthenticated = authStatus === 'authenticated' && !!user;
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const handleNavClick = (e, link) => {
    if (link.href === '#') {
      e.preventDefault();
    }
    if (link.name === 'Documentation') {
      onOpenDocs?.();
    }
    setMenuOpen(false);
  };

  return (
    <header
      className={`sticky top-0 z-50 h-14 border-b transition-all duration-200 ${
        scrolled
          ? 'bg-(--seis-surface-1)/95 backdrop-blur-md border-(--seis-border-subtle) shadow-sm'
          : 'bg-(--seis-surface-1)/85 backdrop-blur-md border-(--seis-border-subtle)'
      }`}
    >
      <div className="max-w-310 mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between gap-6">

        {/* Brand */}
        <a
          href="#hero"
          className="group flex shrink-0 items-center gap-2.5 rounded-md no-underline outline-none focus-visible:ring-2 focus-visible:ring-(--seis-cyan) focus-visible:ring-offset-2 focus-visible:ring-offset-(--seis-canvas) seis-logo-entrance"
          aria-label="SEIS-AI homepage"
        >
          <img
            src="/logo.jpeg"
            alt=""
            className="h-8 w-8 shrink-0 rounded-full border border-(--seis-cyan)/40 object-cover"
          />
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="font-mono text-[14px] font-bold text-(--seis-text-primary) transition-colors duration-200 group-hover:text-(--seis-cyan)">
              SEIS-AI
            </span>
          </div>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={(e) => handleNavClick(e, link)}
              className="rounded-md px-3 py-1.5 text-[13px] font-medium text-(--seis-text-secondary) no-underline transition-all duration-150 hover:bg-(--seis-surface-hover) hover:text-(--seis-cyan) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--seis-cyan) focus-visible:ring-offset-2 focus-visible:ring-offset-(--seis-canvas)"
            >
              {link.name}
            </a>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="hidden lg:flex items-center gap-2">
          <ThemeToggle />

          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link
                to="/workspace"
                title="Your Workspaces"
                className="flex h-8 items-center gap-2 rounded-md border border-(--seis-border-subtle) bg-(--seis-surface-2) px-2.5 font-mono text-[12px] font-semibold text-(--seis-text-primary) no-underline transition-all duration-150 hover:border-(--seis-cyan) hover:text-(--seis-cyan)"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.githubUsername}
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <UserRound className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>@{user.githubUsername}</span>
              </Link>
              <Link
                to="/command-center"
                className="btn-tool-primary h-8 px-3.5 text-[12px] no-underline"
              >
                <span>Command Center</span>
              </Link>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuth?.('github')}
              className="btn-tool-primary h-8 px-3.5 text-[12.5px]"
            >
              <GitBranch size={14} aria-hidden="true" />
              <span>Connect Repository</span>
            </button>
          )}
        </div>

        {/* Mobile Toggle + Theme */}
        <div className="lg:hidden flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-md p-1.5 text-(--seis-text-secondary) hover:bg-(--seis-surface-hover) hover:text-(--seis-text-primary) transition-colors border border-(--seis-border-subtle)"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {menuOpen && (
        <div className="absolute left-0 right-0 top-14 z-50 border-b border-(--seis-border-subtle) bg-(--seis-surface-1) shadow-lg lg:hidden">
          <div className="px-5 py-4 space-y-0.5">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link)}
                className="block py-2.5 px-3 text-[13.5px] font-medium text-(--seis-text-secondary) hover:text-(--seis-text-primary) hover:bg-(--seis-surface-hover) rounded-md no-underline transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>
          <div className="border-t border-(--seis-border-subtle) px-5 py-4">
            {isAuthenticated ? (
              <div className="space-y-2">
                <Link
                  to="/command-center"
                  onClick={() => setMenuOpen(false)}
                  className="btn-tool-primary w-full h-10 text-[13px] no-underline"
                >
                  Enter Command Center (@{user.githubUsername})
                </Link>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onOpenAuth?.('github'); }}
                className="btn-tool-primary h-10 w-full text-[13px]"
              >
                <GitBranch size={14} aria-hidden="true" />
                Connect Repository
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
