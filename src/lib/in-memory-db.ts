
import type { BoardData, CardData, ColumnId, User } from '@/lib/types';
import { INITIAL_COLUMNS_DATA } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import emitter from '@/lib/event-emitter';

// In-memory store
let boards: BoardData[] = [];

// --- Board Operations ---

export function getAllBoards(): BoardData[] {
  // Deep clone to prevent direct mutation of the in-memory store
  return JSON.parse(JSON.stringify(boards));
}

export function getBoardById(boardId: string): BoardData | undefined {
  const board = boards.find(b => b.id === boardId);
  return board ? JSON.parse(JSON.stringify(board)) : undefined;
}

export function addBoardToDB(title: string, userId: string, userName: string): BoardData {
  const newBoard: BoardData = {
    id: uuidv4(),
    title,
    cards: {},
    columns: JSON.parse(JSON.stringify(INITIAL_COLUMNS_DATA)), // Ensure a deep copy
    createdAt: new Date().toISOString(),
  };
  boards.unshift(newBoard); 
  
  // Emit event for real-time update
  const boardForEmit = getBoardById(newBoard.id); // Get a fresh clone for emitting
  if (boardForEmit) {
    emitter.emit(`boardUpdate:${newBoard.id}`, boardForEmit);
  }
  
  return JSON.parse(JSON.stringify(newBoard)); // Return a clone to the caller
}

export function deleteBoardFromDB(boardId: string): boolean {
  const initialLength = boards.length;
  boards = boards.filter(b => b.id !== boardId);
  const deleted = boards.length < initialLength;
  if (deleted) {
    emitter.emit(`boardUpdate:${boardId}`, null); // Signal deletion with null
  }
  return deleted;
}

// --- Card Operations ---

export function addCardToDB(boardId: string, columnId: ColumnId, content: string, userId: string, userName: string): CardData | null {
  const board = boards.find(b => b.id === boardId);
  if (!board) return null;

  const newCardId = uuidv4();
  const newCard: CardData = {
    id: newCardId,
    content,
    userId,
    userName,
    createdAt: new Date().toISOString(),
    upvotes: [],
    order: 0, // Will be set by reordering logic
  };

  board.cards[newCardId] = newCard;
  board.columns[columnId].cardIds.unshift(newCardId); // Add to the beginning

  // Re-order cards in the affected column
  board.columns[columnId].cardIds.forEach((cardId, index) => {
    if (board.cards[cardId]) {
      board.cards[cardId].order = index;
    }
  });
  
  const updatedBoard = getBoardById(boardId);
  if (updatedBoard) emitter.emit(`boardUpdate:${boardId}`, updatedBoard);
  
  return JSON.parse(JSON.stringify(newCard));
}

export function updateCardInDB(boardId: string, cardId: string, newContent: string): CardData | null {
  const board = boards.find(b => b.id === boardId);
  if (!board || !board.cards[cardId]) return null;

  board.cards[cardId].content = newContent;

  const updatedBoard = getBoardById(boardId);
  if (updatedBoard) emitter.emit(`boardUpdate:${boardId}`, updatedBoard);

  return JSON.parse(JSON.stringify(board.cards[cardId]));
}

export function deleteCardFromDB(boardId: string, columnId: ColumnId, cardId: string): boolean {
  const board = boards.find(b => b.id === boardId);
  if (!board || !board.cards[cardId]) return false;

  delete board.cards[cardId];
  board.columns[columnId].cardIds = board.columns[columnId].cardIds.filter(id => id !== cardId);

  // Re-order cards in the affected column
  board.columns[columnId].cardIds.forEach((cid, index) => {
    if (board.cards[cid]) {
      board.cards[cid].order = index;
    }
  });

  const updatedBoard = getBoardById(boardId);
  if (updatedBoard) emitter.emit(`boardUpdate:${boardId}`, updatedBoard);
  return true;
}

export function upvoteCardInDB(boardId: string, cardId: string, userId: string): CardData | null {
  const board = boards.find(b => b.id === boardId);
  if (!board || !board.cards[cardId]) return null;

  const card = board.cards[cardId];
  const upvoteIndex = card.upvotes.indexOf(userId);
  if (upvoteIndex > -1) {
    card.upvotes.splice(upvoteIndex, 1);
  } else {
    card.upvotes.push(userId);
  }

  const updatedBoard = getBoardById(boardId);
  if (updatedBoard) emitter.emit(`boardUpdate:${boardId}`, updatedBoard);

  return JSON.parse(JSON.stringify(card));
}

export function moveCardInDB(
  boardId: string,
  draggedCardId: string,
  sourceColumnId: ColumnId,
  destColumnId: ColumnId,
  destinationIndex: number,
  mergeTargetCardId?: string
): BoardData | null {
  const boardIndex = boards.findIndex(b => b.id === boardId);
  if (boardIndex === -1) return null;

  const board = boards[boardIndex]; // Direct reference for mutation
  
  const draggedCard = board.cards[draggedCardId];
  if (!draggedCard) return null;

  // Handle Merge
  if (mergeTargetCardId && mergeTargetCardId !== draggedCardId && destinationIndex === -1) {
    const targetCard = board.cards[mergeTargetCardId];
    if (!targetCard || !board.columns[destColumnId].cardIds.includes(mergeTargetCardId)) return null;

    targetCard.content = `${targetCard.content}\n----\n${draggedCard.content}`;
    const combinedUpvotes = new Set([...targetCard.upvotes, ...draggedCard.upvotes]);
    targetCard.upvotes = Array.from(combinedUpvotes);

    delete board.cards[draggedCardId];
    board.columns[sourceColumnId].cardIds = board.columns[sourceColumnId].cardIds.filter(id => id !== draggedCardId);
  } else {
    // Handle Reposition
    const sourceCol = board.columns[sourceColumnId];
    const destCol = board.columns[destColumnId];
    const originalSourceIndex = sourceCol.cardIds.indexOf(draggedCardId);

    if (originalSourceIndex === -1) return null; 

    sourceCol.cardIds.splice(originalSourceIndex, 1); 

    let effectiveDestinationIndex = destinationIndex;
    if (sourceColumnId === destColumnId && originalSourceIndex < destinationIndex) {
      effectiveDestinationIndex = Math.max(0, destinationIndex - 1);
    }
    effectiveDestinationIndex = Math.max(0, Math.min(effectiveDestinationIndex, destCol.cardIds.length));
    destCol.cardIds.splice(effectiveDestinationIndex, 0, draggedCardId); 
  }

  // Update orders for all affected columns
  (Object.keys(board.columns) as ColumnId[]).forEach(colId => {
    board.columns[colId].cardIds.forEach((cardId, index) => {
      if (board.cards[cardId]) {
        board.cards[cardId].order = index;
      }
    });
  });
  
  const updatedBoardForEmit = getBoardById(boardId); // Get a fresh clone for emitting
  if (updatedBoardForEmit) {
    emitter.emit(`boardUpdate:${boardId}`, updatedBoardForEmit);
    return updatedBoardForEmit; 
  }
  return null;
}

// Utility to reset the DB for testing if needed (not for production)
export function resetDB() {
  boards = [];
}
