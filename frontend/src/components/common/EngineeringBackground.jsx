import React, { useEffect, useRef } from 'react';

/**
 * Task 89: Premium White + Light Blue Interactive Engineering Background.
 *
 * Design Direction (Light Blue Theme):
 *  - Dominant clean white/light engineering background (`#F5F6FA`).
 *  - Soft ambient light blue glows (#DBEAFE, #E0E7FF, #BFDBFE).
 *  - Technical light blue dot-grid pattern (#93C5FD at low opacity).
 *  - Cursor movement generates a smooth, soft radial accent blue glow (#2563EB).
 *  - Floating nodes and connecting mesh use light blue tones (#93C5FD).
 *  - 100% non-blocking (`pointer-events: none`, `z-0`).
 *  - 0 React re-renders during animation (ref-based state + requestAnimationFrame).
 *  - Respects `prefers-reduced-motion` and touch devices.
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
    let nodes = [];

    const NODE_COUNT = isTouchDevice ? 14 : 32;
    const MAX_DIST = 135;
    const MOUSE_RADIUS = 175;

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

      initNodes();
    }

    function initNodes() {
      nodes = [];
      const cols = Math.ceil(Math.sqrt(NODE_COUNT));
      const rows = Math.ceil(NODE_COUNT / cols);

      for (let i = 0; i < NODE_COUNT; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);

        const baseX = (col + 0.5) * (width / cols);
        const baseY = (row + 0.5) * (height / rows);

        const offsetX = (Math.random() - 0.5) * (width / cols) * 0.6;
        const offsetY = (Math.random() - 0.5) * (height / rows) * 0.6;

        nodes.push({
          x: baseX + offsetX,
          y: baseY + offsetY,
          originX: baseX + offsetX,
          originY: baseY + offsetY,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          radius: 1.5 + Math.random() * 1.3,
          isHighlighted: false,
        });
      }
    }

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

      // Smooth mouse position interpolation (lerp)
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.08;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.08;

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // 1. Soft Light Blue Cursor Glow (#2563EB / #BFDBFE)
      if (!isTouchDevice && !isReducedMotion && mx > 0 && my > 0) {
        const glowGradient = ctx.createRadialGradient(mx, my, 0, mx, my, MOUSE_RADIUS);
        glowGradient.addColorStop(0, 'rgba(37, 99, 235, 0.07)');
        glowGradient.addColorStop(0.4, 'rgba(191, 219, 254, 0.035)');
        glowGradient.addColorStop(1, 'rgba(219, 234, 254, 0)');
        ctx.fillStyle = glowGradient;
        ctx.beginPath();
        ctx.arc(mx, my, MOUSE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }

      // If reduced motion, draw static light blue nodes and stop RAF loop
      if (isReducedMotion) {
        ctx.fillStyle = 'rgba(147, 197, 253, 0.45)';
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }

      // 2. Update and draw light blue nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];

        // Ambient drift
        n.x += n.vx;
        n.y += n.vy;

        // Soft bounce off viewport edges
        if (n.x < 20 || n.x > width - 20) n.vx *= -1;
        if (n.y < 20 || n.y > height - 20) n.vy *= -1;

        n.isHighlighted = false;

        // Mouse interaction: subtle push/pull toward cursor
        if (!isTouchDevice && mx > 0 && my > 0) {
          const dx = mx - n.x;
          const dy = my - n.y;
          const dist = Math.hypot(dx, dy);

          if (dist < MOUSE_RADIUS) {
            const force = (1 - dist / MOUSE_RADIUS) * 0.035;
            n.x += dx * force;
            n.y += dy * force;
            n.isHighlighted = true;
          }
        }

        // Draw light blue node dot (#93C5FD or #2563EB on cursor proximity)
        ctx.fillStyle = n.isHighlighted ? 'rgba(37, 99, 235, 0.55)' : 'rgba(147, 197, 253, 0.45)';
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.isHighlighted ? n.radius * 1.25 : n.radius, 0, Math.PI * 2);
        ctx.fill();

        // 3. Light Blue connecting mesh lines (#93C5FD)
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = n2.x - n.x;
          const dy = n2.y - n.y;
          const dist = Math.hypot(dx, dy);

          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * (n.isHighlighted || n2.isHighlighted ? 0.22 : 0.14);
            ctx.strokeStyle = `rgba(147, 197, 253, ${alpha})`;
            ctx.lineWidth = n.isHighlighted || n2.isHighlighted ? 0.9 : 0.75;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(n2.x, n2.y);
            ctx.stroke();
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(render);
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
      {/* 1. Ambient soft blue gradients (#DBEAFE, #E0E7FF) */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-b from-[#DBEAFE]/30 to-transparent rounded-full blur-3xl pointer-events-none opacity-60" />
      <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] bg-gradient-to-r from-[#E0E7FF]/20 via-[#BFDBFE]/15 to-transparent rounded-full blur-3xl pointer-events-none opacity-50" />

      {/* 2. Light blue technical dot-grid pattern (#93C5FD) */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `radial-gradient(#93C5FD 1.2px, transparent 1.2px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {/* 3. Interactive canvas layer */}
      <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />
    </div>
  );
}
