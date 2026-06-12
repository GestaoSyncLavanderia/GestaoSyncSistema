// Autentica no app web do SisLav (app.sislav.com.br) para obter o campo `status`
// das vendas ("Em uso" | "Concluído") — ausente na API de franchise.

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
