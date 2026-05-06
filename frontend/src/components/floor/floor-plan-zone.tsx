"use client";

import { BURANCHI_FLOOR_LAYOUTS } from "@/lib/buranchi-floor-layout";
import type { TablePosition } from "@/lib/buranchi-floor-layout";

type TableStatus = "available" | "reserved" | "occupied" | "cleaning";

type FloorTable = {
  id: string | number;
  capacity: number;
  zone: string | null;
  status: TableStatus;
};

const STATUS_FILL: Record<TableStatus, string> = {
  available: "#f0fdf4",
  reserved: "#eff6ff",
  occupied: "#fffbeb",
  cleaning: "#f5f3ff",
};
const STATUS_STROKE: Record<TableStatus, string> = {
  available: "#86efac",
  reserved: "#93c5fd",
  occupied: "#fcd34d",
  cleaning: "#c4b5fd",
};
const STATUS_TEXT: Record<TableStatus, string> = {
  available: "#166534",
  reserved: "#1d4ed8",
  occupied: "#a16207",
  cleaning: "#5b21b6",
};

type Props<T extends FloorTable> = {
  zone: string;
  tables: T[];
  onTableClick: (table: T) => void;
};

export function FloorPlanZone<T extends FloorTable>({
  zone,
  tables,
  onTableClick,
}: Props<T>) {
  const layout = BURANCHI_FLOOR_LAYOUTS[zone];
  if (!layout) return null;

  const byId = new Map<string, T>();
  for (const t of tables) byId.set(String(t.id), t);

  return (
    <div className="border rounded-xl bg-card p-4">
      <div className="text-[11px] font-mono-label uppercase tracking-wider ink-3 mb-2">
        {zone}
      </div>
      <svg
        viewBox={`0 0 ${layout.viewBoxW} ${layout.viewBoxH}`}
        className="w-full h-auto"
        style={{ maxHeight: 420 }}
      >
        {/* Subtle pool tint, no border or label — just an environmental hint */}
        {layout.decorations?.map((d, i) =>
          d.kind === "pool" ? (
            <rect
              key={i}
              x={d.x}
              y={d.y}
              width={d.w}
              height={d.h}
              rx={20}
              ry={20}
              fill="#e0f2fe"
            />
          ) : null,
        )}

        {layout.tables.map((pos) => {
          const t = byId.get(pos.id);
          const status: TableStatus = t?.status ?? "available";
          return (
            <TableShape
              key={pos.id}
              pos={pos}
              table={t}
              status={status}
              onClick={() => t && onTableClick(t)}
            />
          );
        })}
      </svg>
    </div>
  );
}

function TableShape({
  pos,
  table,
  status,
  onClick,
}: {
  pos: TablePosition;
  table: FloorTable | undefined;
  status: TableStatus;
  onClick: () => void;
}) {
  const fill = STATUS_FILL[status];
  const stroke = STATUS_STROKE[status];
  const textColor = STATUS_TEXT[status];
  const tooltip = table
    ? `${pos.id} · ${table.capacity} pax · ${status}`
    : pos.id;

  const shape =
    pos.shape === "round" ? (
      <circle
        cx={pos.x}
        cy={pos.y}
        r={Math.min(pos.w, pos.h) / 2}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
    ) : (
      <rect
        x={pos.x - pos.w / 2}
        y={pos.y - pos.h / 2}
        width={pos.w}
        height={pos.h}
        rx={8}
        ry={8}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
    );

  return (
    <g
      onClick={onClick}
      style={{ cursor: table ? "pointer" : "default" }}
    >
      {shape}
      <text
        x={pos.x}
        y={pos.y + 6}
        textAnchor="middle"
        fontSize={18}
        fontWeight={700}
        fill={textColor}
        pointerEvents="none"
      >
        {pos.id}
      </text>
      <title>{tooltip}</title>
    </g>
  );
}
