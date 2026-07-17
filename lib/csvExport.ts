import type { JobDoc, RoofSegment } from "./types";

/**
 * Client-side CSV export for SquareRate jobs.
 *
 * Browser-only: it touches `Blob`, `URL.createObjectURL`, and `document`, so
 * only ever call it from an event handler in a `"use client"` component.
 *
 * Output is intentionally **flat / wide** so it drops straight into a CRM's
 * field-mapping screen (JobNimbus, Jobber, AccuLynx) with no spreadsheet
 * surgery:
 *   - One row per job. Every row shares the exact same columns.
 *   - Roof planes are spread across fixed `Segment_N_*` columns (capped at
 *     {@link MAX_SEGMENT_COLUMNS}); a job with fewer planes leaves those cells
 *     blank rather than emitting dashes or nested data.
 *   - Planes are sorted largest-area-first, so `Segment_1` is the dominant
 *     plane and the cap drops only the smallest slivers.
 *   - Units follow the caller's metric/imperial choice; the area/perimeter
 *     header names change to match (`_SqFt`/`_Ft` vs `_SqM`/`_M`) so values and
 *     labels never disagree. Pitch/azimuth are always degrees.
 */

export type Units = "metric" | "imperial";

/** Exact factor used by the Solar / backend layer (sq m → sq ft). */
const SQFT_PER_SQM = 10.7639104;
const FT_PER_M = 3.28084;

/** Hard cap on per-plane columns so a pathological roof can't explode the
 *  header row. Real roofs comfortably fit; extras are dropped smallest-first. */
const MAX_SEGMENT_COLUMNS = 12;

interface ExportOptions {
  units: Units;
  /** Override the generated download filename (without forcing the extension). */
  filename?: string;
}

/** Export a list of jobs (e.g. the dashboard's completed feed). No-ops on an
 *  empty list so callers don't have to guard. */
export function exportJobsToCSV(jobs: JobDoc[], options: ExportOptions): void {
  if (jobs.length === 0) return;
  const csv = buildJobsCsv(jobs, options.units);
  triggerDownload(csv, options.filename ?? defaultBulkFilename());
}

/** Export a single job (the workspace's per-job button once finalized). */
export function exportJobToCSV(job: JobDoc, options: ExportOptions): void {
  const csv = buildJobsCsv([job], options.units);
  triggerDownload(csv, options.filename ?? defaultJobFilename(job));
}

function buildJobsCsv(jobs: JobDoc[], units: Units): string {
  const areaUnit = units === "imperial" ? "SqFt" : "SqM";
  const perimeterUnit = units === "imperial" ? "Ft" : "M";

  // Width the segment columns to the busiest roof in the batch (capped), so a
  // single-plane export doesn't carry 12 empty groups while still keeping every
  // row in this file aligned to the same schema.
  const segmentColumns = Math.min(
    MAX_SEGMENT_COLUMNS,
    jobs.reduce(
      (max, job) => Math.max(max, job.roofStats?.segments?.length ?? 0),
      0,
    ),
  );

  const headers = [
    "Job_ID",
    "Address",
    "Surface_Type",
    "Status",
    "Date_Created",
    `Total_Area_${areaUnit}`,
    `Perimeter_${perimeterUnit}`,
    "Max_Panels",
    "Dominant_Pitch",
    "Segment_Count",
  ];
  for (let i = 1; i <= segmentColumns; i += 1) {
    headers.push(
      `Segment_${i}_Area_${areaUnit}`,
      `Segment_${i}_Pitch`,
      `Segment_${i}_Azimuth`,
    );
  }

  const rows = jobs.map((job) => buildRow(job, units, segmentColumns));
  const lines = [headers, ...rows].map((cells) =>
    cells.map(escapeCsvCell).join(","),
  );
  // BOM so Excel reads UTF-8 addresses (accents, etc.) correctly; CRLF per RFC 4180.
  return `\uFEFF${lines.join("\r\n")}`;
}

function buildRow(job: JobDoc, units: Units, segmentColumns: number): string[] {
  const segments = sortedSegments(job.roofStats?.segments ?? []);
  const dominant = segments[0];

  const row: string[] = [
    job.jobId,
    job.address ?? "",
    job.surfaceType ?? "",
    job.status ?? "",
    formatDate(job.createdAt),
    formatArea(job.calculatedArea, units),
    formatPerimeter(job.calculatedPerimeter, units),
    typeof job.roofStats?.maxPanels === "number"
      ? String(job.roofStats.maxPanels)
      : "",
    formatAngle(dominant?.pitch),
    segments.length > 0 ? String(segments.length) : "",
  ];

  for (let i = 0; i < segmentColumns; i += 1) {
    const segment = segments[i];
    row.push(
      formatArea(segment?.area, units),
      formatAngle(segment?.pitch),
      formatAngle(segment?.azimuth),
    );
  }
  return row;
}

/** Largest-area plane first; degenerate (non-positive) planes dropped. */
function sortedSegments(segments: RoofSegment[]): RoofSegment[] {
  return segments.filter((s) => s.area > 0).sort((a, b) => b.area - a.area);
}

function formatArea(areaSqM: number | undefined, units: Units): string {
  if (typeof areaSqM !== "number" || areaSqM <= 0) return "";
  const value = units === "imperial" ? areaSqM * SQFT_PER_SQM : areaSqM;
  return value.toFixed(2);
}

function formatPerimeter(perimeterM: number | undefined, units: Units): string {
  if (typeof perimeterM !== "number" || perimeterM <= 0) return "";
  const value = units === "imperial" ? perimeterM * FT_PER_M : perimeterM;
  return value.toFixed(2);
}

/** Degrees to one decimal; blank when the field is absent. */
function formatAngle(value: number | undefined): string {
  return typeof value === "number" ? value.toFixed(1) : "";
}

function formatDate(createdAt: JobDoc["createdAt"]): string {
  if (!createdAt) return "";
  try {
    return createdAt.toDate().toLocaleDateString();
  } catch {
    return "";
  }
}

/** RFC 4180: quote any cell containing a comma, quote, CR or LF; double any
 *  embedded quotes. Critical for addresses with commas. */
function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function triggerDownload(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function defaultBulkFilename(): string {
  return `squarerate-estimates-${todayStamp()}.csv`;
}

function defaultJobFilename(job: JobDoc): string {
  const slug =
    (job.address || job.jobId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || job.jobId;
  return `squarerate-${slug}.csv`;
}

function todayStamp(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
