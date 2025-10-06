// lib/spots.ts
export type BreakType = "beach" | "reef" | "point";

export type Spot = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  coastBearing: number; // shoreline normal the break "faces" (deg, 0=N)
  breakType: BreakType;
  // light metadata to improve ratings later
  swellDirMin: number; // acceptable swell window (deg, coming-from)
  swellDirMax: number;
  minTide?: number; // metres MSL (optional to start)
  idealTide?: number;
  maxTide?: number;
  minPeriod?: number; // seconds
  idealPeriod?: number;
  notes?: string;
};

export const spots: Spot[] = [
  {
    id: "cottesloe",
    name: "Cottesloe",
    lat: -31.994,
    lon: 115.751,
    coastBearing: 270,
    breakType: "beach",
    swellDirMin: 190,
    swellDirMax: 240,
    minPeriod: 8,
    idealPeriod: 13,
  },
  {
    id: "huzzas",
    name: "Huzzas",
    lat: -33.86419,
    lon: 114.980827,
    coastBearing: 270, // guess: the reef faces roughly west — you may refine
    breakType: "reef",
    swellDirMin: 240, // support W / WSW swells; you can widen/adjust
    swellDirMax: 300,
    minTide: 0.0, // you’ll calibrate with real tide data later
    idealTide: 0.5,
    maxTide: 1.5,
    minPeriod: 8,
    idealPeriod: 14,
    notes:
      "Reef; best on low-mid tide; SE winds favorable; both lefts & rights. Hazards: rocks & shallow reef.",
  },
  {
    id: "trigg",
    name: "Trigg Point",
    lat: -31.866,
    lon: 115.757,
    coastBearing: 270,
    breakType: "reef",
    swellDirMin: 200,
    swellDirMax: 245,
    minPeriod: 9,
    idealPeriod: 14,
  },
  {
    id: "redgate",
    name: "Redgate",
    lat: -34.045,
    lon: 115.046,
    coastBearing: 240,
    breakType: "beach",
    swellDirMin: 210,
    swellDirMax: 260,
    minPeriod: 9,
    idealPeriod: 15,
  },
];

export const getSpot = (id: string) => spots.find((s) => s.id === id);

export function getAllSpots() {
  return spots;
}
