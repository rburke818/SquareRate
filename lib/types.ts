import type { Timestamp } from "firebase/firestore";

/** @deprecated Superseded by `PlanId`. Kept for legacy docs. */
export type Tier = "trial" | "pro" | "enterprise";

/**
 * Billing plans.
 *
 *  - `beta`   — grandfathered. The implicit default for any user doc written
 *               before paid plans existed (no `plan` field → `beta`). These
 *               accounts keep their original 100 free scans/month; do NOT
 *               repoint the default at `trial` or every legacy user silently
 *               drops from 100 scans to 5.
 *  - `trial`  — every NEW signup. 5 scans total, for the life of the account.
 *  - `solo`   — Solo Crew, `pro` — Pro Crew. Sold via LemonSqueezy.
 */
export type PlanId = "beta" | "trial" | "solo" | "pro";

export interface UserDoc {
  uid: string;
  email: string;
  /** @deprecated legacy field; new logic reads `plan`. */
  tier: Tier;
  /** Current billing plan. Absent on legacy/beta docs → treated as `beta`. */
  plan?: PlanId;
  /** Scans consumed in the current period (see `usage_period`). */
  api_queries_this_month: number;
  /** The "YYYY-MM" period the counter applies to. When the month rolls over,
   *  the server resets the counter and stamps the new period. */
  usage_period?: string;
  /**
   * Lifetime scan count for the free trial. Deliberately separate from
   * `api_queries_this_month`: that counter is zeroed every month, which would
   * hand a trial user 5 fresh scans on the 1st, forever. This one is only ever
   * incremented. The n8n metering node MUST increment this (not the monthly
   * counter) while `plan === "trial"`.
   */
  trial_scans_used?: number;
  /** LemonSqueezy subscription id, written by the billing webhook. */
  ls_subscription_id?: string;
  /** LemonSqueezy customer id, for linking to their self-serve portal. */
  ls_customer_id?: string;
  /** LemonSqueezy subscription status: active, cancelled, past_due, expired… */
  ls_status?: string;
  /** ISO date the subscription next renews, or ends if already cancelled. */
  ls_renews_at?: string;
  /**
   * Signed LemonSqueezy customer-portal URL, refreshed by the billing webhook.
   * These expire, so the account page always offers an email fallback rather
   * than assuming the stored link still works.
   */
  ls_customer_portal_url?: string;
  /**
   * Referral code captured from `?ref=` at signup. Commission is paid against
   * this, so security rules make it immutable once the document exists.
   */
  referred_by?: string;
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

/**
 * One detected roof plane from the Google Solar pipeline. `area` is canonical
 * metric (square meters), mirroring `calculatedArea`, so the display layer
 * applies the exact same unit conversion to a segment as to the whole-roof
 * total. `pitch` / `azimuth` are in degrees and optional — older scans (and
 * future schema tweaks) may omit them, so always render defensively.
 */
export interface RoofSegment {
  area: number;
  pitch?: number;
  azimuth?: number;
}

/**
 * Backend-computed roof breakdown returned by the n8n Solar scan. Optional:
 * only Roof jobs populate it, and legacy docs omit it entirely — always read
 * via optional chaining / `normalizeRoofStats`. Its presence is the signal
 * that the Solar measurement is authoritative and must not be overwritten by
 * the on-map bounding-box polygon.
 *
 * Additional Solar fields (building bounding box, annual flux, yearly energy,
 * shading / sunshine quantiles) are expected to land here later; they're read
 * defensively so they render automatically once n8n starts writing them.
 */
export interface RoofStats {
  segments: RoofSegment[];
  /** Maximum solar panels the roof can host (Google Solar `maxArrayPanelsCount`). */
  maxPanels?: number;
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
  /**
   * Per-plane roof breakdown from the AI scan. `undefined` for non-roof jobs
   * and any doc written before this field existed.
   */
  roofStats?: RoofStats;
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

/**
 * Read whatever Firestore returned under `roofStats` and produce a clean
 * `RoofStats` (or `undefined` when absent/malformed). Defensive: drops any
 * segment without a numeric `area` so the display layer never has to guard.
 * Read-only — never mutates the source value.
 */
export function normalizeRoofStats(raw: unknown): RoofStats | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;

  const rawSegments = Array.isArray(obj.segments) ? obj.segments : [];
  const segments: RoofSegment[] = [];
  for (const entry of rawSegments) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.area !== "number") continue;
    const seg: RoofSegment = { area: e.area };
    if (typeof e.pitch === "number") seg.pitch = e.pitch;
    if (typeof e.azimuth === "number") seg.azimuth = e.azimuth;
    segments.push(seg);
  }

  const maxPanels =
    typeof obj.maxPanels === "number" ? obj.maxPanels : undefined;

  // Nothing usable → treat as absent so callers can rely on a single
  // "is this a completed Solar scan?" check.
  if (segments.length === 0 && maxPanels === undefined) return undefined;
  return maxPanels === undefined ? { segments } : { segments, maxPanels };
}

function isLatLng(value: unknown): value is LatLng {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as LatLng).lat === "number" &&
    typeof (value as LatLng).lng === "number"
  );
}
