// lib/openmeteo.ts
// Marine waves/SST from Marine API, wind from Weather API, merged by timestamp.

type MarineJSON = {
  hourly: {
    time: string[];
    wave_height?: number[];
    wave_direction?: number[];
    wave_period?: number[];
    swell_wave_height?: number[];
    swell_wave_direction?: number[];
    swell_wave_period?: number[];
    wind_wave_height?: number[];
    wind_wave_direction?: number[];
    wind_wave_period?: number[];
    sea_surface_temperature?: number[];
    sea_level_height_msl?: number[];
  };
};

type WeatherJSON = {
  hourly_units?: { wind_speed_10m?: string; wind_direction_10m?: string };
  hourly: {
    time: string[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
};

export type MarinePoint = {
  ts: string; // e.g. "2025-10-06T03:00"
  hs: number | null;
  tp: number | null;
  dp: number | null;
  swellHs: number | null;
  swellTp: number | null;
  swellDp: number | null;
  windMs: number | null;
  windDir: number | null;
  waterC: number | null; // sea_surface_temperature
  seaLevel: number | null;
};

const j = <T>(arr: T[] | undefined, i: number): T | null =>
  arr && arr.length > i && arr[i] != null ? (arr[i] as any) : null;

export async function fetchMarine(
  lat: number,
  lon: number,
  timezone = "Australia/Perth"
): Promise<MarinePoint[]> {
  // 1) Marine API (waves + SST + sea level)
  const marineParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: [
      "wave_height",
      "wave_direction",
      "wave_period",
      "swell_wave_height",
      "swell_wave_direction",
      "swell_wave_period",
      "wind_wave_height",
      "wind_wave_direction",
      "wind_wave_period",
      "sea_surface_temperature",
      "sea_level_height_msl",
    ].join(","),
    timezone,
    forecast_days: "7",
    cell_selection: "sea",
  });

  const marineURL = `https://marine-api.open-meteo.com/v1/marine?${marineParams.toString()}`;
  const marineRes = await fetch(marineURL, { next: { revalidate: 60 * 30 } });
  if (!marineRes.ok) throw new Error(`Open-Meteo error ${marineRes.status}`);
  const m = (await marineRes.json()) as MarineJSON;

  const times = m.hourly.time;

  // 2) Weather API (wind at 10m) — queried for the same horizon & timezone
  const weatherParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: ["wind_speed_10m", "wind_direction_10m"].join(","),
    timezone,
    forecast_days: "7",
  });
  const weatherURL = `https://api.open-meteo.com/v1/forecast?${weatherParams.toString()}`;
  const weatherRes = await fetch(weatherURL, { next: { revalidate: 60 * 30 } });
  if (!weatherRes.ok) throw new Error(`Open-Meteo error ${weatherRes.status}`);
  const w = (await weatherRes.json()) as WeatherJSON;

  const unit = w.hourly_units?.wind_speed_10m ?? "km/h";
  function toMs(value: number | null): number | null {
    if (value == null) return null;
    switch (unit) {
      case "m/s":
        return value;
      case "km/h":
        return value / 3.6;
      case "mph":
        return value * 0.44704;
      case "kn":
        return value * 0.514444;
      default:
        return value; // assume m/s if unknown
    }
  }

  // Build a lookup for wind by timestamp
  const windIndex = new Map<
    string,
    { windMs: number | null; windDir: number | null }
  >();
  for (let i = 0; i < (w.hourly.time?.length ?? 0); i++) {
    windIndex.set(w.hourly.time[i], {
      windMs: toMs(w.hourly.wind_speed_10m?.[i] ?? null),
      windDir: w.hourly.wind_direction_10m?.[i] ?? null,
    });
  }

  // Merge marine rows + wind
  const out: MarinePoint[] = [];
  for (let i = 0; i < times.length; i++) {
    const ts = times[i];
    const wind = windIndex.get(ts);

    out.push({
      ts,
      hs: j(m.hourly.wave_height, i),
      tp: j(m.hourly.wave_period, i),
      dp: j(m.hourly.wave_direction, i),
      swellHs: j(m.hourly.swell_wave_height, i),
      swellTp: j(m.hourly.swell_wave_period, i),
      swellDp: j(m.hourly.swell_wave_direction, i),
      windMs: wind?.windMs ?? null,
      windDir: wind?.windDir ?? null,
      waterC: j(m.hourly.sea_surface_temperature, i),
      seaLevel: j(m.hourly.sea_level_height_msl, i),
    });
  }

  // --- keep only from the start of the *current hour* in the requested timezone, next 48h ---
  function currentHourISOInTZ(tz: string) {
    // Build "YYYY-MM-DDTHH:00" in the given IANA timezone
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (t: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === t)?.value!;
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:00`;
  }

  const startTs = currentHourISOInTZ(timezone); // timezone is the param you already pass to fetchMarine
  // Open-Meteo returns "YYYY-MM-DDTHH:MM" in that same timezone → lexicographic compare is safe
  const next48 = out.filter((row) => row.ts >= startTs).slice(0, 48);

  return next48;

  return out;
}
