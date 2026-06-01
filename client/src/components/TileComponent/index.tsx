import React from 'react';
import { Tile } from '../../types';
import { tileLabel, tileColor } from '../../utils/tiles';
import './Tile.css';

interface TileProps {
  tile: Tile;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  dimmed?: boolean;
  newest?: boolean;
  horizontal?: boolean;
}

export default function TileComponent({
  tile,
  selected,
  onClick,
  onDoubleClick,
  size = 'md',
  faceDown,
  dimmed,
  newest,
  horizontal,
}: TileProps) {
  if (faceDown) {
    return (
      <div
        className={`tile tile--back tile--${size} ${horizontal ? 'tile--horizontal' : ''}`}
      />
    );
  }

  const label = tileLabel(tile);
  const color = tileColor(tile);
  const isFlower = tile.suit === 'flower';

  return (
    <div
      className={[
        'tile',
        `tile--${size}`,
        selected ? 'tile--selected' : '',
        dimmed ? 'tile--dimmed' : '',
        newest ? 'tile--newest' : '',
        horizontal ? 'tile--horizontal' : '',
        isFlower ? 'tile--flower' : '',
        onClick ? 'tile--clickable' : '',
      ].filter(Boolean).join(' ')}
      style={{ '--tile-color': color } as React.CSSProperties}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="tile__label">{label}</span>
    </div>
  );
}
