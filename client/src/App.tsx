import React from 'react';
import { useGameStore } from './store/gameStore';
import { useWebSocket } from './hooks/useWebSocket';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import './App.css';

export default function App() {
  useWebSocket(); // initialize connection

  const { gameStarted, gameState } = useGameStore();

  if (gameStarted && gameState) {
    return <GameBoard />;
  }

  return <Lobby />;
}
