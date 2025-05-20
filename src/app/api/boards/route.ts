
import { NextResponse, type NextRequest } from 'next/server';
import { getAllBoards, addBoardToDB } from '@/lib/in-memory-db';
import { z } from 'zod';
// No emitter needed here directly, as addBoardToDB might not trigger specific boardId events
// unless we also emit a general "boardsListUpdated" event for all clients.

export async function GET(request: NextRequest) {
  try {
    const boards = getAllBoards();
    return NextResponse.json(boards);
  } catch (error) {
    console.error('Failed to get boards:', error);
    return NextResponse.json({ message: 'Failed to retrieve boards' }, { status: 500 });
  }
}

const CreateBoardSchema = z.object({
  title: z.string().min(1, "Title is required"),
  userId: z.string().min(1, "User ID is required"),
  userName: z.string().min(1, "User name is required"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = CreateBoardSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ message: 'Invalid request body', errors: validation.error.issues }, { status: 400 });
    }

    const { title, userId, userName } = validation.data;
    const newBoard = addBoardToDB(title, userId, userName);
    // Note: addBoardToDB itself doesn't emit a specific boardUpdate event.
    // A global 'boardsListUpdated' event could be emitted here if desired.
    return NextResponse.json(newBoard, { status: 201 });
  } catch (error) {
    console.error('Failed to create board:', error);
    if (error instanceof SyntaxError) {
        return NextResponse.json({ message: 'Invalid JSON in request body' }, { status: 400 });
    }
    return NextResponse.json({ message: 'Failed to create board' }, { status: 500 });
  }
}
