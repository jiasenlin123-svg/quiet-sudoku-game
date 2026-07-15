"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PUZZLES } from "./data/puzzles.generated";
import {
  completeLevel,
  createGame,
  DEFAULT_SETTINGS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EMPTY_PROGRESS,
  formatTime,
  isPeer,
  loadJson,
  saveJson,
  STORAGE_KEYS,
} from "./lib/sudoku";
import type {
  Difficulty,
  GameState,
  ProgressState,
  Puzzle,
  SettingsState,
} from "./lib/types";

type Screen = "home" | "levels" | "game";

const difficultyDescriptions: Record<Difficulty, string> = {
  easy: "轻松热身",
  medium: "稳步推理",
  hard: "深入思考",
  expert: "极限挑战",
};

const difficultyMarks: Record<Difficulty, string> = {
  easy: "◇",
  medium: "◈",
  hard: "◆",
  expert: "✦",
};

function safeProgress(value: ProgressState): ProgressState {
  const base = structuredClone(EMPTY_PROGRESS);
  for (const difficulty of DIFFICULTIES) {
    const candidate = value?.[difficulty];
    if (!candidate) continue;
    base[difficulty].unlocked = Math.min(40, Math.max(1, candidate.unlocked || 1));
    base[difficulty].records = candidate.records || {};
  }
  return base;
}

function playTone(enabled: boolean, tone: "tap" | "error" | "success") {
  if (!enabled || typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = tone === "error" ? 180 : tone === "success" ? 660 : 420;
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.11);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.addEventListener("ended", () => void context.close());
  } catch {
    // Sound is an optional enhancement.
  }
}

export function SudokuApp() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>("easy");
  const [progress, setProgress] = useState<ProgressState>(EMPTY_PROGRESS);
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);
  const [game, setGame] = useState<GameState | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [errorCell, setErrorCell] = useState<{ index: number; value: number } | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const puzzle = useMemo(
    () => PUZZLES.find((item) => item.id === game?.puzzleId) ?? null,
    [game?.puzzleId],
  );

  useEffect(() => {
    const storedProgress = loadJson<ProgressState>(STORAGE_KEYS.progress, EMPTY_PROGRESS);
    const storedSettings = loadJson<SettingsState>(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
    const storedGame = loadJson<GameState | null>(STORAGE_KEYS.game, null);
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setProgress(safeProgress(storedProgress));
      setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
      if (storedGame && PUZZLES.some((item) => item.id === storedGame.puzzleId)) {
        setGame(storedGame.status === "playing" ? { ...storedGame, status: "paused" } : storedGame);
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveJson(STORAGE_KEYS.progress, progress);
  }, [progress, ready]);

  useEffect(() => {
    if (!ready) return;
    saveJson(STORAGE_KEYS.settings, settings);
  }, [settings, ready]);

  useEffect(() => {
    if (!ready) return;
    saveJson(STORAGE_KEYS.game, game);
  }, [game, ready]);

  useEffect(() => {
    if (screen !== "game" || game?.status !== "playing") return;
    const interval = window.setInterval(() => {
      setGame((current) => current?.status === "playing"
        ? { ...current, elapsedSeconds: current.elapsedSeconds + 1 }
        : current);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [game?.status, screen]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) {
        setGame((current) => current?.status === "playing"
          ? { ...current, status: "paused" }
          : current);
      }
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, []);

  useEffect(() => () => {
    if (errorTimer.current) clearTimeout(errorTimer.current);
  }, []);

  const beginLevel = useCallback((difficulty: Difficulty, level: number) => {
    if (level > progress[difficulty].unlocked) return;
    const nextPuzzle = PUZZLES.find(
      (item) => item.difficulty === difficulty && item.level === level,
    );
    if (!nextPuzzle) return;
    setSelectedDifficulty(difficulty);
    setGame(createGame(nextPuzzle));
    setScreen("game");
    playTone(settings.sound, "tap");
  }, [progress, settings.sound]);

  const finishIfComplete = useCallback((nextGame: GameState, nextBoard: number[], activePuzzle: Puzzle) => {
    if (!nextBoard.every((value, index) => value === activePuzzle.solution[index])) return nextGame;
    const completedGame = { ...nextGame, status: "completed" as const };
    setProgress((current) => completeLevel(
      current,
      activePuzzle.difficulty,
      activePuzzle.level,
      nextGame.elapsedSeconds,
    ));
    playTone(settings.sound, "success");
    return completedGame;
  }, [settings.sound]);

  const pushHistory = (current: GameState) => [
    ...current.history.slice(-49),
    { board: [...current.board], notes: current.notes.map((notes) => [...notes]) },
  ];

  const enterNumber = useCallback((value: number) => {
    if (!puzzle) return;
    setGame((current) => {
      if (!current || current.status !== "playing" || current.selected === null) return current;
      const index = current.selected;
      if (puzzle.board[index] !== 0 || current.hinted.includes(index)) return current;

      if (current.noteMode) {
        if (current.board[index] !== 0) return current;
        const notes = current.notes.map((item) => [...item]);
        notes[index] = notes[index].includes(value)
          ? notes[index].filter((item) => item !== value)
          : [...notes[index], value].sort();
        playTone(settings.sound, "tap");
        return { ...current, notes, history: pushHistory(current) };
      }

      if (puzzle.solution[index] !== value) {
        const mistakes = current.mistakes + 1;
        setErrorCell({ index, value });
        if (errorTimer.current) clearTimeout(errorTimer.current);
        errorTimer.current = setTimeout(() => setErrorCell(null), 420);
        playTone(settings.sound, "error");
        return { ...current, mistakes, status: mistakes >= 3 ? "failed" : "playing" };
      }

      const board = [...current.board];
      board[index] = value;
      const notes = current.notes.map((item, noteIndex) =>
        isPeer(index, noteIndex) ? item.filter((candidate) => candidate !== value) : [...item],
      );
      notes[index] = [];
      playTone(settings.sound, "tap");
      return finishIfComplete(
        { ...current, board, notes, history: pushHistory(current) },
        board,
        puzzle,
      );
    });
  }, [finishIfComplete, puzzle, settings.sound]);

  const eraseSelected = useCallback(() => {
    if (!puzzle) return;
    setGame((current) => {
      if (!current || current.status !== "playing" || current.selected === null) return current;
      const index = current.selected;
      if (puzzle.board[index] !== 0 || current.hinted.includes(index)) return current;
      if (current.board[index] === 0 && current.notes[index].length === 0) return current;
      const board = [...current.board];
      const notes = current.notes.map((item) => [...item]);
      board[index] = 0;
      notes[index] = [];
      playTone(settings.sound, "tap");
      return { ...current, board, notes, history: pushHistory(current) };
    });
  }, [puzzle, settings.sound]);

  const undo = useCallback(() => {
    setGame((current) => {
      if (!current || current.status !== "playing" || current.history.length === 0) return current;
      const previous = current.history[current.history.length - 1];
      playTone(settings.sound, "tap");
      return {
        ...current,
        board: [...previous.board],
        notes: previous.notes.map((item) => [...item]),
        history: current.history.slice(0, -1),
      };
    });
  }, [settings.sound]);

  const useHint = useCallback(() => {
    if (!puzzle) return;
    setGame((current) => {
      if (!current || current.status !== "playing" || current.hintsRemaining <= 0) return current;
      let index = current.selected ?? -1;
      if (index < 0 || current.board[index] !== 0 || puzzle.board[index] !== 0) {
        index = current.board.findIndex((value, cell) => value === 0 && puzzle.board[cell] === 0);
      }
      if (index < 0) return current;
      const value = puzzle.solution[index];
      const board = [...current.board];
      board[index] = value;
      const notes = current.notes.map((item, noteIndex) =>
        isPeer(index, noteIndex) ? item.filter((candidate) => candidate !== value) : [...item],
      );
      notes[index] = [];
      const next = {
        ...current,
        board,
        notes,
        selected: index,
        hinted: [...current.hinted, index],
        hintsRemaining: current.hintsRemaining - 1,
      };
      return finishIfComplete(next, board, puzzle);
    });
  }, [finishIfComplete, puzzle]);

  useEffect(() => {
    if (screen !== "game") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!game) return;
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        enterNumber(Number(event.key));
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") {
        event.preventDefault();
        eraseSelected();
        return;
      }
      if (event.key.toLowerCase() === "n") {
        setGame((current) => current?.status === "playing"
          ? { ...current, noteMode: !current.noteMode }
          : current);
        return;
      }
      if (event.key === "Escape") {
        setGame((current) => current?.status === "playing"
          ? { ...current, status: "paused" }
          : current?.status === "paused" ? { ...current, status: "playing" } : current);
        return;
      }
      const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 };
      if (delta[event.key] !== undefined && game.selected !== null) {
        event.preventDefault();
        const next = Math.min(80, Math.max(0, game.selected + delta[event.key]));
        setGame((current) => current ? { ...current, selected: next } : current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enterNumber, eraseSelected, game, screen]);

  const goToLevels = (difficulty: Difficulty) => {
    setSelectedDifficulty(difficulty);
    setScreen("levels");
    playTone(settings.sound, "tap");
  };

  const returnHome = () => {
    if (game?.status === "playing") setGame({ ...game, status: "paused" });
    setScreen("home");
  };

  const restart = () => {
    if (!puzzle) return;
    setGame(createGame(puzzle));
  };

  const continueGame = () => {
    if (!game || !puzzle || game.status === "completed") return;
    setSelectedDifficulty(puzzle.difficulty);
    setGame(game.status === "failed" ? createGame(puzzle) : { ...game, status: "playing" });
    setScreen("game");
  };

  const resetProgress = () => {
    if (!window.confirm("确定清除全部关卡进度和最好成绩吗？此操作无法撤销。")) return;
    setProgress(structuredClone(EMPTY_PROGRESS));
    setGame(null);
    setShowSettings(false);
    setScreen("home");
  };

  if (!ready) {
    return <main className="app-shell loading-screen" aria-live="polite">正在准备棋盘…</main>;
  }

  const canContinue = Boolean(game && puzzle && game.status !== "completed");
  const completedTotal = DIFFICULTIES.reduce(
    (sum, difficulty) => sum + Object.values(progress[difficulty].records).filter((record) => record.completed).length,
    0,
  );

  return (
    <main className="app-shell">
      {screen === "home" && (
        <section className="home-screen page-enter">
          <header className="home-header">
            <div>
              <span className="eyebrow">无广告 · 单机闯关</span>
              <h1>静数独</h1>
              <p>留一点安静，只专注下一格。</p>
            </div>
            <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="打开设置">⚙</button>
          </header>

          <section className="progress-card">
            <div className="progress-copy">
              <span>总进度</span>
              <strong>{completedTotal}<small> / 160</small></strong>
            </div>
            <div className="progress-track" aria-label={`已完成 ${completedTotal} 关`}>
              <span style={{ width: `${completedTotal / 1.6}%` }} />
            </div>
            {canContinue && (
              <button className="continue-button" onClick={continueGame}>
                <span>
                  <small>继续上次挑战</small>
                  <strong>{puzzle && `${DIFFICULTY_LABELS[puzzle.difficulty]} · 第 ${puzzle.level} 关`}</strong>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            )}
          </section>

          <section className="difficulty-section">
            <div className="section-heading">
              <div><span className="eyebrow">选择难度</span><h2>开始新的挑战</h2></div>
              <span>{completedTotal === 160 ? "全部完成" : "四种节奏"}</span>
            </div>
            <div className="difficulty-grid">
              {DIFFICULTIES.map((difficulty) => {
                const done = Object.values(progress[difficulty].records).filter((record) => record.completed).length;
                return (
                  <button key={difficulty} className={`difficulty-card ${difficulty}`} onClick={() => goToLevels(difficulty)}>
                    <span className="difficulty-mark" aria-hidden="true">{difficultyMarks[difficulty]}</span>
                    <span><strong>{DIFFICULTY_LABELS[difficulty]}</strong><small>{difficultyDescriptions[difficulty]}</small></span>
                    <span className="difficulty-progress">{done}<small>/40</small></span>
                  </button>
                );
              })}
            </div>
          </section>
          <footer className="home-footer">进度只保存在当前设备 · 完全无广告</footer>
        </section>
      )}

      {screen === "levels" && (
        <section className="levels-screen page-enter">
          <header className="screen-header">
            <button className="back-button" onClick={() => setScreen("home")} aria-label="返回首页">←</button>
            <div><span className="eyebrow">选择关卡</span><h1>{DIFFICULTY_LABELS[selectedDifficulty]}</h1></div>
            <span className="header-progress">{Object.values(progress[selectedDifficulty].records).filter((record) => record.completed).length}/40</span>
          </header>
          <div className="level-summary">
            <span className={`summary-mark ${selectedDifficulty}`}>{difficultyMarks[selectedDifficulty]}</span>
            <div><strong>{difficultyDescriptions[selectedDifficulty]}</strong><small>完成当前关卡，即可解锁下一关</small></div>
          </div>
          <div className="level-grid">
            {Array.from({ length: 40 }, (_, index) => index + 1).map((level) => {
              const record = progress[selectedDifficulty].records[level];
              const locked = level > progress[selectedDifficulty].unlocked;
              return (
                <button
                  key={level}
                  className={`level-card ${record?.completed ? "completed" : ""} ${level === progress[selectedDifficulty].unlocked ? "current" : ""}`}
                  disabled={locked}
                  onClick={() => beginLevel(selectedDifficulty, level)}
                  aria-label={locked ? `第 ${level} 关，未解锁` : `第 ${level} 关${record?.bestSeconds ? `，最好用时 ${formatTime(record.bestSeconds)}` : ""}`}
                >
                  <span className="level-number">{locked ? "·" : level}</span>
                  <small>{locked ? "未解锁" : record?.bestSeconds ? formatTime(record.bestSeconds) : level === progress[selectedDifficulty].unlocked ? "下一关" : "可挑战"}</small>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {screen === "game" && game && puzzle && (
        <section className="game-screen page-enter">
          <header className="game-header">
            <button className="back-button" onClick={returnHome} aria-label="返回首页">←</button>
            <div className="game-title"><span>{DIFFICULTY_LABELS[puzzle.difficulty]}</span><strong>第 {puzzle.level} 关</strong></div>
            <button className="pause-button" onClick={() => setGame({ ...game, status: game.status === "paused" ? "playing" : "paused" })} disabled={game.status === "failed" || game.status === "completed"}>
              {game.status === "paused" ? "继续" : "暂停"}
            </button>
          </header>

          <div className="game-stats">
            <span><small>错误</small><strong className={game.mistakes === 2 ? "danger" : ""}>{game.mistakes}<i>/3</i></strong></span>
            <span><small>时间</small><strong>{formatTime(game.elapsedSeconds)}</strong></span>
            <span><small>提示</small><strong>{game.hintsRemaining}<i>/3</i></strong></span>
          </div>

          <div className="board-wrap">
            <div className={`sudoku-board ${game.status !== "playing" ? "board-obscured" : ""}`} role="grid" aria-label="数独棋盘">
              {game.board.map((value, index) => {
                const fixed = puzzle.board[index] !== 0;
                const hinted = game.hinted.includes(index);
                const selected = game.selected === index;
                const selectedValue = game.selected === null ? 0 : game.board[game.selected];
                const peer = settings.highlightPeers && game.selected !== null && isPeer(game.selected, index);
                const same = selectedValue !== 0 && value === selectedValue;
                const boxRight = index % 9 === 2 || index % 9 === 5;
                const boxBottom = Math.floor(index / 9) === 2 || Math.floor(index / 9) === 5;
                return (
                  <button
                    key={index}
                    className={`cell ${fixed ? "fixed" : "player"} ${hinted ? "hinted" : ""} ${selected ? "selected" : ""} ${peer ? "peer" : ""} ${same ? "same" : ""} ${errorCell?.index === index ? "error" : ""} ${boxRight ? "box-right" : ""} ${boxBottom ? "box-bottom" : ""}`}
                    onClick={() => game.status === "playing" && setGame({ ...game, selected: index })}
                    role="gridcell"
                    aria-label={`第 ${Math.floor(index / 9) + 1} 行第 ${index % 9 + 1} 列${value ? `，数字 ${value}` : "，空格"}`}
                  >
                    {value || errorCell?.index === index ? <span className="cell-value">{errorCell?.index === index ? errorCell.value : value}</span> : (
                      <span className="notes-grid" aria-hidden="true">
                        {Array.from({ length: 9 }, (_, note) => <i key={note}>{game.notes[index].includes(note + 1) ? note + 1 : ""}</i>)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {game.status === "paused" && (
              <div className="board-overlay"><span className="overlay-icon">Ⅱ</span><h2>已暂停</h2><p>棋盘已隐藏，计时停止。</p><button onClick={() => setGame({ ...game, status: "playing" })}>继续游戏</button></div>
            )}
            {game.status === "failed" && (
              <div className="board-overlay"><span className="overlay-icon failure">×</span><h2>本局结束</h2><p>已经出现三次错误，休息一下再试。</p><button onClick={restart}>重新挑战</button><button className="text-action" onClick={() => { setScreen("levels"); setGame(null); }}>返回关卡</button></div>
            )}
            {game.status === "completed" && (
              <div className="board-overlay completed-overlay"><span className="overlay-icon success">✓</span><span className="eyebrow">挑战完成</span><h2>{formatTime(game.elapsedSeconds)}</h2><p>第 {puzzle.level} 关已完成，下一关已经解锁。</p>
                {puzzle.level < 40 && <button onClick={() => beginLevel(puzzle.difficulty, puzzle.level + 1)}>挑战下一关</button>}
                <button className="text-action" onClick={() => setScreen("levels")}>查看关卡</button>
              </div>
            )}
          </div>

          <div className="tool-row" aria-label="棋盘工具">
            <button onClick={eraseSelected} disabled={game.status !== "playing"}><span aria-hidden="true">⌫</span><small>擦除</small></button>
            <button onClick={undo} disabled={game.status !== "playing" || game.history.length === 0}><span aria-hidden="true">↶</span><small>撤回</small></button>
            <button className={game.noteMode ? "active" : ""} onClick={() => setGame({ ...game, noteMode: !game.noteMode })} disabled={game.status !== "playing"}><span aria-hidden="true">✎</span><small>笔记 {game.noteMode ? "开" : "关"}</small></button>
            <button onClick={useHint} disabled={game.status !== "playing" || game.hintsRemaining === 0}><span aria-hidden="true">○</span><small>提示 {game.hintsRemaining}</small></button>
          </div>

          <div className="number-pad" aria-label="数字键盘">
            {Array.from({ length: 9 }, (_, index) => index + 1).map((number) => {
              const used = game.board.filter((value) => value === number).length === 9;
              return <button key={number} disabled={used || game.status !== "playing"} onClick={() => enterNumber(number)}>{number}</button>;
            })}
          </div>
          <p className="keyboard-hint">键盘：数字填写 · N 切换笔记 · Esc 暂停</p>
        </section>
      )}

      {showSettings && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowSettings(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="modal-heading"><div><span className="eyebrow">偏好设置</span><h2 id="settings-title">让棋盘更顺手</h2></div><button className="close-button" onClick={() => setShowSettings(false)} aria-label="关闭设置">×</button></div>
            <label className="setting-row"><span><strong>操作音效</strong><small>填数与完成时播放轻提示音</small></span><input type="checkbox" checked={settings.sound} onChange={(event) => setSettings({ ...settings, sound: event.target.checked })} /></label>
            <label className="setting-row"><span><strong>关联高亮</strong><small>突出同行、同列与同宫格</small></span><input type="checkbox" checked={settings.highlightPeers} onChange={(event) => setSettings({ ...settings, highlightPeers: event.target.checked })} /></label>
            <div className="storage-note"><strong>本机存档</strong><p>关卡进度和当前棋局只保存在这台设备的浏览器中。</p></div>
            <button className="danger-button" onClick={resetProgress}>清除全部进度</button>
          </section>
        </div>
      )}
    </main>
  );
}
