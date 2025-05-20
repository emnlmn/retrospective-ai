
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
  
  const { user, isUserLoading: isStoreUserLoading, boards } = useBoardStore((state) => ({
    user: state.user,
    isUserLoading: state.isUserLoading,
    boards: state.boards,
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

    const eventSource = new EventSource(`/api/boards/${boardId}/events`);

    eventSource.onmessage = (event) => {
      // Generic message handler, can be ignored if not sending generic messages
    };

    eventSource.addEventListener('boardUpdate', (event) => {
      try {
        const updatedBoardFromServer = JSON.parse(event.data as string) as BoardData | null;
        
        if (updatedBoardFromServer && updatedBoardFromServer.id === boardId) {
          storeActions.setBoardFromServer(updatedBoardFromServer);
        } else if (updatedBoardFromServer === null && boardId === params.boardId) {
          // Server explicitly says this current board is null.
          const boardStillInClientStore = boards.find(b => b.id === boardId); // Check current store state
          if (boardStillInClientStore) { // If client *previously* thought it existed (e.g. from a list view or previous state)
            toast({ title: "Board Unavailable", description: "This board may have been deleted or is no longer accessible. Redirecting to home...", variant: "destructive" });
            storeActions.removeBoardFromServer(boardId); // Remove from client store
            router.push('/'); // Redirect to home because the board the user was on is gone
          } else {
            // Client didn't know about it from its main 'boards' list, and server says it's null.
            // This could be an invalid URL or a board that's just been created and initial SSE state was null.
            // If it's an invalid URL, we should also redirect.
            // The `currentBoard` check later in the render path will handle showing "Board not found".
            // For truly invalid URLs that will never resolve, redirecting is good.
            const isCurrentBoardPage = params.boardId === boardId;
            if (isCurrentBoardPage) { // Only redirect if this is the current page the user is trying to view
                 toast({ title: "Board Not Found", description: "The requested board does not exist or could not be loaded. Redirecting to home...", variant: "destructive" });
                 router.push('/');
            }
          }
        }
        // If updatedBoardFromServer is for a *different* board ID, ignore it.
      } catch (error) {
        console.error('Failed to parse SSE board update:', error);
        toast({ title: "Real-time Sync Error", description: "Could not process an update from the server.", variant: "destructive" });
      }
    });
    
    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      toast({ title: "Connection Issue", description: "Lost real-time connection to the board. Some changes may not appear automatically.", variant: "destructive" });
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [boardId, storeActions, router, toast, params.boardId, boards]); // boards added for boardStillInClientStore check


  const currentBoardFromStore = useMemo(() => boards.find(b => b.id === boardId), [boards, boardId]);

  const currentBoard = useMemo(() => {
    if (!currentBoardFromStore) return null;

    // Create a new object to avoid mutating the store directly, ensure all reads are fresh.
    const board = { ...currentBoardFromStore }; 
    // Deep copy cards and columns as they will be modified for sanitization/ordering
    board.cards = board.cards ? { ...board.cards } : {};

    // Ensure all default columns exist, even if not present in fetched data (for resilience)
    const sanitizedColumns: BoardData['columns'] = {
        wentWell: {
            ...(currentBoardFromStore.columns?.wentWell || INITIAL_COLUMNS_DATA.wentWell), // Spread to copy
            cardIds: Array.isArray(currentBoardFromStore.columns?.wentWell?.cardIds)
                ? [...currentBoardFromStore.columns.wentWell.cardIds] // Spread to copy array
                : [],
        },
        toImprove: {
            ...(currentBoardFromStore.columns?.toImprove || INITIAL_COLUMNS_DATA.toImprove),
            cardIds: Array.isArray(currentBoardFromStore.columns?.toImprove?.cardIds)
                ? [...currentBoardFromStore.columns.toImprove.cardIds]
                : [],
        },
        actionItems: {
            ...(currentBoardFromStore.columns?.actionItems || INITIAL_COLUMNS_DATA.actionItems),
            cardIds: Array.isArray(currentBoardFromStore.columns?.actionItems?.cardIds)
                ? [...currentBoardFromStore.columns.actionItems.cardIds]
                : [],
        },
    };
    
    // Ensure titles are from default config (in case they are missing from DB)
    (Object.keys(sanitizedColumns) as ColumnId[]).forEach(colId => {
        sanitizedColumns[colId].title = DEFAULT_COLUMNS_CONFIG[colId].title;
    });
    board.columns = sanitizedColumns;
    
    // Sanitize card orders and ensure cards in columns exist in the main cards record
    (Object.keys(board.columns) as ColumnId[]).forEach(colId => {
        const column = board.columns[colId];
        // Filter out cardIds that don't exist in board.cards
        column.cardIds = column.cardIds.filter(cardId => board.cards[cardId] !== undefined);
        // Ensure correct order for cards within each column
        column.cardIds.forEach((cardId, index) => {
            if (board.cards[cardId]) { // Check if card exists
                // Create a new card object if order needs to be updated for immutability
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
        // SSE will update the state
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
        // SSE will update the state
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
        // SSE will update the state
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
        // SSE will update the state
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
    destinationIndexInDropTarget: number, // This is the visual index where it was dropped in the target list
    mergeTargetCardId?: string
  ) => {
    if (!currentBoard) {
      console.error("Board not found, cannot process drag.");
      setDraggedItem(null); // Reset dragged item state
      toast({ title: "Drag Error", description: "Board data is not available.", variant: "destructive" });
      return;
    }
    if (!currentBoard.cards || !currentBoard.cards[draggedCardId]) {
      console.error("Dragged card is missing from board cards record or board.cards is undefined.");
      setDraggedItem(null); // Reset dragged item state
      toast({ title: "Drag Error", description: "Dragged card data is missing.", variant: "destructive" });
      return;
    }
  
    try {
        await storeActions.moveCard(
          currentBoard.id,
          draggedCardId,
          sourceColumnId,
          destColumnId,
          destinationIndexInDropTarget, // Pass the visual drop index directly
          mergeTargetCardId
        );
        // SSE will update the state
    } catch (error) {
        console.error("Error in handleDragEnd:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred while moving the card.";
        toast({ title: "Failed to Move Card", description: errorMessage, variant: "destructive" });
        // Optionally, re-fetch board state here if SSE isn't fully trusted or for immediate rollback view
    } finally {
        setDraggedItem(null); // Always reset dragged item state
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
        // Add cards one by one; SSE will handle board updates
        for (const itemContent of result.actionItems) {
          // The addCard action in store now correctly uses user.name
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
    // This case should ideally be handled by UserProvider redirecting or showing setup dialog
    return <div className="text-center py-10">User not set up. Redirecting to home... <Link href="/"><Button variant="link">Go Home Now</Button></Link></div>;
  }
  
  // Check if boards are loading (initial fetch) AND we don't have this specific board yet from the store
  const isLoadingAllBoards = useBoardStore.getState().isBoardsLoading;
  if (isLoadingAllBoards && !currentBoardFromStore) {
     return <div className="text-center py-10">Loading board data...</div>;
  }
  
  // If after all loading, currentBoard (derived and sanitized) is still null, then board not found
  if (!currentBoard) { 
      // This message is shown if boardId is invalid or if a new board's SSE hasn't arrived yet
      return <div className="text-center py-10">Board not found or is being loaded. If this persists, the board may not exist or access is denied. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }
  
  // Further check for structural integrity, though `useMemo` for `currentBoard` should sanitize
  if (!currentBoard.columns || !currentBoard.cards) {
    // This state should be rare if sanitization in useMemo for `currentBoard` is effective
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
            // currentBoard.columns and currentBoard.columns[columnId] should be guaranteed by the checks above
            // and the sanitization in the useMemo for currentBoard.
            const columnData = currentBoard.columns![columnId] || { ...INITIAL_COLUMNS_DATA[columnId], cardIds: [] };
            
            // Ensure cardIds is an array before mapping
            const cardIdsForColumn = Array.isArray(columnData.cardIds) ? columnData.cardIds : [];
            
            const cardsRecord = currentBoard.cards || {}; // Should also be guaranteed
            const cardsForColumn = cardIdsForColumn
              .map(id => cardsRecord[id]) 
              // Filter out undefined cards and ensure order is a number
              .filter((card): card is CardData => !!card && typeof card.order === 'number') 
              // Sort by order (explicitly cast order to number for safety, though filter should ensure it)
              .sort((a, b) => (a.order as number) - (b.order as number));
            
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
                currentUserId={user?.id || ''} // user should be defined here
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

