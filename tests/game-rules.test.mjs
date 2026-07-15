import assert from "node:assert/strict";
import test from "node:test";

import {
  completeLevel,
  EMPTY_PROGRESS,
  isNewBestTime,
  moveSelection,
  moveSelectionForKey,
} from "../app/lib/sudoku.ts";

test("new best time is based on the record before completion", () => {
  assert.equal(isNewBestTime(undefined, 120), true);
  assert.equal(isNewBestTime(150, 120), true);
  assert.equal(isNewBestTime(120, 120), false);
  assert.equal(isNewBestTime(100, 120), false);
});

test("completing a level keeps the best time and unlocks at most level 40", () => {
  const firstCompletion = completeLevel(EMPTY_PROGRESS, "easy", 1, 120);
  assert.deepEqual(firstCompletion.easy.records[1], {
    completed: true,
    bestSeconds: 120,
  });
  assert.equal(firstCompletion.easy.unlocked, 2);

  const fasterCompletion = completeLevel(firstCompletion, "easy", 1, 100);
  assert.equal(fasterCompletion.easy.records[1].bestSeconds, 100);

  const slowerCompletion = completeLevel(fasterCompletion, "easy", 1, 140);
  assert.equal(slowerCompletion.easy.records[1].bestSeconds, 100);

  const equalCompletion = completeLevel(slowerCompletion, "easy", 1, 100);
  assert.equal(equalCompletion.easy.records[1].bestSeconds, 100);

  const finalLevel = completeLevel(equalCompletion, "easy", 40, 300);
  assert.equal(finalLevel.easy.unlocked, 40);
  assert.equal(finalLevel.easy.records[40].bestSeconds, 300);
});

test("selection movement respects row and board boundaries", () => {
  assert.equal(moveSelection(0, "left"), 0);
  assert.equal(moveSelection(0, "up"), 0);
  assert.equal(moveSelection(8, "right"), 8);
  assert.equal(moveSelection(8, "down"), 17);
  assert.equal(moveSelection(9, "left"), 9);
  assert.equal(moveSelection(9, "up"), 0);
  assert.equal(moveSelection(72, "down"), 72);
  assert.equal(moveSelection(80, "right"), 80);
  assert.equal(moveSelection(80, "down"), 80);
  assert.equal(moveSelection(40, "left"), 39);
  assert.equal(moveSelection(40, "right"), 41);
  assert.equal(moveSelection(40, "up"), 31);
  assert.equal(moveSelection(40, "down"), 49);
});

test("keyboard movement uses the same production boundary rule", () => {
  assert.equal(moveSelectionForKey(8, "ArrowRight"), 8);
  assert.equal(moveSelectionForKey(9, "ArrowLeft"), 9);
  assert.equal(moveSelectionForKey(40, "ArrowLeft"), 39);
  assert.equal(moveSelectionForKey(40, "ArrowRight"), 41);
  assert.equal(moveSelectionForKey(40, "ArrowUp"), 31);
  assert.equal(moveSelectionForKey(40, "ArrowDown"), 49);
  assert.equal(moveSelectionForKey(80, "ArrowRight"), 80);
  assert.equal(moveSelectionForKey(40, "Enter"), null);
});
