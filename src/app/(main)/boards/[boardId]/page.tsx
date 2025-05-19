
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
      // Ensure columns always exist and cards have an order property.
      const sanitizedColumns: Record<ColumnId, ColumnData> = {
        wentWell: board.columns?.wentWell || { ...INITIAL_COLUMNS_DATA.wentWell, cardIds: [] },
        toImprove: board.columns?.toImprove || { ...INITIAL_COLUMNS_DATA.toImprove, cardIds: [] },
        actionItems: board.columns?.actionItems || { ...INITIAL_COLUMNS_DATA.actionItems, cardIds: [] },
      };

      // Ensure cardIds are always arrays
      (Object.keys(sanitizedColumns) as ColumnId[]).forEach(colId => {
        if (!Array.isArray(sanitizedColumns[colId].cardIds)) {
          sanitizedColumns[colId].cardIds = [];
        }
      });
      
      // Ensure cards object exists
      const sanitizedCards = board.cards || {};

      const sanitizedBoard: BoardData = {
        ...board,
        columns: sanitizedColumns,
        cards: sanitizedCards,
      };
      setCurrentBoard(sanitizedBoard);
    } else if (boards.length > 0) { 
       // Only attempt to set currentBoard or redirect if boards have been loaded.
       // If currentBoard is already set (e.g. from a previous render for the same boardId),
       // and board is not found (e.g. boards list changed), it might be better to clear it or redirect.
       // For now, if board not found after boards are loaded, we might clear it or let the UI show "not found".
       // If `currentBoard` exists but `board` is not found in `boards`, it means `boards` changed and this board was removed.
       // In this case, we should probably clear `currentBoard` or redirect.
       const existingBoardIsStale = currentBoard && currentBoard.id === boardId && !board;
       if (existingBoardIsStale) {
         setCurrentBoard(null); // Clear stale board
       }
       // console.log("Board not found, consider redirecting or showing a message.");
    }
    setIsLoading(false);
  }, [boardId, boards]); // Removed currentBoard from dependencies


  const updateBoardData = useCallback((updatedBoard: BoardData) => {
    setCurrentBoard(updatedBoard);
    setBoards(prevBoards =>
      prevBoards.map(b => b.id === updatedBoard.id ? updatedBoard : b)
    );
  }, [setBoards]);

  const handleAddCard = useCallback((columnId: ColumnId, content: string) => {
    if (!currentBoard || !user) return;
    const newCardId = uuidv4();
    const newCard: CardData = {
      id: newCardId,
      content,
      userId: user.id,
      userName: user.name,
      createdAt: new Date().toISOString(),
      upvotes: [],
      order: 0, 
    };

    const newCardsRecord = {
      ...currentBoard.cards,
      [newCardId]: newCard,
    };
    
    const targetColumn = currentBoard.columns[columnId] 
      ? { ...currentBoard.columns[columnId] } // Create a new object for the target column
      : { ...INITIAL_COLUMNS_DATA[columnId], cardIds: [] }; // Fallback for safety

    const newColumnCardIds = [newCardId, ...(targetColumn.cardIds || [])];

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
          ...targetColumn,
          cardIds: newColumnCardIds,
        },
      },
    };
    updateBoardData(updatedBoard);
  }, [currentBoard, user, updateBoardData]);

  const handleUpdateCard = useCallback((cardId: string, newContent: string) => {
    if (!currentBoard) return;
    const cardToUpdate = currentBoard.cards[cardId];
    if (!cardToUpdate) return;

    const updatedCard = { ...cardToUpdate, content: newContent };
    const updatedCards = {
      ...currentBoard.cards,
      [cardId]: updatedCard,
    };
    const updatedBoard = {
      ...currentBoard,
      cards: updatedCards,
    };
    updateBoardData(updatedBoard);
  }, [currentBoard, updateBoardData]);

  const handleDeleteCard = useCallback((cardId: string, columnId: ColumnId) => {
    if (!currentBoard) return;

    const { [cardId]: _, ...remainingCardsRest } = currentBoard.cards;
    const remainingCards = { ...remainingCardsRest }; 

    const targetColumn = currentBoard.columns[columnId] 
        ? { ...currentBoard.columns[columnId] } // Create a new object
        : { ...INITIAL_COLUMNS_DATA[columnId], cardIds: []}; // Fallback

    const newColumnCardIds = (targetColumn.cardIds || []).filter(id => id !== cardId);

    newColumnCardIds.forEach((id, index) => {
      if (remainingCards[id]) {
        remainingCards[id] = { ...remainingCards[id], order: index };
      }
    });

    const updatedBoard: BoardData = {
      ...currentBoard,
      cards: remainingCards,
      columns: {
        ...currentBoard.columns,
        [columnId]: {
          ...targetColumn,
          cardIds: newColumnCardIds,
        },
      },
    };
    updateBoardData(updatedBoard);
  }, [currentBoard, updateBoardData]);

  const handleUpvoteCard = useCallback((cardId: string) => {
    if (!currentBoard || !user) return;
    const card = currentBoard.cards[cardId];
    if (!card) return;

    const alreadyUpvoted = card.upvotes.includes(user.id);
    const newUpvotes = alreadyUpvoted
      ? card.upvotes.filter(uid => uid !== user.id)
      : [...card.upvotes, user.id];

    const updatedCard = { ...card, upvotes: newUpvotes };
    const updatedCards = {
        ...currentBoard.cards,
        [cardId]: updatedCard,
    };
    const updatedBoard = {
      ...currentBoard,
      cards: updatedCards,
    };
    updateBoardData(updatedBoard);
  }, [currentBoard, user, updateBoardData]);

  const handleDragEnd = useCallback((draggedCardId: string, sourceColumnId: ColumnId, destColumnId: ColumnId, destinationIndexInDropTarget: number) => {
    if (!currentBoard || !draggedCardId) return;

    let boardStateBeforeUpdate: BoardData = JSON.parse(JSON.stringify(currentBoard));

    const cardToMove = boardStateBeforeUpdate.cards[draggedCardId];
    if (!cardToMove) {
      console.error("Dragged card not found in current board state.");
      return;
    }
    
    let sourceColData = boardStateBeforeUpdate.columns[sourceColumnId] 
      ? { ...boardStateBeforeUpdate.columns[sourceColumnId] } // Ensure new object
      : { ...INITIAL_COLUMNS_DATA[sourceColumnId], cardIds: []};
    let destColData = boardStateBeforeUpdate.columns[destColumnId]
      ? { ...boardStateBeforeUpdate.columns[destColumnId] } // Ensure new object
      : { ...INITIAL_COLUMNS_DATA[destColumnId], cardIds: []};

    let newSourceColCardIds = [...(sourceColData.cardIds || [])]; // Ensure new array
    let newDestColCardIds = sourceColumnId === destColumnId ? newSourceColCardIds : [...(destColData.cardIds || [])]; // Ensure new array if different columns
    
    const originalSourceIndex = newSourceColCardIds.indexOf(draggedCardId);

    if (originalSourceIndex > -1) {
      newSourceColCardIds.splice(originalSourceIndex, 1);
    } else {
      console.warn(`Card ${draggedCardId} not found in source column ${sourceColumnId}.`);
      // If card is not in source, it might indicate a state inconsistency.
      // For robustness, we can assume it's being added to dest, but this could mask bugs.
      // If it was an AI-added card not yet in source list, this is fine.
    }

    let effectiveDestinationIndex = destinationIndexInDropTarget;

    if (sourceColumnId === destColumnId) {
      // If item was removed from before its target destination in the same list, adjust index
      if (originalSourceIndex > -1 && originalSourceIndex < destinationIndexInDropTarget) {
        effectiveDestinationIndex = Math.max(0, destinationIndexInDropTarget -1);
      }
    }
    
    // Clamp the index to be within bounds of the destination array
    effectiveDestinationIndex = Math.max(0, Math.min(effectiveDestinationIndex, newDestColCardIds.length));
    newDestColCardIds.splice(effectiveDestinationIndex, 0, draggedCardId);
    
    // Create a new cards record and update order properties
    const newCardsRecord: Record<string, CardData> = { ...boardStateBeforeUpdate.cards };

    // Update order for all cards in the destination column
    newDestColCardIds.forEach((cardId, index) => {
      if (newCardsRecord[cardId]) {
        newCardsRecord[cardId] = { ...newCardsRecord[cardId], order: index };
      }
    });

    if (sourceColumnId !== destColumnId) {
      newSourceColCardIds.forEach((cardId, index) => {
        if (newCardsRecord[cardId]) {
          newCardsRecord[cardId] = { ...newCardsRecord[cardId], order: index };
        }
      });
    }
    
    const updatedBoard: BoardData = {
      ...boardStateBeforeUpdate, 
      cards: newCardsRecord,     
      columns: {                 
        ...boardStateBeforeUpdate.columns, 
        [sourceColumnId]: {      
          ...sourceColData, 
          cardIds: newSourceColCardIds,
        },
        [destColumnId]: {        
          ...destColData,
          cardIds: newDestColCardIds,
        },
      },
    };

    updateBoardData(updatedBoard);
  }, [currentBoard, updateBoardData]);


  const handleAISuggestions = useCallback(async () => {
    if (!currentBoard || !user) return;
    setIsAISuggesting(true);
    try {
      const toImproveColumn = currentBoard.columns.toImprove || { ...INITIAL_COLUMNS_DATA.toImprove, cardIds: [] };
      const toImproveCardsContent = (toImproveColumn.cardIds || [])
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
        // Make a deep copy to ensure we're not mutating the current state directly before calling updateBoardData
        let tempBoardCopy: BoardData = JSON.parse(JSON.stringify(currentBoard));
        
        // Ensure actionItems column and its cardIds array exist
        if (!tempBoardCopy.columns.actionItems) {
            tempBoardCopy.columns.actionItems = { ...INITIAL_COLUMNS_DATA.actionItems, cardIds: [] };
        }
        if (!Array.isArray(tempBoardCopy.columns.actionItems.cardIds)) {
            tempBoardCopy.columns.actionItems.cardIds = [];
        }

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
          tempBoardCopy.cards[newCardId] = newCard; // Add to cards record
          tempBoardCopy.columns.actionItems.cardIds.unshift(newCardId); // Add to the beginning of cardIds
        });

        // Re-order all cards in the actionItems column
        (tempBoardCopy.columns.actionItems.cardIds || []).forEach((cardId, index) => {
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
  }, [currentBoard, user, updateBoardData, toast]);


  if (isLoading || !user) {
    return <div className="text-center py-10">Loading board...</div>;
  }
  if (!currentBoard) {
    return <div className="text-center py-10">Board not found. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }

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
          {columnIds.map(columnId => {
            const columnData = currentBoard.columns?.[columnId] || { ...INITIAL_COLUMNS_DATA[columnId], cardIds: [] };
            const cardIdsForColumn = Array.isArray(columnData.cardIds) ? columnData.cardIds : [];

            const cardsForColumn = cardIdsForColumn
              .map(id => currentBoard.cards?.[id])
              .filter((card): card is CardData => !!card && typeof card.order === 'number') 
              .sort((a, b) => (a.order as number) - (b.order as number));
            
            return (
              <BoardColumnClient
                key={columnId}
                columnId={columnId}
                title={DEFAULT_COLUMNS_CONFIG[columnId].title}
                cards={cardsForColumn}
                onAddCard={handleAddCard}
                onUpdateCard={handleUpdateCard}
                onDeleteCard={handleDeleteCard}
                onUpvoteCard={handleUpvoteCard}
                onDragEnd={handleDragEnd}
                currentUserId={user?.id || ''}
              />
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
    
