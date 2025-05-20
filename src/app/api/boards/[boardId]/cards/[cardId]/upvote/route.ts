
import { NextResponse, type NextRequest } from 'next/server';
import { upvoteCardInDB, getBoardById } from '@/lib/in-memory-db';
import { z } from 'zod';
// Emitter is handled within upvoteCardInDB

interface Context {
  params: {
    boardId: string;
    cardId: string;
  };
}

const UpvoteCardSchema = z.object({
  userId: z.string().min(1, "User ID is required for upvoting"),
});

export async function POST(request: NextRequest, { params }: Context) {
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
    const validation = UpvoteCardSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid request body for upvote', errors: validation.error.issues }, { status: 400 });
    }

    const { userId } = validation.data;
    const updatedCard = upvoteCardInDB(boardId, cardId, userId); // This will emit event

    if (!updatedCard) {
      return NextResponse.json({ message: 'Failed to upvote card, card or board not found' }, { status: 404 });
    }
    return NextResponse.json(updatedCard);
  } catch (error) {
    console.error(`Failed to upvote card ${params.cardId} on board ${params.boardId}:`, error);
     if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Failed to upvote card' }, { status: 500 });
  }
}
