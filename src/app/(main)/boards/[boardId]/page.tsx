
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'next';
import { useParams, useRouter } from 'next/navigation';
import type { BoardData, CardData, ColumnData, ColumnId } from '@/lib/types';
import { DEFAULT_COLUMNS_CONFIG, INITIAL_COLUMNS_DATA } from '@/lib/types';
import BoardColumnClient from '@/components/board/BoardColumnClient';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { suggestActionItems, SuggestActionItemsInput } from '@/ai/flows/suggest-action-items';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useBoardStore, useBoardActions } from '@/store/boardStore';

type DraggedItemType = CardData & { sourceColumnId: ColumnId };

export default function BoardPage() {
  const router = useRouter();
  const params = useParams();
  const boardId = params.boardId as string;
  
  const { user, isUserLoading: isStoreUserLoading } = useBoardStore((state) => ({
    user: state.user,
    isUserLoading: state.isUserLoading,
  }));
  const storeActions = useBoardActions();
  const currentBoardFromStore = useBoardStore(state => state.boards.find(b => b.id === boardId));

  const { toast } = useToast();

  const [isAISuggesting, setIsAISuggesting] = useState(false);
  const [draggedItem, setDraggedItem] = useState<DraggedItemType | null>(null);
  

  useEffect(() => {
    if (boardId) {
      storeActions.setCurrentBoardId(boardId);
    }
  }, [boardId, storeActions]);

  const currentBoard = useMemo(() => {
    if (!currentBoardFromStore) return null;

    const board = { ...currentBoardFromStore }; // Shallow copy of the board

    // Ensure cards object exists
    board.cards = board.cards ? { ...board.cards } : {}; // Make a copy if it exists

    // Deep copy and sanitize columns
    const sanitizedColumns: BoardData['columns'] = {
        wentWell: {
            ...INITIAL_COLUMNS_DATA.wentWell, // Start with default structure (includes title)
            // Override with existing cardIds if valid
            cardIds: currentBoardFromStore.columns?.wentWell?.cardIds && Array.isArray(currentBoardFromStore.columns.wentWell.cardIds)
                ? [...currentBoardFromStore.columns.wentWell.cardIds] // Copy array
                : [],
        },
        toImprove: {
            ...INITIAL_COLUMNS_DATA.toImprove,
            cardIds: currentBoardFromStore.columns?.toImprove?.cardIds && Array.isArray(currentBoardFromStore.columns.toImprove.cardIds)
                ? [...currentBoardFromStore.columns.toImprove.cardIds]
                : [],
        },
        actionItems: {
            ...INITIAL_COLUMNS_DATA.actionItems,
            cardIds: currentBoardFromStore.columns?.actionItems?.cardIds && Array.isArray(currentBoardFromStore.columns.actionItems.cardIds)
                ? [...currentBoardFromStore.columns.actionItems.cardIds]
                : [],
        },
    };
    board.columns = sanitizedColumns;
    
    // Ensure all cards referenced in cardIds actually exist in board.cards
    // and have a valid order. This step also ensures cards have a valid order if newly added or moved.
    (Object.keys(board.columns) as ColumnId[]).forEach(colId => {
        const column = board.columns[colId];
        column.cardIds = column.cardIds.filter(cardId => board.cards[cardId] !== undefined); // Remove stale card IDs
        column.cardIds.forEach((cardId, index) => {
            if (board.cards[cardId]) {
                board.cards[cardId] = { ...board.cards[cardId], order: index };
            }
        });
    });


    return board;
  }, [currentBoardFromStore]);


  const handleAddCard = useCallback((columnId: ColumnId, content: string) => {
    if (!currentBoard || !user) return;
    storeActions.addCard(currentBoard.id, columnId, content);
  }, [currentBoard, user, storeActions]);

  const handleUpdateCard = useCallback((cardId: string, newContent: string) => {
    if (!currentBoard) return;
    storeActions.updateCardContent(currentBoard.id, cardId, newContent);
  }, [currentBoard, storeActions]);

  const handleDeleteCard = useCallback((cardId: string, columnId: ColumnId) => {
    if (!currentBoard) return;
    storeActions.deleteCard(currentBoard.id, columnId, cardId);
  }, [currentBoard, storeActions]);

  const handleUpvoteCard = useCallback((cardId: string) => {
    if (!currentBoard || !user) return;
    storeActions.upvoteCard(currentBoard.id, cardId, user.id);
  }, [currentBoard, user, storeActions]);

  const handleDragEnd = useCallback((
    draggedCardId: string, 
    sourceColumnId: ColumnId, 
    destColumnId: ColumnId, 
    destinationIndexInDropTarget: number,
    mergeTargetCardId?: string
  ) => {
    if (!currentBoard) {
      console.error("Board not found, cannot process drag.");
      setDraggedItem(null);
      return;
    }
    if (!currentBoard.cards || !currentBoard.cards[draggedCardId]) {
      console.error("Dragged card is missing from board cards record or board.cards is undefined.");
      setDraggedItem(null);
      return;
    }
  
    storeActions.moveCard(
      currentBoard.id,
      draggedCardId,
      sourceColumnId,
      destColumnId,
      destinationIndexInDropTarget,
      mergeTargetCardId
    );
    setDraggedItem(null); // Reset dragged item in BoardPage
  }, [currentBoard, storeActions]);


  const handleAISuggestions = useCallback(async () => {
    if (!currentBoard || !user || !currentBoard.columns || !currentBoard.cards) {
        toast({ title: "Error", description: "Board data is not fully loaded for AI suggestions.", variant: "destructive" });
        return;
    }
    setIsAISuggesting(true);
    try {
      const toImproveColumn = currentBoard.columns.toImprove;
      const toImproveCardsContent = (toImproveColumn.cardIds || [])
        .map(cardId => currentBoard.cards![cardId]?.content) // Added null check for cards
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
        result.actionItems.forEach(itemContent => {
          storeActions.addCard(currentBoard.id, 'actionItems', itemContent, ' (AI Suggested)');
        });
        toast({ title: "AI Suggestions Added", description: `${result.actionItems.length} action items added.` });
      } else {
        toast({ title: "AI Suggestions", description: "No action items were suggested." });
      }
    } catch (error) {
      console.error("AI suggestion error:", error);
      toast({ title: "AI Error", description: "Could not get AI suggestions.", variant: "destructive" });
    }
    setIsAISuggesting(false);
  }, [currentBoard, user, storeActions, toast]);


  if (isStoreUserLoading) {
    return <div className="text-center py-10">Loading board...</div>;
  }

  if (!user) {
    // This state should ideally be handled by UserProvider, which shows a setup dialog.
    // If UserProvider is correctly implemented, this state might be very brief or not hit.
    return <div className="text-center py-10">User not available. Please go to the home page to set up your user. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }

  if (!currentBoard) {
    // This means the boardId from URL does not match any board in the store,
    // or currentBoardFromStore was null/undefined.
    return <div className="text-center py-10">Board not found. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }
  
  // Ensure currentBoard.columns and currentBoard.cards are defined before trying to access their properties
  if (!currentBoard.columns || !currentBoard.cards) {
    return <div className="text-center py-10">Board data is incomplete. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
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
            // Fallback to initial empty column structure if specific column data is somehow missing after sanitization
            // Though `currentBoard.columns` should be fully sanitized by `useMemo`
            const columnData = currentBoard.columns![columnId] || { ...INITIAL_COLUMNS_DATA[columnId], cardIds: [] };
            const cardIdsForColumn = Array.isArray(columnData.cardIds) ? columnData.cardIds : [];
            
            const cardsForColumn = cardIdsForColumn
              .map(id => currentBoard.cards![id]) // currentBoard.cards should be defined due to earlier checks
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
                currentUserId={user?.id || ''} // user should be defined due to earlier checks
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
