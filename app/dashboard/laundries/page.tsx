"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { parsePeriod, getPeriodDates } from "@/lib/period";
import { SCard } from "@/components/s-card";
import { LaundryCard } from "@/components/laundry-card";
import { RevenueChart } from "@/components/revenue-chart";

interface LaundryWithStats {
  id: string;
  name: string;
  city: string;
  state: string;
  street: string;
  neighborhood: string;
  ownerName: string;
  ownerEmail: string;
  ownerMobile: string;
  stats: {
    totalPaidValue: number;
    cyclesCount: number;
    ticketMedio: number;
  };
}

export default function LaundriesPage() {
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));
  const { from, to } = getPeriodDates(period);

  const [laundries, setLaundries] = useState<LaundryWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/laundries?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      setLaundries(data.laundries ?? []);
      setLoading(false);
    }
    load();
  }, [from, to]);

  const sorted = [...laundries].sort((a, b) => b.stats.totalPaidValue - a.stats.totalPaidValue);
  const chartData = sorted
    .filter((l) => l.stats.totalPaidValue > 0)
    .map((l) => ({ name: l.name, total: l.stats.totalPaidValue }));

  return (
    <div className="space-y-6">
      <SCard title="Comparativo de unidades">
        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Carregando...</div>
        ) : chartData.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Nenhum dado disponível. Realize uma sincronização primeiro.
          </div>
        ) : (
          <RevenueChart data={chartData} />
        )}
      </SCard>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-[14px] border border-[#E5E7EB] bg-white p-5 h-44" />
          ))}
        </div>
      ) : (
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
      )}
    </div>
  );
}
