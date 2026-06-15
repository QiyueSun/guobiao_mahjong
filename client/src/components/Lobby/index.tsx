import React, { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { GameHistoryEntry } from '../../types';
import './Lobby.css';

const ROUND_OPTIONS = [4, 8, 16];
const TIMEOUT_OPTIONS = [30, 60, 90];
const BOT_OPTIONS = [0, 1, 2, 3];

export default function Lobby() {
  const { roomState, playerId, authUser, setAuthUser } = useGameStore();
  const { emitRaw } = useWebSocket();
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [totalRounds, setTotalRounds] = useState(16);
  const [actionTimeoutSeconds, setActionTimeoutSeconds] = useState(30);
  const [botCount, setBotCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<GameHistoryEntry[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const effectiveNickname = authUser ? (authUser.name ?? authUser.email ?? '玩家') : nickname;

  const handleCreate = () => {
    if (!effectiveNickname.trim()) { setError('请输入昵称'); return; }
    emitRaw('room:create', {
      nickname: effectiveNickname.trim(),
      settings: { totalRounds, actionTimeoutSeconds, botCount },
    });
  };

  const handleJoin = () => {
    if (!effectiveNickname.trim()) { setError('请输入昵称'); return; }
    if (!roomCode.trim()) { setError('请输入房间码'); return; }
    emitRaw('room:join', { roomCode: roomCode.trim().toUpperCase(), nickname: effectiveNickname.trim() });
  };

  const handleCopyCode = async () => {
    if (!roomState) return;
    try {
      await navigator.clipboard.writeText(roomState.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — show code inline as fallback
    }
  };

  const handleReady = () => {
    emitRaw('room:ready');
  };

  const handleStart = () => {
    emitRaw('room:start');
  };

  const handleUpdateRounds = (value: number) => {
    emitRaw('room:update_settings', { totalRounds: value });
  };

  const handleUpdateTimeout = (value: number) => {
    emitRaw('room:update_settings', { actionTimeoutSeconds: value });
  };

  const handleUpdateBotCount = (value: number) => {
    emitRaw('room:update_settings', { botCount: value });
  };

  const handleShowHistory = async () => {
    if (!playerId) return;
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/v1/players/${playerId}/history`);
      const data = await res.json();
      setHistory(data.games ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const query = playerId ? `?playerId=${encodeURIComponent(playerId)}` : '';
    window.location.href = `/api/v1/auth/google${query}`;
  };

  const handleLogout = async () => {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    setAuthUser(null);
  };

  if (roomState) {
    const me = roomState.players.find(p => p.id === playerId);
    const isHost = roomState.hostId === playerId;
    const botCount = roomState.settings.botCount;
    const humanSeats = 4 - botCount;
    const allReady = roomState.players.length === humanSeats && roomState.players.every(p => p.isReady);

    return (
      <div className="lobby">
        <h1 className="lobby__title">🀄 国标麻将</h1>

        <div className="lobby__room-info">
          <span className="lobby__room-code">房间码：<strong>{roomState.code}</strong></span>
          <button className="btn btn--sm" onClick={handleCopyCode}>
            {copied ? '已复制！' : '复制房间码'}
          </button>
        </div>

        <div className="lobby__seats">
          {[0,1,2,3].map(i => {
            const p = roomState.players[i];
            if (p) {
              return (
                <div key={i} className="lobby__seat lobby__seat--filled">
                  <span className="lobby__seat-name">{p.nickname}</span>
                  <span className={`lobby__seat-badge ${p.isReady ? 'lobby__seat-badge--ready' : ''}`}>
                    {p.isHost ? '房主' : p.isReady ? '已准备' : '未准备'}
                  </span>
                </div>
              );
            }
            if (i < roomState.players.length + botCount) {
              return (
                <div key={i} className="lobby__seat lobby__seat--bot">
                  <span className="lobby__seat-bot-label">🤖 电脑</span>
                  <span className="lobby__seat-badge">已准备</span>
                </div>
              );
            }
            return (
              <div key={i} className="lobby__seat">
                <span className="lobby__seat-empty">等待玩家…</span>
              </div>
            );
          })}
        </div>

        <div className="lobby__settings">
          <span className="lobby__settings-title">对局设置</span>
          <div className="lobby__settings-row">
            <span className="lobby__settings-label">局数</span>
            {isHost ? (
              <select
                className="lobby__settings-select"
                value={roomState.settings.totalRounds}
                onChange={e => handleUpdateRounds(Number(e.target.value))}
              >
                {ROUND_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt} 局</option>
                ))}
              </select>
            ) : (
              <span className="lobby__settings-value">{roomState.settings.totalRounds} 局</span>
            )}
          </div>
          <div className="lobby__settings-row">
            <span className="lobby__settings-label">思考时间</span>
            {isHost ? (
              <select
                className="lobby__settings-select"
                value={roomState.settings.actionTimeoutSeconds}
                onChange={e => handleUpdateTimeout(Number(e.target.value))}
              >
                {TIMEOUT_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt} 秒</option>
                ))}
              </select>
            ) : (
              <span className="lobby__settings-value">{roomState.settings.actionTimeoutSeconds} 秒</span>
            )}
          </div>
          <div className="lobby__settings-row">
            <span className="lobby__settings-label">电脑数量</span>
            {isHost ? (
              <select
                className="lobby__settings-select"
                value={roomState.settings.botCount}
                onChange={e => handleUpdateBotCount(Number(e.target.value))}
              >
                {BOT_OPTIONS.filter(opt => roomState.players.length + opt <= 4).map(opt => (
                  <option key={opt} value={opt}>{opt} 个</option>
                ))}
              </select>
            ) : (
              <span className="lobby__settings-value">{roomState.settings.botCount} 个</span>
            )}
          </div>
        </div>

        <div className="lobby__actions">
          {!me?.isReady && (
            <button className="btn btn--primary" onClick={handleReady}>准备</button>
          )}
          {me?.isReady && <span className="lobby__status">等待其他玩家准备…</span>}
          {isHost && allReady && (
            <button className="btn btn--start" onClick={handleStart}>开始游戏</button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="lobby">
      <h1 className="lobby__title">🀄 国标麻将</h1>
      <p className="lobby__subtitle">四人实时对战 · 完整88番判定</p>

      <div className="lobby__topbar">
        {authUser ? (
          <div className="lobby__account">
            {authUser.avatarUrl && <img className="lobby__avatar" src={authUser.avatarUrl} alt="" />}
            <span className="lobby__account-name">{authUser.name ?? authUser.email}</span>
            <button className="btn btn--secondary btn--sm" onClick={handleLogout}>退出登录</button>
          </div>
        ) : (
          <button className="btn btn--secondary btn--sm" onClick={handleGoogleLogin}>使用 Google 登录</button>
        )}
        <button className="btn btn--secondary btn--sm" onClick={handleShowHistory}>
          战绩
        </button>
      </div>

      {showHistory && (
        <div className="history-modal__overlay" onClick={() => setShowHistory(false)}>
          <div className="history-modal" onClick={e => e.stopPropagation()}>
            <div className="history-modal__header">
              <span>战绩</span>
              <button className="btn btn--sm" onClick={() => setShowHistory(false)}>关闭</button>
            </div>
            {historyLoading && <p className="history-modal__empty">加载中…</p>}
            {!historyLoading && history && history.length === 0 && (
              <p className="history-modal__empty">暂无对局记录</p>
            )}
            {!historyLoading && history && history.length > 0 && (
              <ul className="history-modal__list">
                {history.map(g => (
                  <li key={g.gameId} className="history-modal__item">
                    <span className="history-modal__date">
                      {new Date(g.endedAt).toLocaleString('zh-CN')}
                    </span>
                    <span className="history-modal__rounds">{g.totalRoundsPlayed}/{g.maxRounds} 局</span>
                    <span className="history-modal__rank">第 {g.rank} 名</span>
                    <span className={`history-modal__score ${g.finalScore >= 0 ? 'history-modal__score--positive' : 'history-modal__score--negative'}`}>
                      {g.finalScore > 0 ? `+${g.finalScore}` : g.finalScore}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && <p className="lobby__error">{error}</p>}

      <div className="lobby__form">
        {!authUser && (
          <input
            className="lobby__input"
            type="text"
            placeholder="输入昵称（最多8个字）"
            maxLength={8}
            value={nickname}
            onChange={e => { setNickname(e.target.value); setError(''); }}
          />
        )}

        <div className="lobby__settings">
          <span className="lobby__settings-title">房间设置（创建后房主可调整）</span>
          <div className="lobby__settings-row">
            <span className="lobby__settings-label">局数</span>
            <select
              className="lobby__settings-select"
              value={totalRounds}
              onChange={e => setTotalRounds(Number(e.target.value))}
            >
              {ROUND_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt} 局</option>
              ))}
            </select>
          </div>
          <div className="lobby__settings-row">
            <span className="lobby__settings-label">思考时间</span>
            <select
              className="lobby__settings-select"
              value={actionTimeoutSeconds}
              onChange={e => setActionTimeoutSeconds(Number(e.target.value))}
            >
              {TIMEOUT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt} 秒</option>
              ))}
            </select>
          </div>
          <div className="lobby__settings-row">
            <span className="lobby__settings-label">电脑数量</span>
            <select
              className="lobby__settings-select"
              value={botCount}
              onChange={e => setBotCount(Number(e.target.value))}
            >
              {BOT_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt} 个</option>
              ))}
            </select>
          </div>
        </div>

        <button className="btn btn--primary" onClick={handleCreate}>
          创建房间
        </button>

        <div className="lobby__divider">— 或 —</div>

        <input
          className="lobby__input"
          type="text"
          placeholder="输入6位房间码"
          maxLength={6}
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          style={{ textTransform: 'uppercase', letterSpacing: '4px' }}
        />
        <button className="btn btn--secondary" onClick={handleJoin}>
          加入房间
        </button>
      </div>
    </div>
  );
}
