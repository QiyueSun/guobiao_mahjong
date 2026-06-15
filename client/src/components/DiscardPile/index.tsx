import React from 'react';
import { Tile } from '../../types';
import TileComponent from '../TileComponent';
import './DiscardPile.css';

interface DiscardPileProps {
  tiles: Tile[];
  lastHighlight?: boolean;
  tilesPerRow?: number;
  hoveredTileKey?: string | null;
}

export default function DiscardPile({ tiles, lastHighlight, tilesPerRow = 6, hoveredTileKey }: DiscardPileProps) {
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += tilesPerRow) {
    rows.push(tiles.slice(i, i + tilesPerRow));
  }

  return (
    <div className="discard-pile">
      {rows.map((row, ri) => (
        <div key={ri} className="discard-pile__row">
          {row.map((tile, ti) => (
            <TileComponent
              key={tile.id}
              tile={tile}
              size="sm"
              newest={lastHighlight && ri === rows.length - 1 && ti === row.length - 1}
              highlighted={hoveredTileKey != null && `${tile.suit}:${tile.value}` === hoveredTileKey}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
