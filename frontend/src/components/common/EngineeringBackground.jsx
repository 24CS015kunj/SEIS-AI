import React, { useEffect, useRef } from 'react';

/**
 * Apple HIG Ambient Mesh Wallpaper & Interactive Light Layer
 *
 * Implements Apple's macOS/visionOS luminous grouped canvas:
 *  - Primary grouped background: #F5F5F7
 *  - Smooth multi-chromatic ambient orbs: Apple System Blue (#0071E3),
 *    System Purple (#AF52DE), System Cyan (#32ADE6), System Green (#34C759)
 *  - Zero blueprint dot grids, zero wireframe meshes
 *  - Organic harmonic breathing motion
 *  - Subtle interactive cursor light refraction that breathes through Liquid Glass
 *  - 100% non-blocking (pointer-events: none, z-0)
 *  - Optimized for 60fps with requestAnimationFrame and lerp interpolation
 */
export default function EngineeringBackground() {
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -1000, y: -1000, targetX: -1000, targetY: -1000 });
  const animFrameIdRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const isReducedMotion = reducedMotionQuery.matches;
    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    let width = 0;
    let height = 0;
    let dpr = 1;
    let time = 0;

    function resize() {
      if (!canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
    }

    // Dynamic Apple system color luminous ambient orbs
    const orbs = [
      {
        baseX: 0.25,
        baseY: 0.18,
        radius: 340,
        color: 'rgba(0, 113, 227, 0.085)', // Apple System Blue
        speedX: 0.0006,
        speedY: 0.0008,
        phase: 0,
      },
      {
        baseX: 0.78,
        baseY: 0.28,
        radius: 380,
        color: 'rgba(175, 82, 222, 0.075)', // Apple System Purple
        speedX: 0.0007,
        speedY: 0.0005,
        phase: 1.8,
      },
      {
        baseX: 0.5,
        baseY: 0.72,
        radius: 420,
        color: 'rgba(50, 173, 230, 0.065)', // Apple System Cyan
        speedX: 0.0005,
        speedY: 0.0007,
        phase: 3.2,
      },
      {
        baseX: 0.15,
        baseY: 0.82,
        radius: 320,
        color: 'rgba(52, 199, 89, 0.055)', // Apple System Green
        speedX: 0.0008,
        speedY: 0.0006,
        phase: 4.5,
      },
      {
        baseX: 0.85,
        baseY: 0.8,
        radius: 360,
        color: 'rgba(255, 149, 0, 0.045)', // Apple System Orange
        speedX: 0.0006,
        speedY: 0.0009,
        phase: 2.3,
      },
    ];

    function handleMouseMove(e) {
      if (isTouchDevice) return;
      mouseRef.current.targetX = e.clientX;
      mouseRef.current.targetY = e.clientY;
    }

    function handleMouseLeave() {
      mouseRef.current.targetX = -1000;
      mouseRef.current.targetY = -1000;
    }

    function render() {
      ctx.clearRect(0, 0, width, height);
      time += 1;

      // Mouse position interpolation
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.06;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.06;

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // 1. Draw organic Apple ambient luminous orbs
      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        const cx = width * orb.baseX + Math.sin(time * orb.speedX + orb.phase) * 60;
        const cy = height * orb.baseY + Math.cos(time * orb.speedY + orb.phase) * 50;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, orb.radius);
        gradient.addColorStop(0, orb.color);
        gradient.addColorStop(0.7, orb.color.replace(/[\d.]+\)$/, '0.015)'));
        gradient.addColorStop(1, 'rgba(245, 245, 247, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Subtle interactive cursor light refraction
      if (!isTouchDevice && !isReducedMotion && mx > 0 && my > 0) {
        const cursorGlow = ctx.createRadialGradient(mx, my, 0, mx, my, 220);
        cursorGlow.addColorStop(0, 'rgba(0, 113, 227, 0.055)');
        cursorGlow.addColorStop(0.5, 'rgba(175, 82, 222, 0.025)');
        cursorGlow.addColorStop(1, 'rgba(245, 245, 247, 0)');

        ctx.fillStyle = cursorGlow;
        ctx.beginPath();
        ctx.arc(mx, my, 220, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!isReducedMotion) {
        animFrameIdRef.current = requestAnimationFrame(render);
      }
    }

    resize();

    window.addEventListener('resize', resize);
    if (!isTouchDevice) {
      window.addEventListener('mousemove', handleMouseMove, { passive: true });
      window.addEventListener('mouseleave', handleMouseLeave);
    }

    if (!isReducedMotion) {
      animFrameIdRef.current = requestAnimationFrame(render);
    } else {
      render();
    }

    return () => {
      window.removeEventListener('resize', resize);
      if (!isTouchDevice) {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseleave', handleMouseLeave);
      }
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none"
    >
      {/* Soft Apple Vignette Lighting */}
      <div className="absolute top-0 right-0 w-[550px] h-[500px] bg-gradient-to-b from-blue-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[650px] h-[550px] bg-gradient-to-r from-purple-500/8 via-cyan-500/8 to-transparent rounded-full blur-3xl pointer-events-none" />
      
      {/* Canvas Layer */}
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
    </div>
  );
}
