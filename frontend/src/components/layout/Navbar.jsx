import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import GithubIcon from '../common/GithubIcon';
import BrandMark from '../common/BrandMark';
import ThemeToggle from '../common/ThemeToggle';
import { useAuth } from '../../context/AuthContext';

const navLinks = [
  { name: 'Features', href: '#features' },
  { name: 'Workflow', href: '#how-it-works' },
  { name: 'Documentation', href: '#' },
  { name: 'About Us', href: '#who-uses-seis' },
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
      onOpenDocs();
    }
    setMenuOpen(false);
  };

  return (
    <header
      style={{ height: '68px' }}
      className={`sticky top-0 z-50 tech-glass transition-all duration-200 ${
        scrolled ? 'shadow-[0_1px_3px_0_rgba(15,23,42,0.06)] border-b border-slate-200' : 'border-b border-slate-200/70'
      }`}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8 h-full flex items-center justify-between gap-8">

        {/* Brand — same mark used across Login/Workspace/Import/Command Center */}
        <a href="#hero" className="flex items-center gap-2.5 flex-shrink-0 group no-underline">
          <BrandMark size={30} />
          <span className="text-[15px] font-bold text-slate-900 tracking-tight flex items-center gap-2">
            SEIS AI Copilot
            <span className="hidden sm:inline-block font-mono text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200/70 rounded px-1.5 py-0.5">
              v1.0
            </span>
          </span>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-7">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={(e) => handleNavClick(e, link)}
              className="relative text-[14px] font-medium text-slate-600 hover:text-slate-950 transition-colors group py-1.5"
              style={{ textDecoration: 'none' }}
            >
              {link.name}
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-blue-600 rounded-full transition-all duration-200 group-hover:w-full" />
            </a>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="hidden lg:flex items-center gap-3">
          <ThemeToggle />
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                title="Account Details & Confirmation"
                className="flex items-center gap-2 h-9 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200/80 transition-colors no-underline text-slate-800 text-[13px] font-medium border border-slate-200"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.githubUsername}
                    className="w-5 h-5 rounded-full object-cover border border-white"
                  />
                ) : (
                  <GithubIcon className="w-4 h-4 text-slate-700" />
                )}
                <span>@{user.githubUsername}</span>
              </Link>
              <Link
                to="/workspace"
                className="btn-apple-primary h-9 px-3.5 text-[13px] rounded-lg font-semibold flex items-center justify-center no-underline"
              >
                <span>Workspace</span>
              </Link>
            </div>
          ) : (
            <button
              onClick={() => onOpenAuth('github')}
              className="btn-dev-primary h-10 px-4 text-[13.5px] gap-2 rounded-lg font-semibold"
            >
              <GithubIcon className="w-4 h-4" />
              <span>Connect GitHub</span>
            </button>
          )}
        </div>

        {/* Mobile Toggle + Theme */}
        <div className="lg:hidden flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Toggle menu"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {menuOpen && (
        <div className="lg:hidden absolute top-[72px] left-0 right-0 bg-white border-b border-[#E2E8F0] z-50 shadow-sm">
          <div className="px-6 py-5 space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                onClick={(e) => handleNavClick(e, link)}
                style={{ fontSize: 15, fontWeight: 500, color: '#0F172A', textDecoration: 'none' }}
                className="block py-2.5 hover:text-[#2563EB] transition-colors"
              >
                {link.name}
              </a>
            ))}
          </div>
          <div className="px-6 pb-6 pt-4 border-t border-[#E2E8F0] space-y-3">
            {isAuthenticated ? (
              <div className="space-y-2">
                <Link
                  to="/workspace"
                  onClick={() => setMenuOpen(false)}
                  className="btn-apple-primary w-full h-11 gap-2 rounded-lg font-semibold text-[14px] flex items-center justify-center no-underline"
                >
                  {user.avatarUrl && (
                    <img
                      src={user.avatarUrl}
                      alt={user.githubUsername}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  )}
                  <span>Go to Workspace (@{user.githubUsername})</span>
                </Link>
                <Link
                  to="/login"
                  onClick={() => setMenuOpen(false)}
                  className="w-full h-10 text-[13px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-lg flex items-center justify-center gap-2 no-underline"
                >
                  Manage Account & Switch User
                </Link>
              </div>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); onOpenAuth('github'); }}
                className="btn-dev-primary w-full h-11 gap-2 rounded-lg font-semibold text-[14px]"
              >
                <GithubIcon className="w-4 h-4" />
                Connect GitHub
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
