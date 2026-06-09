import { format, startOfWeek, startOfMonth, endOfMonth, startOfYear, subMonths } from "date-fns";

export type PeriodKey = "hoje" | "semana" | "mes" | "mes-anterior" | "ano" | "total";

export const PERIODS: { label: string; value: PeriodKey }[] = [
  { label: "Hoje",         value: "hoje" },
  { label: "Semana",       value: "semana" },
  { label: "Mês atual",    value: "mes" },
  { label: "Mês anterior", value: "mes-anterior" },
  { label: "Ano atual",    value: "ano" },
  { label: "Total",        value: "total" },
];

export function parsePeriod(value: string | null): PeriodKey {
  if (
    value === "hoje" ||
    value === "semana" ||
    value === "mes" ||
    value === "mes-anterior" ||
    value === "ano" ||
    value === "total"
  ) return value;
  return "mes";
}

export function getPeriodDates(period: PeriodKey = "mes"): { from: string; to: string } {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");

  switch (period) {
    case "hoje":
      return { from: today, to: today };
    case "semana": {
      const monday = startOfWeek(now, { weekStartsOn: 1 });
      return { from: format(monday, "yyyy-MM-dd"), to: today };
    }
    case "mes":
      return { from: format(startOfMonth(now), "yyyy-MM-dd"), to: today };
    case "mes-anterior": {
      const prev = subMonths(now, 1);
      return {
        from: format(startOfMonth(prev), "yyyy-MM-dd"),
        to: format(endOfMonth(prev), "yyyy-MM-dd"),
      };
    }
    case "ano":
      return { from: format(startOfYear(now), "yyyy-MM-dd"), to: today };
    default:
      return { from: "2020-01-01", to: today };
  }
}
