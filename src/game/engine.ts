import { boxAt, isColliding, playerX as continuousPlayerX, squareBoxAt } from "./collision.ts";
import { OperationSeries, type PathConfig } from "./path.ts";
import { canSpawnInLane, pickBonusLane } from "./spawner.ts";
import {
  BONUS_POINTS,
  BONUS_SIZE,
  CAR_HEIGHT,
  DEFAULT_SPAWNER_CONFIG,
  GAME_HEIGHT,
  LANE_COUNT,
  MAX_DIFFICULTY_CONFIG,
  PLAYER_REST_Y,
  RAMP_DURATION_MS,
  laneCenterX,
  type Bonus,
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
// Each lane's spawn timer is independent, so nothing stops several lanes
// firing within a few ticks of each other purely by chance --- which reads
// as a "line" of cars even though none of it was scheduled together. This
// floor on the gap between ANY two spawns, regardless of lane, is what
// actually prevents that: a blocked attempt just retries on its own next
// random gap, so this only ever delays a spawn, never forces one, and can't
// affect the safety guarantee in trySpawn.
const MIN_GLOBAL_SPAWN_GAP_MS = 130;

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
  bonuses: Bonus[];
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
  // The same PathConfig object each path in `paths` was built from, kept
  // around so advanceDifficulty() can ramp minHoldMs/maxHoldMs on it ---
  // OperationSeries reads these fields live off the reference at each new
  // segment's generation time, so mutating them here needs no changes to
  // path.ts at all.
  private pathConfigs: PathConfig[] = [];
  private laneRemainingMs: number[] = [];
  private lastSpawnAtMs = -Infinity;

  // A bonus always spawns in a lane drawn from the same union safe-lane set
  // that bars cars (see unionSafeLanesAt) --- so collecting one is always
  // safe by the identical guarantee already proven for traffic, and never
  // needs a case of its own. At most one is ever on screen at a time, so
  // it stays a clear, legible target instead of clutter.
  private bonuses: Bonus[] = [];
  private nextBonusId = 0;
  private bonusRemainingMs = 0;
  private bonusPoints = 0;

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
    this.bonuses = [];
    this.bonusPoints = 0;
    this.elapsedPlayMs = 0;
    this.score = 0;
    this.explosion = null;
    this.playerAlive = true;
    this.lastSpawnAtMs = -Infinity;
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
    this.advanceDifficulty();
    this.advanceTransition(dtMs);
    this.advanceCars(dtMs);
    this.advanceBonuses(dtMs);
    this.collectBonuses();
    this.score = Math.floor(this.elapsedPlayMs / 1000) + this.bonusPoints;

    const hitCar = this.findCollision();
    if (hitCar) {
      this.triggerGameOver(hitCar);
      return;
    }

    this.advanceSpawnSchedule(dtMs);
    this.advanceBonusSchedule(dtMs);
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
      this.pathConfigs = Array.from({ length: 2 }, () => ({
        laneCount: LANE_COUNT,
        minHoldMs: this.config.minHoldMs,
        maxHoldMs: this.config.maxHoldMs,
      }));
      this.paths = this.pathConfigs.map((pathConfig) => new OperationSeries(this.currentLane, pathConfig));
      // Each lane gets its own independent, randomly timed spawn schedule ---
      // staggering the starting offsets means lanes don't all fire their
      // first attempt in sync either.
      this.laneRemainingMs = Array.from({ length: LANE_COUNT }, () => this.randomSpawnGapMs());
      this.lastSpawnAtMs = -Infinity;
      this.bonusRemainingMs = this.randomBonusGapMs();
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
    for (const car of this.cars) car.y += (car.speed * dtMs) / 1000;
    this.cars = this.cars.filter((car) => car.y - CAR_HEIGHT / 2 <= GAME_HEIGHT);
  }

  private advanceBonuses(dtMs: number): void {
    for (const bonus of this.bonuses) bonus.y += (bonus.speed * dtMs) / 1000;
    this.bonuses = this.bonuses.filter((bonus) => bonus.y - BONUS_SIZE / 2 <= GAME_HEIGHT);
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

  /** Missing a bonus (it scrolls past uncollected) costs nothing --- just a missed opportunity. */
  private collectBonuses(): void {
    const { x, y } = this.currentPlayerPosition();
    const playerBox = boxAt(x, y);
    this.bonuses = this.bonuses.filter((bonus) => {
      const bonusBox = squareBoxAt(laneCenterX(bonus.lane), bonus.y, BONUS_SIZE);
      if (!isColliding(playerBox, bonusBox)) return true;
      this.bonusPoints += BONUS_POINTS;
      return false;
    });
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
   *
   * On top of the lane-safety check, `MIN_GLOBAL_SPAWN_GAP_MS` also blocks
   * this spawn if another lane spawned too recently --- independent per-lane
   * timers will still occasionally line up by chance, and without this a
   * coincidence like that reads as a synchronized "line" of cars even though
   * none of it was actually scheduled together.
   */
  private trySpawn(lane: number): void {
    const speed = this.currentCarSpeed();
    const { travelMs, marginMs } = this.arrivalWindow(speed);
    const safeLanes = this.unionSafeLanesAt(this.elapsedPlayMs + travelMs, marginMs);
    if (!canSpawnInLane(lane, safeLanes)) return;
    if (this.elapsedPlayMs - this.lastSpawnAtMs < MIN_GLOBAL_SPAWN_GAP_MS) return;
    this.cars.push({ id: this.nextCarId++, lane, y: -CAR_HEIGHT, speed });
    this.lastSpawnAtMs = this.elapsedPlayMs;
  }

  /**
   * A bonus is placed in one lane picked at random from that same union
   * safe-lane set --- the exact set `trySpawn` bars cars from at their own
   * arrival time --- so it's guaranteed collision-free by the identical
   * guarantee already proven for traffic, with no separate safety argument
   * needed. The set is never empty: each path always holds some lane safe.
   */
  private trySpawnBonus(): void {
    const speed = this.currentCarSpeed();
    const { travelMs, marginMs } = this.arrivalWindow(speed);
    const safeLanes = this.unionSafeLanesAt(this.elapsedPlayMs + travelMs, marginMs);
    const lane = pickBonusLane(safeLanes);
    this.bonuses.push({ id: this.nextBonusId++, lane, y: -BONUS_SIZE, speed });
  }

  /** The union of both expected paths' safe lanes at `tMs` --- see trySpawn. */
  private unionSafeLanesAt(tMs: number, marginMs: number): number[] {
    return this.paths.flatMap((path) => path.safeLanesAt(tMs, marginMs));
  }

  /** `speed` is the pace this specific spawn will travel at for its whole
   *  lifetime (see the `speed` field on Car/Bonus), so travel time and
   *  arrival margin are computed from that same fixed value, not whatever
   *  the ramp has moved on to by the time it actually arrives. */
  private arrivalWindow(speed: number): { travelMs: number; marginMs: number } {
    const travelMs = ((PLAYER_REST_Y + CAR_HEIGHT) / speed) * 1000;
    const halfWindowMs = (CAR_HEIGHT / speed) * 1000;
    const marginMs = halfWindowMs + TRANSITION_DURATION_MS + 100;
    return { travelMs, marginMs };
  }

  private randomSpawnGapMs(): number {
    const { min, max } = this.currentSpawnGapRange();
    return min + Math.random() * (max - min);
  }

  /**
   * How far a run has ramped from DEFAULT_SPAWNER_CONFIG towards
   * MAX_DIFFICULTY_CONFIG, 0 at the start of play up to 1 once
   * RAMP_DURATION_MS has elapsed, holding steady at 1 after that --- a pure
   * function of elapsedPlayMs, so it needs no reset logic of its own.
   */
  private rampT(): number {
    return Math.min(1, this.elapsedPlayMs / RAMP_DURATION_MS);
  }

  private lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
  }

  private currentCarSpeed(): number {
    return this.lerp(this.config.carSpeed, MAX_DIFFICULTY_CONFIG.carSpeed, this.rampT());
  }

  private currentSpawnGapRange(): { min: number; max: number } {
    const t = this.rampT();
    return {
      min: this.lerp(this.config.minSpawnGapMs, MAX_DIFFICULTY_CONFIG.minSpawnGapMs, t),
      max: this.lerp(this.config.maxSpawnGapMs, MAX_DIFFICULTY_CONFIG.maxSpawnGapMs, t),
    };
  }

  private currentHoldRange(): { min: number; max: number } {
    const t = this.rampT();
    return {
      min: this.lerp(this.config.minHoldMs, MAX_DIFFICULTY_CONFIG.minHoldMs, t),
      max: this.lerp(this.config.maxHoldMs, MAX_DIFFICULTY_CONFIG.maxHoldMs, t),
    };
  }

  /** Ramps both expected paths' lane-hold duration in place --- see the
   *  `pathConfigs` field for why mutating it here is enough. */
  private advanceDifficulty(): void {
    const { min, max } = this.currentHoldRange();
    for (const pathConfig of this.pathConfigs) {
      pathConfig.minHoldMs = min;
      pathConfig.maxHoldMs = max;
    }
  }

  /**
   * One lane runs its own countdown to the next bonus attempt, same idea as
   * `advanceSpawnSchedule` --- but only one bonus is ever allowed on screen
   * at a time, so a still-active bonus just makes this tick's attempt a
   * no-op rather than rescheduling early.
   */
  private advanceBonusSchedule(dtMs: number): void {
    this.bonusRemainingMs -= dtMs;
    if (this.bonusRemainingMs <= 0) {
      if (this.bonuses.length === 0) this.trySpawnBonus();
      this.bonusRemainingMs = this.randomBonusGapMs();
    }
  }

  private randomBonusGapMs(): number {
    return 3500 + Math.random() * 2500;
  }

  private triggerGameOver(hitCar: Car): void {
    const { x: playerX, y: playerY } = this.currentPlayerPosition();
    this.explosion = {
      x: (playerX + laneCenterX(hitCar.lane)) / 2,
      y: (playerY + hitCar.y) / 2,
    };
    this.cars = this.cars.filter((car) => car.id !== hitCar.id);
    this.playerAlive = false;
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
      bonuses: this.bonuses,
      explosion: this.explosion,
      score: this.score,
    };
  }
}
