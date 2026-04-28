export const tokens = {
  color: {
    canvas: '#f3f3f7',
    surface: '#ffffff',
    fg: '#0a0a0a',
    muted: '#737373',
    accent: '#2563eb',
    accentSoft: '#dbeafe',
    success: '#16a34a',
    successSoft: '#dcfce7',
    danger: '#dc2626',
    dangerSoft: '#fee2e2',
    border: '#e5e5e5',
    rowDivider: '#f5f5f5',
  },
  radius: {
    card: '14px',
    pill: '999px',
    input: '8px',
    tile: '10px',
  },
  spacing: {
    cardPad: '20px',
    rowGap: '14px',
    sectionGap: '24px',
  },
  font: {
    family: 'var(--font-jakarta), -apple-system, system-ui, sans-serif',
  },
  fontSize: {
    display: ['28px', { lineHeight: '1', letterSpacing: '-0.02em', fontWeight: '500' }],
    title: ['18px', { lineHeight: '1.2', fontWeight: '600' }],
    body: ['13px', { lineHeight: '1.5', fontWeight: '400' }],
    bodyStrong: ['13px', { lineHeight: '1.5', fontWeight: '500' }],
    label: ['11px', { lineHeight: '1.2', fontWeight: '500', letterSpacing: '0.06em' }],
  },
  shadow: {
    card: '0 1px 2px rgba(15,23,42,0.04)',
    popover: '0 8px 24px rgba(15,23,42,0.08)',
  },
} as const;
