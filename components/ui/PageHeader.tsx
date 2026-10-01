import React from 'react';

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Enlace o migas de pan sobre el título (p. ej. "Volver a proyectos") */
  back?: React.ReactNode;
}

/** Encabezado único de página: título, descripción y acciones principales. */
export default function PageHeader({ title, description, actions, back }: PageHeaderProps) {
  return (
    <header className="mb-8 sm:mb-10">
      {back && <div className="mb-4">{back}</div>}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold text-ink">{title}</h1>
          {description && <p className="text-base text-ink-muted mt-2 max-w-prose">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
