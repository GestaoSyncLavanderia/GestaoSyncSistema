import https from "https";

const BASE    = process.env.SISLAV_API_URL!;
const API_KEY = process.env.SISLAV_API_KEY!;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Usa https.request (OpenSSL) em vez de fetch (undici) para suportar TLS renegotiation
function get<T>(path: string, orgId?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${path}`);
    const headers: Record<string, string> = { "X-API-KEY": API_KEY };
    if (orgId) headers["X-ORG-ID"] = orgId;

    const req = https.request(
      { hostname: url.hostname, path: url.pathname + url.search, headers, method: "GET" },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`Sislav API error: ${res.statusCode} — ${path}`));
          }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch { reject(new Error(`Sislav JSON parse error — ${path}`)); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function getAll<T>(path: string, orgId?: string, limit = 100, since?: Date): Promise<T[]> {
  let page = 1;
  let all: T[] = [];
  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    let result: { data: T[]; pagination: { totalPages: number } };

    // Retry com backoff em caso de 429
    let attempt = 0;
    while (true) {
      try {
        result = await get<{ data: T[]; pagination: { totalPages: number } }>(
          `${path}${sep}page=${page}&limit=${limit}`,
          orgId
        );
        break; // sucesso — sai do retry loop
      } catch (err: any) {
        if (err.message?.includes("429") && attempt < 3) {
          attempt++;
          await sleep(60_000); // espera 60s antes de tentar a mesma página
        } else {
          throw err; // outro erro ou esgotou retries → propaga
        }
      }
    }

    all = [...all, ...result!.data];

    if (page >= result!.pagination.totalPages) break;

    if (since && result!.data.length > 0) {
      const last = (result!.data[result!.data.length - 1] as any)?.date;
      if (last && new Date(last) < since) break;
    }

    page++;
    await sleep(350); // pausa entre páginas para não bater rate limit
  }
  return all;
}

export async function getLaundries() {
  return getAll<any>("/v1/franchise/laundry");
}

export async function getSales(laundryId: string, orgId: string, since?: Date) {
  return getAll<any>(`/v1/laundry/${laundryId}/sales`, orgId, 100, since);
}
