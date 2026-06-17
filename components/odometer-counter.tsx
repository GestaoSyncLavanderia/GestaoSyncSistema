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
  rateKey?: string; // compartilha taxa entre instâncias com a mesma chave
}

export function OdometerCounter({ value, label, compact = false, fullWidth = false, rateKey }: OdometerCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [mounted, setMounted] = useState(false);

  // Rate estimation
  const ratePerSecRef    = useRef(0);      // R$/second estimated from observed changes
  const lastRealValueRef = useRef(value);  // last real value received from API
  const lastRealTimeRef  = useRef(Date.now());

  const cellH    = compact ? COMPACT_H : CELL_H;
  const cellW    = compact ? COMPACT_W : CELL_W;
  const fontSize = compact ? 21 : 22;

  // On mount: restore persisted rate (survives page reloads triggered by sync detection)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`odometer_rate_${rateKey ?? label}`);
      if (stored) {
        const { rate, savedAt } = JSON.parse(stored) as { rate: number; savedAt: number };
        const ageMin = (Date.now() - savedAt) / 60_000;
        if (ageMin < 90 && rate > 0) ratePerSecRef.current = rate;
      }
    } catch {}
    setMounted(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to real value arriving from API
  useEffect(() => {
    if (value === lastRealValueRef.current) return;

    const now     = Date.now();
    const elapsed = (now - lastRealTimeRef.current) / 1000; // seconds
    const delta   = value - lastRealValueRef.current;

    if (delta > 0 && elapsed > 5) {
      const rate = delta / elapsed;
      ratePerSecRef.current = rate;
      try { localStorage.setItem(`odometer_rate_${rateKey ?? label}`, JSON.stringify({ rate, savedAt: now })); } catch {}
    } else if (delta <= 0) {
      ratePerSecRef.current = 0;
      try { localStorage.removeItem(`odometer_rate_${rateKey ?? label}`); } catch {}
      setDisplayValue(value);
    }

    lastRealValueRef.current = value;
    lastRealTimeRef.current  = now;

    setDisplayValue((prev) => (prev < value ? value : prev));
  }, [value, label]);

  // Micro-tick: increment displayValue every 15 seconds
  useEffect(() => {
    const id = setInterval(() => {
      if (ratePerSecRef.current <= 0) return;
      setDisplayValue((prev) => {
        const ceiling = lastRealValueRef.current + ratePerSecRef.current * 1200;
        return Math.min(prev + ratePerSecRef.current * 15, ceiling);
      });
    }, 15_000);
    return () => clearInterval(id);
  }, []);

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
