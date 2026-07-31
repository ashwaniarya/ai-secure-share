import type { ReactNode } from "react";

export interface RailEntry {
  label: string;
  /** One line per value; multiple values stack under a single label. */
  values: string[];
}

interface ProvenanceRailProps {
  entries: RailEntry[];
  /** Extra items rendered after the entries (e.g. a live counter). */
  children?: ReactNode;
}

/**
 * The spine of every screen: a column of machine-readable facts about the
 * record. On the landing page it carries reach; on a share it is the chain of
 * custody. Collapses to a horizontal strip under 720px (see styles.css).
 */
export default function ProvenanceRail({
  entries,
  children,
}: ProvenanceRailProps) {
  return (
    <aside className="rail" aria-label="Record details">
      {entries.map((entry) => (
        <div className="rail-item" key={entry.label}>
          {entry.label}
          {entry.values.map((value) => (
            <span className="rail-value" key={value}>
              {value}
            </span>
          ))}
        </div>
      ))}
      {children}
    </aside>
  );
}
