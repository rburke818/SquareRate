"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type QuerySnapshot,
} from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  AddressAutocomplete,
  type AddressSelection,
} from "@/components/AddressAutocomplete";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { SURFACE_TYPES, type JobDoc, type SurfaceType } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading, logout } = useAuth();

  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [surfaceType, setSurfaceType] = useState<SurfaceType>("Hardscape");
  const [jobs, setJobs] = useState<JobDoc[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/auth");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "jobs"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot) => {
        const next: JobDoc[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            jobId: d.id,
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
          };
        });
        setJobs(next);
        setJobsLoading(false);
      },
      () => setJobsLoading(false),
    );
    return () => unsub();
  }, [user]);

  function resetIntake() {
    setAddress("");
    setCoords(null);
    setSurfaceType("Hardscape");
    setFormError(null);
  }

  function handlePlaceSelect(selection: AddressSelection) {
    setAddress(selection.address);
    setCoords({ lat: selection.lat, lng: selection.lng });
    setFormError(null);
  }

  function handleAddressTyped(next: string) {
    setAddress(next);
    // Editing the text after picking from the dropdown invalidates the
    // resolved coordinates — force the user to pick a real Place again.
    if (coords) setCoords(null);
  }

  async function initializeJob(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const trimmed = address.trim();
    if (!trimmed) {
      setFormError("Enter an address before initializing a job.");
      return;
    }
    if (!coords) {
      setFormError(
        "Pick the address from the dropdown so we can resolve its coordinates.",
      );
      return;
    }
    setFormError(null);
    setCreating(true);
    try {
      const ref = await addDoc(collection(db, "jobs"), {
        userId: user.uid,
        address: trimmed,
        surfaceType,
        status: "pending",
        lat: coords.lat,
        lng: coords.lng,
        polygonCoords: [],
        calculatedArea: 0,
        calculatedPerimeter: 0,
        createdAt: serverTimestamp(),
      });
      resetIntake();
      router.push(`/job/${ref.id}`);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Could not create the job.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function deleteJob(jobId: string) {
    if (!user) return;
    const confirmed = window.confirm(
      "Permanently delete this job? This cannot be undone.",
    );
    if (!confirmed) return;
    try {
      await deleteDoc(doc(db, "jobs", jobId));
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : "Could not delete the job.",
      );
    }
  }

  async function handleLogout() {
    await logout();
    router.replace("/auth");
  }

  if (loading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Loading</p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <Logo onReset={resetIntake} />
          <div className="flex items-center gap-4">
            <span className="hidden text-xs text-muted sm:inline">
              {user.email}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="border border-line bg-paper px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-charcoal transition-colors hover:bg-mist"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <section className="border-b border-line">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <h1 className="text-xs uppercase tracking-[0.22em] text-muted">
            Work intake
          </h1>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-charcoal">
            New measurement
          </h2>

          <form
            onSubmit={initializeJob}
            className="mt-8 grid gap-4 sm:grid-cols-[1fr_220px_auto]"
          >
            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">
                Search address
              </span>
              <AddressAutocomplete
                value={address}
                onValueChange={handleAddressTyped}
                onSelect={handlePlaceSelect}
                placeholder="123 Main Street, Springfield"
              />
              {coords ? (
                <span className="mt-1 block font-mono text-[10px] tracking-tight text-muted">
                  {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
                </span>
              ) : null}
            </label>

            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-muted">
                Surface type
              </span>
              <select
                value={surfaceType}
                onChange={(e) => setSurfaceType(e.target.value as SurfaceType)}
                className="w-full appearance-none border border-line bg-paper px-3 py-3 text-sm text-charcoal focus:border-charcoal"
              >
                {SURFACE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={creating}
                className="w-full bg-charcoal px-6 py-3 text-[11px] uppercase tracking-[0.18em] text-paper transition-colors hover:bg-graphite disabled:opacity-50 sm:w-auto"
              >
                {creating ? "Creating…" : "Initialize job"}
              </button>
            </div>
          </form>

          {formError ? (
            <p className="mt-4 border border-charcoal bg-mist px-3 py-2 text-xs text-charcoal">
              {formError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="mb-6 flex items-baseline justify-between">
            <div>
              <h2 className="text-xs uppercase tracking-[0.22em] text-muted">
                Historical feed
              </h2>
              <p className="mt-1 text-sm text-graphite">
                {jobs.length} {jobs.length === 1 ? "job" : "jobs"} on record
              </p>
            </div>
          </div>

          <JobsTable
            jobs={jobs}
            loading={jobsLoading}
            onOpen={(id) => router.push(`/job/${id}`)}
            onDelete={(id) => deleteJob(id)}
          />
        </div>
      </section>
    </main>
  );
}

interface JobsTableProps {
  jobs: JobDoc[];
  loading: boolean;
  onOpen: (jobId: string) => void;
  onDelete: (jobId: string) => void;
}

function JobsTable({ jobs, loading, onOpen, onDelete }: JobsTableProps) {
  const rows = useMemo(() => jobs, [jobs]);

  if (loading) {
    return (
      <div className="border border-line px-4 py-12 text-center text-xs uppercase tracking-[0.18em] text-muted">
        Loading jobs…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="border border-line px-4 py-16 text-center">
        <p className="text-sm font-medium text-charcoal">No jobs yet.</p>
        <p className="mt-1 text-xs text-muted">
          Initialize one above to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-line">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-bone text-[11px] uppercase tracking-[0.18em] text-muted">
            <th className="px-4 py-3 font-medium">Address</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Area</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((job) => (
            <tr
              key={job.jobId}
              onClick={() => onOpen(job.jobId)}
              className="cursor-pointer border-b border-line last:border-b-0 transition-colors hover:bg-mist"
            >
              <td className="px-4 py-4 align-middle text-charcoal">
                {job.address || <span className="text-muted">—</span>}
              </td>
              <td className="px-4 py-4 align-middle text-graphite">
                {job.surfaceType}
              </td>
              <td className="px-4 py-4 align-middle text-graphite">
                {job.calculatedArea > 0
                  ? `${Math.round(job.calculatedArea * 10.7639).toLocaleString()} sq ft`
                  : "—"}
              </td>
              <td className="px-4 py-4 align-middle">
                <StatusPill status={job.status} />
              </td>
              <td className="px-4 py-4 text-right align-middle">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(job.jobId);
                  }}
                  aria-label="Delete job"
                  className="inline-flex items-center justify-center border border-line bg-paper px-2.5 py-1.5 text-charcoal transition-colors hover:border-charcoal hover:bg-charcoal hover:text-paper"
                >
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: JobDoc["status"] }) {
  const label = status.replace("_", " ");
  const styles =
    status === "complete"
      ? "border-charcoal bg-charcoal text-paper"
      : status === "in_progress"
        ? "border-graphite text-graphite"
        : "border-line text-muted";
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${styles}`}
    >
      {label}
    </span>
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
