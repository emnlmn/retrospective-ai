
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

    console.log(`SSE: Initializing for board ${boardId}.`);
    const eventSource = new EventSource(`/api/boards/${boardId}/events`);
    let sseConnected = true; 

    eventSource.onopen = () => {
      console.log(`SSE: Connection opened for board ${boardId}`);
      sseConnected = true;
    };

    eventSource.addEventListener('boardUpdate', (event) => {
      try {
        const updatedBoardFromServer = JSON.parse(event.data as string) as BoardData | null;
        console.log(`SSE: Received boardUpdate for ${boardId}`, updatedBoardFromServer);
        
        if (updatedBoardFromServer && updatedBoardFromServer.id === boardId) {
          storeActions.setBoardFromServer(updatedBoardFromServer);
        } else if (updatedBoardFromServer === null && boardId === params.boardId) { // Check params.boardId to ensure this is for the current page
          // Server explicitly says this current board is null (e.g., deleted by another user or server restart).
          const boardIsCurrentlyInClientStore = useBoardStore.getState().boards.find(b => b.id === boardId);
          
          if (boardIsCurrentlyInClientStore) {
            console.log(`SSE: Board ${boardId} is null on server, but was in client store. Redirecting.`);
            toast({ title: "Board Unavailable", description: "This board may have been deleted or is no longer accessible. Redirecting to home...", variant: "destructive" });
            storeActions.removeBoardFromServer(boardId);
            router.push('/');
          } else {
            // Board was NOT in client store, and server says it's null.
            // This could be an invalid URL, or a new board where the server's initial response was null
            // and we are waiting for the subsequent creation event.
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
      if (sseConnected) { // Only toast if we thought the connection was okay or if the board was thought to exist.
        const currentBoardExists = useBoardStore.getState().boards.find(b => b.id === boardId);
        if (currentBoardExists) {
          toast({ title: "Connection Issue", description: "Lost real-time connection to the board. Some changes may not appear automatically.", variant: "destructive" });
        }
      }
      sseConnected = false;
      eventSource.close();
    };

    return () => {
      if (sseConnected) {
        console.log(`SSE: Closing connection for board ${boardId}`);
        eventSource.close();
        sseConnected = false;
      }
    };
  }, [boardId, storeActions, router, toast, params.boardId]); // params.boardId to ensure effect reruns if it changes (though boardId itself should suffice)


  const currentBoardFromStore = useMemo(() => boards.find(b => b.id === boardId), [boards, boardId]);

  const currentBoard = useMemo(() => {
    if (!currentBoardFromStore) return null;

    const board = { ...currentBoardFromStore }; 
    board.cards = board.cards ? { ...board.cards } : {};

    const sanitizedColumns: BoardData['columns'] = {
        wentWell: {
            ...(currentBoardFromStore.columns?.wentWell || INITIAL_COLUMNS_DATA.wentWell),
            id: 'wentWell', 
            title: DEFAULT_COLUMNS_CONFIG.wentWell.title, 
            cardIds: Array.isArray(currentBoardFromStore.columns?.wentWell?.cardIds) 
                ? [...currentBoardFromStore.columns.wentWell.cardIds] 
                : [], 
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
    
    (Object.keys(board.columns) as ColumnId[]).forEach(colId => {
        const column = board.columns[colId];
        column.cardIds = column.cardIds.filter(cardId => board.cards[cardId] !== undefined);
        column.cardIds.forEach((cardId, index) => {
            if (board.cards[cardId]) { 
                if (board.cards[cardId].order !== index) {
                    board.cards[cardId] = { ...board.cards[cardId], order: index };
                }
            }
        });
    });

    return board;
  }, [currentBoardFromStore]);


  const handleAddCard = useCallback(async (columnId: ColumnId, content: string) => {
    if (!currentBoard || !user) { // Check currentBoard which is derived and sanitized
        toast({ title: "Cannot Add Card", description: "Board or user data is missing, or board is not fully loaded.", variant: "destructive" });
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
    if (!currentBoard) {
      toast({ title: "Cannot Update Card", description: "Board data is missing.", variant: "destructive" });
      return;
    }
    try {
        await storeActions.updateCardContent(currentBoard.id, cardId, newContent);
    } catch (error) {
        console.error("Error in handleUpdateCard:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while updating the card.";
        toast({ title: "Failed to Update Card", description: errorMessage, variant: "destructive" });
    }
  }, [currentBoard, storeActions, toast]);

  const handleDeleteCard = useCallback(async (cardId: string, columnId: ColumnId) => {
    if (!currentBoard) {
      toast({ title: "Cannot Delete Card", description: "Board data is missing.", variant: "destructive" });
      return;
    }
     try {
        await storeActions.deleteCard(currentBoard.id, columnId, cardId);
    } catch (error) {
        console.error("Error in handleDeleteCard:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while deleting the card.";
        toast({ title: "Failed to Delete Card", description: errorMessage, variant: "destructive" });
    }
  }, [currentBoard, storeActions, toast]);

  const handleUpvoteCard = useCallback(async (cardId: string) => {
    if (!currentBoard || !user) {
      toast({ title: "Cannot Upvote Card", description: "Board or user data is missing.", variant: "destructive" });
      return;
    }
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
    // Use currentBoardFromStore directly for the check, as currentBoard might be briefly null during updates
    const boardState = useBoardStore.getState().boards.find(b => b.id === boardId); 
    if (!boardState) {
      console.error("Board not found in store, cannot process drag.");
      setDraggedItem(null);
      toast({ title: "Drag Error", description: "Board data is not available in store.", variant: "destructive" });
      return;
    }
    if (!boardState.cards || !boardState.cards[draggedCardId]) {
      console.error("Dragged card is missing from board cards record or board.cards is undefined.");
      setDraggedItem(null);
      toast({ title: "Drag Error", description: "Dragged card data is missing.", variant: "destructive" });
      return;
    }
  
    try {
        await storeActions.moveCard(
          boardState.id, // Use boardState.id
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
  }, [boardId, storeActions, toast]); // Depend on boardId to get the correct board state


  const handleAISuggestions = useCallback(async () => {
    if (!currentBoard || !user || !currentBoard.columns || !currentBoard.cards) { // Check derived currentBoard
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
    return <div className="text-center py-10">User not set up. Redirecting to home... <Link href="/"><Button variant="link">Go Home Now</Button></Link></div>;
  }
  
  if (isLoadingAllBoards && !currentBoardFromStore) { // Still loading all boards AND this specific one isn't in store yet
     return <div className="text-center py-10">Loading board data...</div>;
  }
  
  if (!currentBoard) { // This currentBoard is the sanitized, memoized version
      return (
        <div className="text-center py-10">
          Board not found or is being loaded. If this persists, the board may not exist or access is denied.
          <Link href="/"><Button variant="link">Go Home</Button></Link>
        </div>
      );
  }
  
  if (!currentBoard.columns || !currentBoard.cards) {
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
            const columnData = currentBoard.columns![columnId] || { ...INITIAL_COLUMNS_DATA[columnId], cardIds: [] };
            const cardIdsForColumn = Array.isArray(columnData.cardIds) ? columnData.cardIds : [];
            
            const cardsRecord = currentBoard.cards || {};
            
            const cardsForColumn = cardIdsForColumn
              .map(id => cardsRecord[id]) 
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
                currentUserId={user?.id || ''} // Still needed for RetroCard logic
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
