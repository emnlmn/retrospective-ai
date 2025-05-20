
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
      let initialBoardStateSent = false; // Flag to track if initial state (even if null) has been attempted to send

      const boardUpdateHandler = (updatedBoard: BoardData | null) => {
        // This handler is for ALL updates, including one that might be the "initial" one we waited for.
        if (updatedBoard === null || (updatedBoard && updatedBoard.id === boardId)) {
          try {
            const message = `event: boardUpdate\ndata: ${JSON.stringify(updatedBoard)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
            initialBoardStateSent = true; // Mark that we've sent *something*
            console.log(`SSE: Sent boardUpdate for ${boardId}`, updatedBoard);
          } catch (e) {
            console.error("Error enqueuing SSE message:", e);
          }
        }
      };

      // Always subscribe to the main handler for future updates
      emitter.on(`boardUpdate:${boardId}`, boardUpdateHandler);
      console.log(`SSE: Subscribed to boardUpdate:${boardId}`);

      // Attempt to get current state
      const boardNow = getBoardById(boardId);

      if (boardNow) {
        // Board exists, send it as initial state using the main handler
        console.log(`SSE: Board ${boardId} found initially. Sending state.`);
        boardUpdateHandler(boardNow);
      } else {
        // Board doesn't exist at this very moment.
        // It might be a brand new board being created, or a truly invalid ID.
        // We DO NOT send an immediate null here. We'll wait for the first event
        // from the emitter. If addBoardToDB emits for this boardId, boardUpdateHandler
        // will catch it and send the board data. If it's an invalid ID, no event
        // will come, and the client will show "Board not found or is being loaded...".
        console.warn(`SSE for ${boardId}: Board not found initially. Waiting for first event via emitter.`);
      }
      
      request.signal.addEventListener('abort', () => {
        emitter.off(`boardUpdate:${boardId}`, boardUpdateHandler);
        try {
            // Check if controller is still open before trying to close
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
