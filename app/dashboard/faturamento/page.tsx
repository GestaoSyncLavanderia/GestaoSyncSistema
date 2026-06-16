"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TrendingUp, Repeat, Tag, BarChart2, LayoutGrid, Store, MapPin, MonitorSmartphone } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LabelList, PieChart, Pie, Cell,
  Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts";
import { parsePeriod, getPeriodDates } from "@/lib/period";
import { formatCurrency, formatCurrencyK } from "@/lib/format";
import { LaundryCard } from "@/components/laundry-card";
import { cn } from "@/lib/utils";

interface RankingUnit {
  position: number;
  laundryId: string;
  name: string;
  city: string;
  state: string;
  street: string;
  neighborhood: string;
  ownerName: string;
  total: number;
  count: number;
  ticketMedio: number;
  syncNote?: string;
}

interface DailyPoint { date: string; total: number; count: number; }

interface FaturamentoData {
  total: number;
  count: number;
  ticketMedio: number;
  ranking: RankingUnit[];
  dailyEvolution: DailyPoint[];
}

interface DistribEntry { label: string; total: number; count: number; pct: number; }
interface SalesDistrib { byPayment: DistribEntry[]; byMachineType: DistribEntry[]; }

type View = "relatorios" | "unidades";

const PAYMENT_COLORS  = ["#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4"];
const MACHINE_COLORS  = ["#06B6D4", "#F97316"];

function KpiBlock({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 flex items-center gap-3">
      <div className="rounded-lg p-2 shrink-0" style={{ background: `${color}15` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-tight truncate">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

function shortName(name: string) {
  return name.replace(/^Desce[\s-]+[Ee]?\s*Lava[\s-]*/i, "").replace(/^Desce\s+/i, "");
}

function FaturamentoContent() {
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));
  const { from, to } = getPeriodDates(period);

  const [view, setView]     = useState<View>("relatorios");
  const [data, setData]     = useState<FaturamentoData | null>(null);
  const [distrib, setDistrib] = useState<SalesDistrib | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/faturamento?from=${from}&to=${to}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
      fetch(`/api/sales?from=${from}&to=${to}&limit=1`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null),
    ]).then(([fat, sal]) => {
      if (fat) setData(fat);
      if (sal) setDistrib({ byPayment: sal.byPayment ?? [], byMachineType: sal.byMachineType ?? [] });
    }).finally(() => setLoading(false));
  }, [from, to]);

  const chartData = (data?.dailyEvolution ?? []).map((d) => ({
    date: d.date.slice(5),
    total: d.total,
  }));

  const top5    = (data?.ranking ?? []).slice(0, 5);
  const maxTop5 = top5[0]?.total ?? 1;
  const sorted  = data?.ranking ?? [];

  return (
    <div className="space-y-3">
      {/* ── View toggle ───────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-0.5">
          {([["relatorios", BarChart2, "Relatórios"], ["unidades", LayoutGrid, "Unidades"]] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                view === key
                  ? "bg-white text-[#3B82F6] shadow-sm border border-[#E5E7EB]"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-3 py-1.5">
          <MonitorSmartphone size={13} className="text-blue-400 shrink-0" />
          <span className="text-xs text-blue-500">
            Espelha a aba <span className="font-semibold">Dashboard</span> do SisLav
          </span>
        </div>
      </div>

      {view === "relatorios" ? (
        <>
          {/* ── KPIs ───────────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-3">
            <KpiBlock icon={TrendingUp} label="Faturamento recebido" color="#3B82F6"
              value={loading ? "..." : formatCurrency(data?.total ?? 0)}
              sub="paidValue acumulado no período" />
            <KpiBlock icon={Repeat} label="Total de vendas" color="#10B981"
              value={loading ? "..." : String(data?.count ?? 0)}
              sub="transações (≠ ciclos de máquina)" />
            <KpiBlock icon={Tag} label="Ticket médio" color="#F59E0B"
              value={loading ? "..." : formatCurrency(data?.ticketMedio ?? 0)}
              sub="por venda" />
            <KpiBlock icon={Store} label="Melhor unidade" color="#8B5CF6"
              value={loading ? "..." : (top5[0] ? shortName(top5[0].name) : "—")}
              sub={top5[0] ? formatCurrency(top5[0].total) : undefined} />
          </div>

          {/* ── Linha principal: evolução + top 5 ──────────── */}
          <div className="grid grid-cols-3 gap-3">
            {/* Evolução diária ou ranking do dia (col-span-2) */}
            <div className="col-span-2 rounded-xl border border-[#E5E7EB] bg-white p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {chartData.length <= 1 ? "Faturamento por unidade — hoje" : "Evolução diária"}
              </p>
              {chartData.length <= 1 ? (
                /* Quando filtro = "hoje": barras horizontais com todas as unidades */
                sorted.length === 0 ? (
                  <div className="flex items-center justify-center" style={{ height: 390 }}>
                    <span className="text-sm text-gray-400">Sem dados para hoje</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={390}>
                    <BarChart
                      layout="vertical"
                      data={sorted.map((u) => ({ name: shortName(u.name), total: u.total, count: u.count }))}
                      margin={{ top: 2, right: 110, left: 4, bottom: 2 }}
                      barSize={18}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => formatCurrencyK(v)} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: "#374151" }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v) => [formatCurrency(Number(v ?? 0)), "Faturamento"]} />
                      <Bar dataKey="total" fill="#3B82F6" radius={[0, 5, 5, 0]}>
                        <LabelList dataKey="total" position="right" formatter={(v: unknown) => formatCurrency(Number(v ?? 0))} style={{ fontSize: 11, fill: "#374151", fontWeight: 600 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              ) : (
                <ResponsiveContainer width="100%" height={390}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => formatCurrencyK(v)} tick={{ fontSize: 11 }} width={68} />
                    <Tooltip formatter={(v) => [formatCurrency(Number(v ?? 0)), "Faturamento"]} />
                    <Area type="monotone" dataKey="total" stroke="#3B82F6" fill="url(#gradFat)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top 5 — localidade & ciclos */}
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4 flex flex-col">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Top 5 — localidade & ciclos</p>
              {loading ? (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Carregando...</div>
              ) : (
                <div className="flex-1 flex flex-col justify-between">
                  {top5.map((unit, i) => (
                    <div key={unit.laundryId} className="flex items-center justify-between gap-2 py-2 border-b border-[#F3F4F6] last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-bold text-gray-200 w-5 shrink-0">#{i + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{shortName(unit.name)}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <MapPin size={10} className="text-gray-400 shrink-0" />
                            <span className="text-xs text-gray-400 truncate">{unit.city}, {unit.state}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-[#3B82F6]">{unit.count} vendas</p>
                        <p className="text-[11px] text-gray-400">ticket {formatCurrency(unit.ticketMedio)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Linha inferior: distribuições + ranking ──── */}
          <div className="grid grid-cols-3 gap-3">
            {/* Por forma de pagamento */}
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Por forma de pagamento</p>
              {!distrib?.byPayment?.length ? (
                <div className="flex items-center justify-center h-44 text-sm text-gray-400">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={distrib.byPayment} cx="38%" cy="50%" innerRadius={44} outerRadius={76} dataKey="total" nameKey="label">
                      {distrib.byPayment.map((_, i) => (
                        <Cell key={i} fill={PAYMENT_COLORS[i % PAYMENT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v ?? 0)), ""]} />
                    <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} layout="vertical" align="right" verticalAlign="middle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Por tipo de máquina */}
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Por tipo de máquina</p>
              {!distrib?.byMachineType?.length ? (
                <div className="flex items-center justify-center h-44 text-sm text-gray-400">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={distrib.byMachineType} cx="38%" cy="50%" innerRadius={44} outerRadius={76} dataKey="total" nameKey="label">
                      {distrib.byMachineType.map((_, i) => (
                        <Cell key={i} fill={MACHINE_COLORS[i % MACHINE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v ?? 0)), ""]} />
                    <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 12 }} layout="vertical" align="right" verticalAlign="middle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Ticket médio por unidade */}
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Ticket médio por unidade</p>
              {(() => {
                const byTicket = [...sorted].sort((a, b) => b.ticketMedio - a.ticketMedio);
                const maxTicket = byTicket[0]?.ticketMedio ?? 1;
                return (
                  <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 196 }}>
                    {byTicket.map((unit) => (
                      <div key={unit.laundryId}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] text-gray-700 truncate flex-1">{shortName(unit.name)}</span>
                          <span className="text-[11px] font-semibold text-[#8B5CF6] ml-2 shrink-0">{formatCurrency(unit.ticketMedio)}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#F3F4F6]">
                          <div className="h-full rounded-full bg-[#8B5CF6] transition-all duration-500" style={{ width: `${(unit.ticketMedio / maxTicket) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </>
      ) : (
        /* ── Unidades view ────────────────────────────────── */
        loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-[14px] border border-[#E5E7EB] bg-white p-5 h-44" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Nenhum dado disponível.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((unit) => (
              <LaundryCard
                key={unit.laundryId}
                name={unit.name}
                city={unit.city}
                state={unit.state}
                street={unit.street}
                neighborhood={unit.neighborhood}
                ownerName={unit.ownerName}
                position={unit.position}
                syncNote={unit.syncNote}
                stats={{
                  totalPaidValue: unit.total,
                  cyclesCount: unit.count,
                  ticketMedio: unit.ticketMedio,
                }}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

export default function FaturamentoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Carregando...</div>}>
      <FaturamentoContent />
    </Suspense>
  );
}
