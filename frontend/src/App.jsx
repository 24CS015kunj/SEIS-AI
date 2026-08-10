import React, { useState, useEffect } from 'react';
import Navbar from './components/layout/Navbar';
import HeroSection from './components/landing/HeroSection';
import ProblemSection from './components/landing/ProblemSection';
import HowItWorksSection from './components/landing/HowItWorksSection';
import FeaturesSection from './components/landing/FeaturesSection';
import EngineeringRolesSection from './components/landing/EngineeringRolesSection';
import Footer from './components/layout/Footer';
import AuthModal from './components/common/AuthModal';
import DocsModal from './components/common/DocsModal';

export default function App() {
  const [authModal, setAuthModal] = useState({ open: false, mode: 'github' });
  const [docsOpen, setDocsOpen] = useState(false);
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });

  const openAuth = (mode = 'github') => setAuthModal({ open: true, mode });
  const closeAuth = () => setAuthModal((s) => ({ ...s, open: false }));

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      style={{
        height: '100vh',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: '#0F172A',
      }}
      className="relative bg-[#FAFAFA] h-screen w-full overflow-y-auto overflow-x-hidden scroll-smooth"
    >
      {/* 1. Base Subtle Dot Grid */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      
      {/* 2. Antigravity Glowing Spotlight Circle */}
      <div 
        className="fixed z-0 pointer-events-none transition-opacity duration-300 ease-out mix-blend-multiply"
        style={{
          width: '800px',
          height: '800px',
          left: 0,
          top: 0,
          transform: `translate(${mousePos.x - 400}px, ${mousePos.y - 400}px)`,
          background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(139,92,246,0.08) 40%, transparent 70%)',
          filter: 'blur(40px)',
          opacity: mousePos.x === -1000 ? 0 : 1
        }}
      />

      <div className="relative z-10">
        <Navbar onOpenAuth={openAuth} onOpenDocs={() => setDocsOpen(true)} />

        <main>
          <HeroSection onOpenAuth={openAuth} />
          <ProblemSection />
          <HowItWorksSection />
          <FeaturesSection />
          <EngineeringRolesSection />
        </main>

        <Footer onOpenDocs={() => setDocsOpen(true)} />
      </div>

      <AuthModal
        isOpen={authModal.open}
        onClose={closeAuth}
        mode={authModal.mode}
      />
      <DocsModal
        isOpen={docsOpen}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
