"use client";

import { useState, useEffect, useTransition, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PERIODS, parsePeriod, type PeriodKey } from "@/lib/period";
import { OdometerCounter } from "@/components/odometer-counter";

function DashboardHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));

  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [fatMensal, setFatMensal] = useState(0);
  const [fatAnual, setFatAnual] = useState(0);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/sync/last")
      .then((r) => r.json())
      .then((d) => setLastSync(d.lastSync))
      .catch(() => {});
    fetch("/api/kpis", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setFatMensal(d.kpis?.fatMes?.value ?? 0);
        setFatAnual(d.kpis?.fatAno?.value ?? 0);
      })
      .catch(() => {});
  }, []);

  function handlePeriodChange(next: PeriodKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  async function handleSync() {
    setSyncStatus("loading");
    setSyncMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSyncStatus("success");
        const now = new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        });
        setLastSync(now);
        setSyncMessage(
          data.newSales === 0 && data.newCycles === 0
            ? "Sem novidades"
            : `+${data.newSales} vendas · +${data.newCycles} ciclos`
        );
        // Atualiza impostômetro com novos valores (anima os dígitos)
        fetch("/api/kpis", { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => {
            setFatMensal(d.kpis?.fatMes?.value ?? 0);
            setFatAnual(d.kpis?.fatAno?.value ?? 0);
          })
          .catch(() => {});
        startTransition(() => router.refresh());
      } else {
        setSyncStatus("error");
      }
    } catch {
      setSyncStatus("error");
    }
    setTimeout(() => {
      setSyncStatus("idle");
      setSyncMessage(null);
    }, 5000);
  }

  return (
    <>
    <header className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] px-6 h-14 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="text-[15px] font-semibold text-gray-900 shrink-0">
          Painel de gestão e faturamento
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Filtro global de período */}
        <div className="flex items-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePeriodChange(p.value)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                period === p.value
                  ? "bg-white text-[#3B82F6] shadow-sm border border-[#E5E7EB]"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {(lastSync || syncMessage) && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            {syncStatus === "success" ? (
              <CheckCircle2 size={13} className="text-[#10B981]" />
            ) : syncStatus === "error" ? (
              <XCircle size={13} className="text-red-400" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block" />
            )}
            <span className={syncMessage && syncMessage !== "Sem novidades" ? "text-[#10B981]" : ""}>
              {syncMessage ?? `Sync ${lastSync}`}
            </span>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncStatus === "loading"}
          className="h-8 gap-1.5 text-xs"
        >
          <RefreshCw
            size={13}
            className={syncStatus === "loading" ? "animate-spin" : ""}
          />
          Sincronizar
        </Button>
      </div>
    </header>
    <div className="flex gap-4 px-6 pt-4 pb-0">
      <OdometerCounter value={fatMensal} label="Faturamento Mensal" />
      <OdometerCounter value={fatAnual} label="Faturamento Anual" />
    </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      <Suspense fallback={
        <header className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] px-6 h-14 flex items-center">
          <span className="text-[15px] font-semibold text-gray-900">
            Painel de gestão e faturamento
          </span>
        </header>
      }>
        <DashboardHeader />
      </Suspense>
      <main className="p-6">{children}</main>
    </div>
  );
}
