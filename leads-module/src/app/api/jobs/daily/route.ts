// POST /api/jobs/daily
// Spouští denní automatické vyhledávání leadů.
// Voláno cronerem (Vercel Cron / pg_cron / externí scheduler).
// Chráněno Bearer tokenem.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeScore } from "@/lib/scoring";
import { generateAIAnalysis } from "@/lib/ai-analysis";
import { searchParcelsByKU, mapDruhPozemku } from "@/lib/ruian";
import type { LandType } from "@prisma/client";

// Autorizace cronu
function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${process.env.CRON_SECRET}`;
}

// ─────────────────────────────────────────
// HLAVNÍ HANDLER
// ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results = {
    processedJobs: 0,
    newParcels: 0,
    newLeads: 0,
    scored: 0,
    analyzed: 0,
    errors: [] as string[],
  };

  // 1. Načti aktivní vyhledávací kritéria
  const criterias = await prisma.searchCriteria.findMany({
    where: { aktivni: true },
  });

  for (const criteria of criterias) {
    // Vytvoř job záznam
    const job = await prisma.searchJob.create({
      data: {
        criteriaId: criteria.id,
        stav: "BEZI",
      },
    });

    try {
      const jobResult = await runSearchJob(criteria, job.id);
      results.newParcels += jobResult.newParcels;
      results.newLeads   += jobResult.newLeads;
      results.scored     += jobResult.scored;
      results.analyzed   += jobResult.analyzed;
      results.processedJobs++;

      await prisma.searchJob.update({
        where: { id: job.id },
        data: {
          stav: "DOKONCENO",
          completedAt: new Date(),
          nalezenoParcel: jobResult.newParcels,
          novychLeadu: jobResult.newLeads,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`Job ${job.id}: ${msg}`);

      await prisma.searchJob.update({
        where: { id: job.id },
        data: { stav: "CHYBA", chybova: msg, completedAt: new Date() },
      });
    }
  }

  // 2. Vygeneruj denní report
  await generateDailyReport();

  const elapsed = Date.now() - startTime;
  console.log(`[daily-job] Done in ${elapsed}ms`, results);

  return NextResponse.json({ ok: true, elapsed, ...results });
}

// ─────────────────────────────────────────
// ZPRACOVÁNÍ JEDNOHO JOBU
// ─────────────────────────────────────────

async function runSearchJob(
  criteria: Awaited<ReturnType<typeof prisma.searchCriteria.findFirst>>,
  jobId: string
) {
  if (!criteria) throw new Error("criteria is null");

  const result = { newParcels: 0, newLeads: 0, scored: 0, analyzed: 0 };

  // Vyber seznam k.ú. ke zpracování
  const kuList = await resolveKUList(criteria);

  for (const kuKod of kuList) {
    const ruianParcels = await searchParcelsByKU(kuKod, {
      druhyPozemku:   criteria.druhyPozemku as LandType[],
      vymeraMin:      criteria.vymeraMin ?? undefined,
      vymeraMax:      criteria.vymeraMax ?? undefined,
      maxUredniCena:  criteria.maxUredniCena ?? undefined,
    });

    for (const rp of ruianParcels) {
      const kodParcely = `${rp.kuKod}_${rp.parcelniCislo}`;

      // Upsert parcely
      const parcel = await prisma.parcel.upsert({
        where: { kodParcely },
        create: {
          kodParcely,
          parcelniCislo: rp.parcelniCislo,
          kuKod: rp.kuKod,
          kuNazev: rp.kuNazev,
          obec: rp.obec,
          okres: rp.okres,
          kraj: rp.kraj,
          vymera: rp.vymera,
          druhPozemku: mapDruhPozemku(rp.druhPozemku),
          lat: rp.lat,
          lng: rp.lng,
        },
        update: { vymera: rp.vymera },
        include: { ownerships: true, score: true, lead: true },
      });

      // Přeskoč parcely s existujícím leadem
      if (parcel.lead) continue;

      // Filtr vlastníků
      if (criteria.maxPocetVlastniku && parcel.ownerships.length > criteria.maxPocetVlastniku) continue;
      if (criteria.maxVzdalenostZastavby && parcel.vzdalenostZastavby &&
          parcel.vzdalenostZastavby > criteria.maxVzdalenostZastavby) continue;

      // Scoring
      let score = parcel.score;
      if (!score) {
        const scoreResult = computeScore(parcel, []);
        score = await prisma.attractivenessScore.create({
          data: { parcelId: parcel.id, ...scoreResult, faktory: scoreResult.faktory },
        });
        result.scored++;
        result.newParcels++;
      }

      // Filtr minimálního skóre
      if (criteria.minSkore && score.celkove < criteria.minSkore) continue;

      // Vytvoř lead
      await prisma.lead.create({
        data: {
          parcelId: parcel.id,
          zdroj: "AUTOMATICKY",
          searchJobId: jobId,
          history: { create: { stavDo: "NOVY", poznamka: "Automaticky nalezeno denním jobem" } },
        },
      });
      result.newLeads++;

      // AI analýza pro top parcely (skóre ≥ 60)
      if (score.celkove >= 60) {
        try {
          const trnCena = estimateMarketPrice(parcel.druhPozemku, parcel.kraj);
          const analysis = await generateAIAnalysis(parcel, score, [], trnCena);
          await prisma.aIAnalysis.create({
            data: {
              parcelId: parcel.id,
              ...analysis,
              vyhody:  analysis.vyhody,
              rizika:  analysis.rizika,
            },
          });
          result.analyzed++;
        } catch (err) {
          console.warn(`[ai] Failed for parcel ${parcel.id}:`, err);
        }
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────
// DENNÍ REPORT
// ─────────────────────────────────────────

async function generateDailyReport() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [novych, osloveno, jednani, koupeno] = await Promise.all([
    prisma.lead.count({ where: { stav: "NOVY", createdAt: { gte: today } } }),
    prisma.lead.count({ where: { stav: "OSLOVENO" } }),
    prisma.lead.count({ where: { stav: "JEDNANI" } }),
    prisma.lead.count({ where: { stav: "KOUPENO", updatedAt: { gte: today } } }),
  ]);

  const topLeads = await prisma.lead.findMany({
    where: { createdAt: { gte: today } },
    include: { parcel: { include: { score: true, aiAnalysis: true } } },
    orderBy: { parcel: { score: { celkove: "desc" } } },
    take: 10,
  });

  const celkovyZisk = topLeads.reduce(
    (s, l) => s + (l.parcel.aiAnalysis?.odhadovanyZisk ?? 0), 0
  );

  await prisma.dailyReport.upsert({
    where: { datum: today },
    create: {
      datum: today,
      novychLeadu: novych,
      oslovenoVlastniku: osloveno,
      aktivnichJednani: jednani,
      koupenoParcel: koupeno,
      odhadovanyZisk: celkovyZisk,
      topPrilezitosti: topLeads.map(l => ({
        leadId: l.id,
        parcelId: l.parcelId,
        kuNazev: l.parcel.kuNazev,
        skore: l.parcel.score?.celkove ?? 0,
        odhadovanyZisk: l.parcel.aiAnalysis?.odhadovanyZisk ?? 0,
      })),
      stavySnapshot: [],
      zmenaLeadu: novych,
      zmenaOdhadZisk: celkovyZisk,
    },
    update: {
      novychLeadu: novych,
      odhadovanyZisk: celkovyZisk,
    },
  });
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

async function resolveKUList(
  criteria: Awaited<ReturnType<typeof prisma.searchCriteria.findFirst>>
): Promise<string[]> {
  if (!criteria) return [];
  if (criteria.kuKod) return [criteria.kuKod];

  // Načti k.ú. kódy pro daný kraj/okres/obec z DB nebo RUIAN
  const ku = await prisma.parcel.findMany({
    where: {
      ...(criteria.kraj && { kraj: criteria.kraj }),
      ...(criteria.okres && { okres: criteria.okres }),
      ...(criteria.obec && { obec: criteria.obec }),
    },
    select: { kuKod: true },
    distinct: ["kuKod"],
    take: 200,
  });

  return ku.map(k => k.kuKod);
}

// Odhad tržní ceny bez oceňovače (pro AI prompt)
function estimateMarketPrice(druhPozemku: LandType, kraj: string): number {
  const BASE: Partial<Record<LandType, number>> = {
    ORNA_PUDA: 39.6, TTP: 30.3, LESNI_POZEMEK: 14, OVOCNY_SAD: 41.5, ZAHRADA: 46,
  };
  const KRAJ_MULT: Record<string, number> = {
    "Středočeský kraj": 1.32, "Jihomoravský kraj": 1.18,
  };
  const base = BASE[druhPozemku] ?? 22;
  const mult = KRAJ_MULT[kraj] ?? 1.0;
  return base * mult;
}
