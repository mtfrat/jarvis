import { NextResponse } from 'next/server';
import { getBudgets, upsertBudget, deleteBudget } from '@/lib/budget-service';
import { requireDashboardAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const budgets = await getBudgets();
    return NextResponse.json(budgets);
  } catch (error) {
    console.error('Error in GET /api/budgets:', error);
    return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const body = await request.json();
    if (!body.category || !body.monthly_amount) {
      return NextResponse.json({ error: 'Categoría y monto son requeridos' }, { status: 400 });
    }

    const budget = await upsertBudget(String(body.category), Number(body.monthly_amount));
    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/budgets:', error);
    const message = error instanceof Error ? error.message : 'Failed to save budget';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    if (!category) {
      return NextResponse.json({ error: 'Categoría es requerida' }, { status: 400 });
    }

    const success = await deleteBudget(category);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete budget' }, { status: 500 });
    }
    return NextResponse.json({ success });
  } catch (error) {
    console.error('Error in DELETE /api/budgets:', error);
    return NextResponse.json({ error: 'Failed to delete budget' }, { status: 500 });
  }
}
