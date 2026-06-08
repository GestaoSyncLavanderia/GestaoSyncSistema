import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  className?: string;
}

export function KpiCard({ icon: Icon, label, value, sub, className }: KpiCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-[#E5E7EB] rounded-[14px] p-3 flex flex-col gap-1.5 min-w-0",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-[#EFF6FF] rounded">
          <Icon size={14} className="text-[#3B82F6]" />
        </div>
        <span className="text-xs text-gray-500 font-medium">{label}</span>
      </div>
      <div>
        <p className="text-xl font-semibold text-[#111827] leading-tight">{value}</p>
        {sub && <p className="text-xs text-[#6B7280] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}
