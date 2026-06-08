import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildCyclesForLaundry } from "@/lib/sync";

// POST /api/sync/fix-cycles?id=<laundryId>
// Apaga todos os ciclos de uma lavanderia e reconstrói a partir das vendas no banco.
export async function POST(req: NextRequest) {
  const laundryId = req.nextUrl.searchParams.get("id");
  if (!laundryId) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const laundry = await db.laundry.findUnique({
    where: { id: laundryId },
    select: { name: true },
  });
  if (!laundry) return NextResponse.json({ error: "Lavanderia não encontrada" }, { status: 404 });

  const deletedCycles = await db.cycle.deleteMany({ where: { laundryId } });
  await buildCyclesForLaundry(laundryId);
  const newCycleCount = await db.cycle.count({ where: { laundryId } });

  return NextResponse.json({
    ok: true,
    laundry: laundry.name,
    deletedCycles: deletedCycles.count,
    newCycles: newCycleCount,
  });
}
