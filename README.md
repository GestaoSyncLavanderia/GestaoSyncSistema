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

## Modelo de Faturamento

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
```

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
