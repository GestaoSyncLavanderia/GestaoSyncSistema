import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { X } from "lucide-react";

interface CustomerPanelProps {
  customer: {
    id: string;
    name: string;
    email: string;
    mobile: string;
    document: string;
    documentType: string;
    blocked: boolean;
    visits: number;
    firstVisit: string | null;
    lastVisit: string | null;
    balance: number;
    cashback: number;
    totalSpent: number;
    laundries: Array<{ laundry: { name: string } }>;
  };
  onClose: () => void;
}

export function CustomerPanel({ customer, onClose }: CustomerPanelProps) {
  return (
    <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-[#E5E7EB] bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-6 py-5">
        <div>
          <p className="text-lg font-semibold text-gray-900">Detalhe do cliente</p>
          <p className="text-sm text-gray-500">{customer.name}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>

      <div className="space-y-6 p-6 overflow-y-auto h-[calc(100vh-80px)]">
        <div className="rounded-[14px] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-gray-500">Status</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">
            {customer.blocked ? "Bloqueado" : "Ativo"}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4">
            <p className="text-xs text-gray-500">Total gasto</p>
            <p className="mt-2 text-lg font-semibold text-[#10B981]">{formatCurrency(customer.totalSpent)}</p>
          </div>
          <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-4">
            <p className="text-xs text-gray-500">Cashback</p>
            <p className="mt-2 text-lg font-semibold text-[#3B82F6]">{formatCurrency(customer.cashback)}</p>
          </div>
        </div>

        <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-5 space-y-4">
          <div>
            <p className="text-xs text-gray-500">Email</p>
            <p className="text-sm text-gray-900">{customer.email}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Telefone</p>
            <p className="text-sm text-gray-900">{customer.mobile}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Documento</p>
            <p className="text-sm text-gray-900">{customer.document} ({customer.documentType})</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Visitas</p>
            <p className="text-sm text-gray-900">{customer.visits} visitas</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Primeira visita</p>
            <p className="text-sm text-gray-900">{customer.firstVisit ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Última visita</p>
            <p className="text-sm text-gray-900">{customer.lastVisit ?? "-"}</p>
          </div>
        </div>

        <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-5">
          <p className="text-sm font-semibold text-gray-900">Unidades relacionadas</p>
          <div className="mt-3 space-y-2">
            {customer.laundries.map((item, index) => (
              <div key={`${item.laundry.name}-${index}`} className="rounded-xl bg-[#F8FAFC] px-3 py-2 text-sm text-gray-700">
                {item.laundry.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
