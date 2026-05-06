// Visual floor-plan coordinates for Buranchi's three zones, in arbitrary
// SVG viewBox units. The renderer scales them to fit available width.
//
// Kept deliberately sparse — just rectangles + circles + a soft pool
// tint — so the plan reads at a glance without competing with the
// status colors on the tables themselves.

export type TableShape = "rect" | "round";

export type TablePosition = {
  id: string; // matches tables.id from the DB
  x: number; // CENTER x in viewBox units
  y: number; // CENTER y in viewBox units
  w: number;
  h: number;
  shape: TableShape;
};

export type FloorDecoration = {
  kind: "pool";
  x: number;
  y: number;
  w: number;
  h: number;
};

export type ZoneLayout = {
  viewBoxW: number;
  viewBoxH: number;
  decorations?: FloorDecoration[];
  tables: TablePosition[];
};

export const BURANCHI_FLOOR_LAYOUTS: Record<string, ZoneLayout> = {
  // Teras Otella — 6 × 4-pax rectangles, 2 rows × 3 cols.
  "Teras Otella": {
    viewBoxW: 720,
    viewBoxH: 320,
    tables: [
      { id: "TO-1", x: 130, y: 100, w: 130, h: 70, shape: "rect" },
      { id: "TO-2", x: 360, y: 100, w: 130, h: 70, shape: "rect" },
      { id: "TO-3", x: 590, y: 100, w: 130, h: 70, shape: "rect" },
      { id: "TO-4", x: 130, y: 230, w: 130, h: 70, shape: "rect" },
      { id: "TO-5", x: 360, y: 230, w: 130, h: 70, shape: "rect" },
      { id: "TO-6", x: 590, y: 230, w: 130, h: 70, shape: "rect" },
    ],
  },

  // Poolside — soft tinted pool block in the middle, 8 × 2-pax tables
  // spread across north + south edges, 3 × 6-pax tables flanking the
  // sides + south. (Triangle shape from earlier dropped — segitiga
  // reads fine as a rectangle labeled by capacity.)
  Poolside: {
    viewBoxW: 900,
    viewBoxH: 460,
    decorations: [
      { kind: "pool", x: 200, y: 150, w: 500, h: 160 },
    ],
    tables: [
      // 8 small tables (PS-1..PS-8), 4 north + 4 south
      { id: "PS-1", x: 110, y: 90, w: 70, h: 60, shape: "rect" },
      { id: "PS-2", x: 320, y: 90, w: 70, h: 60, shape: "rect" },
      { id: "PS-3", x: 580, y: 90, w: 70, h: 60, shape: "rect" },
      { id: "PS-4", x: 790, y: 90, w: 70, h: 60, shape: "rect" },
      { id: "PS-5", x: 110, y: 380, w: 70, h: 60, shape: "rect" },
      { id: "PS-6", x: 320, y: 380, w: 70, h: 60, shape: "rect" },
      { id: "PS-7", x: 580, y: 380, w: 70, h: 60, shape: "rect" },
      { id: "PS-8", x: 790, y: 380, w: 70, h: 60, shape: "rect" },
      // 3 large 6-pax tables — one on each side + south-center
      { id: "PL-1", x: 110, y: 230, w: 90, h: 90, shape: "rect" },
      { id: "PL-2", x: 450, y: 380, w: 100, h: 60, shape: "rect" },
      { id: "PL-3", x: 790, y: 230, w: 90, h: 90, shape: "rect" },
    ],
  },

  // Indoor Otella — 7 long banquet tables (4 + 3) above 5 round
  // tables (3 + 2).
  "Indoor Otella": {
    viewBoxW: 900,
    viewBoxH: 540,
    tables: [
      // 4 long tables top row
      { id: "IL-1", x: 130, y: 80, w: 170, h: 60, shape: "rect" },
      { id: "IL-2", x: 350, y: 80, w: 170, h: 60, shape: "rect" },
      { id: "IL-3", x: 570, y: 80, w: 170, h: 60, shape: "rect" },
      { id: "IL-4", x: 790, y: 80, w: 170, h: 60, shape: "rect" },
      // 3 long tables second row, centered
      { id: "IL-5", x: 240, y: 180, w: 170, h: 60, shape: "rect" },
      { id: "IL-6", x: 460, y: 180, w: 170, h: 60, shape: "rect" },
      { id: "IL-7", x: 680, y: 180, w: 170, h: 60, shape: "rect" },
      // 5 round tables — 3 + 2
      { id: "IR-1", x: 230, y: 350, w: 100, h: 100, shape: "round" },
      { id: "IR-2", x: 460, y: 350, w: 100, h: 100, shape: "round" },
      { id: "IR-3", x: 690, y: 350, w: 100, h: 100, shape: "round" },
      { id: "IR-4", x: 350, y: 470, w: 100, h: 100, shape: "round" },
      { id: "IR-5", x: 570, y: 470, w: 100, h: 100, shape: "round" },
    ],
  },
};

export function hasFloorLayout(zone: string): boolean {
  return zone in BURANCHI_FLOOR_LAYOUTS;
}
