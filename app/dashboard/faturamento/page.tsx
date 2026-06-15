"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { TrendingUp, Repeat, Tag, Info } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { parsePeriod, getPeriodDates } from "@/lib/period";
import { formatCurrency, formatCurrencyK } from "@/lib/format";
import { KpiCard } from "@/components/kpi-card";
import { SCard } from "@/components/s-card";
import { LaundryCard } from "@/components/laundry-card";

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
}

interface DailyPoint {
  date: string;
  total: number;
  count: number;
}

interface FaturamentoData {
  total: number;
  count: number;
  ticketMedio: number;
  ranking: RankingUnit[];
  dailyEvolution: DailyPoint[];
}

function FaturamentoContent() {
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));
  const { from, to } = getPeriodDates(period);

  const [data, setData] = useState<FaturamentoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/faturamento?from=${from}&to=${to}`, { cache: "no-store" });
      if (!res.ok) { setLoading(false); return; }
      setData(await res.json());
      setLoading(false);
    }
    load();
  }, [from, to]);

  const chartData = (data?.dailyEvolution ?? []).map((d) => ({
    date: d.date.slice(5),
    total: d.total,
  }));

  const sorted = data?.ranking ?? [];

  return (
    <div className="space-y-4">
      {/* Aviso explicativo */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Corresponde à aba <strong>Dashboard</strong> do SisLav — soma o <strong>paidValue</strong> de todas as vendas,
          incluindo ciclos em andamento. Pagamentos via saldo da carteira têm paidValue zero e ficam excluídos automaticamente.
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard
          icon={TrendingUp}
          label="Faturamento recebido"
          value={loading ? "..." : formatCurrency(data?.total ?? 0)}
          sub="paidValue acumulado no período"
        />
        <KpiCard
          icon={Repeat}
          label="Total de vendas"
          value={loading ? "..." : String(data?.count ?? 0)}
          sub="incluindo ciclos em andamento"
        />
        <KpiCard
          icon={Tag}
          label="Ticket médio"
          value={loading ? "..." : formatCurrency(data?.ticketMedio ?? 0)}
          sub="por venda"
        />
      </div>

      {/* Evolução diária */}
      {chartData.length > 1 && (
        <SCard title="Evolução diária">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradFat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatCurrencyK(v)} tick={{ fontSize: 11 }} width={64} />
              <Tooltip formatter={(v) => [formatCurrency(Number(v ?? 0)), "Faturamento"]} />
              <Area type="monotone" dataKey="total" stroke="#3B82F6" fill="url(#gradFat)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </SCard>
      )}

      {/* Ranking de unidades */}
      <SCard title="Faturamento por unidade">
        {loading ? (
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
                stats={{
                  totalPaidValue: unit.total,
                  cyclesCount: unit.count,
                  ticketMedio: unit.ticketMedio,
                }}
              />
            ))}
          </div>
        )}
      </SCard>
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
