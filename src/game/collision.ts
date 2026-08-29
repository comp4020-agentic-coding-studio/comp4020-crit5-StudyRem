import { CAR_HEIGHT, CAR_WIDTH, laneCenterX, type Box } from "./types.ts";

/**
 * The player's continuous horizontal position. While idle, `fromLane` and
 * `toLane` are the same and `progress` is ignored; mid-transition, this
 * interpolates between the two lane centers. Because this is continuous
 * rather than lane-snapped, a single overlap check below covers both ways a
 * crossing player can be hit --- there's no separate "is the player
 * mid-crossing" special case.
 */
export function playerX(fromLane: number, toLane: number, progress: number): number {
  const from = laneCenterX(fromLane);
  const to = laneCenterX(toLane);
  return from + (to - from) * progress;
}

export function boxAt(centerX: number, centerY: number): Box {
  return { x: centerX - CAR_WIDTH / 2, y: centerY - CAR_HEIGHT / 2, w: CAR_WIDTH, h: CAR_HEIGHT };
}

export function squareBoxAt(centerX: number, centerY: number, size: number): Box {
  return { x: centerX - size / 2, y: centerY - size / 2, w: size, h: size };
}

export function isColliding(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
