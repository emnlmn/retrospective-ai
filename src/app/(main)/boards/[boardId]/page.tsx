
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  
  const { user } = useBoardStore((state) => ({ user: state.user }));
  const storeActions = useBoardActions();
  const currentBoardFromStore = useBoardStore(state => state.boards.find(b => b.id === boardId));

  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true); // Local loading for this page/component
  const [isAISuggesting, setIsAISuggesting] = useState(false);
  const [draggedItem, setDraggedItem] = useState<DraggedItemType | null>(null);
  
  // The currentBoard is now derived directly from the store for display
  const currentBoard = useMemo(() => {
    if (!currentBoardFromStore) return null;
    // Basic sanitization or transformation if needed, but store should hold valid data
    const board = { ...currentBoardFromStore };
    board.columns = board.columns || INITIAL_COLUMNS_DATA;
    board.cards = board.cards || {};
    (Object.keys(board.columns) as ColumnId[]).forEach(colId => {
        if (!board.columns[colId]) {
            board.columns[colId] = { ...INITIAL_COLUMNS_DATA[colId], cardIds: [] };
        }
        if (!Array.isArray(board.columns[colId].cardIds)) {
            board.columns[colId].cardIds = [];
        }
    });
    return board;
  }, [currentBoardFromStore]);


  useEffect(() => {
    if (boardId) {
      storeActions.setCurrentBoardId(boardId);
    }
    setIsLoading(false); // Assuming store handles its own loading state for data fetching
  }, [boardId, storeActions]);

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
      console.error("Dragged card is missing from board cards record.");
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
    setDraggedItem(null);
  }, [currentBoard, storeActions]);


  const handleAISuggestions = useCallback(async () => {
    if (!currentBoard || !user) return;
    setIsAISuggesting(true);
    try {
      const toImproveColumn = currentBoard.columns?.toImprove || { ...INITIAL_COLUMNS_DATA.toImprove, cardIds: [] };
      const currentCards = currentBoard.cards || {};
      const toImproveCardsContent = (toImproveColumn.cardIds || [])
        .map(cardId => currentCards[cardId]?.content)
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
          // The store action will handle creating the card with the correct user ID and name
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


  if (isLoading || !user) { // isLoading is local page loading, user check relies on store
    return <div className="text-center py-10">Loading board...</div>;
  }
  if (!currentBoard) {
    // This might happen if boardId is invalid or store hasn't loaded/found it yet
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
            const boardColumns = currentBoard.columns || INITIAL_COLUMNS_DATA; // Ensure columns exist
            const boardCards = currentBoard.cards || {}; // Ensure cards exist

            const columnData = boardColumns[columnId] || { ...INITIAL_COLUMNS_DATA[columnId], cardIds: [] };
            const cardIdsForColumn = Array.isArray(columnData.cardIds) ? columnData.cardIds : [];
            
            const cardsForColumn = cardIdsForColumn
              .map(id => boardCards[id])
              .filter((card): card is CardData => !!card && typeof card.order === 'number') 
              .sort((a, b) => (a.order as number) - (b.order as number));
            
            if (!columnConfig) return null;

            return (
              <BoardColumnClient
                key={columnId}
                columnId={columnId}
                title={columnConfig.title}
                cards={cardsForColumn}
                onAddCard={handleAddCard} // These handlers now call store actions
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
