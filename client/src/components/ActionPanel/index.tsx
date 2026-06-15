import { CanActData } from '../../types';
import { useCountdown } from '../../hooks/useTimer';
import './ActionPanel.css';

interface ActionPanelProps {
  canAct: CanActData | null;
  onChi: (combination: [string, string]) => void;
  onChiOpen: () => void;
  onPong: () => void;
  onKong: (tileId?: string, kongType?: string) => void;
  onWin: () => void;
  onPass: () => void;
  isMyTurn: boolean;
  canSelfKong: boolean;
  kongTileId?: string;
  canAddedKong?: boolean;
  addedKongTileId?: string;
}

export default function ActionPanel({
  canAct,
  onChi,
  onChiOpen,
  onPong,
  onKong,
  onWin,
  onPass,
  isMyTurn,
  canSelfKong,
  kongTileId,
  canAddedKong,
  addedKongTileId,
}: ActionPanelProps) {
  const remaining = useCountdown(canAct?.timeoutAt ?? null);

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
        {isMyTurn && <span className="action-panel__hint">点击手牌出牌</span>}

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

        {canAddedKong && (
          <button className="action-btn action-btn--kong" onClick={() => onKong(addedKongTileId, 'added')}>
            加杠
          </button>
        )}

        {canAct?.actions.includes('pong') && (
          <button className="action-btn action-btn--pong" onClick={onPong}>
            碰
          </button>
        )}

        {canAct?.actions.includes('chi') && canAct.chiOptions && (
          <button
            className="action-btn action-btn--chi"
            onClick={() => {
              if (canAct.chiOptions!.length === 1) {
                onChi(canAct.chiOptions![0].combination);
              } else {
                onChiOpen();
              }
            }}
          >
            吃
          </button>
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
