import type { ReactNode } from 'react';
import { Brand } from '../shell/Brand';
import { Card } from '../ui/Card';

/** The centred card used before the app is open: first run, sign-in and the lock screen. */
export function AuthCard({
  heading,
  documentTitle,
  children,
}: {
  heading: string;
  /** Omit where another screen already owns the document title (the lock screen). */
  documentTitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center p-16">
      {documentTitle && <title>{`${documentTitle} · Munim`}</title>}
      <Card className="w-full max-w-360 gap-12">
        <Brand />
        <h1 className="text-title font-semibold">{heading}</h1>
        {children}
      </Card>
    </main>
  );
}
