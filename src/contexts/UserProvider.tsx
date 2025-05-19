"use client";

import type { User } from '@/lib/types';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { v4 as uuidv4 } from 'uuid'; // Needs npm install uuid @types/uuid
import UserSetupDialog from '@/components/UserSetupDialog';

interface UserContextType {
  user: User | null;
  setUserDetails: (name: string) => void;
  isLoading: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUserInStorage] = useLocalStorage<User | null>('retrospective-user', null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('retrospective-user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        if(parsedUser && parsedUser.id && parsedUser.name) {
           // Directly use this if valid to avoid hook delay if not needed
        } else {
          setShowDialog(true);
        }
      } catch (e) {
        setShowDialog(true); // Corrupted data
      }
    } else {
      setShowDialog(true);
    }
    setIsLoading(false);
  }, []);
  
  useEffect(() => {
    // Sync local state with localStorage state, needed if useLocalStorage updates from another tab
    if (!isLoading && !user) {
      setShowDialog(true);
    } else if (user) {
      setShowDialog(false);
    }
  }, [user, isLoading]);


  const setUserDetails = (name: string) => {
    const newUser: User = { id: user?.id || uuidv4(), name };
    setUserInStorage(newUser);
    setShowDialog(false);
  };
  
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen"><p>Loading user...</p></div>;
  }

  return (
    <UserContext.Provider value={{ user, setUserDetails, isLoading }}>
      {showDialog && <UserSetupDialog onSubmit={setUserDetails} />}
      {!showDialog && user && children}
      {/* Fallback if somehow dialog isn't shown but user is null */}
      {!showDialog && !user && <div className="flex items-center justify-center h-screen"><p>Please set up your user profile.</p></div>}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
