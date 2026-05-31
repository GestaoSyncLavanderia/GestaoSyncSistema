"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, CalendarDays, DollarSign, Repeat, TrendingUp, Users } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SCard } from "@/components/s-card";
import { PeriodToggle } from "@/components/period-toggle";
import { DistributionChart } from "@/components/distribution-chart";
import { RankingList } from "@/components/ranking-list";
import { RevenueChart } from "@/components/revenue-chart";
import { formatCurrency } from "@/lib/format";

interface KpiValue {
  value: number;
  trend: number | null;
}

interface KpisResponse {
  kpis: {
    fatHoje:     KpiValue;
    ticketMedio: KpiValue;
    ciclosHoje:  KpiValue;
    fatMes:      KpiValue;
    mediaDiaria: KpiValue;
    fatAno:      KpiValue;
  };
  distribution: Array<{ laundryId: string; name: string; city: string; state: string; total: number; cycles: number }>;
}

interface RankingUnit {
  position: number;
  laundryId: string;
  name: string;
  city: string;
  state: string;
  total: number;
  cycles: number;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KpisResponse["kpis"] | null>(null);
  const [distribution, setDistribution] = useState<KpisResponse["distribution"]>([]);
  const [chartPeriod, setChartPeriod] = useState<"today" | "month">("today");
  const [ranking, setRanking] = useState<RankingUnit[]>([]);
  const [rankingLoading, setRankingLoading] = useState(true);

  useEffect(() => {
    async function loadKpis() {
      const res = await fetch("/api/kpis", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as KpisResponse;
      setKpis(data.kpis);
      setDistribution(data.distribution);
    }
    loadKpis();
  }, []);

  useEffect(() => {
    async function loadRanking() {
      setRankingLoading(true);
      const res = await fetch(`/api/ranking?period=${chartPeriod}`, { cache: "no-store" });
      if (!res.ok) { setRanking([]); setRankingLoading(false); return; }
      const data = await res.json();
      setRanking(data.ranking ?? []);
      setRankingLoading(false);
    }
    loadRanking();
  }, [chartPeriod]);

  const chartData = useMemo(
    () => ranking.slice(0, 12).map((item) => ({ name: item.name, total: item.total })),
    [ranking]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <KpiCard
          icon={TrendingUp}
          label="Faturamento hoje"
          value={formatCurrency(kpis?.fatHoje.value ?? 0)}
          sub="vs. ontem"
          trend={kpis?.fatHoje.trend}
        />
        <KpiCard
          icon={Repeat}
          label="Ciclos hoje"
          value={`${kpis?.ciclosHoje.value ?? 0}`}
          sub="vs. ontem"
          trend={kpis?.ciclosHoje.trend}
        />
        <KpiCard
          icon={DollarSign}
          label="Ticket médio"
          value={formatCurrency(kpis?.ticketMedio.value ?? 0)}
          sub="vs. ontem"
          trend={kpis?.ticketMedio.trend}
        />
        <KpiCard
          icon={CalendarDays}
          label="Faturamento mensal"
          value={formatCurrency(kpis?.fatMes.value ?? 0)}
          sub="vs. mês anterior"
          trend={kpis?.fatMes.trend}
        />
        <KpiCard
          icon={Users}
          label="Média diária"
          value={formatCurrency(kpis?.mediaDiaria.value ?? 0)}
          sub="vs. mês anterior"
          trend={kpis?.mediaDiaria.trend}
        />
        <KpiCard
          icon={Calendar}
          label="Faturamento anual"
          value={formatCurrency(kpis?.fatAno.value ?? 0)}
          sub="vs. ano anterior"
          trend={kpis?.fatAno.trend}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <SCard title="Distribuição hoje" className="min-h-[420px]">
          <DistributionChart data={distribution.map((item) => ({ name: item.name, total: item.total }))} />
        </SCard>

        <SCard title="Ranking de unidades" className="min-h-[420px]">
          {rankingLoading ? (
            <div className="rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-6 text-center text-sm text-gray-500">
              Carregando ranking...
            </div>
          ) : (
            <RankingList units={ranking.slice(0, 5)} />
          )}
        </SCard>
      </div>

      <SCard title="Faturamento por unidade">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">Visão por período</p>
            <p className="text-xs text-gray-500">Use o toggle para alternar entre hoje e mês.</p>
          </div>
          <PeriodToggle value={chartPeriod} onChange={setChartPeriod} />
        </div>
        {rankingLoading ? (
          <div className="rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-10 text-center text-sm text-gray-500">
            Carregando gráfico...
          </div>
        ) : (
          <RevenueChart data={chartData} />
        )}
      </SCard>
    </div>
  );
}
