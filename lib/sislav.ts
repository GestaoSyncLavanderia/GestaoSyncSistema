import tls from "tls";
import crypto from "crypto";

const BASE    = process.env.SISLAV_API_URL!;
const API_KEY = process.env.SISLAV_API_KEY!;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// O servidor do SisLav envia bytes nulos no lugar do status code HTTP ("HTTP/1.1 \x00\x00\x00…"),
// o que quebra todos os parsers HTTP padrão (undici, http.request, axios).
// A solução é TLS raw: conecta direto, lê os bytes, extrai o body após \r\n\r\n.
const TLS_OPTS = {
  rejectUnauthorized: false,
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT | 0x00040000,
  minVersion: "TLSv1" as const,
};

function rawGet<T>(urlStr: string, headers: Record<string, string>): Promise<T> {
  return new Promise((resolve, reject) => {
    const url     = new URL(urlStr);
    const socket  = tls.connect({ host: url.hostname, port: 443, ...TLS_OPTS }, () => {
      const hLines = Object.entries({ Host: url.hostname, Connection: "close", ...headers })
        .map(([k, v]) => `${k}: ${v}`).join("\r\n");
      socket.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\n${hLines}\r\n\r\n`);
    });

    const chunks: Buffer[] = [];
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      const raw    = Buffer.concat(chunks);
      const sepIdx = raw.indexOf("\r\n\r\n");
      if (sepIdx === -1)
        return reject(new Error(`SisLav: sep não encontrado (${raw.length} bytes, hex: ${raw.slice(0, 30).toString("hex")})`));

      const headerText = raw.slice(0, sepIdx).toString("utf8");
      const body       = raw.slice(sepIdx + 4).toString("utf8");

      const rlMatch   = headerText.match(/X-RateLimit-Remaining:\s*(\d+)/i);
      const remaining = rlMatch ? parseInt(rlMatch[1]) : 99;
      if (remaining === 0) return reject(new Error("429 rate limited"));

      try   { resolve(JSON.parse(body)); }
      catch { reject(new Error(`SisLav JSON parse error: ${body.slice(0, 80)}`)); }
    };

    socket.on("data",  (d: Buffer) => chunks.push(d));
    socket.on("end",   finish);
    socket.on("close", finish);
    socket.on("error", reject);
    socket.setTimeout(30_000, () => { socket.destroy(); reject(new Error("SisLav timeout")); });
  });
}

async function get<T>(path: string, orgId?: string): Promise<T> {
  const headers: Record<string, string> = { "X-API-KEY": API_KEY };
  if (orgId) headers["X-ORG-ID"] = orgId;
  return rawGet<T>(`${BASE}${path}`, headers);
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

    all = [...all, ...(result!.data ?? [])];

    if (page >= (result!.pagination?.totalPages ?? 1)) break;

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
