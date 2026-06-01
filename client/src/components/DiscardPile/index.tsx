import React from 'react';
import { Tile } from '../../types';
import TileComponent from '../TileComponent';
import './DiscardPile.css';

interface DiscardPileProps {
  tiles: Tile[];
  lastHighlight?: boolean;
}

export default function DiscardPile({ tiles, lastHighlight }: DiscardPileProps) {
  return (
    <div className="discard-pile">
      {tiles.map((tile, i) => (
        <TileComponent
          key={tile.id}
          tile={tile}
          size="sm"
          newest={lastHighlight && i === tiles.length - 1}
        />
      ))}
    </div>
  );
}
