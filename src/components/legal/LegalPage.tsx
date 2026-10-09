import type { ReactNode } from 'react';
import { LEGAL_LAST_UPDATED } from '@/lib/legal';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl py-8">
      <h1 className="font-display text-3xl lg:text-4xl font-bold mb-2">{title}</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated {LEGAL_LAST_UPDATED}</p>
      <div className="card-surface rounded-2xl p-6 lg:p-10 space-y-8 text-sm leading-relaxed text-foreground/90 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-3 [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p+p]:mt-3 [&_a]:text-primary [&_a]:underline">
        {children}
      </div>
    </article>
  );
}
