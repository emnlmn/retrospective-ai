
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
        // This handler is for ALL updates, including the initial state.
        // It only sends if the update is for *this* boardId or if it's a null update (signifying deletion/not found).
        if (updatedBoard === null || (updatedBoard && updatedBoard.id === boardId)) {
          try {
            const message = `event: boardUpdate\ndata: ${JSON.stringify(updatedBoard)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
            // console.log(`SSE: Sent boardUpdate for ${boardId}`, updatedBoard ? `(Title: ${updatedBoard.title})` : '(null)');
          } catch (e) {
            console.error(`Error enqueuing SSE message for board ${boardId}:`, e);
            try {
              if (controller.desiredSize !== null) controller.close();
            } catch (closeError) {
              console.error(`Error closing controller for board ${boardId} after enqueue error:`, closeError);
            }
          }
        } else if (updatedBoard && updatedBoard.id !== boardId) {
          // console.log(`SSE: Ignored boardUpdate for ${updatedBoard.id} on connection for ${boardId}`);
        }
      };

      // Subscribe to specific board updates
      emitter.on(`boardUpdate:${boardId}`, boardUpdateHandler);
      // console.log(`SSE: Subscribed to boardUpdate:${boardId}`);

      // Send current state immediately after subscribing.
      // This ensures the client gets the initial status (board data or null if not found).
      const boardNow = getBoardById(boardId);
      boardUpdateHandler(boardNow); // Use the same handler for initial state.

      request.signal.addEventListener('abort', () => {
        emitter.off(`boardUpdate:${boardId}`, boardUpdateHandler);
        try {
            if (controller.desiredSize !== null) {
                controller.close();
            }
        } catch (e) {
            console.warn(`Error closing SSE controller for board ${boardId} on abort:`, e);
        }
        // console.log(`SSE connection closed for board: ${boardId}`);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Useful for Nginx environments
    },
  });
}
