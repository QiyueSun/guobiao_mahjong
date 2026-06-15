import React, { useState, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useCountdown } from '../../hooks/useTimer';
import TileComponent from '../TileComponent';
import DiscardPile from '../DiscardPile';
import ActionPanel from '../ActionPanel';
import FanPanel from '../FanPanel';
import Settlement from '../Settlement';
import { Tile, PlayerState, Wind, Meld, ChiOption, TenpaiTileInfo } from '../../types';
import { windLabel, sortTiles, tileLabel } from '../../utils/tiles';
import './GameBoard.css';

export default function GameBoard() {
  const {
    gameState, myHand, pendingDraw, playerId, selectedTileId, canActData,
    fanHint, tenpaiInfo, settlement, roomState, turnTimer, nextReadyCount, selectTile, clearSettlement,
    setTenpaiInfo,
  } = useGameStore();
  const { emit, emitRaw } = useWebSocket();
  const [showTenpaiPanel, setShowTenpaiPanel] = useState(false);
  const [hoveredTileKey, setHoveredTileKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('mj_sound_enabled') !== 'false');

  useEffect(() => {
    localStorage.setItem('mj_sound_enabled', String(soundEnabled));
  }, [soundEnabled]);

  if (!gameState) {
    return <div className="board-loading">加载游戏状态…</div>;
  }

  const myPlayer = playerId ? gameState.players[playerId] : null;
  const isMyTurn = gameState.currentTurn === playerId && gameState.phase === 'player_turn';
  const isHost = roomState?.hostId === playerId;

  const myIdx = gameState.playerOrder.indexOf(playerId ?? '');
  const getPlayer = (offset: number): PlayerState | null => {
    const idx = (myIdx + offset + 4) % 4;
    const pid = gameState.playerOrder[idx];
    return pid ? gameState.players[pid] : null;
  };

  // Counter-clockwise: South is to the right, North is to the left
  const rightPlayer = getPlayer(1);
  const topPlayer = getPlayer(2);
  const leftPlayer = getPlayer(3);

  const lastDiscarderId = gameState.lastDiscard?.playerId;

  const handleTileClick = (tileId: string) => {
    if (!isMyTurn) return;
    emit('game:discard', { tileId });
  };

  const handleChi = (combination: [string, string]) => {
    const tile = gameState.lastDiscard?.tile;
    if (!tile) return;
    emit('game:chi', { tileId: tile.id, combination });
  };

  const handlePong = () => emit('game:pong');

  const handleKong = (tileId?: string, kongType?: string) => {
    emit('game:kong', { tileId: tileId ?? selectedTileId, type: kongType ?? 'open' });
  };

  const handleWin = () => emit('game:win');
  const handlePass = () => emit('game:pass');
  const handleExtendTimer = () => emit('game:extend_timer');

  const drawnTileId = pendingDraw?.tile?.id ?? null;
  const drawnTile = drawnTileId ? myHand.find(t => t.id === drawnTileId) ?? null : null;
  const sortedHandTiles = sortTiles(drawnTileId ? myHand.filter(t => t.id !== drawnTileId) : myHand);

  const selfKongTile = myHand ? findClosedKongTile(myHand) : null;
  const addedKongTile = myHand ? findAddedKongTile(myHand, myPlayer?.melds ?? []) : null;

  const [chiPickerOpen, setChiPickerOpen] = useState(false);
  useEffect(() => {
    if (!canActData?.actions.includes('chi')) setChiPickerOpen(false);
  }, [canActData]);

  // Close tenpai panel when we draw a tile (tenpaiInfo cleared by store)
  useEffect(() => {
    if (tenpaiInfo === null) setShowTenpaiPanel(false);
  }, [tenpaiInfo]);

  const handleTenpaiButtonClick = () => {
    emit('game:requestTenpaiInfo');
    setShowTenpaiPanel(true);
  };

  const showTenpaiButton = !!(myPlayer?.isTenpai && !isMyTurn && gameState.phase !== 'settled');

  return (
    <div className="board">
      {/* Settings — fixed button in the upper-right corner */}
      <button
        className="board__settings-btn"
        onClick={() => setSettingsOpen((v) => !v)}
        aria-label="设置"
      >
        ⚙
      </button>
      {settingsOpen && (
        <div className="board__settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="board__settings-panel" onClick={(e) => e.stopPropagation()}>
            <div className="board__settings-title">设置</div>
            <div className="board__settings-row">
              <span className="board__settings-label">音效</span>
              <button
                className={`board__settings-toggle ${soundEnabled ? 'board__settings-toggle--on' : ''}`}
                onClick={() => setSoundEnabled((v) => !v)}
              >
                {soundEnabled ? '开' : '关'}
              </button>
            </div>
            <button className="board__settings-extend" onClick={handleExtendTimer}>
              ⏱ 思考时间 +10 秒
            </button>
          </div>
        </div>
      )}

      {settlement && gameState && playerId && (
        <Settlement
          data={settlement}
          gameState={gameState}
          myPlayerId={playerId}
          onNext={clearSettlement}
          onReady={() => emitRaw('room:next_ready')}
          readyCount={nextReadyCount}
        />
      )}

      {/* Chi picker — fixed overlay so hand tiles remain visible */}
      {chiPickerOpen && canActData?.chiOptions && myHand && gameState.lastDiscard && (
        <div className="board__chi-overlay">
          <ChiPicker
            options={canActData.chiOptions}
            hand={myHand}
            discardTile={gameState.lastDiscard.tile}
            onSelect={(combo) => { setChiPickerOpen(false); handleChi(combo); }}
            onClose={() => setChiPickerOpen(false)}
          />
        </div>
      )}

      {/* Action controls — fixed, floating above the hand area */}
      <div className="board__controls">
        <ActionPanel
          canAct={canActData}
          onChi={handleChi}
          onChiOpen={() => setChiPickerOpen(true)}
          onPong={handlePong}
          onKong={handleKong}
          onWin={handleWin}
          onPass={handlePass}
          isMyTurn={isMyTurn}
          canSelfKong={!!selfKongTile && isMyTurn}
          kongTileId={selfKongTile?.id}
          canAddedKong={!!addedKongTile && isMyTurn}
          addedKongTileId={addedKongTile?.id}
        />
        {fanHint && (
          <FanPanel
            fanResult={fanHint}
            showActions={isMyTurn && fanHint !== null}
            onWin={handleWin}
            onContinue={() => useGameStore.getState().setFanHint(null)}
          />
        )}
      </div>

      {/* Floating turn timers for opponents — overlay, no layout impact */}
      {turnTimer && turnTimer.playerId !== playerId && (
        <>
          {turnTimer.playerId === topPlayer?.id && (
            <div className="board__floating-timer board__floating-timer--top">
              <TurnCountdown timeoutAt={turnTimer.timeoutAt} />
            </div>
          )}
          {turnTimer.playerId === leftPlayer?.id && (
            <div className="board__floating-timer board__floating-timer--left">
              <TurnCountdown timeoutAt={turnTimer.timeoutAt} />
            </div>
          )}
          {turnTimer.playerId === rightPlayer?.id && (
            <div className="board__floating-timer board__floating-timer--right">
              <TurnCountdown timeoutAt={turnTimer.timeoutAt} />
            </div>
          )}
        </>
      )}

      {/* Top player */}
      <div className="board__player board__player--top">
        <PlayerArea
          player={topPlayer}
          isActive={gameState.currentTurn === topPlayer?.id}
          isLastDiscarder={topPlayer?.id === lastDiscarderId}
          showHandBack
          position="top"
          hoveredTileKey={hoveredTileKey}
        />
      </div>

      {/* Middle row */}
      <div className="board__middle">
        {/* Left player */}
        <div className="board__player board__player--left">
          <PlayerArea
            player={leftPlayer}
            isActive={gameState.currentTurn === leftPlayer?.id}
            isLastDiscarder={leftPlayer?.id === lastDiscarderId}
            showHandBack
            position="left"
            hoveredTileKey={hoveredTileKey}
          />
        </div>

        {/* Center — 3×3 grid: 4 discard piles + round info in the middle */}
        <div className="board__center">
          <div className="board__discard-top">
            {topPlayer && <DiscardPile tiles={topPlayer.discards} lastHighlight={topPlayer.id === lastDiscarderId} tilesPerRow={6} hoveredTileKey={hoveredTileKey} />}
          </div>
          <div className="board__discard-left">
            <SideDiscardPile
              tiles={leftPlayer?.discards ?? []}
              direction="left"
              lastHighlight={leftPlayer?.id === lastDiscarderId}
              hoveredTileKey={hoveredTileKey}
            />
          </div>
          <div className="board__center-info">
            <div className="board__wind">{windLabel(gameState.round.wind)}风圈</div>
            <div className="board__round">第 {gameState.round.roundIndex} 局</div>
            <div className="board__total">全场 {gameState.round.totalRound} / {gameState.round.maxRounds}</div>
            <div className="board__remaining">剩余 {gameState.wall.remaining} 张</div>
            {gameState.isLastTile && <div className="board__last-tile">🔔 海底</div>}
          </div>
          <div className="board__discard-right">
            <SideDiscardPile
              tiles={rightPlayer?.discards ?? []}
              direction="right"
              lastHighlight={rightPlayer?.id === lastDiscarderId}
              hoveredTileKey={hoveredTileKey}
            />
          </div>
          <div className="board__discard-bot">
            {myPlayer && <DiscardPile tiles={myPlayer.discards} lastHighlight={false} tilesPerRow={6} hoveredTileKey={hoveredTileKey} />}
          </div>
        </div>

        {/* Right player */}
        <div className="board__player board__player--right">
          <PlayerArea
            player={rightPlayer}
            isActive={gameState.currentTurn === rightPlayer?.id}
            isLastDiscarder={rightPlayer?.id === lastDiscarderId}
            showHandBack
            position="right"
            hoveredTileKey={hoveredTileKey}
          />
        </div>
      </div>

      {/* My area (bottom) */}
      <div className="board__my-area">
        <div className="board__my-hand-row">
          {/* Melds + flowers to the left of hand, aligned to bottom edge */}
          {myPlayer && (myPlayer.melds.length > 0 || myPlayer.flowers.length > 0) && (
            <div className="board__my-melds">
              {myPlayer.melds.map((meld, i) => (
                <MeldGroup key={i} meld={meld} hoveredTileKey={hoveredTileKey} />
              ))}
              {myPlayer.flowers.map(tile => (
                <TileComponent
                  key={tile.id}
                  tile={tile}
                  size="sm"
                  highlighted={hoveredTileKey != null && `${tile.suit}:${tile.value}` === hoveredTileKey}
                />
              ))}
            </div>
          )}

          {/* Hand */}
          <div className="board__my-hand">
            {sortedHandTiles.map((tile) => (
              <TileComponent
                key={tile.id}
                tile={tile}
                size="lg"
                onClick={() => handleTileClick(tile.id)}
                onMouseEnter={() => setHoveredTileKey(`${tile.suit}:${tile.value}`)}
                onMouseLeave={() => setHoveredTileKey(null)}
              />
            ))}
            {drawnTile && (
              <>
                <div className="board__hand-separator" />
                <TileComponent
                  tile={drawnTile}
                  size="lg"
                  onClick={() => handleTileClick(drawnTile.id)}
                  onMouseEnter={() => setHoveredTileKey(`${drawnTile.suit}:${drawnTile.value}`)}
                  onMouseLeave={() => setHoveredTileKey(null)}
                  newest
                />
              </>
            )}
          </div>
        </div>

        {myPlayer && (
          <div className="board__my-info">
            <span className="board__my-name">{myPlayer.nickname}</span>
            <span className="board__my-wind">{windLabel(myPlayer.position)}</span>
            <span className="board__my-score">{myPlayer.score}分</span>
            {myPlayer.isDealer && <span className="board__dealer-badge">庄</span>}
            {isMyTurn && <span className="board__my-turn">你的回合</span>}
          </div>
        )}

        {/* Prominent turn timer — lower-left corner */}
        {turnTimer?.playerId === playerId && (
          <div className="board__my-turn-timer">
            <TurnCountdown timeoutAt={turnTimer.timeoutAt} />
          </div>
        )}

        {/* Tenpai "!" button — lower-right corner */}
        {showTenpaiButton && (
          <button
            className="board__tenpai-btn"
            onClick={handleTenpaiButtonClick}
            title="听牌分析"
          >
            !
          </button>
        )}
      </div>

      {/* Tenpai info panel overlay */}
      {showTenpaiPanel && (
        <div className="board__tenpai-overlay" onClick={() => setShowTenpaiPanel(false)}>
          <div className="tenpai-panel" onClick={e => e.stopPropagation()}>
            <div className="tenpai-panel__header">
              <span className="tenpai-panel__title">听牌分析</span>
              <button
                className="tenpai-panel__close"
                onClick={() => setShowTenpaiPanel(false)}
              >
                ✕
              </button>
            </div>
            {tenpaiInfo === null ? (
              <div className="tenpai-panel__loading">计算中…</div>
            ) : tenpaiInfo.length === 0 ? (
              <div className="tenpai-panel__empty">当前无听牌</div>
            ) : (
              <TenpaiInfoList tiles={tenpaiInfo} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Side discard pile (left / right players) ─────────────────────────────────

function SideDiscardPile({ tiles, direction, lastHighlight, tilesPerCol = 6, hoveredTileKey }: {
  tiles: Tile[];
  direction: 'left' | 'right';
  lastHighlight?: boolean;
  tilesPerCol?: number;
  hoveredTileKey?: string | null;
}) {
  const cols: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += tilesPerCol) {
    cols.push(tiles.slice(i, i + tilesPerCol));
  }
  return (
    <div className={`side-discard side-discard--${direction}`}>
      {cols.map((col, ci) => (
        <div key={ci} className="side-discard__col">
          {col.map((tile, ti) => (
            <TileComponent
              key={tile.id}
              tile={tile}
              size="sm"
              horizontal
              newest={lastHighlight && ci === cols.length - 1 && ti === col.length - 1}
              highlighted={hoveredTileKey != null && `${tile.suit}:${tile.value}` === hoveredTileKey}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Chi picker ────────────────────────────────────────────────────────────────

interface ChiPickerProps {
  options: ChiOption[];
  hand: Tile[];
  discardTile: Tile;
  onSelect: (combo: [string, string]) => void;
  onClose: () => void;
}

function ChiPicker({ options, hand, discardTile, onSelect, onClose }: ChiPickerProps) {
  return (
    <div className="board__chi-picker">
      <span className="board__chi-picker-label">选择吃牌组合：</span>
      <div className="board__chi-picker-options">
        {options.map((opt, i) => {
          const t1 = hand.find(t => t.id === opt.combination[0]);
          const t2 = hand.find(t => t.id === opt.combination[1]);
          const tiles: Tile[] = [t1, t2, discardTile].filter(Boolean) as Tile[];
          tiles.sort((a, b) => a.value - b.value);
          return (
            <button key={i} className="board__chi-option" onClick={() => onSelect(opt.combination)}>
              {tiles.map((tile, j) => (
                <TileComponent
                  key={j}
                  tile={tile}
                  size="md"
                  newest={tile.id === discardTile.id}
                />
              ))}
            </button>
          );
        })}
      </div>
      <button className="board__chi-cancel" onClick={onClose}>取消</button>
    </div>
  );
}

// ── Turn countdown ────────────────────────────────────────────────────────────

function TurnCountdown({ timeoutAt }: { timeoutAt: number }) {
  const remaining = useCountdown(timeoutAt);
  const urgent = remaining <= 5;
  return (
    <span className={`turn-countdown ${urgent ? 'turn-countdown--urgent' : ''}`}>
      {remaining}s
    </span>
  );
}

// ── Meld group ────────────────────────────────────────────────────────────────

function MeldGroup({ meld, position, hoveredTileKey }: { meld: Meld; position?: 'top' | 'left' | 'right'; hoveredTileKey?: string | null }) {
  const isHighlighted = (tile: Tile) => hoveredTileKey != null && `${tile.suit}:${tile.value}` === hoveredTileKey;

  // For left/right players all tiles are horizontal, stacked in a column
  if (position === 'left' || position === 'right') {
    return (
      <div className="board__meld board__meld--col">
        {meld.tiles.map((tile) => (
          <TileComponent key={tile.id} tile={tile} size="sm" horizontal highlighted={isHighlighted(tile)} />
        ))}
      </div>
    );
  }

  const rotateClass = position ? `board__meld--rotate-${position}` : '';
  return (
    <div className={`board__meld ${rotateClass}`}>
      {meld.tiles.map((tile, i) => {
        const isClaimed =
          meld.type !== 'kong_closed' &&
          ((meld.claimedFrom === 'left' && i === 0) ||
           (meld.claimedFrom === 'right' && i === meld.tiles.length - 1) ||
           (meld.claimedFrom === 'opposite' && i === Math.floor(meld.tiles.length / 2)));
        return (
          <TileComponent key={tile.id} tile={tile} size="sm" horizontal={isClaimed} highlighted={isHighlighted(tile)} />
        );
      })}
    </div>
  );
}

// ── Player area ───────────────────────────────────────────────────────────────

interface PlayerAreaProps {
  player: PlayerState | null;
  isActive: boolean;
  isLastDiscarder: boolean;
  showHandBack?: boolean;
  position: 'top' | 'left' | 'right';
  hoveredTileKey?: string | null;
}

function PlayerArea({ player, isActive, isLastDiscarder, showHandBack, position, hoveredTileKey }: PlayerAreaProps) {
  if (!player) return <div className="player-area player-area--empty" />;

  const vertical = position === 'left' || position === 'right';

  const infoEl = (
    <div className="player-area__info">
      <span className="player-area__name">{player.nickname}</span>
      <span className="player-area__wind">{windLabel(player.position)}</span>
      <span className="player-area__score">{player.score}</span>
      {player.isDealer && <span className="player-area__dealer">庄</span>}
      {player.isAI && <span className="player-area__ai">AI</span>}
      {!player.isConnected && <span className="player-area__dc">断线</span>}
    </div>
  );

  const handEl = showHandBack ? (
    <div className={`player-area__hand ${vertical ? 'player-area__hand--col' : ''}`}>
      {Array.from({ length: player.handCount }).map((_, i) => (
        <TileComponent key={i} tile={{ id: `back-${i}`, suit: 'man', value: 1 }} size="sm" faceDown horizontal={vertical} />
      ))}
    </div>
  ) : null;

  // For left/right: melds and flowers share the same column, tiles are horizontal
  if (position === 'left' || position === 'right') {
    const hasMelds = player.melds.length > 0 || player.flowers.length > 0;
    const meldsAndFlowers = hasMelds ? (
      <div className="player-area__melds-col">
        {player.melds.map((meld, i) => (
          <MeldGroup key={i} meld={meld} position={position} hoveredTileKey={hoveredTileKey} />
        ))}
        {player.flowers.map(tile => (
          <TileComponent
            key={tile.id}
            tile={tile}
            size="sm"
            horizontal
            highlighted={hoveredTileKey != null && `${tile.suit}:${tile.value}` === hoveredTileKey}
          />
        ))}
      </div>
    ) : null;

    // left player: hand at top, melds below (player's right = screen-bottom = towards center)
    // right player: melds at top (towards center), hand below
    return (
      <div className={`player-area ${isActive ? 'player-area--active' : ''} player-area--${position}`}>
        {infoEl}
        <div className="player-area__tiles-col">
          {position === 'right' && meldsAndFlowers}
          {position === 'right' && hasMelds && <div className="player-area__meld-sep" />}
          {handEl}
          {position === 'left' && hasMelds && <div className="player-area__meld-sep" />}
          {position === 'left' && meldsAndFlowers}
        </div>
      </div>
    );
  }

  // top player: melds beside hand horizontally
  const meldsEl = player.melds.length > 0 ? (
    <div className="player-area__melds">
      {player.melds.map((meld, i) => (
        <MeldGroup key={i} meld={meld} position={position} hoveredTileKey={hoveredTileKey} />
      ))}
    </div>
  ) : null;
  const flowersEl = player.flowers.length > 0 ? (
    <div className="player-area__flowers">
      {player.flowers.map(tile => (
        <div key={tile.id} className="board__meld board__meld--rotate-top">
          <TileComponent
            tile={tile}
            size="sm"
            highlighted={hoveredTileKey != null && `${tile.suit}:${tile.value}` === hoveredTileKey}
          />
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div className={`player-area ${isActive ? 'player-area--active' : ''} player-area--top`}>
      {infoEl}
      <div className="player-area__top-body">
        {handEl}
        {meldsEl}
        {flowersEl}
      </div>
    </div>
  );
}

// ── Tenpai info list ──────────────────────────────────────────────────────────

function TenpaiInfoList({ tiles }: { tiles: TenpaiTileInfo[] }) {
  const sorted = [...tiles].sort((a, b) => b.fanTotal - a.fanTotal);
  return (
    <div className="tenpai-panel__list">
      {sorted.map((info, i) => {
        const canWin = info.fanTotal >= 8;
        return (
          <div key={i} className={`tenpai-panel__row ${canWin ? '' : 'tenpai-panel__row--weak'}`}>
            <div className="tenpai-panel__tile">
              <TileComponent tile={info.tile} size="sm" />
              <span className="tenpai-panel__tile-label">{tileLabel(info.tile)}</span>
            </div>
            <div className="tenpai-panel__fan">
              {canWin
                ? <span className="tenpai-panel__fan-ok">{info.fanTotal}番</span>
                : <span className="tenpai-panel__fan-low">不足8番</span>
              }
            </div>
            <div className={`tenpai-panel__remaining tenpai-panel__remaining--${info.remaining === 0 ? 'dead' : info.remaining === 1 ? 'low' : 'ok'}`}>
              剩{info.remaining}张
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function findClosedKongTile(hand: Tile[]): Tile | null {
  const counts = new Map<string, Tile[]>();
  for (const t of hand) {
    const k = `${t.suit}:${t.value}`;
    if (!counts.has(k)) counts.set(k, []);
    counts.get(k)!.push(t);
  }
  for (const tiles of counts.values()) {
    if (tiles.length >= 4) return tiles[0];
  }
  return null;
}

function findAddedKongTile(hand: Tile[], melds: Meld[]): Tile | null {
  for (const meld of melds) {
    if (meld.type === 'pong') {
      const t = hand.find(h => h.suit === meld.tiles[0].suit && h.value === meld.tiles[0].value);
      if (t) return t;
    }
  }
  return null;
}
