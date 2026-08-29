import { boxAt, isColliding, playerX as continuousPlayerX } from "./collision.ts";
import { OperationSeries } from "./path.ts";
import { rowLanes } from "./spawner.ts";
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
 * window), traffic scheduling, and collision --- everything except drawing
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
  private operationSeries!: OperationSeries;
  private rowRemainingMs = 0;

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
    this.rowRemainingMs = 0;
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

    this.advanceRowSchedule(dtMs);
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
      this.operationSeries = new OperationSeries(this.currentLane, {
        laneCount: LANE_COUNT,
        minHoldMs: this.config.minHoldMs,
        maxHoldMs: this.config.maxHoldMs,
      });
      // First row spawns immediately --- the travel time from spawn to the
      // player's row (several seconds at the default carSpeed) is itself the
      // safe window to try the controls before traffic arrives.
      this.rowRemainingMs = 0;
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
    this.cars = this.cars.filter((car) => car.y - CAR_HEIGHT / 2 <= GAME_HEIGHT);
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

  private advanceRowSchedule(dtMs: number): void {
    this.rowRemainingMs -= dtMs;
    if (this.rowRemainingMs <= 0) {
      this.spawnRow();
      this.rowRemainingMs = this.config.rowIntervalMs;
    }
  }

  /**
   * Spawns one row of traffic. The lane that must stay open isn't chosen
   * here --- it's read off the expected operation series (path.ts) at the
   * time this row will actually reach the player, so traffic is generated
   * *from* a guaranteed-solvable path rather than generated first and hoped
   * to leave an opening.
   *
   * A row's arrival must stay a margin away from the *edges* of the segment
   * it falls in, for two separate reasons:
   *
   * - Each car's box overlaps the player's row for roughly
   *   `2 * CAR_HEIGHT / carSpeed` around its own arrival instant, wider than
   *   the gap between rows --- so without a margin at least that wide, a row
   *   could still be overlapping the player when an adjacent, differently
   *   safe segment's row arrives too, and neither lane would be safe against
   *   both at once.
   * - The player's box is narrower than a lane but wider than half the gap
   *   between lane centers, so mid-transition it briefly overlaps *both*
   *   the lane it's leaving and the one it's entering. A row that starts
   *   blocking the just-left lane can't be allowed to reach collision range
   *   before the transition (`TRANSITION_DURATION_MS`) has actually
   *   finished, or it can hit a player who did everything right.
   *
   * Rows whose arrival is too close to a lane change are skipped (a brief
   * quiet gap in traffic right as the safe lane changes) rather than
   * spawned against an ambiguous or not-yet-vacated lane.
   */
  private spawnRow(): void {
    const travelMs = ((PLAYER_REST_Y + CAR_HEIGHT) / this.config.carSpeed) * 1000;
    const halfWindowMs = (CAR_HEIGHT / this.config.carSpeed) * 1000;
    const marginMs = halfWindowMs + TRANSITION_DURATION_MS + 100;
    const safeLane = this.operationSeries.stableLaneAt(this.elapsedPlayMs + travelMs, marginMs);
    if (safeLane === null) return;
    const blocked = rowLanes(LANE_COUNT, safeLane, this.config.density);
    this.cars.push(
      ...blocked.flatMap((isBlocked, lane) =>
        isBlocked ? [{ id: this.nextCarId++, lane, y: -CAR_HEIGHT }] : [],
      ),
    );
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
