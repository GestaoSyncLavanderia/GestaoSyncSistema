import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface RankingUnit {
  position: number;
  name: string;
  city: string;
  state: string;
  cycles: number;
  total: number;
}

interface RankingListProps {
  units: RankingUnit[];
}

export function RankingList({ units }: RankingListProps) {
  const max = Math.max(...units.map((u) => u.total), 1);

  return (
    <div className="divide-y divide-[#E5E7EB]">
      {units.map((u) => {
        const pct = Math.round((u.total / max) * 100);
        return (
          <div key={u.position} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={cn(
                    "text-sm font-semibold w-5 text-center shrink-0",
                    u.position === 1 ? "text-gray-900" : "text-gray-300"
                  )}
                >
                  {u.position}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-tight truncate">
                    {u.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {u.city}/{u.state} &middot; {u.cycles} ciclos
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold text-[#10B981] shrink-0 ml-3">
                {formatCurrency(u.total)}
              </span>
            </div>
            {/* Barra proporcional */}
            <div className="ml-8 h-1.5 w-full rounded-full bg-[#F3F4F6]">
              <div
                className="h-full rounded-full bg-[#10B981] transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
      {units.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-6">Sem dados para o período</p>
      )}
    </div>
  );
}
