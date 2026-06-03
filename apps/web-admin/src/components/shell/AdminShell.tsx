import { Sidebar } from './Sidebar';

/**
 * Persistent shell wrapping every admin page.
 * Pages render their own Topbar (with screen-specific title/subtitle).
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
