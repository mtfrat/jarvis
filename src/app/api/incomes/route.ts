import { NextResponse } from 'next/server';
import { createIncome, getIncomes, deleteIncome } from '@/lib/income-service';
import { requireDashboardAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || undefined;

    const incomes = await getIncomes({ month });
    return NextResponse.json(incomes);
  } catch (error) {
    console.error('Error in GET /api/incomes:', error);
    return NextResponse.json({ error: 'Failed to fetch incomes' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const body = await request.json();
    if (!body.amount || !body.description) {
      return NextResponse.json({ error: 'Monto y descripción son requeridos' }, { status: 400 });
    }

    const created = await createIncome({
      amount: Number(body.amount),
      currency: body.currency || 'ARS',
      description: body.description,
      date: body.date,
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/incomes:', error);
    const message = error instanceof Error ? error.message : 'Failed to create income';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 });
    }

    const success = await deleteIncome(id);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete income' }, { status: 500 });
    }
    return NextResponse.json({ success });
  } catch (error) {
    console.error('Error in DELETE /api/incomes:', error);
    return NextResponse.json({ error: 'Failed to delete income' }, { status: 500 });
  }
}
