
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

// Type for the dragged item state
type DraggedItemType = CardData & { sourceColumnId: ColumnId };

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
  const [draggedItem, setDraggedItem] = useState<DraggedItemType | null>(null);


  useEffect(() => {
    const board = boards.find(b => b.id === boardId);
    if (board) {
      const sanitizedColumns: Record<ColumnId, ColumnData> = {
        wentWell: board.columns?.wentWell || { ...INITIAL_COLUMNS_DATA.wentWell, cardIds: [] },
        toImprove: board.columns?.toImprove || { ...INITIAL_COLUMNS_DATA.toImprove, cardIds: [] },
        actionItems: board.columns?.actionItems || { ...INITIAL_COLUMNS_DATA.actionItems, cardIds: [] },
      };

      (Object.keys(sanitizedColumns) as ColumnId[]).forEach(colId => {
        if (!Array.isArray(sanitizedColumns[colId].cardIds)) {
          sanitizedColumns[colId].cardIds = [];
        }
      });
      
      const sanitizedCards = board.cards || {};

      const sanitizedBoardData: BoardData = {
        ...board,
        columns: sanitizedColumns,
        cards: sanitizedCards,
      };
      
      setCurrentBoard(sanitizedBoardData);
    } else if (boards.length > 0) { 
       const existingBoardIsStale = currentBoard && currentBoard.id === boardId && !board;
       if (existingBoardIsStale) {
         setCurrentBoard(null); 
       }
    }
    setIsLoading(false);
  }, [boardId, boards]);


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

    const currentCards = currentBoard.cards || {};
    const currentColumn = currentBoard.columns?.[columnId] || { ...INITIAL_COLUMNS_DATA[columnId], cardIds: [] };
    
    const newCardsRecord = {
      ...currentCards,
      [newCardId]: newCard,
    };
    
    const newColumnCardIds = [newCardId, ...(currentColumn.cardIds || [])];

    newColumnCardIds.forEach((cardId, index) => {
      if (newCardsRecord[cardId]) {
        newCardsRecord[cardId] = { ...newCardsRecord[cardId], order: index };
      }
    });

    const updatedBoard: BoardData = {
      ...currentBoard,
      cards: newCardsRecord,
      columns: {
        ...(currentBoard.columns || INITIAL_COLUMNS_DATA), // Ensure columns object exists
        [columnId]: {
          ...(currentBoard.columns?.[columnId] || INITIAL_COLUMNS_DATA[columnId]),
          cardIds: newColumnCardIds,
        },
      },
    };
    updateBoardData(updatedBoard);
  }, [currentBoard, user, updateBoardData]);

  const handleUpdateCard = useCallback((cardId: string, newContent: string) => {
    if (!currentBoard || !currentBoard.cards) return;
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
    if (!currentBoard || !currentBoard.cards || !currentBoard.columns) return;

    const cardsCopy = { ...currentBoard.cards };
    delete cardsCopy[cardId];

    const columnCopy = currentBoard.columns[columnId] 
        ? { ...currentBoard.columns[columnId] } 
        : { ...INITIAL_COLUMNS_DATA[columnId], cardIds: []}; 

    const newColumnCardIds = (columnCopy.cardIds || []).filter(id => id !== cardId);

    const updatedCardsInColumn: Record<string, CardData> = {};
    newColumnCardIds.forEach((id, index) => {
      if (cardsCopy[id]) { 
        updatedCardsInColumn[id] = { ...cardsCopy[id], order: index };
      }
    });

    const finalCardsRecord = { ...cardsCopy, ...updatedCardsInColumn };


    const updatedBoard: BoardData = {
      ...currentBoard,
      cards: finalCardsRecord,
      columns: {
        ...currentBoard.columns,
        [columnId]: {
          ...columnCopy,
          cardIds: newColumnCardIds,
        },
      },
    };
    updateBoardData(updatedBoard);
  }, [currentBoard, updateBoardData]);

  const handleUpvoteCard = useCallback((cardId: string) => {
    if (!currentBoard || !user || !currentBoard.cards) return;
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

  const handleDragEnd = useCallback((
    draggedCardId: string, 
    sourceColumnId: ColumnId, 
    destColumnId: ColumnId, 
    destinationIndexInDropTarget: number
  ) => {
    if (!currentBoard || !currentBoard.cards || !currentBoard.cards[draggedCardId] || !currentBoard.columns) {
      console.error("Board, cards, dragged card, or columns are missing, cannot process drag.");
      setDraggedItem(null); // Reset dragged item state
      return;
    }

    const currentCards = { ...currentBoard.cards };
    const currentColumns = { ...currentBoard.columns };

    let newSourceCardIds = [...(currentColumns[sourceColumnId]?.cardIds || [])];
    let newDestCardIds: string[];

    const originalSourceIndex = newSourceCardIds.indexOf(draggedCardId);

    // Remove from source
    if (originalSourceIndex > -1) {
      newSourceCardIds.splice(originalSourceIndex, 1);
    } else {
        console.warn(`Card ${draggedCardId} not found in source column ${sourceColumnId}. It might have been moved or deleted by another process.`);
        // If card is not in source, it implies some external change. We might not want to proceed.
        // However, if it IS in the destination already (e.g. quick succession of drags), we might still want to reorder.
        // For now, let's check if it's already in destination and just reorder.
        if (currentColumns[destColumnId]?.cardIds.includes(draggedCardId) && sourceColumnId === destColumnId) {
            newSourceCardIds = [...(currentColumns[sourceColumnId]?.cardIds || [])]; // Reset newSourceCardIds
        } else {
            setDraggedItem(null);
            return; // Abort if card truly missing from source and not just reordering in dest
        }
    }


    if (sourceColumnId === destColumnId) {
      // For same-column move, newDestCardIds starts as a copy of newSourceCardIds (which has the card removed)
      newDestCardIds = [...newSourceCardIds]; 
    } else {
      // For cross-column move, newDestCardIds starts as a copy of the original destination column's cardIds
      newDestCardIds = [...(currentColumns[destColumnId]?.cardIds || [])];
    }
    
    let effectiveDestinationIndex = destinationIndexInDropTarget;

    // Adjust destinationIndex if card is moved within the same column
    if (sourceColumnId === destColumnId && originalSourceIndex > -1) {
        if (originalSourceIndex < destinationIndexInDropTarget) {
            // If card was moved downwards, the target index in the list (after removal) is one less
            effectiveDestinationIndex = Math.max(0, destinationIndexInDropTarget -1);
        }
         // If card moved upwards or to same spot, destinationIndexInDropTarget is already correct for the list after removal
    }
    
    // Ensure the effectiveDestinationIndex is within the bounds of the (potentially modified) newDestCardIds array length
    effectiveDestinationIndex = Math.max(0, Math.min(effectiveDestinationIndex, newDestCardIds.length));
    
    // Add to destination
    newDestCardIds.splice(effectiveDestinationIndex, 0, draggedCardId);

    const updatedCardsRecord = { ...currentCards };

    // Re-order cards in the destination column
    newDestCardIds.forEach((cardId, index) => {
      if (updatedCardsRecord[cardId]) {
        updatedCardsRecord[cardId] = { ...updatedCardsRecord[cardId], order: index };
      }
    });

    // If moved to a different column, also re-order cards in the source column
    if (sourceColumnId !== destColumnId) {
      newSourceCardIds.forEach((cardId, index) => {
        if (updatedCardsRecord[cardId]) {
          updatedCardsRecord[cardId] = { ...updatedCardsRecord[cardId], order: index };
        }
      });
    }
    
    const updatedColumns = {
      ...currentColumns,
      [sourceColumnId]: {
        ...(currentColumns[sourceColumnId] || INITIAL_COLUMNS_DATA[sourceColumnId]),
        cardIds: newSourceCardIds,
      },
      [destColumnId]: {
        ...(currentColumns[destColumnId] || INITIAL_COLUMNS_DATA[destColumnId]),
        cardIds: newDestCardIds,
      },
    };
    
    const newBoardState: BoardData = {
      ...currentBoard,
      cards: updatedCardsRecord,
      columns: updatedColumns,
    };

    updateBoardData(newBoardState);
    setDraggedItem(null); // Reset dragged item state after successful drop
  }, [currentBoard, updateBoardData]);


  const handleAISuggestions = useCallback(async () => {
    if (!currentBoard || !user) return;
    setIsAISuggesting(true);
    try {
      const toImproveColumn = currentBoard.columns?.toImprove || { ...INITIAL_COLUMNS_DATA.toImprove, cardIds: [] };
      const toImproveCardsContent = (toImproveColumn.cardIds || [])
        .map(cardId => currentBoard.cards?.[cardId]?.content)
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
        let tempBoardCopy: BoardData = { // More controlled deep copy
            ...currentBoard,
            cards: JSON.parse(JSON.stringify(currentBoard.cards || {})),
            columns: {
                wentWell: {
                    ...(currentBoard.columns?.wentWell || INITIAL_COLUMNS_DATA.wentWell),
                    cardIds: [...(currentBoard.columns?.wentWell?.cardIds || [])]
                },
                toImprove: {
                    ...(currentBoard.columns?.toImprove || INITIAL_COLUMNS_DATA.toImprove),
                    cardIds: [...(currentBoard.columns?.toImprove?.cardIds || [])]
                },
                actionItems: {
                    ...(currentBoard.columns?.actionItems || INITIAL_COLUMNS_DATA.actionItems),
                    cardIds: [...(currentBoard.columns?.actionItems?.cardIds || [])]
                }
            }
        };
        
        if (!tempBoardCopy.columns.actionItems) {
            tempBoardCopy.columns.actionItems = { ...INITIAL_COLUMNS_DATA.actionItems, cardIds: [] };
        }
        if (!Array.isArray(tempBoardCopy.columns.actionItems.cardIds)) {
            tempBoardCopy.columns.actionItems.cardIds = [];
        }
         if (!tempBoardCopy.cards) {
            tempBoardCopy.cards = {};
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
            order: 0, 
          };
          tempBoardCopy.cards[newCardId] = newCard;
          tempBoardCopy.columns.actionItems.cardIds.unshift(newCardId);
        });

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
            const columnConfig = DEFAULT_COLUMNS_CONFIG[columnId];
            // Ensure columns and cards are initialized if currentBoard exists but they don't
            const boardColumns = currentBoard.columns || INITIAL_COLUMNS_DATA;
            const boardCards = currentBoard.cards || {};

            const columnData = boardColumns?.[columnId] || { ...INITIAL_COLUMNS_DATA[columnId], cardIds: [] };
            const cardIdsForColumn = Array.isArray(columnData.cardIds) ? columnData.cardIds : [];
            
            const cardsForColumn = cardIdsForColumn
              .map(id => boardCards?.[id])
              .filter((card): card is CardData => !!card && typeof card.order === 'number') 
              .sort((a, b) => (a.order as number) - (b.order as number));
            
            if (!columnConfig) return null;

            return (
              <BoardColumnClient
                key={columnId}
                columnId={columnId}
                title={columnConfig.title}
                cards={cardsForColumn}
                onAddCard={handleAddCard}
                onUpdateCard={handleUpdateCard}
                onDeleteCard={handleDeleteCard}
                onUpvoteCard={handleUpvoteCard}
                onDragEnd={handleDragEnd}
                currentUserId={user?.id || ''}
                draggedItem={draggedItem}
                setDraggedItem={setDraggedItem}
              />
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
    
