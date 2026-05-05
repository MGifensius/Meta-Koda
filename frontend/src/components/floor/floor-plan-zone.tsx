"use client";

import { BURANCHI_FLOOR_LAYOUTS } from "@/lib/buranchi-floor-layout";
import type { TablePosition } from "@/lib/buranchi-floor-layout";

type TableStatus = "available" | "reserved" | "occupied" | "cleaning";

// Minimum shape we need from a table row. Generic so callers can pass
// a richer DB model (with bookings, cleaning_until, etc.) and get the
// same type back in onTableClick.
type FloorTable = {
  id: string | number;
  capacity: number;
  zone: string | null;
  status: TableStatus;
};

const STATUS_FILL: Record<TableStatus, string> = {
  available: "#f0fdf4", // green-50
  reserved: "#eff6ff", // blue-50
  occupied: "#fffbeb", // amber-50
  cleaning: "#f5f3ff", // violet-50
};
const STATUS_STROKE: Record<TableStatus, string> = {
  available: "#86efac", // green-300
  reserved: "#93c5fd", // blue-300
  occupied: "#fcd34d", // amber-300
  cleaning: "#c4b5fd", // violet-300
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

  // Index DB tables by id so we can join layout coords → live status.
  const byId = new Map<string, T>();
  for (const t of tables) byId.set(String(t.id), t);

  return (
    <div className="border rounded-xl bg-card p-4">
      <div className="text-[11px] font-mono-label uppercase tracking-wider ink-3 mb-2">
        {zone}
      </div>
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${layout.viewBoxW} ${layout.viewBoxH}`}
          className="w-full h-auto"
          style={{ maxHeight: 520 }}
        >
          {/* Decorations (pool, labels) */}
          {layout.decorations?.map((d, i) => {
            if (d.kind === "pool") {
              return (
                <g key={`dec-${i}`}>
                  <rect
                    x={d.x}
                    y={d.y}
                    width={d.w}
                    height={d.h}
                    rx={16}
                    ry={16}
                    fill="#dbeafe"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  {d.label && (
                    <text
                      x={d.x + d.w / 2}
                      y={d.y + d.h / 2 + 6}
                      textAnchor="middle"
                      fontSize={20}
                      fontWeight={600}
                      fill="#3b82f6"
                      letterSpacing={4}
                    >
                      {d.label}
                    </text>
                  )}
                </g>
              );
            }
            if (d.kind === "label") {
              return (
                <text
                  key={`dec-${i}`}
                  x={d.x}
                  y={d.y}
                  textAnchor="middle"
                  fontSize={d.size ?? 11}
                  fill="#9ca3af"
                  letterSpacing={1.5}
                  style={{ textTransform: "uppercase" }}
                >
                  {d.text}
                </text>
              );
            }
            return null;
          })}

          {/* Tables */}
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
  const rotation = pos.rotation ?? 0;
  const transform = `rotate(${rotation} ${pos.x} ${pos.y})`;

  // Shape: rect (w×h centered on x,y), round (circle), triangle (equilateral)
  const shape = (() => {
    if (pos.shape === "round") {
      const r = Math.min(pos.w, pos.h) / 2;
      return (
        <circle
          cx={pos.x}
          cy={pos.y}
          r={r}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
      );
    }
    if (pos.shape === "triangle") {
      const half = pos.w / 2;
      const points = [
        [pos.x, pos.y - half],
        [pos.x + half, pos.y + half],
        [pos.x - half, pos.y + half],
      ]
        .map((p) => p.join(","))
        .join(" ");
      return (
        <polygon
          points={points}
          fill={fill}
          stroke={stroke}
          strokeWidth={2}
        />
      );
    }
    return (
      <rect
        x={pos.x - pos.w / 2}
        y={pos.y - pos.h / 2}
        width={pos.w}
        height={pos.h}
        rx={6}
        ry={6}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
      />
    );
  })();

  // Click target — slightly larger transparent rect on top so SVG events
  // are easy to grab with mouse + finger.
  const hitW = pos.w + 12;
  const hitH = pos.h + 12;
  const hint = table
    ? `${pos.id} · ${table.capacity} pax · ${status}`
    : `${pos.id}`;

  return (
    <g
      onClick={onClick}
      style={{ cursor: table ? "pointer" : "default" }}
      transform={transform}
    >
      {shape}
      <text
        x={pos.x}
        y={pos.y - 2}
        textAnchor="middle"
        fontSize={pos.shape === "round" ? 18 : 16}
        fontWeight={700}
        fill={textColor}
        pointerEvents="none"
      >
        {pos.id}
      </text>
      <text
        x={pos.x}
        y={pos.y + 16}
        textAnchor="middle"
        fontSize={11}
        fill={textColor}
        opacity={0.8}
        pointerEvents="none"
      >
        {table ? `${table.capacity} pax` : ""}
      </text>
      {pos.caption && (
        <text
          x={pos.x}
          y={pos.y + pos.h / 2 + 14}
          textAnchor="middle"
          fontSize={10}
          fill="#6b7280"
          pointerEvents="none"
        >
          {pos.caption}
        </text>
      )}
      {/* Invisible larger hit target for easier clicks */}
      <rect
        x={pos.x - hitW / 2}
        y={pos.y - hitH / 2}
        width={hitW}
        height={hitH}
        fill="transparent"
      >
        <title>{hint}</title>
      </rect>
    </g>
  );
}
