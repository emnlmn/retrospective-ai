export interface User {
  id: string;
  name: string;
}

export type ColumnId = 'wentWell' | 'toImprove' | 'actionItems';

export interface CardData {
  id: string;
  content: string;
  userId: string; 
  userName: string; 
  createdAt: string; // ISO date string
  upvotes: string[]; // Array of user IDs who upvoted
  order: number; 
}

export interface ColumnData {
  id: ColumnId;
  title: string;
  cardIds: string[]; 
}

export interface BoardData {
  id: string;
  title: string;
  cards: Record<string, CardData>; // All cards on the board, keyed by cardId
  columns: {
    wentWell: ColumnData;
    toImprove: ColumnData;
    actionItems: ColumnData;
  };
  createdAt: string; // ISO date string
}

export const DEFAULT_COLUMNS_CONFIG: Record<ColumnId, { title: string }> = {
  wentWell: { title: 'Went Well' },
  toImprove: { title: 'To Improve' },
  actionItems: { title: 'Action Items' },
};

export const INITIAL_COLUMNS_DATA: {
  wentWell: ColumnData;
  toImprove: ColumnData;
  actionItems: ColumnData;
} = {
  wentWell: { id: 'wentWell', title: DEFAULT_COLUMNS_CONFIG.wentWell.title, cardIds: [] },
  toImprove: { id: 'toImprove', title: DEFAULT_COLUMNS_CONFIG.toImprove.title, cardIds: [] },
  actionItems: { id: 'actionItems', title: DEFAULT_COLUMNS_CONFIG.actionItems.title, cardIds: [] },
};
