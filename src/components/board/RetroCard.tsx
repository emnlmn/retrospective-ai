
"use client";

import React, { useState, useEffect, useRef, memo } from 'react';
import type { CardData, ColumnId } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { ThumbsUp, Edit3, Trash2, Check, X, MoreVertical } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface RetroCardProps {
  card: CardData;
  columnId: ColumnId;
  onUpdate: (cardId: string, newContent: string) => void;
  onDelete: (cardId: string, columnId: ColumnId) => void;
  onUpvote: (cardId: string) => void;
  currentUserId: string;
  onDragStartItem: (card: CardData, sourceColumnId: ColumnId) => void;
}

const RetroCard = memo(function RetroCard({ card, columnId, onUpdate, onDelete, onUpvote, currentUserId, onDragStartItem }: RetroCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(card.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canEditOrDelete = card.userId === currentUserId;
  const hasUpvoted = card.upvotes.includes(currentUserId);

  // Sync editedContent if card.content prop changes externally (e.g. undo/redo, collaborative edit)
  useEffect(() => {
    if (card.content !== editedContent && !isEditing) {
        setEditedContent(card.content);
    }
  }, [card.content, editedContent, isEditing]);


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
    setEditedContent(card.content); // Reset to original content from prop
    setIsEditing(false);
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    // Prevent dragging when in edit mode
    if (isEditing) {
        e.preventDefault();
        return;
    }
    e.dataTransfer.setData('text/plain', card.id); 
    e.dataTransfer.effectAllowed = 'move';
    onDragStartItem(card, columnId);
  };

  return (
    <Card 
        data-card-id={card.id}
        draggable={!isEditing} // Draggable only if not editing
        onDragStart={handleDragStart}
        className={cn(
          "bg-card/90 shadow-sm hover:shadow-md transition-shadow duration-200 relative group border",
          isEditing ? "cursor-default ring-2 ring-primary" : "cursor-grab active:cursor-grabbing",
          columnId === 'wentWell' && 'border-l-4 border-l-accent',
          columnId === 'toImprove' && 'border-l-4 border-l-destructive',
          (columnId !== 'wentWell' && columnId !== 'toImprove') && 'border-border/70'
        )}
    >
      <CardContent className="p-3">
        {isEditing && canEditOrDelete ? (
          <div className="space-y-2">
            <Textarea
              ref={textareaRef}
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              className="w-full min-h-[60px] text-sm bg-background/80 focus:ring-primary border-input"
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
            <div className="flex justify-end space-x-1">
              <Button variant="ghost" size="icon-sm" onClick={handleCancelEdit} aria-label="Cancel edit">
                <X className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={handleUpdate} aria-label="Save changes">
                <Check className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-card-foreground whitespace-pre-wrap break-words min-h-[30px] py-1">{card.content}</p>
        )}
      </CardContent>
      {!isEditing && (
        <CardFooter className="p-2 border-t border-border/50 text-xs text-muted-foreground flex justify-between items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate max-w-[100px] hover:underline">{card.userName}</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{card.userName}</p>
              <p>{formatDistanceToNow(new Date(card.createdAt), { addSuffix: true })}</p>
            </TooltipContent>
          </Tooltip>
          <div className="flex items-center space-x-1">
            <Button 
                variant="ghost" 
                size="icon-sm" 
                className={cn("h-7 w-7", hasUpvoted && "text-primary hover:text-primary")} 
                onClick={() => onUpvote(card.id)} 
                aria-label="Upvote card"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <span className="font-medium min-w-[12px] text-right">{card.upvotes.length}</span>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                  <span className="sr-only">Card actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onUpvote(card.id)}>
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  <span>{hasUpvoted ? 'Remove Upvote' : 'Upvote'} ({card.upvotes.length})</span>
                </DropdownMenuItem>
                {canEditOrDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsEditing(true)}>
                      <Edit3 className="mr-2 h-4 w-4" />
                      <span>Edit</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onDelete(card.id, columnId)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Delete</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardFooter>
      )}
    </Card>
  );
});

export default RetroCard;
