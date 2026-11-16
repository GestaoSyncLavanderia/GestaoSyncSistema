"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Item {
  id: number;
  ranAt: string;
  day: string | null;
  ok: boolean;
  summary: string | null;
  differences: string[];
}

function formatDay(day: string | null) {
  if (!day) return "—";
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

function formatRanAt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  });
}

export default function BatimentoPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/batimento", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setFailed(true));
  }, []);

  function toggle(id: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const last = items?.[0];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4">
        <p className="text-[15px] font-semibold text-gray-900">Batimento diário com o SisLav</p>
        <p className="text-xs text-gray-500 mt-1">
          Todo dia às 07:00 o painel confere o dia anterior, unidade por unidade: o faturamento contra a aba
          Dashboard do SisLav e as vendas contra a lista de vendas. Qualquer diferença aparece aqui.
        </p>
        {last && (
          <div className={cn(
            "mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
            last.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
          )}>
            {last.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            Último batimento ({formatDay(last.day)}): {last.ok ? "tudo igual ao SisLav" : `${last.differences.length} diferença(s)`}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-[#E5E7EB] bg-white">
        {failed ? (
          <p className="p-6 text-sm text-red-600">Não foi possível carregar o histórico.</p>
        ) : items === null ? (
          <p className="p-6 text-sm text-gray-400">Carregando...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Nenhum batimento registrado ainda. O primeiro roda amanhã às 07:00.</p>
        ) : (
          <div className="divide-y divide-[#F3F4F6]">
            <div className="grid grid-cols-[140px_140px_1fr_24px] px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              <span>Dia conferido</span><span>Rodou em</span><span>Resultado</span><span />
            </div>
            {items.map((item) => (
              <div key={item.id}>
                <button
                  type="button"
                  disabled={item.ok}
                  onClick={() => toggle(item.id)}
                  className="w-full grid grid-cols-[140px_140px_1fr_24px] items-center px-5 py-3 text-left text-sm hover:bg-gray-50 disabled:hover:bg-transparent"
                >
                  <span className="font-medium text-gray-900">{formatDay(item.day)}</span>
                  <span className="text-gray-500 tabular-nums">{formatRanAt(item.ranAt)}</span>
                  <span className={cn("flex items-center gap-1.5", item.ok ? "text-emerald-600" : "text-red-600")}>
                    {item.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {item.ok ? "Igual ao SisLav" : `${item.differences.length} diferença(s)`}
                  </span>
                  {!item.ok && (
                    <ChevronDown size={14} className={cn("text-gray-400 transition-transform", open.has(item.id) && "rotate-180")} />
                  )}
                </button>
                {!item.ok && open.has(item.id) && (
                  <ul className="px-5 pb-3 space-y-1">
                    {item.differences.map((d, i) => (
                      <li key={i} className="text-xs text-gray-700 bg-red-50/60 rounded px-3 py-1.5">{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
