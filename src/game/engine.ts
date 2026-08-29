import { boxAt, isColliding, playerX as continuousPlayerX } from "./collision.ts";
import { generateBatch } from "./spawner.ts";
import {
  CAR_HEIGHT,
  DEFAULT_SPAWNER_CONFIG,
  GAME_HEIGHT,
  LANE_COUNT,
  PLAYER_REST_Y,
  laneCenterX,
  type Car,
  type GameState,
  type SpawnerConfig,
} from "./types.ts";

export type Direction = "left" | "right";

const TRANSITION_DURATION_MS = 180;
// Input during a lane change is dropped, except in this last fraction of the
// transition, where a single buffered move is captured and overwritable.
const BUFFER_THRESHOLD = 0.75;
const INTRO_DURATION_MS = 900;

interface Transition {
  fromLane: number;
  toLane: number;
  elapsedMs: number;
  progress: number;
}

interface Explosion {
  x: number;
  y: number;
}

export interface EngineSnapshot {
  state: GameState;
  playerX: number;
  playerY: number;
  /** Whether the player is currently visible (hidden once it has crashed). */
  playerAlive: boolean;
  cars: Car[];
  explosion: Explosion | null;
  score: number;
}

/**
 * The full game state machine: start -> intro -> playing -> gameover, and
 * back to intro on restart. Owns lane movement (with the buffered pre-input
 * window), batch/gap scheduling, and collision --- everything except drawing
 * and DOM/input wiring, which live in render.ts and input.ts.
 */
export class Engine {
  private state: GameState = "start";
  private currentLane = Math.floor(LANE_COUNT / 2);
  private transition: Transition | null = null;
  private bufferedInput: Direction | null = null;

  private introElapsedMs = 0;
  private introY = 0;

  private cars: Car[] = [];
  private nextCarId = 0;
  private batchState: "active" | "waiting" = "waiting";
  private gapRemainingMs = 0;

  private elapsedPlayMs = 0;
  private score = 0;
  private explosion: Explosion | null = null;
  private playerAlive = true;

  constructor(private config: SpawnerConfig = DEFAULT_SPAWNER_CONFIG) {}

  /** Called once, from the start screen's play button. */
  start(): void {
    if (this.state !== "start") return;
    this.beginIntro();
  }

  /** Called from the game-over screen's restart button --- skips the title screen. */
  restart(): void {
    this.currentLane = Math.floor(LANE_COUNT / 2);
    this.transition = null;
    this.bufferedInput = null;
    this.cars = [];
    this.batchState = "waiting";
    this.gapRemainingMs = 0;
    this.elapsedPlayMs = 0;
    this.score = 0;
    this.explosion = null;
    this.playerAlive = true;
    this.beginIntro();
  }

  private beginIntro(): void {
    this.introElapsedMs = 0;
    this.introY = GAME_HEIGHT + CAR_HEIGHT;
    this.state = "intro";
  }

  /** True if `direction` would move the player without crossing the road edge. */
  canMove(direction: Direction): boolean {
    const lane = this.transition ? this.transition.toLane : this.currentLane;
    return direction === "left" ? lane > 0 : lane < LANE_COUNT - 1;
  }

  requestMove(direction: Direction): void {
    if (this.state !== "playing") return;

    if (this.transition) {
      if (this.transition.progress >= BUFFER_THRESHOLD) {
        this.bufferedInput = direction;
      }
      return;
    }

    if (!this.canMove(direction)) return;
    this.startTransition(direction);
  }

  private startTransition(direction: Direction): void {
    const delta = direction === "left" ? -1 : 1;
    this.transition = {
      fromLane: this.currentLane,
      toLane: this.currentLane + delta,
      elapsedMs: 0,
      progress: 0,
    };
  }

  update(dtMs: number): void {
    if (this.state === "intro") {
      this.updateIntro(dtMs);
      return;
    }
    if (this.state !== "playing") return;

    this.elapsedPlayMs += dtMs;
    this.advanceTransition(dtMs);
    this.advanceCars(dtMs);

    const hitCar = this.findCollision();
    if (hitCar) {
      this.triggerGameOver(hitCar);
      return;
    }

    this.advanceBatchSchedule(dtMs);
  }

  private updateIntro(dtMs: number): void {
    this.introElapsedMs += dtMs;
    const t = Math.min(1, this.introElapsedMs / INTRO_DURATION_MS);
    const eased = 1 - (1 - t) * (1 - t);
    const startY = GAME_HEIGHT + CAR_HEIGHT;
    this.introY = startY + (PLAYER_REST_Y - startY) * eased;

    if (t >= 1) {
      this.state = "playing";
      this.elapsedPlayMs = 0;
      this.spawnBatch();
    }
  }

  private advanceTransition(dtMs: number): void {
    if (!this.transition) return;

    this.transition.elapsedMs += dtMs;
    this.transition.progress = Math.min(1, this.transition.elapsedMs / TRANSITION_DURATION_MS);

    if (this.transition.progress >= 1) {
      this.currentLane = this.transition.toLane;
      this.transition = null;

      if (this.bufferedInput) {
        const direction = this.bufferedInput;
        this.bufferedInput = null;
        if (this.canMove(direction)) this.startTransition(direction);
      }
    }
  }

  private advanceCars(dtMs: number): void {
    const distance = (this.config.carSpeed * dtMs) / 1000;
    for (const car of this.cars) car.y += distance;
  }

  private findCollision(): Car | null {
    const { x, y } = this.currentPlayerPosition();
    const playerBox = boxAt(x, y);
    for (const car of this.cars) {
      const carBox = boxAt(laneCenterX(car.lane), car.y);
      if (isColliding(playerBox, carBox)) return car;
    }
    return null;
  }

  private advanceBatchSchedule(dtMs: number): void {
    if (this.batchState === "active") {
      const cleared = this.cars.every((car) => car.y - CAR_HEIGHT / 2 > GAME_HEIGHT);
      if (cleared) {
        this.cars = [];
        this.batchState = "waiting";
        this.gapRemainingMs = this.config.batchGapMs;
      }
      return;
    }

    this.gapRemainingMs -= dtMs;
    if (this.gapRemainingMs <= 0) this.spawnBatch();
  }

  private spawnBatch(): void {
    const blocked = generateBatch(LANE_COUNT, this.config.density);
    this.cars = blocked.flatMap((isBlocked, lane) =>
      isBlocked ? [{ id: this.nextCarId++, lane, y: -CAR_HEIGHT }] : [],
    );
    this.batchState = "active";
  }

  private triggerGameOver(hitCar: Car): void {
    const { x: playerX, y: playerY } = this.currentPlayerPosition();
    this.explosion = {
      x: (playerX + laneCenterX(hitCar.lane)) / 2,
      y: (playerY + hitCar.y) / 2,
    };
    this.cars = this.cars.filter((car) => car.id !== hitCar.id);
    this.playerAlive = false;
    this.score = Math.floor(this.elapsedPlayMs / 1000);
    this.transition = null;
    this.state = "gameover";
  }

  private currentPlayerPosition(): { x: number; y: number } {
    if (this.state === "intro") return { x: laneCenterX(this.currentLane), y: this.introY };
    const x = this.transition
      ? continuousPlayerX(this.transition.fromLane, this.transition.toLane, this.transition.progress)
      : laneCenterX(this.currentLane);
    return { x, y: PLAYER_REST_Y };
  }

  getSnapshot(): EngineSnapshot {
    const { x, y } = this.currentPlayerPosition();
    return {
      state: this.state,
      playerX: x,
      playerY: y,
      playerAlive: this.playerAlive,
      cars: this.cars,
      explosion: this.explosion,
      score: this.score,
    };
  }
}
