import { useEffect, useState } from 'react';

/** Returns `value` after it has stopped changing for `delayMs`. Used for the card price lookup (ADR-134 3.5). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default useDebouncedValue;
