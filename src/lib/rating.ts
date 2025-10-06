// lib/rating.ts
import type { Spot } from "./spots";

/**
 * Component “axes” for the radar/snowflake chart.
 * Keep scores in [0,1], higher = better.
 */
export type ComponentId = "wind" | "dir" | "period" | "size" | "tide";
export type ComponentScore = { id: ComponentId; label: string; score: number };

export type Weights = Partial<Record<ComponentId, number>>;

export type RatingInputs = {
  hs: number; // significant wave height (m)
  tp: number; // peak period (s)
  dp: number; // swell direction (deg, COMING FROM, 0..360)
  wind: number; // wind speed at 10m (m/s)
  windDir: number; // wind direction COMING FROM (deg, 0..360)
  tide?: number; // sea level / tide proxy (m), optional
  spot: Spot;
};

export type Aggregate = {
  method: "geometric";
  score_0_10: number;
  weights: Record<ComponentId, number>;
} | null;

export type RatedHour = {
  components: ComponentScore[];
  aggregate: Aggregate;
  reasons: string[];
};

/* ------------------------------ helpers ------------------------------ */

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const angDiff = (a: number, b: number) => {
  const d = Math.abs((((a % 360) + 360) % 360) - (((b % 360) + 360) % 360));
  return Math.min(d, 360 - d);
};

/** True if dir x lies inside [min,max] on a circular scale. Handles wraparound. */
const inDirWindow = (x: number, min: number, max: number) =>
  min <= max ? x >= min && x <= max : x >= min || x <= max;

/* ------------------------------ axis scoring ------------------------------ */

/**
 * Wind quality:
 * - Best when offshore (coastBearing + 180) and light.
 * - We give full credit near 180° offshore, fade to 0 by ~30° from onshore.
 * - Then damp by wind speed: ≥18 m/s (≈35 kt) → heavy penalty.
 */
function windQuality(
  windMs: number,
  windDir: number,
  coastBearing: number
): number {
  const offshoreDir = (coastBearing + 180) % 360;
  const offAngle = angDiff(windDir, offshoreDir); // 180 = perfect offshore
  // Map angle: 30° off → 0, 180° → 1 (linear-ish)
  const angleScore = clamp01((offAngle - 30) / 150);
  // Penalise strong winds even if offshore
  const speedPenalty = 1 - clamp01(windMs / 18); // 0 at >=18 m/s
  return clamp01(angleScore * speedPenalty);
}

/**
 * Swell direction fit:
 * - 1.0 at the window centre, linear fade to 0 at ±60° if inside the window,
 *   ±120° if outside (soft penalty when just outside).
 */
function directionQuality(dp: number, min: number, max: number): number {
  const inside = inDirWindow(dp, min, max);
  // Compute circular mid-point of [min, max]
  const span = (max - min + 360) % 360;
  const half = span / 2;
  const center = (min + half) % 360;
  const diff = angDiff(dp, center);
  const denom = inside ? 60 : 120;
  return clamp01(1 - diff / denom);
}

/**
 * Period power:
 * - 0 at/below minPeriod, ramps to 1 at idealPeriod (clamped).
 */
function periodQuality(tp: number, minP: number, idealP: number): number {
  const range = Math.max(idealP - minP, 1);
  return clamp01((tp - minP) / range);
}

/**
 * Size suitability:
 * - Linear 0..1 up to a cap that depends on break type.
 *   beach ≈ 2.5 m, reef ≈ 3 m, point ≈ 4 m (tweak per spot later).
 */
function sizeQuality(hs: number, breakType: Spot["breakType"]): number {
  const cap = breakType === "beach" ? 2.5 : breakType === "point" ? 4 : 3;
  return clamp01(hs / Math.max(cap, 0.1));
}

/**
 * Tide suitability (optional):
 * - If the spot defines min/max, return a parabola peaking at ideal.
 * - If no tide metadata or tide value, return 1 (neutral).
 */
function tideQuality(tide: number | undefined, spot: Spot): number {
  if (tide == null || spot.minTide == null || spot.maxTide == null) return 1;
  if (tide < spot.minTide || tide > spot.maxTide) return 0;
  const range = spot.maxTide - spot.minTide || 0.1;
  const ideal = spot.idealTide ?? lerp(spot.minTide, spot.maxTide, 0.5);
  const tnorm = (tide - ideal) / (range / 2);
  return clamp01(1 - tnorm * tnorm);
}

/* ------------------------------ reasons ----------------------------------- */

function reasonsFromComponents(cs: Record<ComponentId, number>): string[] {
  const out: string[] = [];
  if (cs.wind >= 0.6) out.push("offshore or light winds");
  else if (cs.wind <= 0.2) out.push("onshore/strong winds");

  if (cs.dir >= 0.6) out.push("favourable swell direction");
  else out.push("suboptimal swell direction");

  if (cs.period >= 0.6) out.push("good period");
  else if (cs.period <= 0.2) out.push("short/weak period");

  if (cs.size >= 0.8) out.push("solid size");
  else if (cs.size <= 0.2) out.push("small surf");

  if (cs.tide === 0) out.push("tide out of window");
  return out;
}

/* ------------------------- public scoring API ----------------------------- */

/**
 * Compute per-axis component scores (0..1) for radar/snowflake visualisation.
 */
export function componentScores(x: RatingInputs): ComponentScore[] {
  const minP = x.spot.minPeriod ?? 7;
  const idealP = x.spot.idealPeriod ?? 13;

  const wind = windQuality(x.wind, x.windDir, x.spot.coastBearing);
  const dir = directionQuality(x.dp, x.spot.swellDirMin, x.spot.swellDirMax);
  const period = periodQuality(x.tp, minP, idealP);
  const size = sizeQuality(x.hs, x.spot.breakType);
  const tide = tideQuality(x.tide, x.spot);

  return [
    { id: "wind", label: "Wind", score: clamp01(wind) },
    { id: "dir", label: "Direction", score: clamp01(dir) },
    { id: "period", label: "Period", score: clamp01(period) },
    { id: "size", label: "Size", score: clamp01(size) },
    { id: "tide", label: "Tide", score: clamp01(tide) },
  ];
}

/**
 * Aggregate component scores into a single 0–10 rating using a weighted geometric mean.
 * If no weights are provided, returns null (so you can be “radar-only” if you want).
 */
export function aggregateScore(
  components: ComponentScore[],
  weights?: Weights
): Aggregate {
  if (!weights) return null;

  // normalise weights over the present component ids
  const ids = components.map((c) => c.id);
  const raw = ids.map((id) => Math.max(0, weights[id] ?? 0));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const w = raw.map((v) => v / sum);

  // geometric mean with an epsilon floor to avoid ln(0)
  const eps = 1e-6;
  const geom = Math.exp(
    components.reduce(
      (acc, c, i) => acc + w[i] * Math.log(Math.max(c.score, eps)),
      0
    )
  );

  return {
    method: "geometric",
    score_0_10: Math.round(geom * 10 * 10) / 10,
    weights: Object.fromEntries(ids.map((id, i) => [id, w[i]])) as Record<
      ComponentId,
      number
    >,
  };
}

/**
 * Convenience: full evaluation in one call.
 * - Returns components (for radar), aggregate (0–10, if weights supplied), and reasons.
 */
export function evaluateRating(x: RatingInputs, weights?: Weights): RatedHour {
  const comps = componentScores(x);

  // Build a quick lookup for reasons
  const dict = comps.reduce(
    (m, c) => ((m[c.id] = c.score), m),
    {} as Record<ComponentId, number>
  );
  const reasons = reasonsFromComponents(dict);

  return {
    components: comps,
    aggregate: aggregateScore(comps, weights),
    reasons,
  };
}

/* ------------------------ legacy convenience ------------------------------ */
/**
 * Backward-compatible helper that returns a single score (0–10) plus components dict and reasons,
 * using fixed weights Wind 0.35, Dir 0.35, Period 0.2, Size 0.1, Tide acts as a gate (0..1).
 * This mirrors the earlier arithmetic-weighted approach by emulating the gate via weights.
 */
export function scoreForecast(x: RatingInputs) {
  // Fixed weights (normalised inside aggregateScore)
  const weights: Weights = {
    wind: 0.35,
    dir: 0.35,
    period: 0.2,
    size: 0.1,
    tide: 0.6,
  };
  const { components, aggregate, reasons } = evaluateRating(x, weights);

  // For compatibility, also return a flat components object
  const compObj = components.reduce(
    (m, c) => ((m[`${c.id}Score` as const] = c.score), m),
    {} as Record<
      "windScore" | "dirScore" | "periodScore" | "sizeScore" | "tideScore",
      number
    >
  );

  return {
    score: aggregate?.score_0_10 ?? 0,
    components: compObj,
    reasons,
  };
}
