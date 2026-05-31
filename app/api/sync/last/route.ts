import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const last = await db.syncLog.findFirst({
    where: { status: "success" },
    orderBy: { createdAt: "desc" },
  });

  if (!last) return NextResponse.json({ lastSync: null });

  const time = last.createdAt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  return NextResponse.json({ lastSync: time });
}
