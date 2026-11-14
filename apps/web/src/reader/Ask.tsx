import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, SectionLabel, type Source } from '../ui/atoms';
import { Card } from '../ui/Card';
import { Chip } from '../ui/Chip';
import { CitationRow } from '../ui/CitationRow';
import { ask, SCOPES, useReader } from './store';

interface Exchange {
  q: string;
  scope: string;
  a: string;
  cites: { src: Source; title: string; from: string }[];
}

// Mock: the one worked example from the handoff.
const SAMPLE: Exchange = {
  q: 'What did people say about API rate limits this week?',
  scope: 'From everything',
  a: 'Three threads touch on it. On r/selfhosted, several people say replies from third-party clients fail roughly one time in ten [1]. @api_watch reports that read limits dropped on the free tier of X while posting limits are unchanged [2]. On Hacker News the consensus is to cache aggressively and poll less often [3].',
  cites: [
    {
      src: 'RD',
      title: 'What finally got you to move your feeds off five different apps?',
      from: 'r/selfhosted',
    },
    { src: 'X', title: 'Rate limits changed again. Summary of what moved', from: '@api_watch' },
    { src: 'HN', title: 'Ask HN: How do you keep track of long discussions?', from: '208 points' },
  ],
};

const TRY = [
  'Summarize what I saved this week',
  'Which threads have replies to me?',
  'What is new about sync protocols?',
];

export function Ask() {
  const { state, update } = useReader();
  const log: Exchange[] = [
    SAMPLE,
    ...state.asks.map(({ q, scope }) => ({
      q,
      scope: `From ${scope.toLowerCase()}`,
      // Honest placeholder until the AI milestone.
      a: `Answers are not connected yet. This question would be run over ${scope.toLowerCase()}.`,
      cites: [],
    })),
  ];

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader title="Ask" before={<AiBadge />}>
        <span className="mr-4 text-sm text-mute">Search in</span>
        {SCOPES.map((s) => (
          <Chip
            key={s}
            on={state.scope === s}
            onClick={() => {
              update({ scope: s });
            }}
          >
            {s}
          </Chip>
        ))}
      </ScreenHeader>
      <div className="flex min-h-0 max-w-820 flex-1 flex-col gap-14 overflow-y-auto px-16 py-20">
        {log.map((m, n) => (
          <div key={n} className="flex flex-col gap-10">
            <div className="max-w-4/5 self-end rounded-8 bg-card px-12 py-8 text-prose">{m.q}</div>
            <Card tone="ai" className="gap-8">
              <div className="flex items-center gap-8">
                <AiBadge />
                <span className="font-mono text-code text-mute">{m.scope}</span>
              </div>
              <div className="text-prose leading-prose text-pretty">{m.a}</div>
              {m.cites.map((c, i) => (
                <CitationRow key={c.title} index={i + 1} {...c} />
              ))}
            </Card>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-6">
          <SectionLabel>Try</SectionLabel>
          {TRY.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                ask(update, t);
              }}
              className="cursor-pointer rounded-pill border border-ai-line px-12 py-4 text-note hover:bg-accent/12"
            >
              {t}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
