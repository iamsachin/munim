import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, reason, sessionOver } from '../api/client';
import { useReader } from '../reader/store';
import { ScreenHeader } from '../shell/ScreenHeader';
import { AiBadge, SectionLabel, StatusDot } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { focusOnMount, Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { ErrorState, LoadingRows } from '../ui/States';
import { Cell, Table, TableHeader, TableRow, Th } from '../ui/Table';
import { Toggle } from '../ui/Toggle';
import {
  aiPaused,
  FEATURES,
  modelFor,
  MODELS,
  PERIODS,
  PROVIDERS,
  totalCents,
  usableProviders,
  USAGE,
  usd,
  type AiState,
  type Feature,
  type Period,
  type Provider,
} from './ai';

const keys = <T extends object>(o: T) => Object.keys(o) as (keyof T)[];

const KEY_COLS = 'grid-cols-[34px_110px_minmax(0,1fr)_110px_170px]';
const MODEL_COLS = 'grid-cols-[minmax(0,1fr)_240px_90px]';
const USAGE_COLS = 'grid-cols-[minmax(0,1fr)_170px_80px_100px_100px_80px]';
const META = 'font-mono text-meta text-mute';
const HEADING = 'px-16 pt-16 pb-6';

export function AiSettings() {
  const { state, update } = useReader();
  const ai = state.ai;
  const setAi = (next: (ai: AiState) => AiState) => {
    update((s) => ({ ai: next(s.ai) }));
  };

  const [editing, setEditing] = useState<Provider | null>(null);
  const [pasted, setPasted] = useState('');
  const [limitText, setLimitText] = useState(String(ai.limit ?? 10));
  const [period, setPeriod] = useState<Period>('This month');

  // The keys are the server's: it seals them, asks the provider about them, and tells the
  // browser only each one's last four characters and whether it was accepted.
  const queries = useQueryClient();
  const stored = useQuery({ queryKey: ['ai-keys'], queryFn: api.aiKeys });
  const stopEditing = () => {
    setEditing(null);
    setPasted('');
  };
  const again = () => queries.invalidateQueries({ queryKey: ['ai-keys'] });
  const save = useMutation({
    mutationFn: api.setAiKey,
    onSuccess: () => {
      stopEditing();
      return again();
    },
  });
  const remove = useMutation({ mutationFn: api.removeAiKey, onSuccess: again });

  const month = totalCents(USAGE['This month']);
  const usable = usableProviders(stored.data ?? []);
  const usage = USAGE[period];

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ScreenHeader title="AI" before={<AiBadge />}>
        <span className={`${META} ml-auto`}>
          {usd(month)}
          {ai.limit !== null && ` of ${usd(ai.limit * 100)}`} this month
        </span>
      </ScreenHeader>

      {aiPaused(ai) && (
        <div
          role="status"
          className="flex items-center gap-8 border-b border-line px-16 py-10 text-a3"
        >
          <StatusDot tone="a3" />
          AI is paused: this month&apos;s limit is reached. Raise the limit, or wait for next month.
        </div>
      )}

      <SectionLabel as="h2" className={HEADING}>
        Providers
      </SectionLabel>
      <Table label="Providers">
        <TableHeader className={KEY_COLS}>
          <Th>
            <span className="sr-only">Code</span>
          </Th>
          <Th>Provider</Th>
          <Th>Key</Th>
          <Th>Status</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </TableHeader>
        {stored.isPending && <LoadingRows what="providers" rows={2} />}
        {stored.isError && (
          <ErrorState what="the providers" onRetry={() => void stored.refetch()} />
        )}
        {stored.data?.map(({ provider: p, tail, ok }) => {
          const { name, code } = PROVIDERS[p];
          const key = tail === null ? null : { tail, ok };
          const form = `key-${p}`;
          return (
            <TableRow key={p} pad={6} hover={false} className={`${KEY_COLS} items-center`}>
              <Cell className="font-mono text-code font-medium text-mute">{code}</Cell>
              <Cell className="font-semibold">{name}</Cell>
              <Cell>
                {editing === p ? (
                  <form
                    id={form}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (pasted.trim()) save.mutate({ provider: p, key: pasted });
                    }}
                  >
                    <Input
                      ref={focusOnMount}
                      type="password"
                      autoComplete="off"
                      className="w-full max-w-360"
                      aria-label={`${name} API key`}
                      placeholder="Paste key"
                      value={pasted}
                      onChange={(e) => {
                        setPasted(e.target.value);
                      }}
                    />
                    {/* Why it was not saved: the provider could not be asked, or it is no key. */}
                    <div role="alert" className="pt-4 text-note text-a3 empty:hidden">
                      {save.isError && !sessionOver(save.error) ? reason(save.error) : null}
                    </div>
                  </form>
                ) : (
                  <span className="font-mono text-sm text-mute">
                    {key ? `Ends in ${key.tail}` : 'No key'}
                  </span>
                )}
              </Cell>
              <Cell className="flex items-center gap-6 text-note">
                <StatusDot tone={!key ? 'line' : key.ok ? 'ok' : 'a3'} />
                {!key ? 'No key' : key.ok ? 'Connected' : 'Key rejected'}
              </Cell>
              <Cell className="flex justify-end gap-6">
                {editing === p ? (
                  <>
                    <Button type="submit" form={form} size="md" disabled={save.isPending}>
                      Save
                    </Button>
                    <Button size="md" onClick={stopEditing}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="md"
                      aria-label={`${key ? 'Replace' : 'Add'} key for ${name}`}
                      onClick={() => {
                        setPasted('');
                        save.reset();
                        setEditing(p);
                      }}
                    >
                      {key ? 'Replace' : 'Add'} key
                    </Button>
                    {key && (
                      <Button
                        size="md"
                        aria-label={`Remove key for ${name}`}
                        disabled={remove.isPending}
                        onClick={() => {
                          remove.mutate(p);
                        }}
                      >
                        Remove key
                      </Button>
                    )}
                  </>
                )}
              </Cell>
            </TableRow>
          );
        })}
      </Table>

      <SectionLabel as="h2" className={HEADING}>
        Models
      </SectionLabel>
      <Table label="Models">
        <TableHeader className={MODEL_COLS}>
          <Th>Feature</Th>
          <Th>Model</Th>
          <Th className="text-right">This month</Th>
        </TableHeader>
        {/* Which models can be chosen depends on the keys, so this waits for them. */}
        {stored.isPending && <LoadingRows what="models" rows={3} />}
        {stored.data &&
          keys(FEATURES).map((f: Feature) => {
            const { name, note } = FEATURES[f];
            const model = modelFor(ai, f, usable);
            const spent = totalCents(USAGE['This month'].filter((r) => r.feature === f));
            return (
              <TableRow key={f} pad={6} hover={false} className={`${MODEL_COLS} items-center`}>
                <Cell>
                  <div className="font-medium">{name}</div>
                  <div className="text-note text-mute">{note}</div>
                  {model === null && (
                    <div className="text-note text-a3">No model chosen, so this is off.</div>
                  )}
                </Cell>
                <Cell>
                  <Select
                    className="w-full"
                    aria-label={`Model for ${name}`}
                    disabled={usable.length === 0}
                    value={model ?? ''}
                    onChange={(e) => {
                      setAi((a) => ({ ...a, models: { ...a.models, [f]: e.target.value } }));
                    }}
                  >
                    <option value="" disabled>
                      {usable.length === 0 ? 'Add a key first' : 'Choose a model'}
                    </option>
                    {usable.map((p) => (
                      <optgroup key={p} label={PROVIDERS[p].name}>
                        {MODELS[p].map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Cell>
                <Cell className={`${META} text-right`}>{usd(spent)}</Cell>
              </TableRow>
            );
          })}
      </Table>

      <SectionLabel as="h2" className={HEADING}>
        Monthly limit
      </SectionLabel>
      <div className="flex items-center gap-12 border-y border-rule px-16 py-dn-6">
        <Toggle
          on={ai.limit !== null}
          label="Monthly limit"
          onChange={(on) => {
            const dollars = Number(limitText);
            setAi((a) => ({ ...a, limit: on ? (Number.isFinite(dollars) ? dollars : 10) : null }));
          }}
        />
        <div className="flex items-center gap-6 text-mute">
          $
          <Input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            className="w-80"
            aria-label="Monthly limit in dollars"
            disabled={ai.limit === null}
            value={limitText}
            onChange={(e) => {
              const text = e.target.value;
              setLimitText(text);
              const dollars = Number(text);
              // Half-typed or negative input is not applied; the last valid limit stays in force.
              if (text.trim() !== '' && Number.isFinite(dollars) && dollars >= 0) {
                setAi((a) => ({ ...a, limit: dollars }));
              }
            }}
          />
        </div>
        <span className="text-note text-mute">
          {ai.limit === null
            ? 'No limit. AI keeps running whatever it costs.'
            : "AI pauses when this month's estimated cost reaches the limit."}
        </span>
      </div>

      <div className={`${HEADING} flex items-center gap-6`}>
        <SectionLabel as="h2" className="mr-8">
          Usage
        </SectionLabel>
        {PERIODS.map((p) => (
          <Chip
            key={p}
            on={period === p}
            onClick={() => {
              setPeriod(p);
            }}
          >
            {p}
          </Chip>
        ))}
      </div>
      <Table label="Usage">
        <TableHeader className={USAGE_COLS}>
          <Th>Feature</Th>
          <Th>Model</Th>
          <Th className="text-right">Requests</Th>
          <Th className="text-right">Tokens in</Th>
          <Th className="text-right">Tokens out</Th>
          <Th className="text-right">Est. cost</Th>
        </TableHeader>
        {usage.map((r) => (
          <TableRow
            key={r.feature + r.model}
            pad={4}
            hover={false}
            className={`${USAGE_COLS} items-baseline`}
          >
            <Cell>{FEATURES[r.feature].name}</Cell>
            <Cell className={META}>{r.model}</Cell>
            <Cell className={`${META} text-right`}>{r.requests.toLocaleString('en-US')}</Cell>
            <Cell className={`${META} text-right`}>{r.tokensIn.toLocaleString('en-US')}</Cell>
            <Cell className={`${META} text-right`}>{r.tokensOut.toLocaleString('en-US')}</Cell>
            <Cell className={`${META} text-right`}>{usd(r.cents)}</Cell>
          </TableRow>
        ))}
        <TableRow pad={4} hover={false} className={`${USAGE_COLS} items-baseline`}>
          <Cell className="font-semibold">Total</Cell>
          <Cell />
          <Cell />
          <Cell />
          <Cell />
          <Cell className="text-right font-mono text-meta font-medium">
            {usd(totalCents(usage))}
          </Cell>
        </TableRow>
      </Table>
      <p className="px-16 py-10 text-note text-mute">
        Costs are estimates, worked out from token counts and each model&apos;s list price.
      </p>
    </main>
  );
}
