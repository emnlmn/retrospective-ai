
import type { BoardData, CardData, ColumnData, ColumnId, User } from '@/lib/types';
import { INITIAL_COLUMNS_DATA } from '@/lib/types';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

interface BoardState {
  boards: BoardData[];
  user: User | null;
  currentBoardId: string | null;
  isUserLoading: boolean;
  isBoardsLoading: boolean; // For fetching boards
  actions: {
    // User actions
    setUser: (name: string) => void;
    loadInitialUserAndBoards: () => Promise<void>;
    // Board actions
    fetchBoards: () => Promise<void>;
    addBoard: (title: string) => Promise<BoardData | null>;
    setCurrentBoardId: (boardId: string | null) => void;
    getBoardById: (boardId: string) => BoardData | undefined;
    setBoardFromServer: (updatedBoard: BoardData) => void; // For SSE updates
    removeBoardFromServer: (boardId: string) => void; // For SSE board deletion
    // Card actions
    addCard: (boardId: string, columnId: ColumnId, content: string, userNameSuffix?: string) => Promise<void>;
    updateCardContent: (boardId: string, cardId: string, newContent: string) => Promise<void>;
    deleteCard: (boardId: string, columnId: ColumnId, cardId: string) => Promise<void>;
    upvoteCard: (boardId: string, cardId: string, userId: string) => Promise<void>;
    moveCard: (
      boardId: string,
      draggedCardId: string,
      sourceColumnId: ColumnId,
      destColumnId: ColumnId,
      destinationIndex: number,
      mergeTargetCardId?: string
    ) => Promise<void>;
  };
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      boards: [],
      user: null,
      currentBoardId: null,
      isUserLoading: true,
      isBoardsLoading: false,
      actions: {
        setUser: (name) => {
          const currentUser = get().user;
          const newUser = { id: currentUser?.id || uuidv4(), name };
          set({ user: newUser, isUserLoading: false });
        },
        loadInitialUserAndBoards: async () => {
          set({ isUserLoading: true });
          // User is loaded from persisted state by zustand/persist middleware
          const userLoaded = get().user; 
          if (userLoaded) {
             set({ isUserLoading: false }); // Mark user as loaded
          } else {
            // If no user in persisted state, still mark as not loading so UI can prompt for setup
            set({ isUserLoading: false });
          }
          // Fetch boards after user state is confirmed
          await get().actions.fetchBoards();
        },
        fetchBoards: async () => {
          set({ isBoardsLoading: true });
          try {
            const response = await fetch('/api/boards');
            if (!response.ok) {
              throw new Error(`Failed to fetch boards: ${response.statusText}`);
            }
            const boardsData: BoardData[] = await response.json();
            set({ boards: boardsData, isBoardsLoading: false });
          } catch (error) {
            console.error("Error fetching boards:", error);
            set({ isBoardsLoading: false, boards: [] }); // Set boards to empty on error
          }
        },
        addBoard: async (title) => {
          const user = get().user;
          if (!user) {
            console.error("User not set, cannot add board");
            return null;
          }
          try {
            const response = await fetch('/api/boards', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, userId: user.id, userName: user.name }),
            });
            if (!response.ok) {
              let errorDetails = response.statusText;
              try {
                const errorData = await response.json();
                errorDetails = errorData.message || JSON.stringify(errorData.errors) || errorDetails;
              } catch (e) {
                // If parsing JSON fails, use the original statusText or just the status
              }
              throw new Error(`Failed to add board. Status: ${response.status}. Details: ${errorDetails}`);
            }
            const newBoard: BoardData = await response.json();
            // After successful creation, fetch all boards to update the list on home page
            await get().actions.fetchBoards(); 
            return newBoard; // Still return the newBoard for immediate use (e.g., navigation)
          } catch (error) {
            console.error("Error adding board:", error);
            // Potentially use a toast to show error to user
            return null;
          }
        },
        setCurrentBoardId: (boardId) => set({ currentBoardId: boardId }),
        getBoardById: (boardId) => get().boards.find(b => b.id === boardId),
        setBoardFromServer: (updatedBoard) => {
          set(state => {
            const boardExists = state.boards.some(b => b.id === updatedBoard.id);
            if (boardExists) {
              return {
                boards: state.boards.map(b => b.id === updatedBoard.id ? updatedBoard : b),
              };
            } else {
              // If board doesn't exist, add it (e.g. a new board created by this or another client)
              return {
                boards: [updatedBoard, ...state.boards].sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
              };
            }
          });
        },
        removeBoardFromServer: (boardId) => {
          set(state => ({
            boards: state.boards.filter(b => b.id !== boardId),
            currentBoardId: state.currentBoardId === boardId ? null : state.currentBoardId,
          }));
        },
        addCard: async (boardId, columnId, content, userNameSuffix = '') => {
          const user = get().user;
          if (!user) {
            console.error("User not set, cannot add card");
            throw new Error("User not authenticated to add card.");
          }
          try {
            const response = await fetch(`/api/boards/${boardId}/cards`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content,
                columnId,
                userId: user.id,
                userName: `${user.name}${userNameSuffix}`,
              }),
            });
            if (!response.ok) {
              let errorDetails = response.statusText;
              try {
                const errorData = await response.json();
                errorDetails = errorData.message || JSON.stringify(errorData.errors) || errorDetails;
              } catch (e) {
              }
              throw new Error(`Failed to add card. Status: ${response.status}. Details: ${errorDetails}`);
            }
            // API should have emitted an SSE
          } catch (error) {
            console.error("Error adding card:", error);
            throw error; // Re-throw to be caught by calling component
          }
        },
        updateCardContent: async (boardId, cardId, newContent) => {
          try {
            const response = await fetch(`/api/boards/${boardId}/cards/${cardId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: newContent }),
            });
            if (!response.ok) {
              let errorDetails = response.statusText;
              try {
                const errorData = await response.json();
                errorDetails = errorData.message || JSON.stringify(errorData.errors) || errorDetails;
              } catch (e) {
              }
              throw new Error(`Failed to update card. Status: ${response.status}. Details: ${errorDetails}`);
            }
            // API emits SSE
          } catch (error) {
            console.error("Error updating card content:", error);
            throw error; // Re-throw
          }
        },
        deleteCard: async (boardId, columnId, cardId) => { 
          try {
            const response = await fetch(`/api/boards/${boardId}/cards/${cardId}`, {
              method: 'DELETE',
            });
            if (!response.ok) {
              let errorDetails = response.statusText;
              try {
                const errorData = await response.json();
                errorDetails = errorData.message || JSON.stringify(errorData.errors) || errorDetails;
              } catch (e) {
              }
              throw new Error(`Failed to delete card. Status: ${response.status}. Details: ${errorDetails}`);
            }
            // API emits SSE
          } catch (error) {
            console.error("Error deleting card:", error);
            throw error; // Re-throw
          }
        },
        upvoteCard: async (boardId, cardId, userIdToUpvote) => { 
          const user = get().user;
          if (!user) {
            console.error("User not set, cannot upvote card");
            throw new Error("User not authenticated to upvote card.");
          }
          try {
            const response = await fetch(`/api/boards/${boardId}/cards/${cardId}/upvote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id }), 
            });
            if (!response.ok) {
              let errorDetails = response.statusText;
              try {
                const errorData = await response.json();
                errorDetails = errorData.message || JSON.stringify(errorData.errors) || errorDetails;
              } catch (e) {
              }
              throw new Error(`Failed to upvote card. Status: ${response.status}. Details: ${errorDetails}`);
            }
            // API emits SSE
          } catch (error) {
            console.error("Error upvoting card:", error);
            throw error; // Re-throw
          }
        },
        moveCard: async (boardId, draggedCardId, sourceColumnId, destColumnId, destinationIndex, mergeTargetCardId) => {
          try {
            const response = await fetch(`/api/boards/${boardId}/move-card`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                draggedCardId,
                sourceColumnId,
                destColumnId,
                destinationIndex,
                mergeTargetCardId,
              }),
            });
            if (!response.ok) {
              let errorDetails = response.statusText;
              try {
                const errorData = await response.json(); 
                errorDetails = errorData.message || JSON.stringify(errorData.errors) || errorDetails;
              } catch (e) {
              }
              throw new Error(`Failed to move card. Status: ${response.status}. Details: ${errorDetails}`);
            }
            // API emits SSE
          } catch (error) {
            console.error("Error moving card:", error);
            throw error; // Re-throw
          }
        },
      },
    }),
    {
      name: 'retrospective-app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, currentBoardId: state.currentBoardId }), 
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            console.error('Failed to rehydrate state from localStorage:', error)
          }
          if (state) {
            state.isUserLoading = false; 
            // loadInitialUserAndBoards will be called from UserProvider to fetch actual board data
          } else {
            set({ isUserLoading: false, user: null });
          }
        }
      }
    }
  )
);

export const useBoardActions = () => useBoardStore((state) => state.actions);
