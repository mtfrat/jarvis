import { NextResponse } from 'next/server';
import { settleTransfer, unsettleTransfer } from '@/lib/split-service';
import { requireDashboardAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const authError = requireDashboardAuth(request);
    if (authError) return authError;

    const body = await request.json();
    if (!body.meeting_id || !body.from_id || !body.to_id || !body.action) {
      return NextResponse.json(
        { error: 'meeting_id, from_id, to_id y action son requeridos' },
        { status: 400 }
      );
    }

    const params = {
      meeting_id: String(body.meeting_id),
      from_id: String(body.from_id),
      to_id: String(body.to_id),
    };

    if (body.action === 'unsettle') {
      await unsettleTransfer(params);
    } else if (body.action === 'settle') {
      const amountCents = Number(body.amount_cents);
      if (!Number.isInteger(amountCents) || amountCents <= 0) {
        return NextResponse.json(
          { error: 'amount_cents debe ser un entero > 0' },
          { status: 400 }
        );
      }
      await settleTransfer({ ...params, amount_cents: amountCents });
    } else {
      return NextResponse.json(
        { error: 'action debe ser "settle" o "unsettle"' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in POST /api/splits/settlements:', error);
    const message = error instanceof Error ? error.message : 'Failed to update settlement';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
