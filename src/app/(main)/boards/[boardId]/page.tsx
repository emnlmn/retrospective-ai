
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
      const sanitizedBoard = {
        ...board,
        columns: {
          wentWell: board.columns?.wentWell || INITIAL_COLUMNS_DATA.wentWell,
          toImprove: board.columns?.toImprove || INITIAL_COLUMNS_DATA.toImprove,
          actionItems: board.columns?.actionItems || INITIAL_COLUMNS_DATA.actionItems,
        },
        cards: board.cards || {},
      };
      // Ensure all cards have an order property, defaulting if necessary
      Object.values(sanitizedBoard.cards).forEach(card => {
        if (card.order === undefined) {
          // Try to find its order from column, or default to 0
          let foundOrder: number | undefined = undefined;
          for (const col of Object.values(sanitizedBoard.columns)) {
            const index = col.cardIds.indexOf(card.id);
            if (index !== -1) {
              foundOrder = index;
              break;
            }
          }
          card.order = foundOrder !== undefined ? foundOrder : 0;
        }
      });
      setCurrentBoard(sanitizedBoard);
    } else if (boards.length > 0 && !isLoading) { 
      // Only show toast if not loading and boards are present (meaning boardId was likely invalid)
      // toast({ title: "Error", description: "Board not found.", variant: "destructive" });
      // router.push('/'); // Optional: redirect if board not found
    }
    setIsLoading(false);
  }, [boardId, boards, isLoading, router, toast]);

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
      // New cards are added at the beginning, so order 0
      order: 0, 
    };

    const newCardsRecord = {
      ...currentBoard.cards,
      [newCardId]: newCard,
    };

    const newColumnCardIds = [newCardId, ...currentBoard.columns[columnId].cardIds];

    // Re-order all cards in the affected column
    newColumnCardIds.forEach((cardId, index) => {
      if (newCardsRecord[cardId]) {
        newCardsRecord[cardId] = { ...newCardsRecord[cardId], order: index };
      }
    });
    
    const updatedBoard: BoardData = {
      ...currentBoard,
      cards: newCardsRecord,
      columns: {
        ...currentBoard.columns,
        [columnId]: {
          ...currentBoard.columns[columnId],
          cardIds: newColumnCardIds,
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
    
    const { [cardId]: _, ...remainingCards } = currentBoard.cards; 
    const newColumnCardIds = currentBoard.columns[columnId].cardIds.filter(id => id !== cardId);

    // Re-order remaining cards in the column
    newColumnCardIds.forEach((id, index) => {
      if (remainingCards[id]) {
        remainingCards[id] = { ...remainingCards[id], order: index };
      }
    });

    const updatedBoard = {
      ...currentBoard,
      cards: remainingCards,
      columns: {
        ...currentBoard.columns,
        [columnId]: {
          ...currentBoard.columns[columnId],
          cardIds: newColumnCardIds,
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

    const cardToMove = currentBoard.cards[draggedCardId];
    if (!cardToMove) {
      console.error("Dragged card not found in currentBoard.cards");
      return;
    }

    // Create new cardId arrays for source and destination columns
    let newSourceCardIds = [...currentBoard.columns[sourceColumnId].cardIds];
    const dragIndexInSource = newSourceCardIds.indexOf(draggedCardId);

    if (dragIndexInSource > -1) {
      newSourceCardIds.splice(dragIndexInSource, 1);
    } else {
      console.error("Dragged card not found in source column's cardIds. This might happen if source and dest are the same and list was already modified.");
      // If source and dest are same, this might be okay if newSourceCardIds was already the "spliced" version.
      // For robustness, we ensure it's removed if it exists.
      if (sourceColumnId !== destColumnId) return; // If different columns and not found, it's an error.
    }
    
    let newDestCardIds: string[];
    if (sourceColumnId === destColumnId) {
      // If dragging within the same column, newSourceCardIds is already the list with the card removed.
      // We need to insert it at the destinationIndex.
      newDestCardIds = [...newSourceCardIds]; // Create a new array from the modified source
      newDestCardIds.splice(destinationIndex, 0, draggedCardId);
    } else {
      // If dragging to a different column, start with the destination's current cardIds.
      newDestCardIds = [...currentBoard.columns[destColumnId].cardIds];
      newDestCardIds.splice(destinationIndex, 0, draggedCardId);
    }

    // Create a new 'cards' record and update order for affected cards
    const newCardsRecord: Record<string, CardData> = { ...currentBoard.cards };

    // Update order for cards in destination column
    newDestCardIds.forEach((cardId, index) => {
      if (newCardsRecord[cardId]) {
        newCardsRecord[cardId] = { ...newCardsRecord[cardId], order: index };
      }
    });

    // If source and destination are different, update order for cards in source column
    if (sourceColumnId !== destColumnId) {
      newSourceCardIds.forEach((cardId, index) => {
        if (newCardsRecord[cardId]) {
          newCardsRecord[cardId] = { ...newCardsRecord[cardId], order: index };
        }
      });
    }
    // If source and destination are the same, newDestCardIds loop has already updated orders for all cards in that column.

    const updatedBoard: BoardData = {
      ...currentBoard,
      cards: newCardsRecord,
      columns: {
        ...currentBoard.columns,
        [sourceColumnId]: {
          ...currentBoard.columns[sourceColumnId],
          cardIds: newSourceCardIds,
        },
        [destColumnId]: {
          ...currentBoard.columns[destColumnId],
          cardIds: newDestCardIds,
        },
      },
    };
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
        // Batch add AI suggestions
        let tempNewCardsRecord = { ...currentBoard.cards };
        let tempNewActionItemCardIds = [...currentBoard.columns.actionItems.cardIds];

        result.actionItems.forEach(itemContent => {
          const newCardId = uuidv4();
          const newCard: CardData = {
            id: newCardId,
            content: itemContent,
            userId: user.id, 
            userName: `${user.name} (AI Suggested)`,
            createdAt: new Date().toISOString(),
            upvotes: [],
            order: 0, // Will be set below
          };
          tempNewCardsRecord[newCardId] = newCard;
          tempNewActionItemCardIds.unshift(newCardId); // Add to beginning
        });

        // Re-order all cards in actionItems column
        tempNewActionItemCardIds.forEach((cardId, index) => {
          if (tempNewCardsRecord[cardId]) {
            tempNewCardsRecord[cardId] = { ...tempNewCardsRecord[cardId], order: index };
          }
        });
        
        const boardAfterAISuggestions: BoardData = {
          ...currentBoard,
          cards: tempNewCardsRecord,
          columns: {
            ...currentBoard.columns,
            actionItems: {
              ...currentBoard.columns.actionItems,
              cardIds: tempNewActionItemCardIds,
            },
          },
        };
        updateBoardData(boardAfterAISuggestions);
        toast({ title: "AI Suggestions Added", description: `${result.actionItems.length} action items added.` });
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
    <div className="h-full flex flex-col space-y-3">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" asChild aria-label="Back to boards">
                <Link href="/"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground truncate" title={currentBoard.title}>
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

      <ScrollArea className="flex-grow -mx-1">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 min-w-[1200px] md:min-w-full px-1">
          {columnIds.map(columnId => (
            <BoardColumnClient
              key={columnId}
              columnId={columnId}
              title={DEFAULT_COLUMNS_CONFIG[columnId].title}
              cards={(currentBoard.columns[columnId]?.cardIds || [])
                .map(id => currentBoard.cards[id])
                .filter((card): card is CardData => !!card) // Type guard
                .sort((a,b) => (a.order || 0) - (b.order || 0))}
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

