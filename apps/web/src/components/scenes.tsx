import type { ReactNode } from "react";

/**
 * Illustrated scenes of people using JOTR (drawn, not photos of real users).
 * Each is a 400×500 portrait. People get a white "sticker" outline, and every
 * screen carries the JOTR notch under the camera.
 */

type P = { id: string };

const SKIN = ["#f1c7a5", "#c98c64", "#8d5a3b", "#e8b48f", "#a8714c"];

function Defs({ id, from, to }: P & { from: string; to: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" stopColor={from} />
        <stop offset="1" stopColor={to} />
      </linearGradient>
      <radialGradient id={`${id}-glow`} cx="0.5" cy="0.3" r="0.7">
        <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.35" />
      </linearGradient>
      <filter id={`${id}-sticker`} x="-20%" y="-20%" width="140%" height="140%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="d" />
        <feFlood floodColor="#ffffff" />
        <feComposite in2="d" operator="in" result="o" />
        <feDropShadow in="o" dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.25" result="os" />
        <feMerge>
          <feMergeNode in="os" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/** A person from the waist up, origin at the bottom centre of the torso. */
function Person({
  x,
  y,
  s = 1,
  skin = SKIN[0]!,
  hair = "#2a1a14",
  shirt = "#3d5afe",
  look = 0,
  talk = false,
  hand,
  long = false,
  id,
}: P & { x: number; y: number; s?: number; skin?: string; hair?: string; shirt?: string; look?: number; talk?: boolean; hand?: "up" | "point"; long?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} filter={`url(#${id}-sticker)`}>
      {long && <path d="M-34 -132 Q-40 -60 -30 -50 L30 -50 Q40 -60 34 -132 Z" fill={hair} />}
      <path d="M-60 0 Q-62 -64 -26 -80 L26 -80 Q62 -64 60 0 Z" fill={shirt} />
      <path d="M-26 -80 L0 -60 L26 -80 Z" fill="#000" opacity="0.12" />
      <rect x="-10" y="-96" width="20" height="20" rx="6" fill={skin} />
      <circle cx="0" cy="-122" r="30" fill={skin} />
      <path d={long ? "M-32 -118 Q-34 -158 0 -158 Q34 -158 32 -118 Q20 -142 -6 -140 Q-24 -138 -32 -118 Z" : "M-31 -124 Q-32 -156 0 -157 Q31 -156 31 -126 Q24 -144 2 -144 Q-20 -146 -31 -124 Z"} fill={hair} />
      <circle cx={-10 + look} cy="-120" r="3" fill="#1b1016" />
      <circle cx={10 + look} cy="-120" r="3" fill="#1b1016" />
      {talk ? <ellipse cx={look * 0.6} cy="-104" rx="6" ry="4.5" fill="#7a2b2b" /> : <path d={`M${-7 + look * 0.6} -106 Q${look * 0.6} -100 ${7 + look * 0.6} -106`} stroke="#7a2b2b" strokeWidth="2.6" fill="none" strokeLinecap="round" />}
      {hand === "up" && (
        <g>
          <path d="M44 -40 Q70 -70 70 -104" stroke={shirt} strokeWidth="18" strokeLinecap="round" fill="none" />
          <circle cx="70" cy="-112" r="12" fill={skin} />
        </g>
      )}
      {hand === "point" && (
        <g>
          <path d="M40 -36 Q74 -48 92 -70" stroke={shirt} strokeWidth="18" strokeLinecap="round" fill="none" />
          <circle cx="96" cy="-76" r="11" fill={skin} />
        </g>
      )}
    </g>
  );
}

/** A small head-and-shoulders tile (video call grids). */
function Face({ x, y, w, h, skin, hair, shirt, bg, on = false }: { x: number; y: number; w: number; h: number; skin: string; hair: string; shirt: string; bg: string; on?: boolean }) {
  const cx = x + w / 2;
  const r = Math.min(w, h) * 0.17;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="7" fill={bg} />
      <path d={`M${cx - r * 2.2} ${y + h} Q${cx - r * 2.2} ${y + h - r * 2} ${cx} ${y + h - r * 2.3} Q${cx + r * 2.2} ${y + h - r * 2} ${cx + r * 2.2} ${y + h} Z`} fill={shirt} />
      <circle cx={cx} cy={y + h - r * 3.3} r={r} fill={skin} />
      <path d={`M${cx - r} ${y + h - r * 3.4} Q${cx} ${y + h - r * 4.8} ${cx + r} ${y + h - r * 3.4} Q${cx} ${y + h - r * 3.9} ${cx - r} ${y + h - r * 3.4} Z`} fill={hair} />
      {on && <rect x={x + 1.5} y={y + 1.5} width={w - 3} height={h - 3} rx="6" fill="none" stroke="#ff8a3d" strokeWidth="3" />}
    </g>
  );
}

/** The JOTR notch: black pill under the camera with two lines of script. */
function Notch({ x, y, w = 120, lines = 2 }: { x: number; y: number; w?: number; lines?: number }) {
  return (
    <g>
      <rect x={x - w / 2} y={y} width={w} height={10 + lines * 9} rx="11" fill="#0b0710" />
      <circle cx={x} cy={y + 5} r="2.4" fill="#2b2b35" />
      {Array.from({ length: lines }, (_, k) => (
        <rect key={k} x={x - w / 2 + 12} y={y + 12 + k * 9} width={(w - 24) * (k === 0 ? 1 : 0.7)} height="3.4" rx="1.7" fill={k === 0 ? "#ffb27a" : "#7a6a70"} />
      ))}
    </g>
  );
}

function Svg({ id, from, to, children, label }: P & { from: string; to: string; children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 400 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label}>
      <Defs id={id} from={from} to={to} />
      <rect width="400" height="500" fill={`url(#${id}-bg)`} />
      <rect width="400" height="500" fill={`url(#${id}-glow)`} />
      {children}
      <rect width="400" height="500" fill={`url(#${id}-shade)`} />
    </svg>
  );
}

const SKETCH = { fill: "none", stroke: "#1e1e1e", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function SceneExplain() {
  const id = "sx";
  return (
    <Svg id={id} from="#ffd9b8" to="#c96a4a" label="Someone explaining a concept on a whiteboard app while recording">
      {/* wall light + shelf */}
      <rect x="20" y="40" width="110" height="8" rx="4" fill="#8a4a35" opacity="0.6" />
      <circle cx="350" cy="70" r="34" fill="#fff4e0" opacity="0.6" />
      {/* laptop */}
      <rect x="42" y="96" width="316" height="214" rx="16" fill="#1d1d22" />
      <rect x="52" y="106" width="296" height="194" rx="8" fill="#fbfbf8" />
      {/* whiteboard sketch */}
      <g {...SKETCH}>
        <path d="M80 160 q2 -24 0 -26 q30 2 62 0 q2 12 0 26 q-30 -2 -62 0 z" />
        <path d="M200 140 q34 -3 66 1 q2 12 -1 26 q-32 2 -64 -1 q-2 -12 -1 -26 z" />
        <path d="M150 152 q22 -2 42 0 m-8 -6 l9 6 l-9 6" />
        <path d="M232 172 q2 24 -2 40 m-6 -8 l6 9 l6 -9" />
        <ellipse cx="232" cy="236" rx="40" ry="20" />
        <path d="M100 196 q20 30 70 40" strokeDasharray="5 6" />
      </g>
      <rect x="282" y="206" width="52" height="48" rx="3" fill="#ffe27a" transform="rotate(4 308 230)" />
      <g fill="#1e1e1e" fontFamily="'Comic Sans MS','Segoe Print',cursive" fontSize="13">
        <text x="92" y="153">Idea</text>
        <text x="214" y="159">Build</text>
        <text x="212" y="241">Ship</text>
        <text x="290" y="232" fontSize="10">users!</text>
      </g>
      <Notch x={200} y={106} w={132} />
      {/* webcam bubble */}
      <circle cx="312" cy="276" r="21" fill="#e7d3c4" stroke="#fff" strokeWidth="3" />
      <circle cx="312" cy="272" r="8" fill={SKIN[1]} />
      <path d="M298 292 q14 -14 28 0" fill="#3d5afe" />
      <path d="M20 318 L380 318 L396 336 L4 336 Z" fill="#2a2a31" />
      {/* over-the-shoulder presenter */}
      <Person id={id} x={96} y={520} s={1.25} skin={SKIN[1]} hair="#1b120e" shirt="#ff4d6d" look={4} talk hand="point" />
    </Svg>
  );
}

export function SceneInterview() {
  const id = "si";
  return (
    <Svg id={id} from="#cfe0ff" to="#4a5ea8" label="Someone in a video interview, looking straight at the camera">
      {/* bookshelf */}
      <g opacity="0.8">
        <rect x="24" y="120" width="120" height="8" fill="#6b4b3a" />
        <rect x="24" y="200" width="120" height="8" fill="#6b4b3a" />
        {[0, 1, 2, 3, 4, 5].map((k) => (
          <rect key={k} x={30 + k * 18} y={86 - (k % 3) * 6} width="14" height={34 + (k % 3) * 6} rx="2" fill={["#ff8a3d", "#2ee6a6", "#9b5cff", "#ffc93c", "#ff4d6d", "#4a90e2"][k]} />
        ))}
        {[0, 1, 2, 3].map((k) => (
          <rect key={k} x={36 + k * 24} y={166 - (k % 2) * 8} width="18" height={34 + (k % 2) * 8} rx="2" fill={["#e2e8f0", "#ffb27a", "#7a6a70", "#c39bff"][k]} />
        ))}
      </g>
      <rect x="300" y="150" width="54" height="76" rx="6" fill="#2d3a6b" opacity="0.6" />
      <path d="M318 226 q-14 -40 8 -64 q10 30 -2 64 z" fill="#2ee6a6" opacity="0.9" />
      <Person id={id} x={200} y={500} s={1.7} skin={SKIN[0]} hair="#3a2418" shirt="#20263f" long />
      {/* frame chrome: notch at the camera, interviewer tile, live chip */}
      <Notch x={200} y={14} w={150} />
      <rect x="292" y="380" width="92" height="104" rx="12" fill="#11142a" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" />
      <Face x={296} y={384} w={84} h={96} skin={SKIN[2]!} hair="#120c09" shirt="#6b7280" bg="#e8e2da" />
      <rect x="16" y="16" width="58" height="22" rx="11" fill="#0b0710" opacity="0.8" />
      <circle cx="31" cy="27" r="4.5" fill="#ff4d6d" />
      <text x="40" y="31.5" fontSize="11" fontFamily="system-ui,sans-serif" fontWeight="700" fill="#fff">LIVE</text>
    </Svg>
  );
}

export function SceneCall() {
  const id = "sc";
  const tiles = [
    { skin: SKIN[0]!, hair: "#2a1a14", shirt: "#ff8a3d", bg: "#f3e5d8" },
    { skin: SKIN[2]!, hair: "#120c09", shirt: "#2ee6a6", bg: "#dfe9f3" },
    { skin: SKIN[3]!, hair: "#6b3e1f", shirt: "#9b5cff", bg: "#efe0f0" },
    { skin: SKIN[4]!, hair: "#1b120e", shirt: "#4a90e2", bg: "#e5f0e4" },
    { skin: SKIN[1]!, hair: "#2b1d16", shirt: "#ffc93c", bg: "#f6ead6" },
    { skin: SKIN[0]!, hair: "#c08a4a", shirt: "#ff4d6d", bg: "#e4e4ee" },
  ];
  return (
    <Svg id={id} from="#d3f5e6" to="#2b7a64" label="A team video call with the script floating under the camera">
      <path d="M0 360 L400 360 L400 500 L0 500 Z" fill="#7a5238" />
      <path d="M0 360 L400 360 L400 372 L0 372 Z" fill="#9a6a49" />
      {/* plant */}
      <rect x="330" y="300" width="40" height="60" rx="8" fill="#e9dccb" />
      <path d="M350 300 q-30 -50 -10 -90 q18 40 10 90 z M350 300 q30 -40 14 -84 q-22 36 -14 84 z" fill="#1f8a5c" />
      {/* laptop */}
      <rect x="40" y="110" width="290" height="200" rx="14" fill="#1d1d22" filter={`url(#${id}-sticker)`} />
      <rect x="50" y="120" width="270" height="180" rx="7" fill="#0f1116" />
      {tiles.map((t, k) => (
        <Face key={k} x={58 + (k % 3) * 88} y={132 + Math.floor(k / 3) * 82} w={82} h={76} {...t} on={k === 4} />
      ))}
      <Notch x={185} y={120} w={140} />
      <path d="M24 312 L346 312 L364 330 L6 330 Z" fill="#2a2a31" />
      {/* mug */}
      <rect x="70" y="378" width="40" height="46" rx="8" fill="#fff" />
      <path d="M110 388 q16 0 16 14 q0 14 -16 14" fill="none" stroke="#fff" strokeWidth="6" />
      <text x="78" y="406" fontSize="12" fontFamily="system-ui,sans-serif" fontWeight="800" fill="#ff4d6d">J</text>
    </Svg>
  );
}

export function SceneDebate() {
  const id = "sd";
  return (
    <Svg id={id} from="#2a1840" to="#0d0814" label="Two people at podiums practising a debate">
      {/* spotlights */}
      <path d="M90 0 L20 380 L170 380 Z" fill="#ffd27a" opacity="0.22" />
      <path d="M310 0 L230 380 L380 380 Z" fill="#9b5cff" opacity="0.2" />
      <rect y="380" width="400" height="120" fill="#1a1020" />
      <Person id={id} x={100} y={330} s={1.05} skin={SKIN[1]} hair="#120c09" shirt="#ff4d6d" look={3} talk hand="up" />
      <Person id={id} x={300} y={330} s={1.0} skin={SKIN[3]} hair="#6b3e1f" shirt="#4a5ea8" look={-3} long />
      {/* podiums */}
      <path d="M40 300 L160 300 L150 400 L50 400 Z" fill="#e9dccb" filter={`url(#${id}-sticker)`} />
      <path d="M240 300 L360 300 L350 400 L250 400 Z" fill="#e9dccb" filter={`url(#${id}-sticker)`} />
      <text x="84" y="356" fontSize="20" fontFamily="system-ui,sans-serif" fontWeight="900" fill="#ff4d6d">FOR</text>
      <text x="262" y="356" fontSize="20" fontFamily="system-ui,sans-serif" fontWeight="900" fill="#4a5ea8">AGAINST</text>
      {/* tablet on the podium with the notch, tilted toward the speaker */}
      <g transform="rotate(-8 100 290)">
        <rect x="62" y="262" width="76" height="40" rx="6" fill="#0b0710" />
        <Notch x={100} y={266} w={64} lines={2} />
      </g>
      {/* audience */}
      {[30, 90, 150, 210, 270, 330, 380].map((x, k) => (
        <g key={x} fill="#000" opacity="0.75">
          <circle cx={x} cy={452 + (k % 2) * 8} r="18" />
          <rect x={x - 30} y={468 + (k % 2) * 8} width="60" height="40" rx="22" />
        </g>
      ))}
      <text x="200" y="40" textAnchor="middle" fontSize="13" letterSpacing="3" fontFamily="system-ui,sans-serif" fontWeight="800" fill="#fff" opacity="0.7">MOTION · ROUND 2</text>
    </Svg>
  );
}

export function SceneGroup() {
  const id = "sg";
  return (
    <Svg id={id} from="#fff1c9" to="#d9952a" label="A group discussion around a table, notes ready on a phone">
      <rect x="40" y="40" width="320" height="70" rx="10" fill="#fff" opacity="0.5" />
      <text x="200" y="83" textAnchor="middle" fontSize="20" fontFamily="system-ui,sans-serif" fontWeight="900" fill="#7a3d0c">GD · Remote work: yes or no?</text>
      <Person id={id} x={80} y={300} s={0.82} skin={SKIN[3]} hair="#2a1a14" shirt="#9b5cff" look={4} long />
      <Person id={id} x={160} y={288} s={0.86} skin={SKIN[2]} hair="#120c09" shirt="#2ee6a6" look={2} />
      <Person id={id} x={245} y={290} s={0.86} skin={SKIN[0]} hair="#c08a4a" shirt="#4a90e2" look={-2} long />
      <Person id={id} x={325} y={300} s={0.82} skin={SKIN[4]} hair="#1b120e" shirt="#ff8a3d" look={-4} talk hand="up" />
      {/* speech bubble */}
      <path d="M262 132 h96 a12 12 0 0 1 12 12 v26 a12 12 0 0 1 -12 12 h-46 l-12 14 l-4 -14 h-34 a12 12 0 0 1 -12 -12 v-26 a12 12 0 0 1 12 -12 z" fill="#fff" filter={`url(#${id}-sticker)`} />
      <rect x="264" y="148" width="80" height="5" rx="2.5" fill="#c8b9a8" />
      <rect x="264" y="160" width="58" height="5" rx="2.5" fill="#c8b9a8" />
      {/* table */}
      <ellipse cx="200" cy="350" rx="196" ry="74" fill="#8a5a3c" />
      <ellipse cx="200" cy="342" rx="190" ry="66" fill="#b07a52" />
      {/* foreground: your phone on the table, JOTR showing your points */}
      <g transform="rotate(-10 200 420)" filter={`url(#${id}-sticker)`}>
        <rect x="150" y="360" width="104" height="150" rx="16" fill="#0b0710" />
        <rect x="183" y="366" width="38" height="10" rx="5" fill="#000" />
        <g fontFamily="system-ui,sans-serif" fontWeight="700" fontSize="10">
          <text x="162" y="396" fill="#ffb27a">1. Flexibility ↑</text>
          <text x="162" y="414" fill="#a8989e">2. Costs ↓</text>
          <text x="162" y="432" fill="#a8989e">3. Culture?</text>
        </g>
      </g>
    </Svg>
  );
}

export function SceneYours() {
  const id = "sy";
  return (
    <Svg id={id} from="#f6efe6" to="#e6d6c4" label="An empty frame for your own story">
      <rect x="60" y="80" width="280" height="340" rx="22" fill="none" stroke="#b8a58f" strokeWidth="3" strokeDasharray="10 10" />
      <Notch x={200} y={80} w={120} />
      <circle cx="200" cy="230" r="36" fill="none" stroke="#b8a58f" strokeWidth="3" />
      <path d="M200 212 v36 M182 230 h36" stroke="#b8a58f" strokeWidth="3" strokeLinecap="round" />
      <text x="200" y="310" textAnchor="middle" fontSize="18" fontFamily="system-ui,sans-serif" fontWeight="800" fill="#8a765f">Your scene here</text>
    </Svg>
  );
}
