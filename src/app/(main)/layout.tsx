import AppHeader from '@/components/AppHeader';
import type { ReactNode } from 'react';

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <AppHeader />
      <main className="flex-grow container mx-auto px-1 sm:px-2 py-4"> {/* Reduced horizontal and vertical padding */}
        {children}
      </main>
      <footer className="py-2 text-center text-xs text-muted-foreground border-t border-border"> {/* Reduced vertical padding */}
        Retrospective AI &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
