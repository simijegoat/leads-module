// Hektaria · Leads Dashboard
// Hlavní stránka modulu — stats, top příležitosti, filtry

"use client";

import { useState, useEffect } from "react";
import { LeadCard } from "@/components/leads/LeadCard";
import type { DashboardStats, LeadWithDetails } from "@/types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLOR } from "@/types";

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)} M Kč`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)} tis. Kč`
    : `${n} Kč`;

// ─────────────────────────────────────────
// KPI KARTA
// ─────────────────────────────────────────

function KpiCard({ label, value, sub, delta, deltaUp }: {
  label: string; value: string; sub?: string; delta?: string; deltaUp?: boolean;
}) {
  return (
    <div className="bg-white border border-[#E0D5BF] rounded-2xl p-5 shadow-sm">
      <div className="text-xs font-semibold tracking-widest uppercase text-[#6B5A45] mb-2">{label}</div>
      <div className="font-serif font-black text-3xl text-[#1A2E1A] tracking-tight leading-none">{value}</div>
      {sub && <div className="text-xs text-[#A89880] mt-2 font-mono">{sub}</div>}
      {delta && (
        <div className={`inline-flex items-center gap-1 text-xs font-mono font-semibold mt-2 px-2 py-1 rounded-full
          ${deltaUp ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {deltaUp ? "↑" : "↓"} {delta}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// STAVOVÝ PŘEHLED (pipeline)
// ─────────────────────────────────────────

function PipelineBar({ stavyPrehled }: { stavyPrehled: DashboardStats["stavyPrehled"] }) {
  const total = stavyPrehled.reduce((s, x) => s + x.pocet, 0) || 1;
  const SKIP = ["ARCHIVOVANO", "ZAMITNUTO"];

  return (
    <div className="bg-white border border-[#E0D5BF] rounded-2xl p-5 shadow-sm">
      <h3 className="font-serif font-bold text-base text-[#1A2E1A] mb-4">Pipeline leadů</h3>
      <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
        {stavyPrehled
          .filter(s => !SKIP.includes(s.stav) && s.pocet > 0)
          .map(s => (
            <div
              key={s.stav}
              style={{ width: `${(s.pocet / total) * 100}%` }}
              className="h-full first:rounded-l-full last:rounded-r-full transition-all"
              style={{ width: `${(s.pocet / total) * 100}%`, background: STATUS_BAR_COLOR[s.stav] ?? "#ccc" }}
              title={`${LEAD_STATUS_LABELS[s.stav]}: ${s.pocet}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {stavyPrehled
          .filter(s => !SKIP.includes(s.stav))
          .map(s => (
            <div key={s.stav} className="flex items-center gap-1.5 text-xs text-[#6B5A45]">
              <span className={`inline-block w-2 h-2 rounded-full`}
                style={{ background: STATUS_BAR_COLOR[s.stav] ?? "#ccc" }} />
              {LEAD_STATUS_LABELS[s.stav]}
              <span className="font-mono font-semibold text-[#1A2E1A]">{s.pocet}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

const STATUS_BAR_COLOR: Record<string, string> = {
  NOVY:                  "#93C5FD",
  PRIPRAVENO_K_OSLOVENI: "#FDE68A",
  OSLOVENO:              "#FCA5A5",
  JEDNANI:               "#C4B5FD",
  NABIDKA_ODESLANA:      "#6EE7B7",
  KOUPENO:               "#4A8B3F",
};

// ─────────────────────────────────────────
// HLAVNÍ KOMPONENTA
// ─────────────────────────────────────────

export function LeadsDashboard() {
  const [stats, setStats]   = useState<DashboardStats | null>(null);
  const [leads, setLeads]   = useState<LeadWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtry
  const [stavFilter, setStavFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [minSkore, setMinSkore] = useState(0);
  const [sortBy, setSortBy] = useState("skore");

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [stavFilter, search, minSkore, sortBy]);

  async function fetchDashboard() {
    const [statsRes, reportRes] = await Promise.all([
      fetch("/api/dashboard/stats"),
      fetch("/api/reports/today"),
    ]);
    if (statsRes.ok) setStats(await statsRes.json().then(r => r.data));
    setLoading(false);
  }

  async function fetchLeads() {
    const params = new URLSearchParams();
    if (stavFilter) params.set("stav", stavFilter);
    if (search)     params.set("q", search);
    if (minSkore)   params.set("minSkore", String(minSkore));
    params.set("sortBy", sortBy);
    params.set("pageSize", "30");

    const res = await fetch(`/api/leads?${params}`);
    if (res.ok) {
      const json = await res.json();
      setLeads(json.data);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#A89880] text-sm">
        Načítám data…
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* KPI řádek */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Nové leady dnes"
            value={String(stats.novychLeadu)}
            delta={`${stats.novychLeaduDelta > 0 ? "+" : ""}${stats.novychLeaduDelta} vs. včera`}
            deltaUp={stats.novychLeaduDelta >= 0}
          />
          <KpiCard
            label="Osloveno vlastníků"
            value={String(stats.oslovenoVlastniku)}
            sub="aktivních kontaktů"
          />
          <KpiCard
            label="Aktivní jednání"
            value={String(stats.aktivnichJednani)}
          />
          <KpiCard
            label="Odh. zisk z leadů dnes"
            value={fmt(stats.odhadovanyZiskDnes)}
            sub="součet AI odhadů"
            deltaUp
          />
        </div>
      )}

      {/* Pipeline */}
      {stats?.stavyPrehled && (
        <PipelineBar stavyPrehled={stats.stavyPrehled} />
      )}

      {/* Top příležitosti */}
      {stats?.topPrilezitosti?.length ? (
        <div className="bg-white border border-[#E0D5BF] rounded-2xl p-5 shadow-sm">
          <h3 className="font-serif font-bold text-base text-[#1A2E1A] mb-4">
            Top 10 příležitostí dne
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E0D5BF]">
                  {["#", "K.ú.", "Parcela", "Druh", "Výměra", "Skóre", "Výkup", "Prodej", "Odh. zisk"].map(h => (
                    <th key={h} className="text-left text-xs font-semibold tracking-wider uppercase
                      text-[#6B5A45] pb-2 px-2 first:pl-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.topPrilezitosti.map((t, i) => (
                  <tr key={t.leadId} className="border-b border-[#F4ECDC] hover:bg-[#FAF6ED] transition-colors">
                    <td className="py-2.5 px-2 first:pl-0 font-mono text-[#A89880] text-xs">{i + 1}</td>
                    <td className="py-2.5 px-2 font-medium text-[#1A2E1A]">{t.kuNazev}</td>
                    <td className="py-2.5 px-2 font-mono text-[#B8542A] font-semibold">{t.parcelniCislo}</td>
                    <td className="py-2.5 px-2 text-xs text-[#6B5A45]">{t.druhPozemku}</td>
                    <td className="py-2.5 px-2 font-mono text-xs">
                      {(t.vymera / 10_000).toFixed(2)} ha
                    </td>
                    <td className="py-2.5 px-2">
                      <ScorePill score={t.skore} />
                    </td>
                    <td className="py-2.5 px-2 font-mono text-xs text-[#1A2E1A]">—</td>
                    <td className="py-2.5 px-2 font-mono text-xs text-[#1A2E1A]">—</td>
                    <td className="py-2.5 px-2 font-mono text-xs font-bold text-green-700">
                      {fmt(t.odhadovanyZisk)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Filtrovaný seznam */}
      <div>
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <input
            type="text"
            placeholder="Hledat k.ú., parcelu, obec…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-[#E0D5BF] rounded-full px-4 py-2 text-sm bg-[#FAF6ED]
                       focus:outline-none focus:border-[#1A2E1A] min-w-[220px]"
          />
          <select
            value={stavFilter}
            onChange={e => setStavFilter(e.target.value)}
            className="border border-[#E0D5BF] rounded-full px-4 py-2 text-sm bg-[#FAF6ED]
                       focus:outline-none focus:border-[#1A2E1A]"
          >
            <option value="">Všechny stavy</option>
            {Object.entries(LEAD_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={String(minSkore)}
            onChange={e => setMinSkore(Number(e.target.value))}
            className="border border-[#E0D5BF] rounded-full px-4 py-2 text-sm bg-[#FAF6ED]
                       focus:outline-none focus:border-[#1A2E1A]"
          >
            <option value="0">Min. skóre — vše</option>
            <option value="40">≥ 40 (průměrné)</option>
            <option value="60">≥ 60 (dobré)</option>
            <option value="75">≥ 75 (výborné)</option>
            <option value="90">≥ 90 (top)</option>
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="border border-[#E0D5BF] rounded-full px-4 py-2 text-sm bg-[#FAF6ED]
                       focus:outline-none focus:border-[#1A2E1A]"
          >
            <option value="skore">Řadit: Skóre</option>
            <option value="zisk">Řadit: Odh. zisk</option>
            <option value="vymera">Řadit: Výměra</option>
            <option value="createdAt">Řadit: Nejnovější</option>
          </select>
          <span className="text-sm text-[#A89880] ml-auto font-mono">{leads.length} leadů</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
          {leads.length === 0 && (
            <div className="col-span-3 text-center py-16 text-[#A89880] text-sm italic">
              Žádné leady nesplňují zadaná kritéria.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScorePill({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-100 text-green-800"
    : score >= 50 ? "bg-yellow-100 text-yellow-800"
    : "bg-red-100 text-red-800";
  return (
    <span className={`inline-block font-mono font-bold text-xs px-2 py-0.5 rounded-full ${color}`}>
      {score}
    </span>
  );
}
