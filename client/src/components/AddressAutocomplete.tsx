import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY;
const FORGE_BASE_URL =
  import.meta.env.VITE_FRONTEND_FORGE_API_URL ||
  "https://forge.butterfly-effect.dev";
const MAPS_PROXY_URL = `${FORGE_BASE_URL}/v1/maps/proxy`;

function loadMapScript() {
  return new Promise((resolve) => {
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }

    const script = document.createElement("script");
    script.src = `${MAPS_PROXY_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=places`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => resolve(window.google);
    document.head.appendChild(script);
  });
}

interface AddressAutocompleteProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function AddressAutocomplete({
  id,
  value,
  onChange,
  placeholder = "Enter address...",
  className,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    let mounted = true;

    loadMapScript().then(() => {
      if (!mounted || !inputRef.current || !window.google) return;

      // Initialize autocomplete
      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        inputRef.current,
        {
          types: ["address"],
          fields: ["formatted_address", "geometry", "name"],
        }
      );

      // Listen for place selection
      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current?.getPlace();
        if (place?.formatted_address) {
          onChange(place.formatted_address);
        }
      });
    });

    return () => {
      mounted = false;
      if (autocompleteRef.current) {
        window.google?.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [onChange]);

  return (
    <Input
      ref={inputRef}
      id={id}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  );
}
