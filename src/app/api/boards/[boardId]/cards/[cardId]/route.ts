
import { NextResponse, type NextRequest } from 'next/server';
import { updateCardInDB, deleteCardFromDB, getBoardById } from '@/lib/in-memory-db';
import { z } from 'zod';
import type { ColumnId } from '@/lib/types';


interface Context {
  params: {
    boardId: string;
    cardId: string;
  };
}

const UpdateCardSchema = z.object({
  content: z.string().min(1, "Card content is required"),
});

export async function PUT(request: NextRequest, { params }: Context) {
  try {
    const { boardId, cardId } = params;
    if (!boardId || !cardId) {
      return NextResponse.json({ message: 'Board ID and Card ID are required' }, { status: 400 });
    }

    const board = getBoardById(boardId);
    if (!board) {
      return NextResponse.json({ message: 'Board not found' }, { status: 404 });
    }
    if (!board.cards[cardId]) {
      return NextResponse.json({ message: 'Card not found on this board' }, { status: 404 });
    }

    const body = await request.json();
    const validation = UpdateCardSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid request body for card update', errors: validation.error.issues }, { status: 400 });
    }
    
    const { content } = validation.data;
    const updatedCard = updateCardInDB(boardId, cardId, content);

    if (!updatedCard) {
      // Should be caught by earlier checks, but for safety
      return NextResponse.json({ message: 'Failed to update card, card or board not found' }, { status: 404 });
    }
    return NextResponse.json(updatedCard);
  } catch (error) {
    console.error(`Failed to update card ${params.cardId} on board ${params.boardId}:`, error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Failed to update card' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const { boardId, cardId } = params;
     if (!boardId || !cardId) {
      return NextResponse.json({ message: 'Board ID and Card ID are required' }, { status: 400 });
    }

    const board = getBoardById(boardId);
    if (!board) {
      return NextResponse.json({ message: 'Board not found' }, { status: 404 });
    }
    if (!board.cards[cardId]) {
      return NextResponse.json({ message: 'Card not found on this board' }, { status: 404 });
    }
    
    // Find the column the card belongs to, to pass to deleteCardFromDB
    let columnIdToDeleteFrom: ColumnId | null = null;
    for (const colId of Object.keys(board.columns) as ColumnId[]) {
        if (board.columns[colId].cardIds.includes(cardId)) {
            columnIdToDeleteFrom = colId;
            break;
        }
    }

    if (!columnIdToDeleteFrom) {
        // Should not happen if card exists in board.cards and board structure is consistent
        console.error(`Card ${cardId} found in board.cards but not in any column.cardsIds for board ${boardId}`);
        return NextResponse.json({ message: 'Card data inconsistency, cannot determine column' }, { status: 500 });
    }

    const deleted = deleteCardFromDB(boardId, columnIdToDeleteFrom, cardId);
    if (!deleted) {
      // This might indicate an internal issue or the card was already deleted by a concurrent request.
      return NextResponse.json({ message: 'Card not found or could not be deleted' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Card deleted successfully' });
  } catch (error) {
    console.error(`Failed to delete card ${params.cardId} on board ${params.boardId}:`, error);
    return NextResponse.json({ message: 'Failed to delete card' }, { status: 500 });
  }
}
