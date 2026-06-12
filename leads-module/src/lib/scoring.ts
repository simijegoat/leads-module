// Hektaria · Scoring Engine
// Počítá atraktivitní skóre 0–100 pro každou parcelu

import type { Parcel, NearbyParcel, ParcelOwnership } from "@prisma/client";
import type { ScoreFactor, ScoreResult } from "../types";

// Váhy jednotlivých dimenzí (suma = 1)
const WEIGHTS = {
  velikost:     0.20,
  poloha:       0.20,
  zastavba:     0.15,
  komunikace:   0.15,
  potencial:    0.15,
  prodejeOkoli: 0.10,
  vlastnictvi:  0.05,
};

// ─────────────────────────────────────────
// VELIKOST
// logaritmická škála — optimum 2–10 ha
// ─────────────────────────────────────────
function scoreVelikost(vymeraM2: number): ScoreFactor {
  const ha = vymeraM2 / 10_000;
  let value: number;
  if (ha < 0.05)       value = 10;
  else if (ha < 0.5)   value = 30 + (ha / 0.5) * 30;
  else if (ha < 2)     value = 60 + ((ha - 0.5) / 1.5) * 25;
  else if (ha <= 10)   value = 85 + ((ha - 2) / 8) * 15;
  else if (ha <= 50)   value = 100 - ((ha - 10) / 40) * 10;
  else                 value = Math.max(50, 90 - ((ha - 50) / 50) * 40);

  return {
    name: "Velikost pozemku",
    value: Math.round(Math.min(100, value)),
    weight: WEIGHTS.velikost,
    contribution: Math.round(Math.min(100, value)) * WEIGHTS.velikost,
    popis: `${ha.toFixed(2)} ha`,
  };
}

// ─────────────────────────────────────────
// POLOHA (kraj / pásmo)
// ─────────────────────────────────────────
const KRAJ_SKORE: Record<string, number> = {
  "Středočeský kraj":    95,
  "Jihomoravský kraj":   90,
  "Olomoucký kraj":      80,
  "Pardubický kraj":     75,
  "Královéhradecký kraj": 72,
  "Ústecký kraj":        68,
  "Plzeňský kraj":       70,
  "Jihočeský kraj":      72,
  "Vysočina":            65,
  "Zlínský kraj":        70,
  "Moravskoslezský kraj": 60,
  "Liberecký kraj":      62,
  "Karlovarský kraj":    55,
};

function scorePoloha(kraj: string): ScoreFactor {
  const value = KRAJ_SKORE[kraj] ?? 65;
  return {
    name: "Poloha — kraj",
    value,
    weight: WEIGHTS.poloha,
    contribution: value * WEIGHTS.poloha,
    popis: kraj,
  };
}

// ─────────────────────────────────────────
// BLÍZKOST ZÁSTAVBY
// ─────────────────────────────────────────
function scoreZastavba(vzdalenostM: number | null): ScoreFactor {
  let value: number;
  if (vzdalenostM === null) {
    value = 40; // neznámá vzdálenost — střední hodnota
  } else if (vzdalenostM <= 100) {
    value = 100;
  } else if (vzdalenostM <= 500) {
    value = 100 - ((vzdalenostM - 100) / 400) * 30;
  } else if (vzdalenostM <= 2000) {
    value = 70 - ((vzdalenostM - 500) / 1500) * 40;
  } else {
    value = Math.max(10, 30 - ((vzdalenostM - 2000) / 3000) * 20);
  }

  return {
    name: "Blízkost zástavby",
    value: Math.round(value),
    weight: WEIGHTS.zastavba,
    contribution: Math.round(value) * WEIGHTS.zastavba,
    popis: vzdalenostM !== null ? `${vzdalenostM} m od zástavby` : "vzdálenost neznámá",
  };
}

// ─────────────────────────────────────────
// PŘÍSTUPOVÁ KOMUNIKACE
// ─────────────────────────────────────────
function scoreKomunikace(
  vzdalenostM: number | null,
  jeBezPristupu: boolean
): ScoreFactor {
  if (jeBezPristupu) {
    return {
      name: "Přístupová komunikace",
      value: 5,
      weight: WEIGHTS.komunikace,
      contribution: 5 * WEIGHTS.komunikace,
      popis: "bez právního přístupu — výrazné riziko",
    };
  }
  let value: number;
  if (vzdalenostM === null) value = 50;
  else if (vzdalenostM <= 10)  value = 100;
  else if (vzdalenostM <= 100) value = 100 - ((vzdalenostM - 10) / 90) * 20;
  else if (vzdalenostM <= 500) value = 80 - ((vzdalenostM - 100) / 400) * 40;
  else value = Math.max(15, 40 - ((vzdalenostM - 500) / 1000) * 25);

  return {
    name: "Přístupová komunikace",
    value: Math.round(value),
    weight: WEIGHTS.komunikace,
    contribution: Math.round(value) * WEIGHTS.komunikace,
    popis: vzdalenostM !== null ? `${vzdalenostM} m od komunikace` : "vzdálenost neznámá",
  };
}

// ─────────────────────────────────────────
// STAVEBNÍ POTENCIÁL
// ─────────────────────────────────────────
function skorePotencial(
  maStavebniPotencial: boolean,
  druhPozemku: string,
  vzdalenostZastavby: number | null
): ScoreFactor {
  let value = 20; // základní hodnota
  if (maStavebniPotencial) value = 90;
  else if (druhPozemku === "STAVEBNI_PARCELA") value = 100;
  else if (vzdalenostZastavby !== null && vzdalenostZastavby <= 200) value = 55;
  else if (vzdalenostZastavby !== null && vzdalenostZastavby <= 500) value = 35;

  return {
    name: "Stavební / rozvojový potenciál",
    value,
    weight: WEIGHTS.potencial,
    contribution: value * WEIGHTS.potencial,
    popis: maStavebniPotencial ? "evidován stavební potenciál" : "zemědělské využití",
  };
}

// ─────────────────────────────────────────
// REALIZOVANÉ PRODEJE V OKOLÍ
// ─────────────────────────────────────────
function skoreProdejeOkoli(nearby: NearbyParcel[]): ScoreFactor {
  if (nearby.length === 0) {
    return {
      name: "Realizované prodeje v okolí",
      value: 40,
      weight: WEIGHTS.prodejeOkoli,
      contribution: 40 * WEIGHTS.prodejeOkoli,
      popis: "žádné dostupné srovnatelné prodeje",
    };
  }
  // Průměrná cena z okolních prodejů jako proxy aktivity trhu
  const avgCena = nearby.reduce((s, n) => s + n.prodejniCena, 0) / nearby.length;
  // Čím vyšší cena a více srovnání, tím lepší
  const cenoveSkore = Math.min(100, (avgCena / 80) * 100); // normalizace na 80 Kč/m²
  const cetnostSkore = Math.min(100, (nearby.length / 5) * 100);
  const value = Math.round(cenoveSkore * 0.7 + cetnostSkore * 0.3);

  return {
    name: "Realizované prodeje v okolí",
    value,
    weight: WEIGHTS.prodejeOkoli,
    contribution: value * WEIGHTS.prodejeOkoli,
    popis: `${nearby.length} prodejů, Ø ${avgCena.toFixed(1)} Kč/m²`,
  };
}

// ─────────────────────────────────────────
// VLASTNICTVÍ
// ─────────────────────────────────────────
function skoreVlastnictvi(ownerships: ParcelOwnership[]): ScoreFactor {
  const pocet = ownerships.length;
  let value: number;
  // Méně vlastníků = snazší jednání
  if (pocet === 1)       value = 100;
  else if (pocet === 2)  value = 75;
  else if (pocet <= 4)   value = 55;
  else if (pocet <= 9)   value = 35;
  else                   value = 15;

  // Bonus za velký podíl hlavního vlastníka
  if (ownerships.length > 0) {
    const maxPodil = Math.max(...ownerships.map(o => o.podilCitatel / o.podilJmenovatel));
    if (maxPodil >= 1)   value = Math.min(100, value + 15);
    else if (maxPodil >= 0.5) value = Math.min(100, value + 5);
  }

  return {
    name: "Vlastnická struktura",
    value: Math.round(value),
    weight: WEIGHTS.vlastnictvi,
    contribution: Math.round(value) * WEIGHTS.vlastnictvi,
    popis: `${pocet} vlastník${pocet === 1 ? "" : pocet <= 4 ? "é" : "ů"}`,
  };
}

// ─────────────────────────────────────────
// HLAVNÍ FUNKCE
// ─────────────────────────────────────────
export function computeScore(
  parcel: Parcel & { ownerships: ParcelOwnership[] },
  nearby: NearbyParcel[] = []
): ScoreResult {
  const faktory: ScoreFactor[] = [
    scoreVelikost(parcel.vymera),
    scorePoloha(parcel.kraj),
    scoreZastavba(parcel.vzdalenostZastavby ?? null),
    scoreKomunikace(parcel.vzdalenostKomunikace ?? null, parcel.jeBezPristupu),
    skorePotencial(parcel.maStavebniPotencial, parcel.druhPozemku, parcel.vzdalenostZastavby ?? null),
    skoreProdejeOkoli(nearby),
    skoreVlastnictvi(parcel.ownerships),
  ];

  const celkove = Math.round(faktory.reduce((s, f) => s + f.contribution, 0));

  return {
    celkove,
    faktory,
    skoreVelikost:     faktory[0].value,
    skorePoloha:       faktory[1].value,
    skoreZastavba:     faktory[2].value,
    skoreKomunikace:   faktory[3].value,
    skorePotencial:    faktory[4].value,
    skoreProdejeOkoli: faktory[5].value,
    skoreVlastnictvi:  faktory[6].value,
  };
}
