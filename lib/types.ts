import type { Timestamp } from "firebase/firestore";

export type Tier = "trial" | "pro" | "enterprise";

export interface UserDoc {
  uid: string;
  email: string;
  tier: Tier;
  api_queries_this_month: number;
}

export type SurfaceType = "Hardscape" | "Turf" | "Roof";

export type JobStatus = "pending" | "in_progress" | "complete";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface JobDoc {
  jobId: string;
  userId: string;
  address: string;
  surfaceType: SurfaceType;
  status: JobStatus;
  /** Lat/lng of the address selected from Places Autocomplete. */
  lat: number;
  lng: number;
  polygonCoords: LatLng[];
  /** Canonical area in square meters (converted to ft² at display time). */
  calculatedArea: number;
  /** Canonical perimeter in meters (converted to linear ft at display time). */
  calculatedPerimeter: number;
  createdAt: Timestamp | null;
}

export const SURFACE_TYPES: SurfaceType[] = ["Hardscape", "Turf", "Roof"];
