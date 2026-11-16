# Dashboard Desce Lava

Dashboard de gestão para rede de lavanderias **Desce Lava**, com sincronização automática via API Sislav.

## Visão Geral

Centraliza os dados de todas as unidades da rede em um único painel, permitindo acompanhar faturamento, ciclos, clientes e desempenho por período — com valores pareados à aba **Vendas** do Sislav.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js (App Router) + React 19 |
| Linguagem | TypeScript |
| ORM | Prisma 7 |
| Banco de dados | PostgreSQL (Supabase) |
| Deploy | Vercel (plano Hobby) |
| API externa | Sislav (`/v1/laundry/*`) |

## Funcionalidades

- **KPIs em tempo real** — faturamento de hoje, ciclos, ticket médio (com fuso Brasil UTC-3)
- **Filtros de período** — 7 dias, 30 dias, 90 dias, ano atual, tudo
- **Abas do dashboard** — Geral, Vendas, Ciclos, Máquinas, Unidades
- **Ranking de unidades** com faturamento e ciclos por período
- **Perfil de cliente** — histórico de ciclos, gasto total, método de pagamento preferido
- **Análise de clientes** — novos, inativos, aniversariantes, usuários de saldo (Balance)
- **Análise de máquinas** — lavadoras vs secadoras por unidade e período
- **Ticker de vendas** — últimas sincronizações em tempo real no rodapé
- **Autenticação** por email/senha

## Sincronização com Sislav

O sistema importa dados via API Sislav de forma incremental. Rotas disponíveis:

| Rota | Método | Descrição |
|---|---|---|
| `/api/sync/laundry?id=<id>` | `POST` | Full sync de uma unidade |
| `/api/sync/all-laundries` | `POST` | Full sync de todas as unidades (sequencial) |
| `/api/sync/fix-cycles?id=<id>` | `POST` | Reconstrói ciclos de uma unidade a partir das vendas |
| `/api/sync/reset` | `DELETE` | Reseta logs de sync para forçar re-sync histórico |
| `/api/sync/stamp` | `POST` | Grava log de sync para manter modo incremental |

> **Limite Vercel Hobby:** todas as rotas de sync têm `maxDuration = 300s`.

### Sincronização automática

O workflow `.github/workflows/sync.yml` (GitHub Actions) chama `GET /api/cron/sync` a cada 30 minutos. A rota não passa pelo login: ela exige o cabeçalho `Authorization: Bearer <CRON_SECRET>` e fica fechada se `CRON_SECRET` não estiver configurado.

Para funcionar, o repositório precisa de dois segredos (Settings → Secrets and variables → Actions):

| Segredo | Valor |
|---|---|
| `SYNC_URL` | Endereço completo da rota: `https://<domínio do painel>/api/cron/sync` |
| `CRON_SECRET` | O mesmo valor da variável `CRON_SECRET` na Vercel |

O workflow falha (e o GitHub avisa por e-mail) quando o sync não responde, responde com erro ou termina com erro em várias unidades. Passar do limite de tempo da Vercel gera só um aviso: as unidades que faltaram entram na frente na execução seguinte. Também dá para disparar à mão pela aba Actions (**Run workflow**).

> O GitHub desativa workflows agendados de repositórios públicos depois de 60 dias sem atividade no repositório. Se o sync parar, confira a aba Actions.

## Faturamento: mesma fonte da aba Dashboard do Sislav

A tela de **Faturamento** lê a tabela `DashboardDay`: um resumo por unidade e por dia, calculado a partir dos mesmos dados e com a mesma fórmula da aba Dashboard do Sislav (`lib/sislav-dashboard.ts`). Não há regra de cálculo por unidade.

- O dia vira no fuso configurado na conta do Sislav usada pelo sync.
- A receita inclui os lançamentos manuais de receita feitos no Sislav, que não aparecem na lista de vendas.
- O sync relê os 3 dias mais recentes a cada execução e os últimos 62 dias uma vez por dia.

A tela de **Movimento** continua lendo a tabela `Sale` (lista de vendas do Sislav).

### Recuperação manual de dados

`scripts/backfill.ts` roda na máquina, sem o limite de tempo da Vercel, e pode ser repetido sem duplicar nada:

```bash
npx tsx scripts/backfill.ts dashboard 2024-04-01   # recalcula o resumo do Dashboard desde a data
npx tsx scripts/backfill.ts sales 2026-10-06       # reimporta as vendas desde a data
```

Um terceiro argumento opcional restringe a uma unidade (id).

## Modelo de Faturamento (telas legadas)

Cada venda possui dois campos de valor:

- **`paidValue`** — valor efetivamente pago no momento da lavagem (dinheiro novo)
- **`totalValue`** — valor de face do serviço (inclui washes pagos por saldo pré-carregado)

Por padrão, o dashboard exibe `paidValue`, que é equivalente à **aba Vendas do Sislav** (margem média < 0,15%).

### Configuração por unidade (`revenueMetric`)

Algumas unidades têm configuração diferente no Sislav. O campo `Laundry.revenueMetric` permite ajustar por unidade:

```
"paidValue"  → padrão para todas as unidades
"totalValue" → usar para unidades onde Sislav Vendas exibe totalValue (ex: Posto Palmas)
```

Para alterar: atualizar o campo `revenueMetric` diretamente no banco via Prisma.

## Variáveis de Ambiente

```env
DATABASE_URL=          # Connection string PostgreSQL (Supabase)
SISLAV_API_URL=        # Base URL da API Sislav (ex: https://api.sislav.com.br)
SISLAV_API_KEY=        # Chave de API Sislav
SISLAV_WEB_EMAIL=      # Login da conta do painel web do Sislav (fonte principal do sync)
SISLAV_WEB_PASSWORD=   # Senha dessa conta
CRON_SECRET=           # Chave exigida por /api/cron/sync (a mesma do segredo no GitHub)
AUTH_SECRET=           # Segredo de sessão do NextAuth
SYSTEM_LOCKED=         # "true" bloqueia o sistema (tela de indisponibilidade em /bloqueado). Qualquer outro valor/ausente = liberado.
```

### Bloqueio geral do sistema (`SYSTEM_LOCKED`)

Para bloquear o acesso de todos os usuários logados (ex: pendência administrativa com o cliente), sem mexer em código:

1. No painel do Vercel, defina a env var `SYSTEM_LOCKED=true` no projeto.
2. Faça um novo deploy (ou redeploy) para aplicar.
3. Usuários logados são redirecionados para `/bloqueado`, com uma mensagem neutra ("Sistema temporariamente indisponível... entre em contato com o administrador") e sem acesso ao restante do sistema. A sincronização (`/api/sync`, `/api/cron/sync`) continua rodando normalmente em segundo plano.
4. Para liberar de novo: mude `SYSTEM_LOCKED` para `false` (ou remova a variável) e faça outro deploy.

## Desenvolvimento Local

```bash
npm install
npx prisma generate
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

Após alterações no schema:

```bash
npx prisma db push   # aplica no banco sem migration
npx prisma generate  # regenera o client
```

## Deploy

Deploy automático via Vercel a cada push na branch `main`.

> O client Prisma é gerado em `./lib/generated/prisma/` (path customizado no schema).  
> Certifique-se de que o `postinstall` executa `prisma generate` no ambiente de build.
