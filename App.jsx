import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const quizModules = import.meta.glob('./quizzes/*.json', { eager: true });
const availableQuizzes = Object.entries(quizModules)
  .map(([path, mod]) => ({
    name: path.replace('./quizzes/', '').replace('.json', ''),
    data: Array.isArray(mod.default) ? mod.default : [],
  }))
  .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

// ── Audio ──────────────────────────────────────────────────────────────────
let _ac = null;
function getAC() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  if (_ac.state === 'suspended') _ac.resume();
  return _ac;
}
function sfxRev(ac, g, wet = 0.4, delay = 0.09, fb = 0.42) {
  const d = ac.createDelay(2); d.delayTime.value = delay;
  const f = ac.createGain(); f.gain.value = fb;
  const w = ac.createGain(); w.gain.value = wet;
  g.connect(d); d.connect(f); f.connect(d); d.connect(w); w.connect(ac.destination);
}
function playIntro() {
  try {
    const ac = getAC(); const t = ac.currentTime;
    [0, 0.2, 0.4, 0.65].forEach((off, i) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = [220, 330, 440, 660][i];
      g.gain.setValueAtTime(0, t + off);
      g.gain.linearRampToValueAtTime(0.18, t + off + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.9);
      o.connect(g); g.connect(ac.destination);
      sfxRev(ac, g, 0.55, 0.1, 0.52);
      o.start(t + off); o.stop(t + off + 0.9);
    });
  } catch (e) {}
}
function playSelect() {
  try {
    const ac = getAC(); const t = ac.currentTime;
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(520, t);
    o.frequency.exponentialRampToValueAtTime(760, t + 0.07);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + 0.18);
  } catch (e) {}
}
function playFinalAnswer() {
  try {
    const ac = getAC(); const t = ac.currentTime;
    const boom = ac.createOscillator(); const bg = ac.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(65, t);
    boom.frequency.exponentialRampToValueAtTime(22, t + 0.55);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.75, t + 0.04);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    boom.connect(bg); bg.connect(ac.destination);
    boom.start(t); boom.stop(t + 0.65);
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(160, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.85);
    g.gain.setValueAtTime(0, t + 0.1);
    g.gain.linearRampToValueAtTime(0.28, t + 0.22);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
    o.connect(g); g.connect(ac.destination);
    sfxRev(ac, g, 0.4, 0.08, 0.4);
    o.start(t + 0.1); o.stop(t + 0.95);
  } catch (e) {}
}
function playCountdownTick(num) {
  try {
    const ac = getAC(); const t = ac.currentTime;
    const freqs = { 10: 262, 9: 277, 8: 294, 7: 311, 6: 330, 5: 330, 4: 370, 3: 415, 2: 466, 1: 523 };
    const freq = freqs[num] ?? 440;
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(g); g.connect(ac.destination);
    sfxRev(ac, g, 0.3, 0.06, 0.38);
    o.start(t); o.stop(t + 0.55);
  } catch (e) {}
}

// ── Drone sound (continuous low engine during countdown) ───────────────────
let _drone = null;
function startDrone(durationSecs) {
  stopDrone();
  try {
    const ac = getAC(); const t = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(0.9, t + 0.05);
    master.gain.linearRampToValueAtTime(0.7, t + 0.6);
    master.gain.linearRampToValueAtTime(0.8, t + durationSecs * 0.9);
    master.connect(ac.destination);

    // 長いホール系リバーブ
    const rev = ac.createDelay(4);
    rev.delayTime.value = 0.22;
    const revFB = ac.createGain(); revFB.gain.value = 0.78;
    const revSend = ac.createGain(); revSend.gain.value = 0.6;
    rev.connect(revFB); revFB.connect(rev);
    rev.connect(revSend); revSend.connect(master);
    const wet = (g) => { g.connect(master); g.connect(rev); };

    // 基音: サイン波 60Hz 固定
    const o1 = ac.createOscillator(); const g1 = ac.createGain();
    o1.type = 'sine'; o1.frequency.value = 60;
    g1.gain.value = 1.0;
    o1.connect(g1); wet(g1); o1.start(t);

    // 少しデチューン（厚み・うなり）
    const o2 = ac.createOscillator(); const g2 = ac.createGain();
    o2.type = 'sine'; o2.frequency.value = 61.5;
    g2.gain.value = 0.8;
    o2.connect(g2); wet(g2); o2.start(t);

    // 倍音 120Hz（サイン）でラップトップスピーカー向け音量感補強
    const o3 = ac.createOscillator(); const g3 = ac.createGain();
    o3.type = 'sine'; o3.frequency.value = 120;
    g3.gain.value = 0.45;
    o3.connect(g3); wet(g3); o3.start(t);

    // 「どん」の衝撃感: 最初の0.5秒だけ出る低音ノイズ
    const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const bd = buf.getChannelData(0);
    for (let i = 0; i < bd.length; i++) bd[i] = Math.random() * 2 - 1;
    const ns = ac.createBufferSource(); ns.buffer = buf; ns.loop = true;
    const nf = ac.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 200;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.6, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    ns.connect(nf); nf.connect(ng); wet(ng); ns.start(t);

    _drone = { master, oscs: [o1, o2, o3], noise: ns, ac };
  } catch (e) { console.error('startDrone error', e); }
}
function stopDrone() {
  if (!_drone) return;
  try {
    const { master, oscs, noise, ac } = _drone;
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    oscs.forEach(o => { try { o.stop(t + 0.4); } catch (e) {} });
    try { noise.stop(t + 0.4); } catch (e) {}
  } catch (e) {}
  _drone = null;
}

function getCountdownSeconds(posInBlock) {
  if (posInBlock <= 2) return 3;
  if (posInBlock <= 6) return 5;
  return 10;
}
function playRevealCorrect() {
  try {
    const ac = getAC(); const t = ac.currentTime;
    [523, 659, 784, 1047].forEach((freq, i) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + i * 0.11);
      g.gain.linearRampToValueAtTime(0.22, t + i * 0.11 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.8);
      o.connect(g); g.connect(ac.destination);
      sfxRev(ac, g, 0.45, 0.1, 0.52);
      o.start(t + i * 0.11); o.stop(t + i * 0.11 + 0.8);
    });
  } catch (e) {}
}
function playRevealIncorrect() {
  try {
    const ac = getAC(); const t = ac.currentTime;

    // リバーブ
    const rev = ac.createDelay(4); rev.delayTime.value = 0.25;
    const revFB = ac.createGain(); revFB.gain.value = 0.75;
    const revOut = ac.createGain(); revOut.gain.value = 0.65;
    rev.connect(revFB); revFB.connect(rev);
    rev.connect(revOut); revOut.connect(ac.destination);
    const wet = (g) => { g.connect(ac.destination); g.connect(rev); };

    // 衝撃音: ノイズバースト（どーん）
    const impactBuf = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const id = impactBuf.getChannelData(0);
    for (let i = 0; i < id.length; i++) id[i] = Math.random() * 2 - 1;
    const impact = ac.createBufferSource(); impact.buffer = impactBuf;
    const impFilt = ac.createBiquadFilter(); impFilt.type = 'lowpass'; impFilt.frequency.value = 300;
    const impGain = ac.createGain();
    impGain.gain.setValueAtTime(1.2, t);
    impGain.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    impact.connect(impFilt); impFilt.connect(impGain); wet(impGain); impact.start(t);

    // 落下の「ズーン」: 低音サイン波が急降下
    const boom = ac.createOscillator(); const bg = ac.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(120, t);
    boom.frequency.exponentialRampToValueAtTime(28, t + 1.8);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(1.0, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    boom.connect(bg); wet(bg); boom.start(t); boom.stop(t + 2.5);

    // 地響き: もう1本デチューン
    const rumble = ac.createOscillator(); const rg = ac.createGain();
    rumble.type = 'sine'; rumble.frequency.setValueAtTime(118, t);
    rumble.frequency.exponentialRampToValueAtTime(26, t + 2.0);
    rg.gain.setValueAtTime(0, t);
    rg.gain.linearRampToValueAtTime(0.8, t + 0.03);
    rg.gain.exponentialRampToValueAtTime(0.001, t + 2.8);
    rumble.connect(rg); wet(rg); rumble.start(t); rumble.stop(t + 2.8);

    // 高音の破片（ガラス・金属的な鋭いクラッシュ）
    const crashBuf = ac.createBuffer(1, ac.sampleRate * 0.8, ac.sampleRate);
    const cd = crashBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1;
    const crash = ac.createBufferSource(); crash.buffer = crashBuf;
    const crFilt = ac.createBiquadFilter(); crFilt.type = 'highpass'; crFilt.frequency.value = 2000;
    const cg = ac.createGain();
    cg.gain.setValueAtTime(0.5, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    crash.connect(crFilt); crFilt.connect(cg); wet(cg); crash.start(t);
  } catch (e) {}
}

// ── Shooting Stars ─────────────────────────────────────────────────────────
function ShootingStars() {
  const [stars, setStars] = useState([]);
  const nextId = useRef(0);

  const addStar = useCallback(() => {
    const id = nextId.current++;
    const dur = 480 + Math.random() * 650;
    setStars(prev => [...prev, {
      id,
      x: 2 + Math.random() * 82,
      y: -10 + Math.random() * 58,
      len: 48 + Math.random() * 110,
      dur,
    }]);
    setTimeout(() => setStars(prev => prev.filter(s => s.id !== id)), dur + 120);
  }, []);

  useEffect(() => {
    let t;
    const schedule = () => {
      t = setTimeout(() => { addStar(); schedule(); }, 220 + Math.random() * 750);
    };
    schedule();
    return () => clearTimeout(t);
  }, [addStar]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 5, pointerEvents: 'none', overflow: 'hidden' }}>
      {stars.map(s => (
        <div key={s.id} style={{
          position: 'absolute',
          left: `${s.x}%`,
          top: `${s.y}%`,
          animationName: 'shooting-star-travel',
          animationDuration: `${s.dur}ms`,
          animationTimingFunction: 'ease-out',
          animationFillMode: 'forwards',
        }}>
          {/* Trail */}
          <div style={{
            width: `${s.len}px`, height: '1.5px',
            transform: 'rotate(33deg)',
            transformOrigin: 'right center',
            background: 'linear-gradient(to right, transparent, rgba(185,28,28,0.28), rgba(255,170,170,0.6), rgba(255,255,255,0.95))',
            borderRadius: '1px',
            position: 'relative',
          }}>
            {/* Bright head */}
            <div style={{
              position: 'absolute', right: -2, top: '50%',
              transform: 'translateY(-50%)',
              width: 3, height: 3, borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 0 5px 2px rgba(255,255,255,0.9), 0 0 12px 5px rgba(220,38,38,0.65)',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────
const CHOICES = ['A', 'B', 'C', 'D'];
const SEGMENT_SIZE = 10;
const FEEDBACK_REVEAL_MS = 55;

// 10問の賞金ラダー (Q1=¥1,000 → Q10=¥1,000,000)
const PRIZE_LADDER = [1000, 2000, 3000, 5000, 10000, 20000, 50000, 100000, 500000, 1000000];
// セーフティネット: Q3(index 2) と Q7(index 6) は正解すると最低保証額になる
const SAFETY_NETS = new Set([2, 6]);

function formatPrize(n) {
  return `¥${n.toLocaleString()}`;
}

// ブロック内での獲得金額を計算（セーフティネット考慮）
function getEarnedAmount(results, segmentStart) {
  let floor = 0;
  for (let i = 0; i < PRIZE_LADDER.length; i++) {
    const r = results[segmentStart + i];
    if (!r) break;
    if (r.correct) {
      if (SAFETY_NETS.has(i)) floor = PRIZE_LADDER[i];
    } else {
      return floor; // 不正解：セーフティネット額まで戻る
    }
  }
  // 全問回答済み or 途中まで正解
  let last = -1;
  for (let i = 0; i < PRIZE_LADDER.length; i++) {
    const r = results[segmentStart + i];
    if (r?.correct) last = i; else break;
  }
  return last >= 0 ? PRIZE_LADDER[last] : 0;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function toQuestion(raw, index) {
  return {
    id: Number(raw.number ?? index + 1),
    prompt: String(raw.Quiz ?? ''),
    choices: {
      A: String(raw.A ?? ''),
      B: String(raw.B ?? ''),
      C: String(raw.C ?? ''),
      D: String(raw.D ?? ''),
    },
    answer: String(raw.Answer ?? '').toUpperCase().trim(),
    explanation: String(raw.Explanation ?? ''),
    fun: String(raw.Fun ?? ''),
  };
}
function getOverallRank(correct, total) {
  if (total === 0) return 'D';
  const r = correct / total;
  if (r >= 0.9) return 'S';
  if (r >= 0.75) return 'A';
  if (r >= 0.6) return 'B';
  if (r >= 0.4) return 'C';
  return 'D';
}
function getSegmentSummary(results, start, end) {
  const slice = results.slice(start, end).filter(Boolean);
  const correct = slice.filter(r => r.correct).length;
  const total = slice.length || 1;
  const rate = correct / total;
  if (rate >= 0.9) return { title: 'PERFECT ROUND', emoji: '🏆🔥', message: '圧倒的だ。この勢いで行け。' };
  if (rate >= 0.7) return { title: 'STRONG PERFORMANCE', emoji: '⚔️🌟', message: 'いいペースだ。次も攻めろ。' };
  if (rate >= 0.5) return { title: 'HOLDING GROUND', emoji: '💪🔥', message: 'まだ戦える。立て直せ。' };
  return { title: 'TACTICAL RESET', emoji: '🔥', message: '崩れた。次のブロックで取り返せ。' };
}

// ── UI Components ──────────────────────────────────────────────────────────

function HexBackground() {
  const R = 28;
  const w = R * Math.sqrt(3);
  const h = R * 3;
  const hex = (cx, cy, key) => {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${cx + R * Math.cos(a)},${cy + R * Math.sin(a)}`;
    }).join(' ');
    return <polygon key={key} points={pts} fill="none" stroke="rgba(185,28,28,0.07)" strokeWidth="0.7" />;
  };
  return (
    <svg style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }}>
      <defs>
        <pattern id="hexgrid" x="0" y="0" width={w} height={h} patternUnits="userSpaceOnUse">
          {hex(w / 2, R, 'a')}
          {hex(0, R * 2.5, 'b')}
          {hex(w, R * 2.5, 'c')}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hexgrid)" />
    </svg>
  );
}

function HudFrame({ children, label, className = '', style = {}, accent = '#dc2626' }) {
  const c = accent;
  const corners = [
    { pos: { top: -1, left: -1 }, tf: 'none' },
    { pos: { top: -1, right: -1 }, tf: 'scaleX(-1)' },
    { pos: { bottom: -1, left: -1 }, tf: 'scaleY(-1)' },
    { pos: { bottom: -1, right: -1 }, tf: 'scale(-1,-1)' },
  ];
  return (
    <div className={`relative ${className}`} style={style}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ border: `1px solid ${accent}40`, boxShadow: `0 0 6px ${accent}28, 0 0 24px ${accent}14, inset 0 0 40px rgba(0,0,0,0.7)` }} />
      {corners.map(({ pos, tf }, i) => (
        <svg key={i} width="28" height="28" viewBox="0 0 28 28"
          className="absolute pointer-events-none"
          style={{ ...pos, transform: tf, filter: `drop-shadow(0 0 3px ${c}80)` }}>
          <path d="M 0,6 L 6,0 L 12,6 L 6,12 Z" fill={c} opacity="0.5" />
          <path d="M 3,6 L 6,3 L 9,6 L 6,9 Z" fill="#09090b" />
          <circle cx="6" cy="6" r="1.2" fill={c} opacity="0.9" />
          <line x1="12" y1="6" x2="24" y2="6" stroke={c} strokeWidth="1.8" strokeLinecap="butt" />
          <polygon points="23,3.5 28,6 23,8.5" fill={c} />
          <line x1="6" y1="12" x2="6" y2="24" stroke={c} strokeWidth="1.8" strokeLinecap="butt" />
          <polygon points="3.5,23 6,28 8.5,23" fill={c} />
        </svg>
      ))}
      {label && (
        <div className="absolute pointer-events-none font-terminal"
          style={{ top: -9, left: 12, padding: '0 6px', background: '#09090b',
            fontSize: '0.58rem', color: c, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function RankBadge({ rank, size = 52 }) {
  const palette = {
    S: { outer: '#fbbf24', bg: '#451a03', glow: '#fbbf2468', text: '#fef3c7' },
    A: { outer: '#a78bfa', bg: '#2e1065', glow: '#a78bfa68', text: '#ede9fe' },
    B: { outer: '#60a5fa', bg: '#1e3a5f', glow: '#60a5fa68', text: '#dbeafe' },
    C: { outer: '#4ade80', bg: '#052e16', glow: '#4ade8068', text: '#dcfce7' },
    D: { outer: '#f87171', bg: '#450a0a', glow: '#f8717168', text: '#fee2e2' },
  };
  const p = palette[rank] || palette.D;
  const h = Math.round(size * 70 / 56);
  return (
    <svg width={size} height={h} viewBox="0 0 60 70"
      style={{ filter: `drop-shadow(0 0 5px ${p.glow}) drop-shadow(0 0 14px ${p.glow})` }}>
      <polygon points="30,3 57,18 57,52 30,67 3,52 3,18" fill={p.bg} stroke={p.outer} strokeWidth="2" />
      <polygon points="30,10 51,22 51,48 30,60 9,48 9,22" fill="none" stroke={p.outer} strokeWidth="0.7" opacity="0.35" />
      <polygon points="30,4 33.5,9 30,14 26.5,9" fill={p.outer} opacity="0.6" />
      <text x="30" y="48" textAnchor="middle" fontFamily="'Bebas Neue',sans-serif" fontSize="40"
        fill={p.text} style={{ filter: `drop-shadow(0 0 6px ${p.outer})` }}>{rank}</text>
      <text x="30" y="62" textAnchor="middle" fontFamily="'Share Tech Mono',monospace"
        fontSize="6.5" fill={p.outer} letterSpacing="3" opacity="0.85">RANK</text>
    </svg>
  );
}

function BlockDots({ results, segmentStart, segmentEnd, currentIndex }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {Array.from({ length: segmentEnd - segmentStart }, (_, i) => {
        const idx = segmentStart + i;
        const r = results[idx];
        const cur = idx === currentIndex;
        return (
          <div key={i} style={{
            width: 9, height: 9, borderRadius: '50%',
            border: `1px solid ${r ? (r.correct ? '#22c55e' : '#ef4444') : cur ? '#ef4444' : '#3f3f46'}`,
            background: r ? (r.correct ? 'rgba(22,163,74,0.5)' : 'rgba(185,28,28,0.5)') : cur ? 'rgba(239,68,68,0.25)' : 'transparent',
            boxShadow: cur ? '0 0 6px rgba(239,68,68,0.7)' : 'none',
          }} />
        );
      })}
    </div>
  );
}

function ChoiceButton({ label, text, selected, revealed, isCorrect, isUserChoice, onClick, disabled }) {
  let borderColor, bgColor, textColor, labelColor, boxShadow, accentBar;
  if (revealed) {
    if (isCorrect) {
      borderColor = '#22c55e'; bgColor = 'rgba(20,83,45,0.45)';
      textColor = '#86efac'; labelColor = '#22c55e'; accentBar = '#22c55e';
      boxShadow = '0 0 28px rgba(34,197,94,0.55), inset 0 0 20px rgba(34,197,94,0.12)';
    } else if (isUserChoice) {
      borderColor = '#ef4444'; bgColor = 'rgba(127,29,29,0.38)';
      textColor = '#f87171'; labelColor = '#ef4444'; accentBar = '#ef4444';
      boxShadow = '0 0 22px rgba(239,68,68,0.45), inset 0 0 20px rgba(239,68,68,0.1)';
    } else {
      borderColor = 'rgba(35,35,45,0.6)'; bgColor = 'rgba(5,5,8,0.5)';
      textColor = '#3f3f46'; labelColor = '#3f3f46'; accentBar = '#3f3f46';
      boxShadow = 'none';
    }
  } else if (selected) {
    borderColor = '#f59e0b'; bgColor = 'rgba(120,53,15,0.4)';
    textColor = '#fef3c7'; labelColor = '#f59e0b'; accentBar = '#f59e0b';
    boxShadow = '0 0 28px rgba(245,158,11,0.55), inset 0 0 20px rgba(245,158,11,0.1)';
  } else {
    borderColor = 'rgba(127,29,29,0.5)'; bgColor = 'rgba(5,5,8,0.88)';
    textColor = '#d4d4d8'; labelColor = '#dc2626'; accentBar = '#dc2626';
    boxShadow = 'none';
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={!revealed && !disabled ? 'choice-btn-interactive' : ''}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.9rem 1.4rem',
        border: `2px solid ${borderColor}`,
        background: bgColor, boxShadow,
        color: textColor, cursor: disabled ? 'not-allowed' : 'pointer',
        minHeight: '76px', position: 'relative', overflow: 'hidden',
        transition: 'all 0.2s ease', textAlign: 'left',
      }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: accentBar, boxShadow: `0 0 8px ${accentBar}`, opacity: revealed && !isCorrect && !isUserChoice ? 0.2 : 0.8 }} />
      {(selected || (revealed && isCorrect)) && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, width: '50%', background: `linear-gradient(90deg, transparent, ${revealed && isCorrect ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.08)'}, transparent)`, animation: 'choice-shimmer 2.2s ease-in-out infinite', pointerEvents: 'none' }} />
      )}
      <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.9rem', lineHeight: 1, color: labelColor, textShadow: `0 0 12px ${labelColor}`, minWidth: '2rem', flexShrink: 0, marginLeft: '8px' }}>
        {label}
      </span>
      <span style={{ color: labelColor, opacity: 0.5, fontSize: '1rem', flexShrink: 0 }}>◆</span>
      <span style={{ fontFamily: 'Rajdhani, sans-serif', fontWeight: 700, fontSize: '1.25rem', letterSpacing: '0.02em', lineHeight: 1.3, flex: 1 }}>
        {text}
      </span>
      {revealed && isCorrect && <span style={{ fontSize: '1.6rem', flexShrink: 0, marginLeft: 'auto', color: '#22c55e' }}>✓</span>}
      {revealed && isUserChoice && !isCorrect && <span style={{ fontSize: '1.6rem', flexShrink: 0, marginLeft: 'auto', color: '#ef4444' }}>✗</span>}
    </button>
  );
}

// 賞金ラダー: Q10(上)→Q1(下) で賞金額・状態を表示
function PrizeLadder({ segmentStart, currentIndex, results, screen }) {
  const isActive = screen === 'quiz' || screen === 'countdown' || screen === 'feedback';
  const earnedAmount = getEarnedAmount(results, segmentStart);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
      {/* 賞金ラダー: Q10→Q1 の順（上が高額） */}
      {[...PRIZE_LADDER].reverse().map((prize, revIdx) => {
        const posInBlock = PRIZE_LADDER.length - 1 - revIdx; // 0〜9
        const qIndex = segmentStart + posInBlock;
        const result = results[qIndex];
        const isCurrent = qIndex === currentIndex && isActive;
        const isSafetyNet = SAFETY_NETS.has(posInBlock);
        const isTop = posInBlock === PRIZE_LADDER.length - 1;

        let bg, border, iconColor, labelColor, prizeColor, icon;
        if (result?.correct) {
          bg = 'rgba(20,83,45,0.35)'; border = 'rgba(34,197,94,0.4)';
          iconColor = '#22c55e'; labelColor = '#4ade80'; prizeColor = '#4ade80'; icon = '✓';
        } else if (result && !result.correct) {
          bg = 'rgba(127,29,29,0.3)'; border = 'rgba(239,68,68,0.4)';
          iconColor = '#ef4444'; labelColor = '#f87171'; prizeColor = '#f87171'; icon = '✗';
        } else if (isCurrent) {
          bg = 'rgba(120,53,15,0.4)'; border = 'rgba(245,158,11,0.7)';
          iconColor = '#f59e0b'; labelColor = '#fef3c7'; prizeColor = '#fbbf24'; icon = '▶';
        } else if (isTop) {
          bg = 'rgba(80,10,10,0.25)'; border = 'rgba(220,38,38,0.35)';
          iconColor = '#7f1d1d'; labelColor = '#dc2626'; prizeColor = '#dc2626'; icon = '◇';
        } else {
          bg = 'transparent'; border = 'transparent';
          iconColor = '#27272a'; labelColor = '#3f3f46'; prizeColor = '#3f3f46'; icon = '◇';
        }

        return (
          <div key={posInBlock} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: isCurrent ? '5px 8px' : '3px 8px',
            background: bg,
            border: `1px solid ${border}`,
            boxShadow: isCurrent ? '0 0 12px rgba(245,158,11,0.3)' : isTop && !result ? '0 0 6px rgba(220,38,38,0.2)' : 'none',
            transition: 'all 0.3s ease',
            borderRadius: isSafetyNet ? '0' : '0',
            borderLeft: isSafetyNet && !result && !isCurrent ? '3px solid rgba(245,158,11,0.5)' : `1px solid ${border}`,
          }}>
            <span style={{ fontSize: '0.7rem', color: iconColor, minWidth: '14px', textAlign: 'center', flexShrink: 0 }}>
              {icon}
            </span>
            <span className="font-terminal" style={{ fontSize: '0.65rem', color: labelColor, flexShrink: 0, minWidth: '22px' }}>
              Q{posInBlock + 1}
            </span>
            <span className="font-display" style={{
              fontSize: isCurrent ? '1.05rem' : isTop ? '0.95rem' : '0.85rem',
              color: prizeColor, letterSpacing: '0.02em', marginLeft: 'auto',
              textShadow: isCurrent ? `0 0 8px ${prizeColor}` : 'none',
            }}>
              {formatPrize(prize)}
            </span>
            {isSafetyNet && <span style={{ fontSize: '0.55rem', color: '#f59e0b', opacity: 0.7, flexShrink: 0 }}>★</span>}
          </div>
        );
      })}

      {/* 獲得金額 */}
      <div style={{ marginTop: '8px', padding: '8px', border: '1px solid rgba(127,29,29,0.4)', background: 'rgba(5,5,8,0.9)', textAlign: 'center' }}>
        <p className="font-terminal" style={{ fontSize: '0.58rem', color: '#52525b', letterSpacing: '0.15em', marginBottom: '3px' }}>獲得金額</p>
        <p className="font-display" style={{
          fontSize: '1.3rem',
          color: earnedAmount > 0 ? '#fbbf24' : '#3f3f46',
          textShadow: earnedAmount > 0 ? '0 0 10px rgba(251,191,36,0.5)' : 'none',
        }}>
          {earnedAmount > 0 ? `¥${earnedAmount.toLocaleString()}` : '¥0'}
        </p>
      </div>
    </div>
  );
}

// ── Responsive hook ────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return isMobile;
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function QuizApp() {
  const isMobile = useIsMobile();
  const [selectedQuizName, setSelectedQuizName] = useState(availableQuizzes[0]?.name ?? '');

  const questions = useMemo(() => {
    const quiz = availableQuizzes.find(q => q.name === selectedQuizName);
    if (!quiz) return [];
    return quiz.data.map(toQuestion);
  }, [selectedQuizName]);

  const totalQuestions = questions.length;
  const [screen, setScreen] = useState('start');
  const [startReady, setStartReady] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [countdownNum, setCountdownNum] = useState(5);
  const [pendingReveal, setPendingReveal] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [feedbackPhase, setFeedbackPhase] = useState('explanation');
  const [explanationDisplayed, setExplanationDisplayed] = useState('');
  const [explanationLen, setExplanationLen] = useState(0);
  const [funDisplayed, setFunDisplayed] = useState('');
  const [funLen, setFunLen] = useState(0);
  const [flashState, setFlashState] = useState(null);
  const introPlayedRef = useRef(false);

  const currentQuestion = questions[currentIndex];
  const correctCount = results.filter(r => r?.correct).length;
  const answeredCount = results.filter(Boolean).length;
  const overallRank = getOverallRank(correctCount, totalQuestions);
  const currentSegmentStart = Math.floor(currentIndex / SEGMENT_SIZE) * SEGMENT_SIZE;
  const currentSegmentEnd = Math.min(currentSegmentStart + SEGMENT_SIZE, totalQuestions);
  const blockCount = Math.ceil(totalQuestions / SEGMENT_SIZE);
  const segmentSummary = getSegmentSummary(results, currentSegmentStart, currentSegmentEnd);
  const displayIndex = screen === 'start' ? 0 : Math.min(currentIndex + 1, totalQuestions);

  // Countdown → reveal
  useEffect(() => {
    if (screen !== 'countdown' || !pendingReveal) return;
    playCountdownTick(countdownNum);
    const t = setTimeout(() => {
      if (countdownNum > 1) {
        setCountdownNum(prev => prev - 1);
      } else {
        const { question, choice, index } = pendingReveal;
        const ok = choice === question.answer;
        stopDrone();
        if (ok) playRevealCorrect(); else playRevealIncorrect();
        setFlashState(ok ? 'correct' : 'incorrect');
        setTimeout(() => setFlashState(null), 700);
        setResults(prev => {
          const n = [...prev];
          n[index] = { correct: ok, choice, answer: question.answer };
          return n;
        });
        setFeedback({
          ok, answer: question.answer, choices: question.choices,
          explanation: question.explanation || '',
          fun: question.fun || '',
          userChoice: choice, questionId: question.id, prompt: question.prompt,
        });
        setExplanationDisplayed(''); setExplanationLen(0);
        setFunDisplayed(''); setFunLen(0);
        setFeedbackPhase('explanation');
        setPendingReveal(null);
        setScreen('feedback');
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [screen, countdownNum, pendingReveal]);

  // Explanation typewriter
  useEffect(() => {
    if (screen !== 'feedback' || !feedback || feedbackPhase !== 'explanation') return;
    const text = feedback.explanation;
    if (explanationLen >= text.length) {
      const t = setTimeout(() => setFeedbackPhase(feedback.ok ? 'done' : 'fun'), 700);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => {
      setExplanationLen(v => {
        const n = Math.min(v + 1, text.length);
        setExplanationDisplayed(text.slice(0, n));
        return n;
      });
    }, FEEDBACK_REVEAL_MS);
    return () => clearInterval(t);
  }, [screen, feedback, feedbackPhase, explanationLen]);

  // Fun typewriter
  useEffect(() => {
    if (screen !== 'feedback' || !feedback || feedbackPhase !== 'fun') return;
    const text = feedback.fun;
    if (!text || funLen >= text.length) { setFeedbackPhase('done'); return; }
    const t = setInterval(() => {
      setFunLen(v => {
        const n = Math.min(v + 1, text.length);
        setFunDisplayed(text.slice(0, n));
        return n;
      });
    }, FEEDBACK_REVEAL_MS);
    return () => clearInterval(t);
  }, [screen, feedback, feedbackPhase, funLen]);

  const startQuestion = useCallback((index) => {
    setCurrentIndex(index);
    setSelectedChoice(null);
    setFeedback(null);
    setFlashState(null);
  }, []);

  const handleSelectChoice = (choice) => {
    playSelect();
    setSelectedChoice(prev => prev === choice ? null : choice);
  };

  const handleFinalAnswer = () => {
    if (!selectedChoice) return;
    playFinalAnswer();
    const posInBlock = currentIndex - currentSegmentStart;
    const secs = getCountdownSeconds(posInBlock);
    startDrone(secs);
    setPendingReveal({ question: currentQuestion, choice: selectedChoice, index: currentIndex });
    setCountdownNum(secs);
    setScreen('countdown');
  };

  const goNextAfterFeedback = useCallback(() => {
    // 不正解 → ゲームオーバー（セグメント画面へ）
    if (feedback && !feedback.ok) { setScreen('segment'); return; }
    const nextIndex = currentIndex + 1;
    const finished = currentIndex + 1;
    if (finished >= totalQuestions) { setScreen('done'); return; }
    if (finished % SEGMENT_SIZE === 0) { setScreen('segment'); return; }
    startQuestion(nextIndex);
    setScreen('quiz');
  }, [feedback, currentIndex, totalQuestions, startQuestion]);

  const goToNextBlock = () => {
    const n = currentIndex + 1;
    if (n >= totalQuestions) { setScreen('done'); return; }
    startQuestion(n);
    setScreen('quiz');
  };

  const restart = () => {
    setResults([]);
    startQuestion(0);
    introPlayedRef.current = false;
    setStartReady(false);
    setScreen('start');
  };

  if (totalQuestions === 0) {
    return (
      <div style={{ minHeight: '100vh', background: '#070709', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Share Tech Mono, monospace' }}>
        quizzes/ フォルダに JSON ファイルが見つかりません
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#070709', color: '#fff', position: 'relative', overflowX: 'hidden', fontFamily: 'Rajdhani, sans-serif' }}>
      <HexBackground />
      {screen === 'start' && <ShootingStars />}

      {/* Flash overlay */}
      {flashState && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none', background: flashState === 'correct' ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)', animation: 'flash-fade 0.7s ease-out forwards' }} />
      )}

      {/* Ambient glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(ellipse 60% 30% at 50% 0%, rgba(127,29,29,0.22) 0%, transparent 60%)' }} />

      {/* ── HEADER ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 30, background: 'rgba(5,5,8,0.96)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(185,28,28,0.22)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: isMobile ? '6px 12px' : '8px 20px', display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '20px', flexWrap: 'nowrap' }}>
          <h1 className="font-display metal-text title-glow" style={{ fontSize: isMobile ? '0.95rem' : '1.4rem', letterSpacing: '0.04em', lineHeight: 1, flexShrink: 0 }}>
            {isMobile ? 'Millionaire' : 'Quiz the Tactical Luck Millionaire'}
          </h1>
          <div className="font-terminal" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: isMobile ? '0.65rem' : '0.75rem' }}>
            <div style={{ border: '1px solid rgba(50,50,60,0.8)', padding: isMobile ? '3px 6px' : '4px 10px', background: 'rgba(10,10,14,0.8)' }}>
              <span style={{ color: '#52525b' }}>{isMobile ? '' : '問題 '}</span>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>{displayIndex}</span>
              <span style={{ color: '#3f3f46' }}>/</span>
              <span style={{ color: '#71717a' }}>{totalQuestions}</span>
            </div>
            {!isMobile && (
              <div style={{ border: '1px solid rgba(22,163,74,0.3)', padding: '4px 10px', background: 'rgba(20,83,45,0.15)' }}>
                <span style={{ color: '#52525b' }}>正解 </span>
                <span style={{ color: '#4ade80', fontWeight: 'bold' }}>{correctCount}</span>
              </div>
            )}
            {(screen === 'quiz' || screen === 'countdown' || screen === 'feedback') && (() => {
              const pos = currentIndex - currentSegmentStart;
              const prize = PRIZE_LADDER[Math.min(pos, PRIZE_LADDER.length - 1)];
              return (
                <div style={{ border: '1px solid rgba(245,158,11,0.35)', padding: isMobile ? '3px 6px' : '4px 10px', background: 'rgba(120,53,15,0.15)' }}>
                  {!isMobile && <span style={{ color: '#71717a' }}>挑戦中 </span>}
                  <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{formatPrize(prize)}</span>
                </div>
              );
            })()}
          </div>

          {/* Block dots during quiz/feedback */}
          {(screen === 'quiz' || screen === 'feedback' || screen === 'countdown') ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: 'auto' }}>
              {!isMobile && <span className="font-terminal" style={{ fontSize: '0.55rem', letterSpacing: '0.15em', color: '#3f3f46' }}>{SEGMENT_SIZE}問ブロック進行</span>}
              <BlockDots results={results} segmentStart={currentSegmentStart} segmentEnd={currentSegmentEnd} currentIndex={currentIndex} />
            </div>
          ) : (
            <div style={{ marginLeft: 'auto' }}>
              <RankBadge rank={overallRank} size={isMobile ? 32 : 42} />
            </div>
          )}
        </div>
        <div style={{ height: '2px', background: 'rgba(30,10,10,1)' }}>
          <div style={{ height: '100%', transition: 'width 0.5s ease', width: `${totalQuestions > 0 ? (displayIndex / totalQuestions) * 100 : 0}%`, background: 'linear-gradient(90deg,#7f1d1d,#ef4444)', boxShadow: '0 0 6px rgba(239,68,68,0.5)' }} />
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: isMobile ? '12px 12px' : '24px 20px', position: 'relative', zIndex: 10 }}>

        {/* ══ START ══ */}
        {screen === 'start' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '70vh', paddingTop: isMobile ? '20px' : '40px', gap: isMobile ? '20px' : '32px' }}>
            <div style={{ textAlign: 'center' }}>
              <p className="font-terminal" style={{ color: '#7f1d1d', letterSpacing: '0.4em', fontSize: '0.62rem', textTransform: 'uppercase', marginBottom: '8px' }}>
                ⚔ Tactical Quiz Battle ⚔
              </p>
              <div className="title-glow">
                <h2 className="font-display metal-text" style={{ lineHeight: 0.95, letterSpacing: '0.03em' }}>
                  <span style={{ display: 'block', fontSize: 'clamp(3.5rem,9vw,7rem)' }}>Quiz the</span>
                  <span style={{ display: 'block', fontSize: 'clamp(3.5rem,9vw,7rem)' }}>Tactical Luck</span>
                  <span style={{ display: 'block', fontSize: 'clamp(1.75rem,4.5vw,3.5rem)', marginTop: '0.15em' }}>Millionaire</span>
                </h2>
              </div>
              <p className="font-terminal" style={{ color: '#3f3f46', fontSize: '0.7rem', letterSpacing: '0.2em', marginTop: '12px' }}>
                {totalQuestions} QUESTIONS &nbsp;·&nbsp; {SEGMENT_SIZE} PER BLOCK
              </p>
            </div>

            {/* Quiz selector */}
            {availableQuizzes.length > 1 && (
              <div style={{ width: '100%', maxWidth: '28rem' }}>
                <p className="font-terminal" style={{ textAlign: 'center', color: '#3f3f46', fontSize: '0.6rem', letterSpacing: '0.3em', marginBottom: '8px' }}>— SELECT QUIZ —</p>
                <div style={{ position: 'relative' }}>
                  <select
                    className="font-terminal"
                    style={{ width: '100%', background: 'rgba(10,5,5,0.95)', color: '#fff', border: '1px solid #7f1d1d', padding: '12px 40px 12px 16px', fontSize: '1.1rem', cursor: 'pointer', appearance: 'none', boxShadow: '0 0 12px rgba(127,29,29,0.3)', outline: 'none' }}
                    value={selectedQuizName}
                    onChange={e => { setSelectedQuizName(e.target.value); setResults([]); startQuestion(0); setStartReady(false); }}>
                    {availableQuizzes.map(q => <option key={q.name} value={q.name}>{q.name}</option>)}
                  </select>
                  <span style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#7f1d1d', pointerEvents: 'none' }}>▼</span>
                </div>
              </div>
            )}

            {!startReady ? (
              /* Phase 1: Click to Begin */
              <button
                className="btn-primary font-display"
                style={{ fontSize: 'clamp(1.6rem,4vw,2.4rem)', letterSpacing: '0.18em', color: '#f8d4d4', padding: '1.4rem 4rem', border: '1px solid #7f1d1d', background: 'linear-gradient(160deg,#3b0000,#7f1d1d)', boxShadow: '0 0 40px rgba(185,28,28,0.5), 0 0 80px rgba(127,29,29,0.2), inset 0 1px 0 rgba(255,255,255,0.06)' }}
                onClick={() => {
                  if (!introPlayedRef.current) { introPlayedRef.current = true; playIntro(); }
                  setStartReady(true);
                }}>
                ▶ CLICK TO BEGIN
              </button>
            ) : (
              /* Phase 2: Block selection */
              <div style={{ width: '100%', maxWidth: '640px' }}>
                <p className="font-terminal" style={{ textAlign: 'center', color: '#3f3f46', fontSize: '0.6rem', letterSpacing: '0.3em', marginBottom: '12px' }}>
                  — SELECT STARTING BLOCK —
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                  {Array.from({ length: blockCount }, (_, block) => {
                    const s = block * SEGMENT_SIZE;
                    const e = Math.min(s + SEGMENT_SIZE, totalQuestions);
                    const good = results.slice(s, e).filter(r => r?.correct).length;
                    const done = results.slice(s, e).filter(Boolean).length === e - s;
                    return (
                      <button key={block}
                        className="block-btn"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 4px', border: `1px solid ${done ? 'rgba(22,163,74,0.5)' : 'rgba(63,63,70,0.6)'}`, background: done ? 'rgba(20,83,45,0.2)' : 'rgba(12,12,16,0.9)', cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'all 0.15s ease' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.8)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = done ? 'rgba(22,163,74,0.5)' : 'rgba(63,63,70,0.6)'; e.currentTarget.style.transform = 'none'; }}
                        onClick={() => {
                          // そのブロックの結果をリセットしてから開始
                          setResults(prev => {
                            const n = [...prev];
                            for (let i = s; i < e; i++) n[i] = undefined;
                            return n;
                          });
                          startQuestion(s); setScreen('quiz');
                        }}>
                        <span className="font-terminal" style={{ fontSize: '0.65rem', color: done ? '#86efac' : '#52525b' }}>
                          {s + 1}–{e}
                        </span>
                        <span className="font-display" style={{ fontSize: done ? '0.85rem' : '0.8rem', color: done ? '#4ade80' : '#3f3f46', marginTop: '4px' }}>
                          {done ? `✓ ${good}/${e - s}` : `BLOCK ${block + 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ QUIZ ══ */}
        {screen === 'quiz' && currentQuestion && (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '14px' }}>
              <HudFrame label={`第 ${currentQuestion.id} 問`} className={isMobile ? 'p-4' : 'p-6'}>
                <p className="font-tactical" style={{ fontSize: isMobile ? 'clamp(1rem,4vw,1.3rem)' : 'clamp(1.2rem,2.5vw,1.7rem)', color: '#e4e4e7', lineHeight: 1.55 }}>
                  {currentQuestion.prompt}
                </p>
              </HudFrame>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '8px' : '10px' }}>
                {CHOICES.map(c => (
                  <ChoiceButton key={c} label={c} text={currentQuestion.choices[c]}
                    selected={selectedChoice === c} revealed={false}
                    isCorrect={false} isUserChoice={false}
                    onClick={() => handleSelectChoice(c)} disabled={false} />
                ))}
              </div>
              <button
                onClick={handleFinalAnswer}
                disabled={!selectedChoice}
                className={`btn-primary font-display ${selectedChoice ? 'final-btn-active' : ''}`}
                style={{ fontSize: isMobile ? '1.1rem' : '2rem', letterSpacing: isMobile ? '0.05em' : '0.12em', padding: isMobile ? '0.85rem' : '1.1rem', border: `2px solid ${selectedChoice ? '#dc2626' : 'rgba(60,15,15,0.5)'}`, background: selectedChoice ? 'linear-gradient(160deg,#5a0a0a,#b91c1c)' : 'rgba(12,8,8,0.8)', color: selectedChoice ? '#fff' : '#3f3f46', boxShadow: selectedChoice ? '0 0 30px rgba(185,28,28,0.5), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none', cursor: selectedChoice ? 'pointer' : 'not-allowed', transition: 'all 0.25s ease' }}>
                {selectedChoice
                  ? isMobile
                    ? `◆ FINAL ANSWER ◆`
                    : `◆  FINAL ANSWER  —  ${selectedChoice}: ${currentQuestion.choices[selectedChoice]}  ◆`
                  : '選択肢を選んでください'}
              </button>
            </div>
            {!isMobile && (
              <div style={{ width: '220px', flexShrink: 0 }}>
                <HudFrame label={`BLOCK ${Math.floor(currentIndex / SEGMENT_SIZE) + 1}`} className="p-3" style={{ background: 'rgba(5,5,8,0.9)' }}>
                  <PrizeLadder segmentStart={currentSegmentStart} currentIndex={currentIndex} results={results} screen={screen} />
                </HudFrame>
              </div>
            )}
          </div>
        )}

        {/* ══ COUNTDOWN ══ */}
        {screen === 'countdown' && pendingReveal && (
          <div style={{ minHeight: '75vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', border: '2px solid rgba(245,158,11,0.65)', background: 'rgba(120,53,15,0.35)', padding: '10px 30px', marginBottom: '3.5rem', boxShadow: '0 0 20px rgba(245,158,11,0.3)' }}>
                <span className="font-display" style={{ fontSize: '1.8rem', color: '#f59e0b', textShadow: '0 0 10px #f59e0b' }}>
                  {pendingReveal.choice}:
                </span>
                <span className="font-tactical" style={{ fontSize: '1.4rem', color: '#fef3c7' }}>
                  {pendingReveal.question.choices[pendingReveal.choice]}
                </span>
              </div>
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {[1, 2, 3].map(ring => (
                  <div key={ring} style={{ position: 'absolute', width: `${220 + ring * 44}px`, height: `${220 + ring * 44}px`, borderRadius: '50%', border: `${ring === 1 ? 2 : 1}px solid rgba(220,38,38,${0.5 - ring * 0.12})`, animation: `countdown-pulse ${0.9 + ring * 0.35}s ease-in-out infinite`, animationDelay: `${ring * 0.15}s` }} />
                ))}
                <div className="font-display" style={{ fontSize: 'clamp(7rem,18vw,11rem)', lineHeight: 1, color: '#dc2626', textShadow: '0 0 60px rgba(220,38,38,1), 0 0 120px rgba(220,38,38,0.5)', width: '220px', height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(127,29,29,0.28) 0%, transparent 70%)', borderRadius: '50%', border: '3px solid rgba(220,38,38,0.45)' }}>
                  {countdownNum}
                </div>
              </div>
              <p className="font-terminal" style={{ color: '#3f3f46', fontSize: '0.8rem', letterSpacing: '0.25em', marginTop: '3rem', animation: 'blink 1s ease-in-out infinite' }}>
                ▶ 正解を確認しています...
              </p>
            </div>
          </div>
        )}

        {/* ══ FEEDBACK ══ */}
        {screen === 'feedback' && feedback && (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '14px' }}>
              <HudFrame label={`第 ${feedback.questionId} 問`} accent={feedback.ok ? '#22c55e' : '#dc2626'} className="p-6">
                <p className="font-tactical" style={{ fontSize: 'clamp(1.2rem,2.5vw,1.7rem)', color: '#e4e4e7', lineHeight: 1.55 }}>
                  {feedback.prompt}
                </p>
              </HudFrame>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '8px' : '10px' }}>
                {CHOICES.map(c => (
                  <ChoiceButton key={c} label={c} text={feedback.choices[c]}
                    selected={false} revealed={true}
                    isCorrect={c === feedback.answer} isUserChoice={c === feedback.userChoice}
                    onClick={null} disabled={true} />
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '1rem 1.5rem', border: `2px solid ${feedback.ok ? '#22c55e' : '#ef4444'}`, background: feedback.ok ? 'rgba(20,83,45,0.3)' : 'rgba(127,29,29,0.3)', boxShadow: feedback.ok ? '0 0 24px rgba(34,197,94,0.35)' : '0 0 24px rgba(239,68,68,0.35)' }}>
                <span style={{ fontSize: '2rem' }}>{feedback.ok ? '🎉' : '😭'}</span>
                <div>
                  <p className="font-display" style={{ fontSize: 'clamp(2rem,5vw,2.8rem)', lineHeight: 1, letterSpacing: '0.08em', color: feedback.ok ? '#4ade80' : '#f87171', textShadow: `0 0 24px ${feedback.ok ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.6)'}` }}>
                    {feedback.ok ? '正解！' : '不正解...'}
                  </p>
                  <p className="font-tactical" style={{ color: '#a1a1aa', fontSize: '1.15rem', marginTop: '2px' }}>
                    正解: {feedback.answer}  ◆  {feedback.choices[feedback.answer]}
                  </p>
                </div>
              </div>
              <HudFrame label="解説" className="p-5">
                <p className="font-terminal" style={{ color: '#d4d4d8', fontSize: '1.1rem', lineHeight: 1.85 }}>
                  {explanationDisplayed}
                  {feedbackPhase === 'explanation' && <span style={{ color: '#52525b', animation: 'blink 0.8s ease-in-out infinite', display: 'inline-block' }}>█</span>}
                </p>
                {funDisplayed && (
                  <p className="font-terminal" style={{ color: '#f87171', fontSize: '1.05rem', lineHeight: 1.85, marginTop: '12px', fontStyle: 'italic', textShadow: '0 0 8px rgba(248,113,113,0.3)' }}>
                    💢 {funDisplayed}
                    {feedbackPhase === 'fun' && <span style={{ animation: 'blink 0.8s ease-in-out infinite', display: 'inline-block' }}>█</span>}
                  </p>
                )}
              </HudFrame>
              <button
                className="btn-primary font-display"
                onClick={goNextAfterFeedback}
                style={{ fontSize: '2rem', letterSpacing: '0.1em', padding: '1rem', width: '100%', cursor: 'pointer', border: '1px solid rgba(100,100,120,0.5)', background: 'rgba(18,18,24,0.8)', color: '#a1a1aa', transition: 'all 0.2s ease' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.6)'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(100,100,120,0.5)'; e.currentTarget.style.color = '#a1a1aa'; }}>
                {(() => {
                  if (!feedback?.ok) return '💀 ゲームオーバー';
                  if (currentIndex + 1 >= totalQuestions) return '結果を見る →';
                  if (currentIndex + 1 === currentSegmentEnd) return '🏆 COMPLETE! →';
                  return 'NEXT →';
                })()}
              </button>
            </div>
            {!isMobile && (
              <div style={{ width: '220px', flexShrink: 0 }}>
                <HudFrame label={`BLOCK ${Math.floor(currentIndex / SEGMENT_SIZE) + 1}`} className="p-3" style={{ background: 'rgba(5,5,8,0.9)' }}>
                  <PrizeLadder segmentStart={currentSegmentStart} currentIndex={currentIndex} results={results} screen={screen} />
                </HudFrame>
              </div>
            )}
          </div>
        )}

        {/* ══ SEGMENT ══ */}
        {screen === 'segment' && (() => {
          const earned = getEarnedAmount(results, currentSegmentStart);
          const blockResults = results.slice(currentSegmentStart, currentSegmentEnd).filter(Boolean);
          const isWin = blockResults.length === currentSegmentEnd - currentSegmentStart && blockResults.every(r => r.correct);
          const reachedPos = (() => {
            let last = -1;
            for (let i = 0; i < PRIZE_LADDER.length; i++) {
              if (results[currentSegmentStart + i]?.correct) last = i; else break;
            }
            return last;
          })();

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '70vh', paddingTop: '32px', gap: '24px' }}>
              <HudFrame label={isWin ? '🏆 PERFECT CLEAR' : '💀 GAME OVER'} accent={isWin ? '#22c55e' : '#dc2626'}
                className="p-10" style={{ width: '100%', maxWidth: '700px', textAlign: 'center', background: 'rgba(5,5,8,0.95)' }}>
                <p style={{ fontSize: '3.5rem', lineHeight: 1 }}>{isWin ? '🏆🎉' : '💀'}</p>
                <h2 className="font-display" style={{ fontSize: 'clamp(2rem,5vw,3rem)', letterSpacing: '0.1em', color: isWin ? '#4ade80' : '#f87171', marginTop: '8px', textShadow: `0 0 30px ${isWin ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.6)'}` }}>
                  {isWin ? '全問正解！MILLIONAIRE！' : `第${currentIndex - currentSegmentStart + 1}問で敗退`}
                </h2>

                {/* 獲得金額 大表示 */}
                <div style={{ margin: '20px 0', padding: '16px', border: `2px solid ${earned > 0 ? 'rgba(251,191,36,0.6)' : 'rgba(63,63,70,0.5)'}`, background: earned > 0 ? 'rgba(120,53,15,0.25)' : 'rgba(10,10,14,0.5)' }}>
                  <p className="font-terminal" style={{ fontSize: '0.65rem', color: '#71717a', letterSpacing: '0.2em', marginBottom: '6px' }}>獲得金額</p>
                  <p className="font-display" style={{ fontSize: 'clamp(2.5rem,6vw,4rem)', color: earned > 0 ? '#fbbf24' : '#52525b', textShadow: earned > 0 ? '0 0 20px rgba(251,191,36,0.7)' : 'none', letterSpacing: '0.05em' }}>
                    {earned > 0 ? `¥ ${earned.toLocaleString()}` : '¥ 0'}
                  </p>
                  {!isWin && earned === 0 && (
                    <p className="font-terminal" style={{ fontSize: '0.65rem', color: '#7f1d1d', marginTop: '4px' }}>セーフティネット（Q3 / Q7）到達前に敗退</p>
                  )}
                  {!isWin && earned > 0 && (
                    <p className="font-terminal" style={{ fontSize: '0.65rem', color: '#a16207', marginTop: '4px' }}>セーフティネット保証額</p>
                  )}
                </div>

                <p className="font-tactical" style={{ color: '#71717a' }}>{isWin ? 'ミリオネア達成！完璧な回答でした。' : segmentSummary.message}</p>
              </HudFrame>

              <div style={{ width: '100%', maxWidth: '700px', display: 'flex', gap: '12px' }}>
                <button
                  className="btn-primary font-display"
                  onClick={() => { setStartReady(true); setScreen('start'); }}
                  style={{ flex: 1, fontSize: '1.3rem', letterSpacing: '0.1em', padding: '1rem', cursor: 'pointer', border: '1px solid #7f1d1d', background: 'linear-gradient(135deg,#7f1d1d,#b91c1c)', boxShadow: '0 0 25px rgba(185,28,28,0.4)', color: '#fff' }}>
                  🔥 再挑戦 / ブロック選択
                </button>
                {currentIndex + 1 < totalQuestions && results[currentIndex]?.correct && (
                  <button
                    className="btn-primary font-display"
                    onClick={goToNextBlock}
                    style={{ flex: 1, fontSize: '1.1rem', letterSpacing: '0.08em', padding: '1rem', cursor: 'pointer', border: '1px solid rgba(34,197,94,0.5)', background: 'linear-gradient(135deg,rgba(20,83,45,0.8),rgba(22,163,74,0.4))', color: '#4ade80' }}>
                    NEXT BLOCK →
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ══ DONE ══ */}
        {screen === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '75vh', paddingTop: '32px', gap: '24px' }}>
            <HudFrame label="Battle Complete" accent="#dc2626" style={{ width: '100%', maxWidth: '640px', background: 'rgba(5,5,8,0.95)' }}>
              <div style={{ padding: '56px 32px', textAlign: 'center' }}>
                <p className="font-terminal" style={{ color: '#7f1d1d', letterSpacing: '0.4em', fontSize: '0.6rem', textTransform: 'uppercase' }}>▸ Battle Complete ◂</p>
                <h2 className="font-display" style={{ fontSize: 'clamp(3rem,8vw,5.5rem)', letterSpacing: '0.1em', textShadow: '0 0 40px rgba(127,29,29,0.5)', marginTop: '8px' }}>GAME OVER</h2>
                <p className="font-tactical" style={{ color: '#71717a', fontSize: '1.1rem' }}>{correctCount} / {totalQuestions} 正解</p>
                <div style={{ display: 'inline-block', marginTop: '16px' }}>
                  <RankBadge rank={overallRank} size={130} />
                </div>
              </div>
            </HudFrame>

            <div style={{ width: '100%', maxWidth: '640px' }}>
              <HudFrame label="Block Summary" className="p-5">
                <div style={{ display: 'grid', gap: '8px', gridTemplateColumns: 'repeat(2, 1fr)', marginTop: '8px' }}>
                  {Array.from({ length: blockCount }, (_, block) => {
                    const s = block * SEGMENT_SIZE;
                    const e = Math.min(s + SEGMENT_SIZE, totalQuestions);
                    const good = results.slice(s, e).filter(r => r?.correct).length;
                    const rate = good / (e - s);
                    return (
                      <div key={block} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(50,50,60,0.5)', padding: '8px 12px' }}>
                        <span className="font-terminal" style={{ fontSize: '0.7rem', color: '#52525b' }}>BLOCK {block + 1}</span>
                        <span className="font-display" style={{ fontSize: '1.1rem', color: rate >= 0.7 ? '#4ade80' : rate >= 0.5 ? '#facc15' : '#f87171' }}>
                          {good} / {e - s}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </HudFrame>
            </div>

            <button
              className="btn-primary font-display"
              onClick={restart}
              style={{ fontSize: '1.4rem', letterSpacing: '0.12em', padding: '1rem 3.5rem', cursor: 'pointer', border: '1px solid #7f1d1d', background: 'linear-gradient(135deg,#7f1d1d,#b91c1c)', boxShadow: '0 0 25px rgba(185,28,28,0.4)', color: '#fff' }}>
              🔥 PLAY AGAIN
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
