// Autentica no app web do SisLav (app.sislav.com.br) para obter status e dados
// completos de vendas (paidAmount, totalAmount, usedBalance, type, status).

const WEB_BASE = "https://app.sislav.com.br";

let sessionCache: { token: string; exp: number } | null = null;

async function fetchCsrf(): Promise<{ csrfToken: string; cookie: string }> {
  const res = await fetch(`${WEB_BASE}/api/auth/csrf`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`SisLav web csrf ${res.status}`);
  const { csrfToken } = (await res.json()) as { csrfToken: string };
  const raw = res.headers.get("set-cookie") ?? "";
  const cookie =
    raw.split(",").find((c) => c.includes("authjs.csrf-token"))?.split(";")[0].trim() ??
    raw.split(";")[0].trim();
  return { csrfToken, cookie };
}

async function login(): Promise<string> {
  const { csrfToken, cookie } = await fetchCsrf();
  const res = await fetch(`${WEB_BASE}/api/auth/callback/credentials_user?`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      "User-Agent": "Mozilla/5.0",
    },
    body: new URLSearchParams({
      email:       process.env.SISLAV_WEB_EMAIL!,
      password:    process.env.SISLAV_WEB_PASSWORD!,
      csrfToken,
      callbackUrl: `${WEB_BASE}/login`,
    }).toString(),
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/authjs\.session-token=([^;,\s]+)/);
  if (!match) throw new Error("SisLav web login falhou — sem session-token na resposta");
  return match[1];
}

async function getSession(): Promise<string> {
  if (sessionCache && Date.now() < sessionCache.exp) return sessionCache.token;
  const token = await login();
  sessionCache = { token, exp: Date.now() + 8 * 60 * 60 * 1000 }; // 8h
  return token;
}

// ── Mapeamentos web app → modelo interno ──────────────────────────────────────

const MACHINE_TYPE_MAP: Record<string, string> = {
  Lavadora: "WASHER",
  Secadora: "DRYER",
  Saldo:    "",   // BALANCE_PURCHASE — excluído do faturamento
};

const PAYMENT_MAP: Record<number, string> = {
  1: "CREDIT",
  2: "DEBIT",
  3: "PIX",
  7: "SISLAV_PAY", // terminal SisLav Pay — paidAmount=0 mas NÃO é saldo de carteira
};

// "12/06/2026 12:14" (Brasília, UTC-3) → Date UTC
function parseWebAppDate(s: string): Date {
  const [datePart, timePart] = s.trim().split(" ");
  const [day, month, year]   = datePart.split("/").map(Number);
  const [hour, minute]        = timePart.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

// Data UTC → string "YYYY-MM-DD" no fuso Brasília (UTC-3)
function brazilDateStr(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export type WebAppSale = {
  id: string;
  date: Date;
  machineType: string;
  serviceType: string;
  machines: number[];
  paidValue: number;
  totalValue: number;
  paymentMethod: string;
  status: string;
  customer: {
    id: string;
    name: string;
    cpf: string | null;
    phone: string | null;
    email: string | null;
  };
};

/**
 * Busca todas as vendas de uma lavanderia via web app, retornando dados
 * completos (paidAmount→paidValue, totalAmount→totalValue, status nativo).
 * Se `since` for informado, limita ao intervalo desde esse dia (Brasília).
 */
export async function fetchSalesFromWebApp(
  laundryId: string,
  orgId: string,
  since?: Date,
): Promise<WebAppSale[]> {
  if (!process.env.SISLAV_WEB_EMAIL || !process.env.SISLAV_WEB_PASSWORD) {
    throw new Error("SISLAV_WEB_EMAIL e SISLAV_WEB_PASSWORD não configurados");
  }

  const token = await getSession();
  const all: WebAppSale[] = [];
  let page = 1;

  // Subtrai 1 dia do since para garantir cobertura na fronteira de meia-noite
  // Incremental: 1 dia antes do since para cobrir fronteira de meia-noite.
  // Full sync (since=undefined): máximo 30 dias — evita timeout no Vercel Hobby.
  const start = since
    ? brazilDateStr(new Date(since.getTime() - 24 * 60 * 60 * 1000))
    : brazilDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  // Amanhã em Brasília para capturar vendas do dia ainda em andamento
  const end = brazilDateStr(new Date(Date.now() + 24 * 60 * 60 * 1000));

  while (true) {
    const qs =
      `dateRange%5B%5D=${start}&dateRange%5B%5D=${end}` +
      `&laundryId=${laundryId}&page=${page}&itemsPerPage=100` +
      `&sortField=date&sortDirection=desc`;

    const res = await fetch(`${WEB_BASE}/api/sales?${qs}`, {
      headers: {
        Cookie:              `authjs.session-token=${token}`,
        "x-organization-id": orgId,
        "User-Agent":        "Mozilla/5.0",
        Accept:              "application/json, text/plain, */*",
      },
    });

    if (res.status === 401 || res.redirected) {
      sessionCache = null;
      throw new Error("SisLav web sessão expirada (401)");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SisLav web sales ${res.status}: ${body.slice(0, 120)}`);
    }

    const json = (await res.json()) as { sales?: any[]; total?: number };

    for (const s of json.sales ?? []) {
      if (!s.id || !s.customer?.id) continue;
      const raw      = s.payment as number;
      const usedBal  = s.usedBalance ?? 0;
      const paidAmt  = s.paidAmount  ?? 0;
      const totAmt   = s.totalAmount ?? 0;
      // BALANCE = saldo de carteira consumido sem pagamento direto
      const isWalletOnly = usedBal > 0 && paidAmt === 0;
      all.push({
        id:            s.id,
        date:          parseWebAppDate(s.date),
        machineType:   MACHINE_TYPE_MAP[s.cycle] ?? "",
        serviceType:   s.type ?? "SALE",
        machines:      Array.isArray(s.machines) ? s.machines : [],
        // SISLAV_PAY (payment=7): paidAmount=0 mas é cobrado fora da plataforma → usa totalAmount
        paidValue:     isWalletOnly ? 0 : (paidAmt > 0 ? paidAmt : totAmt),
        totalValue:    totAmt,
        paymentMethod: isWalletOnly ? "BALANCE" : (PAYMENT_MAP[raw] ?? `PAY_${raw}`),
        status:        s.status ?? "",
        customer: {
          id:    s.customer.id,
          name:  s.customer.name  ?? "",
          cpf:   s.customer.cpf   ?? null,
          phone: s.customer.phone ?? null,
          email: s.customer.email ?? null,
        },
      });
    }

    const totalPages = Math.ceil((json.total ?? 0) / 100);
    if (page >= totalPages || !json.sales?.length) break;
    page++;
    await new Promise((r) => setTimeout(r, 200));
  }

  return all;
}

/**
 * Retorna Map<saleId, status> para uma lavanderia e intervalo de datas.
 * Lança erro se as credenciais não estiverem configuradas ou se a conta não
 * tiver acesso à organização informada.
 */
export async function fetchStatusMap(
  laundryId: string,
  orgId: string,
  from: Date,
  to: Date
): Promise<Map<string, string>> {
  if (!process.env.SISLAV_WEB_EMAIL || !process.env.SISLAV_WEB_PASSWORD) {
    throw new Error("SISLAV_WEB_EMAIL e SISLAV_WEB_PASSWORD não configurados");
  }

  const token = await getSession();
  const map   = new Map<string, string>();
  let page    = 1;

  const start = from.toISOString().slice(0, 10);
  const end   = to.toISOString().slice(0, 10);

  while (true) {
    // A API usa array notation: dateRange[]=start&dateRange[]=end
    const qs =
      `dateRange%5B%5D=${start}&dateRange%5B%5D=${end}` +
      `&laundryId=${laundryId}&page=${page}&itemsPerPage=100` +
      `&sortField=date&sortDirection=desc`;

    const res = await fetch(`${WEB_BASE}/api/sales?${qs}`, {
      headers: {
        Cookie:              `authjs.session-token=${token}`,
        "x-organization-id": orgId,
        "User-Agent":        "Mozilla/5.0",
        Accept:              "application/json, text/plain, */*",
      },
    });

    if (res.status === 401 || res.redirected) {
      sessionCache = null;
      throw new Error("SisLav web sessão expirada (401)");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`SisLav web API ${res.status}: ${body.slice(0, 120)}`);
    }

    const json = (await res.json()) as {
      sales?: Array<{ id: string; status?: string }>;
      total?: number;
    };

    for (const s of json.sales ?? []) {
      if (s.id && s.status) map.set(s.id, s.status);
    }

    const totalPages = Math.ceil((json.total ?? 0) / 100);
    if (page >= totalPages || !json.sales?.length) break;
    page++;
    await new Promise((r) => setTimeout(r, 200));
  }

  return map;
}
