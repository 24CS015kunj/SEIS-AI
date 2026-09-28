import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import HeroSection from '../components/landing/HeroSection';
import ProblemSection from '../components/landing/ProblemSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import EngineeringRolesSection from '../components/landing/EngineeringRolesSection';
import FinalCtaSection from '../components/landing/FinalCtaSection';
import Footer from '../components/layout/Footer';
import DocsModal from '../components/common/DocsModal';

export default function LandingPage() {
  const navigate = useNavigate();
  const [docsOpen, setDocsOpen] = useState(false);
  const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });

  // CTAs across the landing page all lead to the same place: the Login screen.
  const goToLogin = () => navigate('/login');

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div
      className="relative bg-[#F5F5F7] text-[#1D1D1F] min-h-screen w-full overflow-y-auto overflow-x-hidden scroll-smooth"
    >
      {/* 1. Luminous Apple Ambient Aurora Wallpaper */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1340px] h-[640px] pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[800px] sm:w-[1040px] h-[480px] bg-gradient-to-b from-[#0071E3]/18 via-[#AF52DE]/10 to-transparent rounded-full blur-[110px]" />
        <div className="absolute top-[120px] left-1/6 w-[480px] h-[360px] bg-[#32ADE6]/12 rounded-full blur-[100px]" />
        <div className="absolute top-[80px] right-1/6 w-[420px] h-[320px] bg-[#FF9500]/08 rounded-full blur-[100px]" />
      </div>

      {/* 2. Interactive Cursor Spotlight */}
      <div
        className="fixed z-0 pointer-events-none transition-opacity duration-300 ease-out"
        style={{
          width: '750px',
          height: '750px',
          left: 0,
          top: 0,
          transform: `translate(${mousePos.x - 375}px, ${mousePos.y - 375}px)`,
          background: 'radial-gradient(circle, rgba(0,113,227,0.08) 0%, rgba(175,82,222,0.04) 40%, transparent 70%)',
          filter: 'blur(60px)',
          opacity: mousePos.x === -1000 ? 0 : 1,
        }}
      />

      <div className="relative z-10">
        <Navbar onOpenAuth={goToLogin} onOpenDocs={() => setDocsOpen(true)} />

        <main>
          <HeroSection onOpenAuth={goToLogin} />
          <ProblemSection />
          <HowItWorksSection />
          <FeaturesSection />
          <EngineeringRolesSection />
          <FinalCtaSection onOpenAuth={goToLogin} />
        </main>

        <Footer onOpenDocs={() => setDocsOpen(true)} />
      </div>

      <DocsModal
        isOpen={docsOpen}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
