import React, { useState, useEffect, useRef } from 'react';
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

function GlobalCursorSkyGlow() {
  const glowRef = useRef(null);

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (glowRef.current) {
        glowRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
      }
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 transition-opacity duration-300"
      aria-hidden="true"
    >
      <div
        ref={glowRef}
        className="absolute rounded-full transition-transform duration-75 ease-out filter blur-[70px]"
        style={{
          left: 0,
          top: 0,
          width: '560px',
          height: '560px',
          transform: 'translate3d(-1000px, -1000px, 0) translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(56, 189, 248, 0.18) 0%, rgba(14, 165, 233, 0.06) 55%, transparent 80%)',
        }}
      />
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [docsOpen, setDocsOpen] = useState(false);

  // All landing page CTAs lead to GitHub OAuth login
  const goToLogin = () => navigate('/login');

  return (
    <div className="landing-page relative min-h-screen w-full overflow-x-hidden bg-(--seis-canvas) text-(--seis-text-primary) transition-colors duration-200">
      <GlobalCursorSkyGlow />
      
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
