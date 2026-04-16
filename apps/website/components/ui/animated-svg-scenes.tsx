import type { CSSProperties } from "react";

// Shared tokens
const C = {
  accent: "#e8683a",
  accentDeep: "#c15f3c",
  accentSoft: "#f5a584",
  ink: "#0b0d10",
  text: "#4b5563",
  muted: "#6b7280",
  border: "#e5e7eb",
  subtle: "#f1f5f9",
  codeBg: "#0f172a",
  codeLine: "#1e293b",
  surface: "#ffffff",
  surfaceSoft: "#f8fafc",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#f59e0b",
  blue: "#3b82f6",
  purple: "#8b5cf6",
};

const baseRules = `
.svg-root { width: 100%; height: 100%; display: block; }
.svg-float { animation: svgFloat 5.2s ease-in-out infinite; transform-origin: center; }
@keyframes svgFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}
@media (prefers-reduced-motion: reduce) {
  .svg-root * { animation: none !important; transition: none !important; }
}
`;

function SvgShell({
  viewBox,
  children,
  styles,
  className,
  ariaLabel,
}: {
  viewBox: string;
  children: React.ReactNode;
  styles: string;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid meet"
      className={"svg-root " + (className ?? "")}
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>{baseRules + styles}</style>
      {children}
    </svg>
  );
}

// ---------- TERMINAL ----------
export function TerminalSceneSvg() {
  const css = `
.t-window { filter: drop-shadow(0 20px 30px rgba(15,23,42,0.18)); }
.t-prompt { font: 600 13px ui-monospace, Menlo, monospace; fill: ${C.accent}; }
.t-text   { font: 400 11px ui-monospace, Menlo, monospace; fill: #cbd5e1; }
.t-mask { animation: tType 4.8s steps(24, end) infinite; }
@keyframes tType {
  0%   { width: 0; }
  35%  { width: 210px; }
  70%  { width: 210px; }
  100% { width: 0; }
}
.t-bar-fill { transform-origin: 0 50%; animation: tFill 4.8s cubic-bezier(.22,.61,.36,1) infinite; }
@keyframes tFill {
  0%   { transform: scaleX(0); }
  45%  { transform: scaleX(1); }
  95%  { transform: scaleX(1); }
  100% { transform: scaleX(0); }
}
.t-check { stroke-dasharray: 14; stroke-dashoffset: 14; animation: tCheck 4.8s ease-in-out infinite; }
@keyframes tCheck {
  0%,50% { stroke-dashoffset: 14; opacity: 0; }
  60%    { stroke-dashoffset: 0;  opacity: 1; }
  95%    { opacity: 1; }
  100%   { opacity: 0; stroke-dashoffset: 14; }
}
.t-folder { opacity: 0; transform: translateY(6px); animation: tFolder 4.8s ease-out infinite; }
.t-folder.f1 { animation-delay: 1.7s; }
.t-folder.f2 { animation-delay: 2.0s; }
.t-folder.f3 { animation-delay: 2.3s; }
@keyframes tFolder {
  0%,30%  { opacity: 0; transform: translateY(6px); }
  40%,85% { opacity: 1; transform: translateY(0); }
  100%    { opacity: 0; transform: translateY(-2px); }
}
.t-cursor { animation: tBlink 1s steps(1, end) infinite; }
@keyframes tBlink { 0%,50% { opacity:1 } 50.01%,100% { opacity: 0 } }
.t-dot-r { fill: #ff5f57 } .t-dot-y { fill: #febc2e } .t-dot-g { fill: #28c840 }
`;
  return (
    <SvgShell viewBox="0 0 360 240" styles={css} ariaLabel="Terminal boot animation">
      <g className="t-window">
        <rect x="12" y="12" width="336" height="216" rx="14" fill="#0b0d10" />
        <rect x="12" y="12" width="336" height="26" rx="14" fill="#1e293b" />
        <rect x="12" y="30" width="336" height="8" fill="#1e293b" />
      </g>
      <circle className="t-dot-r" cx="28" cy="25" r="4" />
      <circle className="t-dot-y" cx="44" cy="25" r="4" />
      <circle className="t-dot-g" cx="60" cy="25" r="4" />

      {/* Command line */}
      <text x="28" y="64" className="t-prompt">$ npx agileflow setup</text>
      <clipPath id="t-mask-clip">
        <rect x="28" y="50" width="0" height="18" className="t-mask">
          <animate attributeName="width" values="0;210;210;0" dur="4.8s" repeatCount="indefinite" />
        </rect>
      </clipPath>

      {/* Progress bar */}
      <rect x="28" y="78" width="304" height="6" rx="3" fill="#1e293b" />
      <rect x="28" y="78" width="304" height="6" rx="3" fill="url(#t-grad)" className="t-bar-fill" />
      <defs>
        <linearGradient id="t-grad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={C.accentDeep} />
          <stop offset="100%" stopColor={C.accent} />
        </linearGradient>
      </defs>

      {/* Checkmark */}
      <g transform="translate(320,72)">
        <circle r="10" fill={C.green} opacity="0.15" />
        <path d="M-4 0 L-1 3 L5 -3" fill="none" stroke={C.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="t-check" />
      </g>

      {/* Folders */}
      <g transform="translate(28,110)">
        <g className="t-folder f1">
          <rect x="0" y="0" width="14" height="10" rx="2" fill={C.accent} />
          <rect x="2" y="-2" width="6" height="3" fill={C.accent} />
          <text x="20" y="9" className="t-text">docs/</text>
        </g>
        <g className="t-folder f2" transform="translate(0,22)">
          <rect x="0" y="0" width="14" height="10" rx="2" fill={C.blue} />
          <rect x="2" y="-2" width="6" height="3" fill={C.blue} />
          <text x="20" y="9" className="t-text">.claude/commands/</text>
        </g>
        <g className="t-folder f3" transform="translate(0,44)">
          <rect x="0" y="0" width="14" height="10" rx="2" fill={C.green} />
          <rect x="2" y="-2" width="6" height="3" fill={C.green} />
          <text x="20" y="9" className="t-text">scripts/</text>
        </g>
      </g>

      {/* Cursor */}
      <rect x="28" y="192" width="8" height="14" fill={C.accent} className="t-cursor" />
      <text x="42" y="204" className="t-text" opacity="0.65">ready.</text>
    </SvgShell>
  );
}

// ---------- FOLDERS ----------
export function FoldersSceneSvg() {
  const css = `
.f-tree   { stroke: ${C.border}; stroke-width: 1.5; fill: none; }
.f-label  { font: 500 11px ui-monospace, Menlo, monospace; fill: ${C.text}; }
.f-card   { fill: ${C.surface}; stroke: ${C.border}; stroke-width: 1; }
.f-root   { fill: ${C.accent}; }
.f-dot    { r: 3.2; }
.f-dot-1  { fill: ${C.blue}; }
.f-dot-2  { fill: ${C.purple}; }
.f-dot-3  { fill: ${C.accent}; }
.f-dot-4  { fill: ${C.green}; }
.f-dot-5  { fill: ${C.accentDeep}; }
.f-pulse  { animation: fPulse 2.8s ease-in-out infinite; transform-origin: center; }
.f-pulse.p2 { animation-delay: 0.35s; }
.f-pulse.p3 { animation-delay: 0.7s; }
.f-pulse.p4 { animation-delay: 1.05s; }
.f-pulse.p5 { animation-delay: 1.4s; }
@keyframes fPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.45); } }
.f-lens   { animation: fLens 6s ease-in-out infinite; }
@keyframes fLens {
  0%,20%   { transform: translate(140px, 52px); }
  40%,60%  { transform: translate(140px, 100px); }
  80%,100% { transform: translate(140px, 148px); }
}
.f-glow { animation: fLens 6s ease-in-out infinite; }
.f-tooltip { animation: fTip 6s ease-in-out infinite; }
@keyframes fTip {
  0%,20%   { transform: translate(180px, 48px); }
  40%,60%  { transform: translate(180px, 96px); }
  80%,100% { transform: translate(180px, 144px); }
}
`;
  return (
    <SvgShell viewBox="0 0 360 240" styles={css} ariaLabel="Folder tree animation">
      <rect x="12" y="12" width="336" height="216" rx="16" fill={C.surface} stroke={C.border} />
      {/* Root folder */}
      <g transform="translate(48,30)">
        <rect className="f-card" width="88" height="28" rx="8" />
        <rect className="f-root" x="8" y="8" width="14" height="12" rx="2" />
        <rect className="f-root" x="10" y="5" width="6" height="4" />
        <text x="30" y="19" className="f-label">docs/</text>
      </g>
      {/* Tree connectors */}
      <path className="f-tree" d="M60 66 L60 196 M60 80 L96 80 M60 112 L96 112 M60 144 L96 144 M60 176 L96 176" />
      {/* Child rows */}
      {[
        { y: 72, label: "00-meta/", dot: 1 },
        { y: 104, label: "03-decisions/", dot: 2 },
        { y: 136, label: "05-epics/", dot: 3 },
        { y: 168, label: "06-stories/", dot: 4 },
        { y: 200, label: "09-agents/", dot: 5 },
      ].map((row, i) => (
        <g key={row.label} transform={`translate(96,${row.y - 12})`}>
          <rect className="f-card" width="160" height="22" rx="6" />
          <circle className={`f-pulse p${i + 1}`} cx="14" cy="11" r="3.2" fill={
            row.dot === 1 ? C.blue : row.dot === 2 ? C.purple : row.dot === 3 ? C.accent : row.dot === 4 ? C.green : C.accentDeep
          } />
          <text x="28" y="15" className="f-label">{row.label}</text>
        </g>
      ))}

      {/* Magnifying glass spotlight */}
      <g className="f-glow" opacity="0.35">
        <circle r="30" fill={C.accent} opacity="0.18" />
      </g>
      <g className="f-lens">
        <circle r="12" fill="none" stroke={C.accent} strokeWidth="2" />
        <circle r="8" fill={C.accent} opacity="0.08" />
        <line x1="9" y1="9" x2="18" y2="18" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {/* Floating tooltip */}
      <g className="f-tooltip">
        <rect x="0" y="-8" width="84" height="16" rx="8" fill={C.ink} />
        <text x="10" y="3" font-family="ui-monospace, Menlo, monospace" font-size="9" fill="#fff">/agileflow:help</text>
      </g>
    </SvgShell>
  );
}

// ---------- FLOW ----------
export function FlowSceneSvg() {
  const css = `
.fl-arrow { stroke: ${C.border}; stroke-width: 1.8; fill: none; stroke-dasharray: 4 4; animation: flDash 1.6s linear infinite; }
@keyframes flDash { to { stroke-dashoffset: -16; } }
.fl-pill  { stroke: ${C.border}; stroke-width: 1; }
.fl-pill-text { font: 600 11px ui-sans-serif, system-ui; fill: #fff; }
.fl-particle { animation: flPath 5.5s cubic-bezier(.6,.05,.4,.95) infinite; }
@keyframes flPath {
  0%   { transform: translate(56px, 120px); opacity: 0; }
  5%   { opacity: 1; }
  24%  { transform: translate(132px, 120px); }
  50%  { transform: translate(208px, 120px); }
  76%  { transform: translate(284px, 120px); }
  95%  { opacity: 1; }
  100% { transform: translate(304px, 120px); opacity: 0; }
}
.fl-trail { animation: flTrail 5.5s cubic-bezier(.6,.05,.4,.95) infinite; }
.fl-trail.t1 { animation-delay: -0.1s; }
.fl-trail.t2 { animation-delay: -0.2s; }
.fl-trail.t3 { animation-delay: -0.3s; }
@keyframes flTrail {
  0%,5%   { opacity: 0; }
  10%,95% { opacity: 0.28; }
  100%    { opacity: 0; }
}
.fl-bob { animation: flBob 5.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.fl-bob.b2 { animation-delay: 1.38s; }
.fl-bob.b3 { animation-delay: 2.75s; }
.fl-bob.b4 { animation-delay: 4.12s; }
@keyframes flBob {
  0%,10%,100% { transform: translateY(0) scale(1); }
  14%,20%     { transform: translateY(-4px) scale(1.06); }
  30%         { transform: translateY(0) scale(1); }
}
`;
  const pills = [
    { label: "Plan", x: 28, fill: C.blue, cls: "b1" },
    { label: "Record", x: 104, fill: C.green, cls: "b2" },
    { label: "Verify", x: 180, fill: C.accent, cls: "b3" },
    { label: "Ship", x: 256, fill: C.ink, cls: "b4" },
  ];
  return (
    <SvgShell viewBox="0 0 360 240" styles={css} ariaLabel="Workflow pipeline animation">
      <rect x="12" y="12" width="336" height="216" rx="16" fill={C.surface} stroke={C.border} />
      {/* Header */}
      <text x="28" y="46" font-family="ui-sans-serif, system-ui" font-size="11" fontWeight="500" fill={C.muted}>
        plan → record → verify → ship
      </text>

      {/* Arrows */}
      {pills.slice(0, -1).map((p, i) => (
        <path
          key={i}
          className="fl-arrow"
          d={`M${p.x + 56} 120 L${pills[i + 1].x} 120`}
          markerEnd="url(#fl-head)"
        />
      ))}
      <defs>
        <marker id="fl-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill={C.border} />
        </marker>
      </defs>

      {/* Pills */}
      {pills.map((p) => (
        <g key={p.label} className={`fl-bob ${p.cls}`}>
          <rect className="fl-pill" x={p.x} y="102" width="56" height="36" rx="18" fill={p.fill} />
          <text className="fl-pill-text" x={p.x + 28} y="124" textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}

      {/* Trail + particle */}
      <circle className="fl-trail t3" r="3" fill={C.accent} opacity="0.12" />
      <circle className="fl-trail t2" r="3.5" fill={C.accent} opacity="0.2" />
      <circle className="fl-trail t1" r="4" fill={C.accent} opacity="0.3" />
      <circle className="fl-particle" r="5" fill={C.accent}>
        <animate attributeName="opacity" values="0;1;1;0" dur="5.5s" repeatCount="indefinite" />
      </circle>
    </SvgShell>
  );
}

// ---------- KANBAN ----------
export function KanbanSceneSvg() {
  const css = `
.k-col   { fill: ${C.surfaceSoft}; stroke: ${C.border}; stroke-width: 1; }
.k-col-h { font: 600 10px ui-sans-serif, system-ui; fill: ${C.text}; letter-spacing: 0.04em; }
.k-card  { fill: ${C.surface}; stroke: ${C.border}; stroke-width: 1; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.04)); }
.k-bar   { fill: ${C.border}; }
.k-pulse { animation: kDot 2.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.k-pulse.p2 { animation-delay: 0.4s; }
.k-pulse.p3 { animation-delay: 0.8s; }
.k-pulse.p4 { animation-delay: 1.2s; }
.k-pulse.p5 { animation-delay: 1.6s; }
@keyframes kDot { 0%,100% { transform: scale(1); } 50% { transform: scale(1.3); } }
.k-drag { animation: kDrag 5.6s cubic-bezier(.44,.1,.25,1) infinite; }
@keyframes kDrag {
  0%, 10%  { transform: translate(0, 0) rotate(0); opacity: 1; }
  30%, 45% { transform: translate(110px, -6px) rotate(-3deg); opacity: 1; }
  55%      { transform: translate(220px, -2px) rotate(-3deg); opacity: 1; }
  70%, 100%{ transform: translate(220px, 0) rotate(0); opacity: 1; }
}
.k-check { stroke-dasharray: 10; stroke-dashoffset: 10; animation: kCheck 5.6s ease-in-out infinite; animation-delay: 0.6s; }
@keyframes kCheck {
  0%,60%     { stroke-dashoffset: 10; opacity: 0; }
  75%,100%   { stroke-dashoffset: 0;  opacity: 1; }
}
`;

  const Card = ({
    x,
    y,
    dotColor,
    barW,
    extra,
  }: {
    x: number;
    y: number;
    dotColor: string;
    barW: number;
    extra?: string;
  }) => (
    <g transform={`translate(${x},${y})`} className={extra ?? ""}>
      <rect className="k-card" width="96" height="28" rx="6" />
      <circle cx="12" cy="14" r="3.5" fill={dotColor} />
      <rect x="22" y="12" width={barW} height="4" rx="2" className="k-bar" />
    </g>
  );

  return (
    <SvgShell viewBox="0 0 360 240" styles={css} ariaLabel="Kanban board animation">
      <rect x="12" y="12" width="336" height="216" rx="16" fill={C.surface} stroke={C.border} />
      {/* Columns */}
      <g transform="translate(24,30)">
        <rect className="k-col" width="104" height="196" rx="10" />
        <text className="k-col-h" x="12" y="18">READY</text>
      </g>
      <g transform="translate(134,30)">
        <rect className="k-col" width="104" height="196" rx="10" />
        <text className="k-col-h" x="12" y="18">IN PROGRESS</text>
      </g>
      <g transform="translate(244,30)">
        <rect className="k-col" width="104" height="196" rx="10" />
        <text className="k-col-h" x="12" y="18">DONE</text>
      </g>

      {/* Ready cards */}
      <g transform="translate(28,64)">
        <Card x={0} y={0} dotColor={C.amber} barW={54} />
        <Card x={0} y={40} dotColor={C.green} barW={64} />
      </g>

      {/* In-progress cards */}
      <g transform="translate(138,64)">
        <Card x={0} y={0} dotColor={C.red} barW={62} />
        <Card x={0} y={80} dotColor={C.amber} barW={50} />
      </g>

      {/* Done cards with checkmarks */}
      <g transform="translate(248,64)">
        <g>
          <Card x={0} y={0} dotColor={C.green} barW={56} />
          <path
            className="k-check"
            d="M74 14 l3 3 l7 -7"
            fill="none"
            stroke={C.green}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g>
          <Card x={0} y={40} dotColor={C.green} barW={62} />
          <path
            className="k-check"
            d="M74 54 l3 3 l7 -7"
            fill="none"
            stroke={C.green}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ animationDelay: "1s" }}
          />
        </g>
      </g>

      {/* Dragging card */}
      <g className="k-drag" transform="translate(28,144)">
        <Card x={0} y={0} dotColor={C.accent} barW={58} />
      </g>

      {/* Column count badges */}
      <g>
        <circle cx="112" cy="34" r="7" fill={C.border} />
        <text x="112" y="38" font-family="ui-sans-serif" font-size="9" fontWeight="600" fill={C.text} textAnchor="middle">3</text>
        <circle cx="222" cy="34" r="7" fill={C.accent} opacity="0.2" />
        <text x="222" y="38" font-family="ui-sans-serif" font-size="9" fontWeight="600" fill={C.accentDeep} textAnchor="middle">2</text>
        <circle cx="332" cy="34" r="7" fill={C.green} opacity="0.2" />
        <text x="332" y="38" font-family="ui-sans-serif" font-size="9" fontWeight="600" fill={C.green} textAnchor="middle">2</text>
      </g>
    </SvgShell>
  );
}

// ---------- DECISION ----------
export function DecisionSceneSvg() {
  const css = `
.d-doc   { fill: ${C.surface}; stroke: ${C.border}; stroke-width: 1; }
.d-title { font: 600 11px ui-monospace, Menlo, monospace; fill: ${C.ink}; }
.d-label { font: 500 10px ui-sans-serif, system-ui; fill: ${C.muted}; }
.d-path-rej { stroke: ${C.border}; stroke-width: 1.5; fill: none; stroke-dasharray: 140; stroke-dashoffset: 140; animation: dDraw 4.8s ease-out infinite; }
.d-path-rej.r2 { animation-delay: 0.3s; }
.d-path-chosen { stroke: ${C.green}; stroke-width: 2.5; fill: none; stroke-dasharray: 140; stroke-dashoffset: 140; animation: dDraw 4.8s ease-out infinite; animation-delay: 0.55s; filter: drop-shadow(0 0 6px rgba(34,197,94,0.35)); }
@keyframes dDraw {
  0%,5%    { stroke-dashoffset: 140; opacity: 0; }
  25%      { stroke-dashoffset: 0;   opacity: 1; }
  95%      { stroke-dashoffset: 0;   opacity: 1; }
  100%     { stroke-dashoffset: 0;   opacity: 0; }
}
.d-stamp { animation: dStamp 4.8s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
@keyframes dStamp {
  0%,40%  { transform: scale(0); opacity: 0; }
  55%     { transform: scale(1.15); opacity: 1; }
  65%     { transform: scale(0.95); opacity: 1; }
  75%,92% { transform: scale(1); opacity: 1; }
  100%    { transform: scale(1); opacity: 0; }
}
.d-x { opacity: 0; animation: dX 4.8s ease-in-out infinite; }
.d-x.x1 { animation-delay: 0.7s; }
.d-x.x2 { animation-delay: 0.95s; }
@keyframes dX {
  0%,50%   { opacity: 0; }
  70%,92%  { opacity: 1; }
  100%     { opacity: 0; }
}
`;
  return (
    <SvgShell viewBox="0 0 360 240" styles={css} ariaLabel="Decision record animation">
      <rect x="12" y="12" width="336" height="216" rx="16" fill={C.surface} stroke={C.border} />
      {/* ADR header */}
      <g transform="translate(138,28)">
        <rect className="d-doc" width="84" height="24" rx="6" />
        <text x="42" y="16" className="d-title" textAnchor="middle">ADR-0042</text>
      </g>
      {/* Branch from single point */}
      <path className="d-path-rej"    d="M180 56 Q 120 90 80 140" />
      <path className="d-path-chosen" d="M180 56 Q 180 110 180 146" />
      <path className="d-path-rej r2" d="M180 56 Q 240 90 280 140" />

      {/* Labels */}
      <text x="76"  y="156" className="d-label" textAnchor="middle">Option A</text>
      <text x="180" y="156" className="d-label" textAnchor="middle" fill={C.ink} fontWeight="600">Option B</text>
      <text x="284" y="156" className="d-label" textAnchor="middle">Option C</text>

      {/* Rejected endpoints */}
      <g className="d-x x1">
        <circle cx="80" cy="138" r="10" fill={C.surface} stroke={C.border} />
        <path d="M76 134 l8 8 M84 134 l-8 8" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <g className="d-x x2">
        <circle cx="280" cy="138" r="10" fill={C.surface} stroke={C.border} />
        <path d="M276 134 l8 8 M284 134 l-8 8" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* Chosen stamp */}
      <g className="d-stamp" transform="translate(180,178)">
        <circle r="22" fill={C.green} opacity="0.12" />
        <circle r="16" fill="none" stroke={C.green} strokeWidth="2" />
        <text y="3" textAnchor="middle" font-family="ui-sans-serif" font-size="9" fontWeight="700" fill={C.green}>DECIDED</text>
      </g>

      {/* Diff indicator */}
      <g transform="translate(24,208)">
        <rect width="80" height="18" rx="9" fill={C.surfaceSoft} stroke={C.border} />
        <text x="12" y="12" font-family="ui-monospace" font-size="10" fontWeight="600" fill={C.green}>+12</text>
        <text x="36" y="12" font-family="ui-monospace" font-size="10" fontWeight="600" fill={C.muted}>-0</text>
        <path d="M60 6 v6 M60 12 l4 2 M60 12 l-4 2" stroke={C.muted} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </g>
    </SvgShell>
  );
}

// ---------- DOCS (skyline) ----------
export function DocsSceneSvg() {
  const css = `
.ds-block { transition: transform 400ms cubic-bezier(.22,.61,.36,1); transform-box: fill-box; transform-origin: 50% 100%; }
.ds-block { animation: dsWave 6s ease-in-out infinite; }
.ds-block.b1 { animation-delay: 0s; }
.ds-block.b2 { animation-delay: 0.06s; }
.ds-block.b3 { animation-delay: 0.12s; }
.ds-block.b4 { animation-delay: 0.18s; }
.ds-block.b5 { animation-delay: 0.24s; }
.ds-block.b6 { animation-delay: 0.3s; }
.ds-block.b7 { animation-delay: 0.36s; }
.ds-block.b8 { animation-delay: 0.42s; }
.ds-block.b9 { animation-delay: 0.48s; }
.ds-block.b10 { animation-delay: 0.54s; }
.ds-block.b11 { animation-delay: 0.6s; }
@keyframes dsWave { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.ds-dash { stroke: ${C.border}; stroke-dasharray: 2 4; stroke-width: 1; animation: dsMarch 2.4s linear infinite; fill: none; }
@keyframes dsMarch { to { stroke-dashoffset: -16; } }
.ds-git { animation: dsSpin 14s linear infinite; transform-box: fill-box; transform-origin: center; }
@keyframes dsSpin { to { transform: rotate(360deg); } }
.ds-msg { font: 500 8px ui-monospace, Menlo, monospace; fill: ${C.muted}; }
`;

  // Block heights for skyline effect
  const blocks = [
    { x: 22,  h: 34,  accent: false },
    { x: 50,  h: 50,  accent: false },
    { x: 78,  h: 64,  accent: false },
    { x: 106, h: 82,  accent: true },  // epics
    { x: 134, h: 74,  accent: false },
    { x: 162, h: 96,  accent: false },
    { x: 190, h: 66,  accent: false },
    { x: 218, h: 54,  accent: false },
    { x: 246, h: 88,  accent: true }, // agents
    { x: 274, h: 60,  accent: false },
    { x: 302, h: 40,  accent: false },
  ];

  return (
    <SvgShell viewBox="0 0 360 240" styles={css} ariaLabel="Docs folder skyline">
      <rect x="12" y="12" width="336" height="216" rx="16" fill={C.surface} stroke={C.border} />

      {/* Ground line */}
      <line x1="12" y1="196" x2="348" y2="196" stroke={C.border} strokeWidth="1" />

      {/* Skyline blocks */}
      {blocks.map((b, i) => {
        const top = 196 - b.h;
        const fill = b.accent ? C.accent : i % 3 === 0 ? "#94a3b8" : i % 3 === 1 ? "#cbd5e1" : "#e2e8f0";
        const side = b.accent ? C.accentDeep : "#64748b";
        return (
          <g key={i} className={`ds-block b${i + 1}`}>
            {/* Front face */}
            <rect x={b.x} y={top} width="22" height={b.h} fill={fill} opacity={b.accent ? 0.9 : 0.85} />
            {/* Top */}
            <polygon
              points={`${b.x},${top} ${b.x + 6},${top - 6} ${b.x + 28},${top - 6} ${b.x + 22},${top}`}
              fill={fill}
            />
            {/* Side */}
            <polygon
              points={`${b.x + 22},${top} ${b.x + 28},${top - 6} ${b.x + 28},${196 - 6} ${b.x + 22},196`}
              fill={side}
              opacity="0.7"
            />
            {/* Dashed connector */}
            <line className="ds-dash" x1={b.x + 11} y1={top} x2={b.x + 11} y2="60" />
          </g>
        );
      })}

      {/* Git icon */}
      <g transform="translate(180,42)" className="ds-git">
        <circle r="12" fill={C.surface} stroke={C.border} />
        <circle r="3" cx="-5" cy="-3" fill={C.accent} />
        <circle r="3" cx="5"  cy="-3" fill={C.accent} />
        <circle r="3" cx="0"  cy="5"  fill={C.accent} />
        <path d="M-5 -3 L0 5 L5 -3" stroke={C.accentDeep} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </g>

      {/* Commit message */}
      <g transform="translate(212,38)">
        <rect width="124" height="16" rx="8" fill={C.surfaceSoft} stroke={C.border} />
        <text x="10" y="11" className="ds-msg">docs: add architecture</text>
      </g>
    </SvgShell>
  );
}

// ---------- BUS ----------
export function BusSceneSvg() {
  const css = `
.b-bus    { stroke: url(#b-grad); stroke-width: 3; fill: none; filter: drop-shadow(0 0 6px rgba(232,104,58,0.35)); }
.b-node   { fill: ${C.surface}; stroke: ${C.border}; stroke-width: 1; }
.b-label  { font: 600 10px ui-sans-serif, system-ui; fill: ${C.text}; }
.b-conn   { stroke: ${C.border}; stroke-width: 1; }
.b-packet { animation: bPacket 2.4s ease-in-out infinite; }
.b-packet.p1 { animation-delay: 0s; }
.b-packet.p2 { animation-delay: 0.4s; }
.b-packet.p3 { animation-delay: 0.8s; }
.b-packet.p4 { animation-delay: 1.2s; }
.b-packet.p5 { animation-delay: 1.6s; }
@keyframes bPacket {
  0%,100% { transform: translateY(var(--start,0)); opacity: 0; }
  15%     { opacity: 1; }
  50%     { transform: translateY(var(--mid,50%)); opacity: 1; }
  85%     { opacity: 1; }
}
.b-node-pulse { transform-box: fill-box; transform-origin: center; animation: bPulse 2.6s ease-in-out infinite; }
.b-node-pulse.n2 { animation-delay: 0.4s; }
.b-node-pulse.n3 { animation-delay: 0.8s; }
.b-node-pulse.n4 { animation-delay: 1.2s; }
.b-node-pulse.n5 { animation-delay: 1.6s; }
@keyframes bPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
`;

  const topAgents = [
    { x: 54,  letter: "M" },
    { x: 130, letter: "U" },
    { x: 206, letter: "A" },
  ];
  const bottomAgents = [
    { x: 92,  letter: "C" },
    { x: 168, letter: "S" },
  ];
  return (
    <SvgShell viewBox="0 0 260 200" styles={css} ariaLabel="Message bus animation">
      <defs>
        <linearGradient id="b-grad" x1="0" x2="1">
          <stop offset="0%" stopColor={C.accentDeep} />
          <stop offset="100%" stopColor={C.accent} />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="248" height="188" rx="14" fill={C.surface} stroke={C.border} />
      {/* Bus */}
      <line className="b-bus" x1="24" y1="100" x2="236" y2="100" strokeLinecap="round" />

      {/* Top agents */}
      {topAgents.map((a, i) => (
        <g key={`t${i}`}>
          <line className="b-conn" x1={a.x} y1="48" x2={a.x} y2="100" />
          <g className={`b-node-pulse n${i + 1}`} style={{ transformOrigin: `${a.x}px 40px` }}>
            <circle className="b-node" cx={a.x} cy="40" r="12" />
            <text x={a.x} y="44" className="b-label" textAnchor="middle">{a.letter}</text>
          </g>
          <rect className={`b-packet p${i + 1}`} x={a.x - 4} y="54" width="8" height="4" rx="1" fill={C.accent} style={{ "--start": "0px", "--mid": "36px" } as CSSProperties} />
        </g>
      ))}

      {/* Bottom agents */}
      {bottomAgents.map((a, i) => (
        <g key={`b${i}`}>
          <line className="b-conn" x1={a.x} y1="100" x2={a.x} y2="152" />
          <g className={`b-node-pulse n${i + 4}`} style={{ transformOrigin: `${a.x}px 160px` }}>
            <circle className="b-node" cx={a.x} cy="160" r="12" />
            <text x={a.x} y="164" className="b-label" textAnchor="middle">{a.letter}</text>
          </g>
          <rect className={`b-packet p${i + 4}`} x={a.x - 4} y="108" width="8" height="4" rx="1" fill={C.accent} style={{ "--start": "0px", "--mid": "36px" } as CSSProperties} />
        </g>
      ))}
    </SvgShell>
  );
}

// ---------- VELOCITY ----------
export function VelocitySceneSvg() {
  const css = `
.v-axis  { stroke: ${C.border}; stroke-width: 1; }
.v-grid  { stroke: ${C.subtle}; stroke-width: 1; stroke-dasharray: 2 3; }
.v-line  { stroke: ${C.accent}; stroke-width: 2.5; fill: none; stroke-dasharray: 260; stroke-dashoffset: 260; animation: vDraw 4.6s ease-in-out infinite; }
@keyframes vDraw {
  0%,5%    { stroke-dashoffset: 260; }
  30%,85%  { stroke-dashoffset: 0; }
  100%     { stroke-dashoffset: 260; }
}
.v-area  { fill: url(#v-grad); opacity: 0; animation: vArea 4.6s ease-in-out infinite; animation-delay: 0.6s; }
@keyframes vArea {
  0%,15%   { opacity: 0; }
  40%,85%  { opacity: 0.9; }
  100%     { opacity: 0; }
}
.v-dot   { fill: ${C.accent}; opacity: 0; animation: vDot 4.6s ease-in-out infinite; }
.v-dot.d2 { animation-delay: 0.25s; }
.v-dot.d3 { animation-delay: 0.45s; }
.v-dot.d4 { animation-delay: 0.65s; }
.v-dot.d5 { animation-delay: 0.85s; }
.v-dot.d6 { animation-delay: 1.05s; }
@keyframes vDot {
  0%,30%    { opacity: 0; transform: scale(0.3); }
  45%,85%   { opacity: 1; transform: scale(1); }
  100%      { opacity: 0; transform: scale(0.3); }
}
.v-wip   { fill: ${C.subtle}; }
.v-wip-fill { fill: ${C.green}; animation: vWipPulse 2.4s ease-in-out infinite; }
.v-wip-fill.w2 { animation-delay: 0.2s; }
.v-wip-fill.w3 { animation-delay: 0.4s; }
.v-wip-fill.over { fill: ${C.red}; animation-delay: 0.6s; }
@keyframes vWipPulse { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
.v-trend { animation: vTrend 1.8s ease-in-out infinite; }
@keyframes vTrend { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
.v-label { font: 500 9px ui-sans-serif, system-ui; fill: ${C.muted}; }
`;
  const points = [
    { x: 30,  y: 145 },
    { x: 66,  y: 128 },
    { x: 102, y: 132 },
    { x: 138, y: 108 },
    { x: 174, y: 92 },
    { x: 210, y: 78 },
  ];
  const pathD = `M${points.map((p) => `${p.x},${p.y}`).join(" L")}`;
  const areaD = `${pathD} L210,170 L30,170 Z`;

  return (
    <SvgShell viewBox="0 0 260 200" styles={css} ariaLabel="Velocity chart animation">
      <defs>
        <linearGradient id="v-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="248" height="188" rx="14" fill={C.surface} stroke={C.border} />

      {/* WIP Limit Bar header */}
      <text x="18" y="30" className="v-label">WIP</text>
      <text x="220" y="30" className="v-label" textAnchor="end">3/5</text>
      {/* WIP bar: 5 segments */}
      {[0,1,2,3,4].map((i) => (
        <rect
          key={i}
          x={18 + i * 44}
          y="38"
          width="40"
          height="8"
          rx="4"
          className={
            i < 3 ? `v-wip-fill ${i === 0 ? "" : i === 1 ? "w2" : "w3"}` :
            i === 3 ? "v-wip-fill over" :
            "v-wip"
          }
        />
      ))}

      {/* Chart grid */}
      <line className="v-grid" x1="18" y1="72"  x2="242" y2="72"  />
      <line className="v-grid" x1="18" y1="108" x2="242" y2="108" />
      <line className="v-grid" x1="18" y1="144" x2="242" y2="144" />
      {/* Axis */}
      <line className="v-axis" x1="18" y1="170" x2="242" y2="170" />

      {/* Chart area + line */}
      <path className="v-area" d={areaD} />
      <path className="v-line" d={pathD} />

      {/* Dots */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3.2" className={`v-dot ${i ? "d" + (i + 1) : ""}`} style={{ transformBox: "fill-box", transformOrigin: "center" }} />
      ))}

      {/* Trend label */}
      <g className="v-trend" transform="translate(220,82)">
        <rect x="-4" y="-10" width="28" height="20" rx="4" fill={C.green} opacity="0.1" />
        <path d="M0 4 L8 -4 L6 -4 M8 -4 L8 -2" stroke={C.green} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <text x="10" y="5" className="v-label" fill={C.green} fontWeight="700">+12%</text>
      </g>
    </SvgShell>
  );
}

// ---------- QUALITY ----------
export function QualitySceneSvg() {
  const css = `
.q-ring-bg { stroke: ${C.subtle}; stroke-width: 5; fill: none; }
.q-ring    { stroke: ${C.green}; stroke-width: 5; fill: none; stroke-linecap: round; stroke-dasharray: 220; stroke-dashoffset: 220; animation: qRing 4.6s ease-out infinite; }
@keyframes qRing {
  0%,10%   { stroke-dashoffset: 220; }
  40%,85%  { stroke-dashoffset: 34; }
  100%     { stroke-dashoffset: 220; }
}
.q-shield { transform-origin: center; transform-box: fill-box; animation: qFlip 4.6s ease-in-out infinite; }
@keyframes qFlip {
  0%,40%   { transform: rotateY(0deg); }
  55%      { transform: rotateY(180deg); }
  70%      { transform: rotateY(360deg); }
  100%     { transform: rotateY(360deg); }
}
.q-check  { stroke-dasharray: 18; stroke-dashoffset: 18; animation: qCheck 4.6s ease-in-out infinite; }
@keyframes qCheck {
  0%,40%   { stroke-dashoffset: 18; opacity: 0; }
  55%,95%  { stroke-dashoffset: 0;  opacity: 1; }
  100%     { stroke-dashoffset: 18; opacity: 0; }
}
.q-pill   { opacity: 0; transform: translateY(4px); animation: qPill 4.6s ease-out infinite; }
.q-pill.p2 { animation-delay: 0.15s; }
.q-pill.p3 { animation-delay: 0.3s; }
.q-pill.p4 { animation-delay: 0.45s; }
@keyframes qPill {
  0%,30%   { opacity: 0; transform: translateY(4px); }
  42%,90%  { opacity: 1; transform: translateY(0); }
  100%     { opacity: 0; transform: translateY(-2px); }
}
.q-spin   { transform-origin: center; transform-box: fill-box; animation: qSpin 1.2s linear infinite; }
@keyframes qSpin { to { transform: rotate(360deg); } }
.q-label  { font: 600 9px ui-sans-serif, system-ui; fill: ${C.green}; }
.q-label.amber { fill: ${C.amber}; }
`;
  return (
    <SvgShell viewBox="0 0 260 200" styles={css} ariaLabel="Verification harness animation">
      <rect x="6" y="6" width="248" height="188" rx="14" fill={C.surface} stroke={C.border} />
      {/* Progress ring */}
      <circle className="q-ring-bg" cx="130" cy="78" r="38" />
      <circle className="q-ring" cx="130" cy="78" r="38" transform="rotate(-90 130 78)" />

      {/* Shield */}
      <g className="q-shield" transform="translate(130,78)">
        <path
          d="M0 -22 L14 -16 L14 4 Q14 18 0 22 Q-14 18 -14 4 L-14 -16 Z"
          fill={C.surface}
          stroke={C.ink}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path
          className="q-check"
          d="M-6 0 L-2 4 L7 -5"
          fill="none"
          stroke={C.green}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* Status pills */}
      <g transform="translate(32,140)">
        <g className="q-pill">
          <rect width="44" height="20" rx="10" fill="#f0fdf4" stroke="#bbf7d0" />
          <circle cx="10" cy="10" r="2.5" fill={C.green} />
          <text x="18" y="14" className="q-label">lint</text>
        </g>
        <g className="q-pill p2" transform="translate(52,0)">
          <rect width="44" height="20" rx="10" fill="#f0fdf4" stroke="#bbf7d0" />
          <circle cx="10" cy="10" r="2.5" fill={C.green} />
          <text x="18" y="14" className="q-label">type</text>
        </g>
        <g className="q-pill p3" transform="translate(104,0)">
          <rect width="44" height="20" rx="10" fill="#f0fdf4" stroke="#bbf7d0" />
          <circle cx="10" cy="10" r="2.5" fill={C.green} />
          <text x="18" y="14" className="q-label">test</text>
        </g>
        <g className="q-pill p4" transform="translate(156,0)">
          <rect width="44" height="20" rx="10" fill="#fefce8" stroke="#fef08a" />
          <g className="q-spin" transform="translate(10,10)">
            <path d="M-4 0 A 4 4 0 1 1 0 -4" stroke={C.amber} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </g>
          <text x="18" y="14" className="q-label amber">build</text>
        </g>
      </g>
    </SvgShell>
  );
}

// ---------- DOCS TREE (editor panel) ----------
export function DocsTreeSceneSvg() {
  const css = `
.dt-shell { fill: #0f172a; }
.dt-sidebar { fill: #1e1e2e; }
.dt-pane    { fill: #1a1b26; }
.dt-header  { font: 600 9px ui-monospace, Menlo, monospace; fill: #6b7280; letter-spacing: 0.08em; }
.dt-folder-label { font: 500 10px ui-monospace, Menlo, monospace; fill: #cbd5e1; }
.dt-key     { font: 500 10px ui-monospace, Menlo, monospace; fill: #7aa2f7; }
.dt-str     { font: 500 10px ui-monospace, Menlo, monospace; fill: #9ece6a; }
.dt-punct   { font: 500 10px ui-monospace, Menlo, monospace; fill: #565f89; }
.dt-status  { font: 500 8px ui-monospace, Menlo, monospace; fill: #6b7280; }
.dt-row { opacity: 0; transform: translateX(-6px); animation: dtIn 9s ease-out infinite; }
.dt-row.r1 { animation-delay: 0.0s; }
.dt-row.r2 { animation-delay: 0.18s; }
.dt-row.r3 { animation-delay: 0.36s; }
.dt-row.r4 { animation-delay: 0.54s; }
.dt-row.r5 { animation-delay: 0.72s; }
.dt-row.r6 { animation-delay: 0.9s; }
.dt-row.r7 { animation-delay: 1.08s; }
.dt-row.r8 { animation-delay: 1.26s; }
.dt-row.r9 { animation-delay: 1.44s; }
.dt-row.r10 { animation-delay: 1.62s; }
.dt-row.r11 { animation-delay: 1.8s; }
@keyframes dtIn {
  0%,5%     { opacity: 0; transform: translateX(-8px); }
  20%,85%   { opacity: 1; transform: translateX(0); }
  100%      { opacity: 0; transform: translateX(4px); }
}
.dt-cursor { animation: dtBlink 1s steps(1) infinite; }
@keyframes dtBlink { 50% { opacity: 0; } }
.dt-pulse { animation: dtPulse 2.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes dtPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.35); } }
.dt-highlight { fill: #c15f3c22; }
`;
  const folders = [
    { name: "docs/", color: C.accent, indent: 0, highlight: false },
    { name: "00-meta/", color: C.blue, indent: 12, highlight: false },
    { name: "01-brainstorming/", color: C.purple, indent: 12, highlight: false },
    { name: "02-practices/", color: C.green, indent: 12, highlight: false },
    { name: "03-decisions/", color: C.amber, indent: 12, highlight: false },
    { name: "04-architecture/", color: "#22d3ee", indent: 12, highlight: false },
    { name: "05-epics/", color: C.accent, indent: 12, highlight: false },
    { name: "06-stories/", color: C.accent, indent: 12, highlight: false },
    { name: "07-testing/", color: C.green, indent: 12, highlight: false },
    { name: "08-project/", color: C.blue, indent: 12, highlight: false },
    { name: "09-agents/", color: C.accentDeep, indent: 12, highlight: true },
  ];

  return (
    <SvgShell viewBox="0 0 480 320" styles={css} ariaLabel="Docs folder tree and JSON preview">
      {/* Outer shell */}
      <rect className="dt-shell" x="8" y="8" width="464" height="304" rx="12" />
      {/* Sidebar */}
      <rect className="dt-sidebar" x="8" y="8" width="180" height="304" />
      {/* Title area divider */}
      <rect x="8" y="8" width="464" height="24" fill="#0f172a" />
      <text x="20" y="22" className="dt-header">EXPLORER</text>
      <text x="200" y="22" className="dt-header">status.json</text>

      {/* Folder list */}
      <g transform="translate(20,48)">
        {folders.map((f, i) => (
          <g key={f.name} className={`dt-row r${i + 1}`} transform={`translate(${f.indent},${i * 22})`}>
            {f.highlight && <rect x="-8" y="-4" width="156" height="20" rx="3" className="dt-highlight" />}
            <g>
              <rect x="0" y="0" width="10" height="8" rx="1" fill={f.color} />
              <rect x="2" y="-2" width="5" height="3" fill={f.color} />
            </g>
            <text x="16" y="8" className="dt-folder-label">{f.name}</text>
            <circle cx={150} cy="4" r="2.5" fill={f.color} className={i === 10 ? "dt-pulse" : ""} />
          </g>
        ))}
      </g>

      {/* Main JSON pane */}
      <g transform="translate(200,48)">
        <g className="dt-row r1">
          <text className="dt-punct">{"{"}</text>
        </g>
        <g className="dt-row r2" transform="translate(12,20)">
          <text className="dt-key">&quot;stories&quot;</text>
          <text x="60" className="dt-punct">:</text>
          <text x="68" className="dt-punct">{"{"}</text>
        </g>
        <g className="dt-row r3" transform="translate(24,40)">
          <text className="dt-key">&quot;US-0123&quot;</text>
          <text x="64" className="dt-punct">:</text>
          <text x="72" className="dt-punct">{"{"}</text>
        </g>
        <g className="dt-row r4" transform="translate(36,60)">
          <text className="dt-key">&quot;status&quot;</text>
          <text x="56" className="dt-punct">:</text>
          <text x="64" className="dt-str">&quot;in_progress&quot;</text>
        </g>
        <g className="dt-row r5" transform="translate(36,80)">
          <text className="dt-key">&quot;owner&quot;</text>
          <text x="48" className="dt-punct">:</text>
          <text x="56" className="dt-str">&quot;AG-UI&quot;</text>
        </g>
        <g className="dt-row r6" transform="translate(24,100)">
          <text className="dt-punct">{"}"}</text>
        </g>
        <g className="dt-row r7" transform="translate(12,120)">
          <text className="dt-punct">{"}"}</text>
        </g>
        <g className="dt-row r8" transform="translate(0,140)">
          <text className="dt-punct">{"}"}</text>
          <rect x="10" y="-10" width="2" height="12" fill={C.accent} className="dt-cursor" />
        </g>
      </g>

      {/* Status bar */}
      <rect x="8" y="288" width="464" height="24" fill="#1e1e2e" />
      <text x="20" y="302" className="dt-status">docs/09-agents/status.json</text>
      <circle cx="420" cy="300" r="3" fill={C.green} className="dt-pulse" />
      <text x="430" y="304" className="dt-status">main</text>
    </SvgShell>
  );
}

// Scene resolver
export type SceneName =
  | "terminal"
  | "folders"
  | "flow"
  | "kanban"
  | "decision"
  | "docs"
  | "bus"
  | "velocity"
  | "quality"
  | "docsTree";

export function sceneFromSrc(src: string): SceneName {
  if (src.includes("terminal-typing") || src.includes("hero-system-boot"))
    return "terminal";
  if (src.includes("folder-scaffold")) return "folders";
  if (src.includes("command-flow")) return "flow";
  if (src.includes("kanban-markdown")) return "kanban";
  if (src.includes("adr-decision")) return "decision";
  if (src.includes("docs-tree-growth")) return "docsTree";
  if (src.includes("message-bus-pulse")) return "bus";
  if (src.includes("velocity-chart")) return "velocity";
  if (src.includes("test-badge-flip")) return "quality";
  return "quality";
}

export function SvgSceneByName({ scene }: { scene: SceneName }) {
  switch (scene) {
    case "terminal":
      return <TerminalSceneSvg />;
    case "folders":
      return <FoldersSceneSvg />;
    case "flow":
      return <FlowSceneSvg />;
    case "kanban":
      return <KanbanSceneSvg />;
    case "decision":
      return <DecisionSceneSvg />;
    case "docs":
      return <DocsSceneSvg />;
    case "bus":
      return <BusSceneSvg />;
    case "velocity":
      return <VelocitySceneSvg />;
    case "quality":
      return <QualitySceneSvg />;
    case "docsTree":
      return <DocsTreeSceneSvg />;
    default:
      return <QualitySceneSvg />;
  }
}
