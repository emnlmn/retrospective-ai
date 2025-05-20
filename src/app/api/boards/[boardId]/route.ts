
import { NextResponse, type NextRequest } from 'next/server';
import { getBoardById, deleteBoardFromDB } from '@/lib/in-memory-db';

interface Context {
  params: {
    boardId: string;
  };
}

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { boardId } = params;
    if (!boardId) {
      return NextResponse.json({ message: 'Board ID is required' }, { status: 400 });
    }
    const board = getBoardById(boardId);
    if (!board) {
      return NextResponse.json({ message: 'Board not found' }, { status: 404 });
    }
    return NextResponse.json(board);
  } catch (error) {
    console.error(`Failed to get board ${params.boardId}:`, error);
    return NextResponse.json({ message: 'Failed to retrieve board' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const { boardId } = params;
    if (!boardId) {
      return NextResponse.json({ message: 'Board ID is required' }, { status: 400 });
    }
    const deleted = deleteBoardFromDB(boardId);
    if (!deleted) {
      return NextResponse.json({ message: 'Board not found or could not be deleted' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Board deleted successfully' }, { status: 200 });
  } catch (error) {
    console.error(`Failed to delete board ${params.boardId}:`, error);
    return NextResponse.json({ message: 'Failed to delete board' }, { status: 500 });
  }
}

// PUT for updating board title could be added here if needed
// For now, board title is set at creation and not updated.
