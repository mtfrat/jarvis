import { NextResponse } from 'next/server';
import { getExpenses, createExpense, deleteExpense } from '@/lib/expense-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || undefined;
    const category = searchParams.get('category') || undefined;
    const search = searchParams.get('search') || undefined;

    const expenses = await getExpenses({ month, category, search });
    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Error in GET /api/expenses:', error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.amount || !body.description || !body.category) {
      return NextResponse.json({ error: 'Monto, descripción y categoría son requeridos' }, { status: 400 });
    }

    const created = await createExpense({
      amount: Number(body.amount),
      currency: body.currency || 'ARS',
      description: body.description,
      category: body.category,
      payment_method: body.payment_method || 'Otro',
      installments_total: Number(body.installments_total) || 1,
      date: body.date,
      source: 'dashboard_manual',
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/expenses:', error);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 });
    }

    const success = await deleteExpense(id);
    return NextResponse.json({ success });
  } catch (error) {
    console.error('Error in DELETE /api/expenses:', error);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
