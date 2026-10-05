import { NextResponse } from 'next/server';
import {
  listSplitMeetings,
  createSplitMeeting,
  getSplitMeeting,
  deleteSplitMeeting,
  markMemberAddedToJarvis,
} from '@/lib/split-service';
import { requireDashboardAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (id) {
      const detail = await getSplitMeeting(id);
      if (!detail) return NextResponse.json({ error: 'Reunión no encontrada' }, { status: 404 });
      return NextResponse.json(detail);
    }

    const meetings = await listSplitMeetings();
    return NextResponse.json(meetings);
  } catch (error) {
    console.error('Error in GET /api/splits:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch splits';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const created = await createSplitMeeting({
      name: String(body.name ?? ''),
      date: body.date ? String(body.date) : undefined,
      currency: body.currency === 'USD' ? 'USD' : 'ARS',
      members: Array.isArray(body.members) ? body.members.map(String) : [],
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/splits:', error);
    const message = error instanceof Error ? error.message : 'Failed to create meeting';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const body = await request.json();
    if (!body.member_id) {
      return NextResponse.json({ error: 'member_id es requerido' }, { status: 400 });
    }

    await markMemberAddedToJarvis(String(body.member_id));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in PATCH /api/splits:', error);
    const message = error instanceof Error ? error.message : 'Failed to mark member';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID es requerido' }, { status: 400 });

    await deleteSplitMeeting(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/splits:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete meeting';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
