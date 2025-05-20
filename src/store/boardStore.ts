
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
    loadInitialUserAndBoards: () => Promise<void>; // Renamed and made async
    // Board actions
    fetchBoards: () => Promise<void>;
    addBoard: (title: string) => Promise<BoardData | null>;
    setCurrentBoardId: (boardId: string | null) => void;
    getBoardById: (boardId: string) => BoardData | undefined; // Remains sync, operates on local state
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
          // No backend call for user creation/update in this iteration
        },
        loadInitialUserAndBoards: async () => {
          set({ isUserLoading: true });
          // User is loaded by persist middleware from localStorage
          const userLoaded = get().user; 
          if (userLoaded) {
             set({ isUserLoading: false });
          } else {
            // If user is not in localStorage, UserSetupDialog will prompt
            set({ isUserLoading: false }); // Still set to false, dialog handles it
          }
          await get().actions.fetchBoards(); // Fetch boards after user is potentially available
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
            set({ isBoardsLoading: false, boards: [] }); // Set to empty on error or handle as needed
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
              throw new Error(`Failed to add board: ${response.statusText}`);
            }
            const newBoard: BoardData = await response.json();
            set((state) => ({ boards: [newBoard, ...state.boards] }));
            return newBoard;
          } catch (error) {
            console.error("Error adding board:", error);
            return null;
          }
        },
        setCurrentBoardId: (boardId) => set({ currentBoardId: boardId }),
        getBoardById: (boardId) => get().boards.find(b => b.id === boardId),

        addCard: async (boardId, columnId, content, userNameSuffix = '') => {
          const user = get().user;
          if (!user) {
            console.error("User not set, cannot add card");
            return;
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
              throw new Error(`Failed to add card: ${response.statusText}`);
            }
            const newCard: CardData = await response.json();
            // Instead of just adding, we might need to re-fetch the board or update more carefully
            // For now, let's find the board and update it locally.
            // A better approach might be for the API to return the updated board.
            set(state => {
              const boardIndex = state.boards.findIndex(b => b.id === boardId);
              if (boardIndex === -1) return state;
              const boardsCopy = [...state.boards];
              const boardToUpdate = { ...boardsCopy[boardIndex] };
              boardToUpdate.cards = { ...boardToUpdate.cards, [newCard.id]: newCard };
              boardToUpdate.columns = {
                ...boardToUpdate.columns,
                [columnId]: {
                  ...boardToUpdate.columns[columnId],
                  cardIds: [newCard.id, ...boardToUpdate.columns[columnId].cardIds]
                }
              };
              // Re-order cards in the affected column
              boardToUpdate.columns[columnId].cardIds.forEach((cardId, index) => {
                  if (boardToUpdate.cards[cardId]) {
                      boardToUpdate.cards[cardId] = { ...boardToUpdate.cards[cardId], order: index };
                  }
              });
              boardsCopy[boardIndex] = boardToUpdate;
              return { boards: boardsCopy };
            });

          } catch (error) {
            console.error("Error adding card:", error);
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
              throw new Error(`Failed to update card: ${response.statusText}`);
            }
            const updatedCard: CardData = await response.json();
            set(state => {
              const boardIndex = state.boards.findIndex(b => b.id === boardId);
              if (boardIndex === -1) return state;
              const boardsCopy = [...state.boards];
              const boardToUpdate = { ...boardsCopy[boardIndex] };
              boardToUpdate.cards = { ...boardToUpdate.cards, [cardId]: updatedCard };
              boardsCopy[boardIndex] = boardToUpdate;
              return { boards: boardsCopy };
            });
          } catch (error) {
            console.error("Error updating card content:", error);
          }
        },
        deleteCard: async (boardId, columnId, cardId) => {
          try {
            const response = await fetch(`/api/boards/${boardId}/cards/${cardId}`, {
              method: 'DELETE',
            });
            if (!response.ok) {
              throw new Error(`Failed to delete card: ${response.statusText}`);
            }
            // API returns success message, update local state
            set(state => {
              const boardIndex = state.boards.findIndex(b => b.id === boardId);
              if (boardIndex === -1) return state;
              
              const boardsCopy = [...state.boards];
              const boardToUpdate = { ...boardsCopy[boardIndex] };
              boardToUpdate.cards = { ...boardToUpdate.cards };
              delete boardToUpdate.cards[cardId];
              
              boardToUpdate.columns = {
                ...boardToUpdate.columns,
                [columnId]: {
                  ...boardToUpdate.columns[columnId],
                  cardIds: boardToUpdate.columns[columnId].cardIds.filter(id => id !== cardId)
                }
              };
               // Re-order cards in the affected column
              boardToUpdate.columns[columnId].cardIds.forEach((cid, index) => {
                  if (boardToUpdate.cards[cid]) {
                      boardToUpdate.cards[cid] = { ...boardToUpdate.cards[cid], order: index };
                  }
              });
              boardsCopy[boardIndex] = boardToUpdate;
              return { boards: boardsCopy };
            });
          } catch (error) {
            console.error("Error deleting card:", error);
          }
        },
        upvoteCard: async (boardId, cardId, userId) => {
          const user = get().user;
          if (!user) {
            console.error("User not set, cannot upvote card");
            return;
          }
          try {
            const response = await fetch(`/api/boards/${boardId}/cards/${cardId}/upvote`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: user.id }), // Send current user's ID
            });
            if (!response.ok) {
              throw new Error(`Failed to upvote card: ${response.statusText}`);
            }
            const updatedCard: CardData = await response.json();
            set(state => {
              const boardIndex = state.boards.findIndex(b => b.id === boardId);
              if (boardIndex === -1) return state;
              const boardsCopy = [...state.boards];
              const boardToUpdate = { ...boardsCopy[boardIndex] };
              boardToUpdate.cards = { ...boardToUpdate.cards, [cardId]: updatedCard };
              boardsCopy[boardIndex] = boardToUpdate;
              return { boards: boardsCopy };
            });
          } catch (error) {
            console.error("Error upvoting card:", error);
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
              const errorBody = await response.text();
              throw new Error(`Failed to move card: ${response.statusText}. Body: ${errorBody}`);
            }
            const updatedBoard: BoardData = await response.json();
            set(state => {
              const boardIndex = state.boards.findIndex(b => b.id === boardId);
              if (boardIndex === -1) return state; // Should not happen if API returns board
              const boardsCopy = [...state.boards];
              boardsCopy[boardIndex] = updatedBoard; // Replace the entire board with the updated one from API
              return { boards: boardsCopy };
            });
          } catch (error) {
            console.error("Error moving card:", error);
          }
        },
      },
    }),
    {
      name: 'retrospective-app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user }), // Only persist user, boards will be fetched
      onRehydrateStorage: (state) => {
        // This is called when Zustand has rehydrated from localStorage
        // We can trigger the initial board fetch here if user exists.
        // However, loadInitialUserAndBoards is now called from UserProvider
        return (nextState, error) => {
          if (error) {
            console.error('Failed to rehydrate state from localStorage:', error)
          }
          if (nextState) {
            nextState.isUserLoading = false; // User state is loaded (or null if not present)
          }
        }
      }
    }
  )
);

export const useBoardActions = () => useBoardStore((state) => state.actions);
