'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = pathname !== '/login';

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      {children}
    </div>
  );
}
