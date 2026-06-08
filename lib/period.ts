import { subDays, format } from "date-fns";

export type PeriodKey = "7d" | "30d" | "90d" | "ytd" | "all";

const CURRENT_YEAR = new Date().getFullYear();

export const PERIODS: { label: string; value: PeriodKey }[] = [
  { label: "7 dias",          value: "7d" },
  { label: "30 dias",         value: "30d" },
  { label: "90 dias",         value: "90d" },
  { label: String(CURRENT_YEAR), value: "ytd" },
  { label: "Tudo",            value: "all" },
];

export function parsePeriod(value: string | null): PeriodKey {
  if (value === "7d" || value === "30d" || value === "90d" || value === "ytd" || value === "all") return value;
  return "30d";
}

export function getPeriodDates(period: PeriodKey = "30d"): { from: string; to: string } {
  const today = format(new Date(), "yyyy-MM-dd");
  if (period === "all") {
    return { from: "2020-01-01", to: today };
  }
  if (period === "ytd") {
    return { from: `${CURRENT_YEAR}-01-01`, to: today };
  }
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  return {
    from: format(subDays(new Date(), days - 1), "yyyy-MM-dd"),
    to: today,
  };
}
