
"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// import type { BoardData } from '@/lib/types'; // Not needed directly
// import { INITIAL_COLUMNS_DATA } from '@/lib/types'; // Not needed directly
// import { v4 as uuidv4 } from 'uuid'; // Not needed directly

interface CreateBoardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onBoardCreated: (title: string) => void; // Changed to pass only title
}

export default function CreateBoardDialog({ isOpen, onClose, onBoardCreated }: CreateBoardDialogProps) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title cannot be empty.');
      return;
    }
    setError('');
    onBoardCreated(title.trim());
    setTitle(''); 
    onClose();
  };

  // Reset title when dialog is opened/closed to ensure fresh state
  React.useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setError('');
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create New Board</DialogTitle>
          <DialogDescription>
            Give your new retrospective board a title.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="board-title" className="text-right">
                Title
              </Label>
              <Input
                id="board-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="col-span-3"
                autoFocus
                maxLength={100}
              />
            </div>
            {error && <p className="col-span-4 text-sm text-destructive text-center">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!title.trim()}>Create Board</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
