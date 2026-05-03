export interface CellState {
  index: number;
  ownerId: string | null;
  ownerColor: string | null;
  ownerName: string | null;
  version: number;
  capturedAt: string;
}

export interface UserInfo {
  connectionId: string;
  userId: string;
  displayName: string;
  color: string;
}

export interface LeaderboardEntry {
  item1: string; // name
  item2: string; // color
  item3: number; // cellCount
}
