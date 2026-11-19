/**
 * useDebouncedValue — QA fix m-24.
 * Pencarian di banyak layar memanggil API di setiap ketikan.
 * Hook ini menahan nilai 300ms setelah ketikan terakhir sebelum
 * nilai diteruskan ke pemicu fetch.
 */
import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
