import type { Libraries } from "@react-google-maps/api";

export const GOOGLE_MAPS_API_KEY =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/**
 * Reference-stable list of Maps JS libraries that SquareRate depends on.
 * `useJsApiLoader` re-loads the script whenever this array's identity changes,
 * so it must live as a module-level constant.
 *
 * - `places`   → Dashboard address autocomplete
 * - `geometry` → client-side `computeArea` / `computeLength`
 * - `drawing`  → manual polygon `DrawingManager` on the job canvas
 */
export const GOOGLE_MAPS_LIBRARIES: Libraries = [
  "places",
  "geometry",
  "drawing",
];

/**
 * Shared loader id. Reusing it across the Dashboard and Job pages guarantees
 * a single `<script>` tag is injected regardless of which route mounts first.
 */
export const GOOGLE_MAPS_LOADER_ID = "squarerate-google-maps-loader";

/**
 * Hard-pinned Maps JS API version (`v=` query param on the loader script).
 *
 * Maps JS `3.65` removed the `DrawingManager` functionality we rely on for the
 * job-canvas polygon tool, so the rolling `weekly` channel crashes on mount.
 * Pinning to `3.64` keeps `drawing` available until we migrate off it. Keep
 * this value in sync across every `useJsApiLoader` call — they share
 * `GOOGLE_MAPS_LOADER_ID`, so mismatched options would conflict.
 */
export const GOOGLE_MAPS_API_VERSION = "3.64";
