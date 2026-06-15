import { Tile } from '../types';

export class Deck {
  private wall: Tile[];
  private frontPtr = 0;
  private backPtr: number;

  constructor(withFlowers = true) {
    const all: Tile[] = [];

    for (const suit of ['man', 'pin', 'sou'] as const) {
      for (let v = 1; v <= 9; v++) {
        for (let i = 0; i < 4; i++) {
          all.push({ id: `${suit[0]}${v}_${i}`, suit, value: v });
        }
      }
    }

    for (let v = 1; v <= 4; v++) {
      for (let i = 0; i < 4; i++) {
        all.push({ id: `w${v}_${i}`, suit: 'wind', value: v });
      }
    }

    for (let v = 1; v <= 3; v++) {
      for (let i = 0; i < 4; i++) {
        all.push({ id: `d${v}_${i}`, suit: 'dragon', value: v });
      }
    }

    if (withFlowers) {
      for (let v = 1; v <= 8; v++) {
        all.push({ id: `f${v}_0`, suit: 'flower', value: v });
      }
    }

    shuffle(all);

    this.wall = all;
    this.backPtr = all.length;
  }

  /** Normal turn draw, from the front of the wall. */
  draw(): Tile | null {
    if (this.frontPtr >= this.backPtr) return null;
    return this.wall[this.frontPtr++];
  }

  /** Replacement draw for a kong or a dealt/drawn flower, from the back of the wall. */
  drawReplacement(): Tile | null {
    if (this.frontPtr >= this.backPtr) return null;
    return this.wall[--this.backPtr];
  }

  get remaining(): number {
    return this.backPtr - this.frontPtr;
  }

  isLastTile(): boolean {
    return this.remaining <= 0;
  }
}

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
