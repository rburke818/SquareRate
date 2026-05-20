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
  /**
   * When provided, a clear "X" button is rendered inside the input whenever
   * `value` is non-empty. The parent is expected to wipe both the address
   * string and any selected lat/lng in the callback.
   */
  onClear?: () => void;
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
  onClear,
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reserve room on the right edge for the clear button so its glyph never
  // overlaps user text. Keep the rest of the styling overridable via prop.
  const finalInputClassName =
    inputClassName ??
    "w-full border border-line bg-paper px-3 py-3 pr-10 text-sm text-charcoal placeholder:text-muted focus:border-charcoal";

  const showClear = Boolean(onClear) && value.length > 0 && !disabled;

  const inputGroup = (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={finalInputClassName}
      />
      {showClear ? (
        <button
          type="button"
          // The Places dropdown blurs the input on mousedown; pre-empting the
          // default keeps focus on the field so the user can keep typing.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onClear?.();
            inputRef.current?.focus();
          }}
          aria-label="Clear address"
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center border border-line bg-paper text-graphite transition-colors hover:border-charcoal hover:bg-charcoal hover:text-paper"
        >
          <ClearIcon />
        </button>
      ) : null}
    </div>
  );

  if (loadError || !isLoaded) {
    return inputGroup;
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
      {inputGroup}
    </Autocomplete>
  );
}

function ClearIcon() {
  return (
    <svg
      aria-hidden
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1.5 1.5l7 7m0-7l-7 7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  );
}
