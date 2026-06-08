import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// DELETE /api/sync/reset
// Remove todos os SyncLog de "sales" para forçar re-sync histórico completo na próxima chamada
export async function DELETE() {
  const deleted = await db.syncLog.deleteMany({ where: { entity: "sales" } });
  return NextResponse.json({ ok: true, deletedLogs: deleted.count });
}
