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
};

export const SPOTS: Spot[] = [
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

export const getSpot = (id: string) => SPOTS.find((s) => s.id === id);
