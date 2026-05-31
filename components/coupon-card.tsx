import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";

interface CouponCardProps {
  coupon: {
    id: string;
    code: string;
    value: number;
    type: string;
    status: string;
    usageCount: number;
    maxUsage: number | null;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    allLaundries: boolean;
    allCustomers: boolean;
    onlyFirstTimeCustomer: boolean;
  };
}

export function CouponCard({ coupon }: CouponCardProps) {
  const maxUsage = coupon.maxUsage ?? 0;
  const progress = maxUsage > 0 ? Math.min(100, Math.round((coupon.usageCount / maxUsage) * 100)) : 0;
  const statusVariant = coupon.status === "ACTIVE" ? "default" : "outline";

  return (
    <div className="rounded-[14px] border border-[#E5E7EB] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{coupon.code}</p>
          <p className="text-xs text-gray-400 mt-1">
            {coupon.type === "PERCENTAGE" ? "Desconto %" : "Valor fixo"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant}>{coupon.status}</Badge>
          <span className="text-sm font-semibold text-[#10B981]">
            {formatCurrency(coupon.value)}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm text-gray-600">
        <div className="flex items-center justify-between gap-3">
          <span>Uso</span>
          <span>{coupon.usageCount}{maxUsage ? ` / ${maxUsage}` : ""}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${progress}%` }} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-xs text-gray-400">Validade</p>
            <p className="text-sm text-gray-900">
              {coupon.startDate} {coupon.startTime} até {coupon.endDate} {coupon.endTime}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Restrições</p>
            <p className="text-sm text-gray-900">
              {coupon.allLaundries ? "Todas as unidades" : "Unidades específicas"}
              <br />
              {coupon.allCustomers ? "Todos os clientes" : "Clientes específicos"}
              {coupon.onlyFirstTimeCustomer ? ", 1ª compra" : ""}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
