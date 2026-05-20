"use client";

import { Autocomplete, useJsApiLoader } from "@react-google-maps/api";
import { useRef } from "react";

import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_LIBRARIES,
  GOOGLE_MAPS_LOADER_ID,
} from "@/lib/maps";

export interface AddressSelection {
  address: string;
  lat: number;
  lng: number;
}

interface AddressAutocompleteProps {
  value: string;
  onValueChange: (next: string) => void;
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Wraps a styled `<input>` with Google Places Autocomplete. Until the Maps
 * script has loaded the input behaves as plain text — the user can still type
 * but no suggestions appear, and lat/lng will remain unresolved.
 */
export function AddressAutocomplete({
  value,
  onValueChange,
  onSelect,
  placeholder,
  inputClassName,
  disabled,
  id,
}: AddressAutocompleteProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_LOADER_ID,
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const finalInputClassName =
    inputClassName ??
    "w-full border border-line bg-paper px-3 py-3 text-sm text-charcoal placeholder:text-muted focus:border-charcoal";

  const inputEl = (
    <input
      id={id}
      type="text"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      className={finalInputClassName}
    />
  );

  if (loadError || !isLoaded) {
    return inputEl;
  }

  return (
    <Autocomplete
      onLoad={(ac) => {
        autocompleteRef.current = ac;
      }}
      onUnmount={() => {
        autocompleteRef.current = null;
      }}
      onPlaceChanged={() => {
        const ac = autocompleteRef.current;
        if (!ac) return;
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        if (!loc) return;
        const formatted =
          place.formatted_address ?? place.name ?? value;
        onValueChange(formatted);
        onSelect({
          address: formatted,
          lat: loc.lat(),
          lng: loc.lng(),
        });
      }}
      fields={["formatted_address", "geometry", "name"]}
      types={["geocode"]}
    >
      {inputEl}
    </Autocomplete>
  );
}
