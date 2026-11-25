import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Breadcrumb segments, e.g. ['Scolarité', 'Guichet']. */
  trail: string[];
  title: string;
  chips?: ReactNode;
  actions?: ReactNode;
}

/** White breadcrumb, light Inter Tight title and peach chips, over the scene. */
export function PageHeader({ trail, title, chips, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-2">
      <div className="min-w-0">
        <div data-enter="fade" className="scene-text font-mono-ref text-[12.6px] normal-case tracking-normal">
          UniNotes&nbsp;&nbsp;{trail.map((t) => `${t} / `).join('')}
        </div>
        <h1 data-enter="blur" className="scene-text scene-title mt-2 break-words">
          {title}
        </h1>
        {chips && (
          <div data-enter="fade" className="mt-4 flex flex-wrap gap-2">
            {chips}
          </div>
        )}
      </div>
      {actions && (
        <div data-enter="fade" className="flex flex-wrap gap-2 shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}

/** Peach chip with an orange disc icon. */
export function Chip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="chip">
      {icon && (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-pin-orange text-white">{icon}</span>
      )}
      {children}
    </span>
  );
}
