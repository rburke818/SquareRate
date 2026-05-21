"use client";

import {
  doc,
  onSnapshot,
  updateDoc,
  type DocumentSnapshot,
} from "firebase/firestore";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  MapCanvas,
  type MapCanvasHandle,
  type PolygonGeometry,
} from "@/components/MapCanvas";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import {
  SURFACE_TYPES,
  normalizePolygonCoords,
  serializePolygonCoords,
  type JobDoc,
  type JobStatus,
  type LatLng,
  type SurfaceType,
} from "@/lib/types";

type Units = "metric" | "imperial";

const SQFT_PER_SQM = 10.7639;
const FT_PER_M = 3.28084;

/** Fallback center when a legacy job has no saved lat/lng. Geographic center of the contiguous US. */
const DEFAULT_CENTER: LatLng = { lat: 39.8283, lng: -98.5795 };

/** Time-on-screen between the last edit and the Firestore write. */
const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * n8n endpoint that runs the AI segmentation pipeline. Resolved at module
 * load (Next.js inlines `NEXT_PUBLIC_*` variables into client bundles). May
 * be empty during local dev — `handleRunAiScan` surfaces a clean error in
 * that case instead of POSTing to `undefined`.
 */
const N8N_WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ?? "";

export default function JobWorkspacePage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = params?.jobId;
  const { user, loading: authLoading } = useAuth();

  const [job, setJob] = useState<JobDoc | null>(null);
  const [jobLoading, setJobLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState<Units>("imperial");
  const [savingSurface, setSavingSurface] = useState(false);

  // Live geometry sourced from the map canvas — one entry per polygon. Stored
  // in canonical metric units so the Metric/Imperial toggle is a pure display
  // concern. `null` until the canvas emits its first snapshot.
  const [geometry, setGeometry] = useState<PolygonGeometry[] | null>(null);

  // Controlled draw-mode toggle. The canvas defers to this for whether to put
  // its DrawingManager into POLYGON mode, and notifies us via
  // `onDrawArmedChange` when it auto-disarms (e.g. after a polygon completes).
  // Owning this in the parent lets the dock's "Add polygon" button render
  // active vs. idle styling without pulling state out of the canvas.
  const [drawArmed, setDrawArmed] = useState(false);

  // Persistence state — surfaced to the user as a small status line.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // AI-pipeline lifecycle state. `aiTriggering` covers the brief window
  // between clicking "Run AI Scan" and the Firestore write+webhook POST
  // resolving; once the doc flips to `status: 'processing'`, the snapshot
  // listener drives the rest of the UI. `aiError` surfaces webhook
  // failures (network down, n8n returns non-2xx) in a dismissable banner.
  const [aiTriggering, setAiTriggering] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const mapRef = useRef<MapCanvasHandle | null>(null);
  /** Previous status seen by the snapshot listener. Used to detect the
   *  `processing → review` transition so we can re-seed the canvas with
   *  the AI-generated boundary mask. */
  const prevStatusRef = useRef<JobStatus | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !jobId) return;
    const ref = doc(db, "jobs", jobId);
    const unsub = onSnapshot(
      ref,
      (snap: DocumentSnapshot) => {
        if (!snap.exists()) {
          setJob(null);
          setError("This job does not exist or you do not have access.");
          setJobLoading(false);
          return;
        }
        const data = snap.data();
        if (!data || data.userId !== user.uid) {
          setJob(null);
          setError("You do not have access to this job.");
          setJobLoading(false);
          return;
        }
        setJob({
          jobId: snap.id,
          userId: data.userId,
          address: data.address ?? "",
          // Old jobs may carry surface labels outside the new dropdown set
          // (e.g. "Hardscape", "Turf"). Preserve the value as-is; the
          // selector treats unknown values as "unset" and prompts the user
          // to pick a real surface, which will overwrite the legacy value
          // on next save.
          surfaceType: (data.surfaceType ?? "") as SurfaceType,
          status: data.status ?? "pending",
          lat: typeof data.lat === "number" ? data.lat : 0,
          lng: typeof data.lng === "number" ? data.lng : 0,
          polygonCoords: normalizePolygonCoords(data.polygonCoords),
          calculatedArea: data.calculatedArea ?? 0,
          calculatedPerimeter: data.calculatedPerimeter ?? 0,
          createdAt: data.createdAt ?? null,
        });
        setError(null);
        setJobLoading(false);
      },
      (err) => {
        setError(err.message);
        setJobLoading(false);
      },
    );
    return () => unsub();
  }, [user, jobId]);

  async function changeSurfaceType(next: SurfaceType) {
    if (!job) return;
    setSavingSurface(true);
    try {
      await updateDoc(doc(db, "jobs", job.jobId), { surfaceType: next });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update surface type.",
      );
    } finally {
      setSavingSurface(false);
    }
  }

  /**
   * Debounced auto-save: every edit refreshes the timer, and we only push to
   * Firestore once the user has been still for ~600ms. Keeps the request rate
   * low while still feeling instant. Operates on a `PolygonGeometry[]` —
   * area/perimeter are summed across every polygon before the write.
   */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PolygonGeometry[] | null>(null);

  const flushSave = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || !job) return;
    pendingRef.current = null;
    setSaving(true);
    setSaveError(null);
    try {
      const totalArea = pending.reduce((sum, p) => sum + p.areaSqMeters, 0);
      const totalPerimeter = pending.reduce(
        (sum, p) => sum + p.perimeterMeters,
        0,
      );
      await updateDoc(doc(db, "jobs", job.jobId), {
        polygonCoords: serializePolygonCoords(pending.map((p) => p.coords)),
        calculatedArea: totalArea,
        calculatedPerimeter: totalPerimeter,
        status: deriveStatusForSave(job.status, pending.length),
      });
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save polygon.",
      );
    } finally {
      setSaving(false);
    }
  }, [job]);

  /**
   * Watch for the `processing → review` transition emitted by n8n. When
   * the AI pipeline writes its boundary mask back into Firestore and flips
   * status, we hard-reset the canvas: the user's pre-scan polygons should
   * be replaced by the AI's, not merged with them. `replacePolygons`
   * recomputes area/perimeter client-side and fires `onChange`, so the
   * dock totals refresh without waiting for the user to interact.
   *
   * Every other transition leaves the canvas alone — local edits flow
   * through `onChange` / auto-save, and `complete` is just a flag.
   */
  useEffect(() => {
    if (!job) {
      prevStatusRef.current = null;
      return;
    }
    const prev = prevStatusRef.current;
    if (prev === "processing" && job.status === "review") {
      mapRef.current?.replacePolygons(job.polygonCoords);
    }
    prevStatusRef.current = job.status;
  }, [job]);

  const handleGeometryChange = useCallback(
    (next: PolygonGeometry[]) => {
      setGeometry(next);
      pendingRef.current = next;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSave, AUTOSAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  function handleToggleAddPolygon() {
    setDrawArmed((prev) => !prev);
  }

  function handleClearCanvas() {
    if (!geometry?.length && !job?.polygonCoords.length) return;
    const confirmed = window.confirm(
      "Clear every polygon from this canvas? This cannot be undone.",
    );
    if (!confirmed) return;
    setDrawArmed(false);
    mapRef.current?.clearAll();
  }

  /**
   * Kick off the AI segmentation pipeline.
   *
   *   1. Optimistically flip `status` to `processing` in Firestore. The
   *      snapshot echoes back through our listener, which propagates to
   *      `MapCanvas`'s `locked` prop and freezes the polygons.
   *   2. POST the job context (id, centroid, surface, current boundary
   *      mask) to the n8n webhook.
   *   3. On any failure (missing env, network, non-2xx) revert `status`
   *      to its previous value so the canvas unlocks and the user can
   *      retry. Surface the error in a dismissable banner.
   *
   * The actual `processing → review` transition is owned by n8n: it
   * writes results back into Firestore via the Admin SDK, our listener
   * picks it up, and the UI advances automatically.
   */
  async function handleRunAiScan() {
    if (!job || !aiScanReady) return;
    if (!N8N_WEBHOOK_URL) {
      setAiError(
        "The AI webhook is not configured. Set NEXT_PUBLIC_N8N_WEBHOOK_URL in .env.local and restart the dev server.",
      );
      return;
    }
    // Land any pending edit before we hand off. Otherwise the debounce
    // timer could fire AFTER our `status: 'processing'` write and clobber
    // it back to `in_progress` (deriveStatusForSave reads `job.status`
    // from React state, which hasn't yet seen the snapshot echo).
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      await flushSave();
    }
    // Prefer the live canvas geometry (most up-to-date) when present,
    // otherwise fall back to the last server snapshot.
    const boundaryMask: LatLng[][] = geometry
      ? geometry.map((g) => g.coords)
      : job.polygonCoords;
    const previousStatus = job.status;
    setAiError(null);
    setAiTriggering(true);
    try {
      await updateDoc(doc(db, "jobs", job.jobId), { status: "processing" });
      const response = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.jobId,
          lat: job.lat,
          lng: job.lng,
          surfaceType: job.surfaceType,
          boundaryMask,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Webhook responded with ${response.status} ${response.statusText}`.trim(),
        );
      }
      // From here, n8n owns the lifecycle. The snapshot listener will
      // flip the UI into review mode once the pipeline finishes.
    } catch (err) {
      // Best-effort revert so the user isn't stuck staring at a locked
      // canvas after a failed dispatch. If the revert itself fails the
      // original error still wins for the visible message.
      try {
        await updateDoc(doc(db, "jobs", job.jobId), {
          status: previousStatus,
        });
      } catch (revertErr) {
        console.error(
          "[JobWorkspace] failed to revert status after webhook error",
          revertErr,
        );
      }
      setAiError(
        err instanceof Error
          ? err.message
          : "Could not reach the AI service. Please try again.",
      );
    } finally {
      setAiTriggering(false);
    }
  }

  /** Mark the job as finalized once the user has approved the AI mask
   *  (optionally after tweaking it during the `review` phase). */
  async function handleFinalize() {
    if (!job) return;
    // Land any pending tweaks so `complete` ships with the user's final
    // polygon set (same race as in `handleRunAiScan`).
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      await flushSave();
    }
    setAiError(null);
    try {
      await updateDoc(doc(db, "jobs", job.jobId), { status: "complete" });
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : "Could not finalize the job.",
      );
    }
  }

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Effective center for the GoogleMap. Falls back when legacy jobs have no
  // saved lat/lng so the map still renders something sensible.
  const center = useMemo<LatLng>(() => {
    if (!job) return DEFAULT_CENTER;
    if (job.lat === 0 && job.lng === 0) return DEFAULT_CENTER;
    return { lat: job.lat, lng: job.lng };
  }, [job]);

  // Sum every polygon's area/perimeter. Prefer live canvas state; fall back
  // to whatever Firestore returned the last time we saved (so the panel
  // isn't blank on first load).
  const display = useMemo(() => {
    let areaSqM: number;
    let perimeterM: number;
    if (geometry) {
      areaSqM = geometry.reduce((sum, p) => sum + p.areaSqMeters, 0);
      perimeterM = geometry.reduce((sum, p) => sum + p.perimeterMeters, 0);
    } else {
      areaSqM = job?.calculatedArea ?? 0;
      perimeterM = job?.calculatedPerimeter ?? 0;
    }
    return formatMetrics(areaSqM, perimeterM, units);
  }, [geometry, job, units]);

  // Treat any value outside the canonical `SURFACE_TYPES` set as "unset" so
  // legacy jobs (and brand-new ones) prompt the user to pick a real surface.
  // The selector binds its `value` to "" in this case, which selects the
  // disabled "Choose surface…" placeholder option.
  const isSurfaceChosen = useMemo(() => {
    if (!job) return false;
    return (SURFACE_TYPES as readonly string[]).includes(job.surfaceType);
  }, [job]);

  const polygonCount = geometry?.length ?? job?.polygonCoords.length ?? 0;
  const hasAnyPolygon = polygonCount > 0;

  // Derived workflow flags. `isProcessing` locks the canvas + secondary
  // controls; `isReview` swaps the primary CTA from "Run AI Scan" into
  // "Finalize Measurement" and unlocks the polygons for tweaking.
  const status: JobStatus = job?.status ?? "pending";
  const isProcessing = status === "processing";
  const isReview = status === "review";
  const isComplete = status === "complete";
  const canvasLocked = isProcessing;

  // The AI scan stays locked until both prerequisites are met: a real
  // surface type has been chosen (not the placeholder / a legacy label) AND
  // there's at least one polygon to measure. `aiScanLockReason` drives the
  // tooltip so the user knows exactly which step is still missing.
  const aiScanReady = isSurfaceChosen && hasAnyPolygon;
  const aiScanLockReason: string | null = !isSurfaceChosen && !hasAnyPolygon
    ? "Choose a surface type and draw a polygon to unlock the AI scan."
    : !isSurfaceChosen
      ? "Choose a surface type to unlock the AI scan."
      : !hasAnyPolygon
        ? "Draw a polygon to unlock the AI scan."
        : null;

  if (authLoading || jobLoading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Loading</p>
      </main>
    );
  }

  if (error || !job) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Unavailable</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-charcoal">
          {error ?? "Job not found"}
        </h1>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center gap-2 border border-charcoal bg-paper px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist"
        >
          <ArrowLeftIcon />
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      {/* Top panel */}
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 border border-line bg-paper px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist"
            >
              <ArrowLeftIcon />
              Back to dashboard
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
                Address
              </p>
              <p className="truncate text-sm font-medium text-charcoal">
                {job.address || "Untitled job"}
              </p>
            </div>
          </div>

          <UnitsToggle value={units} onChange={setUnits} />
        </div>
      </header>

      {/* Map canvas. The flex chain `main → section → inner div → map
          wrapper` propagates available height down to the canvas. We then
          floor the canvas wrapper at `min-h-[520px]` as a defense in depth:
          even if any link in the flex chain collapses (Tailwind v4 reset
          quirks, a transparent provider, an unrelated reflow), the GoogleMap
          still has real pixels to render into. The wrapper is the
          positioning ancestor for MapCanvas's `absolute inset-0` fill. */}
      <section className="flex flex-1 flex-col bg-bone">
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-6 min-h-0">
          <div className="relative flex-1 overflow-hidden border border-line bg-[#d9d9d7] min-h-[520px]">
            <MapCanvas
              ref={mapRef}
              center={center}
              initialPaths={job.polygonCoords}
              drawArmed={drawArmed}
              onDrawArmedChange={setDrawArmed}
              onChange={handleGeometryChange}
              locked={canvasLocked}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-muted">
            <span>{instructionFor(status, drawArmed, polygonCount)}</span>
            <SaveStatus
              saving={saving}
              error={saveError}
              processing={isProcessing}
            />
          </div>
        </div>
      </section>

      {/* AI error banner. Renders only when a webhook trigger or finalize
          call failed; the user can dismiss to retry. */}
      {aiError ? (
        <div
          role="alert"
          className="border-t border-charcoal bg-paper"
        >
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3 text-[11px] text-charcoal">
            <span className="uppercase tracking-[0.18em]">AI scan</span>
            <span className="flex-1 truncate normal-case tracking-normal text-graphite">
              {aiError}
            </span>
            <button
              type="button"
              onClick={() => setAiError(null)}
              className="border border-charcoal bg-paper px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-charcoal hover:text-paper"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {/* Bottom dock */}
      <footer className="border-t border-line bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
            <label className="block w-full sm:w-56">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-muted">
                Surface selector
              </span>
              <select
                value={isSurfaceChosen ? job.surfaceType : ""}
                onChange={(e) =>
                  changeSurfaceType(e.target.value as SurfaceType)
                }
                disabled={savingSurface || isProcessing}
                className={`w-full appearance-none border bg-paper px-3 py-2.5 text-sm focus:border-charcoal disabled:opacity-50 ${
                  isSurfaceChosen
                    ? "border-line text-charcoal"
                    : "border-charcoal text-graphite"
                }`}
              >
                <option value="" disabled>
                  Choose surface…
                </option>
                {SURFACE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <Metric label="Total area" value={display.area} />
            <Metric label="Perimeter" value={display.perimeter} />
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button
              type="button"
              onClick={handleToggleAddPolygon}
              aria-pressed={drawArmed}
              disabled={isProcessing}
              className={`inline-flex items-center gap-2 border px-3 py-2.5 text-[11px] uppercase tracking-[0.22em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                drawArmed
                  ? "border-charcoal bg-charcoal text-paper hover:bg-graphite"
                  : "border-line bg-paper text-charcoal hover:bg-mist"
              }`}
            >
              <PlusIcon />
              {drawArmed ? "Drawing… tap to cancel" : "Add polygon"}
            </button>
            <button
              type="button"
              onClick={handleClearCanvas}
              disabled={!hasAnyPolygon || isProcessing}
              className="inline-flex items-center gap-2 border border-line bg-paper px-3 py-2.5 text-[11px] uppercase tracking-[0.22em] text-charcoal transition-colors hover:border-charcoal hover:bg-charcoal hover:text-paper disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-paper disabled:hover:text-charcoal"
            >
              <TrashIcon />
              Clear canvas
            </button>

            {/*
              Primary CTA per workflow status:
                pending/in_progress → "Run AI Scan" (gated on surface + polygon)
                processing          → "Scanning…" (disabled while pipeline runs)
                review              → "Finalize Measurement" (flip to complete)
                complete            → "Measurement complete" (read-only)
            */}
            {isProcessing ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-2 bg-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.22em] text-paper disabled:opacity-70"
              >
                <Spinner />
                Scanning…
              </button>
            ) : isReview ? (
              <button
                type="button"
                onClick={handleFinalize}
                className="bg-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.22em] text-paper transition-colors hover:bg-graphite"
              >
                Finalize Measurement
              </button>
            ) : isComplete ? (
              <button
                type="button"
                disabled
                title="This job is finalized."
                className="bg-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.22em] text-paper disabled:opacity-60"
              >
                Measurement complete
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRunAiScan}
                disabled={!aiScanReady || aiTriggering}
                title={aiScanLockReason ?? undefined}
                className="bg-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.22em] text-paper transition-colors hover:bg-graphite disabled:cursor-not-allowed disabled:opacity-40"
              >
                {aiTriggering ? "Starting…" : "Run AI Scan"}
              </button>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}

function instructionFor(
  status: JobStatus,
  drawArmed: boolean,
  polygonCount: number,
): string {
  if (status === "processing") {
    return "AI scan in progress — polygons are locked until the pipeline returns.";
  }
  if (status === "review") {
    return "AI mask received. Tweak vertices to refine, then tap “Finalize Measurement”.";
  }
  if (status === "complete") {
    return "Measurement finalized.";
  }
  if (drawArmed) {
    return "Drawing mode on — tap to drop vertices, double-tap the last to finish.";
  }
  if (polygonCount === 0) {
    return "Click “Add polygon” to start drawing your first surface.";
  }
  return "Drag a vertex to adjust, or tap a vertex to delete (confirm with the red X). Drag the polygon body to move it.";
}

/**
 * Pick the status to write alongside polygon edits.
 *
 *   - `processing` and `complete` are owned by other paths (the AI-scan
 *     trigger and the Finalize button respectively) and must not be
 *     overwritten by an in-flight auto-save.
 *   - `review` is preserved while at least one polygon remains, so the
 *     user can iterate on the AI mask without the workflow regressing.
 *     If they clear the canvas entirely, drop back to `pending` so the
 *     "Run AI Scan" CTA can re-appear after they redraw.
 *   - `pending`/`in_progress` flip purely off polygon presence.
 */
function deriveStatusForSave(
  current: JobStatus,
  polygonCount: number,
): JobStatus {
  if (current === "processing" || current === "complete") return current;
  if (current === "review") return polygonCount > 0 ? "review" : "pending";
  return polygonCount > 0 ? "in_progress" : "pending";
}

function UnitsToggle({
  value,
  onChange,
}: {
  value: Units;
  onChange: (next: Units) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Units"
      className="inline-flex border border-line"
    >
      <ToggleButton
        active={value === "metric"}
        onClick={() => onChange("metric")}
      >
        Metric
      </ToggleButton>
      <ToggleButton
        active={value === "imperial"}
        onClick={() => onChange("imperial")}
      >
        Imperial
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-[11px] uppercase tracking-[0.18em] transition-colors ${
        active
          ? "bg-charcoal text-paper"
          : "bg-paper text-graphite hover:bg-mist"
      }`}
    >
      {children}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[140px]">
      <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg tracking-tight text-charcoal">
        {value}
      </p>
    </div>
  );
}

function SaveStatus({
  saving,
  error,
  processing,
}: {
  saving: boolean;
  error: string | null;
  processing: boolean;
}) {
  if (error) {
    return <span className="text-charcoal">Save failed — {error}</span>;
  }
  if (processing) return <span>AI scan running…</span>;
  if (saving) return <span>Saving…</span>;
  return <span>Auto-save on</span>;
}

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.5 3.5 5 8l4.5 4.5M5 8h7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 3v10M3 8h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="animate-spin"
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.6"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.5 4h11M6.5 4V2.5h3V4M4 4l.5 9.5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1L12 4M6.5 6.5v6M9.5 6.5v6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="square"
      />
    </svg>
  );
}

/**
 * Convert canonical metric area/perimeter into the requested display units.
 * Canvas geometry math is canonical sq m / m; this function is the *only*
 * place that diverges for Imperial.
 */
function formatMetrics(
  areaSqMeters: number,
  perimeterMeters: number,
  units: Units,
): { area: string; perimeter: string } {
  const hasArea = areaSqMeters > 0;
  const hasPerimeter = perimeterMeters > 0;

  if (units === "metric") {
    return {
      area: hasArea ? `${formatNumber(areaSqMeters, 1)} m²` : "—",
      perimeter: hasPerimeter
        ? `${formatNumber(perimeterMeters, 1)} m`
        : "—",
    };
  }
  return {
    area: hasArea
      ? `${formatNumber(areaSqMeters * SQFT_PER_SQM, 1)} ft²`
      : "—",
    perimeter: hasPerimeter
      ? `${formatNumber(perimeterMeters * FT_PER_M, 1)} ft`
      : "—",
  };
}

function formatNumber(value: number, fractionDigits: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
