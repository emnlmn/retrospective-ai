
"use client";

import React, { useState, useCallback } from 'react';
import type { CardData, ColumnId } from '@/lib/types';
import RetroCard from './RetroCard';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Card as ShadCard, CardContent, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { TooltipProvider } from "@/components/ui/tooltip";

type DraggedItemType = CardData & { sourceColumnId: ColumnId };

interface BoardColumnClientProps {
  columnId: ColumnId;
  title: string;
  cards: CardData[];
  onAddCard: (columnId: ColumnId, content: string) => void;
  onUpdateCard: (cardId: string, newContent: string) => void;
  onDeleteCard: (cardId: string, columnId: ColumnId) => void;
  onUpvoteCard: (cardId: string) => void;
  onDragEnd: (
    draggedCardId: string, 
    sourceColumnId: ColumnId, 
    destColumnId: ColumnId, 
    destinationIndex: number,
    mergeTargetCardId?: string
  ) => void;
  currentUserId: string;
  draggedItem: DraggedItemType | null;
  setDraggedItem: (item: DraggedItemType | null) => void;
}

export default function BoardColumnClient({
  columnId,
  title,
  cards,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onUpvoteCard,
  onDragEnd,
  currentUserId,
  draggedItem,
  setDraggedItem,
}: BoardColumnClientProps) {
  const [newCardContent, setNewCardContent] = useState('');
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [isDragOverListArea, setIsDragOverListArea] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState<number | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

  const handleAddCardSubmit = useCallback(() => {
    if (newCardContent.trim()) {
      onAddCard(columnId, newCardContent.trim());
      setNewCardContent('');
      setIsAddingCard(false);
    }
  }, [newCardContent, onAddCard, columnId]);

  const handleDragStart = useCallback((card: CardData, srcColId: ColumnId) => {
    setDraggedItem({ ...card, sourceColumnId: srcColId });
    setMergeTargetId(null); // Reset merge target on new drag start
    setPlaceholderIndex(null);
  }, [setDraggedItem]);

  const handleListAreaDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggedItem) {
        setPlaceholderIndex(null);
        setMergeTargetId(null);
        setIsDragOverListArea(false);
        return;
    }

    setIsDragOverListArea(true);
    const listElement = e.currentTarget;
    const cardElements = Array.from(listElement.querySelectorAll<HTMLElement>('[data-card-id]'));
    
    let newCalculatedIndex: number | null = cards.length; // Default to end slot
    let potentialMergeId: string | null = null;

    if (cardElements.length === 0) {
        newCalculatedIndex = 0; // Slot at the beginning of an empty list
    } else {
        for (let i = 0; i < cardElements.length; i++) {
            const cardEl = cardElements[i];
            const cardId = cardEl.dataset.cardId;
            const rect = cardEl.getBoundingClientRect();
            const clientY = e.clientY;

            const edgeRatio = 0.35; // 35% top/bottom for slot, middle 30% for potential merge
            const topEdgeZoneEnd = rect.top + rect.height * edgeRatio;
            const bottomEdgeZoneStart = rect.bottom - rect.height * edgeRatio;

            if (clientY < rect.top && i === 0) { // Cursor is above the very first card
                 newCalculatedIndex = 0;
                 potentialMergeId = null;
                 break;
            }
            
            if (clientY >= rect.top && clientY < topEdgeZoneEnd) { // Over top edge of card i (Reposition)
                newCalculatedIndex = i;
                potentialMergeId = null;
                break;
            } else if (clientY >= topEdgeZoneEnd && clientY < bottomEdgeZoneStart) { // Over middle body of card i (Potential Merge)
                if (cardId !== draggedItem.id) { // Can't merge with itself
                    newCalculatedIndex = null; // Indicate no placeholder line
                    potentialMergeId = cardId!;
                } else { // Dragging over itself, treat as repositioning around itself
                    potentialMergeId = null;
                    if (clientY < rect.top + rect.height / 2) {
                        newCalculatedIndex = i;
                    } else {
                        newCalculatedIndex = i + 1;
                    }
                }
                break; 
            } else if (clientY >= bottomEdgeZoneStart && clientY < rect.bottom) { // Over bottom edge of card i (Reposition)
                newCalculatedIndex = i + 1;
                potentialMergeId = null;
                break;
            }
            
            if (i === cardElements.length - 1 && clientY >= rect.bottom) { // Cursor is below the last card
                 newCalculatedIndex = cards.length; 
                 potentialMergeId = null;
            }
        }
    }
    
    setPlaceholderIndex(newCalculatedIndex);
    setMergeTargetId(potentialMergeId);

  }, [draggedItem, cards, columnId]);


  const handleListAreaDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggedItem) return;

    // Priority 1: Merge if mergeTargetId is set (and it's a valid target)
    if (mergeTargetId && mergeTargetId !== draggedItem.id) {
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, -1, mergeTargetId);
    } 
    // Priority 2: Reposition if placeholderIndex is set (even if mergeTargetId was transiently set but now placeholder is active)
    else if (placeholderIndex !== null) {
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, placeholderIndex, undefined);
    } 
    // Fallback: If neither merge nor specific placeholder, try to append or find nearest slot.
    // This should be less common if dragOver logic is robust.
    else {
        const listElement = e.currentTarget;
        const cardElements = Array.from(listElement.querySelectorAll<HTMLElement>('[data-card-id]'));
        let finalFallbackIndex = cards.length; // Default to end
         if (cardElements.length > 0) {
            for (let i = 0; i < cardElements.length; i++) {
                const cardEl = cardElements[i];
                const rect = cardEl.getBoundingClientRect();
                if (e.clientY < rect.top + rect.height / 2) {
                    finalFallbackIndex = i;
                    break;
                }
            }
        } else { // Empty column
            finalFallbackIndex = 0;
        }
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, finalFallbackIndex, undefined);
    }

    setPlaceholderIndex(null);
    setMergeTargetId(null);
    setIsDragOverListArea(false);
    // draggedItem reset is handled by parent (BoardPage)
  }, [draggedItem, cards, columnId, onDragEnd, placeholderIndex, mergeTargetId]);
  
  const handleListAreaDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsDragOverListArea(false);
        setPlaceholderIndex(null);
        setMergeTargetId(null);
    }
  }, []);

  return (
    <div className="flex flex-col h-full rounded-lg p-1 bg-card/50">
      <div className="flex justify-between items-center mb-2 px-1">
        <h3 className="text-base font-semibold text-foreground">{title} ({cards.length})</h3>
      </div>

      {isAddingCard ? (
        <div className="mb-2 px-1">
          <ShadCard className="bg-card/80 shadow-md">
            <CardContent className="p-2">
              <Textarea
                placeholder="Enter card details..."
                value={newCardContent}
                onChange={(e) => setNewCardContent(e.target.value)}
                className="w-full min-h-[70px] text-sm bg-background/70 focus:ring-primary border-input"
                autoFocus
                onKeyDown={(e) => { 
                  if (e.key === 'Enter' && !e.shiftKey) { 
                    e.preventDefault(); 
                    handleAddCardSubmit(); 
                  }
                  if (e.key === 'Escape') {
                    setIsAddingCard(false); 
                    setNewCardContent('');
                  }
                }}
              />
            </CardContent>
            <CardFooter className="p-2 flex justify-end space-x-2">
              <Button variant="ghost" size="sm" onClick={() => { setIsAddingCard(false); setNewCardContent(''); }}>Cancel</Button>
              <Button size="sm" onClick={handleAddCardSubmit} disabled={!newCardContent.trim()}>Add</Button>
            </CardFooter>
          </ShadCard>
        </div>
      ) : (
        <Button 
          variant="outline" 
          className="w-full mb-2 text-muted-foreground hover:text-foreground hover:border-primary/70 py-3"
          onClick={() => setIsAddingCard(true)}
        >
          <PlusCircle className="mr-2 h-4 w-4" /> Add Card
        </Button>
      )}
      <TooltipProvider>
        <ScrollArea className="flex-grow" style={{ maxHeight: 'calc(100vh - 260px)'}}>
          <div 
            className={cn(
              "space-y-2 px-1 pb-1 min-h-[100px] rounded-md transition-all duration-150 relative",
              isDragOverListArea && !mergeTargetId ? 'bg-accent/20 ring-1 ring-accent/70' : 'bg-transparent', // Ring only if placeholder, not merge
              isDragOverListArea && mergeTargetId ? 'bg-destructive/10' : '' // Subtle bg for potential merge column
            )}
            onDragOver={handleListAreaDragOver}
            onDrop={handleListAreaDrop}
            onDragLeave={handleListAreaDragLeave}
          >
            {cards.map((card, index) => (
              <React.Fragment key={card.id}>
                {placeholderIndex === index && (
                  <div className="h-[3px] my-1 bg-primary rounded-full w-full motion-safe:animate-pulse" data-placeholder />
                )}
                <RetroCard
                  card={card}
                  columnId={columnId} 
                  onUpdate={onUpdateCard}
                  onDelete={onDeleteCard}
                  onUpvote={onUpvoteCard}
                  currentUserId={currentUserId}
                  onDragStartItem={handleDragStart}
                  isMergeTarget={card.id === mergeTargetId && card.id !== draggedItem?.id}
                />
              </React.Fragment>
            ))}
            {(placeholderIndex !== null && placeholderIndex === cards.length) && (
              <div className="h-[3px] my-1 bg-primary rounded-full w-full motion-safe:animate-pulse" data-placeholder />
            )}
            {cards.length === 0 && !isAddingCard && placeholderIndex === null && !mergeTargetId && (
              <p className="text-sm text-muted-foreground text-center pt-8">No cards yet.</p>
            )}
            {cards.length === 0 && placeholderIndex === 0 && (
                <div className="h-[3px] my-1 bg-primary rounded-full w-full motion-safe:animate-pulse" data-placeholder />
            )}
          </div>
        </ScrollArea>
      </TooltipProvider>
    </div>
  );
}
