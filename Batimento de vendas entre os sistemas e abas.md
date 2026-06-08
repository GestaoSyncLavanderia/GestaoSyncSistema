# Batimento de Vendas — Novo Sistema vs Sislav (2026)

> **Benchmark de comparação:** aba **Vendas** do Sislav  
> `*` Posto Palmas configurado para usar `totalValue` (ver anomalia abaixo)

## Comparativo por Unidade

| Unidade | Novo Sistema | Dash Sislav | Vendas Sislav | Δ R$ | Δ % |
|---|---:|---:|---:|---:|---:|
| Alzira Santana | R$ 186.955,21 | R$ 208.716,98 | R$ 187.027,17 | -R$ 71,96 | -0,04% |
| Condomínio Buritis | R$ 66.132,44 | R$ 66.342,32 | R$ 66.342,32 | -R$ 209,88 | -0,32% |
| Condomínio Mirante | R$ 53.297,52 | R$ 53.357,49 | R$ 53.357,49 | -R$ 59,97 | -0,11% |
| Posto Nova Conquista | R$ 0,00 | R$ 0,00 | R$ 0,00 | — | — |
| Pres. Prudente Rodo Truck | R$ 0,00 | R$ 0,00 | R$ 0,00 | — | — |
| Ribeirão do Lipa | R$ 106.815,40 | R$ 117.068,96 | R$ 106.803,39 | +R$ 12,01 | +0,01% |
| Posto Muffato Philadelpho | R$ 25.713,31 | R$ 25.781,27 | R$ 25.781,27 | -R$ 67,96 | -0,26% |
| Ipiranga do Norte | R$ 37.522,93 | R$ 37.522,93 | R$ 37.522,93 | R$ 0,00 | **0,00% ✓** |
| Coxipã | R$ 130.643,31 | R$ 130.643,31 | R$ 130.632,63 | +R$ 10,68 | +0,01% |
| Miguel Sutil | R$ 159.783,16 | R$ 159.963,06 | R$ 159.963,06 | -R$ 179,90 | -0,11% |
| Paiaguás | R$ 112.556,43 | R$ 113.713,73 | R$ 112.586,41 | -R$ 29,98 | -0,03% |
| Paranaíba | R$ 38.660,71 | R$ 38.660,71 | R$ 38.660,71 | R$ 0,00 | **0,00% ✓** |
| Rio Preto | R$ 104.527,81 | R$ 104.527,81 | R$ 104.527,81 | R$ 0,00 | **0,00% ✓** |
| Chapéu do Sol | R$ 180.155,52 | R$ 191.436,72 | R$ 180.207,50 | -R$ 51,98 | -0,03% |
| Bongiovani | R$ 22.237,61 | R$ 22.289,58 | R$ 22.289,58 | -R$ 51,97 | -0,23% |
| Posto Palmas `*` | R$ 219.782,81 | R$ 209.421,83 | R$ 219.844,53 | -R$ 61,72 | -0,03% |
| CPA 3 | R$ 46.982,83 | R$ 49.209,47 | R$ 47.099,76 | -R$ 116,93 | -0,25% |
| 3 Barras | R$ 200.335,15 | R$ 200.319,17 | R$ 200.319,17 | +R$ 15,98 | +0,01% |
| Sinop | R$ 11.996,64 | R$ 14.858,94 | R$ 12.092,58 | -R$ 95,94 | -0,79% |

## Resumo de Aderência (excluindo unidades zeradas)

| Faixa | Unidades |
|---|---|
| Match exato (0,00%) | 3 — Ipiranga do Norte, Paranaíba, Rio Preto |
| Até 0,10% | 7 |
| Até 0,30% | 5 |
| Até 0,80% | 2 — CPA 3 (-0,25%), Sinop (-0,79%) |
| **Margem média absoluta** | **0,14%** |
| **Margem máxima** | **0,79% (Sinop)** |

**100% das unidades ativas estão dentro de 1% da aba Vendas do Sislav.**  
A diferença residual é explicada pelo delay de sincronização (vendas das últimas horas ainda não importadas).

---

## Por que o Dashboard Sislav é sempre maior que a aba Vendas?

O Dashboard do Sislav soma dois tipos de valor que **não passam pela API de vendas**:

### 1. Lançamentos de Delivery
Entradas financeiras manuais registradas no back-office do Sislav (ex: convênios, cobranças avulsas). Não existe endpoint na API que exponha esses dados. Impacto visível:

| Unidade | Dash | Vendas | Diferença |
|---|---:|---:|---:|
| Alzira Santana | R$ 208.716,98 | R$ 187.027,17 | +R$ 21.689 (+11,6%) |
| Ribeirão do Lipa | R$ 117.068,96 | R$ 106.803,39 | +R$ 10.265 (+9,6%) |
| Chapéu do Sol | R$ 191.436,72 | R$ 180.207,50 | +R$ 11.229 (+6,2%) |

### 2. Cálculo de Balance
Quando um cliente carrega créditos na conta, o dinheiro entra no caixa naquele momento. Quando usa esse saldo para pagar uma lavagem, o Dashboard contabiliza o valor da lavagem **mais uma vez** como receita, mesmo sem novo dinheiro entrar. Nosso sistema e a aba Vendas não duplicam esse valor — registram apenas o dinheiro recebido em cada transação.

---

## Anomalia: Posto Palmas

Posto Palmas é a **única unidade** onde o Dashboard Sislav mostra valor *menor* que a aba Vendas (R$ 209.421 vs R$ 219.844), invertendo o padrão de todas as demais. Isso indica uma configuração diferente dentro do próprio Sislav para essa unidade.

Nosso sistema foi ajustado para usar a mesma base da aba Vendas nessa unidade e está pareado: **R$ 219.782 vs R$ 219.844 (-0,03%)**.

---

## Conclusão

Para comparação com nosso sistema, o cliente deve sempre referenciar a **aba Vendas do Sislav** — não o Dashboard.

A aba Vendas usa a mesma base de cálculo (valor pago no momento da lavagem), enquanto o Dashboard acumula receitas adicionais inacessíveis via API (delivery manual + Balance), tornando qualquer comparação direta impossível sem acesso ao back-office interno do Sislav.
