import type { ReactNode } from 'react';

/** The title bar at the top of every screen. Also sets the document title. */
export function ScreenHeader({
  title,
  before,
  children,
}: {
  title: string;
  /** Rendered ahead of the title, for the AI badge. */
  before?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-6 border-b border-line px-16 py-12">
      <title>{`${title} · Munim`}</title>
      {before}
      <h1 className="mr-8 text-title font-semibold">{title}</h1>
      {children}
    </div>
  );
}
