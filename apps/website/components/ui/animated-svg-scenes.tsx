// Premium ambient SVG scenes. Pure SVG + CSS keyframes.
// Design principles:
//   - Monochrome slate base with a single #e8683a accent
//   - One focal animation per scene (slow, cubic easing)
//   - Grid / gradient texture for depth, soft glow filters
//   - Top-fade mask (~55% height) so the composition melts into card text

const C = {
  accent: "#e8683a",
  accentDeep: "#c15f3c",
  accentSoft: "rgba(232,104,58,0.22)",
  ink: "#0b0d10",
  slate900: "#0f172a",
  slate700: "#334155",
  slate500: "#64748b",
  slate400: "#94a3b8",
  slate300: "#cbd5e1",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  white: "#ffffff",
};

const sharedDefs = (id: string) => `
<defs>
  <pattern id="${id}-grid" width="16" height="16" patternUnits="userSpaceOnUse">
    <path d="M16 0H0V16" fill="none" stroke="${C.slate200}" stroke-width="0.5" opacity="0.6"/>
  </pattern>
  <pattern id="${id}-dots" width="14" height="14" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="0.9" fill="${C.slate300}" opacity="0.65"/>
  </pattern>
  <radialGradient id="${id}-glow" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.35"/>
    <stop offset="60%" stop-color="${C.accent}" stop-opacity="0.08"/>
    <stop offset="100%" stop-color="${C.accent}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="${id}-fade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>
    <stop offset="35%" stop-color="#ffffff" stop-opacity="0.6"/>
    <stop offset="65%" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="${id}-accent" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0%" stop-color="${C.accentDeep}"/>
    <stop offset="100%" stop-color="${C.accent}"/>
  </linearGradient>
  <filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur stdDeviation="3"/>
  </filter>
  <filter id="${id}-glow2" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
    <feMerge>
      <feMergeNode in="coloredBlur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
`;

const baseRules = `
.svg-root { width: 100%; height: 100%; display: block; }
@media (prefers-reduced-motion: reduce) {
  .svg-root * { animation: none !important; transition: none !important; }
}
`;

type SceneProps = { id?: string };

// Shared scene wrapper with embedded defs + style tag
function Scene({
  id,
  viewBox,
  styles,
  ariaLabel,
  children,
  fade = true,
}: {
  id: string;
  viewBox: string;
  styles: string;
  ariaLabel: string;
  children: React.ReactNode;
  fade?: boolean;
}) {
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="xMidYMid slice"
      className="svg-root"
      xmlns="http://www.w3.org/2000/svg"
    >
      <style dangerouslySetInnerHTML={{ __html: baseRules + styles }} />
      <g dangerouslySetInnerHTML={{ __html: sharedDefs(id) }} />
      {children}
      {fade && (
        <rect
          x="0"
          y="0"
          width="100%"
          height="50%"
          fill={`url(#${id}-fade)`}
          pointerEvents="none"
        />
      )}
    </svg>
  );
}

// =============== 1. TERMINAL ===============
export function TerminalSceneSvg() {
  const id = "sc-term";
  const css = `
.term-panel { filter: drop-shadow(0 20px 35px rgba(15,23,42,0.25)); }
.term-caret { animation: termBlink 1.2s steps(1,end) infinite; }
@keyframes termBlink { 0%,55% { opacity: 1 } 55.01%,100% { opacity: 0 } }
.term-line { stroke-dasharray: 320; stroke-dashoffset: 320; animation: termLine 5.5s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes termLine {
  0%,8%   { stroke-dashoffset: 320; }
  45%     { stroke-dashoffset: 0; }
  85%,100%{ stroke-dashoffset: 0; }
}
.term-glow { animation: termGlow 5.5s ease-in-out infinite; transform-origin: 240px 160px; }
@keyframes termGlow { 0%,100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.08); } }
.term-dot { animation: termPulse 2.2s ease-in-out infinite; transform-origin: center; }
.term-dot.d2 { animation-delay: 0.25s; } .term-dot.d3 { animation-delay: 0.5s; }
@keyframes termPulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }
`;
  return (
    <Scene id={id} viewBox="0 0 480 260" styles={css} ariaLabel="Terminal">
      {/* Background */}
      <rect width="480" height="260" fill={C.slate50} />
      <rect width="480" height="260" fill={`url(#${id}-dots)`} opacity="0.5" />
      {/* Accent glow orb */}
      <ellipse cx="240" cy="160" rx="220" ry="90" fill={`url(#${id}-glow)`} className="term-glow" />

      {/* Terminal panel */}
      <g className="term-panel" transform="translate(60,70)">
        <rect width="360" height="170" rx="14" fill={C.slate900} />
        <rect width="360" height="28" rx="14" fill="#1a2332" />
        <rect y="24" width="360" height="4" fill="#1a2332" />
        {/* Window dots */}
        <circle cx="18" cy="14" r="4" fill="#ff5f57" />
        <circle cx="34" cy="14" r="4" fill="#febc2e" />
        <circle cx="50" cy="14" r="4" fill="#28c840" />

        {/* Prompt line */}
        <line
          className="term-line"
          x1="28"
          y1="70"
          x2="330"
          y2="70"
          stroke={C.accent}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <text x="28" y="58" fontFamily="ui-monospace, Menlo, monospace" fontSize="11" fill={C.slate400} opacity="0.9">
          ~/project
        </text>

        {/* Command text */}
        <text x="28" y="110" fontFamily="ui-monospace, Menlo, monospace" fontSize="14" fontWeight="600" fill={C.slate300}>
          <tspan fill={C.accent}>$</tspan> npx agileflow setup
        </text>

        {/* Caret */}
        <rect className="term-caret" x="230" y="98" width="2.5" height="16" fill={C.accent} />

        {/* Loading dots */}
        <g transform="translate(28,140)" fill={C.accent}>
          <circle className="term-dot"    cx="0"  cy="0" r="2.5" />
          <circle className="term-dot d2" cx="10" cy="0" r="2.5" />
          <circle className="term-dot d3" cx="20" cy="0" r="2.5" />
        </g>
      </g>
    </Scene>
  );
}

// =============== 2. FOLDERS ===============
export function FoldersSceneSvg() {
  const id = "sc-fold";
  const css = `
.fold-card { filter: drop-shadow(0 8px 18px rgba(15,23,42,0.08)); }
.fold-stack { animation: foldDrift 8s ease-in-out infinite; transform-origin: center; }
@keyframes foldDrift {
  0%,100% { transform: translateX(0) translateY(0); }
  50%     { transform: translateX(-6px) translateY(-3px); }
}
.fold-accent { animation: foldGlow 4s ease-in-out infinite; }
@keyframes foldGlow { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
.fold-dot { animation: foldPulse 3s ease-in-out infinite; transform-origin: center; }
.fold-dot.d2 { animation-delay: 0.4s } .fold-dot.d3 { animation-delay: 0.8s } .fold-dot.d4 { animation-delay: 1.2s }
@keyframes foldPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.35); } }
`;
  return (
    <Scene id={id} viewBox="0 0 480 260" styles={css} ariaLabel="Folder stack">
      <rect width="480" height="260" fill={C.slate50} />
      <rect width="480" height="260" fill={`url(#${id}-grid)`} />

      {/* Accent glow behind */}
      <ellipse cx="260" cy="180" rx="180" ry="80" fill={`url(#${id}-glow)`} className="fold-accent" />

      <g className="fold-stack" transform="translate(0,30)">
        {/* Stack of layered folder cards */}
        {[
          { y: 180, w: 300, o: 0.35, accent: false },
          { y: 150, w: 320, o: 0.55, accent: false },
          { y: 120, w: 340, o: 0.78, accent: false },
          { y: 90,  w: 360, o: 1,    accent: true },
        ].map((row, i) => (
          <g key={i} className="fold-card" transform={`translate(${(480 - row.w) / 2},${row.y})`}>
            <rect
              width={row.w}
              height="36"
              rx="10"
              fill={C.white}
              stroke={row.accent ? C.accent : C.slate200}
              strokeWidth={row.accent ? "1.5" : "1"}
              opacity={row.o}
            />
            {/* Folder mini-icon on left */}
            <rect x="16" y="12" width="16" height="12" rx="2" fill={row.accent ? C.accent : C.slate300} opacity={row.o} />
            <rect x="18" y="9" width="8" height="4" rx="1" fill={row.accent ? C.accent : C.slate300} opacity={row.o} />
            {/* Text line */}
            <rect x="44" y="15" width={row.w * 0.35} height="6" rx="3" fill={row.accent ? C.slate700 : C.slate300} opacity={row.o} />
            <rect x="44" y="25" width={row.w * 0.22} height="4" rx="2" fill={C.slate300} opacity={row.o * 0.7} />
            {/* Right chevron */}
            {row.accent && (
              <g transform={`translate(${row.w - 28},18)`} className="fold-dot">
                <circle r="4" fill={C.accent} />
                <circle r="8" fill="none" stroke={C.accent} strokeWidth="1" opacity="0.35" />
              </g>
            )}
          </g>
        ))}
      </g>
    </Scene>
  );
}

// =============== 3. FLOW ===============
export function FlowSceneSvg() {
  const id = "sc-flow";
  const css = `
.flow-trail { stroke-dasharray: 400; stroke-dashoffset: 400; animation: flowTrail 5.5s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes flowTrail {
  0%,5%   { stroke-dashoffset: 400; }
  55%,75% { stroke-dashoffset: 0; }
  100%    { stroke-dashoffset: -400; }
}
.flow-node { animation: flowNode 5.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.flow-node.n2 { animation-delay: 0.4s } .flow-node.n3 { animation-delay: 0.8s } .flow-node.n4 { animation-delay: 1.2s }
@keyframes flowNode {
  0%,12%   { transform: scale(1); opacity: 0.6; }
  20%,30%  { transform: scale(1.2); opacity: 1; }
  40%,100% { transform: scale(1); opacity: 1; }
}
.flow-ball { animation: flowBall 5.5s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes flowBall {
  0%,5%    { transform: translateX(0); opacity: 0; }
  10%      { opacity: 1; }
  90%      { transform: translateX(320px); opacity: 1; }
  100%     { transform: translateX(320px); opacity: 0; }
}
.flow-ball-glow { filter: blur(6px); opacity: 0.6; }
`;
  const nodes = [
    { x: 80,  accent: true,  cls: "" },
    { x: 180, accent: false, cls: "n2" },
    { x: 280, accent: false, cls: "n3" },
    { x: 380, accent: false, cls: "n4" },
  ];
  return (
    <Scene id={id} viewBox="0 0 480 260" styles={css} ariaLabel="Workflow">
      <rect width="480" height="260" fill={C.slate50} />
      <rect width="480" height="260" fill={`url(#${id}-dots)`} opacity="0.4" />

      {/* Base line */}
      <line x1="60" y1="160" x2="420" y2="160" stroke={C.slate200} strokeWidth="2" strokeLinecap="round" />
      {/* Active trail */}
      <line
        className="flow-trail"
        x1="60"
        y1="160"
        x2="420"
        y2="160"
        stroke={`url(#${id}-accent)`}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* Nodes */}
      {nodes.map((n, i) => (
        <g key={i} transform={`translate(${n.x},160)`}>
          <circle
            className={`flow-node ${n.cls}`}
            r="8"
            fill={C.white}
            stroke={n.accent ? C.accent : C.slate400}
            strokeWidth="2"
          />
          {n.accent && <circle r="4" fill={C.accent} />}
        </g>
      ))}

      {/* Traveling ball */}
      <g className="flow-ball" transform="translate(60,160)">
        <circle className="flow-ball-glow" r="10" fill={C.accent} />
        <circle r="5" fill={C.accent} />
      </g>

      {/* Abstract labels above nodes - minimal bars */}
      {nodes.map((n, i) => (
        <rect
          key={`lbl${i}`}
          x={n.x - 16}
          y="130"
          width="32"
          height="3"
          rx="1.5"
          fill={n.accent ? C.slate700 : C.slate300}
        />
      ))}
    </Scene>
  );
}

// =============== 4. KANBAN ===============
export function KanbanSceneSvg() {
  const id = "sc-kan";
  const css = `
.kan-col { filter: drop-shadow(0 4px 12px rgba(15,23,42,0.04)); }
.kan-card-move { animation: kanMove 6.5s cubic-bezier(.44,.1,.25,1) infinite; }
@keyframes kanMove {
  0%, 8%   { transform: translate(0, 0) rotate(0); }
  32%, 42% { transform: translate(122px, -6px) rotate(-2deg); }
  50%, 60% { transform: translate(244px, -3px) rotate(-2deg); }
  72%,100% { transform: translate(244px, 0) rotate(0); }
}
.kan-card-glow { filter: blur(10px); opacity: 0; animation: kanGlow 6.5s ease-in-out infinite; }
@keyframes kanGlow {
  0%,10%   { opacity: 0; }
  30%,65%  { opacity: 0.5; }
  80%,100% { opacity: 0; }
}
.kan-check { stroke-dasharray: 12; stroke-dashoffset: 12; animation: kanCheck 6.5s ease-in-out infinite; animation-delay: 1s; }
@keyframes kanCheck {
  0%,72%   { stroke-dashoffset: 12; opacity: 0; }
  85%,100% { stroke-dashoffset: 0;  opacity: 1; }
}
.kan-drift { animation: kanDrift 6.5s ease-in-out infinite; }
.kan-drift.d2 { animation-delay: 0.4s } .kan-drift.d3 { animation-delay: 0.8s }
@keyframes kanDrift { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
`;

  const Card = ({ x, y, accent, className }: { x: number; y: number; accent?: boolean; className?: string }) => (
    <g transform={`translate(${x},${y})`} className={className}>
      <rect width="96" height="28" rx="6" fill={C.white} stroke={accent ? C.accent : C.slate200} />
      <rect x="10" y="10" width="4" height="8" rx="2" fill={accent ? C.accent : C.slate400} />
      <rect x="20" y="10" width="58" height="3" rx="1.5" fill={accent ? C.slate700 : C.slate300} />
      <rect x="20" y="17" width="40" height="3" rx="1.5" fill={C.slate300} />
    </g>
  );

  return (
    <Scene id={id} viewBox="0 0 480 260" styles={css} ariaLabel="Kanban">
      <rect width="480" height="260" fill={C.slate50} />
      <rect width="480" height="260" fill={`url(#${id}-grid)`} />
      <ellipse cx="240" cy="200" rx="200" ry="70" fill={`url(#${id}-glow)`} />

      {/* Columns (minimal) */}
      {[0, 1, 2].map((i) => (
        <g key={i} className="kan-col" transform={`translate(${54 + i * 128},60)`}>
          <rect width="120" height="180" rx="12" fill={C.white} fillOpacity="0.6" stroke={C.slate200} />
          <rect x="12" y="14" width="32" height="4" rx="2" fill={C.slate400} opacity="0.7" />
          <rect x="12" y="24" width="18" height="3" rx="1.5" fill={C.slate300} />
        </g>
      ))}

      {/* Static cards in Ready */}
      <g transform="translate(66,102)">
        <Card className="kan-drift" x={0} y={0} />
        <Card className="kan-drift d2" x={0} y={40} />
      </g>
      {/* Static cards in In Progress */}
      <g transform="translate(194,102)">
        <Card className="kan-drift d3" x={0} y={80} />
      </g>
      {/* Static cards in Done */}
      <g transform="translate(322,102)">
        <g>
          <Card x={0} y={0} />
          <path
            className="kan-check"
            d="M76 14 l3 3 l7 -7"
            fill="none"
            stroke={C.accent}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </g>

      {/* Moving accent card */}
      <g transform="translate(66,142)">
        <g className="kan-card-glow">
          <rect width="96" height="28" rx="6" fill={C.accent} />
        </g>
      </g>
      <g transform="translate(66,142)" className="kan-card-move">
        <rect width="96" height="28" rx="6" fill={C.white} stroke={C.accent} strokeWidth="1.5" filter="drop-shadow(0 6px 16px rgba(232,104,58,0.22))" />
        <rect x="10" y="10" width="4" height="8" rx="2" fill={C.accent} />
        <rect x="20" y="10" width="58" height="3" rx="1.5" fill={C.slate700} />
        <rect x="20" y="17" width="40" height="3" rx="1.5" fill={C.accent} opacity="0.5" />
      </g>
    </Scene>
  );
}

// =============== 5. DECISION ===============
export function DecisionSceneSvg() {
  const id = "sc-dec";
  const css = `
.dec-path { fill: none; stroke-linecap: round; stroke-dasharray: 220; stroke-dashoffset: 220; animation: decDraw 6s cubic-bezier(.4,0,.2,1) infinite; }
.dec-path.p1 { stroke: ${C.slate300}; stroke-width: 1.5; animation-delay: 0.1s; }
.dec-path.p2 { stroke: url(#${id}-accent); stroke-width: 2.5; animation-delay: 0.25s; }
.dec-path.p3 { stroke: ${C.slate300}; stroke-width: 1.5; animation-delay: 0.4s; }
@keyframes decDraw {
  0%,8%    { stroke-dashoffset: 220; }
  45%,88%  { stroke-dashoffset: 0; }
  100%     { stroke-dashoffset: -220; }
}
.dec-center { animation: decPulse 4s ease-in-out infinite; transform-origin: center; }
@keyframes decPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.dec-chosen { animation: decGlow 6s ease-in-out infinite; }
@keyframes decGlow {
  0%,30%   { opacity: 0; transform: scale(0.6); }
  55%,85%  { opacity: 1; transform: scale(1); }
  100%     { opacity: 0; transform: scale(0.8); }
}
.dec-end { animation: decEnd 6s ease-in-out infinite; }
.dec-end.e1 { animation-delay: 0.3s; } .dec-end.e3 { animation-delay: 0.7s; }
@keyframes decEnd {
  0%,40%   { opacity: 0; transform: scale(0); }
  55%,88%  { opacity: 0.55; transform: scale(1); }
  100%     { opacity: 0; transform: scale(0.9); }
}
`;
  return (
    <Scene id={id} viewBox="0 0 480 260" styles={css} ariaLabel="Decision branches">
      <rect width="480" height="260" fill={C.slate50} />
      <rect width="480" height="260" fill={`url(#${id}-dots)`} opacity="0.35" />
      <ellipse cx="240" cy="180" rx="180" ry="70" fill={`url(#${id}-glow)`} />

      {/* Origin node */}
      <g transform="translate(240,100)" className="dec-center">
        <circle r="22" fill={C.white} stroke={C.slate300} />
        <circle r="6" fill={C.slate700} />
      </g>

      {/* Diverging paths */}
      <path className="dec-path p1" d="M226 112 Q 160 150 100 210" />
      <path className="dec-path p2" d="M240 122 Q 240 170 240 220" />
      <path className="dec-path p3" d="M254 112 Q 320 150 380 210" />

      {/* Endpoints */}
      <g transform="translate(100,210)" className="dec-end e1" style={{ transformOrigin: "100px 210px", transformBox: "fill-box" }}>
        <circle r="10" fill={C.white} stroke={C.slate300} />
        <circle r="3" fill={C.slate400} />
      </g>
      <g transform="translate(380,210)" className="dec-end e3" style={{ transformOrigin: "380px 210px", transformBox: "fill-box" }}>
        <circle r="10" fill={C.white} stroke={C.slate300} />
        <circle r="3" fill={C.slate400} />
      </g>

      {/* Chosen endpoint - stamp */}
      <g transform="translate(240,220)" className="dec-chosen" style={{ transformOrigin: "240px 220px", transformBox: "fill-box" }}>
        <circle r="20" fill={C.accentSoft} filter={`url(#${id}-glow2)`} />
        <circle r="14" fill={C.white} stroke={C.accent} strokeWidth="2" />
        <path d="M-5 0 L-1 4 L6 -4" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Scene>
  );
}

// =============== 6. DOCS SKYLINE ===============
export function DocsSceneSvg() {
  const id = "sc-docs";
  const css = `
.ds-bar { transform-box: fill-box; transform-origin: 50% 100%; animation: dsWave 7s ease-in-out infinite; }
${Array.from({ length: 12 }).map((_, i) => `.ds-bar.b${i + 1} { animation-delay: ${i * 0.08}s; }`).join("\n")}
@keyframes dsWave { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(1.08); } }
.ds-accent-bar { animation: dsAccent 4.2s ease-in-out infinite; }
@keyframes dsAccent { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
`;
  const bars = [
    { h: 28 }, { h: 48 }, { h: 64 }, { h: 90 }, { h: 72 },
    { h: 96, accent: true },
    { h: 78 }, { h: 58 }, { h: 92 }, { h: 64 }, { h: 44 }, { h: 32 },
  ];
  return (
    <Scene id={id} viewBox="0 0 480 260" styles={css} ariaLabel="Docs structure">
      <rect width="480" height="260" fill={C.slate50} />
      <rect width="480" height="260" fill={`url(#${id}-grid)`} />

      {/* Soft ground glow */}
      <ellipse cx="240" cy="220" rx="200" ry="30" fill={`url(#${id}-glow)`} />

      {/* Bars */}
      {bars.map((b, i) => {
        const x = 60 + i * 30;
        const y = 220 - b.h;
        return (
          <g key={i} className={`ds-bar b${i + 1}${b.accent ? " ds-accent-bar" : ""}`}>
            <rect
              x={x}
              y={y}
              width="22"
              height={b.h}
              rx="3"
              fill={b.accent ? `url(#${id}-accent)` : C.white}
              stroke={b.accent ? "none" : C.slate200}
              strokeWidth="1"
            />
            {/* Top accent strip */}
            {!b.accent && <rect x={x} y={y} width="22" height="3" fill={C.slate300} />}
          </g>
        );
      })}

      {/* Baseline */}
      <line x1="50" y1="220" x2="430" y2="220" stroke={C.slate300} strokeWidth="1" />
    </Scene>
  );
}

// =============== 7. BUS ===============
export function BusSceneSvg() {
  const id = "sc-bus";
  const css = `
.bus-line { filter: drop-shadow(0 0 8px rgba(232,104,58,0.35)); }
.bus-node { animation: busNode 3.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.bus-node.n2 { animation-delay: 0.3s } .bus-node.n3 { animation-delay: 0.6s } .bus-node.n4 { animation-delay: 0.9s } .bus-node.n5 { animation-delay: 1.2s }
@keyframes busNode { 0%,100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.2); opacity: 1; } }
.bus-ring { animation: busRing 3.5s ease-out infinite; transform-origin: center; opacity: 0; }
.bus-ring.r2 { animation-delay: 0.3s } .bus-ring.r3 { animation-delay: 0.6s } .bus-ring.r4 { animation-delay: 0.9s } .bus-ring.r5 { animation-delay: 1.2s }
@keyframes busRing { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(2); opacity: 0; } }
.bus-packet { animation: busPacket 4.5s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes busPacket {
  0%   { transform: translateX(0); opacity: 0; }
  8%   { opacity: 1; }
  92%  { transform: translateX(360px); opacity: 1; }
  100% { transform: translateX(360px); opacity: 0; }
}
.bus-packet-glow { filter: blur(8px); opacity: 0.5; }
`;
  const nodes = [
    { x: 60 },
    { x: 150 },
    { x: 240 },
    { x: 330 },
    { x: 420 },
  ];
  return (
    <Scene id={id} viewBox="0 0 480 260" styles={css} ariaLabel="Message bus">
      <rect width="480" height="260" fill={C.slate50} />
      <rect width="480" height="260" fill={`url(#${id}-dots)`} opacity="0.35" />
      <ellipse cx="240" cy="160" rx="210" ry="70" fill={`url(#${id}-glow)`} />

      {/* Bus line */}
      <line className="bus-line" x1="60" y1="160" x2="420" y2="160" stroke={`url(#${id}-accent)`} strokeWidth="3" strokeLinecap="round" />

      {/* Nodes + rings */}
      {nodes.map((n, i) => (
        <g key={i} transform={`translate(${n.x},160)`}>
          <circle className={`bus-ring ${i ? "r" + (i + 1) : ""}`} r="8" fill="none" stroke={C.accent} strokeWidth="1.5" />
          <circle className={`bus-node ${i ? "n" + (i + 1) : ""}`} r="6" fill={C.white} stroke={C.accent} strokeWidth="2" />
          <circle r="2.5" fill={C.accent} />
        </g>
      ))}

      {/* Traveling packet */}
      <g className="bus-packet" transform="translate(60,160)">
        <circle className="bus-packet-glow" r="12" fill={C.accent} />
        <circle r="5" fill={C.accent} />
      </g>
    </Scene>
  );
}

// =============== 8. VELOCITY ===============
export function VelocitySceneSvg() {
  const id = "sc-vel";
  const css = `
.vel-area { opacity: 0; animation: velArea 6s ease-in-out infinite; }
@keyframes velArea {
  0%,15%   { opacity: 0; }
  45%,85%  { opacity: 1; }
  100%     { opacity: 0; }
}
.vel-line { stroke-dasharray: 420; stroke-dashoffset: 420; animation: velLine 6s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes velLine {
  0%,5%   { stroke-dashoffset: 420; }
  45%,88% { stroke-dashoffset: 0; }
  100%    { stroke-dashoffset: -420; }
}
.vel-peak { animation: velPeak 6s ease-in-out infinite; transform-origin: center; }
@keyframes velPeak {
  0%,40%   { transform: scale(0); opacity: 0; }
  55%,88%  { transform: scale(1); opacity: 1; }
  100%     { transform: scale(0.8); opacity: 0; }
}
.vel-peak-halo { animation: velHalo 6s ease-in-out infinite; transform-origin: center; }
@keyframes velHalo {
  0%,45%   { transform: scale(0); opacity: 0; }
  55%      { transform: scale(0.6); opacity: 0.8; }
  100%     { transform: scale(2.2); opacity: 0; }
}
.vel-grid-line { stroke: ${C.slate200}; stroke-width: 1; stroke-dasharray: 3 4; }
`;
  // Smooth curve
  const pts = [
    { x: 60, y: 200 }, { x: 120, y: 170 }, { x: 180, y: 175 },
    { x: 240, y: 140 }, { x: 300, y: 110 }, { x: 360, y: 80 }, { x: 420, y: 60 },
  ];
  const smooth = (points: typeof pts) => {
    let d = `M${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpx = (p0.x + p1.x) / 2;
      d += ` Q ${cpx} ${p0.y}, ${cpx} ${(p0.y + p1.y) / 2}`;
      d += ` T ${p1.x} ${p1.y}`;
    }
    return d;
  };
  const lineD = smooth(pts);
  const areaD = `${lineD} L 420 220 L 60 220 Z`;
  return (
    <Scene id={id} viewBox="0 0 480 260" styles={css} ariaLabel="Velocity">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="480" height="260" fill={C.slate50} />
      <rect width="480" height="260" fill={`url(#${id}-grid)`} />

      {/* Grid lines */}
      <line className="vel-grid-line" x1="60" y1="100" x2="420" y2="100" />
      <line className="vel-grid-line" x1="60" y1="150" x2="420" y2="150" />
      <line className="vel-grid-line" x1="60" y1="200" x2="420" y2="200" />
      <line x1="60" y1="220" x2="420" y2="220" stroke={C.slate300} />

      {/* Area */}
      <path className="vel-area" d={areaD} fill={`url(#${id}-fill)`} />
      {/* Line */}
      <path className="vel-line" d={lineD} fill="none" stroke={`url(#${id}-accent)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Peak dot */}
      <g transform="translate(420,60)" style={{ transformOrigin: "420px 60px", transformBox: "fill-box" }}>
        <circle className="vel-peak-halo" r="10" fill={C.accent} opacity="0.25" />
        <circle className="vel-peak" r="5" fill={C.accent} stroke={C.white} strokeWidth="2" />
      </g>
    </Scene>
  );
}

// =============== 9. QUALITY ===============
export function QualitySceneSvg() {
  const id = "sc-q";
  const css = `
.q-shield { animation: qBreathe 5s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
@keyframes qBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.03); } }
.q-check { stroke-dasharray: 22; stroke-dashoffset: 22; animation: qCheck 5s ease-in-out infinite; }
@keyframes qCheck {
  0%,25%   { stroke-dashoffset: 22; opacity: 0; }
  50%,88%  { stroke-dashoffset: 0;  opacity: 1; }
  100%     { stroke-dashoffset: 22; opacity: 0; }
}
.q-ring { animation: qRing 4.5s ease-out infinite; transform-origin: center; opacity: 0; }
.q-ring.r2 { animation-delay: 0.5s; }
.q-ring.r3 { animation-delay: 1s; }
@keyframes qRing {
  0%    { transform: scale(0.8); opacity: 0.6; }
  100%  { transform: scale(2.2); opacity: 0; }
}
`;
  return (
    <Scene id={id} viewBox="0 0 480 260" styles={css} ariaLabel="Verification">
      <rect width="480" height="260" fill={C.slate50} />
      <rect width="480" height="260" fill={`url(#${id}-dots)`} opacity="0.35" />
      <ellipse cx="240" cy="150" rx="180" ry="90" fill={`url(#${id}-glow)`} />

      {/* Sonar rings */}
      <g transform="translate(240,150)" style={{ transformOrigin: "240px 150px", transformBox: "fill-box" }}>
        <circle className="q-ring" r="40" fill="none" stroke={C.accent} strokeWidth="1.2" />
        <circle className="q-ring r2" r="40" fill="none" stroke={C.accent} strokeWidth="1.2" />
        <circle className="q-ring r3" r="40" fill="none" stroke={C.accent} strokeWidth="1.2" />
      </g>

      {/* Shield */}
      <g transform="translate(240,150)" className="q-shield">
        <path
          d="M0 -52 L34 -38 L34 8 Q34 40 0 56 Q-34 40 -34 8 L-34 -38 Z"
          fill={C.white}
          stroke={C.ink}
          strokeWidth="2"
          strokeLinejoin="round"
          filter="drop-shadow(0 12px 24px rgba(15,23,42,0.15))"
        />
        <path
          d="M0 -48 L30 -36 L30 6 Q30 34 0 48 Q-30 34 -30 6 L-30 -36 Z"
          fill={`url(#${id}-glow)`}
          opacity="0.8"
        />
        <path
          className="q-check"
          d="M-14 -2 L-4 10 L16 -14"
          fill="none"
          stroke={C.accent}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </Scene>
  );
}

// =============== 10. DOCS TREE (big) ===============
export function DocsTreeSceneSvg() {
  const id = "sc-dt";
  const css = `
.dt-panel { filter: drop-shadow(0 30px 50px rgba(15,23,42,0.25)); }
.dt-row { opacity: 0; transform: translateX(-10px); animation: dtRow 9s ease-out infinite; }
${Array.from({ length: 11 }).map((_, i) => `.dt-row.r${i + 1} { animation-delay: ${i * 0.12}s; }`).join("\n")}
@keyframes dtRow {
  0%,3%      { opacity: 0; transform: translateX(-10px); }
  12%,85%    { opacity: 1; transform: translateX(0); }
  100%       { opacity: 0; transform: translateX(6px); }
}
.dt-caret { animation: dtBlink 1.2s steps(1, end) infinite; }
@keyframes dtBlink { 0%,50% { opacity: 1 } 50.01%,100% { opacity: 0 } }
.dt-highlight { animation: dtHighlight 9s ease-in-out infinite; animation-delay: 1.4s; }
@keyframes dtHighlight {
  0%,10%   { opacity: 0; }
  20%,85%  { opacity: 1; }
  100%     { opacity: 0; }
}
.dt-dot { transform-box: fill-box; transform-origin: center; }
.dt-dot.accent { animation: dtPulse 2.4s ease-in-out infinite; }
@keyframes dtPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.3); } }
`;
  const folders = [
    { name: "docs/",              color: C.accent,     bold: true  },
    { name: "00-meta/",            color: "#3b82f6"                },
    { name: "01-brainstorming/",   color: "#8b5cf6"                },
    { name: "02-practices/",       color: "#22c55e"                },
    { name: "03-decisions/",       color: "#f59e0b"                },
    { name: "04-architecture/",    color: "#06b6d4"                },
    { name: "05-epics/",           color: C.accent                 },
    { name: "06-stories/",         color: C.accent                 },
    { name: "07-testing/",         color: "#22c55e"                },
    { name: "08-project/",         color: "#3b82f6"                },
    { name: "09-agents/",          color: C.accentDeep,  accent: true },
  ];
  return (
    <Scene id={id} viewBox="0 0 560 380" styles={css} ariaLabel="Docs folder tree">
      <rect width="560" height="380" fill={C.slate50} />
      <rect width="560" height="380" fill={`url(#${id}-grid)`} />
      <ellipse cx="280" cy="230" rx="280" ry="130" fill={`url(#${id}-glow)`} opacity="0.8" />

      {/* Panel */}
      <g className="dt-panel" transform="translate(80,50)">
        <rect width="400" height="290" rx="16" fill={C.slate900} />
        {/* Top bar */}
        <rect width="400" height="36" rx="16" fill="#1a2332" />
        <rect y="30" width="400" height="6" fill="#1a2332" />
        <circle cx="20" cy="18" r="4" fill="#ff5f57" />
        <circle cx="36" cy="18" r="4" fill="#febc2e" />
        <circle cx="52" cy="18" r="4" fill="#28c840" />
        <text x="200" y="22" fontFamily="ui-monospace, Menlo, monospace" fontSize="10" fill={C.slate400} textAnchor="middle">
          docs/
        </text>

        {/* Folder rows */}
        <g transform="translate(32,60)">
          {folders.map((f, i) => (
            <g key={f.name} className={`dt-row r${i + 1}`} transform={`translate(${f.bold ? 0 : 16},${i * 20})`}>
              {f.accent && (
                <rect
                  x="-10"
                  y="-5"
                  width="350"
                  height="18"
                  rx="4"
                  fill={C.accent}
                  opacity="0.18"
                  className="dt-highlight"
                />
              )}
              <rect width="10" height="8" rx="1.5" fill={f.color} />
              <rect x="1" y="-2" width="6" height="3" rx="0.5" fill={f.color} />
              <text
                x="18"
                y="8"
                fontFamily="ui-monospace, Menlo, monospace"
                fontSize="11"
                fontWeight={f.bold ? "600" : "400"}
                fill={f.accent ? "#fff" : C.slate300}
              >
                {f.name}
              </text>
              <circle
                cx="330"
                cy="4"
                r="2.5"
                fill={f.color}
                className={`dt-dot${f.accent ? " accent" : ""}`}
              />
            </g>
          ))}
        </g>

        {/* Caret at bottom */}
        <rect x="40" y="270" width="2" height="10" fill={C.accent} className="dt-caret" />
      </g>
    </Scene>
  );
}

// =============== Router ===============
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
  if (src.includes("terminal-typing") || src.includes("hero-system-boot")) return "terminal";
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

export function SvgSceneByName({ scene }: { scene: SceneName } & SceneProps) {
  switch (scene) {
    case "terminal":  return <TerminalSceneSvg />;
    case "folders":   return <FoldersSceneSvg />;
    case "flow":      return <FlowSceneSvg />;
    case "kanban":    return <KanbanSceneSvg />;
    case "decision":  return <DecisionSceneSvg />;
    case "docs":      return <DocsSceneSvg />;
    case "bus":       return <BusSceneSvg />;
    case "velocity":  return <VelocitySceneSvg />;
    case "quality":   return <QualitySceneSvg />;
    case "docsTree":  return <DocsTreeSceneSvg />;
    default:          return <QualitySceneSvg />;
  }
}
