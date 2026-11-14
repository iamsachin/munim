import { useOutletContext } from 'react-router';
import { useTheme } from '../settings';
import { ScreenHeader } from '../shell/ScreenHeader';
import type { ShellContext } from '../shell/Shell';
import { MOD } from '../shell/shortcuts';
import { ACCENTS, DENSITIES, THEMES } from '../theme';
import { SectionLabel } from '../ui/atoms';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Swatch } from '../ui/Swatch';
import { Toggle } from '../ui/Toggle';
import { DataCard, DevicesCard, EncryptionCard, Row, SignInCard } from './SecurityCards';

const keys = <T extends object>(o: T) => Object.keys(o) as (keyof T)[];

/*
 * The Encryption card says what this install does, not what the handoff's card claimed. Touch ID
 * and notification previews are dropped (a web app has neither).
 */
export function Settings() {
  const { theme, setTheme } = useTheme();
  const { showShortcuts } = useOutletContext<ShellContext>();

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ScreenHeader title="Security and settings" />
      <div className="grid max-w-980 grid-cols-2 items-start gap-12 p-16">
        <EncryptionCard />
        <SignInCard />
        <DevicesCard />
        <Card className="gap-10">
          <SectionLabel as="h2">Appearance</SectionLabel>
          <div className="flex items-center gap-12">
            <span id="set-theme" className="w-70 text-mute">
              Theme
            </span>
            <div role="group" aria-labelledby="set-theme" className="flex gap-6">
              {keys(THEMES).map((t) => (
                <Chip
                  key={t}
                  on={theme.theme === t}
                  onClick={() => {
                    setTheme({ theme: t });
                  }}
                >
                  {t}
                </Chip>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-12">
            <span id="set-accent" className="w-70 text-mute">
              Accent
            </span>
            <div role="group" aria-labelledby="set-accent" className="flex gap-8">
              {keys(ACCENTS).map((a) => (
                <Swatch
                  key={a}
                  name={a}
                  color={ACCENTS[a]}
                  on={theme.accent === a}
                  onPick={() => {
                    setTheme({ accent: a });
                  }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-12">
            <span id="set-density" className="w-70 text-mute">
              Density
            </span>
            <div role="group" aria-labelledby="set-density" className="flex gap-6">
              {keys(DENSITIES).map((d) => (
                <Chip
                  key={d}
                  on={theme.density === d}
                  onClick={() => {
                    setTheme({ density: d });
                  }}
                >
                  {d}
                </Chip>
              ))}
            </div>
          </div>
        </Card>
        <DataCard />
        <Card className="gap-4">
          <SectionLabel as="h2" className="pb-4">
            Keyboard
          </SectionLabel>
          <Row name="Single-key shortcuts" note="j and k to move, g then a letter to go to a view">
            <Toggle
              on={theme.shortcuts === 'On'}
              label="Single-key shortcuts"
              onChange={(on) => {
                setTheme({ shortcuts: on ? 'On' : 'Off' });
              }}
            />
          </Row>
          <Row name="Shortcut list" note={`Press ? anywhere, or ${MOD} K for commands`}>
            <Button size="md" onClick={showShortcuts}>
              Show
            </Button>
          </Row>
        </Card>
      </div>
    </main>
  );
}
