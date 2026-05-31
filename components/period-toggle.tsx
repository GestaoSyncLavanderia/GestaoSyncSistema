"use client";

import { cn } from "@/lib/utils";

interface PeriodToggleProps {
  value: "today" | "month";
  onChange: (value: "today" | "month") => void;
}

export function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className="flex rounded-lg border border-[#E5E7EB] overflow-hidden text-xs">
      {(["today", "month"] as const).map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "px-3 py-1.5 transition-colors",
            value === opt
              ? "bg-[#3B82F6] text-white font-medium"
              : "bg-white text-gray-500 hover:bg-gray-50"
          )}
        >
          {opt === "today" ? "Hoje" : "Mês"}
        </button>
      ))}
    </div>
  );
}
