import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function parsePuzzles(source) {
  const match = source.match(/export const PUZZLES: Puzzle\[\] = (\[.*\]);\s*$/s);
  assert.ok(match, "generated puzzle data should be readable");
  return JSON.parse(match[1]);
}

function countSolutions(input, limit = 2) {
  const board = [...input];
  let solutions = 0;
  function search() {
    if (solutions >= limit) return;
    let bestIndex = -1;
    let bestCandidates = [];
    for (let index = 0; index < 81; index += 1) {
      if (board[index]) continue;
      const row = Math.floor(index / 9);
      const column = index % 9;
      const candidates = [];
      for (let value = 1; value <= 9; value += 1) {
        let valid = true;
        for (let cursor = 0; cursor < 9 && valid; cursor += 1) {
          if (board[row * 9 + cursor] === value || board[cursor * 9 + column] === value) valid = false;
        }
        const startRow = Math.floor(row / 3) * 3;
        const startColumn = Math.floor(column / 3) * 3;
        for (let r = startRow; r < startRow + 3 && valid; r += 1) {
          for (let c = startColumn; c < startColumn + 3; c += 1) {
            if (board[r * 9 + c] === value) valid = false;
          }
        }
        if (valid) candidates.push(value);
      }
      if (candidates.length === 0) return;
      if (bestIndex === -1 || candidates.length < bestCandidates.length) {
        bestIndex = index;
        bestCandidates = candidates;
        if (candidates.length === 1) break;
      }
    }
    if (bestIndex === -1) {
      solutions += 1;
      return;
    }
    for (const value of bestCandidates) {
      board[bestIndex] = value;
      search();
      board[bestIndex] = 0;
    }
  }
  search();
  return solutions;
}

test("ships 40 unique and valid levels for each difficulty", async () => {
  const source = await readFile(new URL("../app/data/puzzles.generated.ts", import.meta.url), "utf8");
  const puzzles = parsePuzzles(source);
  assert.equal(puzzles.length, 160);
  assert.equal(new Set(puzzles.map((puzzle) => puzzle.id)).size, 160);
  assert.equal(new Set(puzzles.map((puzzle) => puzzle.board.join(""))).size, 160);

  for (const difficulty of ["easy", "medium", "hard", "expert"]) {
    const group = puzzles.filter((puzzle) => puzzle.difficulty === difficulty);
    assert.equal(group.length, 40);
    assert.deepEqual(group.map((puzzle) => puzzle.level), Array.from({ length: 40 }, (_, index) => index + 1));
  }

  for (const puzzle of puzzles) {
    assert.equal(puzzle.board.length, 81);
    assert.equal(puzzle.solution.length, 81);
    assert.ok(puzzle.board.every((value, index) => value === 0 || value === puzzle.solution[index]));
    assert.equal(countSolutions(puzzle.board), 1, `${puzzle.id} should have one solution`);
  }
});

test("server renders the finished Sudoku application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>静数独<\/title>/);
  assert.match(html, /正在准备棋盘/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("static Pages build includes an executable module entry", async () => {
  const html = await readFile(new URL("../dist-pages/index.html", import.meta.url), "utf8");
  assert.match(html, /<script[^>]+type="module"[^>]+src="\.\/assets\//);
  assert.match(html, /<title>静数独<\/title>/);
  assert.doesNotMatch(html, /__VINEXT_RSC|正在准备棋盘[^<]*<\/main><\/body>/);
});
