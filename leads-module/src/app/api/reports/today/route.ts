// GET /api/reports/today — dnešní denní report

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const report = await prisma.dailyReport.findUnique({
    where: { datum: today },
  });

  if (!report) {
    return NextResponse.json({ data: null }, { status: 200 });
  }

  return NextResponse.json({ data: report });
}
