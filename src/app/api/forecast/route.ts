// app/api/forecast/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSpot } from "@/lib/spots";
import { fetchMarine } from "@/lib/openmeteo";
import { scoreForecast } from "@/lib/rating";

export const dynamic = "force-dynamic"; // ensure it runs server-side each time (or rely on fetch cache)

export async function GET(req: NextRequest) {
  const spotId = req.nextUrl.searchParams.get("spot_id") || "";
  const spot = getSpot(spotId);
  if (!spot) {
    return NextResponse.json(
      { error: `Unknown spot_id='${spotId}'` },
      { status: 400 }
    );
  }

  try {
    const marine = await fetchMarine(spot.lat, spot.lon, "Australia/Perth");

    // Compute an hourly rating based on *swell* (fallback to total wave if swell missing)
    const rows = marine.map((pt) => {
      const hs = pt.swellHs ?? pt.hs ?? 0;
      const tp = pt.swellTp ?? pt.tp ?? 0;
      const dp = pt.swellDp ?? pt.dp ?? 0;
      const wind = pt.windMs ?? 0;
      const windDir = pt.windDir ?? 0;

      const { score, components, reasons } = scoreForecast({
        hs,
        tp,
        dp,
        wind,
        windDir,
        spot,
      });

      return {
        ts: pt.ts,
        hs: pt.swellHs ?? pt.hs ?? 0,
        tp: pt.swellTp ?? pt.tp ?? 0,
        dp: pt.swellDp ?? pt.dp ?? 0,
        wind_ms: pt.windMs ?? 0,
        wind_dir: pt.windDir ?? 0,
        water_c: pt.waterC,
        sea_level_m: pt.seaLevel,
        score,
        components,
        reasons,
        source: "open-meteo:marine+weather",
      };
    });

    // A concise header and the full timeseries
    const summary = rows.slice(0, 24).reduce(
      (acc, r) => {
        acc.maxScore = Math.max(acc.maxScore, r.score);
        acc.minScore = Math.min(acc.minScore, r.score);
        return acc;
      },
      { minScore: 10, maxScore: 0 }
    );

    return NextResponse.json({
      spot: { id: spot.id, name: spot.name, lat: spot.lat, lon: spot.lon },
      meta: { timezone: "Australia/Perth", source: "Open-Meteo Marine" },
      today_summary: summary,
      hours: rows,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to fetch forecast" },
      { status: 502 }
    );
  }
}
