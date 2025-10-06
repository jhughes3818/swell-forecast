"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";

type Spot = { id: string; name: string; lat: number; lon: number };

function Recenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}

/** Place an inward-pointing arrow on the map edge for a given 'coming-from' bearing. */
function EdgeArrow({
  centerLatLng,
  bearingFromDeg, // meteorological "from" direction
  color = "dodgerblue",
  paddingPx = 20, // how far inside the edge
  lengthPx = 60, // arrow shaft length
}: {
  centerLatLng: [number, number];
  bearingFromDeg: number;
  color?: string;
  paddingPx?: number;
  lengthPx?: number;
}) {
  const map = useMap();
  const [pos, setPos] = useState<L.LatLng | null>(null);

  // Make an inward pointing arrow. We rotate by +180 so it points toward the center.
  const icon = useMemo(
    () =>
      L.divIcon({
        html: `
      <div style="
        transform: rotate(${bearingFromDeg + 180}deg);
        width: 10px;
        height: ${lengthPx}px;
        background: ${color};
        position: relative;
      ">
        <div style="
          position: absolute;
          bottom: -8px;
          left: -6px;
          width: 0; height: 0;
          border-left: 12px solid transparent;
          border-right: 12px solid transparent;
          border-top: 12px solid ${color};
        "></div>
      </div>
    `,
        className: "",
        iconSize: [12, lengthPx],
        iconAnchor: [6, lengthPx / 2], // keep the shaft centered on the edge point
      }),
    [bearingFromDeg, color, lengthPx]
  );

  useEffect(() => {
    function recompute() {
      const size = map.getSize(); // pixel size of map viewport
      const centerPx = map.latLngToContainerPoint(centerLatLng);

      // Unit vector for the *from* direction (bearing clockwise from north)
      const theta = (bearingFromDeg * Math.PI) / 180;
      const vx = Math.sin(theta); // x right
      const vy = -Math.cos(theta); // y down (screen coords)

      // We want to go from center toward the edge, in the *from* direction,
      // so the ray is p(s) = centerPx - s * v, s >= 0.
      const w = size.x,
        h = size.y;

      const sCandidates: number[] = [];

      // Left edge x = paddingPx
      if (vx > 1e-6) sCandidates.push((centerPx.x - paddingPx) / vx);
      // Right edge x = w - paddingPx
      if (vx < -1e-6) sCandidates.push((w - paddingPx - centerPx.x) / -vx);
      // Top edge y = paddingPx
      if (vy > 1e-6) sCandidates.push((centerPx.y - paddingPx) / vy);
      // Bottom edge y = h - paddingPx
      if (vy < -1e-6) sCandidates.push((h - paddingPx - centerPx.y) / -vy);

      // Pick the smallest positive s (first edge hit)
      const s = Math.min(
        ...sCandidates.filter((x) => x >= 0 && Number.isFinite(x))
      );
      if (!Number.isFinite(s)) return; // no solution (shouldn't happen for non-zero v)

      const edgePx = L.point(centerPx.x - s * vx, centerPx.y - s * vy);
      const edgeLL = map.containerPointToLatLng(edgePx);
      setPos(edgeLL);
    }

    recompute();
    map.on("move zoom resize", recompute);
    return () => {
      map.off("move zoom resize", recompute);
    };
  }, [map, centerLatLng, bearingFromDeg, paddingPx]);

  if (!pos) return null;
  return <Marker position={pos} icon={icon} />;
}

export default function SpotMap({
  spot,
  windDeg,
  swellDeg,
}: {
  spot: Spot | null;
  windDeg?: number; // coming-from
  swellDeg?: number; // coming-from
}) {
  const center = useMemo<[number, number]>(
    () => [spot?.lat ?? 0, spot?.lon ?? 0],
    [spot]
  );
  if (!spot) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200">
      <MapContainer
        center={center}
        zoom={12}
        style={{ height: 400, width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Recenter center={center} />

        {/* Base spot marker */}
        <Marker position={center}>
          <Popup>{spot.name}</Popup>
        </Marker>

        {/* Edge arrows: always in view, pointing inward */}
        {typeof windDeg === "number" && (
          <EdgeArrow
            centerLatLng={center}
            bearingFromDeg={windDeg + 180}
            color="dodgerblue"
          />
        )}
        {typeof swellDeg === "number" && (
          <EdgeArrow
            centerLatLng={center}
            bearingFromDeg={swellDeg + 180}
            color="mediumseagreen"
          />
        )}
      </MapContainer>
    </div>
  );
}
