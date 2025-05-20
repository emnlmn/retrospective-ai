
import {NextResponse, type NextRequest} from 'next/server';
import emitter from '@/lib/event-emitter';
import {getBoardById} from '@/lib/in-memory-db'; // To send initial state or verify board
import type { BoardData } from '@/lib/types';

interface Context {
  params: {
    boardId: string;
  };
}

export const dynamic = 'force-dynamic'; // Opt out of caching

export async function GET(request: NextRequest, { params }: Context) {
  const { boardId } = params;

  if (!boardId) {
    return NextResponse.json({ message: 'Board ID is required' }, { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const boardUpdateHandler = (updatedBoard: BoardData | null) => {
        // Only send update if it's for this boardId, or if it's a null (deletion) signal
        if (updatedBoard === null || updatedBoard.id === boardId) {
          try {
            const message = `event: boardUpdate\ndata: ${JSON.stringify(updatedBoard)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
          } catch (e) {
            console.error("Error encoding or enqueuing SSE message:", e);
          }
        }
      };

      // Send initial state immediately
      const initialBoard = getBoardById(boardId);
      try {
          const message = `event: boardUpdate\ndata: ${JSON.stringify(initialBoard || null)}\n\n`;
          controller.enqueue(new TextEncoder().encode(message));
          if (!initialBoard) {
            console.warn(`SSE connection for board: ${boardId}. Board not found initially. Sent null update.`);
          }
      } catch (e) {
          console.error("Error sending initial board state:", e);
      }
      
      emitter.on(`boardUpdate:${boardId}`, boardUpdateHandler);
      
      request.signal.addEventListener('abort', () => {
        emitter.off(`boardUpdate:${boardId}`, boardUpdateHandler);
        try {
          if (controller.desiredSize !== null) { 
            controller.close();
          }
        } catch (e) {
            console.warn(`Error closing SSE controller for board ${boardId} on abort:`, e);
        }
        console.log(`SSE connection closed for board: ${boardId}`);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
