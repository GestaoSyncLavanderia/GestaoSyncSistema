import axios from "axios";
import https from "https";
import crypto from "crypto";

const BASE    = process.env.SISLAV_API_URL!;
const API_KEY = process.env.SISLAV_API_KEY!;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION permite que o servidor inicie
// TLS renegotiation (comportamento do api.sislav.com.br) sem abortar a conexão
const SSL_OP_LEGACY_RENEGOTIATION = 0x00000004;
const httpsAgent = new https.Agent({
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT | SSL_OP_LEGACY_RENEGOTIATION,
  keepAlive: false,
});

async function get<T>(path: string, orgId?: string): Promise<T> {
  const headers: Record<string, string> = { "X-API-KEY": API_KEY };
  if (orgId) headers["X-ORG-ID"] = orgId;
  const res = await axios.get<T>(`${BASE}${path}`, { headers, httpsAgent });
  return res.data;
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
