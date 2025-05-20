
"use client";

import React, { useState, useEffect, useRef, memo, useMemo, useCallback } from 'react';
import type { CardData, ColumnId } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ThumbsUp, Edit3, Trash2, Check, X, MoreVertical, User as UserIcon, CalendarDays } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
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
} from "@/components/ui/context-menu";
import { useBoardStore } from '@/store/boardStore';


interface RetroCardProps {
  card: CardData;
  columnId: ColumnId;
  onUpdate: (cardId: string, newContent: string) => void;
  onDelete: (cardId: string, columnId: ColumnId) => void;
  onUpvote: (cardId: string) => void;
  onDragStartItem: (card: CardData, sourceColumnId: ColumnId) => void;
  isMergeTarget?: boolean;
  isBoardConfirmedValid: boolean; // Receive validity
}

const RetroCard = memo(function RetroCard({
    card,
    columnId,
    onUpdate,
    onDelete,
    onUpvote,
    onDragStartItem,
    isMergeTarget = false,
    isBoardConfirmedValid, // Use validity
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
    if (!isBoardConfirmedValid) return;
    if (editedContent.trim() && editedContent.trim() !== card.content) {
      onUpdate(card.id, editedContent.trim());
    }
    setIsEditing(false);
  }, [editedContent, card.content, card.id, onUpdate, isBoardConfirmedValid]);

  const handleCancelEdit = useCallback(() => {
    setEditedContent(card.content);
    setIsEditing(false);
  }, [card.content]);

  const handleDragStartInternal = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isBoardConfirmedValid || isEditing) { // Check validity
        e.preventDefault();
        return;
    }
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsBeingDragged(true);
    onDragStartItem(card, columnId);
  }, [isEditing, card, columnId, onDragStartItem, isBoardConfirmedValid]);

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

  const handleDirectUpvote = () => {
    if (!isBoardConfirmedValid) return;
    onUpvote(card.id);
  };

  const menuItems = (
    <>
      <DropdownMenuItem onClick={handleDirectUpvote} disabled={!isBoardConfirmedValid}>
        <ThumbsUp className="mr-2 h-4 w-4" />
        <span>{hasUpvoted ? 'Remove Upvote' : 'Upvote'} ({card.upvotes.length})</span>
      </DropdownMenuItem>
      {canEditOrDelete && (
        <>
          <DropdownMenuItem onClick={() => setIsEditing(true)} disabled={!isBoardConfirmedValid}>
            <Edit3 className="mr-2 h-4 w-4" />
            <span>Edit</span>
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onDelete(card.id, columnId)} 
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
            disabled={!isBoardConfirmedValid}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">Card Info</DropdownMenuLabel>
      <DropdownMenuItem disabled className="opacity-70 cursor-default">
        <UserIcon className="mr-2 h-3.5 w-3.5" />
        Author: {card.userName}
      </DropdownMenuItem>
      <DropdownMenuItem disabled className="opacity-70 cursor-default">
        <CalendarDays className="mr-2 h-3.5 w-3.5" />
        Created: {relativeDate}
      </DropdownMenuItem>
    </>
  );
  
  const contextMenuItems = (
     <>
      <ContextMenuItem onClick={handleDirectUpvote} disabled={!isBoardConfirmedValid}>
        <ThumbsUp className="mr-2 h-4 w-4" />
        <span>{hasUpvoted ? 'Remove Upvote' : 'Upvote'} ({card.upvotes.length})</span>
      </ContextMenuItem>
      {canEditOrDelete && (
        <>
          <ContextMenuItem onClick={() => setIsEditing(true)} disabled={!isBoardConfirmedValid}>
            <Edit3 className="mr-2 h-4 w-4" />
            <span>Edit</span>
          </ContextMenuItem>
          <ContextMenuItem 
            onClick={() => onDelete(card.id, columnId)} 
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
            disabled={!isBoardConfirmedValid}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">Card Info</ContextMenuLabel>
      <ContextMenuItem disabled className="opacity-70 cursor-default">
        <UserIcon className="mr-2 h-3.5 w-3.5" />
        Author: {card.userName}
      </ContextMenuItem>
      <ContextMenuItem disabled className="opacity-70 cursor-default">
        <CalendarDays className="mr-2 h-3.5 w-3.5" />
        Created: {relativeDate}
      </ContextMenuItem>
    </>
  );


  return (
    <ContextMenu>
      <ContextMenuTrigger disabled={isEditing || !isBoardConfirmedValid}>
        <Card
            data-card-id={card.id}
            draggable={!isEditing && isBoardConfirmedValid} // Only draggable if valid and not editing
            onDragStart={handleDragStartInternal}
            onDragEnd={handleDragEndInternal}
            className={cn(
              "bg-card/90 shadow-sm hover:shadow-md transition-all duration-200 relative group border min-h-[80px] flex flex-col",
              isEditing ? "cursor-default ring-2 ring-primary" : (isBoardConfirmedValid ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"),
              isMergeTarget && !isEditing && isBoardConfirmedValid && "ring-2 ring-offset-1 ring-primary shadow-lg",
              !isMergeTarget && columnId === 'wentWell' && 'border-l-4 border-l-success',
              !isMergeTarget && columnId === 'toImprove' && 'border-l-4 border-l-destructive',
              !isMergeTarget && columnId === 'actionItems' && 'border-l-4 border-l-accent', 
              isBeingDragged && "opacity-50",
              !isBoardConfirmedValid && "opacity-60" // Visual cue for invalid board
            )}
        >
          {!isEditing && isBoardConfirmedValid && (
            <div className="absolute top-1 right-1 z-10">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity duration-150"
                    aria-label="Card actions"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {menuItems}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <CardContent className={cn("p-3 flex-grow pr-6", isEditing && "pb-1")}>
            {isEditing && canEditOrDelete && isBoardConfirmedValid ? (
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
              <p className="text-sm text-card-foreground whitespace-pre-wrap break-words min-h-[30px] py-1">
                {card.content}
              </p>
            )}
          </CardContent>
          
          {!isEditing && ( // Footer for upvote button, visible when not editing
            <div className="px-3 pb-2 flex items-center justify-end space-x-1 text-xs text-muted-foreground">
              <Button 
                variant="ghost" 
                size="icon-sm" 
                className={cn(
                  "h-6 w-6 p-0.5 hover:bg-accent/50", 
                  hasUpvoted && "text-primary hover:text-primary/80"
                )}
                onClick={handleDirectUpvote}
                aria-label={hasUpvoted ? 'Remove upvote' : 'Upvote'}
                disabled={!isBoardConfirmedValid} // Disable if board not valid
              >
                <ThumbsUp className={cn("h-3.5 w-3.5")} />
              </Button>
              <span>{card.upvotes.length > 0 ? card.upvotes.length : ''}</span>
            </div>
          )}
        </Card>
      </ContextMenuTrigger>
      {isBoardConfirmedValid && ( // Only enable context menu if board is valid
        <ContextMenuContent className="w-56">
          {contextMenuItems}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
});

export default RetroCard;

