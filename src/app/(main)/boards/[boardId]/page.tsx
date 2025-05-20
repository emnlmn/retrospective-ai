
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
  const [isBoardConfirmedValid, setIsBoardConfirmedValid] = useState(false); 

  useEffect(() => {
    if (boardId) {
      storeActions.setCurrentBoardId(boardId);
      setIsBoardConfirmedValid(false); // Always start as unconfirmed for a new/changed boardId
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
        console.log(`SSE: Received boardUpdate for board ${boardId}`, updatedBoardFromServer);
        
        if (updatedBoardFromServer && updatedBoardFromServer.id === boardId) {
          storeActions.setBoardFromServer(updatedBoardFromServer);
          setIsBoardConfirmedValid(true); 
        } else if (updatedBoardFromServer === null && params.boardId === boardId) { 
          // Server confirms the current boardId is null (deleted or never existed for this server session)
          setIsBoardConfirmedValid(false);
          const boardIsCurrentlyInClientStore = useBoardStore.getState().boards.find(b => b.id === boardId);
          
          if (boardIsCurrentlyInClientStore) {
            console.log(`SSE: Board ${boardId} is null on server, but was in client store. Redirecting.`);
            toast({ title: "Board Unavailable", description: "This board may have been deleted or is no longer accessible. Redirecting to home...", variant: "destructive" });
            storeActions.removeBoardFromServer(boardId); // Remove from client store
            router.push('/');
          } else {
            // Board wasn't in client store and server says it's null.
            // This is expected for an invalid URL or a board that truly doesn't exist.
            // The UI will show "Board not found or is being loaded..."
            console.warn(`SSE: Received null for board ${boardId}, and it wasn't in client store. Likely an invalid URL.`);
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
        const currentBoardExistsInStore = useBoardStore.getState().boards.find(b => b.id === boardId);
        if (currentBoardExistsInStore) { // Only show error if user was actively viewing a (previously) valid board
            toast({ title: "Connection Issue", description: "Lost real-time connection to the board. Some changes may not appear automatically.", variant: "destructive" });
        }
      }
      // On a generic SSE error, we don't automatically assume the board is invalid,
      // as it could be a temporary network blip. We'll rely on explicit null updates for validity.
      // However, we might want to set isBoardConfirmedValid to false if we lose connection to a board we thought was valid.
      // For now, let's be conservative.
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
  }, [boardId, storeActions, router, toast, params.boardId]);


  const currentBoardFromStore = useMemo(() => boards.find(b => b.id === boardId), [boards, boardId]);

  const currentBoard = useMemo(() => {
    if (!currentBoardFromStore) return null;

    // Deep clone and sanitize the board data from the store
    const board = JSON.parse(JSON.stringify(currentBoardFromStore)) as BoardData;
    board.cards = board.cards || {};
    
    const sanitizedColumns: BoardData['columns'] = {
        wentWell: {
            ...(board.columns?.wentWell || INITIAL_COLUMNS_DATA.wentWell),
            id: 'wentWell', 
            title: DEFAULT_COLUMNS_CONFIG.wentWell.title, 
            cardIds: Array.isArray(board.columns?.wentWell?.cardIds) 
                ? [...board.columns.wentWell.cardIds] 
                : [], 
        },
        toImprove: {
            ...(board.columns?.toImprove || INITIAL_COLUMNS_DATA.toImprove),
            id: 'toImprove',
            title: DEFAULT_COLUMNS_CONFIG.toImprove.title,
            cardIds: Array.isArray(board.columns?.toImprove?.cardIds)
                ? [...board.columns.toImprove.cardIds]
                : [],
        },
        actionItems: {
            ...(board.columns?.actionItems || INITIAL_COLUMNS_DATA.actionItems),
            id: 'actionItems',
            title: DEFAULT_COLUMNS_CONFIG.actionItems.title,
            cardIds: Array.isArray(board.columns?.actionItems?.cardIds)
                ? [...board.columns.actionItems.cardIds]
                : [],
        },
    };
    board.columns = sanitizedColumns;
    
    (Object.keys(board.columns) as ColumnId[]).forEach(colId => {
        const column = board.columns[colId];
        if (column && Array.isArray(column.cardIds)) {
          column.cardIds = column.cardIds.filter(cardId => board.cards && board.cards[cardId] !== undefined);
          column.cardIds.forEach((cardId, index) => {
              if (board.cards && board.cards[cardId]) { 
                  board.cards[cardId].order = index; // Ensure order is set based on array position
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
    if (!currentBoard || !user) { // currentBoard check relies on derived state from store
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
    const boardForAction = useBoardStore.getState().boards.find(b => b.id === boardId);
    if (!boardForAction) {
      toast({ title: "Cannot Update Card", description: "Board data is missing.", variant: "destructive" });
      return;
    }
    try {
        await storeActions.updateCardContent(boardForAction.id, cardId, newContent);
    } catch (error) {
        console.error("Error in handleUpdateCard:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while updating the card.";
        toast({ title: "Failed to Update Card", description: errorMessage, variant: "destructive" });
    }
  }, [boardId, storeActions, toast, isBoardConfirmedValid]);

  const handleDeleteCard = useCallback(async (cardId: string, columnId: ColumnId) => {
    if (!isBoardConfirmedValid) {
      toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" });
      return;
    }
    const boardForAction = useBoardStore.getState().boards.find(b => b.id === boardId);
    if (!boardForAction) {
      toast({ title: "Cannot Delete Card", description: "Board data is missing.", variant: "destructive" });
      return;
    }
     try {
        await storeActions.deleteCard(boardForAction.id, columnId, cardId);
    } catch (error) {
        console.error("Error in handleDeleteCard:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while deleting the card.";
        toast({ title: "Failed to Delete Card", description: errorMessage, variant: "destructive" });
    }
  }, [boardId, storeActions, toast, isBoardConfirmedValid]);

  const handleUpvoteCard = useCallback(async (cardId: string) => {
    if (!isBoardConfirmedValid) {
      toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" });
      return;
    }
    const boardForAction = useBoardStore.getState().boards.find(b => b.id === boardId);
    if (!boardForAction || !user) {
      toast({ title: "Cannot Upvote Card", description: "Board or user data is missing.", variant: "destructive" });
      return;
    }
    try {
        await storeActions.upvoteCard(boardForAction.id, cardId, user.id); 
    } catch (error) {
        console.error("Error in handleUpvoteCard:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while upvoting the card.";
        toast({ title: "Failed to Upvote Card", description: errorMessage, variant: "destructive" });
    }
  }, [boardId, user, storeActions, toast, isBoardConfirmedValid]);

  const handleDragEnd = useCallback(async (
    draggedCardId: string, 
    sourceColumnId: ColumnId, 
    destColumnId: ColumnId, 
    destinationIndexInDropTarget: number,
    mergeTargetCardId?: string
  ) => {
    if (!isBoardConfirmedValid) {
      toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid. Drag action cancelled.", variant: "destructive" });
      setDraggedItem(null); 
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
    const boardForAction = useBoardStore.getState().boards.find(b => b.id === boardId);
    if (!boardForAction || !user || !boardForAction.columns || !boardForAction.cards) { 
        toast({ title: "Error", description: "Board data is not fully loaded for AI suggestions.", variant: "destructive" });
        return;
    }
    setIsAISuggesting(true);
    try {
      const toImproveColumn = boardForAction.columns.toImprove;
      const toImproveCardsContent = (toImproveColumn.cardIds || [])
        .map(cardId => boardForAction.cards![cardId]?.content) 
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
          // Using boardForAction.id ensures we use the ID of the board currently confirmed to be in the store
          await storeActions.addCard(boardForAction.id, 'actionItems', itemContent, ' (AI Suggested)');
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
  }, [boardId, user, storeActions, toast, isBoardConfirmedValid]);

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
    return <div className="text-center py-10">User not set up. Please refresh or ensure user setup is complete. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }
  
  if (isLoadingAllBoards && !currentBoard) { // If all boards are loading from API and we don't have this specific one yet
     return <div className="text-center py-10">Loading board data...</div>;
  }
  
  // At this point, user is loaded. We check board validity.
  // `currentBoard` is derived from the store. `isBoardConfirmedValid` is set by SSE.
  // If not confirmed valid AND not in store (currentBoard is null), it's likely loading or invalid URL.
  if (!isBoardConfirmedValid && !currentBoard) { 
      return (
        <div className="text-center py-10">
          Board not found or is being loaded. If this persists, the board may not exist or access is denied.
          <Link href="/"><Button variant="link">Go Home</Button></Link>
        </div>
      );
  }
  
  // If board WAS in store (currentBoard is not null) but is NO LONGER confirmed valid (e.g. SSE said null)
  // The SSE handler should have redirected. This is a fallback.
  if (!isBoardConfirmedValid && currentBoard) {
     return (
        <div className="text-center py-10">
          Board is no longer available or connection lost. Attempting to redirect...
          <Link href="/"><Button variant="link">Go Home</Button></Link>
        </div>
      );
  }

  // If it is confirmed valid, but currentBoard is somehow null (shouldn't happen if SSE sets board data)
  if (isBoardConfirmedValid && !currentBoard) {
    return (
      <div className="text-center py-10">
        Board data is inconsistent. Trying to sync...
        <Link href="/"><Button variant="link">Go Home</Button></Link>
      </div>
    );
  }

  // Final check: if currentBoard exists but its critical structures are missing
  if (currentBoard && (!currentBoard.columns || !currentBoard.cards)) {
    return <div className="text-center py-10">Board data is incomplete. Trying to sync... <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }
  
  // If none of the above, but currentBoard is still null (e.g., after all loading, boardId is simply invalid and no SSE confirmed it)
  if (!currentBoard) {
     return (
        <div className="text-center py-10">
          Board not found.
          <Link href="/"><Button variant="link">Go Home</Button></Link>
        </div>
      );
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
            // Ensure columnData is always defined, falling back to initial structure
            const columnData = currentBoard.columns![columnId] || { ...INITIAL_COLUMNS_DATA[columnId], id: columnId, title: columnConfig.title, cardIds: [] };
            const cardIdsForColumn = Array.isArray(columnData.cardIds) ? columnData.cardIds : [];
            
            const cardsRecord = currentBoard.cards || {};
            
            const cardsForColumn = cardIdsForColumn
              .map(id => cardsRecord[id]) 
              .filter((card): card is CardData => !!card && typeof card.order === 'number') // Ensure card exists and has order
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
                isBoardConfirmedValid={isBoardConfirmedValid}
              />
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

