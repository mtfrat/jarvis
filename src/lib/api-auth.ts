import { NextResponse } from 'next/server';

export function requireDashboardAuth(request: Request): NextResponse | null {
  const secret = process.env.NEXT_PUBLIC_DASHBOARD_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_DASHBOARD_SECRET no está configurado en .env.local' },
      { status: 503 }
    );
  }

  const header =
    request.headers.get('x-dashboard-secret') ?? request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (token !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
