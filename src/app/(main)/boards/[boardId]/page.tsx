
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
      // Generic message handler, might be useful for heartbeats if implemented
      // console.log('SSE generic message:', event.data);
    };

    eventSource.addEventListener('boardUpdate', (event) => {
      // console.log('SSE boardUpdate received:', event.data);
      try {
        const updatedBoardFromServer = JSON.parse(event.data as string) as BoardData | null;
        if (updatedBoardFromServer) {
          storeActions.setBoardFromServer(updatedBoardFromServer);
        } else if (updatedBoardFromServer === null) {
          // Board was deleted
          toast({ title: "Board Deleted", description: "This board has been deleted by another user.", variant: "destructive" });
          storeActions.removeBoardFromServer(boardId);
          router.push('/'); // Redirect to home
        }
      } catch (error) {
        console.error('Failed to parse SSE board update:', error);
      }
    });
    
    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error);
      // Potentially close and try to reconnect, or notify user
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [boardId, storeActions, router, toast]);


  const currentBoardFromStore = useMemo(() => boards.find(b => b.id === boardId), [boards, boardId]);

  const currentBoard = useMemo(() => {
    if (!currentBoardFromStore) return null;

    const board = { ...currentBoardFromStore }; 
    board.cards = board.cards ? { ...board.cards } : {}; 

    const sanitizedColumns: BoardData['columns'] = {
        wentWell: {
            ...(currentBoardFromStore.columns?.wentWell || INITIAL_COLUMNS_DATA.wentWell),
            cardIds: Array.isArray(currentBoardFromStore.columns?.wentWell?.cardIds)
                ? [...currentBoardFromStore.columns.wentWell.cardIds] 
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
    
    (Object.keys(sanitizedColumns) as ColumnId[]).forEach(colId => {
        sanitizedColumns[colId].title = DEFAULT_COLUMNS_CONFIG[colId].title;
    });
    board.columns = sanitizedColumns;
    
    (Object.keys(board.columns) as ColumnId[]).forEach(colId => {
        const column = board.columns[colId];
        column.cardIds = column.cardIds.filter(cardId => board.cards[cardId] !== undefined);
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
      return;
    }
    if (!currentBoard.cards || !currentBoard.cards[draggedCardId]) {
      console.error("Dragged card is missing from board cards record or board.cards is undefined.");
      setDraggedItem(null);
      return;
    }
  
    await storeActions.moveCard(
      currentBoard.id,
      draggedCardId,
      sourceColumnId,
      destColumnId,
      destinationIndexInDropTarget,
      mergeTargetCardId
    );
    setDraggedItem(null); 
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
        // Use a loop with await to ensure cards are added one by one if order matters
        // or if there's a desire to see them appear sequentially (though API calls will be parallel)
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


  if (isStoreUserLoading) { // Rely on Zustand's loading flag
    return <div className="text-center py-10">Loading user data...</div>;
  }

  if (!user) {
    // UserProvider should handle showing UserSetupDialog
    // This is a fallback or could indicate an issue if UserSetupDialog isn't shown
    return <div className="text-center py-10">User not set up. Please wait or go to home page. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }
  
  // After user is loaded, check for board
  // currentBoard will be null if boards are still loading OR if board not found
  if (!currentBoard) {
      // If boards are still loading (isBoardsLoading from store), show loading.
      // This is implicit as currentBoard depends on 'boards' from store
      const isLoadingBoards = useBoardStore.getState().isBoardsLoading;
      if (isLoadingBoards) {
         return <div className="text-center py-10">Loading board data...</div>;
      }
      // If not loading boards and currentBoard is still null, then board not found.
      return <div className="text-center py-10">Board not found. <Link href="/"><Button variant="link">Go Home</Button></Link></div>;
  }
  
  if (!currentBoard.columns || !currentBoard.cards) {
    // This specific check might be redundant if currentBoard derivation is robust
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
            
            const cardsForColumn = cardIdsForColumn
              .map(id => currentBoard.cards![id]) 
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
                currentUserId={user?.id || ''} // This is fine for read-only display if RetroCard uses store for canEdit etc.
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
