import { NextResponse } from 'next/server';
import {
  getExpenses,
  createExpense,
  deleteExpense,
  deleteInstallmentGroup,
  updateExpense,
  setExpenseDiscount,
  UpdateExpenseFields,
} from '@/lib/expense-service';
import { requireDashboardAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || undefined;

    const expenses = await getExpenses({ month });
    return NextResponse.json(expenses);
  } catch (error) {
    console.error('Error in GET /api/expenses:', error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

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

export async function PATCH(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 });
    }

    const fields: UpdateExpenseFields = {};
    if (body.description !== undefined) fields.description = String(body.description);
    if (body.category !== undefined) fields.category = String(body.category);
    if (body.payment_method !== undefined) fields.payment_method = String(body.payment_method);
    if (body.date !== undefined) fields.date = String(body.date);
    if (body.amount !== undefined) fields.amount = Number(body.amount);

    const id = String(body.id);
    const updated = await updateExpense(id, fields);

    if (body.discount_amount !== undefined) {
      await setExpenseDiscount(id, Number(body.discount_amount));
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error in PATCH /api/expenses:', error);
    const message = error instanceof Error ? error.message : 'Failed to update expense';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const groupId = searchParams.get('group_id');
    if (!id && !groupId) {
      return NextResponse.json({ error: 'ID es requerido' }, { status: 400 });
    }

    const success = groupId
      ? await deleteInstallmentGroup(groupId)
      : await deleteExpense(id!);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
    }
    return NextResponse.json({ success });
  } catch (error) {
    console.error('Error in DELETE /api/expenses:', error);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
