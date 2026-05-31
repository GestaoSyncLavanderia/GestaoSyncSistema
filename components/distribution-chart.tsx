"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/format";

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"];

interface DistributionUnit {
  name: string;
  total: number;
}

interface DistributionChartProps {
  data: DistributionUnit[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-gray-900">{payload[0].name}</p>
      <p className="font-semibold" style={{ color: payload[0].payload.color }}>
        {formatCurrency(payload[0].value)}
      </p>
    </div>
  );
}

export function DistributionChart({ data }: DistributionChartProps) {
  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="flex items-center gap-6">
      <div className="flex-shrink-0" style={{ width: 160, height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              dataKey="total"
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="flex-1 space-y-2.5 min-w-0">
        {data.map((d, i) => {
          const pct = total > 0 ? ((d.total / total) * 100).toFixed(1) : "0";
          return (
            <div key={i} className="flex items-center gap-2 min-w-0">
              <span
                className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="text-xs text-gray-700 truncate flex-1">{d.name}</span>
              <span className="text-xs text-gray-400 flex-shrink-0">{pct}%</span>
              <span className="text-xs font-medium text-gray-900 flex-shrink-0">
                {formatCurrency(d.total)}
              </span>
            </div>
          );
        })}
        {data.length === 0 && (
          <p className="text-xs text-gray-400">Sem dados para hoje</p>
        )}
      </div>
    </div>
  );
}
