// GET /api/dashboard/stats — KPI data pro hlavní dashboard

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { DashboardStats } from "@/types";

export async function GET() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const [
    novychDnes,
    novychVcera,
    oslovenoCount,
    jednaniCount,
    stavyRaw,
    topLeads,
    ziskDnes,
  ] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: today } } }),
    prisma.lead.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
    prisma.lead.count({ where: { stav: "OSLOVENO" } }),
    prisma.lead.count({ where: { stav: "JEDNANI" } }),
    prisma.lead.groupBy({ by: ["stav"], _count: { stav: true } }),
    prisma.lead.findMany({
      where: { createdAt: { gte: today } },
      include: {
        parcel: {
          include: { score: true, aiAnalysis: true },
        },
      },
      orderBy: { parcel: { score: { celkove: "desc" } } },
      take: 10,
    }),
    prisma.aIAnalysis.aggregate({
      where: { parcel: { lead: { createdAt: { gte: today } } } },
      _sum: { odhadovanyZisk: true },
    }),
  ]);

  const stavyPrehled = stavyRaw.map(s => ({
    stav: s.stav,
    pocet: s._count.stav,
  }));

  const topPrilezitosti = topLeads.map(l => ({
    leadId: l.id,
    parcelId: l.parcelId,
    kuNazev: l.parcel.kuNazev,
    parcelniCislo: l.parcel.parcelniCislo,
    druhPozemku: l.parcel.druhPozemku,
    vymera: l.parcel.vymera,
    skore: l.parcel.score?.celkove ?? 0,
    odhadovanyZisk: l.parcel.aiAnalysis?.odhadovanyZisk ?? 0,
  }));

  const stats: DashboardStats = {
    novychLeadu: novychDnes,
    novychLeaduDelta: novychDnes - novychVcera,
    oslovenoVlastniku: oslovenoCount,
    aktivnichJednani: jednaniCount,
    odhadovanyZiskDnes: ziskDnes._sum.odhadovanyZisk ?? 0,
    stavyPrehled,
    topPrilezitosti,
  };

  return NextResponse.json({ data: stats });
}
