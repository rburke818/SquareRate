import type { Timestamp } from "firebase/firestore";

export type Tier = "trial" | "pro" | "enterprise";

export interface UserDoc {
  uid: string;
  email: string;
  tier: Tier;
  api_queries_this_month: number;
}

export type SurfaceType = "Roof" | "Pavement" | "Decking" | "Pool" | "Lawn";

export const SURFACE_TYPES: readonly SurfaceType[] = [
  "Roof",
  "Pavement",
  "Decking",
  "Pool",
  "Lawn",
];

/**
 * Lifecycle of a job document. The Hub (this app) owns the `pending`,
 * `in_progress`, and the optimistic flip into `processing`; the Shield (n8n)
 * flips `processing` → `review` once the AI mask is back; the user then
 * clicks "Finalize Measurement" to advance to `complete`.
 */
export type JobStatus =
  | "pending"
  | "in_progress"
  | "processing"
  | "review"
  | "complete";

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * On-disk wrapper for a single polygon. Firestore disallows arrays inside
 * arrays, so we wrap each path in a map so the document can store many
 * disconnected polygons under a single field.
 */
export interface PolygonRecord {
  path: LatLng[];
}

export interface JobDoc {
  jobId: string;
  userId: string;
  address: string;
  /**
   * Stored as written by the app, but legacy jobs may carry surface labels
   * outside the current dropdown ("Hardscape", "Turf"). The workspace
   * surfaces those via a `(legacy)` option so the user can re-classify.
   */
  surfaceType: SurfaceType;
  status: JobStatus;
  /** Lat/lng of the address selected from Places Autocomplete. */
  lat: number;
  lng: number;
  /**
   * One sub-array per polygon drawn on the canvas. Always normalized via
   * `normalizePolygonCoords` after reading from Firestore so legacy single-
   * polygon docs (`LatLng[]`) and new multi-polygon docs (`PolygonRecord[]`)
   * share a single in-memory shape.
   */
  polygonCoords: LatLng[][];
  /** Sum of every polygon's spherical area in square meters. */
  calculatedArea: number;
  /** Sum of every polygon's closed-loop perimeter in meters. */
  calculatedPerimeter: number;
  createdAt: Timestamp | null;
}

/**
 * Read whatever Firestore returned and produce the canonical in-app shape:
 * an array of LatLng arrays, one per polygon. Handles three cases:
 *
 *  - Brand-new job: `undefined`/`[]` → `[]`
 *  - Legacy single polygon: `LatLng[]` → `[LatLng[]]`
 *  - New multi-polygon: `PolygonRecord[]` → `LatLng[][]`
 *
 * Defensive: invalid entries (missing `path`, non-arrays, paths shorter than
 * three vertices) are dropped so the canvas never tries to render a degenerate
 * polygon.
 */
export function normalizePolygonCoords(raw: unknown): LatLng[][] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const first = raw[0];
  if (isLatLng(first)) {
    const flat = raw.filter(isLatLng);
    return flat.length >= 3 ? [flat] : [];
  }
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const path = (entry as { path?: unknown }).path;
      if (!Array.isArray(path)) return [];
      return path.filter(isLatLng);
    })
    .filter((path) => path.length >= 3);
}

/**
 * Produce the on-disk shape from canonical in-app paths. Invariant: each
 * sub-array has at least three vertices (the canvas enforces this before
 * calling save).
 */
export function serializePolygonCoords(paths: LatLng[][]): PolygonRecord[] {
  return paths.map((path) => ({ path }));
}

function isLatLng(value: unknown): value is LatLng {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LatLng).lat === "number" &&
    typeof (value as LatLng).lng === "number"
  );
}
