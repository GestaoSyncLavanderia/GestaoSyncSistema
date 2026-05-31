import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  trend?: number | null; // percentual vs período anterior; null = sem dados anteriores
  className?: string;
}

export function KpiCard({ icon: Icon, label, value, sub, trend, className }: KpiCardProps) {
  const isPositive = trend !== null && trend !== undefined && trend >= 0;
  const isNegative = trend !== null && trend !== undefined && trend < 0;
  const hasTrend   = trend !== null && trend !== undefined;

  return (
    <div
      className={cn(
        "bg-white border border-[#E5E7EB] rounded-[14px] p-5 flex flex-col gap-3 min-w-0",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <div className="p-2 bg-[#EFF6FF] rounded-lg">
          <Icon size={16} className="text-[#3B82F6]" />
        </div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <div>
        <p className="text-2xl font-semibold text-[#111827] leading-tight">{value}</p>
        <div className="flex items-center gap-2 mt-1">
          {sub && <p className="text-xs text-[#6B7280]">{sub}</p>}
          {hasTrend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                isPositive ? "text-[#10B981]" : "text-red-500"
              )}
            >
              {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {isPositive ? "+" : ""}{trend}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
