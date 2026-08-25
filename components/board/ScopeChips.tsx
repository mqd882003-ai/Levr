"use client";

import type { Business } from "@/lib/types";

// Scope filter — dynamic from businesses, never hardcoded (requirements §Board).
export default function ScopeChips({
  businesses,
  scope,
  counts,
  onScope,
}: {
  businesses: Business[];
  scope: string; // "all" or a business id
  counts: Map<string, number>;
  onScope: (scope: string) => void;
}) {
  const chips = [
    { key: "all", label: "All" },
    ...businesses.map((b) => ({ key: b.id, label: b.name })),
  ];
  return (
    <div className="scope" role="tablist" aria-label="Business scope">
      {chips.map((chip) => {
        const n = counts.get(chip.key) ?? 0;
        const active = scope === chip.key;
        return (
          <button
            key={chip.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`chip pressable${active ? " active" : ""}`}
            onClick={() => onScope(chip.key)}
          >
            {chip.label}
            {n > 0 && <span className="n">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
