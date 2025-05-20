
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
      const boardUpdateHandler = (updatedBoard: BoardData) => {
        if (updatedBoard.id === boardId) {
          try {
            const message = `event: boardUpdate\ndata: ${JSON.stringify(updatedBoard)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
          } catch (e) {
            console.error("Error encoding or enqueuing SSE message:", e);
            // Potentially close stream if error is critical
          }
        }
      };

      // Send initial board state (optional, but good for immediate sync)
      const initialBoard = getBoardById(boardId);
      if (initialBoard) {
        try {
            const message = `event: boardUpdate\ndata: ${JSON.stringify(initialBoard)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
        } catch (e) {
            console.error("Error sending initial board state:", e);
        }
      } else {
         // If board doesn't exist, maybe send an error event or just close
         console.warn(`SSE connection for non-existent board: ${boardId}`);
         // controller.enqueue(new TextEncoder().encode(`event: error\ndata: {"message": "Board not found"}\n\n`));
         // controller.close(); 
         // return;
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
