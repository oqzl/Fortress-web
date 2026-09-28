import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AI_PROFILES,
  BLACK,
  DEFAULT_MOVES_PER_PLAYER,
  MAX_MOVES_PER_PLAYER,
  WHITE,
  applyMove,
  calcControl,
  calcInfluence,
  castleMargin,
  chooseAiMove,
  countTerritory,
  createEmptyBoard,
  getValidMoves,
  opponentOf,
} from "./game.js";

function CastleIcon({ owner, level, siege }) {
  const wall = owner === WHITE ? "#5d8fe8" : "#c66f32";
  const dark = owner === WHITE ? "#294c8a" : "#743a1d";
  const light = owner === WHITE ? "#a8c6ff" : "#ffc292";
  const gate = siege ? "#d8b25b" : "#161a22";

  return (
    <svg className="castle" viewBox="0 0 48 48" aria-hidden="true" shapeRendering="crispEdges">
      <rect x="8" y="24" width="32" height="18" fill={wall} />
      <rect x="8" y="20" width="6" height="7" fill={wall} />
      <rect x="18" y="20" width="6" height="7" fill={wall} />
      <rect x="28" y="20" width="6" height="7" fill={wall} />
      <rect x="36" y="20" width="4" height="7" fill={wall} />
      <rect x="19" y="33" width="10" height="9" fill={gate} />
      {level >= 2 && (
        <>
          <rect x="15" y="12" width="18" height="17" fill={light} />
          <rect x="15" y="9" width="5" height="7" fill={light} />
          <rect x="24" y="9" width="5" height="7" fill={light} />
          <rect x="29" y="9" width="4" height="7" fill={light} />
        </>
      )}
      {level >= 3 && (
        <>
          <rect x="20" y="4" width="8" height="11" fill={dark} />
          <path d="M18 4 24 0l6 4Z" fill={dark} />
          <rect x="24" y="0" width="1" height="6" fill="#d8b25b" />
          <path d="M25 0h8l-3 3 3 3h-8Z" fill={wall} />
        </>
      )}
      {siege && (
        <>
          <path d="M19 34h10M19 37h10M19 40h10" stroke="#382f1c" strokeWidth="1" />
          <rect x="5" y="5" width="10" height="3" fill="#d8b25b" />
        </>
      )}
    </svg>
  );
}

function resultText(result, territory) {
  if (!result) return "";
  if (result === "white") return `WHITE WINS — ${territory.white} : ${territory.black}`;
  if (result === "black") return `BLACK WINS — ${territory.black} : ${territory.white}`;
  return `DRAW — ${territory.white} : ${territory.black}`;
}

export default function FortressGame() {
  const [board, setBoard] = useState(createEmptyBoard);
  const [currentPlayer, setCurrentPlayer] = useState(WHITE);
  const [firstPlayer, setFirstPlayer] = useState(WHITE);
  const [moveCounts, setMoveCounts] = useState({ [WHITE]: 0, [BLACK]: 0 });
  const [movesPerPlayer, setMovesPerPlayer] = useState(DEFAULT_MOVES_PER_PLAYER);
  const [mode, setMode] = useState("cpu");
  const [profileId, setProfileId] = useState("vauban");
  const [showSiege, setShowSiege] = useState(true);
  const [showRules, setShowRules] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [result, setResult] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [lastCaptured, setLastCaptured] = useState([]);
  const [notice, setNotice] = useState("");

  const influence = useMemo(() => calcInfluence(board), [board]);
  const control = useMemo(() => calcControl(influence), [influence]);
  const territory = useMemo(() => countTerritory(board), [board]);
  const legalMoves = useMemo(
    () => (gameOver ? [] : getValidMoves(board, currentPlayer)),
    [board, currentPlayer, gameOver],
  );
  const legalMap = useMemo(() => {
    const map = new Map();
    for (const move of legalMoves) map.set(`${move.row}:${move.col}`, move.type);
    return map;
  }, [legalMoves]);

  const finishIfNeeded = useCallback((nextBoard, nextCounts) => {
    if (nextCounts[WHITE] < movesPerPlayer || nextCounts[BLACK] < movesPerPlayer) return false;
    const score = countTerritory(nextBoard);
    setGameOver(true);
    setAiThinking(false);
    if (score.white > score.black) setResult("white");
    else if (score.black > score.white) setResult("black");
    else setResult("draw");
    return true;
  }, [movesPerPlayer]);

  const advance = useCallback((nextBoard, who, captured = [], move = null, message = "") => {
    const nextCounts = {
      ...moveCounts,
      [who]: moveCounts[who] + 1,
    };

    setBoard(nextBoard);
    setMoveCounts(nextCounts);
    setLastMove(move ? { ...move, owner: who } : null);
    setLastCaptured(captured);
    setNotice(message || (captured.length ? `${captured.length} castle${captured.length > 1 ? "s" : ""} fell` : ""));

    if (finishIfNeeded(nextBoard, nextCounts)) return;

    let nextPlayer = opponentOf(who);
    if (nextCounts[nextPlayer] >= movesPerPlayer) nextPlayer = who;
    setCurrentPlayer(nextPlayer);
    setAiThinking(mode === "cpu" && nextPlayer === BLACK);
  }, [finishIfNeeded, mode, moveCounts, movesPerPlayer]);

  const playMove = useCallback((move, who) => {
    const resolved = applyMove(board, move, who);
    advance(resolved.board, who, resolved.captured, move);
  }, [advance, board]);

  const handleCell = useCallback((row, col) => {
    if (gameOver || aiThinking) return;
    if (mode === "cpu" && currentPlayer === BLACK) return;
    const type = legalMap.get(`${row}:${col}`);
    if (!type) return;
    playMove({ type, row, col }, currentPlayer);
  }, [aiThinking, currentPlayer, gameOver, legalMap, mode, playMove]);

  useEffect(() => {
    if (gameOver || legalMoves.length > 0) return;
    if (mode === "cpu" && currentPlayer === BLACK) return;
    const timer = window.setTimeout(() => {
      advance(board, currentPlayer, [], null, `${currentPlayer === WHITE ? "WHITE" : "BLACK"} passes`);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [advance, board, currentPlayer, gameOver, legalMoves.length, mode]);

  useEffect(() => {
    if (mode !== "cpu" || currentPlayer !== BLACK || gameOver || !aiThinking) return;
    const timer = window.setTimeout(() => {
      const remaining = movesPerPlayer - moveCounts[BLACK];
      const move = chooseAiMove(board, profileId, remaining);
      if (!move) {
        advance(board, BLACK, [], null, `${AI_PROFILES[profileId].name} passes`);
        return;
      }
      const resolved = applyMove(board, move, BLACK);
      advance(resolved.board, BLACK, resolved.captured, move);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [advance, aiThinking, board, currentPlayer, gameOver, mode, moveCounts, movesPerPlayer, profileId]);

  useEffect(() => {
    if (lastCaptured.length === 0) return undefined;
    const timer = window.setTimeout(() => setLastCaptured([]), 720);
    return () => window.clearTimeout(timer);
  }, [lastCaptured]);

  const resetGame = useCallback((overrides = {}) => {
    const nextFirst = overrides.firstPlayer ?? firstPlayer;
    const nextMode = overrides.mode ?? mode;
    setBoard(createEmptyBoard());
    setCurrentPlayer(nextFirst);
    setMoveCounts({ [WHITE]: 0, [BLACK]: 0 });
    setGameOver(false);
    setResult(null);
    setLastMove(null);
    setLastCaptured([]);
    setNotice("");
    setAiThinking(nextMode === "cpu" && nextFirst === BLACK);
  }, [firstPlayer, mode]);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    resetGame({ mode: nextMode });
  };

  const changeFirst = (value) => {
    const next = Number(value);
    setFirstPlayer(next);
    resetGame({ firstPlayer: next });
  };

  const changeLength = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(1, Math.min(MAX_MOVES_PER_PLAYER, Math.trunc(parsed)));
    setMovesPerPlayer(clamped);
    resetGame();
  };

  const isCapturedFlash = (row, col) => lastCaptured.some((castle) => castle.row === row && castle.col === col);
  const canHumanAct = !gameOver && !aiThinking && !(mode === "cpu" && currentPlayer === BLACK);
  const activeName = mode === "cpu" && currentPlayer === BLACK ? AI_PROFILES[profileId].name : currentPlayer === WHITE ? "WHITE" : "BLACK";
  const nextMoveNumber = Math.min(moveCounts[currentPlayer] + 1, movesPerPlayer);

  return (
    <main className="app">
      <header className="header">
        <h1 className="title">FORTRESS</h1>
        <div className="subtitle">WEB EDITION · BASED ON SSI 1983</div>
      </header>

      <section className="scorebar" aria-label="score">
        <div className="side-score">
          <span className="dot white" />
          <span>WHITE {territory.white} · {moveCounts[WHITE]}/{movesPerPlayer}</span>
        </div>
        <div className="turn-chip">{gameOver ? "FINAL" : `${activeName} ${nextMoveNumber}/${movesPerPlayer}`}</div>
        <div className="side-score black">
          <span>BLACK {territory.black} · {moveCounts[BLACK]}/{movesPerPlayer}</span>
          <span className="dot black" />
        </div>
      </section>

      <section className="board-shell" aria-label="Fortress board">
        <div className="board">
          {board.map((row, rowIndex) => row.map((cell, colIndex) => {
            const key = `${rowIndex}:${colIndex}`;
            const moveType = legalMap.get(key);
            const legal = Boolean(moveType) && canHumanAct;
            const last = lastMove?.row === rowIndex && lastMove?.col === colIndex;
            const margin = cell.owner ? castleMargin(board, rowIndex, colIndex, influence) : null;
            const siege = cell.owner !== 0 && margin === 0;
            const label = cell.owner
              ? `${cell.owner === WHITE ? "White" : "Black"} castle level ${cell.level}${siege ? ", under siege" : ""}`
              : `${control[rowIndex][colIndex] === WHITE ? "White controlled" : control[rowIndex][colIndex] === BLACK ? "Black controlled" : "Neutral"} square${moveType ? `, ${moveType}` : ""}`;

            return (
              <button
                type="button"
                className={`cell ${control[rowIndex][colIndex] === WHITE ? "control-white" : control[rowIndex][colIndex] === BLACK ? "control-black" : ""} ${legal ? "legal" : ""} ${last ? "last" : ""} ${isCapturedFlash(rowIndex, colIndex) ? "captured" : ""}`}
                key={key}
                onClick={() => handleCell(rowIndex, colIndex)}
                disabled={!legal}
                aria-label={label}
              >
                {cell.owner !== 0 ? (
                  <CastleIcon owner={cell.owner} level={cell.level} siege={showSiege && siege} />
                ) : control[rowIndex][colIndex] !== 0 ? (
                  <span className={`territory-mark ${control[rowIndex][colIndex] === WHITE ? "white" : "black"}`} />
                ) : null}
                {legal && moveType === "upgrade" ? <span className="upgrade-badge">+</span> : null}
                {showSiege && siege ? <span className="siege-badge">!</span> : null}
                {(influence[rowIndex][colIndex][0] > 0 || influence[rowIndex][colIndex][1] > 0) ? (
                  <span className="influence" aria-hidden="true">
                    <span className="w">{influence[rowIndex][colIndex][0] || ""}</span>
                    <span className="b">{influence[rowIndex][colIndex][1] || ""}</span>
                  </span>
                ) : null}
              </button>
            );
          }))}
        </div>
      </section>

      <div className={`status ${gameOver ? "result" : ""}`} aria-live="polite">
        {gameOver
          ? resultText(result, territory)
          : aiThinking
            ? `${AI_PROFILES[profileId].name} is thinking…`
            : notice || `${activeName}: place a castle or fortify one you own`}
      </div>

      <section className="controls" aria-label="game controls">
        <div className="control">
          <label htmlFor="mode">Mode</label>
          <select id="mode" value={mode} onChange={(event) => changeMode(event.target.value)}>
            <option value="cpu">VS CPU</option>
            <option value="local">2 PLAYERS</option>
          </select>
        </div>

        {mode === "cpu" ? (
          <div className="control">
            <label htmlFor="opponent">CPU</label>
            <select id="opponent" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
              {Object.values(AI_PROFILES).map((profile) => (
                <option value={profile.id} key={profile.id}>{profile.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="control">
            <label htmlFor="siege">Siege display</label>
            <select id="siege" value={showSiege ? "on" : "off"} onChange={(event) => setShowSiege(event.target.value === "on")}>
              <option value="on">ON</option>
              <option value="off">OFF</option>
            </select>
          </div>
        )}

        <div className="control">
          <label htmlFor="first">First</label>
          <select id="first" value={firstPlayer} onChange={(event) => changeFirst(event.target.value)}>
            <option value={WHITE}>WHITE{mode === "cpu" ? " / YOU" : ""}</option>
            <option value={BLACK}>BLACK{mode === "cpu" ? " / CPU" : ""}</option>
          </select>
        </div>

        <div className="control">
          <label htmlFor="length">Moves / player</label>
          <input
            id="length"
            type="number"
            min="1"
            max={MAX_MOVES_PER_PLAYER}
            value={movesPerPlayer}
            onChange={(event) => changeLength(event.target.value)}
          />
        </div>

        {mode === "cpu" ? (
          <button type="button" className="control-button" onClick={() => setShowSiege((value) => !value)}>
            SIEGE {showSiege ? "ON" : "OFF"}
          </button>
        ) : null}
        <button type="button" className="control-button primary" onClick={() => resetGame()}>
          NEW GAME
        </button>
        <button type="button" className="control-button" onClick={() => setShowRules((value) => !value)}>
          {showRules ? "CLOSE RULES" : "RULES"}
        </button>
      </section>

      {showRules ? (
        <section className="rules">
          <h2>RULES</h2>
          <p>6×6盤で領地を争う。標準ゲームは各プレイヤー21手</p>
          <ul>
            <li>手番では、空きマスへLv.1の城を置くか、自分の城をLv.3まで1段階増強する</li>
            <li>城は自マスと上下左右へ、城レベルと同じ影響力を出す</li>
            <li>白と黒の影響力を比較し、大きい側が支配。同値は中立</li>
            <li>敵の支配下になった城は落城する</li>
            <li>敵支配下の空きマスにも新城を置ける。落城する新城も、その判定までは影響力を出す</li>
            <li>同じ手で落城条件を満たした城はまとめて除去する</li>
            <li>双方が規定手数を終えた時点で、支配マス数が多い側の勝利</li>
          </ul>
          <p>各マス下部の青・橙数字は、そのマスへの白・黒の影響力。城の「!」は影響力が同値で包囲状態にあることを示す</p>
          {mode === "cpu" ? <p>{AI_PROFILES[profileId].name}: {AI_PROFILES[profileId].description}</p> : null}
          <p className="note">CPUの5人格は原作で説明された傾向を現代の探索評価で近似したもの。原作の学習アルゴリズムそのものは再現していない</p>
        </section>
      ) : null}
    </main>
  );
}
