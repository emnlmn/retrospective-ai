
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';

function tryParse<T>(value: string | null, fallback: T): T {
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function useLocalStorage<T>(key: string, initialValue: T | (() => T)): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
    }
    const item = window.localStorage.getItem(key);
    return tryParse<T>(item, typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue);
  });

  const setValue = useCallback(
    (value: T | ((val: T) => T)) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
          // Dispatch a storage event so other tabs can sync
          window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(valueToStore) }));
        }
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue] // storedValue is needed here because `value` can be a function of storedValue
  );
  
  const prevKeyRef = useRef<string>();

  useEffect(() => {
    const resolvedInitialValue = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;

    if (typeof window !== 'undefined') {
      // Only re-read from localStorage and call setStoredValue if the key has actually changed.
      // This prevents loops if `initialValue` is an unstable function reference but `key` is stable.
      // The `useState` initializer handles the very first load.
      if (prevKeyRef.current !== key) {
        const item = window.localStorage.getItem(key);
        setStoredValue(tryParse<T>(item, resolvedInitialValue));
      }
      prevKeyRef.current = key; // Update the ref for the next render

      const handleStorageChange = (event: StorageEvent) => {
        if (event.key === key) {
           // Re-resolve initialValue at the time of event in case it changed
          const eventResolvedInitialValue = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
          if (event.newValue !== null) {
            setStoredValue(tryParse<T>(event.newValue, eventResolvedInitialValue));
          } else {
            // Item was removed from localStorage in another tab
            setStoredValue(eventResolvedInitialValue);
          }
        }
      };
      
      window.addEventListener('storage', handleStorageChange);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
    // This return is for the case where window is undefined (SSR cleanup)
    return () => {};
  }, [key, initialValue, setStoredValue]); // setStoredValue is stable. initialValue is kept for fallback logic in handleStorageChange and resolvedInitialValue.
                                        // The guard `if (prevKeyRef.current !== key)` protects the setStoredValue call.


  return [storedValue, setValue];
}

