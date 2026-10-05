import { NextResponse } from 'next/server';
import { addSplitExpense, deleteSplitExpense } from '@/lib/split-service';
import { requireDashboardAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const body = await request.json();
    if (!body.meeting_id || !body.description || !body.paid_by || body.amount === undefined) {
      return NextResponse.json(
        { error: 'meeting_id, description, amount y paid_by son requeridos' },
        { status: 400 }
      );
    }

    const created = await addSplitExpense({
      meeting_id: String(body.meeting_id),
      description: String(body.description),
      amount: Number(body.amount),
      paid_by: String(body.paid_by),
      date: body.date ? String(body.date) : undefined,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/splits/expenses:', error);
    const message = error instanceof Error ? error.message : 'Failed to add split expense';
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

    await deleteSplitExpense(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/splits/expenses:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete split expense';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
