import React, { useState, useCallback, useMemo, useEffect } from "react";

// ── Game Constants ──
const BOARD_SIZE = 7;
const MAX_TURNS = 21;
const MAX_LEVEL = 3;
const PLAYER = 1;   // Human
const AI = 2;        // Computer

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
  const moves = getCandidateMoves(board, who, options.maxBranching);
  if (moves.length === 0) return { score: evaluate(board), move: null };

  let bestMove = moves[0];
  if (isAI) {
    let maxScore = -Infinity;
    for (const move of moves) {
      const newBoard = applyMove(board, move, AI);
      const { score } = minimax(newBoard, depth - 1, alpha, beta, false, turnLeft - 1, options);
      if (score > maxScore) { maxScore = score; bestMove = move; }
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return { score: maxScore, move: bestMove };
  } else {
    let minScore = Infinity;
    for (const move of moves) {
      const newBoard = applyMove(board, move, PLAYER);
      const { score } = minimax(newBoard, depth - 1, alpha, beta, true, turnLeft - 1, options);
      if (score < minScore) { minScore = score; bestMove = move; }
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return { score: minScore, move: bestMove };
  }
}

function getCandidateMoves(board, who, maxMoves = Infinity) {
  const moves = getValidMoves(board, who);
  if (moves.length <= maxMoves) return moves;

  return moves
    .map(move => ({
      move,
      score: evaluate(applyMove(board, move, who)),
    }))
    .sort((a, b) => who === AI ? b.score - a.score : a.score - b.score)
    .slice(0, maxMoves)
    .map(entry => entry.move);
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
  const colors = owner === PLAYER
    ? { wall: "#3b5998", roof: "#1a3a6b", flag: "#e74c3c", stone: "#5577bb", gate: "#1a1a2e" }
    : { wall: "#8b4513", roof: "#5a2d0c", flag: "#2ecc71", stone: "#a0633c", gate: "#1a1a2e" };

  const gateColor = gatesClosed ? (owner === PLAYER ? "#2a4070" : "#6b3a1a") : colors.gate;

  return (
    <svg width={size} height={size} viewBox="0 0 40 40">
      {/* Base / Level 1 */}
      <rect x="8" y="24" width="24" height="12" rx="1" fill={colors.wall} stroke="#222" strokeWidth="0.8" />
      {/* Gates */}
      <rect x="10" y="30" width="4" height="6" rx="0.5" fill={gateColor} />
      <rect x="26" y="30" width="4" height="6" rx="0.5" fill={gateColor} />
      {/* Gate bars when closed */}
      {gatesClosed && <>
        <line x1="10" y1="31" x2="14" y2="31" stroke="#c0a050" strokeWidth="0.7" />
        <line x1="10" y1="33" x2="14" y2="33" stroke="#c0a050" strokeWidth="0.7" />
        <line x1="10" y1="35" x2="14" y2="35" stroke="#c0a050" strokeWidth="0.7" />
        <line x1="26" y1="31" x2="30" y2="31" stroke="#c0a050" strokeWidth="0.7" />
        <line x1="26" y1="33" x2="30" y2="33" stroke="#c0a050" strokeWidth="0.7" />
        <line x1="26" y1="35" x2="30" y2="35" stroke="#c0a050" strokeWidth="0.7" />
      </>}
      {/* Battlements */}
      {[8,12,16,20,24,28].map((x,i) => (
        <rect key={i} x={x} y="22" width="3" height="4" fill={colors.wall} stroke="#222" strokeWidth="0.5" />
      ))}

      {level >= 2 && <>
        {/* Tower */}
        <rect x="13" y="14" width="14" height="12" rx="1" fill={colors.stone} stroke="#222" strokeWidth="0.8" />
        <rect x="17" y="20" width="6" height="6" rx="0.5" fill="#1a1a2e" />
        {[13,17,21,25].map((x,i) => (
          <rect key={`t${i}`} x={x} y="12" width="2.5" height="3.5" fill={colors.stone} stroke="#222" strokeWidth="0.5" />
        ))}
      </>}

      {level >= 3 && <>
        {/* Keep + Roof */}
        <rect x="16" y="6" width="8" height="9" rx="1" fill={colors.roof} stroke="#222" strokeWidth="0.8" />
        <polygon points="16,6 20,1 24,6" fill={colors.roof} stroke="#222" strokeWidth="0.7" />
        {/* Flag */}
        <line x1="20" y1="1" x2="20" y2="-3" stroke="#333" strokeWidth="0.6" />
        <polygon points="20,-3 26,-1.5 20,0" fill={colors.flag} />
      </>}
    </svg>
  );
}

// ── Hook: responsive cell size ──
function useCellSize() {
  const [size, setSize] = useState(56);
  useEffect(() => {
    function calc() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxBoardW = vw - 48;       // horizontal padding
      const maxBoardH = vh - 260;      // reserve for header/footer UI
      const maxFromW = Math.floor((maxBoardW - (BOARD_SIZE - 1) * 2 - 16) / BOARD_SIZE);
      const maxFromH = Math.floor((maxBoardH - (BOARD_SIZE - 1) * 2 - 16) / BOARD_SIZE);
      setSize(Math.max(32, Math.min(60, maxFromW, maxFromH)));
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
    if (gameOver || currentPlayer !== PLAYER || aiThinking) return;
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
  }, [board, turn, gameOver, currentPlayer, aiThinking, isValidMove, getMoveType, endTurn]);

  // AI turn
  useEffect(() => {
    if (currentPlayer !== AI || gameOver || !aiThinking) return;
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
  }, [currentPlayer, gameOver, aiThinking, board, turn, difficulty, endTurn]);

  useEffect(() => {
    if (currentPlayer !== PLAYER || gameOver || aiThinking || validMoves.length > 0) return;

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
  }, [currentPlayer, gameOver, aiThinking, validMoves, turn, board, endTurn]);

  // If firstPlayer is AI, trigger AI on game start
  useEffect(() => {
    if (turn === 1 && currentPlayer === AI && !aiThinking && !gameOver) {
      setAiThinking(true);
    }
  }, [turn, currentPlayer, aiThinking, gameOver]);

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
      background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      padding: "12px 16px",
      fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif",
      color: "#e0d8c8",
      boxSizing: "border-box"
    }}>
      {/* Title */}
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: 8,
          margin: 0,
          color: "#d4a843",
          textShadow: "0 2px 12px rgba(212,168,67,0.3)"
        }}>FORTRESS</h1>
        <div style={{ fontSize: 10, letterSpacing: 3, opacity: 0.5, marginTop: 1 }}>
          SSI · 1983 · JIM TEMPLEMAN · PATTY DENBROOK
        </div>
      </div>

      {/* Info Bar */}
      <div style={{
        display: "flex", gap: 24, alignItems: "center", marginBottom: 8,
        fontSize: 13, opacity: 0.85
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: "#3b82f6" }} />
          <span>YOU: {tiles.player}</span>
        </div>
        <div style={{
          padding: "3px 12px",
          background: "rgba(212,168,67,0.15)",
          borderRadius: 4,
          border: "1px solid rgba(212,168,67,0.3)",
          fontVariantNumeric: "tabular-nums"
        }}>
          TURN {turn} / {totalTurns}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>CPU: {tiles.ai}</span>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: "#d97706" }} />
        </div>
      </div>

      {/* Board */}
      <div style={{
        background: "rgba(0,0,0,0.35)",
        borderRadius: 8,
        padding: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)"
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${BOARD_SIZE}, ${cellSize}px)`,
          gridAutoRows: `${cellSize}px`,
          gap: 2,
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
                   >= strengthMap[r][c][cell.castle === PLAYER ? 0 : 1];

              let bg = "rgba(60,60,80,0.4)";
              if (ctrl === PLAYER) bg = "rgba(59,130,246,0.18)";
              if (ctrl === AI) bg = "rgba(217,119,6,0.18)";

              let border = "1px solid rgba(255,255,255,0.06)";
              if (gatesClosed) border = "1.5px dashed rgba(255,200,60,0.5)";
              if (isLast) border = `2px solid ${lastMove.who === PLAYER ? "#3b82f6" : "#d97706"}`;
              if (isHovered && canAct) border = "2px solid rgba(212,168,67,0.7)";

              return (
                <div
                  key={`${r}-${c}`}
                  onClick={() => handleClick(r, c)}
                  onMouseEnter={() => setHoveredCell({ r, c })}
                  onMouseLeave={() => setHoveredCell(null)}
                  style={{
                    background: bg,
                    border,
                    borderRadius: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: canAct ? "pointer" : "default",
                    position: "relative",
                    transition: "all 0.15s ease",
                    transform: isHovered && canAct ? "scale(1.05)" : "scale(1)",
                    boxShadow: isHovered && canAct
                      ? "0 0 12px rgba(212,168,67,0.3)"
                      : gatesClosed ? "inset 0 0 8px rgba(255,200,60,0.15)" : "none"
                  }}
                >
                  {cell.castle !== 0 && (
                    <CastleSVG level={cell.level} owner={cell.castle}
                      size={Math.round(cellSize * 0.68)} gatesClosed={gatesClosed} />
                  )}
                  {cell.castle === 0 && canAct && isHovered && (
                    <div style={{ opacity: 0.3 }}>
                      <CastleSVG level={1} owner={PLAYER} size={Math.round(cellSize * 0.54)} />
                    </div>
                  )}
                  {cell.castle !== 0 && moveType === "upgrade" && isHovered && (
                    <div style={{
                      position: "absolute", top: 2, right: 3,
                      fontSize: 14, fontWeight: 700,
                      color: "#d4a843",
                      textShadow: "0 1px 4px rgba(0,0,0,0.8)"
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
                      <span style={{ color: "#6ea8fe" }}>{str1 || ""}</span>
                      <span style={{ color: "#f0a040" }}>{str2 || ""}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
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
            color: result === "win" ? "#4ade80" : result === "lose" ? "#f87171" : "#fbbf24",
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
        <button onClick={() => resetGame(firstPlayer)} style={btnStyle}>
          NEW GAME
        </button>

        {/* First player toggle */}
        <div style={{
          display: "flex", borderRadius: 6, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.15)"
        }}>
          {[
            { val: PLAYER, label: "先手" },
            { val: AI, label: "後手" },
          ].map(({ val, label }) => (
            <button key={val} onClick={() => resetGame(val)} style={{
              ...btnStyle, border: "none", borderRadius: 0,
              background: firstPlayer === val ? "rgba(212,168,67,0.25)" : "rgba(255,255,255,0.04)",
              color: firstPlayer === val ? "#d4a843" : "#e0d8c8",
              padding: "6px 12px", fontSize: 11
            }}>{label}</button>
          ))}
        </div>

        {/* Difficulty selector */}
        <div style={{
          display: "flex", borderRadius: 6, overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.15)"
        }}>
          {[
            { val: "easy", label: "Easy", emoji: "🟢" },
            { val: "normal", label: "Normal", emoji: "🟡" },
            { val: "hard", label: "Hard", emoji: "🟠" },
            { val: "master", label: "Master", emoji: "🔴" },
          ].map(({ val, label, emoji }) => (
            <button key={val} onClick={() => { setDifficulty(val); }} style={{
              ...btnStyle, border: "none", borderRadius: 0,
              background: difficulty === val ? "rgba(212,168,67,0.25)" : "rgba(255,255,255,0.04)",
              color: difficulty === val ? "#d4a843" : "#e0d8c8",
              padding: "6px 10px", fontSize: 11
            }}>{emoji} {label}</button>
          ))}
        </div>

        <button onClick={() => setShowRules(s => !s)} style={{...btnStyle, background: "rgba(212,168,67,0.15)", borderColor: "rgba(212,168,67,0.4)"}}>
          {showRules ? "HIDE" : "RULES"}
        </button>
      </div>

      {/* Rules Panel */}
      {showRules && (
        <div style={{
          marginTop: 10,
          maxWidth: 440,
          maxHeight: "30vh",
          overflowY: "auto",
          background: "rgba(0,0,0,0.4)",
          border: "1px solid rgba(212,168,67,0.2)",
          borderRadius: 8,
          padding: "14px 18px",
          fontSize: 13,
          lineHeight: 1.7,
          color: "#c8c0b0"
        }}>
          <div style={{ fontWeight: 700, color: "#d4a843", marginBottom: 6, letterSpacing: 2, fontSize: 14 }}>
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
            <b>閉門 🚪:</b> 城のある位置で敵の影響力と拮抗（同値）している場合、門が閉じた状態で表示される。あと一押しで落城する危険信号。
          </p>
          <p style={{ margin: "6px 0", fontSize: 11, opacity: 0.6 }}>
            マス左下の<span style={{color:"#6ea8fe"}}>青数字</span>=あなたの影響力、
            右下の<span style={{color:"#f0a040"}}>橙数字</span>=CPUの影響力
          </p>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  padding: "8px 16px",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  color: "#e0d8c8",
  fontFamily: "'Palatino Linotype', Georgia, serif",
  fontSize: 12,
  letterSpacing: 1.5,
  cursor: "pointer",
  transition: "all 0.15s ease"
};
