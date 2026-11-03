import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch (e) {
    // Never take the whole site down because session refresh failed; pages re-check auth themselves.
    console.error('middleware_error', e instanceof Error ? e.message : e);
    return NextResponse.next({ request });
  }
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};
