import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { IDLE_TICK_MS, idleStep } from '../account/auth';
import { LockScreen } from '../account/LockScreen';
import { useSession } from '../account/session';
import { api } from '../api/client';
import { SelectionHighlight } from '../reader/SelectionHighlight';
import { useTheme } from '../settings';
import { AskBar } from './AskBar';
import { focusId, shortcutKey } from './keys';
import { Palette } from './Palette';
import { ShortcutHelp } from './ShortcutHelp';
import { GO } from './shortcuts';
import { Sidebar } from './Sidebar';

/** What screens can ask of the shell, through the router's outlet context. */
export interface ShellContext {
  showShortcuts: () => void;
}

/** How long "g" waits for the key that follows it. */
const GO_WAIT_MS = 1500;

export function Shell() {
  const session = useSession();
  const locked = session.state === 'locked';
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [overlay, setOverlay] = useState<'palette' | 'help' | null>(null);
  const going = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    // The commands shortcut works even while typing, but not on top of another dialog.
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      if (document.querySelector('dialog[open]')) return;
      e.preventDefault();
      setOverlay('palette');
      return;
    }
    const key = shortcutKey(e);
    if (key === null || theme.shortcuts === 'Off') return;

    if (going.current !== null) {
      // Second key of "g, then a letter". It is used up here so the screen does not also act on it.
      clearTimeout(going.current);
      going.current = null;
      e.preventDefault();
      e.stopImmediatePropagation();
      const destination = Object.hasOwn(GO, key) ? GO[key] : undefined;
      if (destination) void navigate(destination.to);
      return;
    }
    if (key === 'g') {
      e.stopImmediatePropagation();
      going.current = setTimeout(() => {
        going.current = null;
      }, GO_WAIT_MS);
    } else if (key === '?') {
      e.preventDefault();
      setOverlay('help');
    } else if (key === '/') {
      e.preventDefault();
      focusId('ask-bar');
    }
  });

  // Capture phase, so "g, then a letter" is settled before a screen sees the letter.
  useEffect(() => {
    if (locked) return;
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (going.current !== null) clearTimeout(going.current);
      going.current = null;
    };
  }, [locked]);

  // The idle lock. The server judges idleness by its own clock; this keeps the screen in step
  // with it, and tells the server about activity that makes no API calls of its own.
  const { lockMinutes, noSignIn, set: setSession, refused } = session;
  useEffect(() => {
    // Where sign-in is switched off there is nothing to lock.
    if (session.state !== 'open' || lockMinutes === undefined || noSignIn) return;
    let lastActivity = Date.now();
    let lastReport = Date.now();
    const touched = () => {
      lastActivity = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'wheel'] as const;
    for (const e of events) document.addEventListener(e, touched, { passive: true });
    const timer = setInterval(() => {
      const now = Date.now();
      const step = idleStep(now, lastActivity, lastReport, lockMinutes);
      if (step === 'lock') {
        void api.lock().catch(() => undefined);
        setSession('locked');
      } else if (step === 'report') {
        lastReport = now;
        void api.active().catch(refused);
      }
    }, IDLE_TICK_MS);
    return () => {
      clearInterval(timer);
      for (const e of events) document.removeEventListener(e, touched);
    };
  }, [session.state, lockMinutes, noSignIn, setSession, refused]);

  const close = () => {
    setOverlay(null);
  };
  const showShortcuts = () => {
    setOverlay('help');
  };
  const context: ShellContext = { showShortcuts };

  return (
    <>
      {/* While locked the app stays mounted, so drafts survive, but cannot be reached or read aloud. */}
      <div
        inert={locked}
        className="grid h-screen min-w-920 grid-cols-[200px_minmax(0,1fr)] overflow-hidden"
      >
        <Sidebar
          onCommands={() => {
            setOverlay('palette');
          }}
        />
        <div className="flex min-h-0 min-w-0 flex-col">
          <AskBar />
          <Outlet context={context} />
        </div>
      </div>
      {!locked && <SelectionHighlight />}
      {locked && <LockScreen />}
      {!locked && overlay === 'palette' && <Palette onClose={close} onHelp={showShortcuts} />}
      {!locked && overlay === 'help' && <ShortcutHelp onClose={close} />}
    </>
  );
}
