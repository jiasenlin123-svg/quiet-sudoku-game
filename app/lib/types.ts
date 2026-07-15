export type Difficulty = "easy" | "medium" | "hard" | "expert";

export interface Puzzle {
  id: string;
  difficulty: Difficulty;
  level: number;
  board: number[];
  solution: number[];
}

export interface HistorySnapshot {
  board: number[];
  notes: number[][];
}

export interface GameState {
  puzzleId: string;
  board: number[];
  notes: number[][];
  hinted: number[];
  selected: number | null;
  mistakes: number;
  hintsRemaining: number;
  elapsedSeconds: number;
  status: "playing" | "paused" | "failed" | "completed";
  noteMode: boolean;
  isNewBest?: boolean;
  history: HistorySnapshot[];
}

export interface LevelRecord {
  completed: boolean;
  bestSeconds?: number;
}

export type ProgressState = Record<
  Difficulty,
  { unlocked: number; records: Record<number, LevelRecord> }
>;

export interface SettingsState {
  sound: boolean;
  highlightPeers: boolean;
}
