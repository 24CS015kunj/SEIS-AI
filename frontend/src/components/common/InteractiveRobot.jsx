import React, { useState, useEffect, useRef } from 'react';

/**
 * Interactive SEIS-AI Robot Mascot
 * - Bobs up/down continuously
 * - Shows eye animations (blink, look around)
 * - On hover: robot waves + greeting bubble appears
 * - On click: cycles through chat messages
 * - Fully adapts to light / dark mode via CSS vars
 */

const CHAT_MESSAGES = [
  { emoji: '👋', text: 'Hi there! I\'m SEIS!' },
  { emoji: '🤖', text: 'How can I help you?' },
  { emoji: '💡', text: 'Ask me anything about your code!' },
  { emoji: '🔍', text: 'I can map your architecture!' },
  { emoji: '⚡', text: 'Try me — I\'m pretty smart!' },
  { emoji: '🚀', text: 'Ready to analyze your repo?' },
];

export default function InteractiveRobot({
  size = 180,
  className = '',
  lookDirection,
  showChatBubble = true,
  interactive = true,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [chatIndex, setChatIndex] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [isWaving, setIsWaving] = useState(false);
  const [blinkState, setBlinkState] = useState(false);
  const [lookDir, setLookDir] = useState(0); // -1 left, 0 center, 1 right
  const chatTimerRef = useRef(null);

  // Blink randomly
  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2500 + Math.random() * 3000;
      return setTimeout(() => {
        setBlinkState(true);
        setTimeout(() => setBlinkState(false), 150);
        scheduleBlink();
      }, delay);
    };
    const t = scheduleBlink();
    return () => clearTimeout(t);
  }, []);

  // Look around randomly
  useEffect(() => {
    const scheduleLook = () => {
      const delay = 3000 + Math.random() * 4000;
      return setTimeout(() => {
        const dirs = [-1, 0, 0, 1];
        setLookDir(dirs[Math.floor(Math.random() * dirs.length)]);
        setTimeout(() => setLookDir(0), 1200);
        scheduleLook();
      }, delay);
    };
    const t = scheduleLook();
    return () => clearTimeout(t);
  }, []);

  // Auto-show greeting after 1.5s
  useEffect(() => {
    if (!showChatBubble) return undefined;
    const t = setTimeout(() => {
      setShowChat(true);
      chatTimerRef.current = setTimeout(() => setShowChat(false), 3500);
    }, 1500);
    return () => {
      clearTimeout(t);
      clearTimeout(chatTimerRef.current);
    };
  }, [showChatBubble]);

  const handleHover = () => {
    setIsHovered(true);
    setIsWaving(true);
    if (!showChat) {
      setShowChat(true);
      clearTimeout(chatTimerRef.current);
      chatTimerRef.current = setTimeout(() => {
        setShowChat(false);
        setIsWaving(false);
      }, 3000);
    }
  };

  const handleLeave = () => {
    setIsHovered(false);
    clearTimeout(chatTimerRef.current);
    chatTimerRef.current = setTimeout(() => {
      setShowChat(false);
      setIsWaving(false);
    }, 1500);
  };

  const handleClick = () => {
    const next = (chatIndex + 1) % CHAT_MESSAGES.length;
    setChatIndex(next);
    setShowChat(true);
    setIsWaving(true);
    clearTimeout(chatTimerRef.current);
    chatTimerRef.current = setTimeout(() => {
      setShowChat(false);
      setIsWaving(false);
    }, 3000);
  };

  const eyeOffsetX = (lookDirection ?? lookDir) * 2.5;
  const eyeOffsetY = 0;

  return (
    <div
      className={`relative select-none ${className}`}
      style={{ width: size, cursor: interactive ? 'pointer' : 'default' }}
      onMouseEnter={interactive ? handleHover : undefined}
      onMouseLeave={interactive ? handleLeave : undefined}
      onClick={interactive ? handleClick : undefined}
      role={interactive ? 'button' : undefined}
      aria-label={interactive ? 'SEIS-AI mascot — click to chat' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? e => e.key === 'Enter' && handleClick() : undefined}
    >
      {showChatBubble && <div
        style={{
          position: 'absolute',
          top: -52,
          left: '50%',
          transform: `translateX(-50%) scale(${showChat ? 1 : 0.7}) translateY(${showChat ? 0 : 8}px)`,
          opacity: showChat ? 1 : 0,
          transition: 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
          zIndex: 20,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #00D4FF 0%, #0099BB 100%)',
            color: '#000',
            fontWeight: 700,
            fontSize: 13,
            borderRadius: 20,
            padding: '7px 14px',
            boxShadow: '0 4px 20px rgba(0,212,255,0.5), 0 2px 8px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>{CHAT_MESSAGES[chatIndex].emoji}</span>
          <span>{CHAT_MESSAGES[chatIndex].text}</span>
        </div>
        {/* Bubble tail */}
        <div
          style={{
            position: 'absolute',
            bottom: -7,
            left: '50%',
            marginLeft: -7,
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: '8px solid #00D4FF',
            filter: 'drop-shadow(0 3px 4px rgba(0,212,255,0.3))',
          }}
        />
      </div>}

      {/* Glow ring (hover) */}
      <div
        style={{
          position: 'absolute',
          inset: -12,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,212,255,0.15) 0%, transparent 70%)',
          transform: `scale(${isHovered ? 1.1 : 0.9})`,
          opacity: isHovered ? 1 : 0,
          transition: 'all 0.4s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Robot SVG */}
      <svg
        width={size}
        height={size * 1.15}
        viewBox="0 0 200 230"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          animation: `robotBob ${isHovered ? 2 : 4}s ease-in-out infinite`,
          filter: isHovered ? 'drop-shadow(0 0 16px rgba(0,212,255,0.5))' : 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
          transition: 'filter 0.3s ease',
        }}
      >
        <defs>
          {/* Cyan glow filter */}
          <filter id="robotCyanGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Head gradient — white top to light blue */}
          <radialGradient id="rHeadGrad" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#D8F0F8" />
          </radialGradient>

          {/* Visor gradient */}
          <linearGradient id="rVisorGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00E5FF" />
            <stop offset="100%" stopColor="#0099BB" />
          </linearGradient>

          {/* Body gradient */}
          <radialGradient id="rBodyGrad" cx="50%" cy="25%" r="75%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#CBE8F2" />
          </radialGradient>

          {/* Antenna glow */}
          <radialGradient id="rAntennaGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00FFFF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#00D4FF" stopOpacity="1" />
          </radialGradient>
        </defs>

        {/* ── ANTENNA ── */}
        <rect x="95" y="6" width="10" height="20" rx="5" fill="#00D4FF" filter="url(#robotCyanGlow)" />
        <circle cx="100" cy="6" r="8" fill="url(#rAntennaGlow)" filter="url(#robotCyanGlow)" />
        {/* Antenna pulse rings */}
        <circle cx="100" cy="6" r="8" fill="none" stroke="rgba(0,212,255,0.5)" strokeWidth="2"
          style={{ animation: 'pulseRing 2s ease-in-out infinite' }} />

        {/* ── HEAD ── */}
        <circle cx="100" cy="88" r="62" fill="url(#rHeadGrad)" />
        <circle cx="100" cy="88" r="62" fill="none" stroke="#1A2D3D" strokeWidth="3.5" />

        {/* Cyan top cap */}
        <path d="M 68 42 Q 100 22 132 42 L 128 62 Q 100 50 72 62 Z" fill="#00D4FF" filter="url(#robotCyanGlow)" />
        <path d="M 68 42 Q 100 22 132 42 L 128 62 Q 100 50 72 62 Z" fill="none" stroke="#1A2D3D" strokeWidth="2" />

        {/* ── LEFT EAR ── */}
        <rect x="24" y="76" width="22" height="24" rx="9" fill="#00D4FF" filter="url(#robotCyanGlow)" />
        <rect x="24" y="76" width="22" height="24" rx="9" fill="none" stroke="#1A2D3D" strokeWidth="2.5" />
        <rect x="30" y="82" width="10" height="12" rx="4" fill="rgba(255,255,255,0.4)" />

        {/* ── RIGHT EAR ── */}
        <rect x="154" y="76" width="22" height="24" rx="9" fill="#00D4FF" filter="url(#robotCyanGlow)" />
        <rect x="154" y="76" width="22" height="24" rx="9" fill="none" stroke="#1A2D3D" strokeWidth="2.5" />
        <rect x="160" y="82" width="10" height="12" rx="4" fill="rgba(255,255,255,0.4)" />

        {/* ── VISOR / EYE BAND ── */}
        <rect x="42" y="72" width="116" height="40" rx="16" fill="url(#rVisorGrad)" filter="url(#robotCyanGlow)" />
        <rect x="42" y="72" width="116" height="40" rx="16" fill="none" stroke="#1A2D3D" strokeWidth="3" />
        {/* Visor shine */}
        <rect x="50" y="76" width="40" height="6" rx="3" fill="rgba(255,255,255,0.25)" />

        {/* ── EYES (animated) ── */}
        {/* Left eye */}
        <ellipse
          cx={76 + eyeOffsetX}
          cy={blinkState ? 92 : 92 + eyeOffsetY}
          rx="11"
          ry={blinkState ? 2 : 13}
          fill="white"
          style={{ transition: 'ry 0.06s ease, cy 0.15s ease, cx 0.15s ease' }}
        />
        {!blinkState && (
          <>
            <ellipse cx={76 + eyeOffsetX} cy={92 + eyeOffsetY} rx="5" ry="6" fill="rgba(0,50,80,0.15)" />
            <ellipse cx={74 + eyeOffsetX} cy={89 + eyeOffsetY} rx="3" ry="3.5" fill="rgba(255,255,255,0.7)" />
          </>
        )}

        {/* Right eye */}
        <ellipse
          cx={124 + eyeOffsetX}
          cy={blinkState ? 92 : 92 + eyeOffsetY}
          rx="11"
          ry={blinkState ? 2 : 13}
          fill="white"
          style={{ transition: 'ry 0.06s ease, cy 0.15s ease, cx 0.15s ease' }}
        />
        {!blinkState && (
          <>
            <ellipse cx={124 + eyeOffsetX} cy={92 + eyeOffsetY} rx="5" ry="6" fill="rgba(0,50,80,0.15)" />
            <ellipse cx={122 + eyeOffsetX} cy={89 + eyeOffsetY} rx="3" ry="3.5" fill="rgba(255,255,255,0.7)" />
          </>
        )}

        {/* ── SMILE ── */}
        <path
          d="M 82 118 Q 100 132 118 118"
          stroke="#00D4FF"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
          filter="url(#robotCyanGlow)"
          style={{ transform: isHovered ? 'scaleY(1.2)' : 'scaleY(1)', transformOrigin: '100px 118px', transition: 'transform 0.3s ease' }}
        />

        {/* ── WAVING ARM (right) ── */}
        <g
          style={{
            transformOrigin: '154px 170px',
            transform: isWaving ? 'rotate(-35deg)' : 'rotate(0deg)',
            animation: isWaving ? 'armWave 0.5s ease-in-out infinite alternate' : 'none',
            transition: 'transform 0.3s ease',
          }}
        >
          <rect x="154" y="158" width="30" height="24" rx="10" fill="#00D4FF" filter="url(#robotCyanGlow)" />
          <rect x="154" y="158" width="30" height="24" rx="10" fill="none" stroke="#1A2D3D" strokeWidth="2.5" />
          {/* Wave hand fingers suggestion */}
          <rect x="162" y="178" width="5" height="10" rx="2.5" fill="rgba(255,255,255,0.5)" />
          <rect x="170" y="180" width="5" height="8" rx="2.5" fill="rgba(255,255,255,0.5)" />
        </g>

        {/* ── LEFT ARM (static) ── */}
        <rect x="16" y="158" width="30" height="24" rx="10" fill="#00D4FF" filter="url(#robotCyanGlow)" />
        <rect x="16" y="158" width="30" height="24" rx="10" fill="none" stroke="#1A2D3D" strokeWidth="2.5" />

        {/* ── BODY ── */}
        <rect x="56" y="156" width="88" height="52" rx="22" fill="url(#rBodyGrad)" />
        <rect x="56" y="156" width="88" height="52" rx="22" fill="none" stroke="#1A2D3D" strokeWidth="3" />

        {/* Body panel details */}
        <rect x="72" y="166" width="56" height="4" rx="2" fill="rgba(0,212,255,0.25)" />

        {/* Chest badge / pentagon */}
        <polygon
          points="100,170 113,180 108,194 92,194 87,180"
          fill="#00D4FF"
          filter="url(#robotCyanGlow)"
        />
        <polygon
          points="100,170 113,180 108,194 92,194 87,180"
          fill="none"
          stroke="#1A2D3D"
          strokeWidth="2.5"
        />
        {/* Chest badge inner star */}
        <polygon
          points="100,175 103,183 100,187 97,183"
          fill="rgba(255,255,255,0.6)"
        />

        {/* ── BASE / FEET ── */}
        <ellipse cx="100" cy="210" rx="56" ry="16" fill="url(#rBodyGrad)" />
        <ellipse cx="100" cy="210" rx="56" ry="16" fill="none" stroke="#1A2D3D" strokeWidth="2.5" />

        {/* Base glow shadow */}
        <ellipse cx="100" cy="225" rx="44" ry="7" fill="rgba(0,212,255,0.18)" />
      </svg>
    </div>
  );
}
