import React, { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import './Lobby.css';

export default function Lobby() {
  const { roomState, playerId } = useGameStore();
  const { emitRaw } = useWebSocket();
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [view, setView] = useState<'home' | 'room'>('home');
  const [error, setError] = useState('');

  const handleCreate = () => {
    if (!nickname.trim()) { setError('请输入昵称'); return; }
    emitRaw('room:create', { nickname: nickname.trim() });
    setView('room');
  };

  const handleJoin = () => {
    if (!nickname.trim()) { setError('请输入昵称'); return; }
    if (!roomCode.trim()) { setError('请输入房间码'); return; }
    emitRaw('room:join', { roomCode: roomCode.trim().toUpperCase(), nickname: nickname.trim() });
    setView('room');
  };

  const handleReady = () => {
    emitRaw('room:ready');
  };

  const handleStart = () => {
    emitRaw('room:start');
  };

  if (view === 'room' && roomState) {
    const me = roomState.players.find(p => p.id === playerId);
    const isHost = roomState.hostId === playerId;
    const allReady = roomState.players.length === 4 && roomState.players.every(p => p.isReady);

    return (
      <div className="lobby">
        <h1 className="lobby__title">🀄 国标麻将</h1>

        <div className="lobby__room-info">
          <span className="lobby__room-code">房间码：<strong>{roomState.code}</strong></span>
          <button
            className="btn btn--sm"
            onClick={() => {
              navigator.clipboard.writeText(window.location.origin + '/room/' + roomState.code);
            }}
          >
            复制链接
          </button>
        </div>

        <div className="lobby__seats">
          {[0,1,2,3].map(i => {
            const p = roomState.players[i];
            return (
              <div key={i} className={`lobby__seat ${p ? 'lobby__seat--filled' : ''}`}>
                {p ? (
                  <>
                    <span className="lobby__seat-name">{p.nickname}</span>
                    <span className={`lobby__seat-badge ${p.isReady ? 'lobby__seat-badge--ready' : ''}`}>
                      {p.isHost ? '房主' : p.isReady ? '已准备' : '未准备'}
                    </span>
                  </>
                ) : (
                  <span className="lobby__seat-empty">等待玩家…</span>
                )}
              </div>
            );
          })}
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

      {error && <p className="lobby__error">{error}</p>}

      <div className="lobby__form">
        <input
          className="lobby__input"
          type="text"
          placeholder="输入昵称（最多8个字）"
          maxLength={8}
          value={nickname}
          onChange={e => { setNickname(e.target.value); setError(''); }}
        />

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
