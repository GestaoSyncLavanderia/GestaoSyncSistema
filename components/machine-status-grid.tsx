import { cn } from "@/lib/utils";
import { Circle, Activity, RefreshCcw, Zap } from "lucide-react";

interface MachineStatusGridProps {
  machines: Array<{
    id: string;
    laundryId: string;
    type: string;
    status: string;
    group: number;
    laundry: { name: string; city: string; state: string };
  }>;
}

const statusMeta = {
  AVAILABLE: { label: "Disponível", color: "bg-[#10B981]", text: "text-[#10B981]" },
  IN_USE: { label: "Em uso", color: "bg-[#F59E0B]", text: "text-[#F59E0B]" },
  OFFLINE: { label: "Offline", color: "bg-[#EF4444]", text: "text-[#EF4444]" },
};

function summarize(machines: MachineStatusGridProps["machines"]) {
  const map = new Map<string, { laundry: { name: string; city: string; state: string }; washers: Record<string, number>; dryers: Record<string, number> }>();

  machines.forEach((machine) => {
    const key = machine.laundryId;
    const entry = map.get(key) ?? {
      laundry: machine.laundry,
      washers: { AVAILABLE: 0, IN_USE: 0, OFFLINE: 0 },
      dryers: { AVAILABLE: 0, IN_USE: 0, OFFLINE: 0 },
    };

    const bucket = machine.type === "DRYER" ? entry.dryers : entry.washers;
    bucket[machine.status as keyof typeof bucket] = (bucket[machine.status as keyof typeof bucket] ?? 0) + 1;
    map.set(key, entry);
  });

  return Array.from(map.values()).map((entry) => ({
    laundry: entry.laundry,
    washers: entry.washers,
    dryers: entry.dryers,
  }));
}

export function MachineStatusGrid({ machines }: MachineStatusGridProps) {
  const summaries = summarize(machines);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {summaries.map((unit) => (
        <div key={unit.laundry.name} className="rounded-[14px] border border-[#E5E7EB] bg-white p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 truncate">{unit.laundry.name}</p>
              <p className="text-xs text-gray-400">{unit.laundry.city}/{unit.laundry.state}</p>
            </div>
            <div className="rounded-full bg-[#EFF6FF] p-2 text-[#3B82F6]">
              <Zap size={16} />
            </div>
          </div>

          <div className="space-y-3">
            {(["washers", "dryers"] as const).map((type) => {
              const counts = unit[type];
              return (
                <div key={type} className="rounded-[14px] bg-[#F8FAFC] p-3">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase text-gray-500">
                      {type === "washers" ? "Lavadoras" : "Secadoras"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {counts.AVAILABLE + counts.IN_USE + counts.OFFLINE} máquinas
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(counts).map(([status, value]) => (
                      <span
                        key={status}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                          statusMeta[status as keyof typeof statusMeta].color,
                          "text-white"
                        )}
                      >
                        <Circle size={10} />
                        {value} {statusMeta[status as keyof typeof statusMeta].label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {summaries.length === 0 && (
        <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 text-center text-sm text-gray-500">
          Nenhuma máquina sincronizada ainda.
        </div>
      )}
    </div>
  );
}
