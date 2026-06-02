const BASE    = process.env.SISLAV_API_URL!;
const API_KEY = process.env.SISLAV_API_KEY!;

async function get<T>(path: string, orgId?: string): Promise<T> {
  const headers: Record<string, string> = { "X-API-KEY": API_KEY };
  if (orgId) headers["X-ORG-ID"] = orgId;
  const res = await fetch(`${BASE}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Sislav API error: ${res.status} — ${path}`);
  return res.json();
}

async function getAll<T>(path: string, orgId?: string, limit = 100, since?: Date): Promise<T[]> {
  let page = 1;
  let all: T[] = [];
  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    let result: { data: T[]; pagination: { totalPages: number } };
    try {
      result = await get<{ data: T[]; pagination: { totalPages: number } }>(
        `${path}${sep}page=${page}&limit=${limit}`,
        orgId
      );
    } catch (err: any) {
      if (err.message?.includes("429")) break; // retorna o que foi coletado até aqui
      throw err;
    }
    all = [...all, ...result.data];

    if (page >= result.pagination.totalPages) break;

    if (since && result.data.length > 0) {
      const last = (result.data[result.data.length - 1] as any)?.date;
      if (last && new Date(last) < since) break;
    }

    page++;
  }
  return all;
}

export async function getLaundries() {
  return getAll<any>("/v1/franchise/laundry");
}

export async function getSales(laundryId: string, orgId: string, since?: Date) {
  return getAll<any>(`/v1/laundry/${laundryId}/sales`, orgId, 100, since);
}
