export const BOARD_SIZE = 6;
export const DEFAULT_MOVES_PER_PLAYER = 21;
export const MAX_MOVES_PER_PLAYER = 54;
export const MAX_LEVEL = 3;
export const WHITE = 1;
export const BLACK = 2;
export const NEUTRAL = 0;

const CARDINAL_AND_SELF = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export const AI_PROFILES = {
  squire: {
    id: "squire",
    name: "The Squire",
    description: "Beginner — shallow search with deliberate mistakes",
    depth: 1,
    endgameDepth: 2,
    maxBranching: 14,
    blunderRate: 0.3,
    weights: { territory: 1.0, fort: 0.12, siege: 0.25, safety: 0.05, edge: 0.02 },
  },
  galahad: {
    id: "galahad",
    name: "Sir Galahad",
    description: "Edge-oriented — favors castles on the rim",
    depth: 2,
    endgameDepth: 3,
    maxBranching: 12,
    blunderRate: 0.08,
    weights: { territory: 1.0, fort: 0.16, siege: 0.42, safety: 0.1, edge: 0.58 },
  },
  genghis: {
    id: "genghis",
    name: "Genghis Khan",
    description: "Aggressive — pressures castles and accepts risk",
    depth: 2,
    endgameDepth: 3,
    maxBranching: 11,
    blunderRate: 0.04,
    weights: { territory: 0.92, fort: 0.2, siege: 1.1, safety: 0.02, edge: 0.04 },
  },
  maginot: {
    id: "maginot",
    name: "Lord Maginot",
    description: "Defensive — values supported, hard-to-disrupt castles",
    depth: 2,
    endgameDepth: 3,
    maxBranching: 11,
    blunderRate: 0.03,
    weights: { territory: 0.94, fort: 0.34, siege: 0.28, safety: 0.7, edge: 0.02 },
  },
  vauban: {
    id: "vauban",
    name: "Count Vauban",
    description: "Balanced — mixes territory, attack, and defense",
    depth: 3,
    endgameDepth: 4,
    maxBranching: 9,
    blunderRate: 0,
    weights: { territory: 1.0, fort: 0.24, siege: 0.6, safety: 0.32, edge: 0.08 },
  },
};

export function opponentOf(player) {
  return player === WHITE ? BLACK : WHITE;
}

export function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ owner: NEUTRAL, level: 0 })),
  );
}

export function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })));
}

export function calcInfluence(board) {
  const influence = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => [0, 0]),
  );

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const castle = board[row][col];
      if (castle.owner === NEUTRAL) continue;

      const ownerIndex = castle.owner - 1;
      for (const [dr, dc] of CARDINAL_AND_SELF) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
        influence[r][c][ownerIndex] += castle.level;
      }
    }
  }

  return influence;
}

export function calcControl(influence) {
  return influence.map((row) =>
    row.map(([white, black]) => {
      if (white > black) return WHITE;
      if (black > white) return BLACK;
      return NEUTRAL;
    }),
  );
}

export function castleMargin(board, row, col, influence = calcInfluence(board)) {
  const castle = board[row][col];
  if (castle.owner === NEUTRAL) return null;
  const own = influence[row][col][castle.owner - 1];
  const enemy = influence[row][col][opponentOf(castle.owner) - 1];
  return own - enemy;
}

export function getCapturedCastles(board, influence = calcInfluence(board)) {
  const captured = [];
  const control = calcControl(influence);

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const castle = board[row][col];
      if (castle.owner === NEUTRAL) continue;
      if (control[row][col] === opponentOf(castle.owner)) {
        captured.push({ row, col, owner: castle.owner, level: castle.level });
      }
    }
  }

  return captured;
}

// Fortress resolves destruction from the position immediately after the move.
// Every castle in that position contributes influence, including a suicidal new castle.
// All defeated castles are then removed together rather than as an iterative cascade.
export function resolveAfterMove(board) {
  const influenceBeforeDestruction = calcInfluence(board);
  const captured = getCapturedCastles(board, influenceBeforeDestruction);
  if (captured.length === 0) return { board: cloneBoard(board), captured: [] };

  const resolved = cloneBoard(board);
  for (const castle of captured) {
    resolved[castle.row][castle.col] = { owner: NEUTRAL, level: 0 };
  }
  return { board: resolved, captured };
}

export function getValidMoves(board, player) {
  const moves = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const cell = board[row][col];
      if (cell.owner === NEUTRAL) {
        // The original game permits suicidal placement on enemy-controlled empty squares.
        moves.push({ type: "place", row, col });
      } else if (cell.owner === player && cell.level < MAX_LEVEL) {
        moves.push({ type: "upgrade", row, col });
      }
    }
  }

  return moves;
}

export function applyMove(board, move, player) {
  if (!move) return { board: cloneBoard(board), captured: [] };
  const next = cloneBoard(board);
  const cell = next[move.row]?.[move.col];
  if (!cell) throw new Error("Move is outside the board");

  if (move.type === "place") {
    if (cell.owner !== NEUTRAL) throw new Error("Cannot place on an occupied square");
    next[move.row][move.col] = { owner: player, level: 1 };
  } else if (move.type === "upgrade") {
    if (cell.owner !== player) throw new Error("Cannot fortify another player's castle");
    if (cell.level >= MAX_LEVEL) throw new Error("Castle is already at maximum strength");
    next[move.row][move.col] = { ...cell, level: cell.level + 1 };
  } else {
    throw new Error(`Unknown move type: ${move.type}`);
  }

  return resolveAfterMove(next);
}

export function countTerritory(board) {
  const control = calcControl(calcInfluence(board));
  let white = 0;
  let black = 0;

  for (const row of control) {
    for (const owner of row) {
      if (owner === WHITE) white += 1;
      if (owner === BLACK) black += 1;
    }
  }

  return { white, black, neutral: BOARD_SIZE * BOARD_SIZE - white - black };
}

function isEdge(row, col) {
  return row === 0 || col === 0 || row === BOARD_SIZE - 1 || col === BOARD_SIZE - 1;
}

function evaluateBoard(board, aiPlayer, profile) {
  const enemy = opponentOf(aiPlayer);
  const influence = calcInfluence(board);
  const control = calcControl(influence);
  const weights = profile.weights;
  let territory = 0;
  let fort = 0;
  let siege = 0;
  let safety = 0;
  let edge = 0;

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      if (control[row][col] === aiPlayer) territory += 1;
      if (control[row][col] === enemy) territory -= 1;

      const castle = board[row][col];
      if (castle.owner === NEUTRAL) continue;
      const sign = castle.owner === aiPlayer ? 1 : -1;
      fort += sign * castle.level;
      if (isEdge(row, col)) edge += sign * castle.level;

      const margin = castleMargin(board, row, col, influence);
      if (margin === 0) siege -= sign;
      if (margin > 0) safety += sign * Math.min(margin, 4);
    }
  }

  return (
    territory * weights.territory +
    fort * weights.fort +
    siege * weights.siege +
    safety * weights.safety +
    edge * weights.edge
  );
}

function rankMoves(board, player, profile, maxBranching) {
  const aiPlayer = BLACK;
  return getValidMoves(board, player)
    .map((move) => {
      const result = applyMove(board, move, player);
      const captureSwing = result.captured.reduce((score, castle) => {
        return score + (castle.owner === aiPlayer ? -castle.level : castle.level);
      }, 0);
      return {
        move,
        board: result.board,
        score: evaluateBoard(result.board, aiPlayer, profile) + captureSwing * profile.weights.siege,
      };
    })
    .sort((a, b) => (player === aiPlayer ? b.score - a.score : a.score - b.score))
    .slice(0, maxBranching);
}

function minimax(board, depth, alpha, beta, maximizing, profile) {
  if (depth <= 0) return { score: evaluateBoard(board, BLACK, profile), move: null };

  const player = maximizing ? BLACK : WHITE;
  const candidates = rankMoves(board, player, profile, profile.maxBranching);
  if (candidates.length === 0) {
    return { score: evaluateBoard(board, BLACK, profile), move: null };
  }

  let bestMove = candidates[0].move;

  if (maximizing) {
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const { score } = minimax(candidate.board, depth - 1, alpha, beta, false, profile);
      if (score > bestScore) {
        bestScore = score;
        bestMove = candidate.move;
      }
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return { score: bestScore, move: bestMove };
  }

  let bestScore = Infinity;
  for (const candidate of candidates) {
    const { score } = minimax(candidate.board, depth - 1, alpha, beta, true, profile);
    if (score < bestScore) {
      bestScore = score;
      bestMove = candidate.move;
    }
    beta = Math.min(beta, score);
    if (beta <= alpha) break;
  }
  return { score: bestScore, move: bestMove };
}

export function chooseAiMove(board, profileId = "vauban", remainingMoves = DEFAULT_MOVES_PER_PLAYER) {
  const profile = AI_PROFILES[profileId] ?? AI_PROFILES.vauban;
  const legal = getValidMoves(board, BLACK);
  if (legal.length === 0) return null;

  if (profile.blunderRate > 0 && Math.random() < profile.blunderRate) {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  const depth = remainingMoves <= 6 ? profile.endgameDepth : profile.depth;
  return minimax(board, depth, -Infinity, Infinity, true, profile).move;
}
