import { useRef } from "react";

type noop = (...args: any[]) => any;

/**
 * usePersistFn instead of useCallback to reduce cognitive load
 */
export function usePersistFn<T extends noop>(fn: T) {
  const fnRef = useRef<T>(fn);
  // @ts-ignore - React 18 allows ref mutation
  fnRef.current = fn;

  const persistFn = useRef<T>(null);
  if (!persistFn.current) {
    // @ts-ignore - React 18 allows ref mutation
    persistFn.current = function (this: unknown, ...args) {
      return fnRef.current!.apply(this, args);
    } as T;
  }

  return persistFn.current!;
}
