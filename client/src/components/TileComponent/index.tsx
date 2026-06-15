import React from 'react';
import { Tile } from '../../types';
import './Tile.css';

function tileImagePath(tile: Tile): string {
  return `/tiles/${tile.suit}${tile.value}.png`;
}

interface TileProps {
  tile: Tile;
  selected?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  dimmed?: boolean;
  newest?: boolean;
  horizontal?: boolean;
  highlighted?: boolean;
}

export default function TileComponent({
  tile,
  selected,
  onClick,
  onDoubleClick,
  onMouseEnter,
  onMouseLeave,
  size = 'md',
  faceDown,
  dimmed,
  newest,
  horizontal,
  highlighted,
}: TileProps) {
  if (faceDown) {
    return (
      <div className={`tile tile--back tile--${size} ${horizontal ? 'tile--horizontal' : ''}`}>
        <img src="/tiles/back.png" className="tile__img" alt="tile back" />
      </div>
    );
  }

  const isFlower = tile.suit === 'flower';
  const src = tileImagePath(tile);

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
        highlighted ? 'tile--highlighted' : '',
      ].filter(Boolean).join(' ')}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <img src={src} className="tile__img" alt={`${tile.suit}${tile.value}`} />
    </div>
  );
}
