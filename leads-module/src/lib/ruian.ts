// Hektaria · RUIAN / ČÚZK API klient
// Vyhledávání parcel z veřejných registrů ČR

import type { LandType } from "@prisma/client";
import type { ParcelSearchParams } from "../types";

const RUIAN_BASE = "https://ags.cuzk.cz/arcgis/rest/services/RUIAN";

// ─────────────────────────────────────────
// TYPY
// ─────────────────────────────────────────

export interface RuianParcel {
  id: string;
  parcelniCislo: string;
  kuKod: string;
  kuNazev: string;
  obec: string;
  okres: string;
  kraj: string;
  vymera: number;              // m²
  druhPozemku: string;         // kód z ČÚZK
  zpusobVyuziti: string | null;
  lat: number | null;
  lng: number | null;
  ownerships: RuianOwnership[];
}

export interface RuianOwnership {
  jmeno: string | null;
  prijmeni: string | null;
  nazevFirmy: string | null;
  typ: string;
  adresa: string | null;
  podilCitatel: number;
  podilJmenovatel: number;
}

// ─────────────────────────────────────────
// MAPOVÁNÍ TYPŮ POZEMKŮ
// ─────────────────────────────────────────

const DRUH_MAP: Record<string, LandType> = {
  "2":  "ORNA_PUDA",
  "7":  "TTP",
  "10": "LESNI_POZEMEK",
  "5":  "OVOCNY_SAD",
  "6":  "ZAHRADA",
  "11": "OSTATNI_PLOCHA",
  "4":  "VODNI_PLOCHA",
  "13": "ZASTAVENA_PLOCHA",
  "1":  "STAVEBNI_PARCELA",
};

export function mapDruhPozemku(kod: string): LandType {
  return DRUH_MAP[kod] ?? "OSTATNI_PLOCHA";
}

// ─────────────────────────────────────────
// VYHLEDÁVÁNÍ PARCEL
// Reálná implementace by volala ČÚZK WSDP nebo WMS.
// Tato vrstva abstrahuje zdroj — lze podložit jiným API.
// ─────────────────────────────────────────

export async function searchParcelsByKU(
  kuKod: string,
  params: Partial<ParcelSearchParams>
): Promise<RuianParcel[]> {
  const url = new URL(`${RUIAN_BASE}/Vyhledavaci_sluzba_nad_daty_RUIAN/MapServer/3/query`);
  url.searchParams.set("where", buildWhereClause(kuKod, params));
  url.searchParams.set("outFields", "KATUZE_KOD,KATUZE_NAZEV,CISLO_PARCELY,DRUH_POZEMKU,VYMERA,OBEC_NAZEV,OKRES_NAZEV,KRAJ_NAZEV");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("geometryType", "esriGeometryEnvelope");
  url.searchParams.set("resultRecordCount", String(params.pageSize ?? 100));
  url.searchParams.set("f", "json");

  const res = await fetch(url.toString(), {
    headers: { "Accept": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`RUIAN API error: ${res.status}`);

  const json = await res.json();
  if (json.error) throw new Error(`RUIAN: ${json.error.message}`);

  return (json.features ?? []).map(featureToParcel);
}

function buildWhereClause(kuKod: string, params: Partial<ParcelSearchParams>): string {
  const clauses: string[] = [`KATUZE_KOD = '${kuKod}'`];

  if (params.vymeraMin) clauses.push(`VYMERA >= ${params.vymeraMin}`);
  if (params.vymeraMax) clauses.push(`VYMERA <= ${params.vymeraMax}`);

  if (params.druhyPozemku?.length) {
    const kody = params.druhyPozemku.map(d => {
      const entry = Object.entries(DRUH_MAP).find(([, v]) => v === d);
      return entry ? `'${entry[0]}'` : null;
    }).filter(Boolean);
    if (kody.length) clauses.push(`DRUH_POZEMKU IN (${kody.join(",")})`);
  }

  return clauses.join(" AND ");
}

function featureToParcel(f: { attributes: Record<string, unknown>; geometry?: { x: number; y: number } }): RuianParcel {
  const a = f.attributes;
  return {
    id: `${a["KATUZE_KOD"]}_${a["CISLO_PARCELY"]}`,
    parcelniCislo: String(a["CISLO_PARCELY"] ?? ""),
    kuKod: String(a["KATUZE_KOD"] ?? ""),
    kuNazev: String(a["KATUZE_NAZEV"] ?? ""),
    obec: String(a["OBEC_NAZEV"] ?? ""),
    okres: String(a["OKRES_NAZEV"] ?? ""),
    kraj: String(a["KRAJ_NAZEV"] ?? ""),
    vymera: Number(a["VYMERA"] ?? 0),
    druhPozemku: String(a["DRUH_POZEMKU"] ?? ""),
    zpusobVyuziti: a["ZPUSOB_VYUZITI"] ? String(a["ZPUSOB_VYUZITI"]) : null,
    lat: f.geometry?.y ?? null,
    lng: f.geometry?.x ?? null,
    ownerships: [],
  };
}

// ─────────────────────────────────────────
// VYHLEDÁVÁNÍ KÚ (pro autocomplete)
// ─────────────────────────────────────────

export async function searchKatastralni(query: string): Promise<Array<{ kod: string; nazev: string; obec: string }>> {
  const url = new URL(`${RUIAN_BASE}/Vyhledavaci_sluzba_nad_daty_RUIAN/MapServer/1/query`);
  url.searchParams.set("where", `NAZEV LIKE '${query.replace(/'/g, "''")}%'`);
  url.searchParams.set("outFields", "KOD_KU,NAZEV,OBEC_NAZEV");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", "20");
  url.searchParams.set("f", "json");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) return [];

  const json = await res.json();
  return (json.features ?? []).map((f: { attributes: Record<string, unknown> }) => ({
    kod:   String(f.attributes["KOD_KU"] ?? ""),
    nazev: String(f.attributes["NAZEV"] ?? ""),
    obec:  String(f.attributes["OBEC_NAZEV"] ?? ""),
  }));
}

// ─────────────────────────────────────────
// VÝPOČET VZDÁLENOSTI (haversine)
// ─────────────────────────────────────────

export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
