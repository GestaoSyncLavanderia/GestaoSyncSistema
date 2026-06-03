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
  const chartData = data.map((d) => ({
    ...d,
    displayName: d.name.length > 22 ? d.name.slice(0, 20) + "…" : d.name,
  }));
  const maxVal = Math.max(...data.map((d) => d.total), 1);
  const height = Math.max(300, chartData.length * 44);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 48, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, Math.ceil(maxVal * 1.05)]}
            tickFormatter={formatCurrencyK}
            tick={{ fontSize: 10, fill: "#9CA3AF" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="displayName"
            width={160}
            tick={{ fontSize: 10, fill: "#374151" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: "#F9FAFB" }}
          />
          <Bar dataKey="total" fill="#3B82F6" radius={[0, 4, 4, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
