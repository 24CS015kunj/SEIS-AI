import React, { useState } from 'react';
import Navbar from '../components/layout/Navbar';
import HeroSection from '../components/landing/HeroSection';
import ProblemSection from '../components/landing/ProblemSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import EngineeringRolesSection from '../components/landing/EngineeringRolesSection';
import Footer from '../components/layout/Footer';
import DocsModal from '../components/common/DocsModal';

export default function Home() {
  const [docsOpen, setDocsOpen] = useState(false);

  return (
    <div className="relative z-10">
      <Navbar onOpenDocs={() => setDocsOpen(true)} />

      <main>
        <HeroSection />
        <ProblemSection />
        <HowItWorksSection />
        <FeaturesSection />
        <EngineeringRolesSection />
      </main>

      <Footer onOpenDocs={() => setDocsOpen(true)} />

      <DocsModal
        isOpen={docsOpen}
        onClose={() => setDocsOpen(false)}
      />
    </div>
  );
}
