import { subDays, startOfDay, format } from "date-fns";

export type PeriodKey = "7d" | "30d" | "90d";

export const PERIODS: { label: string; value: PeriodKey }[] = [
  { label: "7 dias", value: "7d" },
  { label: "30 dias", value: "30d" },
  { label: "90 dias", value: "90d" },
];

export function parsePeriod(value: string | null): PeriodKey {
  if (value === "7d" || value === "30d" || value === "90d") return value;
  return "30d";
}

export function getPeriodDates(period: PeriodKey = "30d"): { from: string; to: string } {
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  return {
    from: format(startOfDay(subDays(new Date(), days - 1)), "yyyy-MM-dd"),
    to: format(new Date(), "yyyy-MM-dd"),
  };
}
