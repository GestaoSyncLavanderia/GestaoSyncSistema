"use client";

import { useEffect, useRef } from "react";

const CELL_H = 52;
const CELL_W = 34;

// Always formats to 7 integer digits so character positions are stable
// and digit box keys never shift (e.g. "R$ 0.000.000,00").
function formatFixed(value: number): string {
  const cents = Math.round(value * 100);
  const intPart = Math.floor(cents / 100)
    .toString()
    .padStart(7, "0");
  const decPart = (cents % 100).toString().padStart(2, "0");
  const withDots = intPart.replace(/(\d)(?=(\d{3})+$)/g, "$1.");
  return `R$ ${withDots},${decPart}`;
}

function DigitColumn({ digit, animate }: { digit: number; animate: boolean }) {
  return (
    <div
      style={{
        width: CELL_W,
        height: CELL_H,
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
          transform: `translateY(-${digit * CELL_H}px)`,
          transition: animate ? "transform 600ms ease-out" : "none",
        }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            style={{
              width: CELL_W,
              height: CELL_H,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              fontSize: 22,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {i}
          </div>
        ))}
      </div>
    </div>
  );
}

interface OdometerCounterProps {
  value: number;
  label: string;
}

export function OdometerCounter({ value, label }: OdometerCounterProps) {
  const prevRef = useRef<number | null>(null);
  const animate = prevRef.current !== null;

  // Update after each render so next change triggers animation
  useEffect(() => {
    prevRef.current = value;
  });

  const chars = formatFixed(value).split("");

  return (
    <div
      style={{
        background: "#1E3A5F",
        borderRadius: 16,
        padding: "24px 32px",
        flex: 1,
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
          marginBottom: 16,
        }}
      >
        {label}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap" }}>
        {chars.map((char, i) => {
          if (/\d/.test(char)) {
            return (
              <DigitColumn key={i} digit={parseInt(char, 10)} animate={animate} />
            );
          }
          if (char === " ") {
            return <div key={i} style={{ width: 8, flexShrink: 0 }} />;
          }
          return (
            <span
              key={i}
              style={{
                color: "#FFFFFF",
                fontSize: 22,
                fontWeight: 700,
                lineHeight: `${CELL_H}px`,
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
