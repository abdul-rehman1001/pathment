'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useDebounce } from './useDebounce';

/**
 * Debounced localStorage draft for in-progress forms. Restores once on mount
 * so closing with Escape (or Cancel) doesn't throw away typed input.
 */
export function useFormDraft<T>(storageKey: string, value: T, apply: (draft: T) => void) {
  const skipSave = useRef(true);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    skipSave.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) apply(JSON.parse(raw) as T);
    } catch {
      /* ignore quota / parse errors */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per key
  }, [storageKey]);

  const serialized = JSON.stringify(value);
  const debounced = useDebounce(serialized, 500);
  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, debounced);
    } catch {
      /* ignore quota errors */
    }
  }, [debounced, storageKey]);

  const flush = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(valueRef.current));
    } catch {
      /* ignore quota errors */
    }
  }, [storageKey]);

  return { flush };
}

export function clearFormDraft(storageKey: string) {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}
