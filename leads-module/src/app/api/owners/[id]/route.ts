// GET   /api/owners/[id] — karta vlastníka s jeho parcelami
// PATCH /api/owners/[id] — doplnění kontaktu

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const owner = await prisma.owner.findUnique({
    where: { id: params.id },
    include: {
      ownerships: {
        include: {
          parcel: {
            include: { score: true, lead: true },
          },
        },
        orderBy: { podil: "desc" },
      },
    },
  });

  if (!owner) return NextResponse.json({ error: "Vlastník nenalezen" }, { status: 404 });
  return NextResponse.json({ data: owner });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { email, telefon, adresaKontaktni } = await req.json();

  const updated = await prisma.owner.update({
    where: { id: params.id },
    data: {
      ...(email            !== undefined && { email }),
      ...(telefon          !== undefined && { telefon }),
      ...(adresaKontaktni  !== undefined && { adresaKontaktni }),
    },
  });

  return NextResponse.json({ data: updated });
}
