// Internal game coordinate space, fixed regardless of actual rendered size.
// Matches the phone marking viewport 1:1; the desktop viewport letterboxes
// around it instead of stretching it.
export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;

export const LANE_COUNT = 6;
export const ROAD_MARGIN = 15;
export const ROAD_WIDTH = GAME_WIDTH - ROAD_MARGIN * 2;
export const LANE_WIDTH = ROAD_WIDTH / LANE_COUNT;

export const CAR_WIDTH = 44;
export const CAR_HEIGHT = 76;

export const PLAYER_REST_Y = GAME_HEIGHT - 120;

export function laneCenterX(lane: number): number {
  return ROAD_MARGIN + LANE_WIDTH * (lane + 0.5);
}

export type GameState = "start" | "intro" | "playing" | "gameover";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Car {
  id: number;
  lane: number;
  y: number;
}

export interface SpawnerConfig {
  /** Pixels per second oncoming cars travel down the screen. */
  carSpeed: number;
  /** Minimum/maximum milliseconds a lane waits before its next spawn
   *  attempt --- each lane runs its own independent, randomly timed
   *  schedule, rather than every lane spawning together on a shared tick. */
  minSpawnGapMs: number;
  maxSpawnGapMs: number;
  /** Minimum/maximum milliseconds the expected path holds a lane before considering a move. */
  minHoldMs: number;
  maxHoldMs: number;
}

export const DEFAULT_SPAWNER_CONFIG: SpawnerConfig = {
  carSpeed: 220,
  minSpawnGapMs: 500,
  maxSpawnGapMs: 1100,
  minHoldMs: 1700,
  maxHoldMs: 2900,
};
