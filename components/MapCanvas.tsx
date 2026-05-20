"use client";

import {
  DrawingManager,
  GoogleMap,
  Marker,
  Polygon,
  useJsApiLoader,
} from "@react-google-maps/api";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
} from "@/lib/maps";
import type { LatLng } from "@/lib/types";

export interface PolygonGeometry {
  /** Polygon vertices, ordered. Last vertex is implicitly closed back to the first. */
  coords: LatLng[];
  /** Spherical area in square meters (canonical Firestore value). */
  areaSqMeters: number;
  /** Closed-loop perimeter in meters (canonical Firestore value). */
  perimeterMeters: number;
}

interface MapCanvasProps {
  /** Initial map center (job's saved lat/lng). */
  center: LatLng;
  /** Initial polygon vertices. Empty array => render `DrawingManager` instead. */
  initialPath: LatLng[];
  /**
   * Fires on every edit/drag/draw. The parent owns persistence (Firestore
   * auto-save) and any debouncing — this component intentionally stays
   * stateless about Firestore.
   */
  onChange: (next: PolygonGeometry) => void;
  zoom?: number;
}

const MAP_CONTAINER_STYLE = { width: "100%", height: "100%" } as const;

const POLYGON_STYLE: google.maps.PolygonOptions = {
  fillColor: "#131313",
  fillOpacity: 0.18,
  strokeColor: "#131313",
  strokeOpacity: 0.95,
  strokeWeight: 2,
};

function toLiterals(path: google.maps.MVCArray<google.maps.LatLng>): LatLng[] {
  return path.getArray().map((p) => ({ lat: p.lat(), lng: p.lng() }));
}

function measure(coords: LatLng[]): {
  areaSqMeters: number;
  perimeterMeters: number;
} {
  if (coords.length < 3) {
    return { areaSqMeters: 0, perimeterMeters: 0 };
  }
  const spherical = google.maps.geometry.spherical;
  const areaSqMeters = Math.abs(spherical.computeArea(coords));
  // `computeLength` does not close the path; append the first vertex so we
  // get the polygon's true perimeter rather than an open polyline length.
  const perimeterMeters = spherical.computeLength([...coords, coords[0]]);
  return { areaSqMeters, perimeterMeters };
}

export function MapCanvas({
  center,
  initialPath,
  onChange,
  zoom = 20,
}: MapCanvasProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  /**
   * Seed path used to mount the `<Polygon>`. After the polygon mounts, its
   * internal MVCArray is the source of truth — we deliberately avoid feeding
   * edited coords back into the `path` prop because the library calls
   * `polygon.setPath` on every prop change, which would create a feedback
   * loop with our `set_at`/`insert_at` listeners. The seed only changes when
   * the user finishes drawing a brand-new polygon (`handlePolygonComplete`),
   * never on subsequent edits.
   */
  const [seedPath, setSeedPath] = useState<LatLng[]>(initialPath);
  const [hasPolygon, setHasPolygon] = useState(initialPath.length > 0);

  // Stable map center: prevents the GoogleMap from snapping back to the prop
  // value while the user pans/zooms the canvas.
  const stableCenter = useMemo<google.maps.LatLngLiteral>(
    () => ({ lat: center.lat, lng: center.lng }),
    [center.lat, center.lng],
  );

  const mapOptions = useMemo<google.maps.MapOptions>(
    () => ({
      mapTypeId: "satellite",
      tilt: 0,
      disableDefaultUI: true,
      clickableIcons: false,
      keyboardShortcuts: false,
      rotateControl: false,
      gestureHandling: "greedy",
    }),
    [],
  );

  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const listenersRef = useRef<google.maps.MapsEventListener[]>([]);

  const emitFromPolygon = useCallback(() => {
    const polygon = polygonRef.current;
    if (!polygon) return;
    const coords = toLiterals(polygon.getPath());
    const { areaSqMeters, perimeterMeters } = measure(coords);
    onChange({ coords, areaSqMeters, perimeterMeters });
  }, [onChange]);

  const handlePolygonLoad = useCallback(
    (polygon: google.maps.Polygon) => {
      polygonRef.current = polygon;
      const path = polygon.getPath();
      listenersRef.current = [
        path.addListener("set_at", emitFromPolygon),
        path.addListener("insert_at", emitFromPolygon),
        path.addListener("remove_at", emitFromPolygon),
      ];
    },
    [emitFromPolygon],
  );

  const handlePolygonUnmount = useCallback(() => {
    listenersRef.current.forEach((l) => l.remove());
    listenersRef.current = [];
    polygonRef.current = null;
  }, []);

  const handlePolygonComplete = useCallback(
    (polygon: google.maps.Polygon) => {
      // Snapshot the freshly drawn shape, then strip the DrawingManager's
      // throwaway polygon from the map — our controlled <Polygon> will
      // re-render the same geometry as an editable/draggable surface.
      const coords = toLiterals(polygon.getPath());
      polygon.setMap(null);
      setSeedPath(coords);
      setHasPolygon(true);
      const { areaSqMeters, perimeterMeters } = measure(coords);
      onChange({ coords, areaSqMeters, perimeterMeters });
    },
    [onChange],
  );

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center border border-line bg-mist">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
          Map failed to load
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center border border-line bg-mist">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
          Loading canvas…
        </p>
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={stableCenter}
      zoom={zoom}
      options={mapOptions}
    >
      {hasPolygon ? (
        <Polygon
          path={seedPath}
          editable
          draggable
          options={POLYGON_STYLE}
          onLoad={handlePolygonLoad}
          onUnmount={handlePolygonUnmount}
          onMouseUp={emitFromPolygon}
          onDragEnd={emitFromPolygon}
        />
      ) : (
        <>
          <Marker position={stableCenter} />
          <DrawingManager
            onPolygonComplete={handlePolygonComplete}
            options={{
              drawingControl: false,
              drawingMode: google.maps.drawing.OverlayType.POLYGON,
              polygonOptions: {
                ...POLYGON_STYLE,
                editable: true,
                draggable: true,
              },
            }}
          />
        </>
      )}
    </GoogleMap>
  );
}
