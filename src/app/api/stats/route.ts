import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/expense-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || undefined;
    const stats = await getDashboardStats(month);
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error in /api/stats:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 });
  }
}
