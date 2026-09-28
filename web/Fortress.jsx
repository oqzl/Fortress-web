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

const FACTIONS = {
  [WHITE]: { name: "ﾈｺﾁｬﾝ", short: "NEKO", glyph: "♡" },
  [BLACK]: { name: "ｼﾏｴﾅｶﾞ", short: "SHIMA", glyph: "✦" },
};

const TICKERS = [
  "置く！光る！増える！",
  "あと1手だけ…が21手",
  "同点マスは中立！取り返せ！",
  "Lv.3まで育ててﾃﾞｶくしろ",
  "敵陣に突っ込む自爆配置もｱﾘ",
  "考える前に盤面が光ってる",
];

const AMBIENT = ["✦", "♡", "★", "✧", "⚡", "●", "♡", "✦", "◆", "★", "✧", "♡"];

function MascotIcon({ owner, level, siege, delay }) {
  const isCat = owner === WHITE;
  return (
    <span
      className={"mascot-wrap " + (isCat ? "cat-side" : "bird-side") + " level-" + level + (siege ? " is-siege" : "")}
      style={{ "--delay": delay }}
      aria-hidden="true"
    >
      <span className="mascot-aura" />
      <svg className="mascot" viewBox="0 0 64 64">
        {isCat ? (
          <>
            <path className="animal-shadow" d="M13 29c1-13 8-20 19-20 12 0 19 8 20 21v11c0 10-8 17-20 17S12 51 12 41Z" />
            <path className="animal-main" d="M14 29 13 10l13 10h12L51 10l-1 20c3 5 4 10 2 15-3 9-10 13-20 13S15 54 12 45c-2-6-1-11 2-16Z" />
            <path className="animal-ear" d="m17 16 7 6-7 3Zm30 0-7 6 7 3Z" />
            <ellipse className="animal-eye" cx="24" cy="34" rx="3.2" ry="4.2" />
            <ellipse className="animal-eye" cx="40" cy="34" rx="3.2" ry="4.2" />
            <path className="animal-face" d="M29 42c2 2 4 2 6 0M32 39l-2-2h4Z" />
            <path className="animal-cheek" d="M18 41h6m16 0h6" />
          </>
        ) : (
          <>
            <ellipse className="animal-shadow" cx="32" cy="39" rx="23" ry="19" />
            <ellipse className="animal-main" cx="32" cy="36" rx="22" ry="20" />
            <path className="bird-cap" d="M14 30c3-11 10-17 18-17s15 6 18 17c-5-4-11-6-18-6s-13 2-18 6Z" />
            <ellipse className="bird-wing" cx="13" cy="39" rx="7" ry="11" transform="rotate(16 13 39)" />
            <ellipse className="bird-wing" cx="51" cy="39" rx="7" ry="11" transform="rotate(-16 51 39)" />
            <circle className="animal-eye" cx="25" cy="33" r="2.7" />
            <circle className="animal-eye" cx="39" cy="33" r="2.7" />
            <path className="bird-beak" d="m32 37-4 3h8Z" />
            <ellipse className="bird-cheek" cx="20" cy="40" rx="4" ry="2.4" />
            <ellipse className="bird-cheek" cx="44" cy="40" rx="4" ry="2.4" />
          </>
        )}
        {level >= 2 ? <circle className="level-ring" cx="32" cy="32" r="27" /> : null}
        {level >= 3 ? <path className="level-crown" d="m20 15 5-8 7 6 7-6 5 8-4 5H24Z" /> : null}
      </svg>
      <span className="level-pips">{Array.from({ length: level }, (_, index) => <i key={index} />)}</span>
      {siege ? <span className="danger-orbit">!</span> : null}
    </span>
  );
}

function BurstFx({ type }) {
  const glyphs = type === "capture"
    ? ["💥", "✦", "★", "⚡", "✶", "◆", "💥", "★"]
    : type === "upgrade"
      ? ["★", "✦", "♡", "↑", "✧", "★", "♡", "✦"]
      : ["♡", "✦", "★", "✧", "♡", "●", "✦", "★"];

  return (
    <span className={"burst burst-" + type} aria-hidden="true">
      {glyphs.map((glyph, index) => (
        <i key={index} style={{ "--i": index }}>{glyph}</i>
      ))}
    </span>
  );
}

function resultText(result, territory) {
  if (!result) return "";
  if (result === "white") return "ﾈｺﾁｬﾝ大勝利!! " + territory.white + " : " + territory.black;
  if (result === "black") return "ｼﾏｴﾅｶﾞ大勝利!! " + territory.black + " : " + territory.white;
  return "まさかのDRAW!! " + territory.white + " : " + territory.black;
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
  const [burst, setBurst] = useState(null);
  const [screenFx, setScreenFx] = useState("");
  const [tickerIndex, setTickerIndex] = useState(0);

  const influence = useMemo(() => calcInfluence(board), [board]);
  const control = useMemo(() => calcControl(influence), [influence]);
  const territory = useMemo(() => countTerritory(board), [board]);
  const legalMoves = useMemo(
    () => (gameOver ? [] : getValidMoves(board, currentPlayer)),
    [board, currentPlayer, gameOver],
  );
  const legalMap = useMemo(() => {
    const map = new Map();
    for (const move of legalMoves) map.set(move.row + ":" + move.col, move.type);
    return map;
  }, [legalMoves]);

  const totalMoves = moveCounts[WHITE] + moveCounts[BLACK];
  const matchProgress = Math.min(1, totalMoves / Math.max(1, movesPerPlayer * 2));
  const intensity = matchProgress >= 0.86 ? "max" : matchProgress >= 0.62 ? "hyper" : "normal";
  const stimulation = Math.round(18 + matchProgress * 82);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTickerIndex((value) => (value + 1) % TICKERS.length);
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  const finishIfNeeded = useCallback((nextBoard, nextCounts) => {
    if (nextCounts[WHITE] < movesPerPlayer || nextCounts[BLACK] < movesPerPlayer) return false;
    const score = countTerritory(nextBoard);
    setGameOver(true);
    setAiThinking(false);
    setScreenFx("finish");
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

    const fxType = captured.length
      ? "capture"
      : move?.type === "upgrade"
        ? "upgrade"
        : move
          ? "place"
          : "turn";

    const autoMessage = captured.length
      ? "💥 " + captured.length + "体 ふっとんだ!!"
      : move?.type === "upgrade"
        ? "✨ " + FACTIONS[who].name + " POWER UP!!"
        : move
          ? "💖 " + FACTIONS[who].name + " 爆誕!!"
          : "";

    setBoard(nextBoard);
    setMoveCounts(nextCounts);
    setLastMove(move ? { ...move, owner: who } : null);
    setLastCaptured(captured);
    setNotice(message || autoMessage);
    setScreenFx(fxType);
    if (move) {
      setBurst({ id: Date.now() + Math.random(), row: move.row, col: move.col, type: fxType });
    }

    window.setTimeout(() => setScreenFx(""), fxType === "capture" ? 520 : 360);
    window.setTimeout(() => setNotice(""), 1050);

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
    const type = legalMap.get(row + ":" + col);
    if (!type) return;
    if ("vibrate" in navigator) navigator.vibrate(type === "upgrade" ? [16, 18, 16] : 18);
    playMove({ type, row, col }, currentPlayer);
  }, [aiThinking, currentPlayer, gameOver, legalMap, mode, playMove]);

  useEffect(() => {
    if (gameOver || legalMoves.length > 0) return;
    if (mode === "cpu" && currentPlayer === BLACK) return;
    const timer = window.setTimeout(() => {
      advance(board, currentPlayer, [], null, FACTIONS[currentPlayer].name + " PASS");
    }, 180);
    return () => window.clearTimeout(timer);
  }, [advance, board, currentPlayer, gameOver, legalMoves.length, mode]);

  useEffect(() => {
    if (mode !== "cpu" || currentPlayer !== BLACK || gameOver || !aiThinking) return;
    const timer = window.setTimeout(() => {
      const remaining = movesPerPlayer - moveCounts[BLACK];
      const move = chooseAiMove(board, profileId, remaining);
      if (!move) {
        advance(board, BLACK, [], null, FACTIONS[BLACK].name + " PASS");
        return;
      }
      const resolved = applyMove(board, move, BLACK);
      advance(resolved.board, BLACK, resolved.captured, move);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [advance, aiThinking, board, currentPlayer, gameOver, mode, moveCounts, movesPerPlayer, profileId]);

  useEffect(() => {
    if (lastCaptured.length === 0) return undefined;
    const timer = window.setTimeout(() => setLastCaptured([]), 760);
    return () => window.clearTimeout(timer);
  }, [lastCaptured]);

  useEffect(() => {
    if (!burst) return undefined;
    const timer = window.setTimeout(() => setBurst(null), 780);
    return () => window.clearTimeout(timer);
  }, [burst]);

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
    setBurst(null);
    setScreenFx("reset");
    window.setTimeout(() => setScreenFx(""), 360);
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

  const isCapturedFlash = (row, col) => lastCaptured.some((unit) => unit.row === row && unit.col === col);
  const canHumanAct = !gameOver && !aiThinking && !(mode === "cpu" && currentPlayer === BLACK);
  const activeName = mode === "cpu" && currentPlayer === BLACK
    ? FACTIONS[BLACK].name + " CPU"
    : FACTIONS[currentPlayer].name;
  const nextMoveNumber = Math.min(moveCounts[currentPlayer] + 1, movesPerPlayer);

  return (
    <main className={"app intensity-" + intensity + (screenFx ? " screen-" + screenFx : "")}>
      <div className="ambient" aria-hidden="true">
        {AMBIENT.map((glyph, index) => (
          <i key={index} style={{ "--i": index }}>{glyph}</i>
        ))}
      </div>
      <div className="screen-flash" aria-hidden="true" />

      <header className="header">
        <div className="eyebrow">⚡ SHORT ATTENTION SPAN EDITION ⚡</div>
        <h1 className="title" data-text="FORTRESS">FORTRESS</h1>
        <div className="versus"><span>ﾈｺﾁｬﾝ</span><b>VS</b><span>ｼﾏｴﾅｶﾞ</span></div>
      </header>

      <section className="scorebar" aria-label="score">
        <div className="side-score cat-score">
          <span className="score-face">ฅ</span>
          <span><strong>ﾈｺﾁｬﾝ</strong><small>{territory.white} AREA · {moveCounts[WHITE]}/{movesPerPlayer}</small></span>
        </div>
        <div className="turn-chip">{gameOver ? "FINAL!!" : activeName + " " + nextMoveNumber + "/" + movesPerPlayer}</div>
        <div className="side-score bird-score">
          <span><strong>ｼﾏｴﾅｶﾞ</strong><small>{territory.black} AREA · {moveCounts[BLACK]}/{movesPerPlayer}</small></span>
          <span className="score-face">●</span>
        </div>
      </section>

      <section className="stim-meter" aria-label="match progress">
        <span>刺激</span>
        <div><i style={{ width: stimulation + "%" }} /></div>
        <strong>{stimulation}%</strong>
      </section>

      <section className="board-shell" aria-label="Fortress board">
        <div className="board">
          {board.map((row, rowIndex) => row.map((cell, colIndex) => {
            const key = rowIndex + ":" + colIndex;
            const moveType = legalMap.get(key);
            const legal = Boolean(moveType) && canHumanAct;
            const last = lastMove?.row === rowIndex && lastMove?.col === colIndex;
            const margin = cell.owner ? castleMargin(board, rowIndex, colIndex, influence) : null;
            const siege = cell.owner !== 0 && margin === 0;
            const captured = isCapturedFlash(rowIndex, colIndex);
            const cellBurst = burst?.row === rowIndex && burst?.col === colIndex ? burst : null;
            const label = cell.owner
              ? FACTIONS[cell.owner].name + " level " + cell.level + (siege ? ", under pressure" : "")
              : (control[rowIndex][colIndex] === WHITE ? "Cat controlled" : control[rowIndex][colIndex] === BLACK ? "Shimaenaga controlled" : "Neutral") + (moveType ? ", " + moveType : "");
            const delay = -(((rowIndex * 6 + colIndex) % 9) * 0.09) + "s";

            return (
              <button
                type="button"
                className={
                  "cell " +
                  (control[rowIndex][colIndex] === WHITE ? "control-white " : control[rowIndex][colIndex] === BLACK ? "control-black " : "") +
                  (legal ? "legal " : "") +
                  (last ? "last " : "") +
                  (captured ? "captured " : "")
                }
                key={key}
                onClick={() => handleCell(rowIndex, colIndex)}
                disabled={!legal}
                aria-label={label}
              >
                <span className="cell-shine" aria-hidden="true" />
                {cell.owner !== 0 ? (
                  <MascotIcon owner={cell.owner} level={cell.level} siege={showSiege && siege} delay={delay} />
                ) : control[rowIndex][colIndex] !== 0 ? (
                  <span className={"territory-mark " + (control[rowIndex][colIndex] === WHITE ? "white" : "black")}>{FACTIONS[control[rowIndex][colIndex]].glyph}</span>
                ) : legal ? (
                  <span className="tap-bait">＋</span>
                ) : null}
                {legal && moveType === "upgrade" ? <span className="upgrade-badge">UP!</span> : null}
                {showSiege && siege ? <span className="siege-badge">ﾔﾊﾞ</span> : null}
                {(influence[rowIndex][colIndex][0] > 0 || influence[rowIndex][colIndex][1] > 0) ? (
                  <span className="influence" aria-hidden="true">
                    <span className="w">{influence[rowIndex][colIndex][0] || ""}</span>
                    <span className="b">{influence[rowIndex][colIndex][1] || ""}</span>
                  </span>
                ) : null}
                {cellBurst ? <BurstFx key={cellBurst.id} type={cellBurst.type} /> : null}
              </button>
            );
          }))}
        </div>
      </section>

      <div className={"status " + (gameOver ? "result" : "")} aria-live="polite">
        {gameOver
          ? resultText(result, territory)
          : aiThinking
            ? "ｼﾏｴﾅｶﾞ CPU が超高速で考え中…"
            : notice || activeName + ": 光ってるマスを押せ!!"}
      </div>
      <div className="ticker" aria-hidden="true"><span>HOT</span>{TICKERS[tickerIndex]}</div>

      <section className="controls" aria-label="game controls">
        <div className="control">
          <label htmlFor="mode">MODE</label>
          <select id="mode" value={mode} onChange={(event) => changeMode(event.target.value)}>
            <option value="cpu">VS CPU</option>
            <option value="local">2 PLAYERS</option>
          </select>
        </div>

        {mode === "cpu" ? (
          <div className="control">
            <label htmlFor="opponent">CPU TYPE</label>
            <select id="opponent" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
              {Object.values(AI_PROFILES).map((profile) => (
                <option value={profile.id} key={profile.id}>{profile.name}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="control">
            <label htmlFor="siege">ﾔﾊﾞ表示</label>
            <select id="siege" value={showSiege ? "on" : "off"} onChange={(event) => setShowSiege(event.target.value === "on")}>
              <option value="on">ON</option>
              <option value="off">OFF</option>
            </select>
          </div>
        )}

        <div className="control">
          <label htmlFor="first">FIRST</label>
          <select id="first" value={firstPlayer} onChange={(event) => changeFirst(event.target.value)}>
            <option value={WHITE}>ﾈｺﾁｬﾝ{mode === "cpu" ? " / YOU" : ""}</option>
            <option value={BLACK}>ｼﾏｴﾅｶﾞ{mode === "cpu" ? " / CPU" : ""}</option>
          </select>
        </div>

        <div className="control">
          <label htmlFor="length">MOVES / PLAYER</label>
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
            ﾔﾊﾞ表示 {showSiege ? "ON" : "OFF"}
          </button>
        ) : null}
        <button type="button" className="control-button primary" onClick={() => resetGame()}>
          ✦ NEW GAME ✦
        </button>
        <button type="button" className="control-button" onClick={() => setShowRules((value) => !value)}>
          {showRules ? "RULES閉じる" : "3秒でRULES"}
        </button>
      </section>

      {showRules ? (
        <section className="rules">
          <h2>3秒でわかるRULES</h2>
          <p>6×6盤をﾈｺﾁｬﾝとｼﾏｴﾅｶﾞで取り合う。標準は各21手</p>
          <ul>
            <li>空きマスにLv.1を置く、または自分の子をLv.3まで強化</li>
            <li>自マス＋上下左右へ、Lvと同じだけパワーを飛ばす</li>
            <li>そのマスでパワーが大きい側の色になる。同点は中立</li>
            <li>敵色になった場所にいる子は消える</li>
            <li>敵色の空きマスへ突っ込む自爆配置もOK。消える瞬間まではパワーを出す</li>
            <li>双方の手数終了時に、取ったマスが多い側の勝ち</li>
          </ul>
          <p>マス下の青・ピンク数字が双方のパワー。「ﾔﾊﾞ」はその子のいるマスが同点状態</p>
          {mode === "cpu" ? <p>{AI_PROFILES[profileId].name}: {AI_PROFILES[profileId].description}</p> : null}
          <p className="note">見た目だけ限界まで騒がしくしたが、FORTRESSのルールエンジン自体は変更していない</p>
        </section>
      ) : null}
    </main>
  );
}
