
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { BoardData, CardData, ColumnData, ColumnId } from '@/lib/types';
import { DEFAULT_COLUMNS_CONFIG, INITIAL_COLUMNS_DATA } from '@/lib/types';
import BoardColumnClient from '@/components/board/BoardColumnClient';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Wand2, Share2 } from 'lucide-react';
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
  
  const { user, isUserLoading: isStoreUserLoading, boards, isBoardsLoading: isLoadingAllBoards } = useBoardStore((state) => ({
    user: state.user,
    isUserLoading: state.isUserLoading,
    boards: state.boards,
    isBoardsLoading: state.isBoardsLoading,
  }));
  const storeActions = useBoardActions();
  
  const { toast } = useToast();

  const [isAISuggesting, setIsAISuggesting] = useState(false);
  const [draggedItem, setDraggedItem] = useState<DraggedItemType | null>(null);
  
  useEffect(() => {
    if (boardId) {
      storeActions.setCurrentBoardId(boardId);
    }
  }, [boardId, storeActions]);

  // SSE connection effect
  useEffect(() => {
    if (!boardId || typeof window === 'undefined') {
      return;
    }

    console.log(`SSE: Initializing for board ${boardId}. Current boards in store: ${boards.length}`);
    const eventSource = new EventSource(`/api/boards/${boardId}/events`);
    let sseConnected = true; // Assume connected initially

    eventSource.onopen = () => {
      console.log(`SSE: Connection opened for board ${boardId}`);
      sseConnected = true;
    };

    eventSource.addEventListener('boardUpdate', (event) => {
      try {
        const updatedBoardFromServer = JSON.parse(event.data as string) as BoardData | null;
        console.log(`SSE: Received boardUpdate for ${boardId}`, updatedBoardFromServer);
        
        if (updatedBoardFromServer && updatedBoardFromServer.id === boardId) {
          // Board data received (creation or update)
          storeActions.setBoardFromServer(updatedBoardFromServer);
        } else if (updatedBoardFromServer === null && boardId === params.boardId) {
          // Server explicitly says this current board is null (e.g., deleted by another user).
          // Check client store *after* potential update from another source or initial load.
          const boardStillInClientStore = useBoardStore.getState().boards.find(b => b.id === boardId);
          
          if (boardStillInClientStore) {
            // Board was in client store, but server says it's gone.
            toast({ title: "Board Unavailable", description: "This board may have been deleted or is no longer accessible. Redirecting to home...", variant: "destructive" });
            storeActions.removeBoardFromServer(boardId);
            router.push('/');
          } else {
            // Board was NOT in client store, and server says it's null.
            // This could be:
            // 1. An invalid URL that will never resolve (page will show "Board not found or is being loaded...").
            // 2. A new board, and this is the *initial* null from the SSE endpoint before the creation event arrives.
            // In case 2, we should NOT redirect here. We wait for the subsequent creation event.
            console.warn(`SSE: Received null for board ${boardId}, but it wasn't in client store. Waiting for potential creation event or persisting 'not found' state.`);
            // No automatic redirect here. Let the UI show "Board not found or is being loaded..."
          }
        }
        // If updatedBoardFromServer is for a *different* board ID, Zustand's setBoardFromServer will handle it correctly if it's an update for another board.
      } catch (error) {
        console.error('SSE: Failed to parse boardUpdate:', error);
        toast({ title: "Real-time Sync Error", description: "Could not process an update from the server.", variant: "destructive" });
      }
    });
    
    eventSource.onerror = (error) => {
      console.error(`SSE: EventSource failed for board ${boardId}:`, error);
      sseConnected = false;
      // Don't show toast for initial connection errors if page is already showing "loading" or "not found"
      // Only show if it was previously connected or if the board was thought to exist.
      const currentBoardExists = useBoardStore.getState().boards.find(b => b.id === boardId);
      if (currentBoardExists) { // Only toast if we thought the board was okay
        toast({ title: "Connection Issue", description: "Lost real-time connection to the board. Some changes may not appear automatically.", variant: "destructive" });
      }
      eventSource.close();
    };

    return () => {
      if (sseConnected) {
        console.log(`SSE: Closing connection for board ${boardId}`);
        eventSource.close();
        sseConnected = false;
      }
    };
  }, [boardId, storeActions, router, toast, params.boardId]); // Removed `boards` from deps, using getState inside if needed


  const currentBoardFromStore = useMemo(() => boards.find(b => b.id === boardId), [boards, boardId]);

  const currentBoard = useMemo(() => {
    if (!currentBoardFromStore) return null;

    // Create a new object for the board to ensure immutability if modifications are made
    const board = { ...currentBoardFromStore }; 
    // Ensure cards is a new object if it exists
    board.cards = board.cards ? { ...board.cards } : {};

    // Deep clone and sanitize columns, ensuring all default columns are present
    const sanitizedColumns: BoardData['columns'] = {
        wentWell: {
            ...(currentBoardFromStore.columns?.wentWell || INITIAL_COLUMNS_DATA.wentWell), // Spread existing or default
            id: 'wentWell', // Ensure ID
            title: DEFAULT_COLUMNS_CONFIG.wentWell.title, // Ensure title
            cardIds: Array.isArray(currentBoardFromStore.columns?.wentWell?.cardIds) // Ensure cardIds is an array
                ? [...currentBoardFromStore.columns.wentWell.cardIds] // Clone if array
                : [], // Default to empty array
        },
        toImprove: {
            ...(currentBoardFromStore.columns?.toImprove || INITIAL_COLUMNS_DATA.toImprove),
            id: 'toImprove',
            title: DEFAULT_COLUMNS_CONFIG.toImprove.title,
            cardIds: Array.isArray(currentBoardFromStore.columns?.toImprove?.cardIds)
                ? [...currentBoardFromStore.columns.toImprove.cardIds]
                : [],
        },
        actionItems: {
            ...(currentBoardFromStore.columns?.actionItems || INITIAL_COLUMNS_DATA.actionItems),
            id: 'actionItems',
            title: DEFAULT_COLUMNS_CONFIG.actionItems.title,
            cardIds: Array.isArray(currentBoardFromStore.columns?.actionItems?.cardIds)
                ? [...currentBoardFromStore.columns.actionItems.cardIds]
                : [],
        },
    };
    board.columns = sanitizedColumns;
    
    // Ensure card orders are consistent and cards exist
    (Object.keys(board.columns) as ColumnId[]).forEach(colId => {
        const column = board.columns[colId];
        // Filter out card IDs that don't have corresponding card data
        column.cardIds = column.cardIds.filter(cardId => board.cards[cardId] !== undefined);
        // Ensure order property for cards in this column
        column.cardIds.forEach((cardId, index) => {
            if (board.cards[cardId]) { // Check if card exists
                // Create a new card object if order needs to be updated
                if (board.cards[cardId].order !== index) {
                    board.cards[cardId] = { ...board.cards[cardId], order: index };
                }
            }
        });
    });

    return board;
  }, [currentBoardFromStore]);


  const handleAddCard = useCallback(async (columnId: ColumnId, content: string) => {
    if (!currentBoard || !user) {
        toast({ title: "Cannot Add Card", description: "Board or user data is missing.", variant: "destructive" });
        return;
    }
    try {
        await storeActions.addCard(currentBoard.id, columnId, content);
    } catch (error) {
        console.error("Error in handleAddCard:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while adding the card.";
        toast({ title: "Failed to Add Card", description: errorMessage, variant: "destructive" });
    }
  }, [currentBoard, user, storeActions, toast]);

  const handleUpdateCard = useCallback(async (cardId: string, newContent: string) => {
    if (!currentBoard) return;
    try {
        await storeActions.updateCardContent(currentBoard.id, cardId, newContent);
    } catch (error) {
        console.error("Error in handleUpdateCard:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while updating the card.";
        toast({ title: "Failed to Update Card", description: errorMessage, variant: "destructive" });
    }
  }, [currentBoard, storeActions, toast]);

  const handleDeleteCard = useCallback(async (cardId: string, columnId: ColumnId) => {
    if (!currentBoard) return;
     try {
        await storeActions.deleteCard(currentBoard.id, columnId, cardId);
    } catch (error) {
        console.error("Error in handleDeleteCard:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while deleting the card.";
        toast({ title: "Failed to Delete Card", description: errorMessage, variant: "destructive" });
    }
  }, [currentBoard, storeActions, toast]);

  const handleUpvoteCard = useCallback(async (cardId: string) => {
    if (!currentBoard || !user) return;
    try {
        await storeActions.upvoteCard(currentBoard.id, cardId, user.id); 
    } catch (error) {
        console.error("Error in handleUpvoteCard:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while upvoting the card.";
        toast({ title: "Failed to Upvote Card", description: errorMessage, variant: "destructive" });
    }
  }, [currentBoard, user, storeActions, toast]);

  const handleDragEnd = useCallback(async (
    draggedCardId: string, 
    sourceColumnId: ColumnId, 
    destColumnId: ColumnId, 
    destinationIndexInDropTarget: number,
    mergeTargetCardId?: string
  ) => {
    if (!currentBoard) {
      console.error("Board not found, cannot process drag.");
      setDraggedItem(null);
      toast({ title: "Drag Error", description: "Board data is not available.", variant: "destructive" });
      return;
    }
    if (!currentBoard.cards || !currentBoard.cards[draggedCardId]) {
      console.error("Dragged card is missing from board cards record or board.cards is undefined.");
      setDraggedItem(null);
      toast({ title: "Drag Error", description: "Dragged card data is missing.", variant: "destructive" });
      return;
    }
  
    try {
        await storeActions.moveCard(
          currentBoard.id,
          draggedCardId,
          sourceColumnId,
          destColumnId,
          destinationIndexInDropTarget,
          mergeTargetCardId
        );
    } catch (error) {
        console.error("Error in handleDragEnd:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while moving the card.";
        toast({ title: "Failed to Move Card", description: errorMessage, variant: "destructive" });
    } finally {
        setDraggedItem(null);
    }
  }, [currentBoard, storeActions, toast]);


  const handleAISuggestions = useCallback(async () => {
    if (!currentBoard || !user || !currentBoard.columns || !currentBoard.cards) {
        toast({ title: "Error", description: "Board data is not fully loaded for AI suggestions.", variant: "destructive" });
        return;
    }
    setIsAISuggesting(true);
    try {
      const toImproveColumn = currentBoard.columns.toImprove;
      const toImproveCardsContent = (toImproveColumn.cardIds || [])
        .map(cardId => currentBoard.cards![cardId]?.content) 
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
        for (const itemContent of result.actionItems) {
          await storeActions.addCard(currentBoard.id, 'actionItems', itemContent, ' (AI Suggested)');
        }
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

  const handleShareBoard = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const boardUrl = window.location.href;
    try {
      await navigator.clipboard.writeText(boardUrl);
      toast({
        title: "Link Copied!",
        description: "Board link copied to clipboard.",
      });
    } catch (err) {
      console.error('Failed to copy: ', err);
      toast({
        title: "Error",
        description: "Could not copy link to clipboard.",
        variant: "destructive",
      });
    }
  }, [toast]);


  if (isStoreUserLoading) { 
    return <div className="text-center py-10">Loading user data...</div>;
  }

  if (!user) {
    // This state should ideally be handled by UserProvider, redirecting or showing UserSetupDialog
    // But as a fallback:
    return <div className="text-center py-10">User not set up. Redirecting to home... <Link href="/"><Button variant="link">Go Home Now</Button></Link></div>;
  }
  
  // If Zustand is still loading all boards AND we don't have this specific board yet from the store
  if (isLoadingAllBoards && !currentBoardFromStore) {
     return <div className="text-center py-10">Loading board data...</div>;
  }
  
  // If after all loading states, currentBoard (derived and sanitized) is still null.
  // This message is shown if boardId is invalid OR if a new board's SSE hasn't arrived yet to populate the store.
  if (!currentBoard) { 
      return (
        <div className="text-center py-10">
          Board not found or is being loaded. If this persists, the board may not exist or access is denied.
          <Link href="/"><Button variant="link">Go Home</Button></Link>
        </div>
      );
  }
  
  // This check is important after currentBoard is derived
  if (!currentBoard.columns || !currentBoard.cards) {
    // This can happen if the board structure from store is incomplete even after sanitization
    return <div className="text-center py-10">Board data is incomplete. Trying to sync... <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleShareBoard}>
            <Share2 className="mr-2 h-5 w-5" /> Share Board
          </Button>
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
      </div>

      <ScrollArea className="flex-grow -mx-1">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1 min-w-[1200px] md:min-w-full px-1">
          {columnIds.map(columnId => {
            const columnConfig = DEFAULT_COLUMNS_CONFIG[columnId];
            // Ensure columnData is always defined using the sanitized currentBoard.columns
            const columnData = currentBoard.columns![columnId] || { ...INITIAL_COLUMNS_DATA[columnId], cardIds: [] };
            const cardIdsForColumn = Array.isArray(columnData.cardIds) ? columnData.cardIds : [];
            
            // Ensure cardsRecord is always defined from sanitized currentBoard.cards
            const cardsRecord = currentBoard.cards || {};
            
            const cardsForColumn = cardIdsForColumn
              .map(id => cardsRecord[id]) 
              .filter((card): card is CardData => !!card && typeof card.order === 'number') // Ensure card exists and order is a number
              .sort((a, b) => (a.order as number) - (b.order as number)); // Explicitly cast order
            
            if (!columnConfig) return null; // Should not happen with DEFAULT_COLUMNS_CONFIG

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

