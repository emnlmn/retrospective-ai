
"use client";

import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
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
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";


interface RetroCardProps {
  card: CardData;
  columnId: ColumnId;
  onUpdate: (cardId: string, newContent: string) => void;
  onDelete: (cardId: string, columnId: ColumnId) => void;
  onUpvote: (cardId: string) => void;
  onDragStartItem: (card: CardData, sourceColumnId: ColumnId) => void;
  isMergeTarget?: boolean;
  isBoardConfirmedValid: boolean;
  isDraggable: boolean;
  editingCardId: string | null;
  setEditingCardId: (id: string | null) => void;
}

const RetroCard = memo(function RetroCard({
    card,
    columnId,
    onUpdate,
    onDelete,
    onUpvote,
    onDragStartItem,
    isMergeTarget = false,
    isBoardConfirmedValid,
    isDraggable,
    editingCardId,
    setEditingCardId,
}: RetroCardProps) {
  const [editedContent, setEditedContent] = useState(card.content);
  const [isBeingDragged, setIsBeingDragged] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentUserId = useBoardStore(state => state.user?.id);

  const isThisCardEditing = editingCardId === card.id;

  const canEditOrDelete = card.userId === currentUserId;
  const hasUpvoted = currentUserId ? card.upvotes.includes(currentUserId) : false;

  useEffect(() => {
    if (card.content !== editedContent && !isThisCardEditing) {
        setEditedContent(card.content);
    }
  }, [card.content, editedContent, isThisCardEditing]);


  useEffect(() => {
    if (isThisCardEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isThisCardEditing]);

  const handleUpdate = useCallback(() => {
    if (!isBoardConfirmedValid) return;
    if (editedContent.trim() && editedContent.trim() !== card.content) {
      onUpdate(card.id, editedContent.trim());
    }
    setEditingCardId(null);
  }, [editedContent, card.content, card.id, onUpdate, isBoardConfirmedValid, setEditingCardId]);

  const handleCancelEdit = useCallback(() => {
    setEditedContent(card.content);
    setEditingCardId(null);
  }, [card.content, setEditingCardId]);

  const handleEditClick = useCallback(() => {
    if (!isBoardConfirmedValid || (editingCardId !== null && editingCardId !== card.id)) return;
    setEditedContent(card.content); // Ensure current content is in textarea
    setEditingCardId(card.id);
  }, [isBoardConfirmedValid, editingCardId, card.id, card.content, setEditingCardId]);

  const handleDragStartInternal = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isBoardConfirmedValid || isThisCardEditing || !isDraggable) {
        e.preventDefault();
        return;
    }
    e.dataTransfer.setData('text/plain', card.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsBeingDragged(true);
    onDragStartItem(card, columnId);
  }, [isThisCardEditing, card, columnId, onDragStartItem, isBoardConfirmedValid, isDraggable]);

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

  const handleDirectUpvote = useCallback(() => {
    if (!isBoardConfirmedValid || isThisCardEditing) return;
    onUpvote(card.id);
  }, [isBoardConfirmedValid, isThisCardEditing, onUpvote, card.id]);

  const isEditDisabled = !isBoardConfirmedValid || (editingCardId !== null && !isThisCardEditing);

  const menuItemsContent = (
    <>
      <DropdownMenuItem onClick={handleDirectUpvote} disabled={!isBoardConfirmedValid || isThisCardEditing}>
        <ThumbsUp className="mr-2 h-4 w-4" />
        <span>{hasUpvoted ? 'Remove Upvote' : 'Upvote'}</span>
      </DropdownMenuItem>
      {canEditOrDelete && (
        <>
          <DropdownMenuItem onClick={handleEditClick} disabled={isEditDisabled}>
            <Edit3 className="mr-2 h-4 w-4" />
            <span>Edit</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onDelete(card.id, columnId)}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
            disabled={!isBoardConfirmedValid || isThisCardEditing}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">Card Info</DropdownMenuLabel>
      <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
                <DropdownMenuItem disabled className="opacity-70 cursor-default focus:bg-transparent">
                    <UserIcon className="mr-2 h-3.5 w-3.5" />
                    Author: <span className="truncate max-w-[100px] hover:underline">{card.userName}</span>
                </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="right" align="start" className="bg-popover text-popover-foreground border shadow-md rounded-md p-2 text-xs">
                {card.userName}
            </TooltipContent>
        </Tooltip>
        <Tooltip>
            <TooltipTrigger asChild>
                <DropdownMenuItem disabled className="opacity-70 cursor-default focus:bg-transparent">
                    <CalendarDays className="mr-2 h-3.5 w-3.5" />
                    Created: <span className="truncate max-w-[100px] hover:underline">{relativeDate}</span>
                </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent side="right" align="start" className="bg-popover text-popover-foreground border shadow-md rounded-md p-2 text-xs">
                {new Date(card.createdAt).toLocaleString()}
            </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );

  const contextMenuItemsContent = (
     <>
      <ContextMenuItem onClick={handleDirectUpvote} disabled={!isBoardConfirmedValid || isThisCardEditing}>
        <ThumbsUp className="mr-2 h-4 w-4" />
        <span>{hasUpvoted ? 'Remove Upvote' : 'Upvote'}</span>
      </ContextMenuItem>
      {canEditOrDelete && (
        <>
          <ContextMenuItem onClick={handleEditClick} disabled={isEditDisabled}>
            <Edit3 className="mr-2 h-4 w-4" />
            <span>Edit</span>
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => onDelete(card.id, columnId)}
            className="text-destructive focus:text-destructive focus:bg-destructive/10"
            disabled={!isBoardConfirmedValid || isThisCardEditing}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            <span>Delete</span>
          </ContextMenuItem>
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuLabel className="text-xs text-muted-foreground px-2 py-1.5">Card Info</ContextMenuLabel>
      <TooltipProvider>
        <Tooltip>
            <TooltipTrigger asChild>
                <ContextMenuItem disabled className="opacity-70 cursor-default focus:bg-transparent">
                    <UserIcon className="mr-2 h-3.5 w-3.5" />
                    Author: <span className="truncate max-w-[100px] hover:underline">{card.userName}</span>
                </ContextMenuItem>
            </TooltipTrigger>
            <TooltipContent side="right" align="start" className="bg-popover text-popover-foreground border shadow-md rounded-md p-2 text-xs">
                {card.userName}
            </TooltipContent>
        </Tooltip>
        <Tooltip>
            <TooltipTrigger asChild>
                <ContextMenuItem disabled className="opacity-70 cursor-default focus:bg-transparent">
                    <CalendarDays className="mr-2 h-3.5 w-3.5" />
                    Created: <span className="truncate max-w-[100px] hover:underline">{relativeDate}</span>
                </ContextMenuItem>
            </TooltipTrigger>
            <TooltipContent side="right" align="start" className="bg-popover text-popover-foreground border shadow-md rounded-md p-2 text-xs">
                {new Date(card.createdAt).toLocaleString()}
            </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );


  return (
    <ContextMenu>
      <ContextMenuTrigger disabled={isThisCardEditing || !isBoardConfirmedValid || !isDraggable}>
        <Card
            data-card-id={card.id}
            draggable={!isThisCardEditing && isBoardConfirmedValid && isDraggable}
            onDragStart={handleDragStartInternal}
            onDragEnd={handleDragEndInternal}
            className={cn(
              "bg-card/90 shadow-sm hover:shadow-md transition-all duration-200 relative group border min-h-[80px] flex flex-col",
              isThisCardEditing ? "ring-2 ring-primary cursor-default"
                        : cn(
                            (isBoardConfirmedValid && isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"),
                            isMergeTarget && "ring-2 ring-offset-1 ring-primary shadow-lg",
                            !isMergeTarget && columnId === 'wentWell' && 'border-l-4 border-l-success',
                            !isMergeTarget && columnId === 'toImprove' && 'border-l-4 border-l-destructive',
                            !isMergeTarget && columnId === 'actionItems' && 'border-l-4 border-l-accent'
                          ),
              isBeingDragged && "opacity-50",
              !isBoardConfirmedValid && "opacity-60"
            )}
        >
          {!isThisCardEditing && isBoardConfirmedValid && isDraggable && (
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
                  {menuItemsContent}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <CardContent className={cn("p-3 flex-grow pr-6 break-words", isThisCardEditing && "pb-1")}>
            {isThisCardEditing && canEditOrDelete && isBoardConfirmedValid ? (
              <div className="space-y-2">
                <Textarea
                  ref={textareaRef}
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full min-h-[60px] text-sm bg-transparent border-0 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 resize-none text-card-foreground whitespace-pre-wrap py-1"
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
              <p className="text-sm text-card-foreground whitespace-pre-wrap min-h-[30px] py-1">
                {card.content}
              </p>
            )}
          </CardContent>

          {!isThisCardEditing && (
            <div className="px-3 pb-2 flex items-center justify-end space-x-1 text-xs text-muted-foreground">
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "h-6 w-6 p-0.5 hover:bg-accent/50",
                  hasUpvoted && "text-primary hover:text-primary/80",
                  (!isBoardConfirmedValid || isThisCardEditing) && "cursor-not-allowed opacity-50",
                  (isBoardConfirmedValid && !isThisCardEditing) && "cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                )}
                onClick={handleDirectUpvote}
                aria-label={hasUpvoted ? 'Remove upvote' : 'Upvote'}
                disabled={!isBoardConfirmedValid || isThisCardEditing}
              >
                <ThumbsUp className={cn("h-3.5 w-3.5")} />
              </Button>
              <span>{card.upvotes.length}</span>
            </div>
          )}
        </Card>
      </ContextMenuTrigger>
      {isBoardConfirmedValid && !isThisCardEditing && isDraggable && (
        <ContextMenuContent className="w-56">
          {contextMenuItemsContent}
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
});

export default RetroCard;
