/**
 * Geometry on MediaPipe Face Landmarker output (478 points with iris
 * refinement). Coordinates are normalised to the image: x right, y down,
 * z roughly in the same scale as x.
 */

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Landmark indices for the MediaPipe 478-point face mesh. */
export const FACE = {
  // "A" is the subject's right eye (image left when not mirrored).
  eyeA: { outer: 33, inner: 133, top: 159, bottom: 145, irisCenter: 468, iris: [469, 470, 471, 472] },
  eyeB: { outer: 263, inner: 362, top: 386, bottom: 374, irisCenter: 473, iris: [474, 475, 476, 477] },
  noseTip: 1,
  forehead: 10,
  chin: 152,
  cheekA: 205,
  cheekB: 425,
  mouthTop: 13,
  mouthBottom: 14,
  mouthLeft: 61,
  mouthRight: 291,
  faceLeft: 234,
  faceRight: 454,
} as const;

export interface EyeGeometry {
  /** Iris position along the eye axis: 0 at the outer corner, 1 at the inner corner. */
  h: number;
  /** Iris offset perpendicular to the eye axis, in eye widths (positive = down). */
  v: number;
  /** Eye aspect ratio (lid opening / eye width). Small values mean closed. */
  openness: number;
  /** Eye width in normalised image units. */
  width: number;
  irisCenter: Point3;
}

function sub(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot2(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y;
}
function len2(a: Point3): number {
  return Math.hypot(a.x, a.y);
}

export function eyeGeometry(lm: Point3[], eye: typeof FACE.eyeA | typeof FACE.eyeB): EyeGeometry | null {
  const outer = lm[eye.outer];
  const inner = lm[eye.inner];
  const top = lm[eye.top];
  const bottom = lm[eye.bottom];
  const iris = lm[eye.irisCenter];
  if (!outer || !inner || !top || !bottom || !iris) return null;
  const axis = sub(inner, outer);
  const width = len2(axis);
  if (width < 1e-6) return null;
  const rel = sub(iris, outer);
  const h = dot2(rel, axis) / (width * width);
  // Perpendicular (rotate axis by +90° so positive is "down" for an upright face).
  const perp = { x: -axis.y / width, y: axis.x / width, z: 0 };
  const mid = { x: (outer.x + inner.x) / 2, y: (outer.y + inner.y) / 2, z: 0 };
  const v = dot2(sub(iris, mid), perp) / width;
  const openness = len2(sub(bottom, top)) / width;
  return { h, v, openness, width, irisCenter: iris };
}

export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

/**
 * Approximate head pose from landmarks alone (degrees). When the facial
 * transformation matrix from MediaPipe is available, prefer `poseFromMatrix`.
 */
export function headPoseFromLandmarks(lm: Point3[]): HeadPose | null {
  const l = lm[FACE.faceLeft];
  const r = lm[FACE.faceRight];
  const nose = lm[FACE.noseTip];
  const top = lm[FACE.forehead];
  const chin = lm[FACE.chin];
  if (!l || !r || !nose || !top || !chin) return null;
  const roll = (Math.atan2(r.y - l.y, r.x - l.x) * 180) / Math.PI;
  const midX = (l.x + r.x) / 2;
  const faceW = Math.hypot(r.x - l.x, r.y - l.y) || 1e-6;
  const yaw = Math.asin(Math.max(-1, Math.min(1, ((nose.x - midX) / faceW) * 2))) * (180 / Math.PI);
  const midY = (top.y + chin.y) / 2;
  const faceH = Math.hypot(chin.x - top.x, chin.y - top.y) || 1e-6;
  // 0.08 is the typical nose offset below the face midpoint for a level head.
  const pitch = Math.asin(Math.max(-1, Math.min(1, ((nose.y - midY) / faceH - 0.08) * 2.5))) * (180 / Math.PI);
  return { yaw, pitch, roll };
}

/** Head pose from MediaPipe's 4x4 column-major facial transformation matrix (degrees). */
export function poseFromMatrix(m: ArrayLike<number>): HeadPose {
  // Rotation part, column-major: r00=m[0], r10=m[1], r20=m[2], r01=m[4], r11=m[5], r21=m[6], r02=m[8], r12=m[9], r22=m[10]
  const r20 = m[2]!;
  const r21 = m[6]!;
  const r22 = m[10]!;
  const r10 = m[1]!;
  const r00 = m[0]!;
  const toDeg = 180 / Math.PI;
  const pitch = Math.atan2(r21, r22) * toDeg;
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r20))) * toDeg;
  const roll = Math.atan2(r10, r00) * toDeg;
  return { yaw, pitch, roll };
}

export interface FaceFeatures {
  /** Feature vector for gaze regression. */
  vector: number[];
  blink: boolean;
  pose: HeadPose;
  cx: number;
  cy: number;
  scale: number;
  mouthOpen: number;
}

const BLINK_OPENNESS = 0.16;

/** Everything downstream modules need from one frame of landmarks. */
export function faceFeatures(lm: Point3[], pose?: HeadPose): FaceFeatures | null {
  const a = eyeGeometry(lm, FACE.eyeA);
  const b = eyeGeometry(lm, FACE.eyeB);
  const p = pose ?? headPoseFromLandmarks(lm);
  if (!a || !b || !p) return null;
  const l = lm[FACE.faceLeft]!;
  const r = lm[FACE.faceRight]!;
  const mt = lm[FACE.mouthTop]!;
  const mb = lm[FACE.mouthBottom]!;
  const ml = lm[FACE.mouthLeft]!;
  const mr = lm[FACE.mouthRight]!;
  const scale = Math.hypot(r.x - l.x, r.y - l.y);
  const cx = (l.x + r.x) / 2;
  const cy = (lm[FACE.forehead]!.y + lm[FACE.chin]!.y) / 2;
  // Average the two eyes; "h" is mirrored between eyes so convert to a common direction.
  const gx = (a.h + (1 - b.h)) / 2;
  const gy = (a.v + b.v) / 2;
  const openness = (a.openness + b.openness) / 2;
  const mouthOpen = Math.hypot(mb.x - mt.x, mb.y - mt.y) / (Math.hypot(mr.x - ml.x, mr.y - ml.y) || 1e-6);
  return {
    vector: [gx, gy, p.yaw / 45, p.pitch / 45, cx, cy, scale],
    blink: openness < BLINK_OPENNESS,
    pose: p,
    cx,
    cy,
    scale,
    mouthOpen,
  };
}
