// lib/rating.ts
import type { Spot } from "./spots";

const angDiff = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
};

export type RatingInputs = {
  hs: number; // significant wave height (m)
  tp: number; // peak period (s)
  dp: number; // swell direction (deg, coming-from)
  wind: number; // 10m wind speed (m/s)
  windDir: number; // wind direction (deg, coming-from)
  tide?: number; // m MSL (optional for now)
  spot: Spot;
};

export function scoreForecast(x: RatingInputs) {
  // Wind: offshore near coastBearing+180
  const offshoreDir = (x.spot.coastBearing + 180) % 360;
  const wOff = angDiff(x.windDir, offshoreDir); // 180=perfect offshore
  let windScore = Math.max(0, (wOff - 30) / 150); // 0 @30°, 1 @180°
  windScore *= 1 - Math.min(x.wind / 18, 1); // penalise very strong winds

  // Swell direction window (soft if outside)
  const withinWindow =
    x.spot.swellDirMin <= x.spot.swellDirMax
      ? x.dp >= x.spot.swellDirMin && x.dp <= x.spot.swellDirMax
      : x.dp >= x.spot.swellDirMin || x.dp <= x.spot.swellDirMax;
  const windowCenter =
    (x.spot.swellDirMin +
      ((x.spot.swellDirMax - x.spot.swellDirMin + 360) % 360) / 2) %
    360;
  const dirScore = Math.max(
    0,
    1 - angDiff(x.dp, windowCenter) / (withinWindow ? 60 : 120)
  );

  // Period & size (very rough)
  const minP = x.spot.minPeriod ?? 7;
  const idealP = x.spot.idealPeriod ?? 13;
  const periodScore = Math.max(
    0,
    Math.min(1, (x.tp - minP) / Math.max(idealP - minP, 1))
  );

  const sizeCap =
    x.spot.breakType === "beach" ? 2.5 : x.spot.breakType === "point" ? 4 : 3;
  const sizeScore = Math.max(0, Math.min(1, x.hs / sizeCap));

  // Tide (optional gate; if missing, treat as neutral)
  let tideScore = 1;
  if (
    typeof x.tide === "number" &&
    x.spot.minTide != null &&
    x.spot.maxTide != null
  ) {
    if (x.tide < x.spot.minTide || x.tide > x.spot.maxTide) tideScore = 0;
    else {
      const r = x.spot.maxTide - x.spot.minTide || 0.1;
      const ideal = x.spot.idealTide ?? (x.spot.minTide + x.spot.maxTide) / 2;
      const tnorm = (x.tide - ideal) / (r / 2);
      tideScore = Math.max(0, 1 - tnorm * tnorm);
    }
  }

  const raw =
    0.35 * windScore + 0.35 * dirScore + 0.2 * periodScore + 0.1 * sizeScore;
  const finalScore = raw * (0.4 + 0.6 * tideScore);
  const score0to10 = Math.round(finalScore * 10 * 10) / 10;

  const reasons: string[] = [];
  if (windScore > 0.6) reasons.push("offshore or light winds");
  else if (windScore < 0.2) reasons.push("onshore/strong winds");
  if (dirScore > 0.6) reasons.push("favourable swell direction");
  else reasons.push("swell direction not ideal");
  if (periodScore > 0.6) reasons.push("good period");
  if (sizeScore > 0.8) reasons.push("solid size");

  return {
    score: score0to10,
    components: { windScore, dirScore, periodScore, sizeScore, tideScore },
    reasons,
  };
}
