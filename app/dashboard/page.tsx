"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Repeat, TrendingUp, WashingMachine, Store, Tag, Wind } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, Legend,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { KpiCard } from "@/components/kpi-card";
import { SCard } from "@/components/s-card";
import { DistributionChart } from "@/components/distribution-chart";
import { RevenueChart } from "@/components/revenue-chart";
import { LaundryCard } from "@/components/laundry-card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { parsePeriod, getPeriodDates } from "@/lib/period";

// ── Tab config ─────────────────────────────────────────────────────────────

type TabKey = "sales" | "cycles" | "machines" | "units";

const TABS: { key: TabKey; label: string }[] = [
  { key: "sales",    label: "Vendas" },
  { key: "cycles",   label: "Ciclos" },
  { key: "machines", label: "Máquinas" },
  { key: "units",    label: "Unidades" },
];

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

// ── Main content ───────────────────────────────────────────────────────────

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams.get("tab") as TabKey) ?? "sales";
  const period = parsePeriod(searchParams.get("period"));
  const { from, to } = getPeriodDates(period);

  function handleTabChange(tab: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <div className="flex gap-1 bg-white border border-[#E5E7EB] rounded-[14px] p-1 w-fit">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => handleTabChange(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-[10px] transition-colors",
              activeTab === key
                ? "bg-[#3B82F6] text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

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
