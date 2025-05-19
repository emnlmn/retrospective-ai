"use client";

import { useState, useEffect, useCallback } from 'react';

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
    [key, storedValue]
  );
  
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === key && event.newValue !== null) {
         setStoredValue(tryParse<T>(event.newValue, typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue));
      } else if (event.key === key && event.newValue === null) {
        setStoredValue(typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue);
      }
    };

    if (typeof window !== 'undefined') {
      setStoredValue(tryParse<T>(window.localStorage.getItem(key), typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue));
      window.addEventListener('storage', handleStorageChange);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
      }
    };
  }, [key, initialValue]);


  return [storedValue, setValue];
}
