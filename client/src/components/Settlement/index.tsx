import React, { useState } from 'react';
import { SettlementData, GameState } from '../../types';
import TileComponent from '../TileComponent';
import { windLabel } from '../../utils/tiles';
import './Settlement.css';

interface SettlementProps {
  data: SettlementData;
  gameState: GameState;
  myPlayerId: string;
  onNext: () => void;
  onReady: () => void;
  readyCount: number;
}

export default function Settlement({
  data, gameState, myPlayerId, onNext, onReady, readyCount,
}: SettlementProps) {
  const [hasReady, setHasReady] = useState(false);
  const winner = data.winner ? gameState.players[data.winner] : null;
  const payer = data.payer ? gameState.players[data.payer] : null;
  const isGameOver = data.nextRound === null;

  return (
    <div className="settlement-overlay">
      <div className="settlement">
        <div className="settlement__header">
          {data.winner ? (
            <h2 className="settlement__title">🎉 {winner?.nickname} 和牌！</h2>
          ) : (
            <h2 className="settlement__title">流局</h2>
          )}
          {data.winType && (
            <p className="settlement__subtitle">
              {data.winType === 'self' ? '自摸' : `荣和（${payer?.nickname} 打出）`}
            </p>
          )}
        </div>

        {data.fanDetail && (
          <div className="settlement__fans">
            <h3>番型明细</h3>
            <div className="settlement__fan-list">
              {data.fanDetail.fans.map((f, i) => (
                <div key={i} className="settlement__fan-row">
                  <span>{f.name}</span>
                  <span className="settlement__fan-val">{f.value}番</span>
                </div>
              ))}
              {data.fanDetail.flowerBonus.length > 0 && (
                <>
                  <div className="settlement__sep" />
                  {data.fanDetail.flowerBonus.map((fb, i) => (
                    <div key={i} className="settlement__fan-row settlement__fan-row--flower">
                      <span>🌸 花牌</span>
                      <span className="settlement__fan-val">+{fb.bonus}番</span>
                    </div>
                  ))}
                </>
              )}
              <div className="settlement__sep" />
              <div className="settlement__fan-row settlement__fan-total">
                <span>合计</span>
                <span className="settlement__fan-val">{data.fanDetail.total}番</span>
              </div>
            </div>
          </div>
        )}

        <div className="settlement__scores">
          <h3>积分变化</h3>
          {Object.entries(data.scores)
            .sort(([a], [b]) => (data.scores[b].after - data.scores[a].after))
            .map(([pid, s]) => {
              const player = gameState.players[pid];
              return (
                <div key={pid} className={`settlement__score-row ${pid === myPlayerId ? 'settlement__score-row--me' : ''}`}>
                  <span className="settlement__score-name">
                    {player?.nickname}
                    {player?.position && <small> ({windLabel(player.position)})</small>}
                  </span>
                  <span className={`settlement__score-delta ${s.delta >= 0 ? 'pos' : 'neg'}`}>
                    {s.delta >= 0 ? '+' : ''}{s.delta}
                  </span>
                  <span className="settlement__score-after">{s.after}</span>
                </div>
              );
            })}
        </div>

        {isGameOver ? (
          <div className="settlement__footer">
            <p className="settlement__gameover">全场结束！共 {gameState.round.maxRounds} 局</p>
            <button className="settlement__btn" onClick={onNext}>确认</button>
          </div>
        ) : (
          <div className="settlement__footer">
            <p className="settlement__next-info">
              下一局：{data.nextRound && windLabel(data.nextRound.wind)}风圈 第{data.nextRound?.roundIndex}局
              （全场第{data.nextRound?.totalRound}/{data.nextRound?.maxRounds}局）
            </p>
            <button
              className={`settlement__btn ${hasReady ? 'settlement__btn--ready' : ''}`}
              onClick={() => { if (!hasReady) { setHasReady(true); onReady(); } }}
              disabled={hasReady}
            >
              {hasReady ? '已准备' : '准备下一局'}
            </button>
            <p className="settlement__ready-count">{readyCount} / 4 已准备</p>
          </div>
        )}
      </div>
    </div>
  );
}
