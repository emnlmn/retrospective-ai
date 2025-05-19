"use client";

import React, { useState, useEffect, useRef } from 'react';
import type { CardData, ColumnId } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ThumbsUp, Edit3, Trash2, GripVertical, Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"


interface RetroCardProps {
  card: CardData;
  columnId: ColumnId;
  onUpdate: (cardId: string, newContent: string) => void;
  onDelete: (cardId: string, columnId: ColumnId) => void;
  onUpvote: (cardId: string) => void;
  currentUserId: string;
  onDragStartItem: (card: CardData, sourceColumnId: ColumnId) => void;
}

export default function RetroCard({ card, columnId, onUpdate, onDelete, onUpvote, currentUserId, onDragStartItem }: RetroCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(card.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canEdit = card.userId === currentUserId;
  const hasUpvoted = card.upvotes.includes(currentUserId);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  const handleUpdate = () => {
    if (editedContent.trim() && editedContent.trim() !== card.content) {
      onUpdate(card.id, editedContent.trim());
    }
    setIsEditing(false);
  };
  
  const handleCancelEdit = () => {
    setEditedContent(card.content);
    setIsEditing(false);
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', card.id); // Required for Firefox
    e.dataTransfer.effectAllowed = 'move';
    onDragStartItem(card, columnId);
  };

  return (
    <Card 
        data-card-id={card.id}
        draggable
        onDragStart={handleDragStart}
        className="bg-card shadow-sm hover:shadow-md transition-shadow duration-200 cursor-grab active:cursor-grabbing relative group"
    >
      <div className="absolute top-2 left-1 opacity-30 group-hover:opacity-100 transition-opacity">
        <GripVertical size={16} className="text-muted-foreground" />
      </div>
      <CardContent className="p-3 pt-4">
        {isEditing && canEdit ? (
          <div className="space-y-2">
            <Textarea
              ref={textareaRef}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full min-h-[60px] text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleUpdate();
                }
                if (e.key === 'Escape') {
                  handleCancelEdit();
                }
              }}
            />
            <div className="flex justify-end space-x-2">
              <Button variant="ghost" size="icon" onClick={handleCancelEdit} aria-label="Cancel edit">
                <X className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleUpdate} aria-label="Save changes">
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap break-words min-h-[40px]">{card.content}</p>
        )}
      </CardContent>
      <CardFooter className="p-3 border-t bg-muted/30 text-xs text-muted-foreground flex justify-between items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate max-w-[100px]">{card.userName}</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{card.userName}, {formatDistanceToNow(new Date(card.createdAt), { addSuffix: true })}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className="flex items-center space-x-1">
          {canEdit && !isEditing && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsEditing(true)} aria-label="Edit card">
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Edit</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {canEdit && (
             <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onDelete(card.id, columnId)} aria-label="Delete card">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Delete</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className={cn("h-7 w-7", hasUpvoted && "text-primary hover:text-primary")} onClick={() => onUpvote(card.id)} aria-label="Upvote card">
                  <ThumbsUp className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{card.upvotes.length} Upvote{card.upvotes.length !== 1 ? 's' : ''}</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="font-medium">{card.upvotes.length}</span>
        </div>
      </CardFooter>
    </Card>
  );
}
