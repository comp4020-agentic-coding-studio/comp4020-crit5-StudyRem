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
  /** Locked in at spawn time so a car's actual arrival never drifts from the
   *  travel time trySpawn used to pick a safe lane for it, even if difficulty
   *  ramps up while it's already on screen. */
  speed: number;
}

export interface Bonus {
  id: number;
  lane: number;
  y: number;
  speed: number;
}

/** Collision/draw box for a bonus --- smaller than a car so catching one takes some precision. */
export const BONUS_SIZE = 34;
export const BONUS_POINTS = 25;

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
  /** Floor on the gap between any two spawns regardless of lane (anti-bunching). */
  minGlobalSpawnGapMs: number;
  /** Milliseconds a lane change animation takes. */
  transitionDurationMs: number;
}

export const DEFAULT_SPAWNER_CONFIG: SpawnerConfig = {
  carSpeed: 300,
  minSpawnGapMs: 1200,
  maxSpawnGapMs: 2400,
  minHoldMs: 1700,
  maxHoldMs: 2900,
  minGlobalSpawnGapMs: 130,
  transitionDurationMs: 130,
};

/** Pace a run has ramped all the way up to once `RAMP_DURATION_MS` of play
 *  has elapsed --- faster cars, denser traffic, shorter lane holds, and a
 *  tighter anti-bunching floor / lane-change animation, which frees up the
 *  safety margin around each spawn so the other levers actually have room
 *  to push the game harder rather than being capped by fixed constants. */
export const MAX_DIFFICULTY_CONFIG: SpawnerConfig = {
  carSpeed: 560,
  minSpawnGapMs: 550,
  maxSpawnGapMs: 1000,
  minHoldMs: 750,
  maxHoldMs: 1000,
  minGlobalSpawnGapMs: 90,
  transitionDurationMs: 100,
};

export const RAMP_DURATION_MS = 40_000;
