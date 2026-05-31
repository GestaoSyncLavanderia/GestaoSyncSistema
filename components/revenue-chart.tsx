"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatCurrencyK } from "@/lib/format";

interface ChartUnit {
  name: string;
  total: number;
}

interface RevenueChartProps {
  data: ChartUnit[];
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg px-3 py-2 shadow-sm text-xs">
      <p className="font-medium text-gray-900 mb-0.5">{d.payload.name}</p>
      <p className="text-[#3B82F6] font-semibold">{formatCurrency(d.value)}</p>
    </div>
  );
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          axisLine={false}
          tickLine={false}
          interval={0}
        />
        <YAxis
          tickFormatter={formatCurrencyK}
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          axisLine={false}
          tickLine={false}
          width={60}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "#F9FAFB" }} />
        <Bar dataKey="total" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
