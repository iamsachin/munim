import { useTheme } from '../settings';
import { Kbd, SectionLabel } from '../ui/atoms';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { HELP } from './shortcuts';

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  return (
    <Modal label="Keyboard shortcuts" onClose={onClose}>
      <div className="flex max-h-full w-full max-w-760 flex-col gap-12 overflow-y-auto rounded-8 border border-line bg-panel p-14">
        <div className="flex items-center justify-between">
          <h2 className="text-title font-semibold">Keyboard shortcuts</h2>
          <Button onClick={onClose}>Close</Button>
        </div>
        <div className="grid grid-cols-3 items-start gap-16">
          {HELP.map((section) => (
            <section key={section.title}>
              <SectionLabel as="h3" className="pb-4">
                {section.title}
              </SectionLabel>
              {section.rows.map((row) => (
                <div
                  key={row.what}
                  className="flex items-baseline justify-between gap-12 border-b border-rule py-3"
                >
                  <span>{row.what}</span>
                  <span className="flex gap-4">
                    {row.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>
        <p className="text-note text-mute">
          {theme.shortcuts === 'On'
            ? 'Single-key shortcuts can be switched off under Security and settings.'
            : `Single-key shortcuts are switched off. Only the Commands shortcut and Esc work.`}
        </p>
      </div>
    </Modal>
  );
}
