"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const CELL_H    = 52;
const CELL_W    = 34;
const COMPACT_H = 48;
const COMPACT_W = 32;
const TICK_MS   = 10_000;

function formatFixed(value: number): string {
  const cents   = Math.round(value * 100);
  const intPart = Math.floor(cents / 100).toString().padStart(7, "0");
  const decPart = (cents % 100).toString().padStart(2, "0");
  const withDots = intPart.replace(/(\d)(?=(\d{3})+$)/g, "$1.");
  return `R$ ${withDots},${decPart}`;
}

interface OdometerCounterProps {
  value:      number;
  label:      string;
  compact?:   boolean;
  fullWidth?: boolean;
  rateKey?:   string;
  animated?:  boolean;
  baseRate?:  number;
}

export function OdometerCounter({
  value,
  label,
  compact   = false,
  fullWidth = false,
  animated  = true,
}: OdometerCounterProps) {
  // SSR: inicia em 0 para casar com o HTML do servidor
  const [displayValue, setDisplayValue] = useState<number>(0);
  const [mounted, setMounted]           = useState(false);
  const valueRef = useRef(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Habilita transição CSS após o primeiro paint (evita spin no hydrate)
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMounted(true));
    });
  }, []);

  // Ao chegar novo valor real: anima para o total correto
  // Dentro do useEffect, React commita o setState antes do rAF disparar — dois renders separados → transição visível
  useEffect(() => {
    if (!animated) {
      setDisplayValue(value);
      return;
    }
    if (value <= 0) return;
    const offset = Math.max(1, value * 0.1);
    setDisplayValue(value - offset);
    requestAnimationFrame(() => setDisplayValue(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animated]);

  // A cada 10s: re-dispara a animação para o display não ficar estático
  // Dentro do setInterval, React 18 pode batchear os dois setStates numa só tarefa;
  // flushSync força o primeiro commit síncrono antes do rAF disparar com o valor final.
  useEffect(() => {
    if (!animated) return;
    const id = setInterval(() => {
      const v = valueRef.current;
      if (v <= 0) return;
      const offset = Math.max(1, v * 0.1);
      flushSync(() => setDisplayValue(v - offset));
      requestAnimationFrame(() => setDisplayValue(v));
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
          color:         "#93C5FD",
          fontSize:      11,
          fontWeight:    600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom:  compact ? 8 : 16,
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
                    transition: mounted ? "transform 2000ms ease-in-out" : "none",
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
                color:      "#FFFFFF",
                fontSize,
                fontWeight: 700,
                lineHeight: `${cellH}px`,
                display:    "inline-flex",
                alignItems: "center",
                flexShrink: 0,
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
