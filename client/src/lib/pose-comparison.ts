/**
 * Pose comparison — joint angle similarity scoring for AI Coach.
 * All functions are pure (no side effects, no DOM, no network).
 */

// MediaPipe Pose landmark indices
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

export interface Point {
  x: number;
  y: number;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
  v: number; // visibility
}

export interface JointScore {
  name: string;
  score: number; // 0-1
  color: string; // hex color
  indices: [number, number, number]; // landmark indices for skeleton drawing
}

// Joint triplets with weights — hips/knees/torso weighted 2x for dance
const JOINT_TRIPLETS: Array<{
  name: string;
  indices: [number, number, number];
  weight: number;
}> = [
  { name: "Left Arm", indices: [LEFT_SHOULDER, LEFT_ELBOW, LEFT_WRIST], weight: 1.0 },
  { name: "Right Arm", indices: [RIGHT_SHOULDER, RIGHT_ELBOW, RIGHT_WRIST], weight: 1.0 },
  { name: "Left Leg", indices: [LEFT_HIP, LEFT_KNEE, LEFT_ANKLE], weight: 2.0 },
  { name: "Right Leg", indices: [RIGHT_HIP, RIGHT_KNEE, RIGHT_ANKLE], weight: 2.0 },
  { name: "Left Torso", indices: [LEFT_SHOULDER, LEFT_HIP, LEFT_KNEE], weight: 2.0 },
  { name: "Right Torso", indices: [RIGHT_SHOULDER, RIGHT_HIP, RIGHT_KNEE], weight: 2.0 },
  { name: "Left Upper", indices: [LEFT_ELBOW, LEFT_SHOULDER, LEFT_HIP], weight: 1.5 },
  { name: "Right Upper", indices: [RIGHT_ELBOW, RIGHT_SHOULDER, RIGHT_HIP], weight: 1.5 },
  { name: "Hip Align", indices: [LEFT_HIP, -1, RIGHT_HIP], weight: 2.0 }, // -1 = midpoint
  { name: "Shoulder Align", indices: [LEFT_SHOULDER, -1, RIGHT_SHOULDER], weight: 1.5 },
];

const TOTAL_WEIGHT = JOINT_TRIPLETS.reduce((sum, j) => sum + j.weight, 0); // 16.5

const COLOR_GREEN = "#22C55E";
const COLOR_AMBER = "#F59E0B";
const COLOR_RED = "#F43F5E";

/**
 * Calculate angle at point B in the triangle A-B-C.
 * Returns angle in degrees (0-360).
 */
function jointAngleDeg(a: Point, b: Point, c: Point): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const cross = ba.x * bc.x + ba.y * bc.y; // intentionally use dot for magnitude calc
  const angleRad = Math.atan2(
    ba.x * bc.y - ba.y * bc.x,
    ba.x * bc.x + ba.y * bc.y
  );
  return angleRad * (180 / Math.PI);
}

/**
 * Get the midpoint between two landmarks.
 */
function midpoint(a: Landmark, b: Landmark): Landmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    v: Math.min(a.v, b.v),
  };
}

/**
 * Compute the angular difference, handling wraparound.
 * Returns a value in [0, 180].
 */
function angleDiff(deg1: number, deg2: number): number {
  let diff = Math.abs(deg1 - deg2) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Score a single joint (0-1). 45° tolerance = 0 score.
 */
function scoreJoint(studentAngle: number, teacherAngle: number): number {
  const diff = angleDiff(studentAngle, teacherAngle);
  return Math.max(0, 1 - diff / 45);
}

/**
 * Get color for a joint score.
 */
export function jointColor(score: number): string {
  if (score >= 0.67) return COLOR_GREEN;
  if (score >= 0.33) return COLOR_AMBER;
  return COLOR_RED;
}

/**
 * Resolve a triplet's landmarks, handling midpoint indices (-1).
 */
function resolveTriplet(
  landmarks: Landmark[],
  indices: [number, number, number]
): [Point, Point, Point] {
  const [ai, bi, ci] = indices;
  const a = landmarks[ai];
  const c = landmarks[ci];
  const b = bi === -1 ? midpoint(landmarks[ai], landmarks[ci]) : landmarks[bi];
  return [a, b, c];
}

/**
 * Compare student pose against teacher reference.
 * Returns overall score (0-100) and per-joint scores.
 */
export function comparePoses(
  student: Landmark[],
  teacher: Landmark[]
): { score: number; jointScores: JointScore[] } {
  if (student.length < 33 || teacher.length < 33) {
    return { score: 0, jointScores: [] };
  }

  let weightedSum = 0;
  const jointScores: JointScore[] = [];

  for (const triplet of JOINT_TRIPLETS) {
    const [sa, sb, sc] = resolveTriplet(student, triplet.indices);
    const [ta, tb, tc] = resolveTriplet(teacher, triplet.indices);

    const studentAngle = jointAngleDeg(sa, sb, sc);
    const teacherAngle = jointAngleDeg(ta, tb, tc);
    const score = scoreJoint(studentAngle, teacherAngle);

    weightedSum += score * triplet.weight;
    jointScores.push({
      name: triplet.name,
      score,
      color: jointColor(score),
      indices: triplet.indices,
    });
  }

  const overallScore = Math.round((weightedSum / TOTAL_WEIGHT) * 100);
  return { score: overallScore, jointScores };
}

/**
 * Binary search for the closest reference keypoint to a given timestamp.
 */
export function findClosestKeypoint(
  keypoints: Array<{ timestampMs: number; landmarks: Landmark[] }>,
  targetMs: number,
  maxDistanceMs: number = 500
): Landmark[] | null {
  if (keypoints.length === 0) return null;

  let lo = 0;
  let hi = keypoints.length - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (keypoints[mid].timestampMs < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Check lo and lo-1 for closest
  let closest = keypoints[lo];
  if (lo > 0) {
    const prev = keypoints[lo - 1];
    if (Math.abs(prev.timestampMs - targetMs) < Math.abs(closest.timestampMs - targetMs)) {
      closest = prev;
    }
  }

  if (Math.abs(closest.timestampMs - targetMs) > maxDistanceMs) return null;
  return closest.landmarks;
}

/**
 * Skeleton connection map — pairs of landmark indices to draw lines between.
 * Used by AiCoachSkeleton to render the stick figure.
 */
export const SKELETON_CONNECTIONS: [number, number][] = [
  // Torso
  [LEFT_SHOULDER, RIGHT_SHOULDER],
  [LEFT_SHOULDER, LEFT_HIP],
  [RIGHT_SHOULDER, RIGHT_HIP],
  [LEFT_HIP, RIGHT_HIP],
  // Left arm
  [LEFT_SHOULDER, LEFT_ELBOW],
  [LEFT_ELBOW, LEFT_WRIST],
  // Right arm
  [RIGHT_SHOULDER, RIGHT_ELBOW],
  [RIGHT_ELBOW, RIGHT_WRIST],
  // Left leg
  [LEFT_HIP, LEFT_KNEE],
  [LEFT_KNEE, LEFT_ANKLE],
  // Right leg
  [RIGHT_HIP, RIGHT_KNEE],
  [RIGHT_KNEE, RIGHT_ANKLE],
];

/**
 * Map a skeleton connection to its color based on the joint scores.
 * A connection inherits the worst score of its two endpoints' joints.
 */
export function connectionColor(
  a: number,
  b: number,
  jointScores: JointScore[]
): string {
  // Find any joint that involves these landmarks
  let worstScore = 1;
  for (const js of jointScores) {
    const [i, _m, k] = js.indices;
    if (i === a || i === b || k === a || k === b) {
      worstScore = Math.min(worstScore, js.score);
    }
  }
  return jointColor(worstScore);
}
