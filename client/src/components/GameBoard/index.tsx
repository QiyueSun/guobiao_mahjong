import React, { useCallback } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import TileComponent from '../TileComponent';
import DiscardPile from '../DiscardPile';
import ActionPanel from '../ActionPanel';
import FanPanel from '../FanPanel';
import Settlement from '../Settlement';
import { Tile, PlayerState, Wind } from '../../types';
import { windLabel, sortTiles } from '../../utils/tiles';
import './GameBoard.css';

export default function GameBoard() {
  const {
    gameState, myHand, playerId, selectedTileId, canActData,
    fanHint, settlement, roomState, selectTile, clearSettlement,
  } = useGameStore();
  const { emit, emitRaw } = useWebSocket();

  if (!gameState) {
    return <div className="board-loading">加载游戏状态…</div>;
  }

  const myPlayer = playerId ? gameState.players[playerId] : null;
  const isMyTurn = gameState.currentTurn === playerId && gameState.phase === 'player_turn';
  const isHost = roomState?.hostId === playerId;

  // Get relative player positions: I'm at bottom, others arranged around
  const myIdx = gameState.playerOrder.indexOf(playerId ?? '');
  const getPlayer = (offset: number): PlayerState | null => {
    const idx = (myIdx + offset + 4) % 4;
    const pid = gameState.playerOrder[idx];
    return pid ? gameState.players[pid] : null;
  };

  const leftPlayer = getPlayer(1);   // West seat relative to me
  const topPlayer = getPlayer(2);    // North (opposite)
  const rightPlayer = getPlayer(3);  // East relative to me

  const lastDiscarderId = gameState.lastDiscard?.playerId;

  const handleTileClick = (tileId: string) => {
    selectTile(selectedTileId === tileId ? null : tileId);
  };

  const handleTileDoubleClick = (tileId: string) => {
    if (!isMyTurn) return;
    selectTile(tileId);
    emit('game:discard', { tileId });
    selectTile(null);
  };

  const handleDiscard = () => {
    if (!selectedTileId) return;
    emit('game:discard', { tileId: selectedTileId });
    selectTile(null);
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

  // Check if player can self-kong
  const selfKongTile = myHand ? findSelfKongTile(myHand, myPlayer?.melds ?? []) : null;

  return (
    <div className="board">
      {/* Settlement overlay */}
      {settlement && gameState && playerId && (
        <Settlement
          data={settlement}
          gameState={gameState}
          myPlayerId={playerId}
          onNext={clearSettlement}
          onHostNext={() => { emitRaw('room:next'); clearSettlement(); }}
          isHost={isHost}
        />
      )}

      {/* Top player (opposite) */}
      <div className="board__player board__player--top">
        <PlayerArea
          player={topPlayer}
          isActive={gameState.currentTurn === topPlayer?.id}
          isLastDiscarder={topPlayer?.id === lastDiscarderId}
          showHandBack
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
            vertical
          />
        </div>

        {/* Center info */}
        <div className="board__center">
          <div className="board__center-info">
            <div className="board__wind">{windLabel(gameState.round.wind)}风圈</div>
            <div className="board__round">第 {gameState.round.roundIndex} 局</div>
            <div className="board__total">全场 {gameState.round.totalRound} / 16</div>
            <div className="board__remaining">剩余 {gameState.wall.remaining} 张</div>
            {gameState.isLastTile && <div className="board__last-tile">🔔 海底</div>}
          </div>

          {/* Discard areas */}
          <div className="board__discards">
            {topPlayer && (
              <div className="board__discard-area board__discard-area--top">
                <DiscardPile tiles={topPlayer.discards} lastHighlight={topPlayer.id === lastDiscarderId} />
              </div>
            )}
            <div className="board__discard-center">
              {leftPlayer && (
                <DiscardPile tiles={leftPlayer.discards} lastHighlight={leftPlayer.id === lastDiscarderId} />
              )}
              {rightPlayer && (
                <DiscardPile tiles={rightPlayer.discards} lastHighlight={rightPlayer.id === lastDiscarderId} />
              )}
            </div>
            {myPlayer && (
              <div className="board__discard-area board__discard-area--bottom">
                <DiscardPile tiles={myPlayer.discards} lastHighlight={false} />
              </div>
            )}
          </div>
        </div>

        {/* Right player */}
        <div className="board__player board__player--right">
          <PlayerArea
            player={rightPlayer}
            isActive={gameState.currentTurn === rightPlayer?.id}
            isLastDiscarder={rightPlayer?.id === lastDiscarderId}
            showHandBack
            vertical
          />
        </div>
      </div>

      {/* My area (bottom) */}
      <div className="board__my-area">
        {/* Melds */}
        {myPlayer && myPlayer.melds.length > 0 && (
          <div className="board__my-melds">
            {myPlayer.melds.map((meld, i) => (
              <div key={i} className="board__meld">
                {meld.tiles.map(tile => (
                  <TileComponent key={tile.id} tile={tile} size="sm" />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Flowers */}
        {myPlayer && myPlayer.flowers.length > 0 && (
          <div className="board__my-flowers">
            {myPlayer.flowers.map(tile => (
              <TileComponent key={tile.id} tile={tile} size="sm" />
            ))}
          </div>
        )}

        {/* Hand */}
        <div className="board__my-hand">
          {sortTiles(myHand).map((tile, i) => (
            <TileComponent
              key={tile.id}
              tile={tile}
              size="lg"
              selected={tile.id === selectedTileId}
              onClick={() => handleTileClick(tile.id)}
              onDoubleClick={() => handleTileDoubleClick(tile.id)}
              newest={i === myHand.length - 1 && isMyTurn}
            />
          ))}
        </div>

        {/* Bottom controls */}
        <div className="board__controls">
          <ActionPanel
            canAct={canActData}
            onDiscard={handleDiscard}
            onChi={handleChi}
            onPong={handlePong}
            onKong={handleKong}
            onWin={handleWin}
            onPass={handlePass}
            isMyTurn={isMyTurn}
            selectedTileId={selectedTileId}
            canSelfKong={!!selfKongTile && isMyTurn}
            kongTileId={selfKongTile?.id}
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

        {/* My info bar */}
        {myPlayer && (
          <div className="board__my-info">
            <span className="board__my-name">{myPlayer.nickname}</span>
            <span className="board__my-wind">{windLabel(myPlayer.position)}</span>
            <span className="board__my-score">{myPlayer.score}分</span>
            {myPlayer.isDealer && <span className="board__dealer-badge">庄</span>}
            {isMyTurn && <span className="board__my-turn">你的回合</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Player area component ─────────────────────────────────────────────────────

interface PlayerAreaProps {
  player: PlayerState | null;
  isActive: boolean;
  isLastDiscarder: boolean;
  showHandBack?: boolean;
  vertical?: boolean;
}

function PlayerArea({ player, isActive, isLastDiscarder, showHandBack, vertical }: PlayerAreaProps) {
  if (!player) return <div className="player-area player-area--empty" />;

  return (
    <div className={`player-area ${isActive ? 'player-area--active' : ''}`}>
      <div className="player-area__info">
        <span className="player-area__name">{player.nickname}</span>
        <span className="player-area__wind">{windLabel(player.position)}</span>
        <span className="player-area__score">{player.score}</span>
        {player.isDealer && <span className="player-area__dealer">庄</span>}
        {player.isAI && <span className="player-area__ai">AI</span>}
        {!player.isConnected && <span className="player-area__dc">断线</span>}
      </div>

      {showHandBack && (
        <div className={`player-area__hand ${vertical ? 'player-area__hand--vertical' : ''}`}>
          {Array.from({ length: player.handCount }).map((_, i) => (
            <TileComponent key={i} tile={{ id: `back-${i}`, suit: 'man', value: 1 }} size="sm" faceDown />
          ))}
        </div>
      )}

      {/* Melds */}
      {player.melds.length > 0 && (
        <div className="player-area__melds">
          {player.melds.map((meld, i) => (
            <div key={i} className="board__meld">
              {meld.tiles.map(tile => (
                <TileComponent key={tile.id} tile={tile} size="sm" />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Flowers */}
      {player.flowers.length > 0 && (
        <div className="player-area__flowers">
          {player.flowers.map(tile => (
            <TileComponent key={tile.id} tile={tile} size="sm" />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function findSelfKongTile(hand: Tile[], melds: import('../../types').Meld[]): Tile | null {
  // Check for 4-of-a-kind in hand
  const counts = new Map<string, Tile[]>();
  for (const t of hand) {
    const k = `${t.suit}:${t.value}`;
    if (!counts.has(k)) counts.set(k, []);
    counts.get(k)!.push(t);
  }
  for (const tiles of counts.values()) {
    if (tiles.length >= 4) return tiles[0];
  }
  // Check for tile matching an existing pong
  for (const meld of melds) {
    if (meld.type === 'pong') {
      const t = hand.find(h => h.suit === meld.tiles[0].suit && h.value === meld.tiles[0].value);
      if (t) return t;
    }
  }
  return null;
}
