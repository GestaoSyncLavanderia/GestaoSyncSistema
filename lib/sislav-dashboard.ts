// Fonte da tela de Faturamento: os mesmos dados e as mesmas regras da aba Dashboard do SisLav.
//
// A aba Dashboard não tem um endpoint de totais. O navegador baixa os registros brutos da loja
// (GET /api/store/{id}/data) e faz as somas ali mesmo. Este módulo repete esse caminho: baixa os
// registros, resume por dia com as regras do SisLav e guarda o resumo em DashboardDay.
//
// Por que não calcular a partir da tabela Sale: o Dashboard difere da lista de vendas em três
// pontos que mudam de loja para loja — o horário em que o dia vira, os lançamentos manuais de
// receita (que não aparecem na lista de vendas) e quais vendas contam como ciclo. Lendo a mesma
// fonte, nenhuma dessas regras precisa ser calibrada por unidade.

import { brotliDecompressSync } from "zlib";
import { db } from "./db";
import { webAppGet } from "./sislav-webapp";

const HOUR_MS = 60 * 60 * 1000;

export type DashboardRecord = {
  date: string; // ISO em UTC
  absoluteValue: number; // valor que entra na receita; negativo é custo
  usedBalance: number; // saldo de carteira usado na venda
  isPay: boolean;
  isPaidVoucher: boolean;
  isReceipt: boolean; // lançamento manual (receita ou custo), não uma venda
  paymentName: string;
  machines: { total: number }[] | null;
};

export type DashboardDayTotals = {
  revenue: number;
  receipts: number;
  cycles: number;
  records: number;
};

// ── Decodificação ─────────────────────────────────────────────────────────────
// O campo `data` da resposta é base64 de um brotli cujo conteúdo é um JSON no formato
// "compress-json": uma lista de valores sem repetição e a chave do valor raiz. Chaves são
// índices da lista em base 62; objetos e listas referenciam seus itens por essas chaves.

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE62_INDEX = new Map([...BASE62].map((char, i) => [char, i]));

function base62ToInt(s: string): number {
  let acc = 0;
  for (const char of s) acc = acc * 62 + (BASE62_INDEX.get(char) ?? 0);
  return acc;
}

const reversed = (s: string) => [...s].reverse().join("");

// Número: parte inteira em base 62; a parte decimal e o expoente vêm com os dígitos invertidos
// (para preservar zeros à esquerda) e também em base 62.
function decodeNumber(s: string): number {
  if (s.startsWith("-")) return -decodeNumber(s.slice(1));
  const [int, fraction, exponent] = s.split(".");
  if (!fraction) return base62ToInt(int);
  let text = `${base62ToInt(int)}.${reversed(String(base62ToInt(fraction)))}`;
  if (exponent) {
    const negative = exponent.startsWith("-");
    const digits = reversed(String(base62ToInt(negative ? exponent.slice(1) : exponent)));
    text += `e${negative ? "-" : ""}${digits}`;
  }
  return Number(text);
}

function decodeValue(values: unknown[], key: string, memo: Map<string, unknown>): unknown {
  if (key === "" || key === "_") return null;
  if (memo.has(key)) return memo.get(key);

  const raw = values[base62ToInt(key)];
  let decoded: unknown = raw;

  if (typeof raw === "string") {
    const prefix = raw.slice(0, 2);
    if (prefix === "b|") {
      decoded = raw === "b|T";
    } else if (prefix === "n|") {
      decoded = decodeNumber(raw.slice(2));
    } else if (prefix === "s|") {
      decoded = raw.slice(2); // texto que começaria com um dos prefixos acima
    } else if (prefix === "a|") {
      decoded = raw === "a|" ? [] : raw.split("|").slice(1).map((k) => decodeValue(values, k, memo));
    } else if (prefix === "o|") {
      const object: Record<string, unknown> = {};
      if (raw !== "o|") {
        const [, keysKey, ...valueKeys] = raw.split("|");
        const keys = decodeValue(values, keysKey, memo);
        const keyList = Array.isArray(keys) ? (keys as string[]) : [keys as string];
        valueKeys.forEach((k, i) => {
          object[keyList[i]] = decodeValue(values, k, memo);
        });
      }
      decoded = object;
    }
  }

  memo.set(key, decoded);
  return decoded;
}

export function decodeDashboardPayload(base64: string): DashboardRecord[] {
  const json = brotliDecompressSync(Buffer.from(base64, "base64")).toString("utf8");
  const [values, rootKey] = JSON.parse(json) as [unknown[], string];
  return (decodeValue(values, rootKey, new Map()) as DashboardRecord[] | null) ?? [];
}

// ── Leitura no SisLav ─────────────────────────────────────────────────────────

let timezoneCache: { hours: number; exp: number } | null = null;

/**
 * Fuso (em horas, ex.: -4) configurado na conta do SisLav. É ele que define onde o dia vira
 * na aba Dashboard: quem olha o SisLav com essa conta vê os dias fechados nesse fuso.
 */
export async function getDashboardTimezone(): Promise<number> {
  if (timezoneCache && Date.now() < timezoneCache.exp) return timezoneCache.hours;

  const res = await webAppGet("/api/user");
  if (!res.ok) throw new Error(`SisLav web user ${res.status}`);
  const json = (await res.json()) as Record<string, any>;
  const config = json?.config ?? json?.user?.config ?? json?.data?.config;
  const hours = Number(config?.timezone);
  if (config?.timezone == null || !Number.isFinite(hours)) {
    throw new Error("SisLav web: fuso da conta não encontrado em /api/user");
  }

  timezoneCache = { hours, exp: Date.now() + 8 * HOUR_MS };
  return hours;
}

/** Registros brutos que a aba Dashboard usa, para uma loja e um intervalo de tempo. */
export async function fetchDashboardRecords(
  laundryId: string,
  orgId: string,
  from: Date,
  to: Date,
): Promise<DashboardRecord[]> {
  // isSync=false é obrigatório: com true o SisLav dispara uma sincronização da loja em vez de só ler.
  const qs = `startDate=${from.getTime()}&endDate=${to.getTime()}&isSync=false`;
  const res = await webAppGet(`/api/store/${laundryId}/data?${qs}`, orgId);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SisLav web dashboard ${res.status}: ${body.slice(0, 120)}`);
  }
  const json = (await res.json()) as { data?: string | null };
  return json.data ? decodeDashboardPayload(json.data) : [];
}

// ── Regras do Dashboard ───────────────────────────────────────────────────────

// Dia (YYYY-MM-DD) em que o Dashboard coloca o registro: vendas entram no dia local do instante
// em que aconteceram; lançamentos manuais entram no dia da própria data, sem conversão de fuso.
function dashboardDayOf(record: DashboardRecord, timezoneHours: number): string {
  const ms = Date.parse(record.date);
  return new Date(record.isReceipt ? ms : ms + timezoneHours * HOUR_MS).toISOString().slice(0, 10);
}

// "Ciclo pago" para o Dashboard: venda com valor pago, voucher pago, ou venda no saldo de carteira
// em que o saldo foi de fato usado. Venda de carteira sem saldo usado (cashback, por exemplo) não conta.
function countsAsPaidCycle(record: DashboardRecord): boolean {
  return (
    record.absoluteValue > 0 ||
    record.isPaidVoucher ||
    (record.paymentName === "Saldo" && (!record.isPay || record.usedBalance > 0))
  );
}

/** Resume os registros por dia do Dashboard, com as mesmas somas que o SisLav faz no navegador. */
export function summarizeByDay(
  records: DashboardRecord[],
  timezoneHours: number,
): Map<string, DashboardDayTotals> {
  const days = new Map<string, DashboardDayTotals>();

  for (const record of records) {
    const day = dashboardDayOf(record, timezoneHours);
    let totals = days.get(day);
    if (!totals) {
      totals = { revenue: 0, receipts: 0, cycles: 0, records: 0 };
      days.set(day, totals);
    }

    totals.records++;
    // Valores negativos são custos lançados à mão: aparecem no lucro do SisLav, não na receita.
    if (record.absoluteValue > 0) {
      totals.revenue += record.absoluteValue;
      if (record.isReceipt) totals.receipts += record.absoluteValue;
    }
    if (countsAsPaidCycle(record)) {
      totals.cycles += (record.machines ?? []).reduce((sum, machine) => sum + (machine.total ?? 0), 0);
    }
  }

  for (const totals of days.values()) {
    totals.revenue = Math.round(totals.revenue * 100) / 100;
    totals.receipts = Math.round(totals.receipts * 100) / 100;
  }
  return days;
}

// ── Gravação ──────────────────────────────────────────────────────────────────

const dayToDate = (day: string) => new Date(`${day}T00:00:00.000Z`);
const addDays = (day: string, n: number) =>
  new Date(dayToDate(day).getTime() + n * 24 * HOUR_MS).toISOString().slice(0, 10);

/** Data de hoje (YYYY-MM-DD) no fuso do Dashboard. */
export function dashboardToday(timezoneHours: number): string {
  return new Date(Date.now() + timezoneHours * HOUR_MS).toISOString().slice(0, 10);
}

/**
 * Recalcula os dias de `fromDay` a `toDay` (datas do Dashboard, inclusive) de uma unidade e
 * substitui o que havia no banco. Substituir o intervalo inteiro, em vez de somar o que chegou,
 * mantém o banco fiel quando um lançamento manual é incluído, alterado ou apagado depois no SisLav.
 * Devolve quantos dias foram gravados.
 */
export async function syncDashboardDays(
  laundryId: string,
  orgId: string,
  fromDay: string,
  toDay: string,
  timezoneHours: number,
): Promise<number> {
  // Um dia de folga de cada lado: lançamentos manuais são gravados com a data sem fuso e podem
  // cair fora do intervalo exato em horário local. O que sobrar é descartado no filtro abaixo,
  // junto com os registros de hoje, que o endpoint devolve sempre.
  const from = new Date(dayToDate(addDays(fromDay, -1)).getTime() - timezoneHours * HOUR_MS);
  const to = new Date(dayToDate(addDays(toDay, 2)).getTime() - timezoneHours * HOUR_MS - 1);

  const records = await fetchDashboardRecords(laundryId, orgId, from, to);
  const rows = [...summarizeByDay(records, timezoneHours)]
    .filter(([day]) => day >= fromDay && day <= toDay)
    .map(([day, totals]) => ({ laundryId, day: dayToDate(day), ...totals }));

  await db.$transaction([
    db.dashboardDay.deleteMany({
      where: { laundryId, day: { gte: dayToDate(fromDay), lte: dayToDate(toDay) } },
    }),
    db.dashboardDay.createMany({ data: rows }),
  ]);
  return rows.length;
}

// A cada execução relê os dias mais recentes. Uma vez por dia relê um intervalo maior, para pegar
// lançamentos manuais feitos com data passada (comuns no fechamento do mês).
const RECENT_DAYS = 3;
const WIDE_DAYS = 62;
const WIDE_EVERY_MS = 24 * HOUR_MS;
const PARALLEL_LAUNDRIES = 4;

/**
 * Atualiza o resumo do Dashboard de todas as unidades. Devolve as mensagens de erro, uma por
 * unidade que falhou; uma falha não interrompe as demais.
 */
export async function syncDashboard(): Promise<string[]> {
  const errors: string[] = [];

  try {
    const timezoneHours = await getDashboardTimezone();
    const lastWide = await db.syncLog.findFirst({
      where: { entity: "dashboard-wide", status: "success" },
      orderBy: { createdAt: "desc" },
    });
    const wide = !lastWide || Date.now() - lastWide.createdAt.getTime() > WIDE_EVERY_MS;

    const toDay = dashboardToday(timezoneHours);
    const fromDay = addDays(toDay, -((wide ? WIDE_DAYS : RECENT_DAYS) - 1));
    const laundries = await db.laundry.findMany({ select: { id: true, organizationId: true, name: true } });

    for (let i = 0; i < laundries.length; i += PARALLEL_LAUNDRIES) {
      await Promise.all(
        laundries.slice(i, i + PARALLEL_LAUNDRIES).map(async (l) => {
          try {
            await syncDashboardDays(l.id, l.organizationId, fromDay, toDay, timezoneHours);
          } catch (err: any) {
            errors.push(`dashboard[${l.name}]: ${err.message}`);
          }
        }),
      );
    }

    if (errors.length === 0) {
      await db.syncLog.create({ data: { entity: wide ? "dashboard-wide" : "dashboard", status: "success" } });
    }
  } catch (err: any) {
    errors.push(`dashboard: ${err.message}`);
  }

  if (errors.length > 0) {
    await db.syncLog
      .create({ data: { entity: "dashboard", status: "error", message: errors.join(" | ").slice(0, 1000) } })
      .catch(() => {});
  }
  return errors;
}
