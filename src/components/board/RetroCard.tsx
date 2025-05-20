
"use client";

import React, { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import type { CardData, ColumnId } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card'; // Removed CardFooter
import { ThumbsUp, Edit3, Trash2, Check, X, MoreVertical, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useBoardStore } from '@/store/boardStore';


interface RetroCardProps {
  card: CardData;
  columnId: ColumnId;
  // Callbacks are now derived from store actions in parent component
  onUpdate: (cardId: string, newContent: string) => void;
  onDelete: (cardId: string, columnId: ColumnId) => void;
  onUpvote: (cardId: string) => void;
  // currentUserId is now derived from store
  onDragStartItem: (card: CardData, sourceColumnId: ColumnId) => void;
  isMergeTarget?: boolean;
}

const RetroCard = memo(function RetroCard({
    card,
    columnId,
    onUpdate,
    onDelete,
    onUpvote,
    onDragStartItem,
    isMergeTarget = false
}: RetroCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(card.content);
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentUserId = useBoardStore(state => state.user?.id);

  const canEditOrDelete = card.userId === currentUserId;
  const hasUpvoted = currentUserId ? card.upvotes.includes(currentUserId) : false;

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

  const handleUpdate = useCallback(() => {
    if (editedContent.trim() && editedContent.trim() !== card.content) {
      onUpdate(card.id, editedContent.trim());
    }
    setIsEditing(false);
  }, [editedContent, card.content, card.id, onUpdate]);

  const handleCancelEdit = useCallback(() => {
    setEditedContent(card.content);
    setIsEditing(false);
  }, [card.content]);

  const handleDragStartInternal = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (isEditing) {
        e.preventDefault();
        return;
    }
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsBeingDragged(true);
    onDragStartItem(card, columnId);
  }, [isEditing, card, columnId, onDragStartItem]);

  const handleDragEndInternal = useCallback(() => {
    setIsBeingDragged(false);
  }, []);


  const relativeDate = useMemo(() => {
    try {
      if (!card.createdAt || isNaN(new Date(card.createdAt).getTime())) {
        return "Just now"; 
      }
      return formatDistanceToNow(new Date(card.createdAt), { addSuffix: true });
    } catch (e) {
      console.error("Error formatting date:", card.createdAt, e);
      return "Invalid date";
    }
  }, [card.createdAt]);

  return (
    <ContextMenu>
      <ContextMenuTrigger disabled={isEditing}>
        <Card
            data-card-id={card.id}
            draggable={!isEditing}
            onDragStart={handleDragStartInternal}
            onDragEnd={handleDragEndInternal}
            className={cn(
              "bg-card/90 shadow-sm hover:shadow-md transition-all duration-200 relative group border min-h-[80px] flex flex-col",
              isEditing ? "cursor-default ring-2 ring-primary" : "cursor-grab active:cursor-grabbing",
              isMergeTarget && !isEditing && "ring-2 ring-offset-1 ring-primary shadow-lg border-primary",
              !isMergeTarget && columnId === 'wentWell' && 'border-l-4 border-l-success',
              !isMergeTarget && columnId === 'toImprove' && 'border-l-4 border-l-destructive',
              !isMergeTarget && columnId === 'actionItems' && 'border-l-4 border-l-accent', 
              isBeingDragged && "opacity-50" 
            )}
        >
          <CardContent className={cn("p-3 flex-grow", isEditing && "pb-1")}>
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
          
          {/* Always visible Upvote button and count, no longer in footer */}
          {!isEditing && (
            <div className="absolute bottom-2 right-2 flex items-center space-x-1">
               <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className={cn("h-7 w-7", hasUpvoted && "text-primary hover:text-primary")}
                      onClick={() => onUpvote(card.id)}
                      aria-label="Upvote card"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{hasUpvoted ? 'Remove Upvote' : 'Upvote'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="text-xs font-medium min-w-[12px] text-right text-muted-foreground">{card.upvotes.length}</span>
            </div>
          )}
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuItem onClick={() => onUpvote(card.id)} disabled={isEditing}>
          <ThumbsUp className="mr-2 h-4 w-4" />
          <span>{hasUpvoted ? 'Remove Upvote' : 'Upvote'} ({card.upvotes.length})</span>
        </ContextMenuItem>
        {canEditOrDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => setIsEditing(true)} disabled={isEditing}>
              <Edit3 className="mr-2 h-4 w-4" />
              <span>Edit</span>
            </ContextMenuItem>
            <ContextMenuItem 
              onClick={() => onDelete(card.id, columnId)} 
              className="text-destructive focus:text-destructive focus:bg-destructive/10"
              disabled={isEditing}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete</span>
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuLabel className="text-xs text-muted-foreground px-2 py-1">Card Info</ContextMenuLabel>
        <ContextMenuItem disabled className="text-xs opacity-70 cursor-default">
          <Info className="mr-2 h-3.5 w-3.5" />
          Author: {card.userName}
        </ContextMenuItem>
        <ContextMenuItem disabled className="text-xs opacity-70 cursor-default">
          <Info className="mr-2 h-3.5 w-3.5" />
          Created: {relativeDate}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

export default RetroCard;
