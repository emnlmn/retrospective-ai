"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import type { BoardData, CardData, ColumnData, ColumnId } from '@/lib/types';
import { DEFAULT_COLUMNS_CONFIG, INITIAL_COLUMNS_DATA } from '@/lib/types';
import { useUser } from '@/contexts/UserProvider';
import BoardColumnClient from '@/components/board/BoardColumnClient';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { suggestActionItems, SuggestActionItemsInput } from '@/ai/flows/suggest-action-items';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export default function BoardPage() {
  const router = useRouter();
  const params = useParams();
  const boardId = params.boardId as string;
  const { user } = useUser();
  const { toast } = useToast();

  const [boards, setBoards] = useLocalStorage<BoardData[]>('retrospective-boards', []);
  const [currentBoard, setCurrentBoard] = useState<BoardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAISuggesting, setIsAISuggesting] = useState(false);

  useEffect(() => {
    const board = boards.find(b => b.id === boardId);
    if (board) {
      // Ensure board has all columns, even if old data structure
      const sanitizedBoard = {
        ...board,
        columns: {
          wentWell: board.columns?.wentWell || INITIAL_COLUMNS_DATA.wentWell,
          toImprove: board.columns?.toImprove || INITIAL_COLUMNS_DATA.toImprove,
          actionItems: board.columns?.actionItems || INITIAL_COLUMNS_DATA.actionItems,
        },
        cards: board.cards || {},
      };
      setCurrentBoard(sanitizedBoard);
    } else if (boards.length > 0) { // Only redirect if boards are loaded and specific board not found
      // router.push('/'); // Board not found
      // toast({ title: "Error", description: "Board not found.", variant: "destructive" });
    }
    setIsLoading(false);
  }, [boardId, boards, router, toast]);

  const updateBoardData = useCallback((updatedBoard: BoardData) => {
    setCurrentBoard(updatedBoard);
    setBoards(prevBoards => 
      prevBoards.map(b => b.id === updatedBoard.id ? updatedBoard : b)
    );
  }, [setBoards]);

  const handleAddCard = (columnId: ColumnId, content: string) => {
    if (!currentBoard || !user) return;
    const newCardId = uuidv4();
    const newCard: CardData = {
      id: newCardId,
      content,
      userId: user.id,
      userName: user.name,
      createdAt: new Date().toISOString(),
      upvotes: [],
      order: (currentBoard.columns[columnId].cardIds.length || 0) + 1,
    };

    const updatedBoard = {
      ...currentBoard,
      cards: {
        ...currentBoard.cards,
        [newCardId]: newCard,
      },
      columns: {
        ...currentBoard.columns,
        [columnId]: {
          ...currentBoard.columns[columnId],
          cardIds: [...currentBoard.columns[columnId].cardIds, newCardId],
        },
      },
    };
    updateBoardData(updatedBoard);
  };

  const handleUpdateCard = (cardId: string, newContent: string) => {
    if (!currentBoard) return;
    const cardToUpdate = currentBoard.cards[cardId];
    if (!cardToUpdate) return;

    const updatedCard = { ...cardToUpdate, content: newContent };
    const updatedBoard = {
      ...currentBoard,
      cards: {
        ...currentBoard.cards,
        [cardId]: updatedCard,
      },
    };
    updateBoardData(updatedBoard);
  };

  const handleDeleteCard = (cardId: string, columnId: ColumnId) => {
    if (!currentBoard) return;
    
    const { [cardId]: _, ...remainingCards } = currentBoard.cards; // Remove card from cards object

    const updatedBoard = {
      ...currentBoard,
      cards: remainingCards,
      columns: {
        ...currentBoard.columns,
        [columnId]: {
          ...currentBoard.columns[columnId],
          cardIds: currentBoard.columns[columnId].cardIds.filter(id => id !== cardId),
        },
      },
    };
    updateBoardData(updatedBoard);
  };

  const handleUpvoteCard = (cardId: string) => {
    if (!currentBoard || !user) return;
    const card = currentBoard.cards[cardId];
    if (!card) return;

    const alreadyUpvoted = card.upvotes.includes(user.id);
    const newUpvotes = alreadyUpvoted 
      ? card.upvotes.filter(uid => uid !== user.id)
      : [...card.upvotes, user.id];
    
    const updatedCard = { ...card, upvotes: newUpvotes };
    const updatedBoard = {
      ...currentBoard,
      cards: {
        ...currentBoard.cards,
        [cardId]: updatedCard,
      },
    };
    updateBoardData(updatedBoard);
  };

  const handleDragEnd = (draggedCardId: string, sourceColumnId: ColumnId, destColumnId: ColumnId, destinationIndex: number) => {
    if (!currentBoard || !draggedCardId) return;

    let updatedBoard = { ...currentBoard };
    const draggedCard = updatedBoard.cards[draggedCardId];
    if (!draggedCard) return;

    // Remove from source column
    const sourceCardIds = [...updatedBoard.columns[sourceColumnId].cardIds];
    sourceCardIds.splice(sourceCardIds.indexOf(draggedCardId), 1);
    updatedBoard.columns[sourceColumnId].cardIds = sourceCardIds;

    // Add to destination column
    const destCardIds = [...updatedBoard.columns[destColumnId].cardIds];
    destCardIds.splice(destinationIndex, 0, draggedCardId);
    updatedBoard.columns[destColumnId].cardIds = destCardIds;
    
    // Re-order cards in destination column
    destCardIds.forEach((id, index) => {
      if(updatedBoard.cards[id]) {
        updatedBoard.cards[id].order = index + 1;
      }
    });
    // Re-order cards in source column if different
    if (sourceColumnId !== destColumnId) {
      sourceCardIds.forEach((id, index) => {
        if(updatedBoard.cards[id]) {
          updatedBoard.cards[id].order = index + 1;
        }
      });
    }
    updateBoardData(updatedBoard);
  };

  const handleAISuggestions = async () => {
    if (!currentBoard || !user) return;
    setIsAISuggesting(true);
    try {
      const toImproveCardsContent = currentBoard.columns.toImprove.cardIds
        .map(cardId => currentBoard.cards[cardId]?.content)
        .filter(content => !!content)
        .join('\n- ');
      
      if (!toImproveCardsContent.trim()) {
        toast({ title: "AI Suggestions", description: "Add some items to the 'To Improve' column first.", variant: "default" });
        setIsAISuggesting(false);
        return;
      }

      const input: SuggestActionItemsInput = { toImproveColumnContent: `- ${toImproveCardsContent}` };
      const result = await suggestActionItems(input);

      if (result.actionItems && result.actionItems.length > 0) {
        let boardAfterAISuggestions = { ...currentBoard };
        result.actionItems.forEach(itemContent => {
          const newCardId = uuidv4();
          const newCard: CardData = {
            id: newCardId,
            content: itemContent,
            userId: user.id, // Or a generic AI user? For now, current user
            userName: `${user.name} (AI Suggested)`,
            createdAt: new Date().toISOString(),
            upvotes: [],
            order: (boardAfterAISuggestions.columns.actionItems.cardIds.length || 0) + 1,
          };
          boardAfterAISuggestions = {
            ...boardAfterAISuggestions,
            cards: { ...boardAfterAISuggestions.cards, [newCardId]: newCard },
            columns: {
              ...boardAfterAISuggestions.columns,
              actionItems: {
                ...boardAfterAISuggestions.columns.actionItems,
                cardIds: [...boardAfterAISuggestions.columns.actionItems.cardIds, newCardId],
              },
            },
          };
        });
        updateBoardData(boardAfterAISuggestions);
        toast({ title: "AI Suggestions Added", description: `${result.actionItems.length} action items added to the 'Action Items' column.` });
      } else {
        toast({ title: "AI Suggestions", description: "No action items were suggested." });
      }
    } catch (error) {
      console.error("AI suggestion error:", error);
      toast({ title: "AI Error", description: "Could not get AI suggestions.", variant: "destructive" });
    }
    setIsAISuggesting(false);
  };


  if (isLoading) return <div className="text-center py-10">Loading board...</div>;
  if (!currentBoard) return <div className="text-center py-10">Board not found. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;

  const columnIds = Object.keys(DEFAULT_COLUMNS_CONFIG) as ColumnId[];

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" asChild aria-label="Back to boards">
                <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-foreground truncate" title={currentBoard.title}>
            {currentBoard.title}
            </h1>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={isAISuggesting}>
              <Wand2 className="mr-2 h-5 w-5" /> {isAISuggesting ? 'Generating...' : 'Suggest Action Items (AI)'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Use AI to Suggest Action Items?</AlertDialogTitle>
              <AlertDialogDescription>
                This will analyze the items in the "To Improve" column and suggest actionable steps. New cards will be added to the "Action Items" column.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleAISuggestions} disabled={isAISuggesting}>
                {isAISuggesting ? 'Generating...' : 'Proceed'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <ScrollArea className="flex-grow pb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-w-[900px] md:min-w-full">
          {columnIds.map(columnId => (
            <BoardColumnClient
              key={columnId}
              columnId={columnId}
              title={DEFAULT_COLUMNS_CONFIG[columnId].title}
              cards={currentBoard.columns[columnId].cardIds.map(id => currentBoard.cards[id]).filter(Boolean).sort((a,b) => a.order - b.order)}
              onAddCard={handleAddCard}
              onUpdateCard={handleUpdateCard}
              onDeleteCard={handleDeleteCard}
              onUpvoteCard={handleUpvoteCard}
              onDragEnd={handleDragEnd}
              currentUserId={user?.id || ''}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
