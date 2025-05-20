
"use client";

import { useBoardStore } from '@/store/boardStore';
import { UserCircle } from 'lucide-react';
import Link from 'next/link';

export default function AppHeader() {
  const user = useBoardStore((state) => state.user);

  return (
    <header className="bg-card border-b border-border shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-primary hover:opacity-80 transition-opacity">
          Retrospective AI
        </Link>
        {user && (
          <div className="flex items-center gap-2 text-sm text-foreground">
            <UserCircle className="w-5 h-5 text-muted-foreground" />
            <span>{user.name}</span>
          </div>
        )}
      </div>
    </header>
  );
}
