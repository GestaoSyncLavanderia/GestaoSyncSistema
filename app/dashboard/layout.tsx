"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";
import { PERIODS, parsePeriod, type PeriodKey } from "@/lib/period";
import { OdometerCounter } from "@/components/odometer-counter";
import { LogOut, Play, Pause } from "lucide-react";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
const CYCLE_ORDER: PeriodKey[] = ["hoje", "ontem", "semana", "mes", "mes-anterior", "total"];

const PAGE_TABS: { href: string; label: string }[] = [
  { href: "/dashboard/faturamento", label: "Faturamento" },
  { href: "/dashboard/movimento",   label: "Movimento" },
];

function DashboardHeader() {
  const pathname    = usePathname();
  const router      = useRouter();
  const searchParams = useSearchParams();
  const period      = parsePeriod(searchParams.get("period"));

  const [autoPlay, setAutoPlay] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const prevSyncRef = useRef<string | null>(null);
  const [clockDate, setClockDate] = useState("");
  const [clockTime, setClockTime] = useState("");
  const [fatMensal, setFatMensal] = useState(0);
  const [fatAnual,  setFatAnual]  = useState(0);

  useEffect(() => {
    function fetchData() {
      fetch("/api/sync/last")
        .then((r) => r.json())
        .then((d) => {
          const newId: string | null = d.lastSyncId ?? null;
          if (prevSyncRef.current !== null && newId !== prevSyncRef.current) {
            window.location.reload();
            return;
          }
          prevSyncRef.current = newId;
          setLastSync(d.lastSync ?? null);
        })
        .catch(() => {});
      fetch("/api/kpis", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          setFatMensal(d.kpis?.fatMes?.value ?? 0);
          setFatAnual(d.kpis?.fatAno?.value  ?? 0);
        })
        .catch(() => {});
    }

    fetchData();
    const id = setInterval(fetchData, 15 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function tick() {
      const now      = new Date();
      const weekday  = now.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
      const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      const date     = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
      const time     = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" });
      setClockDate(`${capitalized}, ${date}`);
      setClockTime(time);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!autoPlay) return;
    const id = setInterval(() => {
      const idx  = CYCLE_ORDER.indexOf(period);
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
      handlePeriodChange(next);
    }, 15000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, period]);

  function handlePeriodChange(next: PeriodKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <header className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] px-6 h-14 flex items-center justify-between gap-4">
        {/* Esquerda: tabs de navegação + título + última sync */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Faturamento / Movimento */}
          <div className="flex items-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-0.5 shrink-0">
            {PAGE_TABS.map(({ href, label }) => (
              <button
                key={href}
                type="button"
                onClick={() => router.push(`${href}${searchParams.get("period") ? `?period=${searchParams.get("period")}` : ""}`)}
                className={cn(
                  "px-3 py-1 text-[13px] font-medium rounded-md transition-colors",
                  pathname === href
                    ? "bg-[#10B981] text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-[#E5E7EB] shrink-0" />

          <span className="text-[14px] font-semibold text-gray-900 truncate">
            Painel de gestão e faturamento
          </span>

          {lastSync && (
            <>
              <div className="w-px h-4 bg-[#E5E7EB] shrink-0" />
              <div className="flex items-center gap-1.5 text-xs text-[#6B7280] shrink-0">
                <span className="w-2 h-2 rounded-full bg-[#10B981] inline-block" />
                <span>Última sync às {lastSync}</span>
              </div>
            </>
          )}
        </div>

        {/* Direita: período + autoplay + relógio + logout */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => handlePeriodChange(p.value)}
                  className={cn(
                    "rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    period === p.value
                      ? "bg-white text-[#3B82F6] shadow-sm border border-[#E5E7EB]"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAutoPlay((v) => !v)}
              title={autoPlay ? "Pausar rotação automática" : "Iniciar rotação automática"}
              className={cn(
                "p-1.5 rounded-lg border transition-colors",
                autoPlay
                  ? "bg-[#3B82F6] border-[#3B82F6] text-white"
                  : "border-[#E5E7EB] bg-[#F8FAFC] text-gray-500 hover:text-gray-700"
              )}
            >
              {autoPlay ? <Pause size={13} /> : <Play size={13} />}
            </button>
          </div>

          {clockTime && (
            <div
              className="flex flex-col items-start rounded-lg gap-0.5"
              style={{ background: "#1F2937", padding: "4px 18px" }}
            >
              <span className="leading-none tabular-nums" style={{ fontSize: "12px", color: "#9CA3AF", fontFamily: MONO }}>
                {clockDate}
              </span>
              <span className="font-semibold leading-none text-white tabular-nums" style={{ fontSize: "18px", fontFamily: MONO }}>
                {clockTime}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Sair"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <div className="flex gap-3 px-4 py-2 border-b border-[#E5E7EB]">
        <OdometerCounter value={fatMensal} label="Faturamento Mensal" compact fullWidth rateKey="rede" />
        <OdometerCounter value={fatAnual}  label="Faturamento Anual"  compact fullWidth rateKey="rede" />
      </div>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F3F4F6]">
      <Suspense
        fallback={
          <header className="sticky top-0 z-50 bg-white border-b border-[#E5E7EB] px-6 h-14 flex items-center">
            <span className="text-[15px] font-semibold text-gray-900">Painel de gestão e faturamento</span>
          </header>
        }
      >
        <DashboardHeader />
      </Suspense>
      <main className="px-4 pt-2 pb-4">{children}</main>
    </div>
  );
}
