"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { parsePeriod, getPeriodDates } from "@/lib/period";
import { Search, Users, Info, X, UserCheck, UserX, Cake } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
import { SCard } from "@/components/s-card";
import { formatCurrency } from "@/lib/format";

interface CustomerRecord {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  document: string;
  documentType: string;
  birthDate: string | null;
  laundries: Array<{ laundry: { name: string } }>;
}

interface CustomerDetail {
  customer: CustomerRecord;
  cycles: Array<{
    id: string;
    machineType: string;
    machinesUsed: number[];
    machinesCount: number;
    totalPaidValue: number;
    paymentMethod: string;
    cycleDate: string;
    laundry: { name: string };
  }>;
  summary: {
    totalSpent: number;
    cyclesCount: number;
    lastVisit: string | null;
    preferredPayment: string | null;
  };
}

interface RankingEntry {
  position: number;
  customerId: string;
  name: string;
  totalSpent: number;
  cycles: number;
}

interface BalanceUser {
  customerId: string;
  name: string;
  document: string;
  totalValue: number;
  cycles: number;
}

interface CustomersResponse {
  customers: CustomerRecord[];
  total: number;
  page: number;
  limit: number;
  stats: {
    uniqueTotal: number;
    newInPeriod: number;
    inactive: number;
    birthdaysThisMonth: number;
  };
  ranking: RankingEntry[];
  balanceUsers: BalanceUser[];
}

function CustomersContent() {
  const searchParams = useSearchParams();
  const period = parsePeriod(searchParams.get("period"));
  const { from, to } = getPeriodDates(period);

  const [data, setData] = useState<CustomersResponse | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (search) params.set("search", search);
      params.set("from", from);
      params.set("to", to);
      const res = await fetch(`/api/customers?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const json = (await res.json()) as CustomersResponse;
      setData(json);
      setLoading(false);
    }
    load();
  }, [search, page, limit, from, to]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    fetch(`/api/customers/${selectedId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { setDetail(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [selectedId]);

  const pageCount = useMemo(() => Math.ceil((data?.total ?? 0) / limit), [data?.total, limit]);
  const stats = data?.stats;
  const ranking = data?.ranking ?? [];
  const customers = data?.customers ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Clientes únicos"
          value={`${stats?.uniqueTotal ?? 0}`}
          sub="Com pelo menos 1 ciclo"
        />
        <KpiCard
          icon={UserCheck}
          label="Novos no período"
          value={`${stats?.newInPeriod ?? 0}`}
          sub="Primeiro ciclo no período selecionado"
        />
        <KpiCard
          icon={UserX}
          label="Inativos"
          value={`${stats?.inactive ?? 0}`}
          sub="Sem ciclos nos últimos 30 dias"
        />
        <KpiCard
          icon={Cake}
          label="Aniversariantes"
          value={`${stats?.birthdaysThisMonth ?? 0}`}
          sub="Aniversariantes este mês"
        />
      </div>

      <SCard title="Top 10 clientes por gasto total">
        <div className="overflow-hidden rounded-[14px] border border-[#E5E7EB]">
          <table className="min-w-full divide-y divide-[#E5E7EB] text-sm text-gray-700">
            <thead className="bg-[#F8FAFC] text-xs uppercase tracking-[0.16em] text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left w-8">#</th>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-right">Ciclos</th>
                <th className="px-4 py-3 text-right">Gasto total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E7EB] bg-white">
              {ranking.map((r) => (
                <tr
                  key={r.customerId}
                  className="hover:bg-[#FBFBFB] cursor-pointer"
                  onClick={() => setSelectedId(r.customerId)}
                >
                  <td className="px-4 py-3 text-gray-400 font-medium">{r.position}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{r.cycles}</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#10B981]">
                    {formatCurrency(r.totalSpent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SCard>

      {/* Usuários de saldo */}
      {(data?.balanceUsers ?? []).length > 0 && (
        <SCard title="Usuários de saldo (BALANCE)">
          <div className="overflow-hidden rounded-[14px] border border-[#E5E7EB]">
            <table className="min-w-full divide-y divide-[#E5E7EB] text-sm text-gray-700">
              <thead className="bg-[#F8FAFC] text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Documento</th>
                  <th className="px-4 py-3 text-right">Usos de saldo</th>
                  <th className="px-4 py-3 text-right">Valor total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] bg-white">
                {(data?.balanceUsers ?? []).map((u) => (
                  <tr
                    key={u.customerId}
                    className="hover:bg-[#FBFBFB] cursor-pointer"
                    onClick={() => setSelectedId(u.customerId)}
                  >
                    <td className="px-4 py-3 font-medium text-[#111827]">{u.name}</td>
                    <td className="px-4 py-3 text-xs text-[#6B7280]">{u.document}</td>
                    <td className="px-4 py-3 text-right text-[#6B7280]">{u.cycles}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#10B981]">
                      {formatCurrency(u.totalValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-[#6B7280]">
            Clientes que utilizaram saldo (BALANCE) como forma de pagamento no período selecionado, ordenados por frequência de uso.
          </p>
        </SCard>
      )}

      <div className="flex flex-col gap-6 xl:flex-row">
        <div className="flex-1 space-y-4">
          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4 flex items-center justify-between gap-3">
            <p className="text-sm text-gray-500">{data?.total ?? 0} clientes</p>
            <div className="flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2 text-sm text-gray-600">
              <Search size={15} />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Buscar por nome, email ou CPF"
                className="border-0 bg-transparent p-0 text-sm text-gray-900 outline-none w-52"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white">
            <table className="min-w-full divide-y divide-[#E5E7EB] text-sm text-gray-700">
              <thead className="bg-[#F8FAFC] text-xs uppercase tracking-[0.16em] text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Documento</th>
                  <th className="px-4 py-3 text-left">Unidades</th>
                  <th className="px-4 py-3 text-right">Detalhe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                      Carregando...
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  customers.map((c) => (
                    <tr
                      key={c.id}
                      className={`hover:bg-[#FBFBFB] cursor-pointer ${selectedId === c.id ? "bg-[#EFF6FF]" : ""}`}
                      onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                    >
                      <td className="px-4 py-4 font-medium text-gray-900">{c.name}</td>
                      <td className="px-4 py-4 text-gray-500 text-xs">
                        {c.documentType} {c.document}
                      </td>
                      <td className="px-4 py-4 text-gray-500 text-xs">
                        {c.laundries.map((l) => l.laundry.name).join(", ")}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-[#F8FAFC]"
                        >
                          <Info size={13} /> Ver
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#E5E7EB] bg-white p-4">
            <p className="text-sm text-gray-500">Página {page} de {pageCount || 1}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(pageCount || 1, page + 1))}
                disabled={page >= pageCount}
                className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>

        <div className="w-full max-w-xl xl:max-w-md shrink-0">
          {selectedId && (detail || detailLoading) ? (
            <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-5 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">Detalhe do cliente</p>
                <button
                  type="button"
                  onClick={() => { setSelectedId(null); setDetail(null); }}
                  className="rounded-full p-1 hover:bg-gray-100"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              </div>

              {detailLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">Carregando...</div>
              ) : detail ? (
                <>
                  <div className="space-y-1">
                    <p className="text-base font-semibold text-gray-900">{detail.customer.name}</p>
                    {detail.customer.email && (
                      <p className="text-xs text-gray-400">{detail.customer.email}</p>
                    )}
                    {detail.customer.mobile && (
                      <p className="text-xs text-gray-400">{detail.customer.mobile}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {detail.customer.documentType}: {detail.customer.document}
                    </p>
                    {detail.customer.birthDate && (
                      <p className="text-xs text-gray-400">
                        Nascimento: {new Date(detail.customer.birthDate).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-[#E5E7EB] pt-4">
                    <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      <p className="text-xs text-gray-400">Gasto total</p>
                      <p className="text-sm font-semibold text-[#10B981]">
                        {formatCurrency(detail.summary.totalSpent)}
                      </p>
                    </div>
                    <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      <p className="text-xs text-gray-400">Ciclos</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {detail.summary.cyclesCount}
                      </p>
                    </div>
                    <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      <p className="text-xs text-gray-400">Última visita</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {detail.summary.lastVisit
                          ? new Date(detail.summary.lastVisit).toLocaleDateString("pt-BR")
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      <p className="text-xs text-gray-400">Pagamento preferido</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {detail.summary.preferredPayment ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="border-t border-[#E5E7EB] pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                      Histórico de ciclos
                    </p>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {detail.cycles.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem ciclos registrados.</p>
                      ) : (
                        detail.cycles.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between rounded-[10px] border border-[#E5E7EB] bg-[#F8FAFC] px-3 py-2"
                          >
                            <div>
                              <p className="text-xs font-medium text-gray-900">
                                {c.machineType === "WASHER" ? "Lavadora" : "Secadora"} — grupos{" "}
                                {c.machinesUsed.join(", ")}
                              </p>
                              <p className="text-xs text-gray-400">
                                {c.laundry.name} ·{" "}
                                {new Date(c.cycleDate).toLocaleDateString("pt-BR")}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-[#10B981]">
                              {formatCurrency(c.totalPaidValue)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-6 text-center">
              <Users size={24} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">
                Selecione um cliente para ver o histórico completo.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Carregando...</div>}>
      <CustomersContent />
    </Suspense>
  );
}
