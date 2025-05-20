
"use client";

import type { User } from '@/lib/types';
import { useBoardStore, useBoardActions } from '@/store/boardStore';
import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import UserSetupDialog from '@/components/UserSetupDialog';

// This context is now primarily for managing the UserSetupDialog visibility
interface UserDialogContextType {
  showUserSetupDialog: boolean;
  setShowUserSetupDialog: (show: boolean) => void;
  handleUserSubmit: (name: string) => void;
}

const UserDialogContext = createContext<UserDialogContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { user, isUserLoading, isBoardsLoading } = useBoardStore((state) => ({
    user: state.user,
    isUserLoading: state.isUserLoading,
    isBoardsLoading: state.isBoardsLoading,
  }));
  const { setUser, loadInitialUserAndBoards } = useBoardActions();
  const [showUserSetupDialog, setShowUserSetupDialog] = useState(false);

  useEffect(() => {
    // Load user from localStorage (via Zustand persist) and then fetch boards
    loadInitialUserAndBoards();
  }, [loadInitialUserAndBoards]);

  useEffect(() => {
    // This effect runs after loadInitialUserAndBoards has potentially set the user
    // and updated isUserLoading.
    if (!isUserLoading && !user) {
      setShowUserSetupDialog(true);
    } else if (user) {
      setShowUserSetupDialog(false);
    }
  }, [user, isUserLoading]);

  const handleUserSubmit = (name: string) => {
    setUser(name); // This updates Zustand store, which persists user to localStorage
    setShowUserSetupDialog(false);
    // After setting user, re-fetch boards in case they are user-specific (though not in current API)
    // or just to ensure a fresh state if this is the very first app load.
    // loadInitialUserAndBoards will handle this.
  };

  // Display loading indicator while user or boards are loading
  if (isUserLoading || (user && isBoardsLoading)) { // Show loading if user exists and boards are loading
    return <div className="flex items-center justify-center h-screen"><p>Loading app data...</p></div>;
  }
  
  return (
    <UserDialogContext.Provider value={{ showUserSetupDialog, setShowUserSetupDialog, handleUserSubmit }}>
      {showUserSetupDialog && <UserSetupDialog onSubmit={handleUserSubmit} />}
      {!showUserSetupDialog && user && children}
      {/* Fallback if user is null and dialog isn't shown (should be rare after initial load) */}
      {!isUserLoading && !user && !showUserSetupDialog && (
          <div className="flex items-center justify-center h-screen"><p>Please set up your user profile.</p></div>
      )}
    </UserDialogContext.Provider>
  );
}

export function useUserDialog() {
  const context = useContext(UserDialogContext);
  if (context === undefined) {
    throw new Error('useUserDialog must be used within a UserProvider');
  }
  return context;
}
