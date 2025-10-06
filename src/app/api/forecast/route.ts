// app/api/forecast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSpot } from "@/lib/spots";
import { fetchMarine } from "@/lib/openmeteo";
import { evaluateRating, type Weights } from "@/lib/rating";

// If you added the tiny TTL cache earlier, uncomment these:
// import { getCache, setCache } from '@/lib/cache';

export const dynamic = "force-dynamic";

// Accept weights either as CSV "wind:0.2,dir:0.3,period:0.1,size:0.3,tide:0.1"
// or as JSON via weights_json={"wind":0.2,...}
function parseWeights(searchParams: URLSearchParams): Weights | undefined {
  const jsonStr = searchParams.get("weights_json");
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch {
      // fall through to CSV
    }
  }

  const csv = searchParams.get("weights");
  if (!csv) return undefined;

  const out: Record<string, number> = {};
  for (const part of csv.split(",")) {
    const [kRaw, vRaw] = part.split(":").map((s) => s.trim());
    if (!kRaw || !vRaw) continue;
    const v = Number(vRaw);
    if (!Number.isFinite(v)) continue;
    // only accept known keys
    if (["wind", "dir", "period", "size", "tide"].includes(kRaw)) out[kRaw] = v;
  }
  return out as Weights;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const spotId = p.get("spot_id") || "";
  const weights = parseWeights(p);

  const spot = getSpot(spotId);
  if (!spot) {
    return NextResponse.json(
      { error: `Unknown spot_id='${spotId}'` },
      { status: 400 }
    );
  }

  // Optional caching (uncomment if using lib/cache):
  // const cacheKey = `forecast:${spot.id}:${JSON.stringify(weights ?? {})}`;
  // const cached = getCache<any>(cacheKey);
  // if (cached) return NextResponse.json(cached);

  try {
    const marine = await fetchMarine(spot.lat, spot.lon, "Australia/Perth");

    const hours = marine.map((pt) => {
      // Prefer swell-specific series; fall back to total if needed
      const hs = pt.swellHs ?? pt.hs ?? 0;
      const tp = pt.swellTp ?? pt.tp ?? 0;
      const dp = pt.swellDp ?? pt.dp ?? 0;
      const wind = pt.windMs ?? 0;
      const windDir = pt.windDir ?? 0;
      const tide = pt.seaLevel ?? undefined;

      const rated = evaluateRating(
        { hs, tp, dp, wind, windDir, tide, spot },
        weights
      );

      // Lightweight badges (optional)
      const badges: string[] = [];
      const offshoreDir = (spot.coastBearing + 180) % 360;
      const angDiff = (a: number, b: number) => {
        const d = Math.abs(a - b) % 360;
        return Math.min(d, 360 - d);
      };
      if (wind < 5 && angDiff(windDir, offshoreDir) > 90)
        badges.push("Light/offshore");
      if (tp >= (spot.idealPeriod ?? 13)) badges.push("Good period");
      if (hs < 0.6) badges.push("Small");
      if (hs > 2.5 && spot.breakType === "beach") badges.push("Big for beach");

      return {
        ts: pt.ts, // Local time per fetchMarine timezone
        raw: {
          hs,
          tp,
          dp,
          wind_ms: wind,
          wind_dir: windDir,
          water_c: pt.waterC,
          sea_level_m: pt.seaLevel,
        },
        components: rated.components, // [{id,label,score:0..1}, ...] (radar axes)
        aggregate: rated.aggregate, // {method:'geometric', score_0_10, weights} | null
        reasons: rated.reasons, // quick human explainer
        badges,
        source: "open-meteo:marine+weather",
      };
    });

    // Quick “today” summary over next 24 hours (aggregate or average component fill)
    const next24 = hours.slice(0, 24);
    const summary = {
      // If aggregate exists, show min/max; otherwise compute mean fill across axes
      aggregate_min: next24.reduce(
        (m, h) => Math.min(m, h.aggregate?.score_0_10 ?? 10),
        10
      ),
      aggregate_max: next24.reduce(
        (m, h) => Math.max(m, h.aggregate?.score_0_10 ?? 0),
        0
      ),
      mean_component_fill: (() => {
        const n = next24.length || 1;
        const sum = next24.reduce((acc, h) => {
          const c = h.components;
          const s = c.reduce((a, x) => a + x.score, 0) / (c.length || 1);
          return acc + s;
        }, 0);
        return Number((sum / n).toFixed(3)); // 0..1
      })(),
    };

    const payload = {
      spot: { id: spot.id, name: spot.name, lat: spot.lat, lon: spot.lon },
      meta: {
        timezone: "Australia/Perth",
        source: "Open-Meteo Marine + Weather",
        weights: weights ?? null, // echo back if provided
      },
      today_summary: summary,
      hours,
    };

    // Optional cache set:
    // setCache(cacheKey, payload, 30 * 60 * 1000);

    return NextResponse.json(payload);
  } catch (e: any) {
    // When Open-Meteo returns a 4xx/5xx, propagate a helpful message
    return NextResponse.json(
      { error: e?.message ?? "Failed to fetch forecast" },
      { status: 502 }
    );
  }
}
