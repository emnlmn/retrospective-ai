
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { PlusCircle, ArrowRight } from 'lucide-react';
import type { BoardData } from '@/lib/types';
import { INITIAL_COLUMNS_DATA } from '@/lib/types'; // Import INITIAL_COLUMNS_DATA
import { v4 as uuidv4 } from 'uuid'; // Import uuid
import { useLocalStorage } from '@/hooks/useLocalStorage';
import CreateBoardDialog from '@/components/board/CreateBoardDialog';
import { format } from 'date-fns';

// Helper function to safely format dates
const safeFormatDate = (dateString: string | undefined | null): string => {
  if (!dateString) {
    return "Unknown date";
  }
  try {
    const date = new Date(dateString);
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return "Invalid date";
    }
    return format(date, "MMMM d, yyyy 'at' h:mm a");
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid date";
  }
};

export default function HomePage() {
  const [boards, setBoards] = useLocalStorage<BoardData[]>('retrospective-boards', []);
  const [isCreateBoardDialogOpen, setIsCreateBoardDialogOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); 
  }, []);

  if (!mounted) {
    return (
        <div className="space-y-8 animate-pulse">
            <div className="flex justify-between items-center">
                <div className="h-10 bg-muted rounded w-1/3"></div>
                <div className="h-10 bg-primary/80 rounded w-48"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1,2,3].map(i => (
                    <div key={i} className="bg-card shadow-lg rounded-lg p-6 space-y-4 border border-border">
                        <div className="h-6 bg-muted rounded w-3/4"></div>
                        <div className="h-4 bg-muted rounded w-1/2"></div>
                        <div className="h-8 bg-muted rounded w-full"></div>
                        <div className="h-10 bg-primary/80 rounded w-full"></div>
                    </div>
                ))}
            </div>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Your Retrospectives</h1>
        <Button onClick={() => setIsCreateBoardDialogOpen(true)} aria-label="Create new board">
          <PlusCircle className="mr-2 h-5 w-5" /> Create New Board
        </Button>
      </div>

      {boards.length === 0 ? (
        <Card className="text-center py-10 shadow-lg bg-card border border-border">
          <CardHeader>
            <CardTitle className="text-2xl text-muted-foreground">No Boards Yet!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-muted-foreground">Start by creating your first retrospective board.</p>
            <Button onClick={() => setIsCreateBoardDialogOpen(true)} variant="default" size="lg" className="shadow-md hover:shadow-lg transition-shadow">
              <PlusCircle className="mr-2 h-5 w-5" /> Create First Board
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boards.sort((a,b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            if (isNaN(dateA)) return 1; // push invalid dates to the end
            if (isNaN(dateB)) return -1;
            return dateB - dateA;
          }).map((board) => (
            <Card key={board.id} className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col bg-card border border-border">
              <CardHeader>
                <CardTitle className="text-xl truncate font-semibold text-card-foreground">{board.title}</CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Created on {safeFormatDate(board.createdAt)}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-grow">
                <p className="text-sm text-muted-foreground">
                  {Object.values(board.cards || {}).length} card{Object.values(board.cards || {}).length !== 1 ? 's' : ''} across 3 columns.
                </p>
              </CardContent>
              <CardFooter>
                <Button asChild variant="default" className="w-full shadow hover:shadow-md transition-shadow">
                  <Link href={`/boards/${board.id}`}>
                    Open Board <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <CreateBoardDialog
        isOpen={isCreateBoardDialogOpen}
        onClose={() => setIsCreateBoardDialogOpen(false)}
        onBoardCreated={(title: string) => { // Expect title string
          const newBoard: BoardData = {     // Create BoardData object here
            id: uuidv4(),
            title,
            columns: JSON.parse(JSON.stringify(INITIAL_COLUMNS_DATA)),
            cards: {},
            createdAt: new Date().toISOString(),
          };
          setBoards((prevBoards) => [newBoard, ...prevBoards]);
          setIsCreateBoardDialogOpen(false);
        }}
      />
    </div>
  );
}
