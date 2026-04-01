import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    google?: typeof google;
  }
}

let scriptUrlCache: string | null = null;

async function getMapScriptUrl(): Promise<string> {
  if (scriptUrlCache) return scriptUrlCache;
  const res = await fetch("/api/maps/script-url");
  const data = await res.json();
  scriptUrlCache = data.scriptUrl;
  return scriptUrlCache!;
}

function loadMapScript() {
  return new Promise(async (resolve) => {
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }

    const scriptUrl = await getMapScriptUrl();
    const script = document.createElement("script");
    script.src = scriptUrl;
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

      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        inputRef.current,
        {
          types: ["address"],
          fields: ["formatted_address", "geometry", "name"],
        }
      );

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
