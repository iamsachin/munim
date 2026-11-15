import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, reason, sessionOver, type AiPrice } from '../api/client';
import { EMPTY } from '../reader/copy';
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
  FEATURES,
  isAmount,
  modelFor,
  optionOf,
  PERIODS,
  PROVIDERS,
  usd,
  type Feature,
  type Period,
  type Provider,
} from './ai';

const KEY_COLS = 'grid-cols-[34px_110px_minmax(0,1fr)_110px_170px]';
const MODEL_COLS = 'grid-cols-[minmax(0,1fr)_240px_90px]';
const PRICE_COLS = 'grid-cols-[minmax(0,1fr)_150px_150px_70px]';
const USAGE_COLS = 'grid-cols-[minmax(0,1fr)_170px_80px_100px_100px_80px]';
const META = 'font-mono text-meta text-mute';
const HEADING = 'px-16 pt-16 pb-6';

export function AiSettings() {
  const [editing, setEditing] = useState<Provider | null>(null);
  const [pasted, setPasted] = useState('');
  // What is being typed as the limit; null while the field shows what the server holds.
  const [limitText, setLimitText] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('this');

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

  // The model each feature runs on is the server's too: it is what will call the provider.
  const chosen = useQuery({ queryKey: ['ai-features'], queryFn: api.aiFeatures });
  const choose = useMutation({
    mutationFn: api.setAiFeature,
    onSuccess: () => queries.invalidateQueries({ queryKey: ['ai-features'] }),
  });

  // What AI use has cost is the server's as well: it counts each call at the price entered for
  // its model, and stops calling when the month reaches the limit.
  const spend = useQuery({ queryKey: ['ai-limit'], queryFn: api.aiLimit });
  const setLimit = useMutation({
    mutationFn: api.setAiLimit,
    onSuccess: (now) => {
      queries.setQueryData(['ai-limit'], now);
    },
  });
  const prices = useQuery({ queryKey: ['ai-prices'], queryFn: api.aiPrices });
  const month = useQuery({ queryKey: ['ai-usage', 'this'], queryFn: () => api.aiUsage('this') });
  const usage = useQuery({ queryKey: ['ai-usage', period], queryFn: () => api.aiUsage(period) });

  // What can be chosen from: the models of each provider whose key was accepted.
  const usable = (stored.data ?? []).filter((key) => key.ok);
  // The models in use, once each: these are the ones a price is asked for.
  const inUse = [
    ...new Map(
      (chosen.data ?? [])
        .filter((choice) => modelFor(choice, stored.data ?? []) !== null)
        .map((choice) => [`${choice.provider ?? ''}/${choice.model ?? ''}`, choice]),
    ).values(),
  ];
  const limit = spend.data?.limit ?? null;
  const limitShown = limitText ?? String(limit ?? 10);
  /** Sends what was typed as the limit, if it is an amount and not what is already set. */
  const commitLimit = () => {
    if (limit !== null && isAmount(limitShown) && Number(limitShown) !== limit) {
      setLimit.mutate(Number(limitShown));
    }
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ScreenHeader title="AI" before={<AiBadge />}>
        <span className={`${META} ml-auto`}>
          {spend.data &&
            `${usd(spend.data.spent)}${limit !== null ? ` of ${usd(limit)}` : ''} this month`}
        </span>
      </ScreenHeader>

      {spend.data?.paused && (
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
      <p className="px-16 pb-6 text-note text-mute">
        A key is sealed before it is stored. Only its last four characters come back to this screen.
      </p>
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
        {(stored.isPending || chosen.isPending) && <LoadingRows what="models" rows={3} />}
        {chosen.isError && <ErrorState what="the models" onRetry={() => void chosen.refetch()} />}
        {stored.data &&
          chosen.data?.map((choice) => {
            const f: Feature = choice.feature;
            const { name, note } = FEATURES[f];
            const model = modelFor(choice, stored.data);
            const spent = (month.data?.rows ?? [])
              .filter((row) => row.feature === f)
              .reduce((sum, row) => sum + (row.cost ?? 0), 0);
            const failed = choose.isError && choose.variables.feature === f;
            return (
              <TableRow key={f} pad={6} hover={false} className={`${MODEL_COLS} items-center`}>
                <Cell>
                  <div className="font-medium">{name}</div>
                  <div className="text-note text-mute">{note}</div>
                  {model === null && (
                    <div className="text-note text-a3">No model chosen, so this is off.</div>
                  )}
                  <div role="alert" className="text-note text-a3 empty:hidden">
                    {failed && !sessionOver(choose.error) ? reason(choose.error) : null}
                  </div>
                </Cell>
                <Cell>
                  <Select
                    className="w-full"
                    aria-label={`Model for ${name}`}
                    disabled={usable.length === 0 || choose.isPending}
                    value={model ?? ''}
                    onChange={(e) => {
                      // The value is "provider/model"; a model's id may itself hold a slash.
                      const [provider, ...rest] = e.target.value.split('/');
                      choose.mutate({
                        feature: f,
                        provider: provider as Provider,
                        model: rest.join('/'),
                      });
                    }}
                  >
                    <option value="" disabled>
                      {usable.length === 0 ? 'Add a key first' : 'Choose a model'}
                    </option>
                    {usable.map(({ provider: p, models }) => (
                      <optgroup key={p} label={PROVIDERS[p].name}>
                        {models.map((m) => (
                          <option key={m} value={optionOf(p, m)}>
                            {m}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </Cell>
                <Cell className={`${META} text-right`}>{month.data ? usd(spent) : ''}</Cell>
              </TableRow>
            );
          })}
      </Table>

      <SectionLabel as="h2" className={HEADING}>
        Prices
      </SectionLabel>
      <p className="max-w-720 px-16 pb-6 text-note text-pretty text-mute">
        Providers do not say what a model costs anywhere Munim can read it. Enter the price of a
        million tokens for each model in use, from its provider&apos;s pricing page. A model without
        a price still runs, but its cost is not counted and the limit cannot stop it.
      </p>
      <Table label="Prices">
        <TableHeader className={PRICE_COLS}>
          <Th>Model</Th>
          <Th>Input, per 1M tokens</Th>
          <Th>Output, per 1M tokens</Th>
          <Th>
            <span className="sr-only">Actions</span>
          </Th>
        </TableHeader>
        {(chosen.isPending || stored.isPending || prices.isPending) && (
          <LoadingRows what="prices" rows={2} />
        )}
        {prices.isError && <ErrorState what="the prices" onRetry={() => void prices.refetch()} />}
        {prices.data &&
          inUse.map(({ provider, model }) => {
            if (!provider || !model) return null;
            const saved = prices.data.find((p) => p.provider === provider && p.model === model);
            return (
              <PriceRow
                // Made again when its price is saved, so the fields show what the server holds.
                key={`${provider}/${model}/${String(saved?.input)}/${String(saved?.output)}`}
                provider={provider}
                model={model}
                saved={saved}
              />
            );
          })}
        {prices.data && chosen.data && stored.data && inUse.length === 0 && (
          <div role="row">
            <Cell className="px-16 py-dn-6 text-mute">{EMPTY.prices}</Cell>
          </div>
        )}
      </Table>

      <SectionLabel as="h2" className={HEADING}>
        Monthly limit
      </SectionLabel>
      {spend.isPending && <LoadingRows what="the limit" rows={1} />}
      {spend.isError && <ErrorState what="the limit" onRetry={() => void spend.refetch()} />}
      {spend.data && (
        <div className="flex items-center gap-12 border-y border-rule px-16 py-dn-6">
          <Toggle
            on={limit !== null}
            label="Monthly limit"
            onChange={(on) => {
              setLimit.mutate(on ? (isAmount(limitShown) ? Number(limitShown) : 10) : null);
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
              disabled={limit === null}
              value={limitShown}
              onChange={(e) => {
                setLimitText(e.target.value);
              }}
              // Half-typed or negative input is not sent; the last limit stays in force.
              onBlur={commitLimit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitLimit();
              }}
            />
          </div>
          <span className="text-note text-mute">
            {limit === null
              ? 'No limit. AI keeps running whatever it costs.'
              : "AI pauses when this month's cost reaches the limit."}
          </span>
          <span role="alert" className="text-note text-a3 empty:hidden">
            {setLimit.isError && !sessionOver(setLimit.error) ? reason(setLimit.error) : null}
          </span>
        </div>
      )}

      <div className={`${HEADING} flex items-center gap-6`}>
        <SectionLabel as="h2" className="mr-8">
          Usage
        </SectionLabel>
        {(Object.keys(PERIODS) as Period[]).map((p) => (
          <Chip
            key={p}
            on={period === p}
            onClick={() => {
              setPeriod(p);
            }}
          >
            {PERIODS[p]}
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
          <Th className="text-right">Cost</Th>
        </TableHeader>
        {usage.isPending && <LoadingRows what="usage" rows={3} />}
        {usage.isError && <ErrorState what="the usage" onRetry={() => void usage.refetch()} />}
        {usage.data?.rows.map((r) => (
          <TableRow
            key={r.feature + r.model}
            pad={4}
            hover={false}
            className={`${USAGE_COLS} items-baseline`}
          >
            <Cell>{FEATURES[r.feature].name}</Cell>
            <Cell className={META}>{r.model}</Cell>
            <Cell className={`${META} text-right`}>{r.requests.toLocaleString('en-US')}</Cell>
            <Cell className={`${META} text-right`}>{r.tokens_in.toLocaleString('en-US')}</Cell>
            <Cell className={`${META} text-right`}>{r.tokens_out.toLocaleString('en-US')}</Cell>
            <Cell className={`${META} text-right`}>
              {r.cost === null ? 'No price' : usd(r.cost)}
            </Cell>
          </TableRow>
        ))}
        {usage.data?.rows.length === 0 && (
          <div role="row">
            <Cell className="px-16 py-dn-4 text-mute">{EMPTY.usage}</Cell>
          </div>
        )}
        {usage.data && usage.data.rows.length > 0 && (
          <TableRow pad={4} hover={false} className={`${USAGE_COLS} items-baseline`}>
            <Cell className="font-semibold">Total</Cell>
            <Cell />
            <Cell />
            <Cell />
            <Cell />
            <Cell className="text-right font-mono text-meta font-medium">
              {usd(usage.data.cost)}
            </Cell>
          </TableRow>
        )}
      </Table>
      <p className="px-16 py-10 text-note text-mute">
        A call costs its tokens at the price entered for its model when the call was made.
      </p>
    </main>
  );
}

/** One model in use and its price: two amounts and Save, which is offered once they differ
 * from what is stored. */
function PriceRow({
  provider,
  model,
  saved,
}: {
  provider: Provider;
  model: string;
  saved: AiPrice | undefined;
}) {
  const queries = useQueryClient();
  const [input, setInput] = useState(saved ? String(saved.input) : '');
  const [output, setOutput] = useState(saved ? String(saved.output) : '');
  const save = useMutation({
    mutationFn: api.setAiPrice,
    onSuccess: () => queries.invalidateQueries({ queryKey: ['ai-prices'] }),
  });
  const ready =
    isAmount(input) &&
    isAmount(output) &&
    (Number(input) !== saved?.input || Number(output) !== saved.output);
  const form = `price-${provider}-${model}`;
  const field = (label: string, value: string, set: (text: string) => void) => (
    <div className="flex items-center gap-6 text-mute">
      $
      <Input
        form={form}
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        className="w-90"
        aria-label={`${label} price of ${model}, in dollars for a million tokens`}
        value={value}
        onChange={(e) => {
          set(e.target.value);
        }}
      />
    </div>
  );
  return (
    <TableRow pad={6} hover={false} className={`${PRICE_COLS} items-center`}>
      <Cell>
        <form
          id={form}
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) {
              save.mutate({ provider, model, input: Number(input), output: Number(output) });
            }
          }}
        />
        <div className="truncate font-mono text-sm">{model}</div>
        <div className="text-note text-mute">{PROVIDERS[provider].name}</div>
        {!saved && <div className="text-note text-a3">No price, so its cost is not counted.</div>}
        <div role="alert" className="text-note text-a3 empty:hidden">
          {save.isError && !sessionOver(save.error) ? reason(save.error) : null}
        </div>
      </Cell>
      <Cell>{field('Input', input, setInput)}</Cell>
      <Cell>{field('Output', output, setOutput)}</Cell>
      <Cell className="justify-self-end">
        <Button
          type="submit"
          form={form}
          size="md"
          aria-label={`Save price of ${model}`}
          disabled={!ready || save.isPending}
        >
          Save
        </Button>
      </Cell>
    </TableRow>
  );
}
