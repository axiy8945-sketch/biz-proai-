export function redirect(url: string): never { throw new Error('redirect:' + url); }
export function notFound(): never { throw new Error('notFound'); }
export function useRouter() { return { push() {}, refresh() {}, back() {} }; }
export function usePathname() { return (globalThis as { __path?: string }).__path ?? '/'; }
