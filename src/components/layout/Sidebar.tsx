'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { LogOut, Menu, Sun, X } from 'lucide-react';
import { ClientRole, useCurrentUser } from '@/lib/use-current-user';
import { navigationHrefWithContract, visibleNavigationForRole } from '@/lib/navigation';
import { ContractSelector } from '@/components/contracts/ContractSelector';

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (pathname === '/login') {
    return null;
  }

  const visibleNavigation = visibleNavigationForRole(user?.role as ClientRole | undefined);
  const groups = ['Portfolio', 'Operations'] as const;
  const contractQuery = searchParams.get('contract');

  const closeMobileNav = () => setIsMobileOpen(false);

  return (
    <>
      <header className="mobile-topbar">
        <div className="logo">
          <div className="logo-icon">
            <Sun className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="logo-text">O&M Tracker</span>
            <span className="logo-sub">AMPYR DE</span>
          </div>
        </div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label={isMobileOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={isMobileOpen}
          onClick={() => setIsMobileOpen((value) => !value)}
        >
          {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {isMobileOpen && <button className="mobile-nav-backdrop" aria-label="Close navigation" onClick={closeMobileNav} />}
      <div className={cn('sidebar', isMobileOpen && 'open')}>
        {/* Logo */}
        <div className="logo sidebar-logo">
          <div className="logo-icon">
            <Sun className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="logo-text">O&M Tracker</span>
            <span className="logo-sub">AMPYR DE</span>
          </div>
        </div>
        <ContractSelector />

        {/* Navigation */}
        <nav className="nav">
          {groups.map((group) => {
            const groupItems = visibleNavigation.filter((item) => item.group === group);
            if (groupItems.length === 0) return null;

            return (
              <div className="nav-group" key={group}>
                <span className="nav-heading">{group}</span>
                {groupItems.map((item) => {
                  const href = navigationHrefWithContract(item.href, contractQuery);
                  const isActive = pathname === item.href ||
                    (item.href !== '/' && pathname.startsWith(item.href));

                  return (
                    <Link
                      key={item.name}
                      href={href}
                      className={cn('nav-item', isActive && 'active')}
                      onClick={closeMobileNav}
                    >
                      <item.icon className="nav-icon" />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="nav-item w-full"
            style={{ marginBottom: '8px' }}
          >
            <LogOut className="nav-icon" />
            Sign Out
          </button>
          <p>Portfolio Tracker v2.0</p>
        </div>
      </div>
    </>
  );
}
