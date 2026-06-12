// GET   /api/leads/[id]  — detail leadu
// PATCH /api/leads/[id]  — aktualizace stavu / polí
// DELETE /api/leads/[id] — smazání

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { LeadStatus } from "@prisma/client";

const VALID_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NOVY:                  ["PRIPRAVENO_K_OSLOVENI", "ZAMITNUTO", "ARCHIVOVANO"],
  PRIPRAVENO_K_OSLOVENI: ["OSLOVENO", "ZAMITNUTO", "ARCHIVOVANO"],
  OSLOVENO:              ["JEDNANI", "ZAMITNUTO", "ARCHIVOVANO"],
  JEDNANI:               ["NABIDKA_ODESLANA", "ZAMITNUTO", "ARCHIVOVANO"],
  NABIDKA_ODESLANA:      ["KOUPENO", "ZAMITNUTO", "JEDNANI"],
  KOUPENO:               ["ARCHIVOVANO"],
  ZAMITNUTO:             ["NOVY", "ARCHIVOVANO"],
  ARCHIVOVANO:           [],
};

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      parcel: {
        include: {
          score:      true,
          aiAnalysis: true,
          ownerships: { include: { owner: true } },
          nearbyParcels: true,
        },
      },
      owners:   { include: { owner: true } },
      history:  { orderBy: { createdAt: "desc" } },
      aktivity: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });

  if (!lead) return NextResponse.json({ error: "Lead nenalezen" }, { status: 404 });
  return NextResponse.json({ data: lead });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { stav, priorita, poznamky, tags, poznamkaHistorie, userId } = body;

  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead nenalezen" }, { status: 404 });

  // Validace přechodu stavů
  if (stav && stav !== lead.stav) {
    const allowed = VALID_TRANSITIONS[lead.stav] ?? [];
    if (!allowed.includes(stav)) {
      return NextResponse.json({
        error: `Přechod ${lead.stav} → ${stav} není povolený`,
        allowed,
      }, { status: 422 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedLead = await tx.lead.update({
      where: { id: params.id },
      data: {
        ...(stav      && { stav }),
        ...(priorita  !== undefined && { priorita }),
        ...(poznamky  !== undefined && { poznamky }),
        ...(tags      && { tags }),
      },
    });

    // Zapiš do historie pokud se mění stav
    if (stav && stav !== lead.stav) {
      await tx.leadStatusHistory.create({
        data: {
          leadId:   params.id,
          stavZ:    lead.stav,
          stavDo:   stav,
          poznamka: poznamkaHistorie,
          userId,
        },
      });

      // Aktivita
      await tx.leadActivity.create({
        data: {
          leadId: params.id,
          typ:    "SYSTEM",
          popis:  `Stav změněn: ${lead.stav} → ${stav}`,
          userId,
        },
      });
    }

    return updatedLead;
  });

  return NextResponse.json({ data: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const lead = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!lead) return NextResponse.json({ error: "Lead nenalezen" }, { status: 404 });

  await prisma.lead.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}

// POST /api/leads/[id]/activity — přidej aktivitu
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { typ, popis, userId } = await req.json();

  const activity = await prisma.leadActivity.create({
    data: { leadId: params.id, typ, popis, userId },
  });

  return NextResponse.json({ data: activity }, { status: 201 });
}
