import type { ReactNode } from "react";

export interface RailEntry {
  label: string;
  values: [string, ...string[]];
}

interface ProvenanceRailProps {
  entries: RailEntry[];
  children?: ReactNode;
}

export default function ProvenanceRail({
  entries,
  children,
}: ProvenanceRailProps) {
  return (
    <aside className="rail" aria-label="Record details">
      {entries.map((entry) => (
        <div className="rail-item" key={entry.label}>
          {entry.label}
          {entry.values.map((value, index) => (
            <span className="rail-value" key={`${entry.label}-${index}`}>
              {value}
            </span>
          ))}
        </div>
      ))}
      {children}
    </aside>
  );
}
