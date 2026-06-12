// Hektaria · LeadCard
// Karta leadu pro seznam i Kanban pohled

import type { LeadWithDetails } from "@/types";
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLOR, LAND_TYPE_LABELS } from "@/types";

interface Props {
  lead: LeadWithDetails;
  onClick?: (lead: LeadWithDetails) => void;
  compact?: boolean;
}

const fmt  = (n: number) => new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(Math.round(n));
const fmtM2= (n: number) => new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

export function LeadCard({ lead, onClick, compact = false }: Props) {
  const { parcel } = lead;
  const score = parcel.score;
  const ai    = parcel.aiAnalysis;
  const ha    = (parcel.vymera / 10_000).toFixed(2);
  const mainOwner = lead.owners.find(o => o.jeHlavni)?.owner ?? lead.owners[0]?.owner;

  const scoreColor =
    !score             ? "text-gray-400"
    : score.celkove >= 75 ? "text-green-700"
    : score.celkove >= 50 ? "text-yellow-700"
    : "text-red-600";

  return (
    <div
      onClick={() => onClick?.(lead)}
      className="bg-white border border-[#E0D5BF] rounded-xl p-4 cursor-pointer
                 hover:border-[#1A2E1A] hover:shadow-md transition-all duration-150
                 group relative"
    >
      {/* Skóre — horní pravý roh */}
      {score && (
        <div className={`absolute top-3 right-3 font-mono font-bold text-lg ${scoreColor}`}>
          {score.celkove}
          <span className="text-xs font-normal text-[#A89880]">/100</span>
        </div>
      )}

      {/* Hlavička */}
      <div className="pr-14">
        <div className="text-xs font-semibold tracking-wider uppercase text-[#6B5A45] mb-1">
          k.ú. {parcel.kuNazev}
        </div>
        <div className="font-serif font-black text-xl text-[#B8542A] leading-tight tracking-tight">
          parc. č. {parcel.parcelniCislo}
        </div>
        <div className="text-xs text-[#6B5A45] mt-1 font-mono">
          {parcel.obec} · {parcel.okres}
        </div>
      </div>

      {/* Metadata */}
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="text-xs bg-[#F4ECDC] text-[#6B5A45] px-2 py-1 rounded-full font-mono">
          {fmt(parcel.vymera)} m² ({ha} ha)
        </span>
        <span className="text-xs bg-[#EEF3EC] text-[#2D5A28] px-2 py-1 rounded-full font-semibold">
          {LAND_TYPE_LABELS[parcel.druhPozemku]}
        </span>
        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${LEAD_STATUS_COLOR[lead.stav]}`}>
          {LEAD_STATUS_LABELS[lead.stav]}
        </span>
      </div>

      {!compact && (
        <>
          {/* AI shrnutí */}
          {ai && (
            <p className="text-xs text-[#6B5A45] mt-3 line-clamp-2 leading-relaxed">
              {ai.souhrn}
            </p>
          )}

          {/* Cenové info */}
          {ai && (
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#E0D5BF]">
              <div>
                <div className="text-xs text-[#A89880] uppercase tracking-wider">Výkup</div>
                <div className="font-mono text-sm font-semibold text-[#1A2E1A]">
                  {fmtM2(ai.doporucenaVykupniCenaM2)} Kč/m²
                </div>
              </div>
              <div>
                <div className="text-xs text-[#A89880] uppercase tracking-wider">Prodej</div>
                <div className="font-mono text-sm font-semibold text-[#1A2E1A]">
                  {fmtM2(ai.doporucenaProdejniCenaM2)} Kč/m²
                </div>
              </div>
              <div>
                <div className="text-xs text-[#A89880] uppercase tracking-wider">Zisk</div>
                <div className="font-mono text-sm font-bold text-green-700">
                  {fmt(ai.odhadovanyZisk)} Kč
                </div>
              </div>
            </div>
          )}

          {/* Vlastník */}
          {mainOwner && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#E0D5BF]">
              <div className="w-6 h-6 rounded-full bg-[#1A2E1A] flex items-center justify-center flex-none">
                <span className="text-[10px] text-[#F4ECDC] font-bold">
                  {(mainOwner.prijmeni ?? mainOwner.nazevFirmy ?? "?")[0]}
                </span>
              </div>
              <div className="text-xs text-[#6B5A45] truncate">
                {mainOwner.prijmeni
                  ? `${mainOwner.jmeno ?? ""} ${mainOwner.prijmeni}`.trim()
                  : mainOwner.nazevFirmy ?? "Neznámý vlastník"}
                {lead.owners.length > 1 && (
                  <span className="text-[#A89880] ml-1">+{lead.owners.length - 1} dalších</span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Priorita indikátor */}
      {lead.priorita > 0 && (
        <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
          style={{ background: lead.priorita >= 3 ? "#B8542A" : lead.priorita >= 2 ? "#D4B88A" : "#4A8B3F" }}
        />
      )}
    </div>
  );
}
