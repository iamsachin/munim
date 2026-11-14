import { Outlet } from 'react-router';
import { AskBar } from './AskBar';
import { Sidebar } from './Sidebar';

export function Shell() {
  return (
    <div className="grid h-screen min-w-920 grid-cols-[200px_minmax(0,1fr)] overflow-hidden">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-col">
        <AskBar />
        <Outlet />
      </div>
    </div>
  );
}
