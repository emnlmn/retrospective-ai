
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
      // We now trust that card.order is always set correctly by manipulation functions.
      setCurrentBoard(sanitizedBoard);
    } else if (boards.length > 0 && !isLoading) { 
      // toast({ title: "Error", description: "Board not found.", variant: "destructive" });
      // router.push('/'); 
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
      order: 0, // Will be at the top, order re-calculated below
    };

    const newCardsRecord = {
      ...currentBoard.cards,
      [newCardId]: newCard,
    };
    const newColumnCardIds = [newCardId, ...currentBoard.columns[columnId].cardIds];

    // Update order for all cards in the affected column
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
    
    const { [cardId]: _, ...remainingCardsRest } = currentBoard.cards; 
    const remainingCards = { ...remainingCardsRest }; 
    const newColumnCardIds = currentBoard.columns[columnId].cardIds.filter(id => id !== cardId);

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

  const handleDragEnd = (draggedCardId: string, sourceColumnId: ColumnId, destColumnId: ColumnId, destinationIndexInDropTarget: number) => {
    if (!currentBoard || !draggedCardId) return;

    const boardCopy: BoardData = JSON.parse(JSON.stringify(currentBoard)); 
    const cardToMove = boardCopy.cards[draggedCardId];

    if (!cardToMove) {
        console.error("Dragged card not found in board copy.");
        return;
    }

    const sourceCol = boardCopy.columns[sourceColumnId];
    const destCol = boardCopy.columns[destColumnId];

    // Remove card from source column's cardIds array
    const sourceCardIndex = sourceCol.cardIds.indexOf(draggedCardId);
    if (sourceCardIndex > -1) {
        sourceCol.cardIds.splice(sourceCardIndex, 1);
    } else {
        console.warn(`Card ${draggedCardId} not found in source column ${sourceColumnId} cardIds during removal.`);
    }

    // Determine the actual destination index for splice
    let effectiveDestinationIndex = destinationIndexInDropTarget;

    if (sourceColumnId === destColumnId) {
        // If dragging within the same column:
        // The destinationIndexInDropTarget is relative to the list *before* the card was removed.
        // If the card was removed from an index *before* its target destinationIndex,
        // then the target index in the "list-with-item-removed" is one less.
        if (sourceCardIndex > -1 && sourceCardIndex < destinationIndexInDropTarget) {
            effectiveDestinationIndex = destinationIndexInDropTarget - 1;
        }
    }
    
    // Ensure the index is within the bounds of the destination column's cardIds array
    effectiveDestinationIndex = Math.max(0, Math.min(effectiveDestinationIndex, destCol.cardIds.length));
    
    // Add card to destination column's cardIds array at the effective index
    destCol.cardIds.splice(effectiveDestinationIndex, 0, draggedCardId);

    // Update 'order' property for all cards in the destination column
    destCol.cardIds.forEach((cardId, index) => {
        if (boardCopy.cards[cardId]) {
            boardCopy.cards[cardId].order = index;
        }
    });

    // If source and destination columns are different, also update 'order' for cards in the source column
    if (sourceColumnId !== destColumnId) {
        sourceCol.cardIds.forEach((cardId, index) => {
            if (boardCopy.cards[cardId]) {
                boardCopy.cards[cardId].order = index;
            }
        });
    }
    // Update the card that was moved with its new order in its new column
    if (boardCopy.cards[draggedCardId]) {
      boardCopy.cards[draggedCardId].order = destCol.cardIds.indexOf(draggedCardId);
    }

    updateBoardData(boardCopy);
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
        let tempBoardCopy = JSON.parse(JSON.stringify(currentBoard)) as BoardData;

        result.actionItems.forEach(itemContent => {
          const newCardId = uuidv4();
          const newCard: CardData = {
            id: newCardId,
            content: itemContent,
            userId: user.id, 
            userName: `${user.name} (AI Suggested)`,
            createdAt: new Date().toISOString(),
            upvotes: [],
            order: 0, // Will be set by reordering below
          };
          tempBoardCopy.cards[newCardId] = newCard;
          tempBoardCopy.columns.actionItems.cardIds.unshift(newCardId); 
        });

        // Re-order cards in actionItems column
        tempBoardCopy.columns.actionItems.cardIds.forEach((cardId, index) => {
          if (tempBoardCopy.cards[cardId]) {
            tempBoardCopy.cards[cardId].order = index;
          }
        });
        
        updateBoardData(tempBoardCopy);
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1 min-w-[1200px] md:min-w-full px-1">
          {columnIds.map(columnId => (
            <BoardColumnClient
              key={columnId}
              columnId={columnId}
              title={DEFAULT_COLUMNS_CONFIG[columnId].title}
              cards={(currentBoard.columns[columnId]?.cardIds || [])
                .map(id => currentBoard.cards[id])
                .filter((card): card is CardData => !!card) 
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
