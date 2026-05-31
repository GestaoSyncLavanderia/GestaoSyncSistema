import { ChevronLeft, ChevronRight } from "lucide-react";
import { SCard } from "@/components/s-card";
import { formatCurrency } from "@/lib/format";

export interface CycleItem {
  id: string;
  laundry: { name: string };
  customer: { name: string };
  machineType: string;
  machinesUsed: number[];
  machinesCount: number;
  totalPaidValue: number;
  paymentMethod: string;
  cycleDate: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  PIX: "PIX",
  CREDIT: "Crédito",
  DEBIT: "Débito",
  BALANCE: "Saldo",
};

interface CycleTableProps {
  cycles: CycleItem[];
  total: number;
  page: number;
  pageCount: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

export function CycleTable({ cycles, total, page, pageCount, loading, onPageChange }: CycleTableProps) {
  return (
    <SCard title="Ciclos">
      <div className="overflow-hidden rounded-[14px] border border-[#E5E7EB] bg-white">
        <table className="min-w-full divide-y divide-[#E5E7EB] text-sm text-gray-700">
          <thead className="bg-[#F8FAFC] text-xs uppercase tracking-[0.16em] text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Cliente</th>
              <th className="px-4 py-3 text-left">Unidade</th>
              <th className="px-4 py-3 text-left">Máquina</th>
              <th className="px-4 py-3 text-left">Grupos</th>
              <th className="px-4 py-3 text-left">Pagamento</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3 text-right">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  Carregando ciclos...
                </td>
              </tr>
            ) : cycles.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  Nenhum ciclo encontrado.
                </td>
              </tr>
            ) : (
              cycles.map((cycle) => (
                <tr key={cycle.id} className="hover:bg-[#FBFBFB]">
                  <td className="px-4 py-4 font-medium text-gray-900">{cycle.customer.name}</td>
                  <td className="px-4 py-4 text-gray-600">{cycle.laundry.name}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        cycle.machineType === "WASHER"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-orange-50 text-orange-700"
                      }`}
                    >
                      {cycle.machineType === "WASHER" ? "Lavadora" : "Secadora"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-gray-500">
                    {cycle.machinesUsed.join(", ")} ({cycle.machinesCount})
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                      {PAYMENT_LABELS[cycle.paymentMethod] ?? cycle.paymentMethod}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-[#10B981] font-medium">
                    {formatCurrency(cycle.totalPaidValue)}
                  </td>
                  <td className="px-4 py-4 text-right text-gray-500">
                    {new Date(cycle.cycleDate).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{total} ciclos encontrados</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <span className="text-sm text-gray-500">{page} de {pageCount || 1}</span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(pageCount || 1, page + 1))}
            disabled={page >= pageCount}
            className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Próximo <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </SCard>
  );
}
