
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

  const handleAddCardSubmit = useCallback(() => {
    if (newCardContent.trim()) {
      onAddCard(columnId, newCardContent.trim());
      setNewCardContent('');
      setIsAddingCard(false);
    }
  }, [newCardContent, onAddCard, columnId]);

  const handleDragStart = useCallback((card: CardData, srcColId: ColumnId) => {
    setDraggedItem({ ...card, sourceColumnId: srcColId });
  }, [setDraggedItem]);

  const handleListAreaDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggedItem) {
        setPlaceholderIndex(null);
        setIsDragOverListArea(false);
        return;
    }

    setIsDragOverListArea(true);

    const listElement = e.currentTarget;
    const cardElements = Array.from(listElement.querySelectorAll<HTMLElement>('[data-card-id]'));
    
    let newCalculatedIndex: number | null = cards.length; // Default to end slot if no cards or below all cards
    let overCardBody = false;

    if (cardElements.length === 0) {
        newCalculatedIndex = 0; // Slot at the beginning of an empty list
    } else {
        for (let i = 0; i < cardElements.length; i++) {
            const cardEl = cardElements[i];
            const cardId = cardEl.dataset.cardId;

            // Don't create slots relative to the card being dragged if it's in the same column
            // as this can be confusing. Allow merging with it though if conditions are met.
            // However, for slot calculation, we need to consider its space.
            // The key is to find a slot *between* elements or at edges.

            const rect = cardEl.getBoundingClientRect();
            const clientY = e.clientY;

            const edgeRatio = 0.3; // 30% top/bottom for slot, middle 40% for potential merge (no placeholder)
            const topEdgeZoneEnd = rect.top + rect.height * edgeRatio;
            const bottomEdgeZoneStart = rect.bottom - rect.height * edgeRatio;

            if (clientY < rect.top) { // Cursor is above the first card checked
                 newCalculatedIndex = i;
                 overCardBody = false;
                 break;
            }

            if (clientY >= rect.top && clientY < topEdgeZoneEnd) {
                // Over top edge of card i
                newCalculatedIndex = i;
                overCardBody = false;
                break;
            } else if (clientY >= bottomEdgeZoneStart && clientY < rect.bottom) {
                // Over bottom edge of card i
                newCalculatedIndex = i + 1;
                overCardBody = false;
                break;
            } else if (clientY >= topEdgeZoneEnd && clientY < bottomEdgeZoneStart) {
                // Over middle body of card i
                if (cardId !== draggedItem.id) { // Can't merge with itself
                    overCardBody = true;
                } else { 
                    // if dragging over itself, treat as if it's trying to find a slot around itself
                    overCardBody = false; 
                    // determine if it's closer to top or bottom slot of itself for placeholder
                    if (clientY < rect.top + rect.height / 2) {
                        newCalculatedIndex = i;
                    } else {
                        newCalculatedIndex = i + 1;
                    }
                }
                break; 
            }
            // If cursor is below this card, newCalculatedIndex remains cards.length or will be set by next card
            if (i === cardElements.length - 1 && clientY >= rect.bottom) {
                 newCalculatedIndex = cards.length; // Below last card
                 overCardBody = false;
            }
        }
    }
    
    if (overCardBody) {
        setPlaceholderIndex(null);
        // Here you could set a different state to highlight the cardEl for merging, if desired
    } else {
        setPlaceholderIndex(newCalculatedIndex);
        // Clear any merge highlight state
    }
  }, [draggedItem, cards, columnId]);


  const handleListAreaDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggedItem) return;

    const listElement = e.currentTarget;

    if (placeholderIndex !== null) {
        // A slot was indicated by dragOver, prioritize positioning.
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, placeholderIndex, undefined);
    } else {
        // No slot indicated by dragOver (placeholderIndex is null).
        // This means dragOver determined the hover was over a card's body (potential merge)
        // or in a truly empty part of the column not near card edges.
        const dropTargetElement = e.target as HTMLElement;
        const directCardTarget = dropTargetElement.closest<HTMLElement>('[data-card-id]');
        const potentialMergeTargetId = directCardTarget?.dataset.cardId;

        if (potentialMergeTargetId && potentialMergeTargetId !== draggedItem.id) {
            // It's a merge, as dragOver put us in a "no-slot" state and we're on another card
            onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, -1, potentialMergeTargetId);
        } else {
            // Dropped in empty space, not on a card, and no slot was indicated by dragOver.
            // This usually means the column is empty or dragging far from other cards.
            // Default to appending at the end of the list.
            // Or recalculate based on Y, though dragOver should have set a placeholder if near items.
            let finalFallbackIndex = cards.length;
             if (cardElements.length > 0) {
                const cardElements = Array.from(listElement.querySelectorAll<HTMLElement>('[data-card-id]'));
                for (let i = 0; i < cardElements.length; i++) {
                    const cardEl = cardElements[i];
                    const rect = cardEl.getBoundingClientRect();
                    if (e.clientY < rect.top + rect.height / 2) {
                        finalFallbackIndex = i;
                        break;
                    }
                }
            } else {
                finalFallbackIndex = 0;
            }
            onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, finalFallbackIndex, undefined);
        }
    }

    setPlaceholderIndex(null);
    setIsDragOverListArea(false);
    // draggedItem is reset by parent (BoardPage)
  }, [draggedItem, cards, columnId, onDragEnd, placeholderIndex]);
  
  const handleListAreaDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only reset if leaving the actual list area, not just moving between child elements
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsDragOverListArea(false);
        setPlaceholderIndex(null);
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
              isDragOverListArea ? 'bg-accent/20 ring-2 ring-accent' : 'bg-transparent'
            )}
            onDragOver={handleListAreaDragOver}
            onDrop={handleListAreaDrop}
            onDragLeave={handleListAreaDragLeave}
          >
            {cards.map((card, index) => (
              <React.Fragment key={card.id}>
                {placeholderIndex === index && (
                  <div className="h-[2px] my-1.5 bg-primary rounded-full w-full" data-placeholder />
                )}
                <RetroCard
                  card={card}
                  columnId={columnId} 
                  onUpdate={onUpdateCard}
                  onDelete={onDeleteCard}
                  onUpvote={onUpvoteCard}
                  currentUserId={currentUserId}
                  onDragStartItem={handleDragStart}
                />
              </React.Fragment>
            ))}
            {/* Render placeholder at the end of the list if placeholderIndex points there */}
            {(placeholderIndex !== null && placeholderIndex === cards.length) && (
              <div className="h-[2px] my-1.5 bg-primary rounded-full w-full" data-placeholder />
            )}
            {/* Message for empty column when not adding and no placeholder is active */}
            {cards.length === 0 && !isAddingCard && placeholderIndex === null && (
              <p className="text-sm text-muted-foreground text-center pt-8">No cards yet.</p>
            )}
            {/* Placeholder for empty list when dragging over it */}
            {cards.length === 0 && placeholderIndex === 0 && (
                <div className="h-[2px] my-1.5 bg-primary rounded-full w-full" data-placeholder />
            )}
          </div>
        </ScrollArea>
      </TooltipProvider>
    </div>
  );
}

