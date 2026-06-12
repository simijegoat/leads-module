// Hektaria · Leads Module — Shared TypeScript Types

import type {
  Parcel, Owner, Lead, AttractivenessScore, AIAnalysis,
  SearchCriteria, DailyReport, LeadStatus, LandType, OwnerType,
} from "@prisma/client";

export type { LeadStatus, LandType, OwnerType };

// ─────────────────────────────────────────
// SEARCH & FILTER
// ─────────────────────────────────────────

export interface ParcelSearchParams {
  kraj?: string;
  okres?: string;
  obec?: string;
  kuKod?: string;

  druhyPozemku?: LandType[];
  vymeraMin?: number;
  vymeraMax?: number;

  maxPocetVlastniku?: number;
  minPodil?: number;
  typyVlastnictvi?: OwnerType[];

  maxVzdalenostZastavby?: number;   // m
  maxVzdalenostKomunikace?: number; // m
  maxUredniCena?: number;           // Kč/m²
  minSkore?: number;                // 0–100

  page?: number;
  pageSize?: number;
  sortBy?: "skore" | "vymera" | "uredniCena" | "createdAt";
  sortDir?: "asc" | "desc";
}

// ─────────────────────────────────────────
// RICH PARCEL (s relacemi)
// ─────────────────────────────────────────

export type ParcelWithScore = Parcel & {
  score: AttractivenessScore | null;
  aiAnalysis: AIAnalysis | null;
  ownerships: Array<{
    podilCitatel: number;
    podilJmenovatel: number;
    owner: Owner;
  }>;
  lead: Lead | null;
};

// ─────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────

export interface ScoreFactor {
  name: string;
  value: number;       // 0–100
  weight: number;      // váha (suma = 1)
  contribution: number; // value * weight
  popis: string;
}

export interface ScoreResult {
  celkove: number;     // 0–100
  faktory: ScoreFactor[];
  skoreVelikost: number;
  skorePoloha: number;
  skoreZastavba: number;
  skoreKomunikace: number;
  skorePotencial: number;
  skoreProdejeOkoli: number;
  skoreVlastnictvi: number;
}

// ─────────────────────────────────────────
// AI ANALÝZA
// ─────────────────────────────────────────

export interface AIAnalysisResult {
  souhrn: string;
  vyhody: string[];
  rizika: string[];
  doporucenaVykupniCena: number;
  doporucenaVykupniCenaM2: number;
  doporucenaProdejniCena: number;
  doporucenaProdejniCenaM2: number;
  odhadovanyZisk: number;
  odhadovanyZiskPct: number;
}

// ─────────────────────────────────────────
// LEAD MANAGEMENT
// ─────────────────────────────────────────

export type LeadWithDetails = Lead & {
  parcel: ParcelWithScore;
  owners: Array<{
    jeHlavni: boolean;
    owner: Owner;
  }>;
  history: Array<{
    id: string;
    createdAt: Date;
    stavZ: LeadStatus | null;
    stavDo: LeadStatus;
    poznamka: string | null;
  }>;
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NOVY:                  "Nový lead",
  PRIPRAVENO_K_OSLOVENI: "Připraveno k oslovení",
  OSLOVENO:              "Osloveno",
  JEDNANI:               "Jednání",
  NABIDKA_ODESLANA:      "Nabídka odeslána",
  KOUPENO:               "Koupeno",
  ZAMITNUTO:             "Zamítnuto",
  ARCHIVOVANO:           "Archivováno",
};

export const LEAD_STATUS_COLOR: Record<LeadStatus, string> = {
  NOVY:                  "bg-blue-100 text-blue-800",
  PRIPRAVENO_K_OSLOVENI: "bg-yellow-100 text-yellow-800",
  OSLOVENO:              "bg-orange-100 text-orange-800",
  JEDNANI:               "bg-purple-100 text-purple-800",
  NABIDKA_ODESLANA:      "bg-indigo-100 text-indigo-800",
  KOUPENO:               "bg-green-100 text-green-800",
  ZAMITNUTO:             "bg-red-100 text-red-800",
  ARCHIVOVANO:           "bg-gray-100 text-gray-600",
};

export const LAND_TYPE_LABELS: Record<LandType, string> = {
  ORNA_PUDA:       "Orná půda",
  TTP:             "TTP (louka/pastvina)",
  LESNI_POZEMEK:   "Lesní pozemek",
  OVOCNY_SAD:      "Ovocný sad",
  ZAHRADA:         "Zahrada",
  OSTATNI_PLOCHA:  "Ostatní plocha",
  VODNI_PLOCHA:    "Vodní plocha",
  ZASTAVENA_PLOCHA: "Zastavěná plocha",
  STAVEBNI_PARCELA: "Stavební parcela",
};

// ─────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────

export interface DashboardStats {
  novychLeadu: number;
  novychLeaduDelta: number;
  oslovenoVlastniku: number;
  aktivnichJednani: number;
  odhadovanyZiskDnes: number;
  topPrilezitosti: TopOpportunity[];
  stavyPrehled: { stav: LeadStatus; pocet: number }[];
}

export interface TopOpportunity {
  leadId: string;
  parcelId: string;
  kuNazev: string;
  parcelniCislo: string;
  druhPozemku: LandType;
  vymera: number;
  skore: number;
  odhadovanyZisk: number;
  doporucenaVykupniCena: number;
}

// ─────────────────────────────────────────
// API RESPONSES
// ─────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}
