// Hektaria · AI Analýza parcel
// Volá Claude API pro generování shrnutí a cenových doporučení

import Anthropic from "@anthropic-ai/sdk";
import type { Parcel, AttractivenessScore } from "@prisma/client";
import type { AIAnalysisResult } from "../types";
import { LAND_TYPE_LABELS } from "../types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────
// PROMPT BUILDER
// ─────────────────────────────────────────

function buildPrompt(
  parcel: Parcel,
  score: AttractivenessScore,
  owners: Array<{ jmeno: string | null; prijmeni: string | null; nazevFirmy: string | null }>,
  trznaCenaM2: number // odhadovaná tržní cena z oceňovače
): string {
  const ha = (parcel.vymera / 10_000).toFixed(2);
  const druhLabel = LAND_TYPE_LABELS[parcel.druhPozemku] ?? parcel.druhPozemku;
  const pocetVlastniku = owners.length;

  return `Jsi expert na výkup zemědělských a lesních pozemků v ČR pro investiční skupinu Hektaria.

Analyzuj následující parcelu a vytvoř stručný investiční brief:

**PARCELA:**
- Katastrální území: ${parcel.kuNazev} (kód ${parcel.kuKod})
- Parcelní číslo: ${parcel.parcelniCislo}
- Obec: ${parcel.obec}, okres: ${parcel.okres}, kraj: ${parcel.kraj}
- Výměra: ${parcel.vymera.toLocaleString("cs-CZ")} m² (${ha} ha)
- Druh pozemku: ${druhLabel}
- Úřední cena: ${parcel.uredniCena ? parcel.uredniCena + " Kč/m²" : "neznámá"}
- Vzdálenost od zástavby: ${parcel.vzdalenostZastavby ? parcel.vzdalenostZastavby + " m" : "neznámá"}
- Vzdálenost od komunikace: ${parcel.vzdalenostKomunikace ? parcel.vzdalenostKomunikace + " m" : "neznámá"}
- Bez právního přístupu: ${parcel.jeBezPristupu ? "ANO" : "Ne"}
- Stavební potenciál: ${parcel.maStavebniPotencial ? "ANO" : "Ne"}

**SKÓRE ATRAKTIVITY: ${score.celkove}/100**
- Velikost: ${score.skoreVelikost}/100
- Poloha: ${score.skorePoloha}/100
- Blízkost zástavby: ${score.skoreZastavba}/100
- Komunikace: ${score.skoreKomunikace}/100
- Potenciál: ${score.skorePotencial}/100
- Okolní prodeje: ${score.skoreProdejeOkoli}/100
- Vlastnictví: ${score.skoreVlastnictvi}/100

**VLASTNÍCI:** ${pocetVlastniku} vlastník${pocetVlastniku === 1 ? "" : pocetVlastniku <= 4 ? "é" : "ů"}

**TRŽNÍ ODHADOVANÁ CENA:** ${trznaCenaM2.toFixed(1)} Kč/m²

Odpověz POUZE jako validní JSON v tomto formátu (žádný text mimo JSON):
{
  "souhrn": "2-3 věty proč je/není parcela zajímavá pro výkup",
  "vyhody": ["výhoda 1", "výhoda 2", "výhoda 3"],
  "rizika": ["riziko 1", "riziko 2"],
  "doporucenaVykupniCenaM2": <číslo Kč/m², 72-85 % tržní ceny>,
  "doporucenaProdejniCenaM2": <číslo Kč/m², 110-140 % tržní ceny dle potenciálu>
}

Doporučená výkupní cena = tržní cena × (0.72 + skóre/500).
Doporučená prodejní cena = tržní cena × (1.10 + potenciálSkóre/200).
Buď konkrétní a stručný, bez opakování vstupních dat.`;
}

// ─────────────────────────────────────────
// HLAVNÍ FUNKCE
// ─────────────────────────────────────────

export async function generateAIAnalysis(
  parcel: Parcel,
  score: AttractivenessScore,
  owners: Array<{ jmeno: string | null; prijmeni: string | null; nazevFirmy: string | null }>,
  trznaCenaM2: number
): Promise<AIAnalysisResult & { tokeny: number }> {
  const prompt = buildPrompt(parcel, score, owners, trznaCenaM2);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  const tokeny = message.usage.input_tokens + message.usage.output_tokens;

  let parsed: {
    souhrn: string;
    vyhody: string[];
    rizika: string[];
    doporucenaVykupniCenaM2: number;
    doporucenaProdejniCenaM2: number;
  };

  try {
    parsed = JSON.parse(text);
  } catch {
    // Fallback — extrahuj JSON z textu
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI nevrátilo validní JSON");
    parsed = JSON.parse(match[0]);
  }

  const vykupM2    = parsed.doporucenaVykupniCenaM2;
  const prodejM2   = parsed.doporucenaProdejniCenaM2;
  const vykupTotal = vykupM2 * parcel.vymera;
  const prodejTotal= prodejM2 * parcel.vymera;
  const zisk       = prodejTotal - vykupTotal;
  const ziskPct    = (zisk / vykupTotal) * 100;

  return {
    souhrn: parsed.souhrn,
    vyhody: parsed.vyhody,
    rizika: parsed.rizika,
    doporucenaVykupniCena:    Math.round(vykupTotal),
    doporucenaVykupniCenaM2:  Math.round(vykupM2 * 10) / 10,
    doporucenaProdejniCena:   Math.round(prodejTotal),
    doporucenaProdejniCenaM2: Math.round(prodejM2 * 10) / 10,
    odhadovanyZisk:    Math.round(zisk),
    odhadovanyZiskPct: Math.round(ziskPct * 10) / 10,
    tokeny,
  };
}

// ─────────────────────────────────────────
// DENNÍ REPORT SHRNUTÍ
// ─────────────────────────────────────────

export async function generateDailyReportSummary(
  novychLeadu: number,
  topParcely: Array<{ kuNazev: string; vymera: number; skore: number; odhadovanyZisk: number }>,
  celkovyZisk: number
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [{
      role: "user",
      content: `Vytvoř stručný denní report pro tým Hektaria (2-3 věty):
Nové leady: ${novychLeadu}
Odhadovaný zisk z nových leadů: ${celkovyZisk.toLocaleString("cs-CZ")} Kč
Top 3 parcely: ${topParcely.slice(0, 3).map(p => `${p.kuNazev} (${(p.vymera / 10_000).toFixed(1)} ha, skóre ${p.skore}, zisk ${p.odhadovanyZisk.toLocaleString("cs-CZ")} Kč)`).join("; ")}
Buď konkrétní, motivující a stručný.`,
    }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}
