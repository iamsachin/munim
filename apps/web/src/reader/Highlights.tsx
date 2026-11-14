import { ScreenHeader } from '../shell/ScreenHeader';
import { Highlight, SourceTag } from '../ui/atoms';
import { Card } from '../ui/Card';
import { HIGHLIGHTS } from './fixtures';

export function Highlights() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Highlights">
        {/* The handoff's hint here ("Select text in any article...") returns when that is built. */}
        <span className="text-note text-mute">
          Highlighting by selecting text is not built yet.
        </span>
      </ScreenHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-10 overflow-y-auto p-16">
        {HIGHLIGHTS.map((h) => (
          <Card key={h.quote} className="max-w-820 gap-8">
            <div className="text-read leading-prose text-pretty">
              <Highlight>{h.quote}</Highlight>
            </div>
            {h.note && <div className="text-mute">Note: {h.note}</div>}
            <div className="flex items-baseline gap-10 font-mono text-meta text-mute">
              <SourceTag src={h.src} />
              <span className="truncate">
                {h.title} · {h.from}
              </span>
              <span className="ml-auto">{h.when}</span>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
