import AppHeader from '@/components/AppHeader';
import type { ReactNode } from 'react';

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader />
      <main className="flex-grow container mx-auto px-2 sm:px-4 py-6"> {/* Reduced horizontal padding */}
        {children}
      </main>
      <footer className="py-4 text-center text-xs text-muted-foreground border-t border-border">
        Retrospective AI &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
