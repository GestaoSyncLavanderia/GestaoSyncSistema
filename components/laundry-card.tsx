import { MapPin, Repeat, TrendingUp, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface LaundryCardProps {
  name: string;
  city: string;
  state: string;
  street: string;
  neighborhood: string;
  ownerName: string;
  position: number;
  syncNote?: string;
  stats: {
    totalPaidValue: number;
    cyclesCount: number;
  };
}

export function LaundryCard({
  name,
  city,
  state,
  street,
  neighborhood,
  ownerName,
  position,
  syncNote,
  stats,
}: LaundryCardProps) {
  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-5 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-[#111827] leading-tight truncate">{name}</p>
            {syncNote && (
              <div className="relative group shrink-0">
                <AlertTriangle size={13} className="text-amber-400 cursor-help" />
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50 w-64 rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
                  {syncNote}
                  <div className="absolute left-1/2 -translate-x-1/2 top-full border-4 border-transparent border-t-gray-900" />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1 text-xs text-[#6B7280]">
            <MapPin size={12} />
            {city}, {state}
          </div>
        </div>
        <span className="text-xs font-semibold text-[#6B7280] bg-[#F3F4F6] rounded-full px-2 py-0.5 shrink-0">
          #{position}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 border-t border-[#E5E7EB] pt-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-[#6B7280] mb-1">
            <TrendingUp size={11} /> Faturamento
          </div>
          <p className="text-sm font-semibold text-[#10B981]">
            {formatCurrency(stats.totalPaidValue)}
          </p>
        </div>
        <div className="text-center border-l border-[#E5E7EB]">
          <div className="flex items-center justify-center gap-1 text-xs text-[#6B7280] mb-1">
            <Repeat size={11} /> Ciclos
          </div>
          <p className="text-sm font-semibold text-[#111827]">{stats.cyclesCount}</p>
        </div>
      </div>

      <div className="text-xs text-[#6B7280] border-t border-[#E5E7EB] pt-3">
        <p className="truncate">{street}, {neighborhood}</p>
        <p className="truncate mt-0.5">Resp: {ownerName}</p>
      </div>
    </div>
  );
}
