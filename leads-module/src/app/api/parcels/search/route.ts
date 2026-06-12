// POST /api/parcels/search
// Vyhledá parcely dle kritérií, ohodnotí je a vrátí seřazený seznam

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeScore } from "@/lib/scoring";
import { searchParcelsByKU, mapDruhPozemku } from "@/lib/ruian";
import type { ParcelSearchParams, ApiResponse, ParcelWithScore } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const body: ParcelSearchParams = await req.json();
    const { page = 1, pageSize = 50, sortBy = "skore", sortDir = "desc" } = body;

    // 1. Načti parcely z DB (již indexované)
    const where = buildPrismaWhere(body);
    const [parcels, total] = await Promise.all([
      prisma.parcel.findMany({
        where,
        include: {
          ownerships: { include: { owner: true } },
          score: true,
          aiAnalysis: true,
          lead: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: buildOrderBy(sortBy, sortDir),
      }),
      prisma.parcel.count({ where }),
    ]);

    const response: ApiResponse<ParcelWithScore[]> = {
      data: parcels as ParcelWithScore[],
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[parcels/search]", err);
    return NextResponse.json({ error: "Vyhledávání selhalo" }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// IMPORT Z RUIAN (POST /api/parcels/search?import=1)
// Použije se při denním jobu — stáhne nové parcely z ČÚZK
// a uloží/aktualizuje je v DB včetně skóre
// ─────────────────────────────────────────

export async function PUT(req: NextRequest) {
  try {
    const body: { kuKod: string; params: ParcelSearchParams } = await req.json();
    const { kuKod, params } = body;

    const ruianParcels = await searchParcelsByKU(kuKod, params);
    let created = 0;
    let updated = 0;

    for (const rp of ruianParcels) {
      const kodParcely = `${rp.kuKod}_${rp.parcelniCislo}`;

      const parcelData = {
        parcelniCislo: rp.parcelniCislo,
        kuKod:         rp.kuKod,
        kuNazev:       rp.kuNazev,
        obec:          rp.obec,
        okres:         rp.okres,
        kraj:          rp.kraj,
        vymera:        rp.vymera,
        druhPozemku:   mapDruhPozemku(rp.druhPozemku),
        lat:           rp.lat,
        lng:           rp.lng,
      };

      const parcel = await prisma.parcel.upsert({
        where:  { kodParcely },
        create: { kodParcely, ...parcelData },
        update: parcelData,
        include: { ownerships: true },
      });

      if (!parcel.score) {
        // Nová parcela — spočítej skóre
        const scoreResult = computeScore(parcel, []);
        await prisma.attractivenessScore.create({
          data: {
            parcelId: parcel.id,
            ...scoreResult,
            faktory: scoreResult.faktory,
          },
        });
        created++;
      } else {
        updated++;
      }
    }

    return NextResponse.json({ created, updated, total: ruianParcels.length });
  } catch (err) {
    console.error("[parcels/import]", err);
    return NextResponse.json({ error: "Import selhal" }, { status: 500 });
  }
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function buildPrismaWhere(p: ParcelSearchParams) {
  const where: Record<string, unknown> = {};

  if (p.kraj)   where["kraj"]  = p.kraj;
  if (p.okres)  where["okres"] = p.okres;
  if (p.obec)   where["obec"]  = p.obec;
  if (p.kuKod)  where["kuKod"] = p.kuKod;

  if (p.druhyPozemku?.length) where["druhPozemku"] = { in: p.druhyPozemku };
  if (p.vymeraMin || p.vymeraMax) {
    where["vymera"] = {
      ...(p.vymeraMin && { gte: p.vymeraMin }),
      ...(p.vymeraMax && { lte: p.vymeraMax }),
    };
  }
  if (p.maxVzdalenostZastavby) where["vzdalenostZastavby"] = { lte: p.maxVzdalenostZastavby };
  if (p.maxVzdalenostKomunikace) where["vzdalenostKomunikace"] = { lte: p.maxVzdalenostKomunikace };
  if (p.maxUredniCena) where["uredniCena"] = { lte: p.maxUredniCena };
  if (p.minSkore) where["score"] = { is: { celkove: { gte: p.minSkore } } };
  if (p.maxPocetVlastniku) {
    where["ownerships"] = { ...( where["ownerships"] as object ), _count: { lte: p.maxPocetVlastniku } };
  }

  return where;
}

function buildOrderBy(sortBy: string, sortDir: "asc" | "desc") {
  if (sortBy === "skore") return { score: { celkove: sortDir } };
  if (sortBy === "vymera") return { vymera: sortDir };
  if (sortBy === "uredniCena") return { uredniCena: sortDir };
  return { createdAt: sortDir };
}
