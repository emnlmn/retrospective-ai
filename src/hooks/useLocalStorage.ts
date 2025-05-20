
"use client";

// This hook might still be useful for very simple, non-Zustand related local storage needs.
// However, for the main application state (boards, user), Zustand's `persist` middleware is now used.
// Keeping this file in case it's needed for other isolated local storage uses.
// If not, it can be deleted.

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
          window.dispatchEvent(new StorageEvent('storage', { key, newValue: JSON.stringify(valueToStore) }));
        }
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue] 
  );
  
  const prevKeyRef = useRef<string>();

  useEffect(() => {
    const resolvedInitialValue = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;

    if (typeof window !== 'undefined') {
      if (prevKeyRef.current !== key) {
        const item = window.localStorage.getItem(key);
        setStoredValue(tryParse<T>(item, resolvedInitialValue));
      }
      prevKeyRef.current = key; 

      const handleStorageChange = (event: StorageEvent) => {
        if (event.key === key) {
          const eventResolvedInitialValue = typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
          if (event.newValue !== null) {
            setStoredValue(tryParse<T>(event.newValue, eventResolvedInitialValue));
          } else {
            setStoredValue(eventResolvedInitialValue);
          }
        }
      };
      
      window.addEventListener('storage', handleStorageChange);
      
      return () => {
        window.removeEventListener('storage', handleStorageChange);
      };
    }
    return () => {};
  }, [key, initialValue]); // Removed setStoredValue from deps as it's stable from useCallback.
                                        

  return [storedValue, setValue];
}
