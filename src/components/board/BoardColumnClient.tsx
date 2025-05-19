
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
    mergeTargetCardId?: string // Added for merge
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
    if (draggedItem && draggedItem.sourceColumnId !== columnId) { // Only show placeholder if dragging from different column for now or different position
        setIsDragOverListArea(true); // General highlight
    } else if (draggedItem) {
         setIsDragOverListArea(true);
    }


    if (draggedItem) {
      const listElement = e.currentTarget; // The div with onDragOver
      let newIndex = cards.length;

      const cardElements = Array.from(listElement.querySelectorAll('[data-card-id]')) as HTMLElement[];
      for (let i = 0; i < cardElements.length; i++) {
        const cardEl = cardElements[i];
        if (cardEl.getAttribute('data-card-id') === draggedItem.id) continue; // Don't compare with the dragged item itself

        const rect = cardEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          newIndex = i;
          break;
        }
      }
      // If dragging within the same column, adjust index if moving item downwards
      if (draggedItem.sourceColumnId === columnId) {
        const originalIndex = cards.findIndex(c => c.id === draggedItem.id);
        if (originalIndex !== -1 && originalIndex < newIndex) {
          // If the card is dragged downwards past its original position,
          // the placeholder index effectively becomes one less because the card itself will be removed from its old spot.
          // However, for display purposes, newIndex is correct based on visual elements.
          // The actual drop logic in BoardPage will handle the final index correctly.
        }
      }
      setPlaceholderIndex(newIndex);
    }
  }, [draggedItem, cards, columnId]);

  const handleListAreaDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedItem && draggedItem.sourceColumnId) {
      const listElement = e.currentTarget;
      const dropTargetCardElement = e.target instanceof HTMLElement ? e.target.closest('[data-card-id]') : null;
      const potentialMergeTargetId = dropTargetCardElement?.getAttribute('data-card-id');

      if (potentialMergeTargetId && potentialMergeTargetId !== draggedItem.id) {
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, -1, potentialMergeTargetId);
      } else {
        let destinationIndex = cards.length; // Default to end of list
        const cardElements = Array.from(listElement.querySelectorAll('[data-card-id]:not([data-placeholder])')) as HTMLElement[];

        for (let i = 0; i < cardElements.length; i++) {
            const cardEl = cardElements[i];
             // Skip the dragged item itself if it's still in the DOM list during calculation
            if (cardEl.getAttribute('data-card-id') === draggedItem.id) continue;

            const rect = cardEl.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                destinationIndex = i;
                // If the dragged item was originally before this position in the same column,
                // and we're moving it downwards, the effective index is one less.
                // However, the placeholderIndex calculation should align with this.
                // The handleDragEnd in BoardPage will manage the final array math.
                break;
            }
        }
         // If dragging within the same column and item moved downwards, adjust index for splice
        if (draggedItem.sourceColumnId === columnId) {
            const originalOrder = cards.find(c => c.id === draggedItem.id)?.order;
            const targetOrderEquivalent = destinationIndex; // placeholderIndex is the visual slot
            if (originalOrder !== undefined && originalOrder < targetOrderEquivalent) {
                // destinationIndex--; // Decrement because the item itself will be removed before splice
            }
        }

        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, destinationIndex, undefined);
      }
    }
    setPlaceholderIndex(null);
    setIsDragOverListArea(false);
    // draggedItem is reset by parent (BoardPage)
  }, [draggedItem, cards, columnId, onDragEnd, setPlaceholderIndex, setIsDragOverListArea]);
  
  const handleListAreaDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
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
              "space-y-2 px-1 pb-1 min-h-[100px] rounded-md transition-all duration-150 relative", // Added relative for placeholder
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
            {placeholderIndex === cards.length && (
              <div className="h-[2px] my-1.5 bg-primary rounded-full w-full" data-placeholder />
            )}
            {cards.length === 0 && !isAddingCard && placeholderIndex === null && (
              <p className="text-sm text-muted-foreground text-center pt-8">No cards yet.</p>
            )}
             {cards.length === 0 && placeholderIndex === 0 && (
                <div className="h-[2px] my-1.5 bg-primary rounded-full w-full" data-placeholder />
            )}
          </div>
        </ScrollArea>
      </TooltipProvider>
    </div>
  );
}
