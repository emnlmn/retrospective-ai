
import { NextResponse, type NextRequest } from 'next/server';
import { moveCardInDB, getBoardById } from '@/lib/in-memory-db';
import type { ColumnId } from '@/lib/types';
import { z } from 'zod';
// Emitter is handled within moveCardInDB

interface Context {
  params: {
    boardId: string;
  };
}

const MoveCardSchema = z.object({
  draggedCardId: z.string().min(1),
  sourceColumnId: z.enum(['wentWell', 'toImprove', 'actionItems']),
  destColumnId: z.enum(['wentWell', 'toImprove', 'actionItems']),
  destinationIndex: z.number().int(), 
  mergeTargetCardId: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { boardId } = params;
    if (!boardId) {
      return NextResponse.json({ message: 'Board ID is required' }, { status: 400 });
    }
    
    const boardExists = getBoardById(boardId);
    if (!boardExists) {
      return NextResponse.json({ message: 'Board not found' }, { status: 404 });
    }

    const body = await request.json();
    const validation = MoveCardSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid request body for moving card', errors: validation.error.issues }, { status: 400 });
    }
    
    const {
      draggedCardId,
      sourceColumnId,
      destColumnId,
      destinationIndex,
      mergeTargetCardId,
    } = validation.data;

    const updatedBoard = moveCardInDB( // This will emit event
      boardId,
      draggedCardId,
      sourceColumnId,
      destColumnId,
      destinationIndex,
      mergeTargetCardId
    );

    if (!updatedBoard) {
      return NextResponse.json({ message: 'Failed to move card, operation resulted in an error or invalid state.' }, { status: 500 });
    }
    return NextResponse.json(updatedBoard);
  } catch (error) {
    console.error(`Failed to move card on board ${params.boardId}:`, error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Failed to move card' }, { status: 500 });
  }
}
