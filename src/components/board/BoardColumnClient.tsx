
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

    let newCalculatedIndex: number | null = cards.length; 
    let potentialMergeId: string | null = null;

    if (cardElements.length === 0) { 
        newCalculatedIndex = 0;
    } else {
        for (let i = 0; i < cardElements.length; i++) {
            const cardEl = cardElements[i];
            const cardId = cardEl.dataset.cardId;
            if (!cardId) continue;

            const rect = cardEl.getBoundingClientRect();
            const clientY = e.clientY;

            const edgeRatio = 0.35; 
            const topEdgeZoneEnd = rect.top + rect.height * edgeRatio;
            const bottomEdgeZoneStart = rect.bottom - rect.height * edgeRatio;

            if (clientY < rect.top && i === 0) {
                 newCalculatedIndex = 0;
                 potentialMergeId = null;
                 break;
            }
            
            if (clientY >= rect.top && clientY < topEdgeZoneEnd) {
                newCalculatedIndex = i;
                potentialMergeId = null;
                break;
            } else if (clientY >= topEdgeZoneEnd && clientY < bottomEdgeZoneStart) {
                if (cardId !== draggedItem.id) { 
                    newCalculatedIndex = null; 
                    potentialMergeId = cardId;
                } else { 
                    potentialMergeId = null;
                    if (clientY < rect.top + rect.height / 2) {
                        newCalculatedIndex = i;
                    } else {
                        newCalculatedIndex = i + 1;
                    }
                }
                break;
            } else if (clientY >= bottomEdgeZoneStart && clientY < rect.bottom) {
                newCalculatedIndex = i + 1;
                potentialMergeId = null;
                break;
            }
            
            if (i === cardElements.length - 1 && clientY >= rect.bottom) {
                 newCalculatedIndex = cards.length; 
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
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, -1, mergeTargetId);
    }
    else if (placeholderIndex !== null) {
        onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, placeholderIndex, undefined);
    }
    else {
        const listElement = e.currentTarget;
        const cardElements = Array.from(listElement.querySelectorAll<HTMLElement>('[data-card-id]'));
        let finalFallbackIndex = cards.length; 
         if (cardElements.length > 0) {
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

    setPlaceholderIndex(null);
    setMergeTargetId(null);
    setDraggedItem(null);
  }, [draggedItem, cards, columnId, onDragEnd, placeholderIndex, mergeTargetId, setDraggedItem]);

  const handleListAreaDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setPlaceholderIndex(null);
        setMergeTargetId(null);
    }
  }, []);

  return (
    <div className="flex flex-col h-full rounded-lg p-1">
      <div className="flex justify-between items-center mb-2 px-1">
        <h3 className="text-base font-semibold text-foreground">{title} ({cards.length})</h3>
        {!isAddingCard && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-primary"
              onClick={() => setIsAddingCard(true)}
              aria-label="Add new card"
            >
              <PlusCircle className="h-5 w-5" />
            </Button>
        )}
      </div>

      {isAddingCard && (
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
                {placeholderIndex === index && !mergeTargetId && ( 
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
            {(placeholderIndex !== null && placeholderIndex === cards.length && !mergeTargetId) && ( 
              <div className="h-[3px] my-1 bg-primary rounded-full w-full motion-safe:animate-pulse" data-placeholder />
            )}
            {cards.length === 0 && !isAddingCard && placeholderIndex === null && !mergeTargetId && (
              <p className="text-sm text-muted-foreground text-center pt-8">No cards yet.</p>
            )}
            {cards.length === 0 && placeholderIndex === 0 && !mergeTargetId && (
                <div className="h-[3px] my-1 bg-primary rounded-full w-full motion-safe:animate-pulse" data-placeholder />
            )}
          </div>
        </ScrollArea>
      </TooltipProvider>
    </div>
  );
}
