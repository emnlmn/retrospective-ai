
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

  const { user, isUserLoading: isStoreUserLoading, boards, isLoadingAllBoards } = useBoardStore((state) => ({
    user: state.user,
    isUserLoading: state.isUserLoading,
    boards: state.boards,
    isLoadingAllBoards: state.isBoardsLoading, // This is for the global list, not this specific board
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

    // console.log(`SSE: Initializing for board ${boardId}.`);
    const eventSource = new EventSource(`/api/boards/${boardId}/events`);
    let sseConnected = true;

    eventSource.onopen = () => {
      // console.log(`SSE: Connection opened for board ${boardId}`);
      sseConnected = true;
    };

    eventSource.addEventListener('boardUpdate', (event) => {
      try {
        const updatedBoardFromServer = JSON.parse(event.data as string) as BoardData | null;
        const currentBoardIdFromParams = params.boardId as string; // Use current params.boardId

        // console.log(`SSE: Received boardUpdate for board ${currentBoardIdFromParams}`, updatedBoardFromServer);

        if (updatedBoardFromServer && updatedBoardFromServer.id === currentBoardIdFromParams) {
          storeActions.setBoardFromServer(updatedBoardFromServer);
          setIsBoardConfirmedValid(true);
        } else if (updatedBoardFromServer === null && currentBoardIdFromParams === boardId) { // Check if null is for THIS board
          // Server explicitly says THIS board is null.
          setIsBoardConfirmedValid(false); // Board is no longer valid for this session

          const boardStillInClientStore = useBoardStore.getState().boards.find(b => b.id === currentBoardIdFromParams);
          if (boardStillInClientStore) {
            // If the board was considered valid (or at least known) by the client
            // and now the server says it's null, it means it was deleted or became inaccessible.
            storeActions.removeBoardFromServer(currentBoardIdFromParams); // Clean up client state
            toast({ title: "Board Unavailable", description: "This board was deleted or is no longer accessible. Redirecting to home...", variant: "destructive" });
            router.push('/');
          } else {
            // Board was NOT in client store, and server says null.
            // This could be an invalid URL, or a new board whose creation event hasn't arrived yet.
            // We don't redirect here; let the UI show "Connecting..." or "Board not found...".
            // If it's a new board, the actual non-null board data event should arrive shortly from addBoardToDB's emit.
             console.warn(`SSE: Received null for board ${currentBoardIdFromParams}, and it wasn't in client store. Likely an invalid URL or awaiting its creation event.`);
          }
        }
      } catch (error) {
        console.error('SSE: Failed to parse boardUpdate:', error);
        toast({ title: "Real-time Sync Error", description: "Could not process an update from the server.", variant: "destructive" });
      }
    });

    eventSource.onerror = (error) => {
      console.error(`SSE: EventSource failed for board ${boardId}:`, error);
      if (sseConnected) { // Only toast if it was previously connected
        const currentBoardExistsInStore = useBoardStore.getState().boards.find(b => b.id === boardId);
        if (currentBoardExistsInStore) { // Only toast if the user was likely viewing a valid board
            toast({ title: "Connection Issue", description: "Lost real-time connection to the board. Some changes may not appear automatically.", variant: "destructive" });
        }
      }
      sseConnected = false;
      eventSource.close();
    };

    return () => {
      if (sseConnected) {
        // console.log(`SSE: Closing connection for board ${boardId}`);
        eventSource.close();
        sseConnected = false;
      }
    };
  }, [boardId, storeActions, router, toast, params.boardId]); // Removed isBoardConfirmedValid


  const currentBoardFromStore = useMemo(() => boards.find(b => b.id === boardId), [boards, boardId]);

  const currentBoard = useMemo(() => {
    if (!currentBoardFromStore) return null;
    // Create a deep copy to avoid mutating the store state directly
    const board = JSON.parse(JSON.stringify(currentBoardFromStore)) as BoardData;

    // Ensure cards object exists
    board.cards = board.cards || {};

    // Sanitize columns: ensure all default columns exist and cardIds is an array
    const sanitizedColumns: BoardData['columns'] = {
        wentWell: { ...(board.columns?.wentWell || INITIAL_COLUMNS_DATA.wentWell), id: 'wentWell', title: DEFAULT_COLUMNS_CONFIG.wentWell.title, cardIds: Array.isArray(board.columns?.wentWell?.cardIds) ? [...board.columns.wentWell.cardIds] : [], },
        toImprove: { ...(board.columns?.toImprove || INITIAL_COLUMNS_DATA.toImprove), id: 'toImprove', title: DEFAULT_COLUMNS_CONFIG.toImprove.title, cardIds: Array.isArray(board.columns?.toImprove?.cardIds) ? [...board.columns.toImprove.cardIds] : [], },
        actionItems: { ...(board.columns?.actionItems || INITIAL_COLUMNS_DATA.actionItems), id: 'actionItems', title: DEFAULT_COLUMNS_CONFIG.actionItems.title, cardIds: Array.isArray(board.columns?.actionItems?.cardIds) ? [...board.columns.actionItems.cardIds] : [], },
    };
    board.columns = sanitizedColumns;

    // Filter out orphaned cardIds from columns and ensure card order is set
    (Object.keys(board.columns) as ColumnId[]).forEach(colId => {
        const column = board.columns[colId];
        if (column && Array.isArray(column.cardIds)) {
          // Filter cardIds that don't exist in board.cards
          column.cardIds = column.cardIds.filter(cardId => board.cards && board.cards[cardId] !== undefined);
          // Ensure order property is set for cards in this column
          column.cardIds.forEach((cardId, index) => {
            if (board.cards && board.cards[cardId]) {
              board.cards[cardId].order = index;
            }
          });
        }
    });
    return board;
  }, [currentBoardFromStore]);


  const handleAddCard = useCallback(async (columnId: ColumnId, content: string) => {
    if (!isBoardConfirmedValid) { toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" }); return; }
    const boardForAction = useBoardStore.getState().boards.find(b => b.id === boardId); // Get latest board state
    if (!boardForAction || !user) { toast({ title: "Cannot Add Card", description: "Board or user data is missing, or board is not fully loaded.", variant: "destructive" }); return; }
    try { await storeActions.addCard(boardForAction.id, columnId, content); }
    catch (error) { console.error("Error in handleAddCard:", error); const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while adding the card."; toast({ title: "Failed to Add Card", description: errorMessage, variant: "destructive" }); }
  }, [boardId, user, storeActions, toast, isBoardConfirmedValid]);

  const handleUpdateCard = useCallback(async (cardId: string, newContent: string) => {
    if (!isBoardConfirmedValid) { toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" }); return; }
    const boardForAction = useBoardStore.getState().boards.find(b => b.id === boardId);
    if (!boardForAction) { toast({ title: "Cannot Update Card", description: "Board data is missing.", variant: "destructive" }); return; }
    try { await storeActions.updateCardContent(boardForAction.id, cardId, newContent); }
    catch (error) { console.error("Error in handleUpdateCard:", error); const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while updating the card."; toast({ title: "Failed to Update Card", description: errorMessage, variant: "destructive" }); }
  }, [boardId, storeActions, toast, isBoardConfirmedValid]);

  const handleDeleteCard = useCallback(async (cardId: string, columnId: ColumnId) => {
    if (!isBoardConfirmedValid) { toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" }); return; }
    const boardForAction = useBoardStore.getState().boards.find(b => b.id === boardId);
    if (!boardForAction) { toast({ title: "Cannot Delete Card", description: "Board data is missing.", variant: "destructive" }); return; }
    try { await storeActions.deleteCard(boardForAction.id, columnId, cardId); }
    catch (error) { console.error("Error in handleDeleteCard:", error); const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while deleting the card."; toast({ title: "Failed to Delete Card", description: errorMessage, variant: "destructive" }); }
  }, [boardId, storeActions, toast, isBoardConfirmedValid]);

  const handleUpvoteCard = useCallback(async (cardId: string) => {
    if (!isBoardConfirmedValid) { toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" }); return; }
    const boardForAction = useBoardStore.getState().boards.find(b => b.id === boardId);
    if (!boardForAction || !user) { toast({ title: "Cannot Upvote Card", description: "Board or user data is missing.", variant: "destructive" }); return; }
    try { await storeActions.upvoteCard(boardForAction.id, cardId, user.id); }
    catch (error) { console.error("Error in handleUpvoteCard:", error); const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while upvoting the card."; toast({ title: "Failed to Upvote Card", description: errorMessage, variant: "destructive" }); }
  }, [boardId, user, storeActions, toast, isBoardConfirmedValid]);

  const handleDragEnd = useCallback(async (draggedCardId: string, sourceColumnId: ColumnId, destColumnId: ColumnId, destinationIndexInDropTarget: number, mergeTargetCardId?: string) => {
    if (!isBoardConfirmedValid) { toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid. Drag action cancelled.", variant: "destructive" }); setDraggedItem(null); return; }
    const boardState = useBoardStore.getState().boards.find(b => b.id === boardId);
    if (!boardState) { console.error("Board not found in store, cannot process drag."); setDraggedItem(null); toast({ title: "Drag Error", description: "Board data is not available in store.", variant: "destructive" }); return; }
    if (!boardState.cards || !boardState.cards[draggedCardId]) { console.error("Dragged card is missing from board cards record or board.cards is undefined."); setDraggedItem(null); toast({ title: "Drag Error", description: "Dragged card data is missing.", variant: "destructive" }); return; }
    try { await storeActions.moveCard(boardState.id, draggedCardId, sourceColumnId, destColumnId, destinationIndexInDropTarget, mergeTargetCardId); }
    catch (error) { console.error("Error in handleDragEnd:", error); const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while moving the card."; toast({ title: "Failed to Move Card", description: errorMessage, variant: "destructive" }); }
    finally { setDraggedItem(null); }
  }, [boardId, storeActions, toast, isBoardConfirmedValid]);

  const handleAISuggestions = useCallback(async () => {
    if (!isBoardConfirmedValid) { toast({ title: "Action Denied", description: "Board is not currently available or confirmed valid.", variant: "destructive" }); return; }
    const boardForAction = useBoardStore.getState().boards.find(b => b.id === boardId);
    if (!boardForAction || !user || !boardForAction.columns || !boardForAction.cards) { toast({ title: "Error", description: "Board data is not fully loaded for AI suggestions.", variant: "destructive" }); return; }
    setIsAISuggesting(true);
    try {
      const toImproveColumn = boardForAction.columns.toImprove;
      const toImproveCardsContent = (toImproveColumn.cardIds || []).map(cardId => boardForAction.cards![cardId]?.content).filter(content => !!content).join('\n- ');
      if (!toImproveCardsContent.trim()) { toast({ title: "AI Suggestions", description: "Add some items to the 'To Improve' column first.", variant: "default" }); setIsAISuggesting(false); return; }
      const input: SuggestActionItemsInput = { toImproveColumnContent: `- ${toImproveCardsContent}` };
      const result = await suggestActionItems(input);
      if (result.actionItems && result.actionItems.length > 0) { for (const itemContent of result.actionItems) { await storeActions.addCard(boardForAction.id, 'actionItems', itemContent, ' (AI Suggested)'); } toast({ title: "AI Suggestions Added", description: `${result.actionItems.length} action items added.` }); }
      else { toast({ title: "AI Suggestions", description: "No action items were suggested." }); }
    } catch (error) { console.error("AI suggestion error:", error); toast({ title: "AI Error", description: "Could not get AI suggestions.", variant: "destructive" }); }
    setIsAISuggesting(false);
  }, [boardId, user, storeActions, toast, isBoardConfirmedValid]);

  const handleShareBoard = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const boardUrl = window.location.href;
    try { await navigator.clipboard.writeText(boardUrl); toast({ title: "Link Copied!", description: "Board link copied to clipboard." }); }
    catch (err) { console.error('Failed to copy: ', err); toast({ title: "Error", description: "Could not copy link to clipboard.", variant: "destructive" }); }
  }, [toast]);


  // --- Rendering Logic ---
  if (isStoreUserLoading) {
    return <div className="text-center py-10">Loading user data...</div>;
  }
  if (!user) { // Should be caught by UserProvider, but as a safeguard
    return <div className="text-center py-10">User not set up. Please ensure user setup is complete. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }

  // If the board IS in the client's store (currentBoard is populated), but the server hasn't YET confirmed its validity for THIS session.
  if (currentBoard && !isBoardConfirmedValid) {
     return (<div className="text-center py-10">Connecting to board and verifying...<Link href="/"><Button variant="link">Go Home</Button></Link></div>);
  }

  // If the board isn't in the client's store yet AND the server hasn't confirmed its validity for this session via SSE.
  // This covers:
  // 1. Invalid boardId in URL.
  // 2. Newly created board, client store hasn't received its data via SSE yet.
  if (!currentBoard && !isBoardConfirmedValid) {
      // The SSE logic will handle redirection if a board known to client is later confirmed null by server.
      // Otherwise, this message persists for truly invalid URLs or until SSE populates the new board.
      return (<div className="text-center py-10">Board not found or is being loaded. If this persists, the board may not exist or access is denied.<Link href="/"><Button variant="link">Go Home</Button></Link></div>);
  }
  
  // If it IS confirmed valid by the server, but somehow not in the client store (should be rare, implies sync issue)
  // This could also happen briefly if an SSE `null` event removed the board from store, and `isBoardConfirmedValid` is false,
  // leading to the condition above, but if for some reason it was confirmed then removed, this is a fallback.
  if (isBoardConfirmedValid && !currentBoard) {
    // This state implies a sync issue or that the board was confirmed then immediately deleted by another event
    // before Zustand could fully update currentBoard for this render, OR SSE removed it while confirmed.
    // The SSE handler should have redirected if it was a server-confirmed deletion of a known board.
    // Showing a "trying to sync" message and allowing SSE to correct is reasonable.
    return (<div className="text-center py-10">Board data is inconsistent. Trying to sync...<Link href="/"><Button variant="link">Go Home</Button></Link></div>);
  }

  // Final check: if currentBoard is still null after all the above, then it's truly not found,
  // or an edge case where isBoardConfirmedValid is true but currentBoard isn't (should be handled by above).
  if (!currentBoard) {
     // This implies isBoardConfirmedValid is false, caught by the "!currentBoard && !isBoardConfirmedValid" case.
     // If it reaches here, something is very off. The previous conditions should cover all states.
     // For safety, we provide a generic "not found".
     return (<div className="text-center py-10">Board not found.<Link href="/"><Button variant="link">Go Home</Button></Link></div>);
  }
  
  if (!currentBoard.columns || !currentBoard.cards) {
    // This usually means currentBoard exists but is malformed.
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
            const columnData = currentBoard.columns![columnId] || { ...INITIAL_COLUMNS_DATA[columnId], id: columnId, title: columnConfig.title, cardIds: [] };
            
            const cardIdsForColumn = Array.isArray(columnData.cardIds) ? columnData.cardIds : [];
            const cardsRecord = currentBoard.cards || {};
            
            const cardsForColumn = cardIdsForColumn
              .map(id => cardsRecord[id])
              .filter((card): card is CardData => !!card && typeof card.order === 'number') // Ensure card exists and order is a number
              .sort((a, b) => (a.order as number) - (b.order as number)); // Sort by order

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
