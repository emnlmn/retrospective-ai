
import { NextResponse, type NextRequest } from 'next/server';
import { addCardToDB, getBoardById } from '@/lib/in-memory-db';
import type { ColumnId } from '@/lib/types';
import { z } from 'zod';

interface Context {
  params: {
    boardId: string;
  };
}

const CreateCardSchema = z.object({
  content: z.string().min(1, "Card content is required"),
  columnId: z.enum(['wentWell', 'toImprove', 'actionItems']),
  userId: z.string().min(1, "User ID is required"),
  userName: z.string().min(1, "User name is required"),
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
    const validation = CreateCardSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid request body for card creation', errors: validation.error.issues }, { status: 400 });
    }

    const { content, columnId, userId, userName } = validation.data;
    const newCard = addCardToDB(boardId, columnId, content, userId, userName);

    if (!newCard) {
      // This case might be redundant if getBoardById check is robust, but good for safety.
      return NextResponse.json({ message: 'Failed to create card, board might not exist or column invalid' }, { status: 500 });
    }
    return NextResponse.json(newCard, { status: 201 });
  } catch (error) {
    console.error(`Failed to create card for board ${params.boardId}:`, error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Failed to create card' }, { status: 500 });
  }
}
