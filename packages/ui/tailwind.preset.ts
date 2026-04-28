import type { Config } from 'tailwindcss';
import { tokens } from './src/tokens.js';

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        canvas: tokens.color.canvas,
        surface: tokens.color.surface,
        fg: tokens.color.fg,
        muted: tokens.color.muted,
        accent: {
          DEFAULT: tokens.color.accent,
          soft: tokens.color.accentSoft,
        },
        success: {
          DEFAULT: tokens.color.success,
          soft: tokens.color.successSoft,
        },
        danger: {
          DEFAULT: tokens.color.danger,
          soft: tokens.color.dangerSoft,
        },
        border: tokens.color.border,
        'row-divider': tokens.color.rowDivider,
      },
      borderRadius: {
        card: tokens.radius.card,
        pill: tokens.radius.pill,
        input: tokens.radius.input,
        tile: tokens.radius.tile,
      },
      fontFamily: {
        sans: tokens.font.family.split(', ').map((s) => s.replace(/^var\(|\)$/g, '')),
      },
      fontSize: {
        display: tokens.fontSize.display,
        title: tokens.fontSize.title,
        body: tokens.fontSize.body,
        'body-strong': tokens.fontSize.bodyStrong,
        label: tokens.fontSize.label,
      },
      boxShadow: {
        card: tokens.shadow.card,
        popover: tokens.shadow.popover,
      },
      spacing: {
        'card-pad': tokens.spacing.cardPad,
        'row-gap': tokens.spacing.rowGap,
        'section-gap': tokens.spacing.sectionGap,
      },
    },
  },
};

export default preset;
