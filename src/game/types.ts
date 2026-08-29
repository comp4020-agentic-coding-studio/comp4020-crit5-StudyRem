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
  /** 0..1, fraction of lanes a wave tries to block. Never blocks every lane. */
  density: number;
  /** Pixels per second oncoming cars travel down the screen. */
  carSpeed: number;
  /** Milliseconds to wait after a batch's cars fully clear before the next batch. */
  batchGapMs: number;
  /** Milliseconds between mini-waves within a single batch. */
  waveGapMs: number;
  /** Minimum number of mini-waves fired per batch. */
  minWavesPerBatch: number;
  /** Maximum number of mini-waves fired per batch. */
  maxWavesPerBatch: number;
}

export const DEFAULT_SPAWNER_CONFIG: SpawnerConfig = {
  density: 0.6,
  carSpeed: 220,
  batchGapMs: 550,
  waveGapMs: 350,
  minWavesPerBatch: 2,
  maxWavesPerBatch: 3,
};
