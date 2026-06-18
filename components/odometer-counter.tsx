"use client";

import { useEffect, useRef, useState } from "react";

const CELL_H = 52;
const CELL_W = 34;
const COMPACT_H = 48;
const COMPACT_W = 32;

function formatFixed(value: number): string {
  const cents = Math.round(value * 100);
  const intPart = Math.floor(cents / 100)
    .toString()
    .padStart(7, "0");
  const decPart = (cents % 100).toString().padStart(2, "0");
  const withDots = intPart.replace(/(\d)(?=(\d{3})+$)/g, "$1.");
  return `R$ ${withDots},${decPart}`;
}

interface OdometerCounterProps {
  value: number;
  label: string;
  compact?: boolean;
  fullWidth?: boolean;
  rateKey?: string;
  animated?: boolean; // false = atualiza só no sync real, sem micro-tick
  baseRate?: number;  // R$/s de fallback (ex: total_mensal / seg_decorridos_no_mês)
}

export function OdometerCounter({ value, label, compact = false, fullWidth = false, rateKey, animated = true, baseRate = 0 }: OdometerCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [mounted, setMounted] = useState(false);

  const ratePerSecRef    = useRef(0);
  const lastRealValueRef = useRef(value);
  const lastRealTimeRef  = useRef(Date.now());
  const baseRateRef      = useRef(baseRate);

  const cellH    = compact ? COMPACT_H : CELL_H;
  const cellW    = compact ? COMPACT_W : CELL_W;
  const fontSize = compact ? 21 : 22;

  // Keep baseRateRef in sync without re-creating intervals
  useEffect(() => { baseRateRef.current = baseRate; }, [baseRate]);

  // On mount: restore persisted rate; fall back to baseRate if nothing stored
  useEffect(() => {
    if (animated) {
      let restored = 0;
      try {
        const stored = localStorage.getItem(`odometer_rate_${rateKey ?? label}`);
        if (stored) {
          const { rate, savedAt } = JSON.parse(stored) as { rate: number; savedAt: number };
          const ageMin = (Date.now() - savedAt) / 60_000;
          if (ageMin < 90 && rate > 0) restored = rate;
        }
      } catch {}
      ratePerSecRef.current = restored > 0 ? restored : baseRateRef.current;
    }
    setMounted(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to real value arriving from API
  useEffect(() => {
    if (value === lastRealValueRef.current) return;

    const now     = Date.now();
    const elapsed = (now - lastRealTimeRef.current) / 1000;
    const delta   = value - lastRealValueRef.current;

    if (delta > 0 && elapsed > 5) {
      const rate = delta / elapsed;
      ratePerSecRef.current = rate;
      try { localStorage.setItem(`odometer_rate_${rateKey ?? label}`, JSON.stringify({ rate, savedAt: now })); } catch {}
    } else if (delta <= 0) {
      ratePerSecRef.current = baseRateRef.current; // não zera — usa média mensal
      try { localStorage.removeItem(`odometer_rate_${rateKey ?? label}`); } catch {}
      setDisplayValue(value);
    }

    lastRealValueRef.current = value;
    lastRealTimeRef.current  = now;

    setDisplayValue((prev) => (prev < value ? value : prev));
  }, [value, label]);

  // Micro-tick: incrementa a cada 15s usando a melhor taxa disponível
  useEffect(() => {
    if (!animated) return;
    const id = setInterval(() => {
      const rate = ratePerSecRef.current > 0 ? ratePerSecRef.current : baseRateRef.current;
      if (rate <= 0) return;
      setDisplayValue((prev) => {
        const ceiling = lastRealValueRef.current + rate * 1200;
        return Math.min(prev + rate * 15, ceiling);
      });
    }, 15_000);
    return () => clearInterval(id);
  }, [animated]);

  const chars = formatFixed(displayValue).split("");

  return (
    <div
      style={{
        background: "#1E3A5F",
        borderRadius: compact ? 8 : 16,
        padding: compact ? "10px 22px" : "24px 32px",
        flex: compact && !fullWidth ? "0 0 auto" : 1,
        minWidth: 0,
      }}
    >
      <p
        style={{
          color: "#93C5FD",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: compact ? 8 : 16,
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
                  width: cellW,
                  height: cellH,
                  overflow: "hidden",
                  background: "#2D5A8E",
                  border: "1px solid #3D6A9E",
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    willChange: "transform",
                    transform: `translateY(-${parseInt(char, 10) * cellH}px)`,
                    transition: mounted ? "transform 600ms ease-out" : "none",
                  }}
                >
                  {Array.from({ length: 10 }, (_, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: cellW,
                        height: cellH,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#FFFFFF",
                        fontSize,
                        fontWeight: 700,
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
                color: "#FFFFFF",
                fontSize,
                fontWeight: 700,
                lineHeight: `${cellH}px`,
                display: "inline-flex",
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
