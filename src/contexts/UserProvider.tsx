
"use client";

import type { User } from '@/lib/types';
import { useBoardStore } from '@/store/boardStore';
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
  const { user, isUserLoading, actions } = useBoardStore();
  const [showUserSetupDialog, setShowUserSetupDialog] = useState(false);

  useEffect(() => {
    actions.loadInitialUser();
  }, [actions]);

  useEffect(() => {
    if (!isUserLoading && !user) {
      setShowUserSetupDialog(true);
    } else if (user) {
      setShowUserSetupDialog(false);
    }
  }, [user, isUserLoading]);

  const handleUserSubmit = (name: string) => {
    actions.setUser(name);
    setShowUserSetupDialog(false);
  };

  if (isUserLoading) {
    return <div className="flex items-center justify-center h-screen"><p>Loading user...</p></div>;
  }
  
  // If user is loaded but null, and dialog isn't forced open yet, it will be by the effect above.
  // This ensures children are only rendered if user exists or dialog is about to handle it.

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

// This hook is now specific for dialog control if needed elsewhere, user data comes from useBoardStore
export function useUserDialog() {
  const context = useContext(UserDialogContext);
  if (context === undefined) {
    throw new Error('useUserDialog must be used within a UserProvider');
  }
  return context;
}

// For accessing user data, components should directly use useBoardStore:
// const { user } = useBoardStore();
