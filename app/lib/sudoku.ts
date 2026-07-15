import type { Difficulty, GameState, ProgressState, Puzzle, SettingsState } from "./types";

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard", "expert"];
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "容易",
  medium: "中等",
  hard: "困难",
  expert: "专家",
};

export const STORAGE_KEYS = {
  progress: "quiet-sudoku-progress-v1",
  game: "quiet-sudoku-current-game-v1",
  settings: "quiet-sudoku-settings-v1",
};

export const EMPTY_PROGRESS: ProgressState = {
  easy: { unlocked: 1, records: {} },
  medium: { unlocked: 1, records: {} },
  hard: { unlocked: 1, records: {} },
  expert: { unlocked: 1, records: {} },
};

export const DEFAULT_SETTINGS: SettingsState = {
  sound: true,
  highlightPeers: true,
};

export type Direction = "left" | "right" | "up" | "down";

export function isNewBestTime(
  previousBest: number | undefined,
  currentSeconds: number,
) {
  return previousBest === undefined || currentSeconds < previousBest;
}

export function moveSelection(index: number, direction: Direction) {
  const row = Math.floor(index / 9);
  const column = index % 9;

  switch (direction) {
    case "left":
      return column > 0 ? index - 1 : index;
    case "right":
      return column < 8 ? index + 1 : index;
    case "up":
      return row > 0 ? index - 9 : index;
    case "down":
      return row < 8 ? index + 9 : index;
  }
}

const KEY_DIRECTIONS: Partial<Record<string, Direction>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

export function moveSelectionForKey(index: number, key: string) {
  const direction = KEY_DIRECTIONS[key];
  return direction ? moveSelection(index, direction) : null;
}

export function createGame(puzzle: Puzzle): GameState {
  return {
    puzzleId: puzzle.id,
    board: [...puzzle.board],
    notes: Array.from({ length: 81 }, () => []),
    hinted: [],
    selected: puzzle.board.findIndex((value) => value === 0),
    mistakes: 0,
    hintsRemaining: 3,
    elapsedSeconds: 0,
    status: "playing",
    noteMode: false,
    isNewBest: false,
    history: [],
  };
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The game remains playable when storage is unavailable.
  }
}

export function isPeer(a: number, b: number) {
  const rowA = Math.floor(a / 9);
  const rowB = Math.floor(b / 9);
  const columnA = a % 9;
  const columnB = b % 9;
  return (
    rowA === rowB ||
    columnA === columnB ||
    (Math.floor(rowA / 3) === Math.floor(rowB / 3) &&
      Math.floor(columnA / 3) === Math.floor(columnB / 3))
  );
}

export function getCandidates(board: number[], index: number) {
  if (index < 0 || index >= 81 || board[index] !== 0) return [];
  const used = new Set<number>();
  for (let cell = 0; cell < 81; cell += 1) {
    if (board[cell] !== 0 && isPeer(index, cell)) used.add(board[cell]);
  }
  return Array.from({ length: 9 }, (_, candidate) => candidate + 1)
    .filter((candidate) => !used.has(candidate));
}

export function isLastEmptyInUnit(board: number[], index: number) {
  if (index < 0 || index >= 81 || board[index] !== 0) return false;
  const row = Math.floor(index / 9);
  const column = index % 9;
  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  let rowFilled = 0;
  let columnFilled = 0;
  let boxFilled = 0;
  for (let cursor = 0; cursor < 9; cursor += 1) {
    if (board[row * 9 + cursor] !== 0) rowFilled += 1;
    if (board[cursor * 9 + column] !== 0) columnFilled += 1;
    const boxIndex = (boxRow + Math.floor(cursor / 3)) * 9 + boxColumn + (cursor % 3);
    if (board[boxIndex] !== 0) boxFilled += 1;
  }
  return rowFilled === 8 || columnFilled === 8 || boxFilled === 8;
}

export function completeLevel(
  progress: ProgressState,
  difficulty: Difficulty,
  level: number,
  seconds: number,
) {
  const next = structuredClone(progress);
  const current = next[difficulty].records[level];
  const previousBest = current?.bestSeconds;
  next[difficulty].records[level] = {
    completed: true,
    bestSeconds: isNewBestTime(previousBest, seconds) ? seconds : previousBest,
  };
  next[difficulty].unlocked = Math.max(next[difficulty].unlocked, Math.min(40, level + 1));
  return next;
}
