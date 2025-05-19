
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
    setMergeTargetId(null);
    setPlaceholderIndex(null);
  }, [setDraggedItem]);

  const handleListAreaDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggedItem) {
        setPlaceholderIndex(null);
        setMergeTargetId(null);
        return;
    }

    const listElement = e.currentTarget;
    const cardElements = Array.from(listElement.querySelectorAll<HTMLElement>('[data-card-id]'));

    let newCalculatedIndex: number | null = cards.length; // Default to end of list for positioning
    let potentialMergeId: string | null = null;

    if (cardElements.length === 0) { // If column is empty
        newCalculatedIndex = 0;
    } else {
        for (let i = 0; i < cardElements.length; i++) {
            const cardEl = cardElements[i];
            const cardId = cardEl.dataset.cardId;
            if (!cardId) continue;

            const rect = cardEl.getBoundingClientRect();
            const clientY = e.clientY;

            const edgeRatio = 0.35; // 35% top/bottom edge is for positioning
            const topEdgeZoneEnd = rect.top + rect.height * edgeRatio;
            const bottomEdgeZoneStart = rect.bottom - rect.height * edgeRatio;

            // Case 1: Dragging cursor is above the first card's top edge zone
            if (clientY < rect.top && i === 0) {
                 newCalculatedIndex = 0;
                 potentialMergeId = null;
                 break;
            }
            
            // Case 2: Dragging cursor is within the top edge zone of a card (for positioning before it)
            if (clientY >= rect.top && clientY < topEdgeZoneEnd) {
                newCalculatedIndex = i;
                potentialMergeId = null;
                break;
            // Case 3: Dragging cursor is within the middle zone of a card (for merging)
            } else if (clientY >= topEdgeZoneEnd && clientY < bottomEdgeZoneStart) {
                if (cardId !== draggedItem.id) { // Can't merge with itself
                    newCalculatedIndex = null; // No positioning placeholder when merging
                    potentialMergeId = cardId;
                } else { // Dragging over itself (middle part) - treat as positioning
                    potentialMergeId = null;
                     // Decide if it's before or after based on cursor position within the card
                    if (clientY < rect.top + rect.height / 2) {
                        newCalculatedIndex = i;
                    } else {
                        newCalculatedIndex = i + 1;
                    }
                }
                break;
            // Case 4: Dragging cursor is within the bottom edge zone of a card (for positioning after it)
            } else if (clientY >= bottomEdgeZoneStart && clientY < rect.bottom) {
                newCalculatedIndex = i + 1;
                potentialMergeId = null;
                break;
            }
            
            // Case 5: Dragging cursor is below the last card's bottom edge zone (or if loop finishes)
            if (i === cardElements.length - 1 && clientY >= rect.bottom) {
                 newCalculatedIndex = cards.length; // Position at the very end
                 potentialMergeId = null;
            }
        }
    }
    setPlaceholderIndex(newCalculatedIndex);
    setMergeTargetId(potentialMergeId);

  }, [draggedItem, cards]);


  const handleListAreaDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggedItem) return;

    if (mergeTargetId && mergeTargetId !== draggedItem.id) {
        // MERGE operation
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, -1, mergeTargetId);
    }
    else if (placeholderIndex !== null) {
        // POSITIONING operation
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, placeholderIndex, undefined);
    }
    // Fallback: if neither merge nor placeholder is set, attempt to determine index (should be rare)
    // This can happen if dragOver logic doesn't perfectly set one, or if items are very sparse
    else {
        const listElement = e.currentTarget;
        const cardElements = Array.from(listElement.querySelectorAll<HTMLElement>('[data-card-id]'));
        let finalFallbackIndex = cards.length; // Default to end
         if (cardElements.length > 0) {
            for (let i = 0; i < cardElements.length; i++) {
                const cardEl = cardElements[i];
                const rect = cardEl.getBoundingClientRect();
                if (e.clientY < rect.top + rect.height / 2) { // Drop in upper half of the card
                    finalFallbackIndex = i;
                    break;
                }
                // If last card and still below its midpoint, index remains cards.length (end)
            }
        } else { // Empty column
            finalFallbackIndex = 0;
        }
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, finalFallbackIndex, undefined);
    }

    setPlaceholderIndex(null);
    setMergeTargetId(null);
    setDraggedItem(null);
  }, [draggedItem, cards, columnId, onDragEnd, placeholderIndex, mergeTargetId, setDraggedItem]);

  const handleListAreaDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Check if the mouse has truly left the droppable area, not just moved over a child element.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setPlaceholderIndex(null);
        setMergeTargetId(null);
    }
  }, []);

  return (
    <div className="flex flex-col h-full rounded-lg p-1"> {/* Removed bg-card/50 */}
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
              "space-y-2 px-1 pt-1 pb-1 min-h-[100px] rounded-md transition-all duration-150 relative" 
            )}
            onDragOver={handleListAreaDragOver}
            onDrop={handleListAreaDrop}
            onDragLeave={handleListAreaDragLeave}
          >
            {cards.map((card, index) => (
              <React.Fragment key={card.id}>
                {placeholderIndex === index && !mergeTargetId && ( // Only show placeholder if not merging
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
            {(placeholderIndex !== null && placeholderIndex === cards.length && !mergeTargetId) && ( // Placeholder at the end
              <div className="h-[3px] my-1 bg-primary rounded-full w-full motion-safe:animate-pulse" data-placeholder />
            )}
            {cards.length === 0 && !isAddingCard && placeholderIndex === null && !mergeTargetId && (
              <p className="text-sm text-muted-foreground text-center pt-8">No cards yet.</p>
            )}
            {/* Case for empty list and dragging over it */}
            {cards.length === 0 && placeholderIndex === 0 && !mergeTargetId && (
                <div className="h-[3px] my-1 bg-primary rounded-full w-full motion-safe:animate-pulse" data-placeholder />
            )}
          </div>
        </ScrollArea>
      </TooltipProvider>
    </div>
  );
}
