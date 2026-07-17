"use client";

import {
  DrawingManager,
  GoogleMap,
  Marker,
  Polygon,
  useJsApiLoader,
} from "@react-google-maps/api";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_API_VERSION,
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

/** Imperative escape-hatch for actions that aren't naturally expressed as
 *  prop changes. Used for destructive "wipe everything" and for hard
 *  re-seeding when the AI pipeline pushes a fresh boundary mask in. */
export interface MapCanvasHandle {
  /** Drop every polygon, dismiss any pending vertex-delete affordance, and
   *  emit an empty geometry list so the parent can persist the cleared state. */
  clearAll: () => void;
  /**
   * Discard the currently-mounted polygons and re-seed the canvas with the
   * provided paths. Used when an out-of-band write (e.g. n8n posting the
   * AI-detected boundary mask) replaces the user's drawing with server-side
   * truth. Does NOT emit `onChange` — the parent already has the canonical
   * paths from Firestore.
   */
  replacePolygons: (paths: LatLng[][]) => void;
}

interface MapCanvasProps {
  /** Initial map center (job's saved lat/lng). */
  center: LatLng;
  /** One sub-array per polygon. Empty array → blank canvas. */
  initialPaths: LatLng[][];
  /**
   * Controlled drawing toggle. When `true` the DrawingManager is in POLYGON
   * mode and the next tap drops vertex 1 of a new polygon. The component
   * never auto-arms — the parent owns the toggle so the "Add polygon"
   * button can render its on/off state without state duplication.
   */
  drawArmed: boolean;
  /**
   * Fires when the canvas itself decides to disarm draw mode (today: after
   * the user finishes a polygon). The parent should mirror the value back
   * onto `drawArmed` so the prop stays consistent with the underlying
   * DrawingManager.
   */
  onDrawArmedChange: (next: boolean) => void;
  /**
   * Fires on every edit/drag/draw/vertex-delete/clear. The parent owns
   * persistence (Firestore auto-save) and any debouncing — this component
   * intentionally stays stateless about Firestore.
   */
  onChange: (next: PolygonGeometry[]) => void;
  /**
   * When `true`, the canvas freezes: polygons stop being editable/draggable,
   * vertex taps are ignored (no red-X badge), and the DrawingManager is
   * disarmed regardless of `drawArmed`. Used while the AI pipeline is
   * running (`status === 'processing'`) so the user can't tweak the input
   * mid-flight or fight with the inbound boundary write.
   */
  locked?: boolean;
  zoom?: number;
}

/**
 * Earlier the GoogleMap div used `width:100%; height:100%`, which depended on
 * every ancestor in the flex chain resolving to a real height. If any link in
 * that chain collapses (Tailwind v4 reset quirks, a non-flex provider div, a
 * browser still computing layout when Maps initializes) the map mounts at 0×0
 * and Google silently renders nothing — no console error, no network errors,
 * just a blank canvas. Absolute positioning removes that dependency: as long
 * as the *positioning ancestor* (the wrapper marked `relative` in the job
 * page) has pixels, the map fills it edge-to-edge.
 */
const MAP_CONTAINER_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

const POLYGON_STYLE: google.maps.PolygonOptions = {
  fillColor: "#131313",
  fillOpacity: 0.18,
  strokeColor: "#131313",
  strokeOpacity: 0.95,
  strokeWeight: 2,
};

/** Inline SVG (data URL) used for the red X badge that appears next to a
 *  vertex pending deletion. White border + white glyph keeps it readable
 *  against satellite imagery; the size (36×36) is sized for finger taps. */
const DELETE_BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <circle cx="18" cy="18" r="14" fill="#dc2626" stroke="#ffffff" stroke-width="2"/>
  <path d="M13 13l10 10M23 13l-10 10" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
</svg>`;
const DELETE_BADGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  DELETE_BADGE_SVG,
)}`;

/** Internal record. `id` is stable across renders so React reconciles the
 *  same `<Polygon>` and our refs/listeners maps stay aligned. `seedPath`
 *  feeds the polygon at mount time only — once mounted the polygon's
 *  internal MVCArray is the source of truth for vertex positions. */
type PolygonRecord = { id: string; seedPath: LatLng[] };

/** Tracks a vertex that the user has tapped once. The X badge renders at
 *  `position`; tapping the badge calls confirmDelete using `polygonId` +
 *  `vertexIdx` to pick out the right vertex on the right polygon. */
type PendingDelete = {
  polygonId: string;
  vertexIdx: number;
  position: LatLng;
};

function nextPolygonId(): string {
  return `poly-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

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

function geometryFor(coords: LatLng[]): PolygonGeometry {
  return { coords, ...measure(coords) };
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(
  function MapCanvas(
    {
      center,
      initialPaths,
      drawArmed,
      onDrawArmedChange,
      onChange,
      locked = false,
      zoom = 20,
    },
    ref,
  ) {
    const { isLoaded, loadError } = useJsApiLoader({
      id: GOOGLE_MAPS_LOADER_ID,
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
      version: GOOGLE_MAPS_API_VERSION,
      libraries: GOOGLE_MAPS_LIBRARIES,
    });

    /**
     * Mounted polygons. Seeded once from the parent's saved paths; thereafter
     * appended on draw-complete and filtered on clear / vertex-tap-removal.
     * We deliberately avoid feeding edited coords back into the `path` prop
     * because the library calls `polygon.setPath` on every prop change, which
     * would create a feedback loop with our `set_at`/`insert_at` listeners.
     */
    const [polygons, setPolygons] = useState<PolygonRecord[]>(() =>
      initialPaths
        .filter((p) => p.length >= 3)
        .map((seedPath) => ({ id: nextPolygonId(), seedPath })),
    );

    /**
     * Two-step vertex delete state. Tap a vertex once → this populates and
     * the X badge appears. Tap the X → vertex is removed. Tap anywhere else
     * (or drag, or arm draw mode) → this clears and the X disappears.
     */
    const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
      null,
    );

    // Mirror of `drawArmed` accessible from event-listener closures registered
    // at polygon-mount time. Used to suppress the vertex-tap-X affordance
    // while the user is busy drawing a new polygon — a misplaced tap on an
    // existing vertex shouldn't pop a delete prompt mid-draw.
    const drawArmedRef = useRef(drawArmed);
    useEffect(() => {
      drawArmedRef.current = drawArmed;
    }, [drawArmed]);

    // Same trick for `locked`. Path/click listeners registered at mount time
    // need to check the latest value, not a stale snapshot from when the
    // polygon first loaded.
    const lockedRef = useRef(locked);
    useEffect(() => {
      lockedRef.current = locked;
    }, [locked]);

    // Refs map keyed by polygon id. Synchronously written from polygon
    // load/unmount so callers (clearAll, vertex-delete, draw-complete) can
    // reason about "what's currently mounted" without waiting for a render.
    const polygonRefs = useRef<Map<string, google.maps.Polygon>>(new Map());
    const listenerRefs = useRef<
      Map<string, google.maps.MapsEventListener[]>
    >(new Map());

    // Latest callback identities held in refs so listener closures registered
    // on first mount don't go stale when the parent re-renders.
    const onChangeRef = useRef(onChange);
    useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);
    const onDrawArmedChangeRef = useRef(onDrawArmedChange);
    useEffect(() => {
      onDrawArmedChangeRef.current = onDrawArmedChange;
    }, [onDrawArmedChange]);

    /**
     * Build the current geometry from every mounted polygon's MVCArray and
     * emit. Synchronous — callers may mutate `polygonRefs.current` (e.g.
     * delete a removed polygon) immediately before invoking, and the emitted
     * snapshot will reflect the post-mutation state.
     *
     * Also clears any pending vertex-delete: if the path has changed (drag,
     * insert, remove) the X badge's vertex index could now point at a
     * different vertex, and the user's "consider deleting" intent has been
     * superseded by an actual edit.
     */
    const emitAll = useCallback(() => {
      const all: PolygonGeometry[] = [];
      polygonRefs.current.forEach((polygon) => {
        all.push(geometryFor(toLiterals(polygon.getPath())));
      });
      onChangeRef.current(all);
      setPendingDelete(null);
    }, []);

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

    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapInstanceRef = useRef<google.maps.Map | null>(null);
    const drawingManagerRef =
      useRef<google.maps.drawing.DrawingManager | null>(null);

    /**
     * One-shot diagnostic. The Cursor terminal pipes the dev browser console
     * back through Next, so this `console.info` lands in the dev terminal.
     * If `width` or `height` is 0 we have proof that the container is
     * collapsing and the layout (not CSP, not the API key) is the culprit.
     */
    useEffect(() => {
      if (!isLoaded) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      console.info(
        "[MapCanvas] container size:",
        Math.round(rect.width),
        "x",
        Math.round(rect.height),
        "center:",
        stableCenter,
      );
    }, [isLoaded, stableCenter]);

    /** Drop a polygon's listeners + ref entries. The library handles the
     *  underlying overlay teardown via the polygon component's own
     *  componentWillUnmount, so we only need to clean up *our* bookkeeping. */
    const teardownPolygon = useCallback((id: string) => {
      const listeners = listenerRefs.current.get(id);
      if (listeners) {
        listeners.forEach((l) => l.remove());
        listenerRefs.current.delete(id);
      }
      polygonRefs.current.delete(id);
    }, []);

    const handlePolygonLoad = useCallback(
      (id: string, polygon: google.maps.Polygon) => {
        polygonRefs.current.set(id, polygon);
        const path = polygon.getPath();
        const fire = () => emitAll();
        listenerRefs.current.set(id, [
          path.addListener("set_at", fire),
          path.addListener("insert_at", fire),
          path.addListener("remove_at", fire),
        ]);
      },
      [emitAll],
    );

    const handlePolygonUnmount = useCallback(
      (id: string) => {
        teardownPolygon(id);
      },
      [teardownPolygon],
    );

    /**
     * Polygon `click` event router. Maps fires `click` only for non-drag
     * taps (mouse-press → release without movement, or a touch tap), so a
     * drag of a vertex never reaches us here — drags fire `set_at` on the
     * path and flow through `emitAll` instead.
     *
     *  - Tap on a vertex handle (`e.vertex` set): arm a delete-pending
     *    state; the X badge will appear next to that vertex on next render.
     *  - Tap on the polygon body or an edge midpoint (`e.vertex` null):
     *    the user is "tapping outside the X" → dismiss any pending delete.
     *
     * While the parent has draw mode armed (mid-draw of a new polygon) we
     * suppress both behaviors: stray taps on existing polygons shouldn't
     * inject a delete affordance into the user's drawing flow.
     */
    const handlePolygonClick = useCallback(
      (id: string, event: google.maps.MapMouseEvent) => {
        // Locked canvases (e.g. while the AI pipeline is running) ignore
        // every click so the user can't accidentally mutate the boundary
        // mask we just sent over the wire.
        if (lockedRef.current) return;
        if (drawArmedRef.current) return;
        const e = event as google.maps.MapMouseEvent & {
          vertex?: number;
          edge?: number;
        };
        if (e.vertex == null) {
          setPendingDelete(null);
          return;
        }
        const polygon = polygonRefs.current.get(id);
        if (!polygon) return;
        const vertex = polygon.getPath().getAt(e.vertex);
        if (!vertex) return;
        setPendingDelete({
          polygonId: id,
          vertexIdx: e.vertex,
          position: { lat: vertex.lat(), lng: vertex.lng() },
        });
      },
      [],
    );

    /**
     * Confirm step of the two-tap delete. Triggered when the user taps the
     * red X badge. If the polygon would be left below 3 vertices we tear
     * the entire polygon down — an editable shape with two vertices is
     * degenerate and Maps would render it as a line.
     */
    const confirmVertexDelete = useCallback(() => {
      const target = pendingDelete;
      if (!target) return;
      const polygon = polygonRefs.current.get(target.polygonId);
      if (!polygon) {
        setPendingDelete(null);
        return;
      }
      const path = polygon.getPath();
      if (path.getLength() <= 3) {
        teardownPolygon(target.polygonId);
        setPolygons((prev) => prev.filter((p) => p.id !== target.polygonId));
        emitAll();
        return;
      }
      // `removeAt` fires the `remove_at` listener, which calls emitAll, which
      // also clears `pendingDelete`. No need to clear it here.
      path.removeAt(target.vertexIdx);
    }, [pendingDelete, emitAll, teardownPolygon]);

    /** Tap on the empty map background (or any non-polygon, non-marker area)
     *  dismisses the pending delete. While draw mode is armed the map is
     *  consumed by the DrawingManager for vertex placement — `setPendingDelete`
     *  is a safe no-op there because no delete can be pending in that mode. */
    const handleMapClick = useCallback(() => {
      setPendingDelete(null);
    }, []);

    const handleDrawingManagerLoad = useCallback(
      (manager: google.maps.drawing.DrawingManager) => {
        drawingManagerRef.current = manager;
      },
      [],
    );

    const handleDrawingManagerUnmount = useCallback(() => {
      drawingManagerRef.current = null;
    }, []);

    const handlePolygonComplete = useCallback(
      (polygon: google.maps.Polygon) => {
        // Snapshot the freshly drawn shape, then strip the DrawingManager's
        // throwaway polygon — our controlled <Polygon> below will re-render
        // the same geometry as an editable/draggable surface.
        const coords = toLiterals(polygon.getPath());
        polygon.setMap(null);

        // Disarm immediately on the underlying manager so the next tap
        // doesn't start vertex 1 of yet another polygon. The prop sync
        // below would catch this on the next render too, but flipping the
        // mode synchronously closes the racy gap.
        drawingManagerRef.current?.setDrawingMode(null);
        // Bubble the disarm out to the parent so its toggle button reflects
        // the new state and the prop stays consistent.
        onDrawArmedChangeRef.current(false);

        if (coords.length < 3) {
          // Degenerate completion (the user double-clicked before placing
          // three vertices). Don't add the shape; just resync totals.
          emitAll();
          return;
        }

        const newId = nextPolygonId();
        setPolygons((prev) => [...prev, { id: newId, seedPath: coords }]);

        // Emit immediately so the bottom dock totals update without waiting
        // for the new <Polygon>'s onLoad. The new polygon isn't in the refs
        // map yet, so we synthesize the snapshot manually: every existing
        // polygon's live coords plus the freshly drawn ones.
        const snapshot: PolygonGeometry[] = [];
        polygonRefs.current.forEach((p) => {
          snapshot.push(geometryFor(toLiterals(p.getPath())));
        });
        snapshot.push(geometryFor(coords));
        onChangeRef.current(snapshot);
      },
      [emitAll],
    );

    /**
     * Sync the underlying DrawingManager with the controlled `drawArmed`
     * prop. The `drawingMode` prop also flows through to the library, but
     * historic versions of `@react-google-maps/api` have been observed to
     * ignore post-mount changes to that prop. Calling `setDrawingMode`
     * directly is idempotent and guarantees the cursor matches our state.
     *
     * Arming draw mode also dismisses any pending vertex-delete: those two
     * affordances are mutually exclusive — a stray tap mid-draw shouldn't
     * leave a stale X badge floating over an old polygon. A locked canvas
     * forcibly disarms regardless of the parent's intent.
     */
    const effectiveDrawArmed = drawArmed && !locked;
    useEffect(() => {
      const manager = drawingManagerRef.current;
      if (manager && isLoaded) {
        manager.setDrawingMode(
          effectiveDrawArmed ? google.maps.drawing.OverlayType.POLYGON : null,
        );
      }
      if (effectiveDrawArmed) {
        setPendingDelete(null);
      }
    }, [effectiveDrawArmed, isLoaded]);

    // Locking the canvas also dismisses any pending X badge — that
    // affordance only makes sense while the user is free to edit.
    useEffect(() => {
      if (locked) setPendingDelete(null);
    }, [locked]);

    useImperativeHandle(
      ref,
      () => ({
        clearAll: () => {
          setPolygons([]);
          setPendingDelete(null);
          // Polygons unmount on next render — handlePolygonUnmount cleans
          // listeners + refs for each id. Emit empty totals immediately so
          // the dock and the parent's auto-save see a fresh snapshot.
          onChangeRef.current([]);
        },
        replacePolygons: (paths: LatLng[][]) => {
          // React unmounts the old <Polygon> elements (different ids) on
          // the next render, and their componentWillUnmount triggers
          // handlePolygonUnmount → teardownPolygon, which cleans up the
          // listeners and refs.
          setPendingDelete(null);
          const cleanPaths = paths.filter((p) => p.length >= 3);
          setPolygons(
            cleanPaths.map((seedPath) => ({
              id: nextPolygonId(),
              seedPath,
            })),
          );
          // Emit recomputed totals synchronously so the dock + auto-save
          // reflect the new mask without waiting for the next user touch.
          // Guard on `google.maps.geometry` being loaded for the edge case
          // of a parent calling this before the script has finished loading
          // (e.g. a snapshot arriving during initial mount). In that case
          // the seeded polygons will mount once the script loads and the
          // next edit will trigger a fresh emit.
          if (typeof google !== "undefined" && google.maps?.geometry) {
            onChangeRef.current(cleanPaths.map(geometryFor));
          }
        },
      }),
      [],
    );

    /**
     * The GoogleMap can mount at the precise instant the parent flex layout
     * hasn't finished reflowing — Maps then caches a 0×0 viewport and never
     * issues tile requests for the real size. Forcing a `resize` event on the
     * next animation frame after `idle` makes Maps re-measure and request
     * the correct tiles. Cheap, idempotent, and survives window resizes too.
     */
    const handleMapLoad = useCallback((map: google.maps.Map) => {
      mapInstanceRef.current = map;
      const fire = () => {
        const m = mapInstanceRef.current;
        if (!m) return;
        google.maps.event.trigger(m, "resize");
        m.setCenter(m.getCenter() ?? { lat: 0, lng: 0 });
      };
      requestAnimationFrame(fire);
      setTimeout(fire, 250);
    }, []);

    const handleMapUnmount = useCallback(() => {
      mapInstanceRef.current = null;
    }, []);

    /** Cached delete-badge `Icon`. Constructing `google.maps.Size`/`Point`
     *  requires the Maps script to be loaded; gating on `isLoaded` avoids
     *  the "google is not defined" foot-gun if this ever runs SSR. The
     *  anchor places the badge with a tiny gap above the vertex so the
     *  underlying drag handle stays grabbable. */
    const deleteBadgeIcon = useMemo<google.maps.Icon | null>(() => {
      if (!isLoaded) return null;
      return {
        url: DELETE_BADGE_URL,
        scaledSize: new google.maps.Size(36, 36),
        anchor: new google.maps.Point(18, 38),
      };
    }, [isLoaded]);

    // The outer wrapper is `absolute inset-0` so we always cover the parent.
    // Parent must be `position: relative` (the wrapper in the job page already
    // is) and must have non-zero height — guaranteed via `min-h-[520px]` there.
    const wrapperClass = "absolute inset-0";

    if (loadError) {
      return (
        <div
          ref={containerRef}
          className={`${wrapperClass} flex items-center justify-center bg-mist`}
        >
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Map failed to load
          </p>
        </div>
      );
    }

    if (!isLoaded) {
      return (
        <div
          ref={containerRef}
          className={`${wrapperClass} flex items-center justify-center bg-mist`}
        >
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted">
            Loading canvas…
          </p>
        </div>
      );
    }

    return (
      <div ref={containerRef} className={wrapperClass}>
        <GoogleMap
          mapContainerStyle={MAP_CONTAINER_STYLE}
          center={stableCenter}
          zoom={zoom}
          options={mapOptions}
          onLoad={handleMapLoad}
          onUnmount={handleMapUnmount}
          onClick={handleMapClick}
        >
          {polygons.length === 0 ? <Marker position={stableCenter} /> : null}

          {polygons.map(({ id, seedPath }) => (
            <Polygon
              key={id}
              path={seedPath}
              editable={!locked}
              draggable={!locked}
              options={POLYGON_STYLE}
              onLoad={(polygon) => handlePolygonLoad(id, polygon)}
              onUnmount={() => handlePolygonUnmount(id)}
              onMouseUp={emitAll}
              onDragEnd={emitAll}
              onClick={(event) => handlePolygonClick(id, event)}
            />
          ))}

          {pendingDelete && deleteBadgeIcon && !locked ? (
            <Marker
              position={pendingDelete.position}
              icon={deleteBadgeIcon}
              zIndex={1000}
              onClick={confirmVertexDelete}
              title="Tap to delete this vertex"
            />
          ) : null}

          <DrawingManager
            drawingMode={
              effectiveDrawArmed ? google.maps.drawing.OverlayType.POLYGON : null
            }
            onLoad={handleDrawingManagerLoad}
            onUnmount={handleDrawingManagerUnmount}
            onPolygonComplete={handlePolygonComplete}
            options={{
              drawingControl: false,
              polygonOptions: {
                ...POLYGON_STYLE,
                editable: true,
                draggable: true,
              },
            }}
          />
        </GoogleMap>
      </div>
    );
  },
);
