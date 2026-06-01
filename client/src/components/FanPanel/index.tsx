import React from 'react';
import { FanResult } from '../../types';
import './FanPanel.css';

interface FanPanelProps {
  fanResult: FanResult | null;
  onWin?: () => void;
  onContinue?: () => void;
  showActions?: boolean;
}

export default function FanPanel({ fanResult, onWin, onContinue, showActions }: FanPanelProps) {
  if (!fanResult) return null;

  return (
    <div className="fan-panel">
      <div className="fan-panel__header">
        <span className="fan-panel__total">{fanResult.total} 番</span>
        {fanResult.winType === 'self' && <span className="fan-panel__badge">自摸可和！</span>}
      </div>

      <div className="fan-panel__list">
        {fanResult.fans.map((f, i) => (
          <div key={i} className="fan-panel__item">
            <span className="fan-panel__name">{f.name}</span>
            <span className="fan-panel__value">{f.value}番</span>
          </div>
        ))}

        {fanResult.flowerBonus.length > 0 && (
          <>
            <div className="fan-panel__divider" />
            {fanResult.flowerBonus.map((fb, i) => (
              <div key={i} className="fan-panel__item fan-panel__item--flower">
                <span className="fan-panel__name">🌸 花牌</span>
                <span className="fan-panel__value">+{fb.bonus}番</span>
              </div>
            ))}
          </>
        )}
      </div>

      {showActions && (
        <div className="fan-panel__actions">
          <button className="fan-btn fan-btn--win" onClick={onWin}>和牌</button>
          <button className="fan-btn fan-btn--continue" onClick={onContinue}>继续打牌</button>
        </div>
      )}
    </div>
  );
}
