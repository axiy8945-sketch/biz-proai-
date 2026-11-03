'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/errors';

/** Runs a server action, tracks pending/error state and refreshes server data on success. */
export function useAction<A extends unknown[], T>(action: (...args: A) => Promise<ActionResult<T>>) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = useCallback((...args: A) => new Promise<ActionResult<T>>((resolve) => {
    setError(null); setOk(null);
    start(async () => {
      try {
        const res = await action(...args);
        if (res.ok) { setOk(res.message ?? null); router.refresh(); } else setError(res.error);
        resolve(res);
      } catch {
        const res = { ok: false as const, error: 'Network error' };
        setError(res.error);
        resolve(res);
      }
    });
  }), [action, router]);
  return { run, pending, error, ok, setError };
}

export function requestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}
