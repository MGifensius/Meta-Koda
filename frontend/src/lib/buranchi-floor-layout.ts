// Visual floor-plan coordinates for Buranchi's three zones, mirroring the
// printed maps (Teras Otella terrace, Poolside with the pool in the middle
// + 3 segitiga tables, Indoor Otella with long banquet tables + round
// tables). Coordinates are in arbitrary SVG viewBox units — the renderer
// scales them to fit the available width.

export type TableShape = "rect" | "round" | "triangle";

export type TablePosition = {
  id: string; // matches tables.id from the DB
  x: number; // CENTER x in viewBox units
  y: number; // CENTER y in viewBox units
  w: number;
  h: number;
  shape: TableShape;
  rotation?: number; // degrees, applied around (x, y)
  caption?: string; // tiny tag under table id, e.g. "Segitiga"
};

export type FloorDecoration =
  | {
      kind: "pool";
      x: number;
      y: number;
      w: number;
      h: number;
      label?: string;
    }
  | { kind: "label"; x: number; y: number; text: string; size?: number };

export type ZoneLayout = {
  viewBoxW: number;
  viewBoxH: number;
  decorations?: FloorDecoration[];
  tables: TablePosition[];
};

// Buranchi-specific layouts. Other tenants without a registered layout
// fall back to the generic grouped grid (handled in the floor page).
export const BURANCHI_FLOOR_LAYOUTS: Record<string, ZoneLayout> = {
  // Teras Otella — 6 × 4-pax rectangular tables, 2 rows × 3 cols on the
  // outdoor terrace.
  "Teras Otella": {
    viewBoxW: 720,
    viewBoxH: 380,
    decorations: [
      { kind: "label", x: 360, y: 30, text: "TERAS · Outdoor terrace", size: 12 },
    ],
    tables: [
      { id: "TO-1", x: 130, y: 130, w: 120, h: 70, shape: "rect" },
      { id: "TO-2", x: 360, y: 130, w: 120, h: 70, shape: "rect" },
      { id: "TO-3", x: 590, y: 130, w: 120, h: 70, shape: "rect" },
      { id: "TO-4", x: 130, y: 280, w: 120, h: 70, shape: "rect" },
      { id: "TO-5", x: 360, y: 280, w: 120, h: 70, shape: "rect" },
      { id: "TO-6", x: 590, y: 280, w: 120, h: 70, shape: "rect" },
    ],
  },

  // Poolside — pool in the center, 8 × 2-pax small tables around the
  // perimeter, 3 × 6-pax "Meja Segitiga" triangles slotted into the
  // corners and the open south side.
  Poolside: {
    viewBoxW: 960,
    viewBoxH: 600,
    decorations: [
      {
        kind: "pool",
        x: 230,
        y: 170,
        w: 500,
        h: 260,
        label: "POOL",
      },
      { kind: "label", x: 480, y: 30, text: "POOLSIDE · By the pool", size: 12 },
    ],
    tables: [
      // Top row (north of pool)
      { id: "PS-1", x: 110, y: 100, w: 60, h: 60, shape: "rect" },
      { id: "PS-2", x: 320, y: 95, w: 60, h: 60, shape: "rect" },
      { id: "PS-3", x: 640, y: 95, w: 60, h: 60, shape: "rect" },
      { id: "PS-4", x: 850, y: 100, w: 60, h: 60, shape: "rect" },
      // Bottom row (south of pool)
      { id: "PS-5", x: 110, y: 500, w: 60, h: 60, shape: "rect" },
      { id: "PS-6", x: 320, y: 505, w: 60, h: 60, shape: "rect" },
      { id: "PS-7", x: 640, y: 505, w: 60, h: 60, shape: "rect" },
      { id: "PS-8", x: 850, y: 500, w: 60, h: 60, shape: "rect" },
      // Three "Meja Segitiga" — 6-pax triangle tables
      {
        id: "PL-1",
        x: 110,
        y: 300,
        w: 90,
        h: 90,
        shape: "triangle",
        rotation: 90,
        caption: "Segitiga",
      },
      {
        id: "PL-2",
        x: 480,
        y: 540,
        w: 90,
        h: 90,
        shape: "triangle",
        rotation: 180,
        caption: "Segitiga",
      },
      {
        id: "PL-3",
        x: 850,
        y: 300,
        w: 90,
        h: 90,
        shape: "triangle",
        rotation: 270,
        caption: "Segitiga",
      },
    ],
  },

  // Indoor Otella — 7 long banquet tables (10-pax) up top in 4+3 rows,
  // 5 round tables (8-pax) below in a 3+2 cluster.
  "Indoor Otella": {
    viewBoxW: 960,
    viewBoxH: 700,
    decorations: [
      { kind: "label", x: 480, y: 30, text: "INDOOR · Banquet hall", size: 12 },
      {
        kind: "label",
        x: 480,
        y: 290,
        text: "— round tables —",
        size: 10,
      },
    ],
    tables: [
      // 4 long tables top row
      { id: "IL-1", x: 140, y: 110, w: 180, h: 60, shape: "rect" },
      { id: "IL-2", x: 360, y: 110, w: 180, h: 60, shape: "rect" },
      { id: "IL-3", x: 580, y: 110, w: 180, h: 60, shape: "rect" },
      { id: "IL-4", x: 800, y: 110, w: 180, h: 60, shape: "rect" },
      // 3 long tables second row, centered
      { id: "IL-5", x: 250, y: 220, w: 180, h: 60, shape: "rect" },
      { id: "IL-6", x: 470, y: 220, w: 180, h: 60, shape: "rect" },
      { id: "IL-7", x: 690, y: 220, w: 180, h: 60, shape: "rect" },
      // 3 round tables, top of round-cluster
      { id: "IR-1", x: 230, y: 430, w: 110, h: 110, shape: "round" },
      { id: "IR-2", x: 480, y: 430, w: 110, h: 110, shape: "round" },
      { id: "IR-3", x: 730, y: 430, w: 110, h: 110, shape: "round" },
      // 2 round tables, bottom
      { id: "IR-4", x: 350, y: 590, w: 110, h: 110, shape: "round" },
      { id: "IR-5", x: 610, y: 590, w: 110, h: 110, shape: "round" },
    ],
  },
};

export function hasFloorLayout(zone: string): boolean {
  return zone in BURANCHI_FLOOR_LAYOUTS;
}
