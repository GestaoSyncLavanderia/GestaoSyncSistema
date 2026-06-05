import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST() {
  const { count } = await db.syncLog.deleteMany({ where: { entity: "sales" } });
  return NextResponse.json({ ok: true, deleted: count });
}
