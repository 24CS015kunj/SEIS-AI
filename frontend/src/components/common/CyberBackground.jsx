import React, { useEffect, useRef } from 'react';

/**
 * CyberBackground — Canvas-based animated background
 * Features:
 *  - Floating particle nodes that connect with glowing lines
 *  - Waving sine-wave energy beams
 *  - Adapts to light / dark mode via a prop
 *
 * Usage: <CyberBackground isDark={true} />
 */
export default function CyberBackground({ isDark = true, intensity = 1 }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Resize handler
    const setSize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    setSize();
    window.addEventListener('resize', setSize);

    // ── Colour palette ────────────────────────────────────────────
    const CYAN = isDark ? 'rgba(0,212,255,' : 'rgba(0,150,180,';
    const WHITE = isDark ? 'rgba(255,255,255,' : 'rgba(30,60,90,';
    const alpha = (base, a) => `${base}${(a * intensity).toFixed(2)})`;

    // ── Particles ────────────────────────────────────────────────
    const W = () => canvas.offsetWidth;
    const H = () => canvas.offsetHeight;

    const N_PARTICLES = Math.min(28, Math.floor((W() * H()) / 28000));
    const particles = Array.from({ length: N_PARTICLES }, () => ({
      x: Math.random() * W(),
      y: Math.random() * H(),
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: 2.5 + Math.random() * 2.5,
      pulse: Math.random() * Math.PI * 2,
    }));

    // ── Wave beams ───────────────────────────────────────────────
    const WAVES = [
      { y: 0.28, amp: 32, freq: 0.008, speed: 0.018, phase: 0 },
      { y: 0.62, amp: 24, freq: 0.006, speed: 0.012, phase: 2.1 },
      { y: 0.82, amp: 18, freq: 0.01, speed: 0.022, phase: 4.3 },
    ];

    let t = 0;

    const draw = () => {
      const w = W();
      const h = H();
      ctx.clearRect(0, 0, w, h);

      t += 0.016;

      // ── Draw wave beams ──────────────────────────────────────
      WAVES.forEach((wave) => {
        wave.phase += wave.speed;
        const yBase = h * wave.y;

        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const y = yBase + Math.sin(x * wave.freq + wave.phase) * wave.amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, alpha(CYAN, 0));
        grad.addColorStop(0.2, alpha(CYAN, 0.25));
        grad.addColorStop(0.5, alpha(CYAN, 0.5));
        grad.addColorStop(0.8, alpha(CYAN, 0.25));
        grad.addColorStop(1, alpha(CYAN, 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Glowing dot that rides the wave
        const dotX = ((t * 60 * wave.speed * 40) % (w + 40)) - 20;
        const dotY = yBase + Math.sin(dotX * wave.freq + wave.phase) * wave.amp;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = alpha(CYAN, 0.9);
        ctx.fill();
        const dotGlow = ctx.createRadialGradient(dotX, dotY, 0, dotX, dotY, 18);
        dotGlow.addColorStop(0, alpha(CYAN, 0.4));
        dotGlow.addColorStop(1, alpha(CYAN, 0));
        ctx.beginPath();
        ctx.arc(dotX, dotY, 18, 0, Math.PI * 2);
        ctx.fillStyle = dotGlow;
        ctx.fill();
      });

      // ── Update + draw particles ──────────────────────────────
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.pulse += 0.04;
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
        if (p.y < -20) p.y = h + 20;
        if (p.y > h + 20) p.y = -20;

        const pulseR = p.r + Math.sin(p.pulse) * 0.8;
        const glowA = 0.15 + Math.sin(p.pulse) * 0.08;

        // Particle glow
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseR * 5);
        grd.addColorStop(0, alpha(CYAN, glowA * 2.5));
        grd.addColorStop(1, alpha(CYAN, 0));
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR * 5, 0, Math.PI * 2);
        ctx.fillStyle = grd;
        ctx.fill();

        // Particle core
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR, 0, Math.PI * 2);
        ctx.fillStyle = alpha(CYAN, 0.85);
        ctx.fill();
      });

      // ── Draw connecting lines between nearby particles ──────
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const MAX_DIST = 130;
          if (dist < MAX_DIST) {
            const opacity = (1 - dist / MAX_DIST) * 0.35;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = alpha(CYAN, opacity);
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // ── Grid dots ────────────────────────────────────────────
      const GRID = 60;
      for (let gx = 0; gx < w; gx += GRID) {
        for (let gy = 0; gy < h; gy += GRID) {
          const pulse = Math.sin(t * 0.8 + gx * 0.02 + gy * 0.02) * 0.5 + 0.5;
          ctx.beginPath();
          ctx.arc(gx, gy, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = alpha(CYAN, 0.06 + pulse * 0.08);
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', setSize);
      cancelAnimationFrame(animRef.current);
    };
  }, [isDark, intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
