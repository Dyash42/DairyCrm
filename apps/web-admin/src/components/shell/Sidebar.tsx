'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Route as RouteIcon,
  Users,
  UserCog,
  Receipt,
  Settings,
  Droplet,
  LogOut,
  Megaphone,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth-context';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const OPERATIONS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/routes', label: 'Routes', icon: RouteIcon },
  { href: '/customers', label: 'Customers', icon: Users },
];

const MANAGE: NavItem[] = [
  { href: '/executives', label: 'Executives', icon: UserCog },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/broadcasts', label: 'Broadcasts', icon: Megaphone },
  { href: '/billing', label: 'Billing', icon: Receipt },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive =
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 h-10 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-white/10 text-white'
          : 'text-white/70 hover:bg-white/5 hover:text-white',
      )}
    >
      <Icon size={18} />
      <span>{item.label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 mt-6 mb-2 text-[11px] uppercase tracking-wider text-white/40 font-semibold">
      {children}
    </div>
  );
}

export function Sidebar() {
  const { user, logout } = useAuth();
  const displayName = user?.name ?? 'Anil Das';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <aside className="w-60 shrink-0 bg-brand text-white flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="px-5 py-6 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
          <Droplet size={20} className="text-white" />
        </div>
        <div>
          <div className="text-base font-semibold leading-tight">Jharanai</div>
          <div className="text-[10px] uppercase tracking-widest text-white/50">
            Ops Console
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3 flex-1 overflow-y-auto">
        <SectionLabel>Operations</SectionLabel>
        <div className="space-y-1">
          {OPERATIONS.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>

        <SectionLabel>Manage</SectionLabel>
        <div className="space-y-1">
          {MANAGE.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
        </div>
      </nav>

      {/* User profile pinned bottom */}
      <div className="m-3 p-3 rounded-xl bg-white/5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-accent-light text-brand font-semibold flex items-center justify-center text-sm">
          {initials || 'AD'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{displayName}</div>
          <div className="text-[11px] text-white/60 truncate">
            Operations Admin
          </div>
        </div>
        <button
          aria-label="Sign out"
          onClick={logout}
          className="text-white/60 hover:text-white p-1.5 rounded-md hover:bg-white/10"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
