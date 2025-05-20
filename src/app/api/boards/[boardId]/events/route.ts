
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
      const boardUpdateHandler = (updatedBoard: BoardData | null) => { // Allow null for deletion
        if (updatedBoard === null || updatedBoard.id === boardId) { // Check if updatedBoard is null or matches boardId
          try {
            const message = `event: boardUpdate\ndata: ${JSON.stringify(updatedBoard)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
          } catch (e) {
            console.error("Error encoding or enqueuing SSE message:", e);
            // Potentially close stream if error is critical
          }
        }
      };

      const initialBoard = getBoardById(boardId);
      if (initialBoard) {
        try {
            const message = `event: boardUpdate\ndata: ${JSON.stringify(initialBoard)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
        } catch (e) {
            console.error("Error sending initial board state:", e);
        }
      } else {
         // If board doesn't exist, explicitly send a null update
         console.warn(`SSE connection for non-existent board: ${boardId}. Sending null update.`);
         try {
            const message = `event: boardUpdate\ndata: ${JSON.stringify(null)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
         } catch (e) {
            console.error("Error sending null board state for non-existent board:", e);
         }
         // No need to close controller here, client will handle the null update and potentially navigate away.
      }
      
      emitter.on(`boardUpdate:${boardId}`, boardUpdateHandler);

      // Heartbeat to keep connection alive (optional, depends on infrastructure)
      // const intervalId = setInterval(() => {
      //   try {
      //     controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
      //   } catch (e) {
      //       console.error("Error sending heartbeat:", e);
      //   }
      // }, 10000);

      // Clean up when the client closes the connection
      request.signal.addEventListener('abort', () => {
        emitter.off(`boardUpdate:${boardId}`, boardUpdateHandler);
        // clearInterval(intervalId);
        try {
            controller.close();
        } catch (e) {
            // Ignore errors on close if already closed
        }
        console.log(`SSE connection closed for board: ${boardId}`);
      });
    },
    // cancel(reason) {
    //   // This is called if the stream is cancelled by the server, not typically by client disconnect
    //   console.log('SSE stream cancelled on server:', reason);
    // }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      // Add CORS headers if your client is on a different domain
      // 'Access-Control-Allow-Origin': '*', 
    },
  });
}

