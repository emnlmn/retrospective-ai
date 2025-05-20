
import type { BoardData, CardData, ColumnData, ColumnId, User } from '@/lib/types';
import { INITIAL_COLUMNS_DATA } from '@/lib/types';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

interface BoardState {
  boards: BoardData[];
  user: User | null;
  currentBoardId: string | null;
  isUserLoading: boolean; // To manage initial user loading state
  actions: {
    // User actions
    setUser: (name: string) => void;
    loadInitialUser: () => void;
    // Board actions
    addBoard: (title: string) => BoardData;
    setCurrentBoardId: (boardId: string | null) => void;
    getBoardById: (boardId: string) => BoardData | undefined;
    // Card actions (operating on the current board or a specified board)
    addCard: (boardId: string, columnId: ColumnId, content: string, userNameSuffix?: string) => void;
    updateCardContent: (boardId: string, cardId: string, newContent: string) => void;
    deleteCard: (boardId: string, columnId: ColumnId, cardId: string) => void;
    upvoteCard: (boardId: string, cardId: string, userId: string) => void;
    moveCard: (
      boardId: string,
      draggedCardId: string,
      sourceColumnId: ColumnId,
      destColumnId: ColumnId,
      destinationIndex: number,
      mergeTargetCardId?: string
    ) => void;
    // AI related actions - these will call Genkit flows and then update state via other actions
    // For now, they might just use existing actions to add suggested cards
  };
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      boards: [],
      user: null,
      currentBoardId: null,
      isUserLoading: true, 
      actions: {
        setUser: (name) => {
          const currentUser = get().user;
          const newUser = { id: currentUser?.id || uuidv4(), name };
          set({ user: newUser, isUserLoading: false });
        },
        loadInitialUser: () => {
          // Persistence middleware handles loading from localStorage automatically.
          // We just need to update isUserLoading.
          // The user object will be null if not in localStorage or if it's the first load.
          const user = get().user; // Check if persist has already loaded the user
          set({ isUserLoading: false });
          if (!user) {
            // Potentially trigger dialog if user is still null after initial load
            // This logic is better handled in the UI component (UserProvider or similar)
          }
        },
        addBoard: (title) => {
          const newBoard: BoardData = {
            id: uuidv4(),
            title,
            columns: JSON.parse(JSON.stringify(INITIAL_COLUMNS_DATA)),
            cards: {},
            createdAt: new Date().toISOString(),
          };
          set((state) => ({ boards: [newBoard, ...state.boards] }));
          return newBoard;
        },
        setCurrentBoardId: (boardId) => set({ currentBoardId: boardId }),
        getBoardById: (boardId) => get().boards.find(b => b.id === boardId),

        addCard: (boardId, columnId, content, userNameSuffix = '') => {
          set((state) => {
            const boardIndex = state.boards.findIndex(b => b.id === boardId);
            if (boardIndex === -1 || !state.user) return {};

            const boardsCopy = [...state.boards];
            const board = { ...boardsCopy[boardIndex] };
            
            board.cards = { ...board.cards };
            board.columns = {
                wentWell: { ...board.columns.wentWell, cardIds: [...board.columns.wentWell.cardIds] },
                toImprove: { ...board.columns.toImprove, cardIds: [...board.columns.toImprove.cardIds] },
                actionItems: { ...board.columns.actionItems, cardIds: [...board.columns.actionItems.cardIds] },
            };

            const newCardId = uuidv4();
            const newCard: CardData = {
              id: newCardId,
              content,
              userId: state.user.id,
              userName: `${state.user.name}${userNameSuffix}`,
              createdAt: new Date().toISOString(),
              upvotes: [],
              order: 0, // Will be re-ordered below
            };

            board.cards[newCardId] = newCard;
            board.columns[columnId].cardIds.unshift(newCardId);
            
            // Re-order cards in the affected column
            board.columns[columnId].cardIds.forEach((cardId, index) => {
                if (board.cards[cardId]) {
                    board.cards[cardId] = { ...board.cards[cardId], order: index };
                }
            });

            boardsCopy[boardIndex] = board;
            return { boards: boardsCopy };
          });
        },
        updateCardContent: (boardId, cardId, newContent) => {
          set((state) => {
            const boardIndex = state.boards.findIndex(b => b.id === boardId);
            if (boardIndex === -1) return {};

            const boardsCopy = [...state.boards];
            const board = { ...boardsCopy[boardIndex] };
            board.cards = { ...board.cards };

            if (board.cards[cardId]) {
              board.cards[cardId] = { ...board.cards[cardId], content: newContent };
              boardsCopy[boardIndex] = board;
              return { boards: boardsCopy };
            }
            return {};
          });
        },
        deleteCard: (boardId, columnId, cardId) => {
          set((state) => {
            const boardIndex = state.boards.findIndex(b => b.id === boardId);
            if (boardIndex === -1) return {};
            
            const boardsCopy = [...state.boards];
            const board = { ...boardsCopy[boardIndex] };

            board.cards = { ...board.cards };
            board.columns = {
                wentWell: { ...board.columns.wentWell, cardIds: [...board.columns.wentWell.cardIds] },
                toImprove: { ...board.columns.toImprove, cardIds: [...board.columns.toImprove.cardIds] },
                actionItems: { ...board.columns.actionItems, cardIds: [...board.columns.actionItems.cardIds] },
            };

            delete board.cards[cardId];
            board.columns[columnId].cardIds = board.columns[columnId].cardIds.filter(id => id !== cardId);

             // Re-order cards in the affected column
            board.columns[columnId].cardIds.forEach((cid, index) => {
                if (board.cards[cid]) {
                    board.cards[cid] = { ...board.cards[cid], order: index };
                }
            });

            boardsCopy[boardIndex] = board;
            return { boards: boardsCopy };
          });
        },
        upvoteCard: (boardId, cardId, userId) => {
          set((state) => {
            const boardIndex = state.boards.findIndex(b => b.id === boardId);
            if (boardIndex === -1) return {};

            const boardsCopy = [...state.boards];
            const board = { ...boardsCopy[boardIndex] };
            board.cards = { ...board.cards };
            const card = board.cards[cardId];

            if (card) {
              const alreadyUpvoted = card.upvotes.includes(userId);
              const newUpvotes = alreadyUpvoted
                ? card.upvotes.filter(uid => uid !== userId)
                : [...card.upvotes, userId];
              board.cards[cardId] = { ...card, upvotes: newUpvotes };
              boardsCopy[boardIndex] = board;
              return { boards: boardsCopy };
            }
            return {};
          });
        },
        moveCard: (boardId, draggedCardId, sourceColumnId, destColumnId, destinationIndex, mergeTargetCardId) => {
          set(state => {
            const boardIndex = state.boards.findIndex(b => b.id === boardId);
            if (boardIndex === -1) return state;

            const boardsCopy = [...state.boards];
            let board = { ...boardsCopy[boardIndex] };
            
            board.cards = { ...board.cards };
            board.columns = {
                wentWell: { ...board.columns.wentWell, cardIds: [...board.columns.wentWell.cardIds] },
                toImprove: { ...board.columns.toImprove, cardIds: [...board.columns.toImprove.cardIds] },
                actionItems: { ...board.columns.actionItems, cardIds: [...board.columns.actionItems.cardIds] },
            };

            const draggedCard = board.cards[draggedCardId];
            if (!draggedCard) return state;

            if (mergeTargetCardId && mergeTargetCardId !== draggedCardId && destinationIndex === -1) {
              // --- HANDLE MERGE ---
              const targetCard = board.cards[mergeTargetCardId];
              if (!targetCard || !board.columns[destColumnId].cardIds.includes(mergeTargetCardId)) return state;

              const newContent = `${targetCard.content}\n----\n${draggedCard.content}`;
              board.cards[mergeTargetCardId] = { ...targetCard, content: newContent };
              delete board.cards[draggedCardId];
              board.columns[sourceColumnId].cardIds = board.columns[sourceColumnId].cardIds.filter(id => id !== draggedCardId);
              
              // Re-order source column
              board.columns[sourceColumnId].cardIds.forEach((id, index) => {
                if (board.cards[id]) board.cards[id] = { ...board.cards[id], order: index };
              });

            } else {
              // --- HANDLE REGULAR POSITIONING DROP ---
              const sourceCol = board.columns[sourceColumnId];
              const destCol = board.columns[destColumnId];
              const originalSourceIndex = sourceCol.cardIds.indexOf(draggedCardId);

              if (originalSourceIndex === -1) return state; // Card not found in source

              // Remove from source
              sourceCol.cardIds.splice(originalSourceIndex, 1);

              // Add to destination
              let effectiveDestinationIndex = destinationIndex;
              if (sourceColumnId === destColumnId && originalSourceIndex < destinationIndex) {
                 effectiveDestinationIndex = Math.max(0, destinationIndex -1);
              }
              effectiveDestinationIndex = Math.max(0, Math.min(effectiveDestinationIndex, destCol.cardIds.length));
              destCol.cardIds.splice(effectiveDestinationIndex, 0, draggedCardId);
              
              // Update orders
              sourceCol.cardIds.forEach((id, index) => {
                if (board.cards[id]) board.cards[id] = { ...board.cards[id], order: index };
              });
              if (sourceColumnId !== destColumnId) {
                  destCol.cardIds.forEach((id, index) => {
                    if (board.cards[id]) board.cards[id] = { ...board.cards[id], order: index };
                  });
              } else { // if same column, destCol is already sourceCol
                  sourceCol.cardIds.forEach((id, index) => {
                    if (board.cards[id]) board.cards[id] = { ...board.cards[id], order: index };
                  });
              }
            }
            
            boardsCopy[boardIndex] = board;
            return { boards: boardsCopy };
          });
        },
      },
    }),
    {
      name: 'retrospective-app-storage', // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      partialize: (state) => ({ boards: state.boards, user: state.user }), // Persist only boards and user
    }
  )
);

// Export actions directly for easier usage in components
export const useBoardActions = () => useBoardStore((state) => state.actions);
