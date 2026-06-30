"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

const CELL_H    = 52;
const CELL_W    = 34;
const COMPACT_H = 48;
const COMPACT_W = 32;
const TICK_MS   = 5_000;

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
  const [displayValue, setDisplayValue] = useState<number>(0);
  // mounted: false no SSR, vira true após o primeiro paint (evita transição no hydrate)
  const [mounted, setMounted]           = useState(false);
  // transitioning: false = sem transição CSS (snap silencioso), true = anima
  const [transitioning, setTransitioning] = useState(true);
  const valueRef = useRef(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Habilita mounted após o primeiro paint
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setMounted(true));
    });
  }, []);

  // Quando chega novo valor da API: snap silencioso para (v - 10%) → anima subindo até v
  useEffect(() => {
    if (!animated) {
      setDisplayValue(value);
      return;
    }
    if (value <= 0) return;
    const offset = Math.max(1, value * 0.1);
    // Dentro do useEffect os dois setStates são batchiados num único commit (sem transição)
    setTransitioning(false);
    setDisplayValue(value - offset);
    // Duplo rAF: garante que o browser pintou o estado "from" antes de habilitar a transição
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitioning(true);
        setDisplayValue(value);
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, animated]);

  // A cada 10s: re-dispara o mesmo ciclo snap → anima
  useEffect(() => {
    if (!animated) return;
    const id = setInterval(() => {
      const v = valueRef.current;
      if (v <= 0) return;
      const offset = Math.max(1, v * 0.1);
      // flushSync: commita ambos os setStates síncronamente (snap sem transição)
      flushSync(() => {
        setTransitioning(false);
        setDisplayValue(v - offset);
      });
      // Duplo rAF: habilita transição e anima subindo até o valor real
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTransitioning(true);
          setDisplayValue(v);
        });
      });
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
                    // Transição só ativa quando mounted (evita spin no hydrate)
                    // E quando transitioning=true (evita animar o snap inicial)
                    transition: (mounted && transitioning) ? "transform 2000ms ease-in-out" : "none",
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
