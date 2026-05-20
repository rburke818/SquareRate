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
