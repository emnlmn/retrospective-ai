
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
        if (updatedBoard === null || updatedBoard.id === boardId) {
          try {
            const message = `event: boardUpdate\ndata: ${JSON.stringify(updatedBoard)}\n\n`;
            controller.enqueue(new TextEncoder().encode(message));
          } catch (e) {
            console.error("Error encoding or enqueuing SSE message:", e);
          }
        }
      };

      const sendInitialState = (boardData: BoardData | null | undefined) => {
        if (boardData) {
          try {
              const message = `event: boardUpdate\ndata: ${JSON.stringify(boardData)}\n\n`;
              controller.enqueue(new TextEncoder().encode(message));
          } catch (e) {
              console.error("Error sending initial board state:", e);
          }
        } else {
           console.warn(`SSE connection for board: ${boardId}. Board not found initially or confirmed null. Sending null update.`);
           try {
              const message = `event: boardUpdate\ndata: ${JSON.stringify(null)}\n\n`;
              controller.enqueue(new TextEncoder().encode(message));
           } catch (e) {
              console.error("Error sending null board state:", e);
           }
        }
      };

      let initialBoard = getBoardById(boardId);

      if (!initialBoard) {
        // Board not found immediately, try again after a short delay
        // This is a workaround for potential race conditions with new board creation
        console.log(`Board ${boardId} not found immediately for SSE, retrying in 200ms.`);
        setTimeout(() => {
          initialBoard = getBoardById(boardId); // Re-check
          sendInitialState(initialBoard);
          emitter.on(`boardUpdate:${boardId}`, boardUpdateHandler);
        }, 200); // 200ms delay, adjust if necessary
      } else {
        sendInitialState(initialBoard);
        emitter.on(`boardUpdate:${boardId}`, boardUpdateHandler);
      }
      
      request.signal.addEventListener('abort', () => {
        emitter.off(`boardUpdate:${boardId}`, boardUpdateHandler);
        try {
          if (controller.desiredSize !== null) { // Check if controller is still active
            controller.close();
          }
        } catch (e) {
            // Ignore errors on close if already closed or stream is broken
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

