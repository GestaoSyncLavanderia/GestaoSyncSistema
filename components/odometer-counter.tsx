"use client";

import { useEffect, useRef, useState } from "react";

const CELL_H     = 52;
const CELL_W     = 34;
const COMPACT_H  = 48;
const COMPACT_W  = 32;
const TICK_MS    = 15_000; // incremento a cada 15 s
const ANIM_STEPS = 120;    // 120 × 15 s = 30 min para atingir o alvo (1 ciclo de sync SisLav)

function formatFixed(value: number): string {
  const cents    = Math.round(value * 100);
  const intPart  = Math.floor(cents / 100).toString().padStart(7, "0");
  const decPart  = (cents % 100).toString().padStart(2, "0");
  const withDots = intPart.replace(/(\d)(?=(\d{3})+$)/g, "$1.");
  return `R$ ${withDots},${decPart}`;
}

interface OdometerCounterProps {
  value:      number;
  label:      string;
  compact?:   boolean;
  fullWidth?: boolean;
  rateKey?:   string;  // usado como chave de localStorage
  animated?:  boolean;
  baseRate?:  number;  // mantido para compatibilidade de API, não utilizado
}

export function OdometerCounter({
  value,
  label,
  compact   = false,
  fullWidth = false,
  rateKey,
  animated  = true,
}: OdometerCounterProps) {
  // Chave inclui mês/ano: ao virar o mês, a chave muda e reinicia automaticamente
  const now = new Date();
  const storageKey = `odometer_v4_${rateKey ?? label}_${now.getFullYear()}_${now.getMonth()}`;

  // Sempre inicia em 0 para casar com o HTML do SSR.
  // O localStorage é lido no useEffect (cliente apenas) para evitar hydration mismatch:
  // o servidor renderiza value=0, o cliente com localStorage renderizaria um valor diferente.
  const [displayValue, setDisplayValue] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  // Refs de animação iniciam em 0 — serão ajustados pelo useEffect de restauração
  const displayRef  = useRef(0);
  const animFromRef = useRef(0);
  const animToRef   = useRef(0);
  const stepRef     = useRef(ANIM_STEPS); // "concluído" para não animar antes de ter dados

  const persist = (display: number, to: number) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ display, to, savedAt: Date.now() }));
    } catch {}
  };

  const applyDisplay = (v: number) => {
    displayRef.current = v;
    setDisplayValue(v);
    if (animated) persist(v, animToRef.current);
  };

  // Roda uma vez após o mount: restaura localStorage sem transição CSS,
  // depois habilita as transições no próximo frame pintado (duplo rAF).
  useEffect(() => {
    if (animated) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const { display, to, savedAt } = JSON.parse(raw) as {
            display: number; to: number; savedAt: number;
          };
          const ageMs = Date.now() - savedAt;
          // Restaura se recente (< 2h) e display está abaixo do alvo salvo
          if (ageMs < 120 * 60_000 && display > 0 && display <= to) {
            displayRef.current  = display;
            animFromRef.current = display;
            animToRef.current   = display; // atualizado quando value prop chegar
            setDisplayValue(display);
          }
        }
      } catch {}
    }

    // Dois rAFs garantem que o estado acima é pintado SEM animação CSS
    // antes de habilitar a transition — evita o "spin" visual no restore.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => { setMounted(true); });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reage à chegada de novo valor do sync (via polling a cada 15s no layout)
  useEffect(() => {
    if (!animated) {
      applyDisplay(value);
      return;
    }

    if (value > animToRef.current) {
      if (animToRef.current === 0) {
        // Primeira carga sem localStorage válido: começa em 90% do valor real
        // para que o display já pareça correto E os dígitos fiquem animando subindo.
        const startFrom = value * 0.9;
        animFromRef.current = startFrom;
        animToRef.current   = value;
        stepRef.current     = 0;
        applyDisplay(startFrom);
        return;
      }
      // Novo sync com valor maior: anima do display atual até o novo alvo
      animFromRef.current = displayRef.current;
      animToRef.current   = value;
      stepRef.current     = 0;
    }
    // Valor menor ou igual: ignora — o display nunca recua.
    // Virada de mês é tratada pela chave do localStorage incluir mês+ano.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animated]);

  // Tick: avança um passo da animação a cada TICK_MS
  useEffect(() => {
    if (!animated) return;
    const id = setInterval(() => {
      if (stepRef.current >= ANIM_STEPS) return; // animação concluída, aguarda próximo sync
      stepRef.current++;
      const progress   = stepRef.current / ANIM_STEPS;
      const newDisplay = animFromRef.current + (animToRef.current - animFromRef.current) * progress;
      applyDisplay(newDisplay);
    }, TICK_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animated]);

  const cellH    = compact ? COMPACT_H : CELL_H;
  const cellW    = compact ? COMPACT_W : CELL_W;
  const fontSize = compact ? 21 : 22;
  const chars    = formatFixed(displayValue).split("");

  return (
    <div
      style={{
        background:   "#1E3A5F",
        borderRadius: compact ? 8 : 16,
        padding:      compact ? "10px 22px" : "24px 32px",
        flex:         compact && !fullWidth ? "0 0 auto" : 1,
        minWidth:     0,
      }}
    >
      <p
        style={{
          color:          "#93C5FD",
          fontSize:       11,
          fontWeight:     600,
          letterSpacing:  "0.1em",
          textTransform:  "uppercase",
          marginBottom:   compact ? 8 : 16,
        }}
      >
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap" }}>
        {chars.map((char, i) => {
          if (/\d/.test(char)) {
            return (
              <div
                key={i}
                style={{
                  width:        cellW,
                  height:       cellH,
                  overflow:     "hidden",
                  background:   "#2D5A8E",
                  border:       "1px solid #3D6A9E",
                  borderRadius: 6,
                  flexShrink:   0,
                }}
              >
                <div
                  style={{
                    willChange: "transform",
                    transform:  `translateY(-${parseInt(char, 10) * cellH}px)`,
                    transition: mounted ? "transform 600ms ease-out" : "none",
                  }}
                >
                  {Array.from({ length: 10 }, (_, idx) => (
                    <div
                      key={idx}
                      style={{
                        width:              cellW,
                        height:             cellH,
                        display:            "flex",
                        alignItems:         "center",
                        justifyContent:     "center",
                        color:              "#FFFFFF",
                        fontSize,
                        fontWeight:         700,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {idx}
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          if (char === " ") {
            return <div key={i} style={{ width: compact ? 5 : 8, flexShrink: 0 }} />;
          }
          return (
            <span
              key={i}
              style={{
                color:       "#FFFFFF",
                fontSize,
                fontWeight:  700,
                lineHeight:  `${cellH}px`,
                display:     "inline-flex",
                alignItems:  "center",
                flexShrink:  0,
              }}
            >
              {char}
            </span>
          );
        })}
      </div>
    </div>
  );
}
