import React from 'react';
import { CanActData, ChiOption } from '../../types';
import { useCountdown } from '../../hooks/useTimer';
import './ActionPanel.css';

interface ActionPanelProps {
  canAct: CanActData | null;
  onDiscard: () => void;
  onChi: (combination: [string, string]) => void;
  onPong: () => void;
  onKong: (tileId?: string, kongType?: string) => void;
  onWin: () => void;
  onPass: () => void;
  isMyTurn: boolean;
  selectedTileId: string | null;
  canSelfKong: boolean;
  kongTileId?: string;
}

export default function ActionPanel({
  canAct,
  onDiscard,
  onChi,
  onPong,
  onKong,
  onWin,
  onPass,
  isMyTurn,
  selectedTileId,
  canSelfKong,
  kongTileId,
}: ActionPanelProps) {
  const remaining = useCountdown(canAct?.deadline ?? null);
  const [chiPickerOpen, setChiPickerOpen] = React.useState(false);

  if (!isMyTurn && !canAct) return null;

  return (
    <div className="action-panel">
      {canAct && (
        <div className="action-panel__timer">
          <div
            className="action-panel__timer-bar"
            style={{ width: `${(remaining / 20) * 100}%` }}
          />
          <span className="action-panel__timer-num">{remaining}s</span>
        </div>
      )}

      <div className="action-panel__buttons">
        {isMyTurn && (
          <button
            className="action-btn action-btn--discard"
            onClick={onDiscard}
            disabled={!selectedTileId}
          >
            打牌
          </button>
        )}

        {canAct?.actions.includes('win') && (
          <button className="action-btn action-btn--win" onClick={onWin}>
            和牌 🀄
          </button>
        )}

        {canAct?.actions.includes('kong') && (
          <button className="action-btn action-btn--kong" onClick={() => onKong(undefined, 'open')}>
            杠
          </button>
        )}

        {canSelfKong && (
          <button className="action-btn action-btn--kong" onClick={() => onKong(kongTileId, 'closed')}>
            暗杠
          </button>
        )}

        {canAct?.actions.includes('pong') && (
          <button className="action-btn action-btn--pong" onClick={onPong}>
            碰
          </button>
        )}

        {canAct?.actions.includes('chi') && canAct.chiOptions && (
          <div className="action-panel__chi-wrapper">
            <button
              className="action-btn action-btn--chi"
              onClick={() => {
                if (canAct.chiOptions?.length === 1) {
                  onChi(canAct.chiOptions[0].combination);
                } else {
                  setChiPickerOpen(v => !v);
                }
              }}
            >
              吃
            </button>
            {chiPickerOpen && (
              <div className="action-panel__chi-picker">
                {canAct.chiOptions?.map((opt, i) => (
                  <button
                    key={i}
                    className="action-btn action-btn--chi-opt"
                    onClick={() => { setChiPickerOpen(false); onChi(opt.combination); }}
                  >
                    {opt.display}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {canAct?.actions.includes('pass') && (
          <button className="action-btn action-btn--pass" onClick={onPass}>
            过
          </button>
        )}
      </div>
    </div>
  );
}
