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

import { MapCanvas, type PolygonGeometry } from "@/components/MapCanvas";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import {
  SURFACE_TYPES,
  type JobDoc,
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

  // Live geometry sourced from the map canvas. Stored in canonical metric
  // units so the Metric/Imperial toggle is a pure display concern.
  const [geometry, setGeometry] = useState<PolygonGeometry | null>(null);

  // Persistence state — surfaced to the user as a small status line.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
          surfaceType: (data.surfaceType ?? "Hardscape") as SurfaceType,
          status: data.status ?? "pending",
          lat: typeof data.lat === "number" ? data.lat : 0,
          lng: typeof data.lng === "number" ? data.lng : 0,
          polygonCoords: data.polygonCoords ?? [],
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
   * low while still feeling instant.
   */
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<PolygonGeometry | null>(null);

  const flushSave = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending || !job) return;
    pendingRef.current = null;
    setSaving(true);
    setSaveError(null);
    try {
      await updateDoc(doc(db, "jobs", job.jobId), {
        polygonCoords: pending.coords,
        calculatedArea: pending.areaSqMeters,
        calculatedPerimeter: pending.perimeterMeters,
        status: pending.coords.length >= 3 ? "in_progress" : "pending",
      });
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save polygon.",
      );
    } finally {
      setSaving(false);
    }
  }, [job]);

  const handleGeometryChange = useCallback(
    (next: PolygonGeometry) => {
      setGeometry(next);
      pendingRef.current = next;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSave, AUTOSAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

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

  // Display values: prefer live geometry; fall back to whatever Firestore
  // returned the last time we saved (so the panel isn't blank on first load).
  const display = useMemo(() => {
    const areaSqM = geometry?.areaSqMeters ?? job?.calculatedArea ?? 0;
    const perimeterM = geometry?.perimeterMeters ?? job?.calculatedPerimeter ?? 0;
    return formatMetrics(areaSqM, perimeterM, units);
  }, [geometry, job, units]);

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

      {/* Map canvas */}
      <section className="flex-1 bg-bone">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-6 py-6">
          <div className="relative flex flex-1 overflow-hidden border border-line bg-[#d9d9d7]">
            <MapCanvas
              center={center}
              initialPath={job.polygonCoords}
              onChange={handleGeometryChange}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-muted">
            <span>
              {job.polygonCoords.length === 0 && !geometry
                ? "Click on the map to drop the first vertex of your polygon."
                : "Drag a vertex or the polygon itself — measurements update live."}
            </span>
            <SaveStatus saving={saving} error={saveError} />
          </div>
        </div>
      </section>

      {/* Bottom dock */}
      <footer className="border-t border-line bg-paper">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-8">
            <label className="block w-full sm:w-56">
              <span className="mb-2 block text-[10px] uppercase tracking-[0.22em] text-muted">
                Surface selector
              </span>
              <select
                value={job.surfaceType}
                onChange={(e) => changeSurfaceType(e.target.value as SurfaceType)}
                disabled={savingSurface}
                className="w-full appearance-none border border-line bg-paper px-3 py-2.5 text-sm text-charcoal focus:border-charcoal disabled:opacity-50"
              >
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

          <button
            type="button"
            disabled
            title="AI scan will be wired up in a later step"
            className="bg-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.22em] text-paper transition-colors hover:bg-graphite disabled:opacity-60"
          >
            Run AI Scan
          </button>
        </div>
      </footer>
    </main>
  );
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
}: {
  saving: boolean;
  error: string | null;
}) {
  if (error) {
    return <span className="text-charcoal">Save failed — {error}</span>;
  }
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
