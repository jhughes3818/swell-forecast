// app/api/forecast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSpot } from "@/lib/spots";
import { fetchMarine } from "@/lib/openmeteo";
import { evaluateRating, type Weights } from "@/lib/rating";
import { tzFor } from "@/lib/timezone";
// import { getCache, setCache } from '@/lib/cache'; // optional

export const dynamic = "force-dynamic";

function parseWeights(searchParams: URLSearchParams): Weights | undefined {
  const json = searchParams.get("weights_json");
  if (json) {
    try {
      return JSON.parse(json);
    } catch {}
  }
  const csv = searchParams.get("weights");
  if (!csv) return;
  const out: Record<string, number> = {};
  for (const part of csv.split(",")) {
    const [k, v] = part.split(":").map((s) => s.trim());
    if (!k || v == null) continue;
    const n = Number(v);
    if (
      Number.isFinite(n) &&
      ["wind", "dir", "period", "size", "tide"].includes(k)
    )
      out[k] = n;
  }
  return out as Weights;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const spotId = p.get("spot_id") || "";
  const weights = parseWeights(p);

  const spot = getSpot(spotId);
  if (!spot)
    return NextResponse.json(
      { error: `Unknown spot_id='${spotId}'` },
      { status: 400 }
    );

  // 1) Timezone: override via ?tz=..., else derive from coords
  const tz = p.get("tz") || tzFor(spot.lat, spot.lon);

  // Optional cache:
  // const cacheKey = `forecast:${spot.id}:${tz}:${JSON.stringify(weights ?? {})}`;
  // const cached = getCache<any>(cacheKey); if (cached) return NextResponse.json(cached);

  try {
    // 2) Fetch in that timezone (open-meteo returns local times)
    const marine = await fetchMarine(spot.lat, spot.lon, tz);

    // 3) Map to radar-friendly rows
    const hours = marine.map((pt) => {
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

      // small badges, optional
      const offshoreDir = (spot.coastBearing + 180) % 360;
      const angDiff = (a: number, b: number) => {
        const d = Math.abs(a - b) % 360;
        return Math.min(d, 360 - d);
      };
      const badges: string[] = [];
      if (wind < 5 && angDiff(windDir, offshoreDir) > 90)
        badges.push("Light/offshore");
      if (tp >= (spot.idealPeriod ?? 13)) badges.push("Good period");
      if (hs < 0.6) badges.push("Small");
      if (hs > 2.5 && spot.breakType === "beach") badges.push("Big for beach");

      return {
        ts: pt.ts,
        raw: {
          hs,
          tp,
          dp,
          wind_ms: wind,
          wind_dir: windDir,
          water_c: pt.waterC,
          sea_level_m: pt.seaLevel,
        },
        components: rated.components,
        aggregate: rated.aggregate,
        reasons: rated.reasons,
        badges,
        source: "open-meteo:marine+weather",
      };
    });

    // Summary for the next 24 hours
    const next24 = hours.slice(0, 24);
    const summary = {
      aggregate_min: next24.reduce(
        (m, h) => Math.min(m, h.aggregate?.score_0_10 ?? 10),
        10
      ),
      aggregate_max: next24.reduce(
        (m, h) => Math.max(m, h.aggregate?.score_0_10 ?? 0),
        0
      ),
      mean_component_fill: Number(
        (
          next24.reduce(
            (acc, h) =>
              acc +
              h.components.reduce((a, x) => a + x.score, 0) /
                (h.components.length || 1),
            0
          ) / (next24.length || 1)
        ).toFixed(3)
      ),
    };

    const payload = {
      spot: { id: spot.id, name: spot.name, lat: spot.lat, lon: spot.lon },
      meta: {
        timezone: tz, // ✅ echo the resolved timezone
        source: "Open-Meteo Marine + Weather",
        weights: weights ?? null,
        window: { start: hours[0]?.ts ?? null, hours: hours.length }, // optional
      },
      today_summary: summary,
      hours,
    };

    // setCache(cacheKey, payload, 30 * 60 * 1000);
    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to fetch forecast" },
      { status: 502 }
    );
  }
}
