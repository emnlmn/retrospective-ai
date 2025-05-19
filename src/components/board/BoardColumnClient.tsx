"use client";

import React, { useState } from 'react';
import type { CardData, ColumnId } from '@/lib/types';
import RetroCard from './RetroCard';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const [draggedItem, setDraggedItem] = useState<CardData | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null);

  const handleAddCardSubmit = () => {
    if (newCardContent.trim()) {
      onAddCard(columnId, newCardContent.trim());
      setNewCardContent('');
      setIsAddingCard(false);
    }
  };

  const handleDragStart = (card: CardData) => {
    setDraggedItem(card);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow dropping
    setDragOverColumn(columnId);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggedItem) {
      // Find the card being dropped over, if any, to determine index
      const dropTargetElement = e.target instanceof HTMLElement ? e.target.closest('[data-card-id]') : null;
      const dropTargetId = dropTargetElement?.getAttribute('data-card-id');
      
      let destinationIndex = cards.length; // Default to end of list
      if (dropTargetId) {
        const targetCardIndex = cards.findIndex(c => c.id === dropTargetId);
        if (targetCardIndex !== -1) {
          // Determine if dropping above or below the target card based on mouse position
          const targetRect = dropTargetElement!.getBoundingClientRect();
          const isDroppingInUpperHalf = e.clientY < targetRect.top + targetRect.height / 2;
          destinationIndex = isDroppingInUpperHalf ? targetCardIndex : targetCardIndex + 1;
        }
      }
      
      // Find source column from current cards data
      // This is a simplification; in a real app, source columnId would be part of draggedItem state.
      // For now, we assume draggedItem contains enough info or we search.
      // For this implementation, the parent board page manages state and passes correct sourceColumnId.
      // Let's assume draggedItem will contain sourceColumnId.
      // For the provided onDragEnd, we need to find the source column from the parent.
      // Here, we can just call onDragEnd with the current columnId as destination.
      // The parent `BoardPage` actually knows the source column through its state management.
      // To correctly determine source column: the card's original column should be part of its data or drag context.
      // This component doesn't know the sourceColumnId directly, it's passed by BoardPage.
      // The `draggedItem.columnId` (if we add it) or finding it in the main board state is needed.
      // For now, BoardPage's onDragEnd will get the source from its own structure.
      // This component provides destination (columnId) and destinationIndex.
      
      // This part is tricky. The sourceColumnId is not directly available here.
      // The parent `BoardPage` needs to handle finding the source column.
      // For simplicity, let's assume `draggedItem` has a property like `currentColumnId` when `handleDragStart` is called.
      // This is not ideal. A better way is to have a global drag context or pass sourceColumnId explicitly.
      // Let's assume `draggedItem` contains `sourceColumnId` set during `onDragStart` in RetroCard.
      const sourceColId = (draggedItem as any).sourceColumnId as ColumnId; // This is a placeholder.
      if (sourceColId) {
         onDragEnd(draggedItem.id, sourceColId, columnId, destinationIndex);
      } else {
        console.error("Source column ID missing for dragged item.")
        // Fallback: Search all columns in parent state - too complex for here.
      }
    }
    setDraggedItem(null);
    setDragOverColumn(null);
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
     // Check if the mouse is leaving the column area for real, not just moving over child elements
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDragOverColumn(null);
    }
  };


  return (
    <Card 
      className={`flex flex-col h-full shadow-md rounded-lg overflow-hidden transition-all duration-300 ${dragOverColumn === columnId ? 'bg-accent/10 ring-2 ring-accent' : 'bg-card'}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      <CardHeader className="border-b bg-muted/50">
        <CardTitle className="text-lg font-semibold text-foreground">{title} ({cards.length})</CardTitle>
      </CardHeader>
      <ScrollArea className="flex-grow">
        <CardContent className="p-4 space-y-3 min-h-[200px]">
          {cards.map((card, index) => (
            <RetroCard
              key={card.id}
              card={card}
              columnId={columnId}
              onUpdate={onUpdateCard}
              onDelete={onDeleteCard}
              onUpvote={onUpvoteCard}
              currentUserId={currentUserId}
              onDragStartItem={(cardData, srcColId) => handleDragStart({...cardData, sourceColumnId: srcColId} as any)}
            />
          ))}
          {cards.length === 0 && !isAddingCard && (
             <p className="text-sm text-muted-foreground text-center pt-10">No cards yet. Add one!</p>
          )}
        </CardContent>
      </ScrollArea>
      <CardFooter className="p-4 border-t bg-muted/20">
        {isAddingCard ? (
          <div className="w-full space-y-2">
            <Textarea
              placeholder="Enter card details..."
              value={newCardContent}
              onChange={(e) => setNewCardContent(e.target.value)}
              className="w-full min-h-[80px] text-sm bg-background focus:ring-primary"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddCardSubmit(); }}}
            />
            <div className="flex justify-end space-x-2">
              <Button variant="ghost" size="sm" onClick={() => { setIsAddingCard(false); setNewCardContent(''); }}>Cancel</Button>
              <Button size="sm" onClick={handleAddCardSubmit} disabled={!newCardContent.trim()}>Add Card</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" className="w-full text-muted-foreground hover:text-foreground hover:border-primary" onClick={() => setIsAddingCard(true)}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Card
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
