# Hektaria · Leads Module — Implementační plán

## Struktura projektu

```
leads-module/
├── prisma/
│   └── schema.prisma           ✅ Kompletní schéma
├── src/
│   ├── types/index.ts          ✅ Všechny TypeScript typy
│   ├── lib/
│   │   ├── prisma.ts           (singleton klient)
│   │   ├── scoring.ts          ✅ Scoring engine 0–100
│   │   ├── ruian.ts            ✅ ČÚZK / RUIAN klient
│   │   └── ai-analysis.ts      ✅ Claude API integrace
│   ├── app/api/
│   │   ├── parcels/search/     ✅ POST vyhledání + PUT import
│   │   ├── leads/              ✅ GET seznam + POST vytvoření
│   │   ├── leads/[id]/         ✅ GET detail + PATCH stav + DELETE
│   │   ├── jobs/daily/         ✅ POST denní job
│   │   ├── owners/[id]/        (GET karta vlastníka)
│   │   ├── reports/            (GET denní reporty)
│   │   └── dashboard/stats/    (GET KPI stats)
│   └── components/
│       ├── leads/LeadCard.tsx  ✅ Karta leadu
│       └── dashboard/          ✅ Hlavní dashboard
```

---

## Databázové schéma — přehled entit

| Model | Popis |
|---|---|
| `Parcel` | Parcela z KN — kadastr, výměra, druh, GPS, vzdálenosti |
| `Owner` | Vlastník (FO / PO / stát / obec) |
| `ParcelOwnership` | M:N parcela–vlastník s podílem |
| `AttractivenessScore` | Skóre 0–100 s 7 dimenzemi + faktory v JSON |
| `AIAnalysis` | Claude shrnutí, výhody/rizika, cenová doporučení |
| `Lead` | Obchodní příležitost vázaná na parcelu |
| `LeadStatusHistory` | Audit trail přechodů stavů |
| `LeadActivity` | Záznamy aktivit (hovory, emaily, schůzky) |
| `SearchCriteria` | Konfigurace automatického hledání |
| `SearchJob` | Záznamy o spuštěních vyhledávání |
| `DailyReport` | Denní snapshot metrik |
| `NearbyParcel` | Okolní realizované prodeje pro scoring |

---

## API endpointy — kompletní mapa

### Parcely
| Metoda | Endpoint | Popis |
|---|---|---|
| `POST` | `/api/parcels/search` | Vyhledání s filtry + stránkování |
| `PUT`  | `/api/parcels/search` | Import z RUIAN do DB |
| `GET`  | `/api/parcels/[id]` | Detail parcely |
| `POST` | `/api/parcels/[id]/score` | Přepočítej skóre |
| `POST` | `/api/parcels/[id]/analyze` | Spusť AI analýzu |

### Leady
| Metoda | Endpoint | Popis |
|---|---|---|
| `GET`  | `/api/leads` | Seznam s filtry (stav, kraj, skóre, full-text) |
| `POST` | `/api/leads` | Vytvoř lead ručně |
| `GET`  | `/api/leads/[id]` | Detail s historií a aktivitami |
| `PATCH`| `/api/leads/[id]` | Změn stav / prioritu / poznámky |
| `DELETE`| `/api/leads/[id]` | Smaž lead |
| `POST` | `/api/leads/[id]/activity` | Přidej aktivitu |

### Vlastníci
| Metoda | Endpoint | Popis |
|---|---|---|
| `GET`  | `/api/owners` | Vyhledání vlastníků |
| `GET`  | `/api/owners/[id]` | Karta vlastníka + jeho parcely |
| `PATCH`| `/api/owners/[id]` | Doplň kontakt |

### Automatizace
| Metoda | Endpoint | Popis |
|---|---|---|
| `POST` | `/api/jobs/daily` | Spusť denní job (chráněno CRON_SECRET) |
| `GET`  | `/api/jobs` | Historie jobů |
| `GET`  | `/api/jobs/[id]` | Detail jobu |
| `GET`  | `/api/reports/today` | Dnešní report |
| `GET`  | `/api/reports` | Historie reportů |
| `GET`  | `/api/dashboard/stats` | KPI pro dashboard |

### Vyhledávání kritérií
| Metoda | Endpoint | Popis |
|---|---|---|
| `GET`  | `/api/search-criteria` | Seznam konfigurací |
| `POST` | `/api/search-criteria` | Vytvoř konfiguraci |
| `PATCH`| `/api/search-criteria/[id]` | Aktualizuj / aktivuj/deaktivuj |
| `DELETE`| `/api/search-criteria/[id]` | Smaž konfiguraci |

---

## Scoring Engine — dimenze

| Dimenze | Váha | Co hodnotí |
|---|---|---|
| Velikost | 20 % | Logaritmická škála, optimum 2–10 ha |
| Poloha | 20 % | Kraj — blízkost Prahy a úrodných oblastí |
| Zástavba | 15 % | Vzdálenost od nejbližší budovy (m) |
| Komunikace | 15 % | Přístupová cesta, penalizace bez přístupu |
| Potenciál | 15 % | Stavební potenciál, typ pozemku |
| Okolní prodeje | 10 % | Počet a cena srovnatelných prodejů v okolí |
| Vlastnictví | 5 % | Počet vlastníků, velikost podílu |

---

## Stavový automat leadů

```
NOVY → PRIPRAVENO_K_OSLOVENI → OSLOVENO → JEDNANI → NABIDKA_ODESLANA → KOUPENO
  ↓              ↓                ↓           ↓              ↓
ZAMITNUTO    ZAMITNUTO        ZAMITNUTO  ZAMITNUTO       ZAMITNUTO
  ↓
ARCHIVOVANO (terminální)
```

Každý přechod je logován v `LeadStatusHistory` s timestampem a userId.

---

## Denní automatizace — tok

```
06:00 Cron trigger → POST /api/jobs/daily
        │
        ├─ Načti aktivní SearchCriteria
        │
        ├─ Pro každou konfiguraci:
        │   ├─ Resolve seznam k.ú.
        │   ├─ Volej ČÚZK RUIAN API
        │   ├─ Upsert parcely do DB
        │   ├─ Spočítej scoring (computeScore)
        │   ├─ Filtruj dle minSkore
        │   ├─ Vytvoř Lead (stav: NOVY)
        │   └─ AI analýza pro parcely se skóre ≥ 60
        │
        └─ Generuj DailyReport (snapshot stavů, top příležitosti)
```

---

## Fáze implementace

### Fáze 1 — Základ (1–2 týdny)
- [ ] Next.js projekt + Prisma setup
- [ ] Migrace DB (`prisma migrate dev`)
- [ ] `prisma.ts` singleton
- [ ] `/api/leads` CRUD + validace
- [ ] `/api/leads/[id]` stavový automat
- [ ] Základní frontend: seznam leadů, karta, detail
- [ ] Seed s testovacími daty

### Fáze 2 — Scoring + AI (1 týden)
- [ ] Scoring engine (`scoring.ts`) — unit testy
- [ ] `/api/parcels/[id]/score` endpoint
- [ ] Napojení Claude API (`ai-analysis.ts`)
- [ ] `/api/parcels/[id]/analyze` endpoint
- [ ] Zobrazení skóre + AI shrnutí v detailu leadu

### Fáze 3 — RUIAN integrace (1–2 týdny)
- [ ] `ruian.ts` — ověření CORS / proxy
- [ ] `/api/parcels/search` vyhledávání
- [ ] `/api/parcels/search` PUT import
- [ ] Mapování druhů pozemků
- [ ] Výpočet vzdáleností (zástavba, komunikace) — RUIAN / Google Maps API

### Fáze 4 — Automatizace (1 týden)
- [ ] SearchCriteria CRUD
- [ ] `/api/jobs/daily` denní job
- [ ] Vercel Cron nebo pg_cron scheduler
- [ ] DailyReport generování
- [ ] Notifikace (email / Slack webhook)

### Fáze 5 — Dashboard + UX (1 týden)
- [ ] KPI karty + pipeline bar
- [ ] Top 10 příležitostí
- [ ] Kanban pohled dle stavů
- [ ] Vlastnická karta
- [ ] Export do PDF / CSV

---

## Proměnné prostředí

```env
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
CRON_SECRET=silny-nahodny-token
NEXT_PUBLIC_APP_URL=https://...

# Volitelné
GOOGLE_MAPS_API_KEY=...    # pro výpočet vzdáleností
SMTP_HOST=...               # pro email notifikace
SLACK_WEBHOOK_URL=...       # pro Slack report
```

---

## Datové zdroje

| Zdroj | Data | Dostupnost |
|---|---|---|
| ČÚZK RUIAN (ArcGIS REST) | Parcely, k.ú., výměry, druhy | Veřejné, bez autentizace |
| ČÚZK WSDP | Vlastníci, listy vlastnictví | Registrace, poplatky za dotazy |
| ČÚZK Nahlížení | Manuální dohledání | Veřejné (webové) |
| Google Maps / HERE | Vzdálenosti, silniční síť | API klíč |
| Katastrální mapa (WMS) | Geometrie parcel | Veřejné |
| Úřední ceny (vyhl. 298/2014) | Uredni_cena | PDF / ruční import |

> **Poznámka:** Vlastníci z WSDP jsou zpoplatněni (~0,50 Kč/dotaz).
> Pro prototyp lze použít manuální doplnění nebo scraping z Nahlížení do KN.
