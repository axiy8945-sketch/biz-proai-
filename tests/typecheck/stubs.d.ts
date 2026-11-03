// Minimal type stubs so the app can be type-checked in an offline sandbox
// (the npm registry is unavailable here). Real projects use the packages' own types.
declare module 'server-only' {}

declare module 'react' {
  export type ReactNode = any;
  export type SVGProps<T> = { [k: string]: any } & { _t?: T };
  export function useState<S>(init: S | (() => S)): [S, (v: S | ((prev: S) => S)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: unknown[]): void;
  export function useRef<T>(init: T): { current: T };
  export function useRef<T>(init: T | null): { current: T | null };
  export function useMemo<T>(fn: () => T, deps: unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: unknown[]): T;
  export function useTransition(): [boolean, (cb: () => void | Promise<void>) => void];
  export function useId(): string;
  export function cache<T extends (...a: any[]) => any>(fn: T): T;
}

declare namespace JSX {
  type Element = any;
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: string | number | null }
  interface IntrinsicElements { [tag: string]: any }
}

declare module 'next' {
  export type Metadata = Record<string, unknown>;
  export type Viewport = Record<string, unknown>;
}
declare module 'next/link' {
  const Link: (props: { href: string; children?: any; className?: string; scroll?: boolean; onClick?: () => void; [k: string]: any }) => any;
  export default Link;
}
declare module 'next/navigation' {
  export function redirect(url: string): never;
  export function notFound(): never;
  export function useRouter(): { push(u: string): void; refresh(): void; back(): void };
  export function usePathname(): string | null;
}
declare module 'next/headers' {
  type Cookie = { name: string; value: string };
  export function cookies(): Promise<{ get(n: string): Cookie | undefined; getAll(): Cookie[]; set(n: string, v: string, o?: Record<string, unknown>): void }>;
  export function headers(): Promise<{ get(n: string): string | null }>;
}
declare module 'next/server' {
  export class NextRequest extends Request {
    nextUrl: URL & { clone(): URL & { pathname: string; search: string } };
    cookies: { getAll(): { name: string; value: string }[]; set(n: string, v: string): void };
  }
  export class NextResponse extends Response {
    static json(body: unknown, init?: { status?: number }): NextResponse;
    static next(init?: { request: NextRequest }): NextResponse;
    static redirect(url: URL | string): NextResponse;
    cookies: { set(n: string, v: string, o?: Record<string, unknown>): void };
  }
}
declare module 'next/font/google' {
  export function Inter(o: Record<string, unknown>): { variable: string; className: string };
}
declare module '@supabase/supabase-js' {
  export type SupabaseClient = any;
  export function createClient(url: string, key: string, opts?: unknown): SupabaseClient;
}
declare module '@supabase/ssr' {
  import type { SupabaseClient } from '@supabase/supabase-js';
  export function createServerClient(url: string, key: string, opts: unknown): SupabaseClient;
  export function createBrowserClient(url: string, key: string): SupabaseClient;
}
declare module '*.css' {}
