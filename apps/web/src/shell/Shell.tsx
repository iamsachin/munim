import { Outlet } from 'react-router';
import { LockScreen } from '../account/LockScreen';
import { useReader } from '../reader/store';
import { AskBar } from './AskBar';
import { Sidebar } from './Sidebar';

export function Shell() {
  const { state } = useReader();
  return (
    <>
      {/* While locked the app stays mounted, so drafts survive, but cannot be reached or read aloud. */}
      <div
        inert={state.locked}
        className="grid h-screen min-w-920 grid-cols-[200px_minmax(0,1fr)] overflow-hidden"
      >
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-col">
          <AskBar />
          <Outlet />
        </div>
      </div>
      {state.locked && <LockScreen />}
    </>
  );
}
