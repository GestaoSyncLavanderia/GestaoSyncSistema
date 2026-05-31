import { SCard } from "@/components/s-card";

export interface LaundryOption {
  id: string;
  name: string;
}

const PAYMENT_METHODS = ["PIX", "CREDIT", "DEBIT", "BALANCE"];
const PAYMENT_LABELS: Record<string, string> = {
  PIX: "PIX",
  CREDIT: "Crédito",
  DEBIT: "Débito",
  BALANCE: "Saldo",
};

interface FilterBarProps {
  laundries: LaundryOption[];
  laundryId: string;
  paymentMethod: string;
  from: string;
  to: string;
  onLaundryChange: (v: string) => void;
  onPaymentChange: (v: string) => void;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}

const selectClass =
  "mt-1 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]";

export function FilterBar({
  laundries,
  laundryId,
  paymentMethod,
  from,
  to,
  onLaundryChange,
  onPaymentChange,
  onFromChange,
  onToChange,
}: FilterBarProps) {
  return (
    <SCard title="Filtros">
      <div className="grid gap-4 xl:grid-cols-4">
        <label className="space-y-1.5 text-sm text-gray-700">
          Unidade
          <select value={laundryId} onChange={(e) => onLaundryChange(e.target.value)} className={selectClass}>
            <option value="">Todas</option>
            {laundries.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm text-gray-700">
          Forma de pagamento
          <select value={paymentMethod} onChange={(e) => onPaymentChange(e.target.value)} className={selectClass}>
            <option value="">Todas</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1.5 text-sm text-gray-700">
          Data inicial
          <input
            type="date"
            value={from}
            onChange={(e) => onFromChange(e.target.value)}
            className={selectClass}
          />
        </label>

        <label className="space-y-1.5 text-sm text-gray-700">
          Data final
          <input
            type="date"
            value={to}
            onChange={(e) => onToChange(e.target.value)}
            className={selectClass}
          />
        </label>
      </div>
    </SCard>
  );
}
