// Magic UI-inspired ambient scenes.
// Principles:
//   - NO text elements (no overlap / render bugs)
//   - Light warm palette, single burnt-orange accent
//   - Core primitives: ripple (concentric circles), beam (line + traveling particle),
//     orbit (dots revolving around center), grid/dot texture
//   - One focal animation per scene, slow easing
//   - Drop shadows instead of gaussian-blur filters (no blurry look)

const C = {
  accent: "#e8683a",
  accentDeep: "#c15f3c",
  accentSoft: "#fce4d9",
  accentFaint: "rgba(232,104,58,0.08)",
  paper: "#fafaf7",
  paperWarm: "#fdfcf9",
  line: "#e7e5df",
  lineSoft: "#eeece5",
  slate700: "#3f3f46",
  slate500: "#71717a",
  slate400: "#a1a1aa",
  slate300: "#d4d4d8",
  white: "#ffffff",
};

const baseRules = `
.svg-root { width: 100%; height: 100%; display: block; }
@media (prefers-reduced-motion: reduce) {
  .svg-root * { animation: none !important; transition: none !important; }
}
`;

function Defs({ id }: { id: string }) {
  return (
    <defs dangerouslySetInnerHTML={{ __html: `
      <pattern id="${id}-dots" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="0.8" fill="${C.slate300}" opacity="0.55"/>
      </pattern>
      <radialGradient id="${id}-warm" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.28"/>
        <stop offset="50%" stop-color="${C.accent}" stop-opacity="0.09"/>
        <stop offset="100%" stop-color="${C.accent}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="${id}-warm2" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stop-color="${C.accent}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${C.accent}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${id}-accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${C.accentDeep}"/>
        <stop offset="100%" stop-color="${C.accent}"/>
      </linearGradient>
      <linearGradient id="${id}-topfade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.paperWarm}" stop-opacity="1"/>
        <stop offset="50%" stop-color="${C.paperWarm}" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="${C.paperWarm}" stop-opacity="0"/>
      </linearGradient>
    ` }} />
  );
}

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
      <Defs id={id} />
      <rect width="100%" height="100%" fill={C.paperWarm} />
      {children}
      {fade && (
        <rect x="0" y="0" width="100%" height="55%" fill={`url(#${id}-topfade)`} pointerEvents="none" />
      )}
    </svg>
  );
}

// Shared Ripple primitive: N concentric circles expanding out with fade
function Ripple({
  cx,
  cy,
  color = C.accent,
  count = 4,
  baseR = 16,
  step = 22,
  stroke = 1,
  duration = 4.5,
}: {
  cx: number;
  cy: number;
  color?: string;
  count?: number;
  baseR?: number;
  step?: number;
  stroke?: number;
  duration?: number;
}) {
  return (
    <g>
      {Array.from({ length: count }).map((_, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={baseR + i * step}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          opacity="0"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: `sceneRipple ${duration}s cubic-bezier(0,0,0.2,1) infinite`,
            animationDelay: `${i * (duration / count)}s`,
          }}
        />
      ))}
    </g>
  );
}

// =============== 1. INSTALL RIPPLE (Setup / Hero terminal replacement) ===============
export function TerminalSceneSvg() {
  const id = "sc-inst";
  const css = `
@keyframes sceneRipple {
  0%   { transform: scale(0.3); opacity: 0; }
  15%  { opacity: 0.7; }
  100% { transform: scale(2.3); opacity: 0; }
}
.inst-core { animation: instCore 4.5s ease-in-out infinite; transform-origin: center; }
@keyframes instCore { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
.inst-orbit { animation: instOrbit 14s linear infinite; transform-origin: 240px 170px; }
.inst-orbit.o2 { animation-duration: 18s; animation-direction: reverse; }
@keyframes instOrbit { to { transform: rotate(360deg); } }
`;
  return (
    <Scene id={id} viewBox="0 0 480 320" styles={css} ariaLabel="Setup pulse">
      <rect width="480" height="320" fill={`url(#${id}-dots)`} opacity="0.4" />
      <ellipse cx="240" cy="170" rx="200" ry="140" fill={`url(#${id}-warm)`} />

      {/* Ripples */}
      <Ripple cx={240} cy={170} color={C.accent} count={4} baseR={28} step={28} stroke={1.2} duration={5} />

      {/* Orbit rings (static ring + orbiting dots) */}
      <g className="inst-orbit">
        <circle cx="240" cy="170" r="70" fill="none" stroke={C.line} strokeWidth="1" strokeDasharray="2 6" />
        <circle cx="310" cy="170" r="3" fill={C.accent} />
      </g>
      <g className="inst-orbit o2">
        <circle cx="240" cy="170" r="100" fill="none" stroke={C.line} strokeWidth="1" strokeDasharray="2 6" />
        <circle cx="140" cy="170" r="2.5" fill={C.slate400} />
      </g>

      {/* Central hub */}
      <g className="inst-core" style={{ transformOrigin: "240px 170px", transformBox: "fill-box" }}>
        <circle cx="240" cy="170" r="28" fill={C.white} stroke={C.line} filter="drop-shadow(0 6px 14px rgba(0,0,0,0.08))" />
        <circle cx="240" cy="170" r="18" fill={`url(#${id}-warm2)`} />
        <circle cx="240" cy="170" r="8" fill={C.accent} />
      </g>
    </Scene>
  );
}

// =============== 2. LAYERED CARDS (Explore) ===============
export function FoldersSceneSvg() {
  const id = "sc-fold";
  const css = `
.fold-card { filter: drop-shadow(0 12px 24px rgba(15,15,20,0.06)); }
.fold-float { animation: foldFloat 8s ease-in-out infinite; }
.fold-float.f2 { animation-delay: 0.6s; }
.fold-float.f3 { animation-delay: 1.2s; }
.fold-float.f4 { animation-delay: 1.8s; }
@keyframes foldFloat {
  0%,100% { transform: translateY(0); }
  50%     { transform: translateY(-4px); }
}
@keyframes sceneRipple {
  0%   { transform: scale(0.4); opacity: 0; }
  15%  { opacity: 0.5; }
  100% { transform: scale(2); opacity: 0; }
}
.fold-dot { animation: foldDot 3.5s ease-in-out infinite; transform-origin: center; }
@keyframes foldDot { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
`;
  const cards = [
    { y: 220, w: 300, x: 90,  o: 0.35, accent: false },
    { y: 190, w: 320, x: 80,  o: 0.55, accent: false },
    { y: 160, w: 340, x: 70,  o: 0.8,  accent: false },
    { y: 120, w: 360, x: 60,  o: 1,    accent: true  },
  ];
  return (
    <Scene id={id} viewBox="0 0 480 320" styles={css} ariaLabel="Layered cards">
      <rect width="480" height="320" fill={`url(#${id}-dots)`} opacity="0.35" />
      <ellipse cx="260" cy="220" rx="220" ry="90" fill={`url(#${id}-warm)`} />

      {cards.map((c, i) => (
        <g key={i} className={`fold-card fold-float${i ? " f" + (i + 1) : ""}`}>
          <rect
            x={c.x}
            y={c.y}
            width={c.w}
            height="44"
            rx="12"
            fill={C.white}
            stroke={c.accent ? C.accent : C.line}
            strokeWidth={c.accent ? "1.5" : "1"}
            opacity={c.o}
          />
          {/* Folder glyph */}
          <rect x={c.x + 20} y={c.y + 16} width="16" height="12" rx="2.5" fill={c.accent ? C.accent : C.slate400} opacity={c.o} />
          <rect x={c.x + 22} y={c.y + 13} width="8" height="4" rx="1" fill={c.accent ? C.accent : C.slate400} opacity={c.o} />
          {/* Title bar */}
          <rect x={c.x + 48} y={c.y + 17} width={c.w * 0.36} height="6" rx="3" fill={c.accent ? C.slate700 : C.slate400} opacity={c.accent ? 1 : c.o * 0.8} />
          <rect x={c.x + 48} y={c.y + 28} width={c.w * 0.22} height="4" rx="2" fill={C.slate300} opacity={c.o * 0.8} />
          {/* Accent dot on top card */}
          {c.accent && (
            <g>
              <circle cx={c.x + c.w - 24} cy={c.y + 22} r="4" fill={C.accent} className="fold-dot" />
              <circle cx={c.x + c.w - 24} cy={c.y + 22} r="10" fill="none" stroke={C.accent} strokeWidth="1" opacity="0.3" />
            </g>
          )}
        </g>
      ))}
    </Scene>
  );
}

// =============== 3. ANIMATED BEAM (Work / Flow) ===============
export function FlowSceneSvg() {
  const id = "sc-beam";
  const css = `
@keyframes sceneRipple {
  0%   { transform: scale(0.3); opacity: 0; }
  15%  { opacity: 0.65; }
  100% { transform: scale(1.9); opacity: 0; }
}
.beam-path { stroke: url(#${id}-accent); stroke-width: 2; fill: none; stroke-linecap: round; stroke-dasharray: 340; stroke-dashoffset: 340; animation: beamDraw 5.5s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes beamDraw {
  0%,5%   { stroke-dashoffset: 340; }
  50%,85% { stroke-dashoffset: 0; }
  100%    { stroke-dashoffset: -340; }
}
.beam-bg { stroke: ${C.line}; stroke-width: 2; fill: none; stroke-linecap: round; stroke-dasharray: 3 6; }
.beam-node { filter: drop-shadow(0 6px 12px rgba(15,15,20,0.08)); animation: beamNode 5.5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.beam-node.n2 { animation-delay: 1.1s; } .beam-node.n3 { animation-delay: 2.2s; } .beam-node.n4 { animation-delay: 3.3s; }
@keyframes beamNode {
  0%,40%  { opacity: 0.6; }
  50%     { opacity: 1; transform: scale(1.12); }
  60%,100%{ opacity: 0.95; transform: scale(1); }
}
.beam-particle { animation: beamTravel 5.5s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes beamTravel {
  0%   { offset-distance: 0%; opacity: 0; }
  8%   { opacity: 1; }
  92%  { opacity: 1; }
  100% { offset-distance: 100%; opacity: 0; }
}
`;
  const nodes = [
    { x: 90,  accent: true },
    { x: 200, accent: false },
    { x: 310, accent: false },
    { x: 420, accent: false },
  ];
  return (
    <Scene id={id} viewBox="0 0 480 320" styles={css} ariaLabel="Flow beam">
      <rect width="480" height="320" fill={`url(#${id}-dots)`} opacity="0.35" />
      <ellipse cx="240" cy="200" rx="220" ry="80" fill={`url(#${id}-warm)`} />

      {/* Background track */}
      <path className="beam-bg" d="M90 200 L420 200" />
      {/* Active beam */}
      <path className="beam-path" d="M90 200 L420 200" />

      {/* Nodes */}
      {nodes.map((n, i) => (
        <g key={i} className={`beam-node ${i ? "n" + (i + 1) : ""}`} transform={`translate(${n.x},200)`}>
          <circle r="14" fill={C.white} stroke={n.accent ? C.accent : C.line} strokeWidth="1.5" />
          <circle r="5" fill={n.accent ? C.accent : C.slate400} />
        </g>
      ))}

      {/* Traveling particle (uses path offset) */}
      <g className="beam-particle" style={{ offsetPath: "path('M90 200 L420 200')", offsetRotate: "0deg" } as React.CSSProperties}>
        <circle r="12" fill={C.accent} opacity="0.2" />
        <circle r="6" fill={C.accent} />
      </g>

      {/* Ambient ripples on the first/last node */}
      <Ripple cx={420} cy={200} color={C.accent} count={3} baseR={16} step={10} stroke={1} duration={3.5} />
    </Scene>
  );
}

// =============== 4. KANBAN COLUMNS ===============
export function KanbanSceneSvg() {
  const id = "sc-kan";
  const css = `
@keyframes sceneRipple {
  0%   { transform: scale(0.5); opacity: 0; }
  15%  { opacity: 0.5; }
  100% { transform: scale(1.8); opacity: 0; }
}
.kan-col { filter: drop-shadow(0 8px 18px rgba(15,15,20,0.04)); }
.kan-card-float { animation: kanFloat 4s ease-in-out infinite; }
.kan-card-float.f2 { animation-delay: 0.3s; } .kan-card-float.f3 { animation-delay: 0.6s; } .kan-card-float.f4 { animation-delay: 0.9s; }
@keyframes kanFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
.kan-move { animation: kanMove 7s cubic-bezier(.44,.1,.25,1) infinite; filter: drop-shadow(0 10px 22px rgba(232,104,58,0.25)); }
@keyframes kanMove {
  0%, 10%  { transform: translate(0, 0); }
  35%,45%  { transform: translate(130px, -4px); }
  55%,65%  { transform: translate(260px, -2px); }
  78%,100% { transform: translate(260px, 0); }
}
`;
  const MiniCard = ({ x, y, w = 90, accent, cls }: { x: number; y: number; w?: number; accent?: boolean; cls?: string }) => (
    <g transform={`translate(${x},${y})`} className={cls}>
      <rect width={w} height="32" rx="8" fill={C.white} stroke={accent ? C.accent : C.line} strokeWidth={accent ? "1.4" : "1"} />
      <circle cx="14" cy="16" r="3" fill={accent ? C.accent : C.slate400} />
      <rect x="24" y="10" width={w - 40} height="4" rx="2" fill={accent ? C.slate700 : C.slate400} opacity={accent ? 1 : 0.75} />
      <rect x="24" y="19" width={w * 0.4} height="3" rx="1.5" fill={C.slate300} />
    </g>
  );
  return (
    <Scene id={id} viewBox="0 0 480 320" styles={css} ariaLabel="Kanban">
      <rect width="480" height="320" fill={`url(#${id}-dots)`} opacity="0.3" />
      <ellipse cx="240" cy="220" rx="230" ry="90" fill={`url(#${id}-warm)`} />

      {/* Columns */}
      {[0, 1, 2].map((i) => (
        <g key={i} className="kan-col" transform={`translate(${60 + i * 130},80)`}>
          <rect width="120" height="210" rx="14" fill={C.white} fillOpacity="0.8" stroke={C.line} />
          <rect x="14" y="18" width="36" height="4" rx="2" fill={C.slate400} opacity="0.8" />
          <rect x="14" y="28" width="20" height="3" rx="1.5" fill={C.slate300} />
        </g>
      ))}

      {/* Static cards */}
      <g>
        <MiniCard x={75}  y={120} cls="kan-card-float" />
        <MiniCard x={75}  y={160} cls="kan-card-float f2" />
        <MiniCard x={335} y={200} cls="kan-card-float f3" />
      </g>

      {/* Moving accent card */}
      <g transform="translate(75,220)" className="kan-move">
        <rect width="90" height="32" rx="8" fill={C.white} stroke={C.accent} strokeWidth="1.6" />
        <circle cx="14" cy="16" r="3.5" fill={C.accent} />
        <rect x="24" y="10" width="54" height="4" rx="2" fill={C.slate700} />
        <rect x="24" y="19" width="38" height="3" rx="1.5" fill={C.accent} opacity="0.5" />
      </g>

      {/* Ripple where it lands */}
      <Ripple cx={380} cy={236} color={C.accent} count={3} baseR={12} step={10} stroke={1} duration={3} />
    </Scene>
  );
}

// =============== 5. DECISION FORK ===============
export function DecisionSceneSvg() {
  const id = "sc-dec";
  const css = `
@keyframes sceneRipple {
  0%   { transform: scale(0.3); opacity: 0; }
  15%  { opacity: 0.7; }
  100% { transform: scale(2); opacity: 0; }
}
.dec-path { fill: none; stroke-linecap: round; stroke-dasharray: 280; stroke-dashoffset: 280; animation: decDraw 6s cubic-bezier(.4,0,.2,1) infinite; }
.dec-path.p1 { stroke: ${C.line}; stroke-width: 1.5; animation-delay: 0.15s; }
.dec-path.p2 { stroke: url(#${id}-accent); stroke-width: 2.5; animation-delay: 0.35s; }
.dec-path.p3 { stroke: ${C.line}; stroke-width: 1.5; animation-delay: 0.55s; }
@keyframes decDraw {
  0%,8%   { stroke-dashoffset: 280; }
  48%,88% { stroke-dashoffset: 0; }
  100%    { stroke-dashoffset: -280; }
}
.dec-origin { animation: decOrigin 5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes decOrigin { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
.dec-stamp { animation: decStamp 6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes decStamp {
  0%,45%   { transform: scale(0); opacity: 0; }
  58%      { transform: scale(1.15); opacity: 1; }
  68%,88%  { transform: scale(1); opacity: 1; }
  100%     { transform: scale(0.8); opacity: 0; }
}
.dec-reject { animation: decReject 6s ease-in-out infinite; }
.dec-reject.r1 { animation-delay: 0.3s; } .dec-reject.r3 { animation-delay: 0.7s; }
@keyframes decReject {
  0%,48%   { opacity: 0; }
  60%,88%  { opacity: 0.55; }
  100%     { opacity: 0; }
}
`;
  return (
    <Scene id={id} viewBox="0 0 480 320" styles={css} ariaLabel="Decision fork">
      <rect width="480" height="320" fill={`url(#${id}-dots)`} opacity="0.35" />
      <ellipse cx="240" cy="220" rx="220" ry="90" fill={`url(#${id}-warm)`} />

      {/* Origin */}
      <g transform="translate(240,110)" style={{ transformOrigin: "240px 110px", transformBox: "fill-box" }}>
        <g className="dec-origin">
          <circle r="28" fill={C.white} stroke={C.line} filter="drop-shadow(0 6px 14px rgba(0,0,0,0.06))" />
          <circle r="20" fill={`url(#${id}-warm2)`} />
          <circle r="6" fill={C.slate700} />
        </g>
      </g>

      {/* Diverging paths */}
      <path className="dec-path p1" d="M222 128 Q 160 180 90 250" />
      <path className="dec-path p2" d="M240 140 Q 240 190 240 260" />
      <path className="dec-path p3" d="M258 128 Q 320 180 390 250" />

      {/* Rejected ends */}
      <g transform="translate(90,250)" className="dec-reject r1">
        <circle r="9" fill={C.white} stroke={C.line} />
        <circle r="3" fill={C.slate400} />
      </g>
      <g transform="translate(390,250)" className="dec-reject r3">
        <circle r="9" fill={C.white} stroke={C.line} />
        <circle r="3" fill={C.slate400} />
      </g>

      {/* Chosen stamp + ripples */}
      <Ripple cx={240} cy={260} color={C.accent} count={3} baseR={14} step={10} stroke={1} duration={3.5} />
      <g transform="translate(240,260)" className="dec-stamp" style={{ transformOrigin: "240px 260px", transformBox: "fill-box" }}>
        <circle r="18" fill={C.accentSoft} />
        <circle r="12" fill={C.white} stroke={C.accent} strokeWidth="1.8" />
        <path d="M-5 0 L-1 4 L6 -5" fill="none" stroke={C.accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </Scene>
  );
}

// =============== 6. GRID CONSTELLATION (Docs Structure) ===============
export function DocsSceneSvg() {
  const id = "sc-grid";
  const css = `
@keyframes sceneRipple {
  0%   { transform: scale(0.3); opacity: 0; }
  20%  { opacity: 0.6; }
  100% { transform: scale(1.8); opacity: 0; }
}
.grid-dot { animation: gridDot 4s ease-in-out infinite; }
${Array.from({ length: 6 }).map((_, i) => `.grid-dot.d${i + 1} { animation-delay: ${i * 0.25}s; }`).join("\n")}
@keyframes gridDot { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
.grid-line { stroke: ${C.accent}; stroke-width: 1; opacity: 0; animation: gridLine 6s ease-in-out infinite; }
.grid-line.l2 { animation-delay: 0.3s; } .grid-line.l3 { animation-delay: 0.6s; } .grid-line.l4 { animation-delay: 0.9s; }
@keyframes gridLine {
  0%,15%   { stroke-dasharray: 0 120; opacity: 0; }
  40%,85%  { stroke-dasharray: 120 0; opacity: 0.45; }
  100%     { stroke-dasharray: 120 0; opacity: 0; }
}
.grid-core { animation: gridCore 5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes gridCore { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
`;
  // Cells in a loose grid
  const cells = [
    { x: 100, y: 110 }, { x: 180, y: 80  }, { x: 280, y: 120 }, { x: 370, y: 90  },
    { x: 80,  y: 200 }, { x: 170, y: 180 }, { x: 260, y: 210 }, { x: 360, y: 200 },
    { x: 120, y: 270 }, { x: 220, y: 250 }, { x: 320, y: 280 },
  ];
  // Center accent cell + connections
  const center = { x: 240, y: 180 };
  const connected = [0, 2, 5, 7, 9];

  return (
    <Scene id={id} viewBox="0 0 480 320" styles={css} ariaLabel="Docs constellation">
      <rect width="480" height="320" fill={`url(#${id}-dots)`} opacity="0.4" />
      <ellipse cx={center.x} cy={center.y} rx="220" ry="120" fill={`url(#${id}-warm)`} />

      {/* Connections */}
      {connected.map((i, idx) => {
        const c = cells[i];
        return (
          <line
            key={i}
            className={`grid-line ${idx ? "l" + (idx + 1) : ""}`}
            x1={center.x}
            y1={center.y}
            x2={c.x}
            y2={c.y}
          />
        );
      })}

      {/* All dots */}
      {cells.map((c, i) => (
        <circle
          key={i}
          className={`grid-dot ${i < 6 ? "d" + (i + 1) : ""}`}
          cx={c.x}
          cy={c.y}
          r={connected.includes(i) ? 3.5 : 2.2}
          fill={connected.includes(i) ? C.accent : C.slate400}
        />
      ))}

      {/* Central core with ripple */}
      <Ripple cx={center.x} cy={center.y} color={C.accent} count={3} baseR={14} step={12} stroke={1} duration={4.5} />
      <g className="grid-core" style={{ transformOrigin: `${center.x}px ${center.y}px`, transformBox: "fill-box" }}>
        <circle cx={center.x} cy={center.y} r="14" fill={C.white} stroke={C.accent} strokeWidth="1.5" filter="drop-shadow(0 4px 10px rgba(232,104,58,0.2))" />
        <circle cx={center.x} cy={center.y} r="5" fill={C.accent} />
      </g>
    </Scene>
  );
}

// =============== 7. HUB & SPOKE BEAM (Coordination bus) ===============
export function BusSceneSvg() {
  const id = "sc-bus";
  const css = `
@keyframes sceneRipple {
  0%   { transform: scale(0.4); opacity: 0; }
  15%  { opacity: 0.6; }
  100% { transform: scale(2); opacity: 0; }
}
.bus-spoke { stroke: ${C.line}; stroke-width: 1; stroke-dasharray: 3 5; }
.bus-active { stroke: url(#${id}-accent); stroke-width: 1.5; fill: none; stroke-linecap: round; stroke-dasharray: 120; stroke-dashoffset: 120; animation: busActive 4s cubic-bezier(.4,0,.2,1) infinite; }
.bus-active.b2 { animation-delay: 0.5s; } .bus-active.b3 { animation-delay: 1s; } .bus-active.b4 { animation-delay: 1.5s; } .bus-active.b5 { animation-delay: 2s; }
@keyframes busActive {
  0%,5%   { stroke-dashoffset: 120; }
  35%,70% { stroke-dashoffset: 0; }
  100%    { stroke-dashoffset: -120; }
}
.bus-outer { animation: busNode 4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.bus-outer.n2 { animation-delay: 0.5s; } .bus-outer.n3 { animation-delay: 1s; } .bus-outer.n4 { animation-delay: 1.5s; } .bus-outer.n5 { animation-delay: 2s; }
@keyframes busNode {
  0%,30%   { transform: scale(1); }
  50%      { transform: scale(1.12); }
  70%,100% { transform: scale(1); }
}
.bus-center { animation: busCenter 4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes busCenter { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
`;
  const center = { x: 240, y: 180 };
  const nodes = [
    { x: 90,  y: 110 },
    { x: 390, y: 110 },
    { x: 80,  y: 250 },
    { x: 240, y: 280 },
    { x: 400, y: 250 },
  ];
  return (
    <Scene id={id} viewBox="0 0 480 320" styles={css} ariaLabel="Coordination hub">
      <rect width="480" height="320" fill={`url(#${id}-dots)`} opacity="0.35" />
      <ellipse cx={center.x} cy={center.y} rx="220" ry="130" fill={`url(#${id}-warm)`} />

      {/* Static spoke lines */}
      {nodes.map((n, i) => (
        <line key={"bg" + i} className="bus-spoke" x1={center.x} y1={center.y} x2={n.x} y2={n.y} />
      ))}

      {/* Active animated beams */}
      {nodes.map((n, i) => (
        <path
          key={"fg" + i}
          className={`bus-active ${i ? "b" + (i + 1) : ""}`}
          d={`M${center.x} ${center.y} L${n.x} ${n.y}`}
        />
      ))}

      {/* Outer nodes */}
      {nodes.map((n, i) => (
        <g key={"nd" + i} transform={`translate(${n.x},${n.y})`} className={`bus-outer ${i ? "n" + (i + 1) : ""}`}>
          <circle r="14" fill={C.white} stroke={C.line} filter="drop-shadow(0 4px 10px rgba(0,0,0,0.05))" />
          <circle r="5" fill={C.slate400} />
        </g>
      ))}

      {/* Central hub with ripples */}
      <Ripple cx={center.x} cy={center.y} color={C.accent} count={3} baseR={18} step={12} stroke={1} duration={4} />
      <g transform={`translate(${center.x},${center.y})`} className="bus-center" style={{ transformOrigin: `${center.x}px ${center.y}px`, transformBox: "fill-box" }}>
        <circle r="22" fill={C.white} stroke={C.accent} strokeWidth="1.5" filter="drop-shadow(0 6px 14px rgba(232,104,58,0.22))" />
        <circle r="10" fill={C.accent} />
      </g>
    </Scene>
  );
}

// =============== 8. VELOCITY CURVE ===============
export function VelocitySceneSvg() {
  const id = "sc-vel";
  const css = `
@keyframes sceneRipple {
  0%   { transform: scale(0.5); opacity: 0; }
  20%  { opacity: 0.55; }
  100% { transform: scale(1.8); opacity: 0; }
}
.vel-area { opacity: 0; animation: velArea 6s ease-in-out infinite; }
@keyframes velArea {
  0%,15%   { opacity: 0; }
  45%,85%  { opacity: 1; }
  100%     { opacity: 0; }
}
.vel-line { stroke-dasharray: 480; stroke-dashoffset: 480; animation: velLine 6s cubic-bezier(.4,0,.2,1) infinite; }
@keyframes velLine {
  0%,5%   { stroke-dashoffset: 480; }
  45%,88% { stroke-dashoffset: 0; }
  100%    { stroke-dashoffset: -480; }
}
.vel-dot { animation: velDot 6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
${Array.from({ length: 6 }).map((_, i) => `.vel-dot.d${i + 1} { animation-delay: ${0.1 + i * 0.06}s; }`).join("\n")}
@keyframes velDot {
  0%,30%   { transform: scale(0); opacity: 0; }
  50%,88%  { transform: scale(1); opacity: 1; }
  100%     { transform: scale(0.8); opacity: 0; }
}
`;
  const pts = [
    { x: 60, y: 250 }, { x: 130, y: 220 }, { x: 200, y: 230 },
    { x: 270, y: 180 }, { x: 340, y: 140 }, { x: 410, y: 110 },
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
  const areaD = `${lineD} L 410 280 L 60 280 Z`;
  return (
    <Scene id={id} viewBox="0 0 480 320" styles={css} ariaLabel="Velocity">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="480" height="320" fill={`url(#${id}-dots)`} opacity="0.3" />
      <ellipse cx="240" cy="220" rx="220" ry="100" fill={`url(#${id}-warm)`} />

      {/* Baseline + soft grid */}
      <line x1="60" y1="280" x2="410" y2="280" stroke={C.line} />
      <line x1="60" y1="225" x2="410" y2="225" stroke={C.lineSoft} strokeDasharray="2 5" />
      <line x1="60" y1="170" x2="410" y2="170" stroke={C.lineSoft} strokeDasharray="2 5" />

      {/* Area */}
      <path className="vel-area" d={areaD} fill={`url(#${id}-fill)`} />
      {/* Line */}
      <path className="vel-line" d={lineD} fill="none" stroke={`url(#${id}-accent)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Dots along the line */}
      {pts.map((p, i) => (
        <g key={i} transform={`translate(${p.x},${p.y})`} style={{ transformOrigin: `${p.x}px ${p.y}px`, transformBox: "fill-box" }}>
          <circle className={`vel-dot ${i ? "d" + (i + 1) : ""}`} r="3.5" fill={C.white} stroke={C.accent} strokeWidth="1.5" />
        </g>
      ))}

      {/* Ripple on peak */}
      <Ripple cx={410} cy={110} color={C.accent} count={3} baseR={10} step={10} stroke={1} duration={3.2} />
    </Scene>
  );
}

// =============== 9. SHIELD RIPPLE (Quality) ===============
export function QualitySceneSvg() {
  const id = "sc-q";
  const css = `
@keyframes sceneRipple {
  0%   { transform: scale(0.4); opacity: 0; }
  15%  { opacity: 0.7; }
  100% { transform: scale(2.3); opacity: 0; }
}
.q-shield { animation: qBreathe 5s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
@keyframes qBreathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
.q-check { stroke-dasharray: 26; stroke-dashoffset: 26; animation: qCheck 5s ease-in-out infinite; }
@keyframes qCheck {
  0%,30%   { stroke-dashoffset: 26; opacity: 0; }
  50%,88%  { stroke-dashoffset: 0;  opacity: 1; }
  100%     { stroke-dashoffset: 26; opacity: 0; }
}
`;
  return (
    <Scene id={id} viewBox="0 0 480 320" styles={css} ariaLabel="Verification">
      <rect width="480" height="320" fill={`url(#${id}-dots)`} opacity="0.35" />
      <ellipse cx="240" cy="180" rx="220" ry="130" fill={`url(#${id}-warm)`} />

      {/* Outer ripples */}
      <Ripple cx={240} cy={180} color={C.accent} count={4} baseR={40} step={22} stroke={1.2} duration={5} />

      {/* Shield */}
      <g transform="translate(240,180)" className="q-shield" style={{ transformOrigin: "240px 180px", transformBox: "fill-box" }}>
        <path
          d="M0 -56 L36 -42 L36 8 Q36 42 0 58 Q-36 42 -36 8 L-36 -42 Z"
          fill={C.white}
          stroke={C.accent}
          strokeOpacity="0.35"
          strokeWidth="1.5"
          strokeLinejoin="round"
          filter="drop-shadow(0 14px 28px rgba(232,104,58,0.18))"
        />
        <path
          d="M0 -50 L30 -38 L30 6 Q30 34 0 48 Q-30 34 -30 6 L-30 -38 Z"
          fill={C.accentSoft}
          opacity="0.6"
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

// =============== 10. DOCS TREE (big panel for docs-preview section) ===============
export function DocsTreeSceneSvg() {
  const id = "sc-dt";
  const css = `
@keyframes sceneRipple {
  0%   { transform: scale(0.4); opacity: 0; }
  18%  { opacity: 0.55; }
  100% { transform: scale(2); opacity: 0; }
}
.dt-row { opacity: 0; animation: dtRow 9s ease-out infinite; }
${Array.from({ length: 11 }).map((_, i) => `.dt-row.r${i + 1} { animation-delay: ${i * 0.11}s; }`).join("\n")}
@keyframes dtRow {
  0%,2%    { opacity: 0; transform: translateX(-6px); }
  14%,85%  { opacity: 1; transform: translateX(0); }
  100%     { opacity: 0; transform: translateX(4px); }
}
.dt-row-accent { animation: dtHighlight 9s ease-in-out infinite; animation-delay: 1.5s; }
@keyframes dtHighlight {
  0%,12%   { opacity: 0; }
  24%,85%  { opacity: 1; }
  100%     { opacity: 0; }
}
.dt-dot { animation: dtDot 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes dtDot { 0%,100% { transform: scale(1); } 50% { transform: scale(1.3); } }
`;
  const folders = [
    { color: C.accent,     bold: true  },
    { color: "#60a5fa"                 },
    { color: "#a78bfa"                 },
    { color: "#34d399"                 },
    { color: "#fbbf24"                 },
    { color: "#22d3ee"                 },
    { color: C.accent                  },
    { color: C.accent                  },
    { color: "#34d399"                 },
    { color: "#60a5fa"                 },
    { color: C.accentDeep, accent: true },
  ];
  return (
    <Scene id={id} viewBox="0 0 560 380" styles={css} ariaLabel="Docs tree" fade={false}>
      <rect width="560" height="380" fill={`url(#${id}-dots)`} opacity="0.4" />
      <ellipse cx="280" cy="210" rx="280" ry="150" fill={`url(#${id}-warm)`} />

      {/* Panel (light, not dark) */}
      <g transform="translate(90,50)" filter="drop-shadow(0 24px 50px rgba(15,15,20,0.1))">
        <rect width="380" height="290" rx="18" fill={C.white} stroke={C.line} />
        {/* Header bar */}
        <rect width="380" height="40" rx="18" fill={C.paper} />
        <rect y="34" width="380" height="6" fill={C.paper} />
        <line x1="0" y1="40" x2="380" y2="40" stroke={C.line} />
        <circle cx="20" cy="20" r="4" fill="#fca5a5" />
        <circle cx="36" cy="20" r="4" fill="#fcd34d" />
        <circle cx="52" cy="20" r="4" fill="#86efac" />
        <rect x="150" y="12" width="80" height="16" rx="8" fill={C.paper} stroke={C.line} />

        {/* Rows */}
        <g transform="translate(28,68)">
          {folders.map((f, i) => (
            <g
              key={i}
              className={`dt-row r${i + 1}`}
              transform={`translate(${f.bold ? 0 : 20},${i * 20})`}
            >
              {f.accent && (
                <rect
                  x="-10"
                  y="-5"
                  width="330"
                  height="18"
                  rx="5"
                  fill={C.accentSoft}
                  className="dt-row-accent"
                />
              )}
              {/* Chevron */}
              {i === 0 && (
                <path d="M-2 2 L2 6 L6 2" stroke={C.slate400} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              )}
              {/* Folder glyph */}
              <rect x="16" y="0" width="12" height="9" rx="1.5" fill={f.color} />
              <rect x="18" y="-2" width="6" height="3" rx="0.5" fill={f.color} />
              {/* Label bar */}
              <rect x="36" y="2" width={140 - (f.bold ? 0 : 20)} height="5" rx="2" fill={f.accent ? C.accentDeep : C.slate400} opacity={f.accent ? 1 : 0.75} />
              {/* Trailing count pill */}
              <rect x={220} y="-1" width="26" height="10" rx="5" fill={C.paper} stroke={C.line} />
              <circle cx={300} cy="4" r="3" fill={f.color} className={f.accent ? "dt-dot" : ""} />
            </g>
          ))}
        </g>

        {/* Status strip */}
        <rect y="260" width="380" height="30" fill={C.paper} />
        <line y1="260" x1="0" y2="260" x2="380" stroke={C.line} />
        <circle cx="24" cy="275" r="3" fill={C.accent} />
        <rect x="34" y="272" width="70" height="6" rx="3" fill={C.slate400} opacity="0.6" />
        <rect x="316" y="272" width="42" height="6" rx="3" fill={C.slate400} opacity="0.5" />
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

export function SvgSceneByName({ scene }: { scene: SceneName }) {
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
