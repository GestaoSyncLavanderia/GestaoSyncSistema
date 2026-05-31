"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parsePeriod, getPeriodDates } from "@/lib/period";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ShoppingCart, Tag, TrendingDown, TrendingUp, WashingMachine } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SCard } from "@/components/s-card";
import { FilterBar } from "@/components/filter-bar";
import { CycleTable, type CycleItem } from "@/components/cycle-table";
import { formatCurrency } from "@/lib/format";

interface DayPoint    { date: string; total: number; cycles: number; }
interface DistribEntry { label: string; total: number; count: number; pct: number; }
interface AnalyticPoint { label: string; total: number; count: number; }
interface ComparisonPoint {
  day: number; label: string;
  current: number; currentCycles: number;
  previous: number; previousCycles: number;
}
interface ComparisonData {
  series: ComparisonPoint[];
  currentTotal: number;
  previousTotal: number;
  changePct: number | null;
  currentLabel: string;
  previousLabel: string;
}

interface SalesResponse {
  cycles: CycleItem[];
  total: number;
  page: number;
  limit: number;
  agg: { totalPaidValue: number; count: number; ticketMedio: number; avgMachines: number; };
  byPayment: DistribEntry[];
  byMachineType: DistribEntry[];
  dailyEvolution: DayPoint[];
}

function formatDateLabel(dateStr: string) {
  const [, month, day] = dateStr.split("-");
  return `${day}/${month}`;
}

function DistribCard({ title, items }: { title: string; items: DistribEntry[] }) {
  return (
    <SCard title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">Sem dados no período</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#111827]">{item.label}</span>
                  <span className="text-xs text-[#6B7280]">{item.count} ciclos</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#6B7280]">{item.pct}%</span>
                  <span className="text-sm font-semibold text-[#10B981]">
                    {formatCurrency(item.total)}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-[#F3F4F6]">
                <div
                  className="h-full rounded-full bg-[#3B82F6] transition-all duration-500"
                  style={{ width: `${item.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </SCard>
  );
}

export default function SalesPage() {
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));
  const periodDates = getPeriodDates(period);

  const [laundries, setLaundries] = useState<Array<{ id: string; name: string }>>([]);
  const [cycles, setCycles] = useState<CycleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [agg, setAgg] = useState<SalesResponse["agg"] | null>(null);
  const [byPayment, setByPayment] = useState<DistribEntry[]>([]);
  const [byMachineType, setByMachineType] = useState<DistribEntry[]>([]);
  const [dailyEvolution, setDailyEvolution] = useState<DayPoint[]>([]);
  const [peakHours, setPeakHours] = useState<AnalyticPoint[]>([]);
  const [weekdays, setWeekdays] = useState<AnalyticPoint[]>([]);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [laundryId, setLaundryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [from, setFrom] = useState(periodDates.from);
  const [to, setTo] = useState(periodDates.to);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const dates = getPeriodDates(period);
    setFrom(dates.from);
    setTo(dates.to);
    setPage(1);
  }, [period]);

  useEffect(() => {
    fetch("/api/laundries", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLaundries(d.laundries ?? []))
      .catch(() => {});
  }, []);

  // Analytics: horários de pico + dias da semana
  useEffect(() => {
    const params = new URLSearchParams();
    if (from)       params.set("from", from);
    if (to)         params.set("to", to);
    if (laundryId)  params.set("laundryId", laundryId);
    fetch(`/api/analytics?${params.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setPeakHours(d.peakHours ?? []);
        setWeekdays(d.weekdays ?? []);
        setComparison(d.comparison ?? null);
      })
      .catch(() => {});
  }, [from, to, laundryId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (laundryId)     params.set("laundryId", laundryId);
      if (paymentMethod) params.set("paymentMethod", paymentMethod);
      if (from)          params.set("from", from);
      if (to)            params.set("to", to);
      const res = await fetch(`/api/sales?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setCycles([]); setTotal(0); setAgg(null); setLoading(false); return;
      }
      const data = (await res.json()) as SalesResponse;
      setCycles(data.cycles ?? []);
      setTotal(data.total);
      setAgg(data.agg ?? null);
      setByPayment(data.byPayment ?? []);
      setByMachineType(data.byMachineType ?? []);
      setDailyEvolution(data.dailyEvolution ?? []);
      setLoading(false);
    }
    load();
  }, [laundryId, paymentMethod, from, to, page, limit]);

  const pageCount = useMemo(() => Math.ceil(total / limit), [total, limit]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <KpiCard icon={TrendingUp}    label="Faturamento"         value={formatCurrency(agg?.totalPaidValue ?? 0)} sub="Total no filtro atual" />
        <KpiCard icon={ShoppingCart}  label="Ciclos"              value={`${agg?.count ?? 0}`}                    sub="Ciclos no filtro atual" />
        <KpiCard icon={Tag}           label="Ticket médio"        value={formatCurrency(agg?.ticketMedio ?? 0)}   sub="Valor médio por ciclo" />
        <KpiCard icon={WashingMachine} label="Média máquinas/ciclo" value={(agg?.avgMachines ?? 0).toFixed(1)}   sub="Média de máquinas por ciclo" />
      </div>

      <SCard title="Evolução diária">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyEvolution} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value ?? 0)), "Faturamento"]}
                labelFormatter={formatDateLabel}
                contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "12px" }}
              />
              <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2} fill="url(#colorTotal)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <DistribCard title="Por forma de pagamento" items={byPayment} />
        <DistribCard title="Por tipo de máquina"    items={byMachineType} />
      </div>

      {/* Comparativo de período */}
      {comparison && (
        <SCard title="Comparativo de período">
          <div className="flex flex-wrap items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#3B82F6] shrink-0" />
              <span className="text-xs text-[#6B7280]">Atual ({comparison.currentLabel})</span>
              <span className="text-sm font-semibold text-[#111827]">
                {formatCurrency(comparison.currentTotal)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#D1D5DB] shrink-0" />
              <span className="text-xs text-[#6B7280]">Anterior ({comparison.previousLabel})</span>
              <span className="text-sm font-semibold text-[#111827]">
                {formatCurrency(comparison.previousTotal)}
              </span>
            </div>
            {comparison.changePct !== null && (
              <span
                className={`inline-flex items-center gap-1 text-sm font-semibold ${
                  comparison.changePct >= 0 ? "text-[#10B981]" : "text-red-500"
                }`}
              >
                {comparison.changePct >= 0 ? (
                  <TrendingUp size={14} />
                ) : (
                  <TrendingDown size={14} />
                )}
                {comparison.changePct >= 0 ? "+" : ""}{comparison.changePct}% vs. período anterior
              </span>
            )}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparison.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Number(value ?? 0)),
                    String(name) === "current" ? `Atual (${comparison.currentLabel})` : `Anterior (${comparison.previousLabel})`,
                  ]}
                  contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "12px" }}
                />
                <Legend
                  formatter={(value) =>
                    value === "current"
                      ? `Atual (${comparison.currentLabel})`
                      : `Anterior (${comparison.previousLabel})`
                  }
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                />
                <Line
                  type="monotone"
                  dataKey="current"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="previous"
                  stroke="#D1D5DB"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SCard>
      )}

      {/* Horários de pico e dias da semana */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SCard title="Horários de pico">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peakHours} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval={2} />
                <YAxis tickFormatter={(v) => `${v}`} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  formatter={(value, name) => [
                    String(name) === "count" ? `${Number(value ?? 0)} ciclos` : formatCurrency(Number(value ?? 0)),
                    String(name) === "count" ? "Ciclos" : "Faturamento",
                  ]}
                  contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "12px" }}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-[#6B7280] text-center">Ciclos por hora do dia (horário de Brasília)</p>
        </SCard>

        <SCard title="Dias da semana">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdays} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v) => `${v}`} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={28} />
                <Tooltip
                  formatter={(value, name) => [
                    String(name) === "count" ? `${Number(value ?? 0)} ciclos` : formatCurrency(Number(value ?? 0)),
                    String(name) === "count" ? "Ciclos" : "Faturamento",
                  ]}
                  contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "12px" }}
                />
                <Bar dataKey="count" fill="#10B981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-[#6B7280] text-center">Ciclos por dia da semana no período</p>
        </SCard>
      </div>

      <FilterBar
        laundries={laundries}
        laundryId={laundryId}
        paymentMethod={paymentMethod}
        from={from}
        to={to}
        onLaundryChange={(v) => { setLaundryId(v); setPage(1); }}
        onPaymentChange={(v) => { setPaymentMethod(v); setPage(1); }}
        onFromChange={(v) => { setFrom(v); setPage(1); }}
        onToChange={(v) => { setTo(v); setPage(1); }}
      />

      <CycleTable
        cycles={cycles}
        total={total}
        page={page}
        pageCount={pageCount}
        loading={loading}
        onPageChange={setPage}
      />
    </div>
  );
}
