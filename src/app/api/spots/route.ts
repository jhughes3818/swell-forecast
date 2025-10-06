// app/api/spots/route.ts
import { NextResponse } from "next/server";
import { getAllSpots } from "@/lib/spots";

export async function GET() {
  const spots = getAllSpots().map((s) => ({
    id: s.id,
    name: s.name,
    lat: s.lat,
    lon: s.lon,
  }));
  return NextResponse.json(spots);
}
