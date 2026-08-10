import React, { useEffect, useRef, useState } from 'react';

export default function FadeIn({ children, delay = 0, direction = 'zoom', className = '' }) {
  const [isVisible, setIsVisible] = useState(false);
  const domRef = useRef();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
    );

    const currentRef = domRef.current;
    if (currentRef) observer.observe(currentRef);

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, []);

  const getHiddenClasses = () => {
    switch (direction) {
      case 'left': return 'opacity-0 -translate-x-12';
      case 'right': return 'opacity-0 translate-x-12';
      case 'scale': return 'opacity-0 scale-95';
      case 'zoom':
        // Down to up + zoom effect
        return 'opacity-0 translate-y-24 scale-[0.85]';
      case 'up':
      default:
        return 'opacity-0 translate-y-12';
    }
  };

  const getVisibleClasses = () => {
    switch (direction) {
      case 'left':
      case 'right':
        return 'opacity-100 translate-x-0';
      case 'scale': return 'opacity-100 scale-100';
      case 'zoom':
        return 'opacity-100 translate-y-0 scale-100';
      case 'up':
      default:
        return 'opacity-100 translate-y-0';
    }
  };

  return (
    <div
      ref={domRef}
      className={`transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isVisible ? getVisibleClasses() : getHiddenClasses()
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
