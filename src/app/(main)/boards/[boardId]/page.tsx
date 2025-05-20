
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
  const [isBoardConfirmedValid, setIsBoardConfirmedValid] = useState(false); // New state

  useEffect(() => {
    if (boardId) {
      storeActions.setCurrentBoardId(boardId);
      // Initial check for board validity based on store
      const initialBoard = useBoardStore.getState().boards.find(b => b.id === boardId);
      setIsBoardConfirmedValid(!!initialBoard);
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
          setIsBoardConfirmedValid(true); // Board confirmed valid
        } else if (updatedBoardFromServer === null && boardId === boardId) { // Check current boardId
          setIsBoardConfirmedValid(false); // Board confirmed invalid
          const boardIsCurrentlyInClientStore = useBoardStore.getState().boards.find(b => b.id === boardId);
          
          if (boardIsCurrentlyInClientStore) {
            console.log(`SSE: Board ${boardId} is null on server, but was in client store. Redirecting.`);
            toast({ title: "Board Unavailable", description: "This board may have been deleted or is no longer accessible. Redirecting to home...", variant: "destructive" });
            storeActions.removeBoardFromServer(boardId);
            router.push('/');
          } else {
            console.warn(`SSE: Received null for board ${boardId}, but it wasn't in client store. It might be an invalid URL or waiting for creation event.`);
            // Do not redirect here, let UI show "Board not found or is being loaded..."
            // If it's a truly invalid board, isBoardConfirmedValid remains false.
          }
        }
      } catch (error) {
        console.error('SSE: Failed to parse boardUpdate:', error);
        toast({ title: "Real-time Sync Error", description: "Could not process an update from the server.", variant: "destructive" });
      }
    });
    
    eventSource.onerror = (error) => {
      console.error(`SSE: EventSource failed for board ${boardId}:`, error);
      if (sseConnected) { 
        const currentBoardExists = useBoardStore.getState().boards.find(b => b.id === boardId);
        if (currentBoardExists) {
          toast({ title: "Connection Issue", description: "Lost real-time connection to the board. Some changes may not appear automatically.", variant: "destructive" });
        }
      }
      sseConnected = false;
      // Don't automatically set isBoardConfirmedValid to false on generic SSE error,
      // as it might be a temporary network blip. Let explicit null updates handle validity.
      eventSource.close();
    };

    return () => {
      if (sseConnected) {
        console.log(`SSE: Closing connection for board ${boardId}`);
        eventSource.close();
        sseConnected = false;
      }
    };
  }, [boardId, storeActions, router, toast]); // Removed setIsBoardConfirmedValid from deps


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
        if (column && Array.isArray(column.cardIds)) { // Ensure column and cardIds exist
          column.cardIds = column.cardIds.filter(cardId => board.cards && board.cards[cardId] !== undefined);
          column.cardIds.forEach((cardId, index) => {
              if (board.cards && board.cards[cardId]) { 
                  if (board.cards[cardId].order !== index) {
                      board.cards[cardId] = { ...board.cards[cardId], order: index };
                  }
              }
          });
        }
    });

    return board;
  }, [currentBoardFromStore]);


  const handleAddCard = useCallback(async (columnId: ColumnId, content: string) => {
    if (!isBoardConfirmedValid) {
      toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" });
      return;
    }
    if (!currentBoard || !user) {
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
  }, [currentBoard, user, storeActions, toast, isBoardConfirmedValid]);

  const handleUpdateCard = useCallback(async (cardId: string, newContent: string) => {
    if (!isBoardConfirmedValid) {
      toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" });
      return;
    }
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
  }, [currentBoard, storeActions, toast, isBoardConfirmedValid]);

  const handleDeleteCard = useCallback(async (cardId: string, columnId: ColumnId) => {
    if (!isBoardConfirmedValid) {
      toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" });
      return;
    }
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
  }, [currentBoard, storeActions, toast, isBoardConfirmedValid]);

  const handleUpvoteCard = useCallback(async (cardId: string) => {
    if (!isBoardConfirmedValid) {
      toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" });
      return;
    }
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
  }, [currentBoard, user, storeActions, toast, isBoardConfirmedValid]);

  const handleDragEnd = useCallback(async (
    draggedCardId: string, 
    sourceColumnId: ColumnId, 
    destColumnId: ColumnId, 
    destinationIndexInDropTarget: number,
    mergeTargetCardId?: string
  ) => {
    if (!isBoardConfirmedValid) {
      toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid. Drag action cancelled.", variant: "destructive" });
      setDraggedItem(null); // Reset dragged item if action is denied
      return;
    }
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
          boardState.id, 
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
  }, [boardId, storeActions, toast, isBoardConfirmedValid]); 


  const handleAISuggestions = useCallback(async () => {
    if (!isBoardConfirmedValid) {
      toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" });
      return;
    }
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
  }, [currentBoard, user, storeActions, toast, isBoardConfirmedValid]);

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
    // This case should ideally be handled by UserProvider redirecting to setup if no user.
    // But as a fallback:
    return <div className="text-center py-10">User not set up. Please refresh or ensure user setup is complete. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }
  
  // Show loading if all boards are loading AND we don't have this specific board in the store yet from a previous fetch
  // AND the SSE hasn't yet confirmed its validity.
  if (isLoadingAllBoards && !currentBoardFromStore && !isBoardConfirmedValid) {
     return <div className="text-center py-10">Loading board data...</div>;
  }
  
  // If the board is not confirmed valid by SSE (e.g. server sent null) AND it's not in the store, then it's likely not found or still loading.
  // The router.push('/') in the SSE handler will eventually redirect if it was confirmed null after being in store.
  if (!isBoardConfirmedValid && !currentBoard) { 
      return (
        <div className="text-center py-10">
          Board not found or is being loaded. If this persists, the board may not exist or access is denied.
          <Link href="/"><Button variant="link">Go Home</Button></Link>
        </div>
      );
  }

  // If we have currentBoard (from store) but SSE hasn't YET confirmed it, we might show it optimistically
  // but if isBoardConfirmedValid becomes false later (due to SSE null), interactions will be blocked.
  // This intermediate state allows showing the board if it's in localStorage from a previous session,
  // while SSE confirms its current validity.
  if (!currentBoard) { // currentBoard is the fully sanitized one. If this is null, something is wrong with the data structure
    return (
      <div className="text-center py-10">
        Board data is inconsistent or missing critical parts. Trying to sync or redirect...
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
              <Button variant="outline" disabled={isAISuggesting || !isBoardConfirmedValid}>
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
                <AlertDialogAction onClick={handleAISuggestions} disabled={isAISuggesting || !isBoardConfirmedValid}>
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
                currentUserId={user?.id || ''} 
                draggedItem={draggedItem}
                setDraggedItem={setDraggedItem}
                isBoardConfirmedValid={isBoardConfirmedValid} // Pass down validity
              />
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

