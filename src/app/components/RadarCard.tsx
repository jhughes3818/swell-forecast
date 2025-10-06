"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  Tooltip as RadarTooltip,
} from "recharts";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as BarTooltip,
  Cell,
} from "recharts";

// -----------------------------------------------------------------------------
// RadarCard – Fetches /api/forecast?spot_id=trigg and renders:
// 1) A radar (snowflake) chart of component scores (0..1)
// 2) A colored hourly timeline (0..10) that controls the selected hour
// -----------------------------------------------------------------------------

type ComponentAxis = {
  id: "wind" | "dir" | "period" | "size" | "tide";
  label: string;
  score: number; // 0..1
};

type HourRow = {
  ts: string; // local time string (Australia/Perth)
  raw: {
    hs: number;
    tp: number;
    dp: number;
    wind_ms: number;
    wind_dir: number;
    water_c: number | null;
    sea_level_m: number | null;
  };
  derived: {
    breaking_m: number | null;
    breaking_ft: number | null;
  };
  components: ComponentAxis[];
  aggregate: {
    method: "geometric";
    score_0_10: number;
    weights: Record<string, number>;
  } | null;
  reasons: string[];
  badges?: string[];
  source: string;
};

type ApiPayload = {
  spot: { id: string; name: string; lat: number; lon: number };
  meta: {
    timezone: string;
    source: string;
    weights: Record<string, number> | null;
  };
  today_summary: any;
  hours: HourRow[];
};

type SpotSummary = { id: string; name: string; lat: number; lon: number };

// --- color helper: map overall 0..10 to red→yellow→green using HSL hue 0..120 ---
function colorFromScore(score0to10: number) {
  const s = Math.max(0, Math.min(10, score0to10));
  const hue = (s / 10) * 120; // 0 = red, 60 = yellow, 120 = green
  return `hsl(${hue} 85% 45%)`;
}

const fmtPct = (v: number) => `${Math.round(v * 100)}%`;

function formatHour(ts: string) {
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      hour: "2-digit",
    }).format(d);
  } catch {
    return ts;
  }
}

export default function RadarCard() {
  const [spots, setSpots] = useState<SpotSummary[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<string>("trigg");
  const [data, setData] = useState<ApiPayload | null>(null);
  const [idx, setIdx] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load spots list once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/spots", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = (await res.json()) as SpotSummary[];
        if (!cancelled) {
          setSpots(list);
          if (!list.find((s) => s.id === selectedSpot)) {
            setSelectedSpot(list[0]?.id ?? "trigg");
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch forecast for the selected spot
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/forecast?spot_id=${encodeURIComponent(selectedSpot)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ApiPayload;
        if (!cancelled) {
          setData(json);
          setIdx(0);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load forecast");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSpot]);

  const hour = useMemo(() => data?.hours?.[idx] ?? null, [data, idx]);

  const radarData = useMemo(() => {
    if (!hour) return [] as { axis: string; score: number }[];
    return hour.components.map((c) => ({
      axis: c.label,
      score: Math.max(0, Math.min(1, c.score)),
    }));
  }, [hour]);

  // Derive an overall 0..10 score for coloring. Use aggregate if present; otherwise mean of axes.
  const overall0to10 = useMemo(() => {
    if (!hour) return null as number | null;
    if (hour.aggregate && typeof hour.aggregate.score_0_10 === "number")
      return hour.aggregate.score_0_10;
    const mean =
      hour.components.reduce((a, c) => a + c.score, 0) /
      (hour.components.length || 1);
    return Math.round(mean * 10 * 10) / 10; // one decimal
  }, [hour]);

  const radarColor =
    overall0to10 != null ? colorFromScore(overall0to10) : "#0ea5e9";

  // Build timeline data (limit to 48h to keep it readable)
  const timeline = useMemo(() => {
    if (!data?.hours)
      return [] as {
        i: number;
        ts: string;
        hour: string;
        score: number;
        color: string;
      }[];
    const arr = data.hours.slice(0, 48).map((h, i) => {
      const sAgg = h.aggregate?.score_0_10;
      const sMean =
        (h.components.reduce((a, c) => a + c.score, 0) /
          (h.components.length || 1)) *
        10;
      const score = Math.round((sAgg ?? sMean) * 10) / 10; // 0..10, 1dp
      return {
        i,
        ts: h.ts,
        hour: formatHour(h.ts),
        score,
        color: colorFromScore(score),
      };
    });
    return arr;
  }, [data]);

  const canPrev = idx > 0;
  const canNext = data ? idx < data.hours.length - 1 : false;

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <div className="rounded-2xl shadow-md border border-gray-200 p-4 md:p-6 bg-white">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold">
              {data?.spot?.name ?? "Trigg Point"} – Conditions Radar
            </h2>
            <p className="text-sm text-gray-500">
              Source: {data?.meta?.source ?? "Open‑Meteo"} • TZ:{" "}
              {data?.meta?.timezone ?? "Australia/Perth"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Spot selector */}
            <label className="text-sm text-gray-600" htmlFor="spot-select">
              Spot
            </label>
            <select
              id="spot-select"
              className="px-2 py-1 text-sm border rounded-lg bg-white"
              value={selectedSpot}
              onChange={(e) => setSelectedSpot(e.target.value)}
            >
              {spots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* <button
              className={`px-3 py-1 rounded-xl border text-sm ${
                canPrev
                  ? "bg-gray-50 hover:bg-gray-100"
                  : "bg-gray-100 opacity-60 cursor-not-allowed"
              }`}
              onClick={() => canPrev && setIdx((i) => i - 1)}
              disabled={!canPrev}
              aria-label="Previous hour"
            >
              Prev
            </button>
            <div className="text-sm tabular-nums font-medium px-2">
              {hour ? new Date(hour.ts).toLocaleString() : "--"}
            </div>
            <button
              className={`px-3 py-1 rounded-xl border text-sm ${
                canNext
                  ? "bg-gray-50 hover:bg-gray-100"
                  : "bg-gray-100 opacity-60 cursor-not-allowed"
              }`}
              onClick={() => canNext && setIdx((i) => i + 1)}
              disabled={!canNext}
              aria-label="Next hour"
            >
              Next
            </button> */}
          </div>
        </div>

        {loading && (
          <div className="mt-8 text-center text-gray-500">
            Loading forecast…
          </div>
        )}
        {error && <div className="mt-6 text-red-600 text-sm">{error}</div>}

        {hour && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            {/* Radar chart */}
            <div className="h-80 md:h-96">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="80%">
                  <PolarGrid />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 12 }} />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 1]}
                    tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  />
                  <Radar
                    name="Quality"
                    dataKey="score"
                    stroke={radarColor}
                    fill={radarColor}
                    fillOpacity={0.35}
                  />
                  <RadarTooltip
                    formatter={(value: any) => fmtPct(Number(value))}
                  />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Details */}
            <div className="flex flex-col gap-3">
              <div className="rounded-xl bg-gray-50 p-3">
                <div className="text-sm text-gray-600 mb-1">Raw conditions</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Est. breaking size:</span>{" "}
                    {hour.derived?.breaking_ft?.toFixed(1)} ft
                    {hour.raw.hs != null && (
                      <span className="text-gray-400 ml-1 text-xs">
                        (offshore Hs {hour.raw.hs.toFixed(2)} m)
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">Swell period:</span>{" "}
                    {hour.raw.tp.toFixed(1)} s
                  </div>
                  <div>
                    <span className="text-gray-500">Swell dir:</span>{" "}
                    {Math.round(hour.raw.dp)}°
                  </div>
                  <div>
                    <span className="text-gray-500">Wind:</span>{" "}
                    {hour.raw.wind_ms.toFixed(1)} m/s (
                    {Math.round(hour.raw.wind_ms * 1.94384)} kt) @{" "}
                    {Math.round(hour.raw.wind_dir)}°
                  </div>
                  {hour.raw.sea_level_m != null && (
                    <div>
                      <span className="text-gray-500">Sea level:</span>{" "}
                      {hour.raw.sea_level_m.toFixed(2)} m
                    </div>
                  )}
                  {hour.raw.water_c != null && (
                    <div>
                      <span className="text-gray-500">Water temp:</span>{" "}
                      {hour.raw.water_c.toFixed(1)} °C
                    </div>
                  )}
                </div>
              </div>

              {hour.aggregate && (
                <div className="rounded-xl bg-gray-50 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-700">
                      Aggregate score (profile)
                    </div>
                    <div
                      className="text-2xl font-semibold"
                      style={{
                        color:
                          overall0to10 != null
                            ? colorFromScore(overall0to10)
                            : undefined,
                      }}
                    >
                      {hour.aggregate.score_0_10.toFixed(1)} / 10
                    </div>
                  </div>
                  <div className="text-xs text-gray-600">
                    weights:{" "}
                    {Object.entries(hour.aggregate.weights)
                      .map(([k, v]) => `${k}:${(v * 100).toFixed(0)}%`)
                      .join(" · ")}
                  </div>
                </div>
              )}

              {hour.badges && hour.badges.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {hour.badges.map((b, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 text-xs rounded-full bg-sky-100 text-sky-800 border border-sky-200"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              )}

              {hour.reasons && hour.reasons.length > 0 && (
                <ul className="list-disc list-inside text-sm text-gray-700">
                  {hour.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Timeline bar chart */}
        {timeline.length > 0 && (
          <div className="mt-8">
            <h3 className="text-lg font-semibold mb-3">
              Hourly timeline (next {timeline.length}h)
            </h3>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={timeline}
                  onMouseMove={(state: any) => {
                    const i: number | undefined = state?.activeTooltipIndex;
                    if (typeof i === "number" && !Number.isNaN(i)) setIdx(i);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" interval={3} tick={{ fontSize: 11 }} />
                  <YAxis
                    domain={[0, 10]}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v}`}
                  />
                  <BarTooltip
                    formatter={(v: any) => `${v} / 10`}
                    labelFormatter={(l: any) => String(l)}
                  />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                    {timeline.map((t, i) => (
                      <Cell
                        key={`cell-${i}`}
                        fill={t.color}
                        opacity={i === idx ? 1 : 0.75}
                        cursor="pointer"
                        onMouseEnter={() => setIdx(i)} // ← hover updates the radar
                        onClick={() => setIdx(i)} // click still works
                        onFocus={() => setIdx(i)} // keyboard/tab support
                        tabIndex={0}
                        role="button"
                        aria-label={`Hour ${t.hour} score ${t.score}`}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Hover or click bars to change the selected hour above.
            </div>
          </div>
        )}

        {!loading && !hour && !error && (
          <div className="mt-8 text-center text-gray-500">
            No data available.
          </div>
        )}
      </div>
    </div>
  );
}
