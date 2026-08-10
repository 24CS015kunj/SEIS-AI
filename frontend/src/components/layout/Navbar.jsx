import React, { useState, useEffect } from 'react';
import { Menu, X, Cpu } from 'lucide-react';
import GithubIcon from '../common/GithubIcon';

const navLinks = [
  { name: 'Features', href: '#features' },
  { name: 'Workflow', href: '#how-it-works' },
  { name: 'Documentation', href: '#' },
  { name: 'About Us', href: '#who-uses-seis' },
];

export default function Navbar({ onOpenAuth, onOpenDocs }) {
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
    setMenuOpen(false);
  };

  return (
    <header
      style={{ height: '72px' }}
      className={`sticky top-0 z-50 bg-white/80 backdrop-blur-md transition-shadow duration-200 ${scrolled ? 'shadow-[0_1px_0_#E2E8F0]' : 'border-b border-[#E2E8F0]'
        }`}
    >
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8 h-full flex items-center justify-between gap-8">

        {/* Brand */}
        <a href="#hero" className="flex items-center gap-2.5 flex-shrink-0 group" style={{ textDecoration: 'none' }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Cpu size={18} color="#FFFFFF" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            SEIS AI
          </span>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={(e) => handleNavClick(e, link)}
              className="relative text-[15px] font-medium text-slate-600 hover:text-slate-900 transition-colors group py-1"
              style={{ textDecoration: 'none' }}
            >
              {link.name}
              <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-blue-600 transition-all duration-200 group-hover:w-full" />
            </a>
          ))}
        </nav>

        {/* Right Actions */}
        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={() => onOpenAuth('github')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 20px',
              height: 44,
              background: '#0F172A',
              color: '#FFFFFF',
              fontSize: 15,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#1E293B'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#0F172A'}
          >
            <GithubIcon className="w-4 h-4" />
            Continue with GitHub
          </button>
        </div>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden p-2 rounded-md text-[#64748B] hover:text-[#0F172A] hover:bg-slate-100 transition-colors"
          aria-label="Toggle menu"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {menuOpen && (
        <div className="md:hidden absolute top-[72px] left-0 right-0 bg-white border-b border-[#E2E8F0] z-50 shadow-sm">
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
            <button
              onClick={() => { setMenuOpen(false); onOpenAuth('github'); }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                height: 48,
                background: '#0F172A',
                color: '#FFFFFF',
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <GithubIcon className="w-5 h-5" />
              Continue with GitHub
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
