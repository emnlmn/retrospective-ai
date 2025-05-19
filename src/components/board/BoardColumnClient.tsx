
"use client";

import React, { useState } from 'react';
import type { CardData, ColumnId } from '@/lib/types';
import RetroCard from './RetroCard';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Card as ShadCard, CardContent, CardFooter } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface BoardColumnClientProps {
  columnId: ColumnId;
  title: string;
  cards: CardData[];
  onAddCard: (columnId: ColumnId, content: string) => void;
  onUpdateCard: (cardId: string, newContent: string) => void;
  onDeleteCard: (cardId: string, columnId: ColumnId) => void;
  onUpvoteCard: (cardId: string) => void;
  onDragEnd: (draggedCardId: string, sourceColumnId: ColumnId, destColumnId: ColumnId, destinationIndex: number) => void;
  currentUserId: string;
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
}: BoardColumnClientProps) {
  const [newCardContent, setNewCardContent] = useState('');
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [draggedItem, setDraggedItem] = useState<CardData & { sourceColumnId?: ColumnId } | null>(null);
  const [isDragOverListArea, setIsDragOverListArea] = useState(false);

  const handleAddCardSubmit = () => {
    if (newCardContent.trim()) {
      onAddCard(columnId, newCardContent.trim());
      setNewCardContent('');
      setIsAddingCard(false);
    }
  };

  const handleDragStart = (card: CardData, srcColId: ColumnId) => {
    setDraggedItem({ ...card, sourceColumnId: srcColId });
  };

  const handleListAreaDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); 
    setIsDragOverListArea(true);
  };

  const handleListAreaDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedItem && draggedItem.sourceColumnId) {
      const dropTargetElement = e.target instanceof HTMLElement ? e.target.closest('[data-card-id]') : null;
      const dropTargetId = dropTargetElement?.getAttribute('data-card-id');
      
      let destinationIndex = cards.length; 
      if (dropTargetId) {
        const targetCard = cards.find(c => c.id === dropTargetId);
        const targetCardIndex = cards.findIndex(c => c.id === dropTargetId);

        if (targetCard && targetCardIndex !== -1 && dropTargetElement) {
            const targetRect = dropTargetElement.getBoundingClientRect();
            const isDroppingInUpperHalf = e.clientY < targetRect.top + targetRect.height / 2;
            destinationIndex = isDroppingInUpperHalf ? targetCardIndex : targetCardIndex + 1;
        }
      }
      // Ensure destinationIndex is not out of bounds if dropping at the end of a filtered list
      if (destinationIndex > cards.length) {
          destinationIndex = cards.length;
      }

      onDragEnd(draggedItem.id, draggedItem.sourceColumnId, columnId, destinationIndex);
    }
    setDraggedItem(null);
    setIsDragOverListArea(false);
  };
  
  const handleListAreaDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsDragOverListArea(false);
    }
  };

  return (
    <div className="flex flex-col h-full rounded-lg p-1 bg-card/50"> {/* Adjusted background slightly for column visibility */}
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

      <ScrollArea className="flex-grow" style={{ maxHeight: 'calc(100vh - 260px)'}}> {/* Adjusted max height slightly */}
        <div 
          className={cn(
            "space-y-2 px-1 pb-1 min-h-[100px] rounded-md transition-all duration-150",
            isDragOverListArea ? 'bg-accent/20 ring-2 ring-accent' : 'bg-transparent' // Apply highlight here
          )}
          onDragOver={handleListAreaDragOver}
          onDrop={handleListAreaDrop}
          onDragLeave={handleListAreaDragLeave}
        >
          {cards.map((card) => (
            <RetroCard
              key={card.id}
              card={card}
              columnId={columnId}
              onUpdate={onUpdateCard}
              onDelete={onDeleteCard}
              onUpvote={onUpvoteCard}
              currentUserId={currentUserId}
              onDragStartItem={handleDragStart}
            />
          ))}
          {cards.length === 0 && !isAddingCard && (
             <p className="text-sm text-muted-foreground text-center pt-8">No cards yet.</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

