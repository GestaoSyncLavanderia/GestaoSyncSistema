"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Repeat, TrendingUp, WashingMachine, Store, Tag, Wind, Play, Pause } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { SCard } from "@/components/s-card";
import { DistributionChart } from "@/components/distribution-chart";
import { RevenueChart } from "@/components/revenue-chart";
import { LaundryCard } from "@/components/laundry-card";
import { formatCurrency } from "@/lib/format";
import { parsePeriod, getPeriodDates } from "@/lib/period";

// ── Tab config ─────────────────────────────────────────────────────────────

type TabKey = "general" | "sales" | "cycles" | "machines" | "units";

// ── Shared types ───────────────────────────────────────────────────────────

interface DistribEntry { label: string; total: number; count: number; pct: number; }
interface DayPoint     { date: string; total: number; cycles: number; }
interface ComparisonPoint { day: number; label: string; current: number; previous: number; }
interface ComparisonData {
  series: ComparisonPoint[];
  currentTotal: number;
  previousTotal: number;
  changePct: number | null;
  currentLabel: string;
  previousLabel: string;
}
interface SalesAgg { totalPaidValue: number; count: number; ticketMedio: number; avgMachines: number; }

interface CyclesByDayItem  { date: string; count: number; washer: number; dryer: number; }
interface CyclesByDowItem  { dow: number; label: string; count: number; }
interface CyclesByUnitItem { laundryId: string; name: string; count: number; washer: number; dryer: number; }
interface CyclesData {
  total: number;
  avgPerDay: number;
  avgMachines: number;
  avgMachinesWasher: number;
  avgMachinesDryer: number;
  byDay: CyclesByDayItem[];
  byDayOfWeek: CyclesByDowItem[];
  byUnit: CyclesByUnitItem[];
  byMachineType: { WASHER: number; DRYER: number };
  avgMachinesByUnit?: { laundryId: string; name: string; avgMachines: number }[];
}

// ── Shared helpers ─────────────────────────────────────────────────────────

function formatDateLabel(s: string) {
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
}

function DistribRow({ item, color }: { item: DistribEntry; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#111827]">{item.label}</span>
          <span className="text-xs text-[#6B7280]">{item.count} ciclos</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6B7280]">{item.pct}%</span>
          <span className="text-sm font-semibold text-[#10B981]">{formatCurrency(item.total)}</span>
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-[#F3F4F6]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${item.pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function CycleUnitBar({ name, count, max, color = "#3B82F6" }: { name: string; count: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium text-gray-900 truncate flex-1">{name}</span>
        <span className="text-sm font-semibold ml-3 shrink-0" style={{ color }}>{count} ciclos</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[#F3F4F6]">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Sales tab ──────────────────────────────────────────────────────────────

function SalesTabContent({ from, to }: { from: string; to: string }) {
  const [agg, setAgg] = useState<SalesAgg | null>(null);
  const [byPayment, setByPayment] = useState<DistribEntry[]>([]);
  const [byMachineType, setByMachineType] = useState<DistribEntry[]>([]);
  const [dailyEvolution, setDailyEvolution] = useState<DayPoint[]>([]);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [topUnit, setTopUnit] = useState<{ name: string; total: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams({ from, to, page: "1", limit: "1" });
    const ap = new URLSearchParams({ from, to });

    Promise.all([
      fetch(`/api/sales?${sp}`,     { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/analytics?${ap}`, { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/laundries?${ap}`, { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([sales, analytics, laundries]) => {
        setAgg(sales.agg ?? null);
        setByPayment(sales.byPayment ?? []);
        setByMachineType(sales.byMachineType ?? []);
        setDailyEvolution(sales.dailyEvolution ?? []);
        setComparison(analytics.comparison ?? null);
        const top = (laundries.laundries ?? []).reduce(
          (best: any, l: any) =>
            !best || l.stats.totalPaidValue > best.stats.totalPaidValue ? l : best,
          null
        );
        if (top) setTopUnit({ name: top.name, total: top.stats.totalPaidValue });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  const days = Math.max(
    1,
    Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  );
  const avgDiario = (agg?.totalPaidValue ?? 0) / days;

  if (loading) {
    return (
      <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-10 text-center text-sm text-gray-400">
        Carregando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Linha 1 — 3 KPI cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard icon={TrendingUp} label="Faturamento no período"   value={formatCurrency(agg?.totalPaidValue ?? 0)} />
        <KpiCard icon={Tag}        label="Faturamento médio diário" value={formatCurrency(avgDiario)} />
        <KpiCard
          icon={Store}
          label="Maior unidade no período"
          value={topUnit?.name ?? "—"}
          sub={topUnit ? formatCurrency(topUnit.total) : undefined}
        />
      </div>

      {/* Linha 2 — evolução diária */}
      <SCard title="Evolução diária">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyEvolution} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={52} />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value ?? 0)), "Faturamento"]}
                labelFormatter={(label) => formatDateLabel(String(label ?? ""))}
                contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "12px" }}
              />
              <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2} fill="url(#salesGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SCard>

      {/* Linha 3 — distribuições */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SCard title="Por forma de pagamento">
          {byPayment.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sem dados no período</p>
          ) : (
            <div className="space-y-3">
              {byPayment.map((item) => (
                <DistribRow key={item.label} item={item} color="#3B82F6" />
              ))}
            </div>
          )}
        </SCard>
        <SCard title="Por tipo de máquina">
          {byMachineType.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sem dados no período</p>
          ) : (
            <div className="space-y-3">
              {byMachineType.map((item) => (
                <DistribRow key={item.label} item={item} color="#10B981" />
              ))}
            </div>
          )}
        </SCard>
      </div>

      {/* Linha 4 — comparativo de período */}
      {comparison && (
        <SCard title="Comparativo de período">
          <div className="flex flex-wrap items-center gap-6 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#3B82F6] shrink-0" />
              <span className="text-xs text-[#6B7280]">Atual ({comparison.currentLabel})</span>
              <span className="text-sm font-semibold text-[#111827]">{formatCurrency(comparison.currentTotal)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#D1D5DB] shrink-0" />
              <span className="text-xs text-[#6B7280]">Anterior ({comparison.previousLabel})</span>
              <span className="text-sm font-semibold text-[#111827]">{formatCurrency(comparison.previousTotal)}</span>
            </div>
            {comparison.changePct !== null && (
              <span className={`text-sm font-semibold ${comparison.changePct >= 0 ? "text-[#10B981]" : "text-red-500"}`}>
                {comparison.changePct >= 0 ? "+" : ""}{comparison.changePct}% vs. período anterior
              </span>
            )}
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={comparison.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={52} />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Number(value ?? 0)),
                    String(name) === "current"
                      ? `Atual (${comparison.currentLabel})`
                      : `Anterior (${comparison.previousLabel})`,
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
                <Line type="monotone" dataKey="current"  stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="previous" stroke="#D1D5DB" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SCard>
      )}
    </div>
  );
}

// ── Cycles tab ────────────────────────────────────────────────────────────

function CyclesTabContent({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<CyclesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ from, to });
    fetch(`/api/cycles?${p}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) {
    return (
      <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-10 text-center text-sm text-gray-400">
        Carregando...
      </div>
    );
  }

  const maxUnit = Math.max(...(data?.byUnit.map((u) => u.count) ?? [1]), 1);

  return (
    <div className="space-y-6">
      {/* Linha 1 — 3 KPI cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard icon={Repeat}         label="Total de ciclos no período" value={`${data?.total ?? 0}`} />
        <KpiCard icon={TrendingUp}     label="Média de ciclos por dia"   value={(data?.avgPerDay ?? 0).toFixed(1)} />
        <KpiCard icon={WashingMachine} label="Média de máquinas por ciclo" value={(data?.avgMachines ?? 0).toFixed(1)} />
      </div>

      {/* Linha 2 — evolução de ciclos por dia */}
      <SCard title="Evolução de ciclos por dia">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data?.byDay ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cyclesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10B981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
              <Tooltip
                formatter={(value) => [`${Number(value ?? 0)} ciclos`, "Ciclos"]}
                labelFormatter={(label) => formatDateLabel(String(label ?? ""))}
                contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "12px" }}
              />
              <Area type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} fill="url(#cyclesGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SCard>

      {/* Linha 3 — ranking de unidades + dias da semana */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SCard title="Ranking de unidades por ciclos">
          {(data?.byUnit.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sem dados no período</p>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {data!.byUnit.map((u) => (
                <CycleUnitBar key={u.laundryId} name={u.name} count={u.count} max={maxUnit} />
              ))}
            </div>
          )}
        </SCard>

        <SCard title="Ciclos por dia da semana">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byDayOfWeek ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [`${Number(value ?? 0)} ciclos`, "Ciclos"]}
                  contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "12px" }}
                />
                <Bar dataKey="count" fill="#10B981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-[#6B7280] text-center">Ciclos por dia da semana no período</p>
        </SCard>
      </div>
    </div>
  );
}

// ── Machines tab ──────────────────────────────────────────────────────────

function MachinesTabContent({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<CyclesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ from, to });
    fetch(`/api/cycles?${p}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) {
    return (
      <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-10 text-center text-sm text-gray-400">
        Carregando...
      </div>
    );
  }

  const washerTotal = data?.byMachineType.WASHER ?? 0;
  const dryerTotal  = data?.byMachineType.DRYER  ?? 0;
  const avgW = (data?.avgMachinesWasher ?? 0).toFixed(1);
  const avgD = (data?.avgMachinesDryer  ?? 0).toFixed(1);

  const washerByUnit = [...(data?.byUnit ?? [])].sort((a, b) => b.washer - a.washer);
  const dryerByUnit  = [...(data?.byUnit ?? [])].sort((a, b) => b.dryer  - a.dryer);
  const maxWasher = Math.max(...washerByUnit.map((u) => u.washer), 1);
  const maxDryer  = Math.max(...dryerByUnit.map((u) => u.dryer),  1);

  const distributionData = [
    { name: "Lavadora", total: washerTotal },
    { name: "Secadora",  total: dryerTotal  },
  ];

  return (
    <div className="space-y-6">
      {/* Linha 1 — 3 KPI cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard icon={WashingMachine} label="Ciclos de lavadora"   value={`${washerTotal}`} sub="No período selecionado" />
        <KpiCard icon={Wind}           label="Ciclos de secadora"   value={`${dryerTotal}`}  sub="No período selecionado" />
        <KpiCard icon={Repeat}         label="Média de máquinas"    value={`${avgW} lav · ${avgD} sec`} sub="Média por ciclo" />
      </div>

      {/* Linha 2 — evolução por tipo + donut */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SCard title="Ciclos por tipo ao longo do tempo">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.byDay ?? []} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={28} allowDecimals={false} />
                <Tooltip
                  formatter={(value, name) => [
                    `${Number(value ?? 0)} ciclos`,
                    String(name) === "washer" ? "Lavadora" : "Secadora",
                  ]}
                  labelFormatter={(label) => formatDateLabel(String(label ?? ""))}
                  contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "12px" }}
                />
                <Legend
                  formatter={(value) => value === "washer" ? "Lavadora" : "Secadora"}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                />
                <Line type="monotone" dataKey="washer" stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                <Line type="monotone" dataKey="dryer"  stroke="#F97316" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SCard>

        <SCard title="Distribuição WASHER vs DRYER">
          <DistributionChart data={distributionData} />
        </SCard>
      </div>

      {/* Linha 3 — rankings por tipo */}
      <div className="grid gap-4 xl:grid-cols-2">
        <SCard title="Ranking por ciclos de lavadora">
          {washerByUnit.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sem dados no período</p>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {washerByUnit.map((u) => (
                <CycleUnitBar key={u.laundryId} name={u.name} count={u.washer} max={maxWasher} color="#3B82F6" />
              ))}
            </div>
          )}
        </SCard>

        <SCard title="Ranking por ciclos de secadora">
          {dryerByUnit.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sem dados no período</p>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {dryerByUnit.map((u) => (
                <CycleUnitBar key={u.laundryId} name={u.name} count={u.dryer} max={maxDryer} color="#F97316" />
              ))}
            </div>
          )}
        </SCard>
      </div>
    </div>
  );
}

// ── Units tab ─────────────────────────────────────────────────────────────

interface LaundryWithStats {
  id: string; name: string; city: string; state: string;
  street: string; neighborhood: string; ownerName: string;
  ownerEmail: string; ownerMobile: string;
  stats: { totalPaidValue: number; cyclesCount: number; ticketMedio: number };
}

function UnitsTabContent({ from, to }: { from: string; to: string }) {
  const [laundries, setLaundries] = useState<LaundryWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams({ from, to });
    fetch(`/api/laundries?${p}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setLaundries(d.laundries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  const sorted = [...laundries].sort((a, b) => b.stats.totalPaidValue - a.stats.totalPaidValue);
  const chartData = sorted
    .filter((l) => l.stats.totalPaidValue > 0)
    .map((l) => ({ name: l.name, total: l.stats.totalPaidValue }));

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-10 text-center text-sm text-gray-400">
          Carregando...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SCard title="Comparativo de unidades">
        {chartData.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Nenhum dado disponível no período.</div>
        ) : (
          <RevenueChart data={chartData} />
        )}
      </SCard>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((laundry, idx) => (
          <LaundryCard
            key={laundry.id}
            name={laundry.name}
            city={laundry.city}
            state={laundry.state}
            street={laundry.street}
            neighborhood={laundry.neighborhood}
            ownerName={laundry.ownerName}
            position={idx + 1}
            stats={laundry.stats}
          />
        ))}
      </div>
    </div>
  );
}

// ── General tab ────────────────────────────────────────────────────────────

interface GeneralKpisState {
  fatHoje: number; ciclosHoje: number; ticketMedio: number; ciclosMes: number;
}
interface LastSaleItem {
  id: string; laundryName: string; machineLabel: string;
  paymentLabel: string; paidValue: number;
}
interface AvgByUnitItem { laundryId: string; name: string; avgMachines: number; }

const PIE_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#F97316", "#EC4899"];
const MACHINE_COLORS = ["#3B82F6", "#F97316"];

function SectionTitle({ label }: { label: string }) {
  return (
    <div
      style={{
        fontSize: 11, fontWeight: 800, color: "#9CA3AF",
        textTransform: "uppercase" as const, letterSpacing: "0.08em",
        marginTop: 28, marginBottom: 12,
        borderBottom: "2px solid #E5E7EB", paddingBottom: 6,
      }}
    >
      {label}
    </div>
  );
}

function periodLabel(p: ReturnType<typeof parsePeriod>): string {
  if (p === "hoje")         return "hoje";
  if (p === "semana")       return "semana atual";
  if (p === "mes")          return "mês atual";
  if (p === "mes-anterior") return "mês anterior";
  return "todo o período";
}

// ── Chart Carousel ────────────────────────────────────────────────────────

interface CarouselSlide { title: string; node: React.ReactNode; }

function ChartCarousel({ slides }: { slides: CarouselSlide[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % slides.length), 15000);
    return () => clearInterval(id);
  }, [paused, slides.length]);

  if (!slides.length) return null;
  const { title, node } = slides[idx];

  return (
    <SCard
      title={title}
      action={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIdx(i)}
                className="rounded-full transition-colors"
                style={{ width: 6, height: 6, background: i === idx ? "#3B82F6" : "#D1D5DB" }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title={paused ? "Retomar" : "Pausar"}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />}
          </button>
        </div>
      }
    >
      {node}
    </SCard>
  );
}

// ── General Tab ───────────────────────────────────────────────────────────

function GeneralTabContent({ from, to, period }: { from: string; to: string; period: ReturnType<typeof parsePeriod> }) {
  const [kpis, setKpis]           = useState<GeneralKpisState | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DayPoint[]>([]);
  const [comparison, setComparison]    = useState<ComparisonData | null>(null);
  const [byPayment, setByPayment]      = useState<DistribEntry[]>([]);
  const [byMachineType, setByMachineType] = useState<DistribEntry[]>([]);
  const [avgMachinesByUnit, setAvgMachinesByUnit] = useState<AvgByUnitItem[]>([]);
  const [weekdays, setWeekdays]        = useState<Array<{ label: string; total: number; count: number }>>([]);
  const [laundries, setLaundries]      = useState<LaundryWithStats[]>([]);
  const [lastSales, setLastSales]      = useState<LastSaleItem[]>([]);
  const [loading, setLoading]          = useState(true);

  useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams({ from, to });
    Promise.all([
      fetch("/api/kpis",                { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/sales?${sp}`,         { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/analytics?${sp}`,     { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/laundries?${sp}`,     { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/last-sales?limit=20", { cache: "no-store" }).then((r) => r.json()),
      fetch(`/api/cycles?${sp}`,        { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([kpisRes, salesRes, analyticsRes, laundriesRes, lastSalesRes, cyclesRes]) => {
        setKpis({
          fatHoje:     kpisRes.kpis?.fatHoje?.value     ?? 0,
          ciclosHoje:  kpisRes.kpis?.ciclosHoje?.value  ?? 0,
          ticketMedio: kpisRes.kpis?.ticketMedio?.value ?? 0,
          ciclosMes:   kpisRes.kpis?.ciclosMes?.value   ?? 0,
        });
        setDailyRevenue(salesRes.dailyEvolution ?? []);
        setByPayment(salesRes.byPayment ?? []);
        setByMachineType(salesRes.byMachineType ?? []);
        setAvgMachinesByUnit(cyclesRes.avgMachinesByUnit ?? []);
        setComparison(analyticsRes.comparison ?? null);
        setWeekdays(analyticsRes.weekdays ?? []);
        setLaundries(laundriesRes.laundries ?? []);
        setLastSales(lastSalesRes.sales ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to]);

  if (loading) {
    return (
      <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-10 text-center text-sm text-gray-400">
        Carregando...
      </div>
    );
  }

  const sortedLaundries = [...laundries].sort((a, b) => b.stats.totalPaidValue - a.stats.totalPaidValue);
  const maxRevenue = sortedLaundries[0]?.stats.totalPaidValue ?? 1;

  return (
    <div className="flex flex-col gap-3 pb-12">
      {/* ── KPI Cards */}
      <div className="grid grid-cols-4 gap-2">
        <KpiCard icon={TrendingUp}     label="Faturamento hoje"  value={formatCurrency(kpis?.fatHoje     ?? 0)} />
        <KpiCard icon={Repeat}         label="Ciclos hoje"       value={`${kpis?.ciclosHoje ?? 0}`} />
        <KpiCard icon={Tag}            label="Ticket médio hoje" value={formatCurrency(kpis?.ticketMedio ?? 0)} />
        <KpiCard icon={WashingMachine} label="Ciclos do mês"     value={`${kpis?.ciclosMes  ?? 0}`} />
      </div>

      {/* ── Linha 1: evolução | ranking | comparativo */}
      <div className="grid grid-cols-3 gap-3">
        <SCard title={`Faturamento — ${periodLabel(period)}`} compact>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyRevenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tvRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={46} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value ?? 0)), "Faturamento"]}
                  labelFormatter={(label) => formatDateLabel(String(label ?? ""))}
                  contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "12px" }}
                />
                <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2} fill="url(#tvRevGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SCard>

        <SCard title="Ranking de unidades" compact>
          <div className="divide-y divide-[#E5E7EB] overflow-hidden" style={{ maxHeight: 212 }}>
            {sortedLaundries.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados no período</p>
            ) : sortedLaundries.map((l, i) => {
              const pct = maxRevenue > 0 ? Math.round((l.stats.totalPaidValue / maxRevenue) * 100) : 0;
              return (
                <div key={l.id} className="py-1.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-[#9CA3AF] w-4 shrink-0">#{i + 1}</span>
                      <span className="text-xs font-medium text-gray-900 truncate">{l.name.replace(/^Desce Lava\s*/i, "")}</span>
                    </div>
                    <span className="text-xs font-semibold text-[#10B981] ml-2 shrink-0">{formatCurrency(l.stats.totalPaidValue)}</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-[#F3F4F6]">
                    <div className="h-full rounded-full bg-[#3B82F6] transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SCard>

        <ChartCarousel slides={[
          {
            title: "Comparativo de período",
            node: comparison ? (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#3B82F6] shrink-0" />
                    <span className="text-xs text-[#6B7280]">{comparison.currentLabel}</span>
                    <span className="text-xs font-semibold text-[#111827]">{formatCurrency(comparison.currentTotal)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#D1D5DB] shrink-0" />
                    <span className="text-xs text-[#6B7280]">{comparison.previousLabel}</span>
                    <span className="text-xs font-semibold text-[#111827]">{formatCurrency(comparison.previousTotal)}</span>
                  </div>
                  {comparison.changePct !== null && (
                    <span className={`text-xs font-semibold ${comparison.changePct >= 0 ? "text-[#10B981]" : "text-red-500"}`}>
                      {comparison.changePct >= 0 ? "+" : ""}{comparison.changePct}%
                    </span>
                  )}
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={comparison.series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                      <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={46} />
                      <Tooltip
                        formatter={(value, name) => [formatCurrency(Number(value ?? 0)), String(name) === "current" ? "Atual" : "Anterior"]}
                        contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "11px" }}
                      />
                      <Line type="monotone" dataKey="current"  stroke="#3B82F6" strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                      <Line type="monotone" dataKey="previous" stroke="#D1D5DB" strokeWidth={2} strokeDasharray="4 4" dot={false} activeDot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>,
          },
          {
            title: "Faturamento por pagamento",
            node: byPayment.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byPayment} cx="38%" cy="50%" innerRadius={36} outerRadius={66} dataKey="total" nameKey="label">
                      {byPayment.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v ?? 0)), "Faturamento"]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, lineHeight: "18px" }} layout="vertical" align="right" verticalAlign="middle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ),
          },
          {
            title: "Lavadora vs Secadora",
            node: byMachineType.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sem dados</p>
            ) : (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byMachineType} cx="38%" cy="50%" innerRadius={36} outerRadius={66} dataKey="total" nameKey="label">
                      {byMachineType.map((_, i) => (
                        <Cell key={i} fill={MACHINE_COLORS[i % MACHINE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v ?? 0)), "Faturamento"]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, lineHeight: "18px" }} layout="vertical" align="right" verticalAlign="middle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ),
          },
          {
            title: "Faturamento por dia da semana",
            node: (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdays} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9CA3AF" }} tickLine={false} axisLine={false} />
                    <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9CA3AF" }} tickLine={false} axisLine={false} width={46} />
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value ?? 0)), "Faturamento"]}
                      contentStyle={{ borderRadius: "10px", border: "1px solid #E5E7EB", fontSize: "11px" }}
                    />
                    <Bar dataKey="total" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ),
          },
        ]} />
      </div>

      {/* ── Linha 2: avg máquinas + localização */}
      <div className="grid grid-cols-3 gap-3">
        <SCard title="Média de máquinas por ciclo" compact className="col-span-2">
          {avgMachinesByUnit.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Sem dados</p>
          ) : (
            <div className="flex gap-2 h-44">
              <div className="w-[38%] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={avgMachinesByUnit.slice(0, 12)}
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={68}
                      dataKey="avgMachines"
                      nameKey="name"
                    >
                      {avgMachinesByUnit.slice(0, 12).map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [`${Number(v ?? 0).toFixed(1)} máq/ciclo`, "Média"]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 grid grid-cols-2 content-center gap-x-4 gap-y-1 overflow-hidden py-1">
                {avgMachinesByUnit.slice(0, 12).map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-[10px] text-gray-700 truncate leading-tight">
                      {item.name.replace(/^Desce Lava\s*/i, "")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SCard>

        <SCard title="Localização das unidades" compact>
          <div className="overflow-y-auto" style={{ maxHeight: 196 }}>
            {[...laundries].sort((a, b) => b.stats.totalPaidValue - a.stats.totalPaidValue).map((l, i) => (
              <div key={l.id} className="flex items-center gap-2.5 py-1.5 border-b border-[#F3F4F6] last:border-0 first:pt-0">
                <span className="text-[10px] font-bold text-gray-300 w-4 shrink-0 text-right">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{l.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">
                    {[l.neighborhood, l.city, l.state].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SCard>
      </div>

      {/* ── Ticker */}
      {lastSales.length > 0 && (
        <>
          <style>{`
            @keyframes ticker-scroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .ticker-track {
              display: flex;
              white-space: nowrap;
              animation: ticker-scroll 60s linear infinite;
              will-change: transform;
            }
          `}</style>
          <div
            className="fixed bottom-0 left-0 right-0 overflow-hidden z-40"
            style={{ background: "#1E3A5F", display: "flex", alignItems: "center" }}
          >
            <div style={{ flexShrink: 0, padding: "10px 20px", borderRight: "1px solid rgba(255,255,255,0.12)", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1", whiteSpace: "nowrap" }}>Dados da última sincronização:</span>
              <span style={{ color: "#3B82F6", fontSize: 14, fontWeight: 700 }}>→</span>
            </div>
            <div style={{ flex: 1, overflow: "hidden", padding: "10px 0" }}>
              <div className="ticker-track">
                {[...lastSales, ...lastSales].map((s, i) => (
                  <span key={`${s.id}-${i}`} style={{ fontSize: 13, fontWeight: 500, color: "#E2E8F0" }}>
                    <span style={{ paddingLeft: 32 }}>{s.laundryName} · {s.machineLabel} · {formatCurrency(s.paidValue)} · {s.paymentLabel}</span>
                    <span style={{ color: "#3B82F6", margin: "0 8px" }}>→</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main content ───────────────────────────────────────────────────────────

function DashboardContent() {
  const searchParams = useSearchParams();

  const activeTab = (searchParams.get("tab") as TabKey) ?? "general";
  const period = parsePeriod(searchParams.get("period"));
  const { from, to } = getPeriodDates(period);

  return (
    <div className="space-y-2">

      {/* Geral */}
      {activeTab === "general" && <GeneralTabContent from={from} to={to} period={period} />}

      {/* Vendas */}
      {activeTab === "sales" && <SalesTabContent from={from} to={to} />}

      {/* Ciclos */}
      {activeTab === "cycles" && <CyclesTabContent from={from} to={to} />}

      {/* Máquinas */}
      {activeTab === "machines" && <MachinesTabContent from={from} to={to} />}

      {/* Unidades */}
      {activeTab === "units" && <UnitsTabContent from={from} to={to} />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Carregando...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
