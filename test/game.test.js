import test from "node:test";
import assert from "node:assert/strict";
import {
  BLACK,
  WHITE,
  MAX_LEVEL,
  applyMove,
  calcControl,
  calcInfluence,
  createEmptyBoard,
  getValidMoves,
} from "../web/game.js";

function boardWith(castles) {
  const board = createEmptyBoard();
  for (const { row, col, owner, level = 1 } of castles) {
    board[row][col] = { owner, level };
  }
  return board;
}

test("an empty 6x6 board offers 36 placements", () => {
  assert.equal(getValidMoves(createEmptyBoard(), WHITE).length, 36);
});

test("an empty square remains a legal placement even under enemy control", () => {
  const board = boardWith([{ row: 2, col: 2, owner: BLACK, level: 2 }]);
  const control = calcControl(calcInfluence(board));
  assert.equal(control[2][3], BLACK);
  assert.ok(getValidMoves(board, WHITE).some((move) => move.type === "place" && move.row === 2 && move.col === 3));
});

test("influence is additive and ties leave a square neutral", () => {
  const board = boardWith([
    { row: 2, col: 1, owner: WHITE },
    { row: 2, col: 3, owner: BLACK },
  ]);
  const influence = calcInfluence(board);
  const control = calcControl(influence);
  assert.deepEqual(influence[2][2], [1, 1]);
  assert.equal(control[2][2], 0);
});

test("suicidal placement contributes influence before simultaneous destruction", () => {
  const board = boardWith([
    { row: 2, col: 3, owner: BLACK },
    { row: 1, col: 2, owner: BLACK },
    { row: 2, col: 4, owner: WHITE },
  ]);

  const result = applyMove(board, { type: "place", row: 2, col: 2 }, WHITE);
  const captured = result.captured.map(({ row, col, owner }) => [row, col, owner]);

  assert.deepEqual(captured.sort(), [[2, 2, WHITE], [2, 3, BLACK]].sort());
  assert.equal(result.board[2][2].owner, 0);
  assert.equal(result.board[2][3].owner, 0);
  assert.equal(result.board[1][2].owner, BLACK);
});

test("a castle may be fortified only to level 3", () => {
  const board = boardWith([{ row: 3, col: 3, owner: WHITE, level: MAX_LEVEL }]);
  assert.ok(!getValidMoves(board, WHITE).some((move) => move.type === "upgrade" && move.row === 3 && move.col === 3));
});
