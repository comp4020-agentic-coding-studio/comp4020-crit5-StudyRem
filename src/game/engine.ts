import { boxAt, isColliding, playerX as continuousPlayerX } from "./collision.ts";
import { OperationSeries } from "./path.ts";
import { canSpawnInLane } from "./spawner.ts";
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

const TRANSITION_DURATION_MS = 130;
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
  // Two independent expected-path series, both guaranteeing a fully
  // survivable path on their own --- taking the union of their safe lanes
  // (see trySpawn) only ever adds options, so the guarantee holds no matter
  // which one the player actually follows, or how they switch between them.
  // This is what gives the player an actual choice of lane at any moment,
  // rather than a single forced rail.
  private paths: OperationSeries[] = [];
  private laneRemainingMs: number[] = [];

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

    this.advanceSpawnSchedule(dtMs);
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
      this.paths = Array.from(
        { length: 2 },
        () =>
          new OperationSeries(this.currentLane, {
            laneCount: LANE_COUNT,
            minHoldMs: this.config.minHoldMs,
            maxHoldMs: this.config.maxHoldMs,
          }),
      );
      // Each lane gets its own independent, randomly timed spawn schedule ---
      // staggering the starting offsets means lanes don't all fire their
      // first attempt in sync either.
      this.laneRemainingMs = Array.from({ length: LANE_COUNT }, () => this.randomSpawnGapMs());
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

  /**
   * Each lane runs its own independent countdown to its next spawn attempt
   * --- there's no shared "row" tick, so lanes fire at random, unsynchronized
   * moments rather than all sweeping down together.
   */
  private advanceSpawnSchedule(dtMs: number): void {
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      this.laneRemainingMs[lane] -= dtMs;
      if (this.laneRemainingMs[lane] <= 0) {
        this.trySpawn(lane);
        this.laneRemainingMs[lane] = this.randomSpawnGapMs();
      }
    }
  }

  /**
   * Attempts to spawn a car in `lane` right now. Whether it's actually
   * allowed isn't decided here --- it's read off the union of both expected
   * path series (path.ts) at the time this car will actually reach the
   * player, so traffic is generated *from* a guaranteed-solvable path rather
   * than generated first and hoped to leave an opening. A blocked attempt
   * simply spawns nothing and this lane tries again after its next random
   * gap --- it isn't rescheduled early, so lanes stay unsynchronized even
   * around a lane change.
   *
   * The margin has to cover two separate things close to a lane change:
   *
   * - Each car's box overlaps the player's row for roughly
   *   `2 * CAR_HEIGHT / carSpeed` around its own arrival instant --- so
   *   without a margin at least that wide, one car's arrival could be judged
   *   safe for a lane while another, overlapping-in-time arrival is judged
   *   safe for a different lane.
   * - The player's box is narrower than a lane but wider than half the gap
   *   between lane centers, so mid-transition it briefly overlaps *both*
   *   the lane it's leaving and the one it's entering --- so a car can't
   *   treat the just-left lane as fair game to block until the transition
   *   (`TRANSITION_DURATION_MS`) has actually had time to finish.
   */
  private trySpawn(lane: number): void {
    const travelMs = ((PLAYER_REST_Y + CAR_HEIGHT) / this.config.carSpeed) * 1000;
    const halfWindowMs = (CAR_HEIGHT / this.config.carSpeed) * 1000;
    const marginMs = halfWindowMs + TRANSITION_DURATION_MS + 100;
    const safeLanes = this.paths.flatMap((path) => path.safeLanesAt(this.elapsedPlayMs + travelMs, marginMs));
    if (!canSpawnInLane(lane, safeLanes)) return;
    this.cars.push({ id: this.nextCarId++, lane, y: -CAR_HEIGHT });
  }

  private randomSpawnGapMs(): number {
    const { minSpawnGapMs, maxSpawnGapMs } = this.config;
    return minSpawnGapMs + Math.random() * (maxSpawnGapMs - minSpawnGapMs);
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
