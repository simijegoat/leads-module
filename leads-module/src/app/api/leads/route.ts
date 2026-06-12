// GET  /api/leads  — seznam leadů s filtrováním a stránkováním
// POST /api/leads  — vytvoř nový lead ručně

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { LeadStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const stav    = searchParams.getAll("stav") as LeadStatus[];
  const kraj    = searchParams.get("kraj") ?? undefined;
  const minSkore= searchParams.get("minSkore") ? Number(searchParams.get("minSkore")) : undefined;
  const search  = searchParams.get("q") ?? undefined;
  const page    = Number(searchParams.get("page") ?? 1);
  const pageSize= Number(searchParams.get("pageSize") ?? 30);
  const sortBy  = searchParams.get("sortBy") ?? "createdAt";
  const sortDir = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";

  const where: Record<string, unknown> = {};
  if (stav.length)  where["stav"] = { in: stav };
  if (kraj) where["parcel"] = { ...( where["parcel"] as object ), kraj };
  if (minSkore) {
    where["parcel"] = {
      ...( where["parcel"] as object ),
      score: { is: { celkove: { gte: minSkore } } },
    };
  }
  if (search) {
    where["OR"] = [
      { parcel: { kuNazev:       { contains: search, mode: "insensitive" } } },
      { parcel: { parcelniCislo: { contains: search } } },
      { parcel: { obec:          { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy = buildLeadOrderBy(sortBy, sortDir);

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        parcel: {
          include: { score: true, aiAnalysis: true, ownerships: { include: { owner: true } } },
        },
        owners: { include: { owner: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy,
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({
    data: leads,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { parcelId, priorita = 0, poznamky, tags = [] } = body;

  // Ověř, že parcela existuje a nemá již lead
  const parcel = await prisma.parcel.findUnique({
    where: { id: parcelId },
    include: { lead: true },
  });

  if (!parcel) {
    return NextResponse.json({ error: "Parcela nenalezena" }, { status: 404 });
  }
  if (parcel.lead) {
    return NextResponse.json({ error: "Parcela již má lead", leadId: parcel.lead.id }, { status: 409 });
  }

  const lead = await prisma.lead.create({
    data: {
      parcelId,
      priorita,
      poznamky,
      tags,
      zdroj: "RUCNE",
      history: {
        create: {
          stavDo: "NOVY",
          poznamka: "Lead vytvořen ručně",
        },
      },
    },
    include: {
      parcel: { include: { score: true } },
    },
  });

  return NextResponse.json({ data: lead }, { status: 201 });
}

// ─────────────────────────────────────────
function buildLeadOrderBy(sortBy: string, sortDir: "asc" | "desc") {
  if (sortBy === "skore") return { parcel: { score: { celkove: sortDir } } };
  if (sortBy === "zisk")  return { parcel: { aiAnalysis: { odhadovanyZisk: sortDir } } };
  if (sortBy === "vymera")return { parcel: { vymera: sortDir } };
  if (sortBy === "stav")  return { stav: sortDir };
  if (sortBy === "priorita") return { priorita: sortDir };
  return { createdAt: sortDir };
}
