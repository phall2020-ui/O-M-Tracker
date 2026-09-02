'use client';

import { Bell, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon">
            <Bell className="h-5 w-5 text-gray-500" />
          </Button>
          <Button variant="ghost" size="icon">
            <User className="h-5 w-5 text-gray-500" />
          </Button>
        </div>
      </div>
    </header>
  );
}
