// app/page.tsx
import React from "react";
import RadarCard from "./components/RadarCard";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-sky-800">
            Surf Forecast Radar
          </h1>
          <p className="text-gray-600 mt-1">
            A visual breakdown of conditions at Trigg Point (example). Data via
            Open-Meteo.
          </p>
        </header>

        {/* The main radar component */}
        <RadarCard />

        <footer className="mt-12 text-sm text-gray-500 text-center">
          Built as a learning project — all forecasts from Open-Meteo (free
          API).
        </footer>
      </div>
    </main>
  );
}
