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
  name: string;
  color: string;
  cellCount: number;
}
