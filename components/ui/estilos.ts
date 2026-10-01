// Clases de Tailwind compartidas para que botones y campos se vean igual en
// todas las pantallas. Solo usan los tokens de app/globals.css (DESIGN.md).

const btnBase =
  'inline-flex items-center justify-center gap-2 px-4 min-h-10 pointer-coarse:min-h-11 rounded-ui text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

export const btnPrimario = `${btnBase} bg-brand-solid hover:bg-brand-solid-hover text-on-solid`;

export const btnSecundario = `${btnBase} bg-surface border border-line-strong text-ink hover:bg-sunken`;

export const btnPeligro = `${btnBase} bg-danger-solid hover:bg-danger-solid-hover text-white`;

export const btnIcono =
  'inline-flex items-center justify-center size-9 pointer-coarse:size-11 rounded-ui text-ink-subtle hover:text-ink hover:bg-sunken transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

export const btnIconoPeligro =
  'inline-flex items-center justify-center size-9 pointer-coarse:size-11 rounded-ui text-ink-subtle hover:text-danger hover:bg-danger-subtle transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

export const etiqueta = 'block text-sm font-medium text-ink mb-2';

export const campo =
  'w-full px-3 min-h-10 pointer-coarse:min-h-11 py-2 text-base border border-line-strong rounded-ui bg-surface text-ink placeholder:text-ink-subtle focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text disabled:bg-sunken disabled:text-ink-subtle';

export const buscador =
  'w-full pl-10 pr-3 min-h-10 pointer-coarse:min-h-11 py-2 bg-surface border border-line-strong rounded-ui text-base text-ink placeholder:text-ink-subtle focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text';

export const tarjeta = 'bg-surface border border-line rounded-ui';
