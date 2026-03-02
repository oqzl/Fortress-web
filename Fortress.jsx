import React, { useState, useCallback, useMemo, useEffect } from "react";

// ── Game Constants ──
const BOARD_SIZE = 6;
const MAX_TURNS = 21;
const MAX_LEVEL = 3;
const PLAYER = 1;   // Human
const AI = 2;        // Computer
const SCREEN_BLACK = "#050505";
const BOARD_GREEN = "#20e000";
const PAPER_WHITE = "#f5f5f5";
const MAX_CELL_HEIGHT = 60;
const MAX_CELL_WIDTH = 96;
const CELL_ASPECT_RATIO = 1.5;
const BOARD_FRAME_PADDING = 4;
const BOARD_FRAME_BORDER = 2;
const BOARD_GRID_GAP = 0;
const HOVER_SCALE = BOARD_GRID_GAP > 0 ? 1.02 : 1;
const CASTLE_ICON_SCALE = 0.76;
const FLAG_ICON_SCALE = 0.5;
const HOVER_CASTLE_ICON_SCALE = 0.62;

// ── Helper: create empty board ──
function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ castle: 0, level: 0 }))
  );
}

// ── Calculate strength projection for each cell ──
function calcStrength(board) {
  const str = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => [0, 0]) // [player1 str, player2 str]
  );
  const dirs = [[0,0],[0,1],[0,-1],[1,0],[-1,0]];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell.castle === 0) continue;
      const idx = cell.castle - 1;
      for (const [dr, dc] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
          str[nr][nc][idx] += cell.level;
        }
      }
    }
  }
  return str;
}

// ── Determine control map: 0=neutral, 1=player, 2=AI ──
function calcControl(strengthMap) {
  return strengthMap.map(row =>
    row.map(([s1, s2]) => {
      if (s1 > s2) return PLAYER;
      if (s2 > s1) return AI;
      return 0;
    })
  );
}

// ── Remove captured castles ──
function removeCaptured(board, control) {
  const newBoard = board.map(row => row.map(c => ({ ...c })));
  let changed = false;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = newBoard[r][c];
      if (cell.castle !== 0 && control[r][c] !== 0 && control[r][c] !== cell.castle) {
        newBoard[r][c] = { castle: 0, level: 0 };
        changed = true;
      }
    }
  }
  return { board: newBoard, changed };
}

// ── Fully resolve board (iterative capture) ──
function resolveBoard(board) {
  let current = board.map(row => row.map(c => ({ ...c })));
  for (let i = 0; i < 20; i++) {
    const str = calcStrength(current);
    const ctrl = calcControl(str);
    const { board: next, changed } = removeCaptured(current, ctrl);
    current = next;
    if (!changed) break;
  }
  return current;
}

// ── Count tiles controlled ──
function countTiles(board) {
  const str = calcStrength(board);
  const ctrl = calcControl(str);
  let p1 = 0, p2 = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (ctrl[r][c] === PLAYER) p1++;
      if (ctrl[r][c] === AI) p2++;
    }
  }
  return { player: p1, ai: p2 };
}

// ── Get valid moves ──
function getValidMoves(board, who) {
  const str = calcStrength(board);
  const ctrl = calcControl(str);
  const moves = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = board[r][c];
      if (cell.castle === 0) {
        // Can place on empty tile not controlled by opponent
        if (ctrl[r][c] !== (who === PLAYER ? AI : PLAYER)) {
          moves.push({ type: "place", r, c });
        }
      } else if (cell.castle === who && cell.level < MAX_LEVEL) {
        moves.push({ type: "upgrade", r, c });
      }
    }
  }
  return moves;
}

// ── Apply a move ──
function applyMove(board, move, who) {
  const newBoard = board.map(row => row.map(c => ({ ...c })));
  if (move.type === "place") {
    newBoard[move.r][move.c] = { castle: who, level: 1 };
  } else {
    newBoard[move.r][move.c].level++;
  }
  return resolveBoard(newBoard);
}

// ── AI: evaluate board from AI's perspective ──
function evaluate(board) {
  const str = calcStrength(board);
  const ctrl = calcControl(str);
  let score = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (ctrl[r][c] === AI) score += 1;
      else if (ctrl[r][c] === PLAYER) score -= 1;
      // Bonus for strength advantage
      score += (str[r][c][1] - str[r][c][0]) * 0.15;
    }
  }
  // Castle count bonus
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].castle === AI) score += 0.3 * board[r][c].level;
      if (board[r][c].castle === PLAYER) score -= 0.3 * board[r][c].level;
    }
  }
  return score;
}

// ── AI: minimax with alpha-beta ──
function minimax(board, depth, alpha, beta, isAI, turnLeft, options = {}) {
  if (depth === 0 || turnLeft <= 0) return { score: evaluate(board), move: null };
  
  const who = isAI ? AI : PLAYER;
  const candidates = getCandidateMoves(board, who, options.maxBranching);
  if (candidates.length === 0) return { score: evaluate(board), move: null };

  let bestMove = candidates[0].move;
  if (isAI) {
    let maxScore = -Infinity;
    for (const candidate of candidates) {
      const move = candidate.move;
      const newBoard = applyMove(board, move, AI);
      const { score } = minimax(newBoard, depth - 1, alpha, beta, false, turnLeft - 1, options);
      if (score > maxScore) { maxScore = score; bestMove = move; }
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return { score: maxScore, move: bestMove };
  } else {
    let minScore = Infinity;
    for (const candidate of candidates) {
      const move = candidate.move;
      const newBoard = applyMove(board, move, PLAYER);
      const { score } = minimax(newBoard, depth - 1, alpha, beta, true, turnLeft - 1, options);
      if (score < minScore) { minScore = score; bestMove = move; }
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return { score: minScore, move: bestMove };
  }
}

function scoreMoveHeuristic(board, move, who, strengthMap, controlMap) {
  const opponent = who === PLAYER ? AI : PLAYER;
  const ownIdx = who - 1;
  const oppIdx = opponent - 1;
  const center = (BOARD_SIZE - 1) / 2;
  const affectedTiles = [[move.r, move.c], [move.r + 1, move.c], [move.r - 1, move.c], [move.r, move.c + 1], [move.r, move.c - 1]]
    .filter(([r, c]) => r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE);

  let score = 0;
  if (move.type === "upgrade") {
    score += 2 + board[move.r][move.c].level * 0.75;
  } else if (controlMap[move.r][move.c] === who) {
    score += 1.5;
  } else if (controlMap[move.r][move.c] === 0) {
    score += 1;
  }

  score += (BOARD_SIZE - (Math.abs(move.r - center) + Math.abs(move.c - center))) * 0.35;

  for (const [r, c] of affectedTiles) {
    const ownStrength = strengthMap[r][c][ownIdx];
    const oppStrength = strengthMap[r][c][oppIdx];
    const beforeMargin = ownStrength - oppStrength;
    const afterMargin = beforeMargin + 1;
    const targetCell = board[r][c];

    if (beforeMargin <= 0 && afterMargin > 0) score += 2.5;
    else if (beforeMargin < 0 && afterMargin === 0) score += 1.25;
    else if (afterMargin > 0) score += 0.4;

    if (targetCell.castle === opponent && afterMargin > 0) {
      score += 3 + targetCell.level;
    }

    if (targetCell.castle === who && beforeMargin <= 0) {
      score += 1.5;
    }
  }

  return score;
}

function getCandidateMoves(board, who, maxMoves = Infinity) {
  const moves = getValidMoves(board, who);
  if (moves.length <= maxMoves) {
    return moves.map(move => ({ move }));
  }

  const strengthMap = calcStrength(board);
  const controlMap = calcControl(strengthMap);

  return moves
    .map(move => ({
      move,
      score: scoreMoveHeuristic(board, move, who, strengthMap, controlMap),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxMoves)
    .map(({ move }) => ({ move }));
}

function aiChooseMove(board, turnsLeft, difficulty) {
  const moves = getValidMoves(board, AI);
  if (moves.length === 0) return null;

  // Difficulty settings: { depth, blunderRate }
  // blunderRate = chance of picking a random (non-optimal) move
  const settings = {
    easy:   { baseDepth: 1, maxDepth: 1, blunderRate: 0.40, maxBranching: 10 },
    normal: { baseDepth: 1, maxDepth: 2, blunderRate: 0.15, maxBranching: 12 },
    hard:   { baseDepth: 2, maxDepth: 3, blunderRate: 0.03, maxBranching: 10 },
    master: { baseDepth: 2, maxDepth: 4, blunderRate: 0, maxBranching: 8 },
  }[difficulty] || { baseDepth: 2, maxDepth: 3, blunderRate: 0.05, maxBranching: 10 };

  // Blunder: pick a random move
  if (Math.random() < settings.blunderRate) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const depth = turnsLeft <= 6
    ? Math.min(settings.maxDepth + 1, 4)
    : turnsLeft <= 12
      ? settings.maxDepth
      : settings.baseDepth;

  const { move } = minimax(board, depth, -Infinity, Infinity, true, turnsLeft, {
    maxBranching: settings.maxBranching,
  });
  return move;
}

// ── Castle SVG ──
function CastleSVG({ level, owner, size = 36, gatesClosed = false }) {
  const fill = owner === PLAYER ? SCREEN_BLACK : PAPER_WHITE;
  const cutout = BOARD_GREEN;

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <rect x="8" y="24" width="24" height="8" fill={fill} />
      {!gatesClosed && (
        <rect x="17" y="26" width="6" height="6" fill={cutout} />
      )}

      {level >= 2 && (
        <rect x="12" y="17" width="16" height="6" fill={fill} />
      )}

      {level >= 3 && (
        <rect x="15" y="11" width="10" height="5" fill={fill} />
      )}
    </svg>
  );
}

function TerritoryFlagSVG({ owner, size = 20 }) {
  const fill = owner === PLAYER ? SCREEN_BLACK : PAPER_WHITE;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="6" y="7" width="2" height="11" fill={fill} />
      <rect x="8" y="8" width="8" height="6" fill={fill} />
    </svg>
  );
}

// ── Hook: responsive cell size ──
function useCellSize() {
  const [size, setSize] = useState({ width: 64, height: 56 });
  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxBoardW = vw - 48;       // horizontal padding
      const maxBoardH = vh - 260;      // reserve for header/footer UI
      const boardFrame = (BOARD_FRAME_PADDING + BOARD_FRAME_BORDER) * 2;
      const totalGridGap = (BOARD_SIZE - 1) * BOARD_GRID_GAP;
      const usableBoardW = Math.max(0, maxBoardW - boardFrame - totalGridGap);
      const usableBoardH = Math.max(0, maxBoardH - boardFrame - totalGridGap);
      const maxCellWidthFromBoard = Math.max(1, Math.floor(usableBoardW / BOARD_SIZE));
      const maxCellHeightFromBoard = Math.max(1, Math.floor(usableBoardH / BOARD_SIZE));
      const cellHeight = Math.max(
        1,
        Math.min(
          MAX_CELL_HEIGHT,
          maxCellHeightFromBoard,
          Math.floor(maxCellWidthFromBoard / CELL_ASPECT_RATIO)
        )
      );
      const cellWidth = Math.max(
        1,
        Math.min(
          MAX_CELL_WIDTH,
          maxCellWidthFromBoard,
          Math.floor(cellHeight * CELL_ASPECT_RATIO)
        )
      );
      setSize({ width: cellWidth, height: cellHeight });
    }
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);
  return size;
}

// ── Main Component ──
export default function FortressGame() {
  const [board, setBoard] = useState(createEmptyBoard);
  const [turn, setTurn] = useState(1);
  const [currentPlayer, setCurrentPlayer] = useState(PLAYER);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [lastMove, setLastMove] = useState(null);
  const [difficulty, setDifficulty] = useState("normal");
  const [firstPlayer, setFirstPlayer] = useState(PLAYER);
  const [showRules, setShowRules] = useState(false);
  const [turnNotice, setTurnNotice] = useState(null);
  const cellSize = useCellSize();

  const strengthMap = useMemo(() => calcStrength(board), [board]);
  const controlMap = useMemo(() => calcControl(strengthMap), [strengthMap]);
  const tiles = useMemo(() => countTiles(board), [board]);
  const validMoves = useMemo(
    () => (currentPlayer === PLAYER && !gameOver ? getValidMoves(board, PLAYER) : []),
    [board, currentPlayer, gameOver]
  );

  const isValidMove = useCallback((r, c) => {
    return validMoves.some(m => m.r === r && m.c === c);
  }, [validMoves]);

  const getMoveType = useCallback((r, c) => {
    const m = validMoves.find(m => m.r === r && m.c === c);
    return m ? m.type : null;
  }, [validMoves]);

  const endTurn = useCallback((newBoard, nextTurn) => {
    if (nextTurn > MAX_TURNS) {
      const t = countTiles(newBoard);
      setGameOver(true);
      if (t.player > t.ai) setResult("win");
      else if (t.ai > t.player) setResult("lose");
      else setResult("draw");
      return true;
    }
    return false;
  }, []);

  const handleClick = useCallback((r, c) => {
    if (showRules || gameOver || currentPlayer !== PLAYER || aiThinking) return;
    if (!isValidMove(r, c)) return;

    const moveType = getMoveType(r, c);
    const move = { type: moveType, r, c };
    const newBoard = applyMove(board, move, PLAYER);
    setBoard(newBoard);
    setLastMove({ r, c, who: PLAYER });

    const nextTurn = turn + 1;
    if (!endTurn(newBoard, nextTurn)) {
      setTurnNotice(null);
      setTurn(nextTurn);
      setCurrentPlayer(AI);
      setAiThinking(true);
    }
  }, [board, turn, showRules, gameOver, currentPlayer, aiThinking, isValidMove, getMoveType, endTurn]);

  // AI turn
  useEffect(() => {
    if (showRules || currentPlayer !== AI || gameOver || !aiThinking) return;
    const timer = setTimeout(() => {
      const turnsLeft = MAX_TURNS - turn + 1;
      const move = aiChooseMove(board, turnsLeft, difficulty);
      if (move) {
        const newBoard = applyMove(board, move, AI);
        setBoard(newBoard);
        setLastMove({ r: move.r, c: move.c, who: AI });
        const nextTurn = turn + 1;
        if (!endTurn(newBoard, nextTurn)) {
          setTurnNotice(null);
          setTurn(nextTurn);
          setCurrentPlayer(PLAYER);
        }
      } else {
        const nextTurn = turn + 1;
        if (!endTurn(board, nextTurn)) {
          setTurn(nextTurn);
          setCurrentPlayer(PLAYER);
          setTurnNotice("CPU has no valid moves and passes.");
        }
      }
      setAiThinking(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [showRules, currentPlayer, gameOver, aiThinking, board, turn, difficulty, endTurn]);

  useEffect(() => {
    if (showRules || currentPlayer !== PLAYER || gameOver || aiThinking || validMoves.length > 0) return;

    const timer = setTimeout(() => {
      const nextTurn = turn + 1;
      if (!endTurn(board, nextTurn)) {
        setTurn(nextTurn);
        setCurrentPlayer(AI);
        setAiThinking(true);
        setTurnNotice("You have no valid moves and must pass.");
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [showRules, currentPlayer, gameOver, aiThinking, validMoves, turn, board, endTurn]);

  // If firstPlayer is AI, trigger AI on game start
  useEffect(() => {
    if (!showRules && turn === 1 && currentPlayer === AI && !aiThinking && !gameOver) {
      setAiThinking(true);
    }
  }, [showRules, turn, currentPlayer, aiThinking, gameOver]);

  const resetGame = useCallback((first = PLAYER) => {
    setBoard(createEmptyBoard());
    setTurn(1);
    setCurrentPlayer(first);
    setFirstPlayer(first);
    setGameOver(false);
    setResult(null);
    setLastMove(null);
    setAiThinking(false);
    setTurnNotice(null);
  }, []);

  const totalTurns = MAX_TURNS;

  return (
    <div style={{
      minHeight: "100vh",
      maxHeight: "100vh",
      overflow: "auto",
      background: SCREEN_BLACK,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      padding: "12px 16px",
      fontFamily: "'Courier New', Courier, monospace",
      color: PAPER_WHITE,
      boxSizing: "border-box"
    }}>
      {/* Title */}
      <div style={{ position: "relative", textAlign: "center", marginBottom: 10, width: "100%", maxWidth: 440 }}>
        <button
          onClick={() => setShowRules(s => !s)}
          style={{
            ...btnStyle,
            position: "absolute",
            top: 0,
            right: 0,
            padding: "6px 12px",
            fontSize: 11,
          }}
        >
          {showRules ? "HIDE" : "RULES"}
        </button>
        <div style={{
          display: "inline-block",
          padding: "10px 22px",
          background: PAPER_WHITE,
          color: SCREEN_BLACK,
          marginBottom: 8,
        }}>
          <h1 style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: 4,
            margin: 0,
          }}>FORTRESS</h1>
        </div>
        <div style={{ fontSize: 10, letterSpacing: 2, opacity: 0.8, marginTop: 1 }}>
          SSI · 1983 · JIM TEMPLEMAN · PATTY DENBROOK
        </div>
      </div>

      {/* Info Bar */}
      <div style={{
        display: "flex", gap: 24, alignItems: "center", marginBottom: 8,
        fontSize: 13, opacity: 0.85
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, background: SCREEN_BLACK, border: `1px solid ${PAPER_WHITE}` }} />
          <span>YOU: {tiles.player}</span>
        </div>
        <div style={{
          padding: "3px 12px",
          background: BOARD_GREEN,
          color: SCREEN_BLACK,
          border: `2px solid ${SCREEN_BLACK}`,
          fontVariantNumeric: "tabular-nums"
        }}>
          TURN {turn} / {totalTurns}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>CPU: {tiles.ai}</span>
          <div style={{ width: 10, height: 10, background: PAPER_WHITE, border: `1px solid ${SCREEN_BLACK}` }} />
        </div>
      </div>

      {/* Board */}
      <div style={{
        position: "relative",
        background: SCREEN_BLACK,
        padding: BOARD_FRAME_PADDING,
        border: `${BOARD_FRAME_BORDER}px solid ${BOARD_GREEN}`,
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize.width}px)`,
          gridAutoRows: `${cellSize.height}px`,
          gap: BOARD_GRID_GAP,
        }}>
          {board.map((row, r) =>
            row.map((cell, c) => {
              const ctrl = controlMap[r][c];
              const str1 = strengthMap[r][c][0];
              const str2 = strengthMap[r][c][1];
              const canAct = isValidMove(r, c);
              const isHovered = hoveredCell?.r === r && hoveredCell?.c === c;
              const isLast = lastMove?.r === r && lastMove?.c === c;
              const moveType = getMoveType(r, c);

              // Gates closed: castle on neutral tile with enemy pressure matching owner
              const gatesClosed = cell.castle !== 0 && ctrl === 0
                && strengthMap[r][c][cell.castle === PLAYER ? 1 : 0] > 0
                && strengthMap[r][c][cell.castle === PLAYER ? 1 : 0]
                   === strengthMap[r][c][cell.castle === PLAYER ? 0 : 1];

              const bg = BOARD_GREEN;
              const closedGateBorder = cell.castle === PLAYER
                ? `2px dashed ${PAPER_WHITE}`
                : `2px dotted ${PAPER_WHITE}`;
              const closedGateInset = cell.castle === PLAYER
                ? `inset 0 0 0 2px ${PAPER_WHITE}`
                : `inset 0 0 0 2px ${PAPER_WHITE}, inset 0 0 0 4px ${SCREEN_BLACK}`;

              let border = `2px dashed ${SCREEN_BLACK}`;
              if (gatesClosed) border = closedGateBorder;
              if (isLast) border = `2px solid ${lastMove.who === PLAYER ? PAPER_WHITE : SCREEN_BLACK}`;
              if (isHovered && canAct) border = `2px solid ${PAPER_WHITE}`;

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleClick(r, c)}
                  onMouseEnter={() => setHoveredCell({ r, c })}
                  onMouseLeave={() => setHoveredCell(null)}
                  style={{
                    background: bg,
                    border,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: canAct ? "pointer" : "default",
                    position: "relative",
                    transition: "all 0.15s ease",
                    boxSizing: "border-box",
                    transform: isHovered && canAct ? `scale(${HOVER_SCALE})` : "scale(1)",
                    boxShadow: isHovered && canAct
                      ? `inset 0 0 0 2px ${PAPER_WHITE}`
                      : gatesClosed ? closedGateInset : "none"
                  }}
                >
                  {cell.castle !== 0 && (
                    <CastleSVG level={cell.level} owner={cell.castle}
                      size={Math.round(Math.min(cellSize.width, cellSize.height) * CASTLE_ICON_SCALE)} gatesClosed={gatesClosed} />
                  )}
                  {cell.castle === 0 && ctrl !== 0 && (
                    <div style={{ opacity: 0.85 }}>
                      <TerritoryFlagSVG owner={ctrl} size={Math.round(Math.min(cellSize.width, cellSize.height) * FLAG_ICON_SCALE)} />
                    </div>
                  )}
                  {cell.castle === 0 && canAct && isHovered && (
                    <div style={{ opacity: 0.3 }}>
                      <CastleSVG level={1} owner={PLAYER} size={Math.round(Math.min(cellSize.width, cellSize.height) * HOVER_CASTLE_ICON_SCALE)} />
                    </div>
                  )}
                  {cell.castle !== 0 && moveType === "upgrade" && isHovered && (
                    <div style={{
                      position: "absolute", top: 2, right: 3,
                      fontSize: 14, fontWeight: 700,
                      color: cell.castle === PLAYER ? PAPER_WHITE : SCREEN_BLACK,
                    }}>↑</div>
                  )}
                  {/* Strength indicator */}
                  {(str1 > 0 || str2 > 0) && (
                    <div style={{
                      position: "absolute", bottom: 1, left: 0, right: 0,
                      display: "flex", justifyContent: "space-between",
                      padding: "0 3px", fontSize: 8, opacity: 0.45,
                      fontFamily: "monospace"
                    }}>
                      <span style={{ color: SCREEN_BLACK }}>{str1 || ""}</span>
                      <span style={{ color: PAPER_WHITE, textShadow: `1px 1px 0 ${SCREEN_BLACK}` }}>{str2 || ""}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {showRules && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 12,
            background: "rgba(5, 5, 5, 0.88)",
            boxSizing: "border-box",
            zIndex: 2,
          }}
          onClick={() => setShowRules(false)}
          >
            <div style={{
              width: "100%",
              maxWidth: 420,
              maxHeight: "100%",
              overflowY: "auto",
              background: SCREEN_BLACK,
              border: `2px solid ${PAPER_WHITE}`,
              padding: "14px 18px",
              fontSize: 13,
              lineHeight: 1.7,
              color: PAPER_WHITE,
              boxSizing: "border-box",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowRules(false)}
                style={{
                  ...btnStyle,
                  position: "absolute",
                  top: 8,
                  right: 8,
                  border: "none",
                  padding: "2px 6px",
                  fontSize: 16,
                  lineHeight: 1,
                }}
                aria-label="Close rules"
              >
                ×
              </button>
              <div style={{ fontWeight: 700, color: PAPER_WHITE, marginBottom: 6, letterSpacing: 2, fontSize: 14 }}>
                RULES
              </div>
              <p style={{ margin: "6px 0" }}>
                <b>目的:</b> 全21ターン終了時に、より多くのマスを支配しているプレイヤーの勝利。
              </p>
              <p style={{ margin: "6px 0" }}>
                <b>手番:</b> 各ターンに以下のいずれか1つを行う:
              </p>
              <p style={{ margin: "4px 0 4px 12px" }}>
                • 敵に支配されていない空マスに城（Lv.1）を配置する
              </p>
              <p style={{ margin: "4px 0 4px 12px" }}>
                • 自分の既存の城をアップグレードする（最大Lv.3）
              </p>
              <p style={{ margin: "6px 0" }}>
                <b>影響力:</b> 城は自身とその上下左右のマスに、レベルと等しい「影響力」を投射する。
              </p>
              <p style={{ margin: "6px 0" }}>
                <b>支配:</b> 各マスは合計影響力が高いプレイヤーが支配する。同値は中立。
              </p>
              <p style={{ margin: "6px 0" }}>
                <b>捕獲:</b> 相手に支配されたマスの上にある城は即座に破壊される。連鎖あり。
              </p>
              <p style={{ margin: "6px 0" }}>
                <b>閉門:</b> 城のある位置で敵の影響力と拮抗していると、門の切り欠きが消えて表示される。
              </p>
              <p style={{ margin: "6px 0", fontSize: 11, opacity: 0.6 }}>
                マス左下の<span style={{
                  color: SCREEN_BLACK,
                  background: BOARD_GREEN,
                  padding: "0 4px",
                }}>黒数字</span>=あなたの影響力、
                右下の<span style={{color:PAPER_WHITE, textShadow:`1px 1px 0 ${SCREEN_BLACK}`}}>白数字</span>=CPUの影響力
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Status */}
      <div style={{
        marginTop: 8,
        fontSize: 14,
        height: 22,
        display: "flex", alignItems: "center", gap: 8
      }}>
        {gameOver ? (
          <span style={{
            color: PAPER_WHITE,
            fontWeight: 600, letterSpacing: 2, fontSize: 16
          }}>
            {result === "win" ? "🏆 YOU WIN!" : result === "lose" ? "DEFEAT" : "DRAW"}
            {" "}({tiles.player} vs {tiles.ai})
          </span>
        ) : aiThinking && turnNotice ? (
          <span style={{ opacity: 0.75 }}>
            {turnNotice} CPU is thinking...
          </span>
        ) : aiThinking ? (
          <span style={{ opacity: 0.6, fontStyle: "italic" }}>
            ⚔ CPU is thinking...
          </span>
        ) : turnNotice ? (
          <span style={{ opacity: 0.75 }}>
            {turnNotice}
          </span>
        ) : (
          <span style={{ opacity: 0.7 }}>
            {currentPlayer === PLAYER
              ? "Your turn — click to place or upgrade a castle"
              : ""}
          </span>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center", alignItems: "center" }}>
        {/* Difficulty selector */}
        <div style={{
          display: "flex", overflow: "hidden",
          border: `2px solid ${PAPER_WHITE}`
        }}>
          {[
            { val: "easy", label: "Easy", emoji: "🟢" },
            { val: "normal", label: "Normal", emoji: "🟡" },
            { val: "hard", label: "Hard", emoji: "🟠" },
            { val: "master", label: "Master", emoji: "🔴" },
          ].map(({ val, label, emoji }) => (
            <button key={val} onClick={() => { setDifficulty(val); }} style={{
              ...btnStyle, border: "none", borderRadius: 0,
              background: difficulty === val ? PAPER_WHITE : SCREEN_BLACK,
              color: difficulty === val ? SCREEN_BLACK : PAPER_WHITE,
              padding: "6px 10px", fontSize: 11
            }}>{emoji} {label}</button>
          ))}
        </div>

        {/* First player toggle */}
        <div style={{
          display: "flex", overflow: "hidden",
          border: `2px solid ${PAPER_WHITE}`
        }}>
          {[
            { val: PLAYER, label: "先手" },
            { val: AI, label: "後手" },
          ].map(({ val, label }) => (
            <button key={val} onClick={() => resetGame(val)} style={{
              ...btnStyle, border: "none", borderRadius: 0,
              background: firstPlayer === val ? PAPER_WHITE : SCREEN_BLACK,
              color: firstPlayer === val ? SCREEN_BLACK : PAPER_WHITE,
              padding: "6px 12px", fontSize: 11
            }}>{label}</button>
          ))}
        </div>

        <button onClick={() => resetGame(firstPlayer)} style={btnStyle}>
          NEW GAME
        </button>
      </div>

    </div>
  );
}

const btnStyle = {
  padding: "8px 16px",
  background: SCREEN_BLACK,
  border: `2px solid ${PAPER_WHITE}`,
  color: PAPER_WHITE,
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: 12,
  letterSpacing: 1.5,
  cursor: "pointer",
  transition: "all 0.15s ease"
};
