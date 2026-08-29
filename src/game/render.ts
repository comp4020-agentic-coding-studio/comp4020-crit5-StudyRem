import type { EngineSnapshot } from "./engine.ts";
import {
  CAR_HEIGHT,
  CAR_WIDTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  LANE_COUNT,
  ROAD_MARGIN,
  ROAD_WIDTH,
  laneCenterX,
} from "./types.ts";

const ROAD_COLOR = "#2b2f36";
const EDGE_COLOR = "#4a5058";
const LANE_LINE_COLOR = "#5c636c";
const PLAYER_COLOR = "#e0342f";
const CAR_COLOR = "#8a8f96";

function roundedCar(ctx: CanvasRenderingContext2D, centerX: number, centerY: number, color: string): void {
  const x = centerX - CAR_WIDTH / 2;
  const y = centerY - CAR_HEIGHT / 2;
  const radius = 8;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, CAR_WIDTH, CAR_HEIGHT, radius);
  ctx.fill();
}

function drawExplosion(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const spikes = 10;
  const outerRadius = 34;
  const innerRadius = 14;

  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI * i) / spikes;
    const px = Math.sin(angle) * radius;
    const py = -Math.cos(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, outerRadius);
  gradient.addColorStop(0, "#fff3b0");
  gradient.addColorStop(0.5, "#f4a331");
  gradient.addColorStop(1, "#c92a2a");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
}

/** Draws one frame of the game world. All interactive UI lives in the DOM, not here. */
export function drawFrame(ctx: CanvasRenderingContext2D, snapshot: EngineSnapshot): void {
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  ctx.fillStyle = EDGE_COLOR;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  ctx.fillStyle = ROAD_COLOR;
  ctx.fillRect(ROAD_MARGIN, 0, ROAD_WIDTH, GAME_HEIGHT);

  ctx.strokeStyle = LANE_LINE_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([16, 14]);
  for (let lane = 1; lane < LANE_COUNT; lane++) {
    const x = ROAD_MARGIN + (ROAD_WIDTH / LANE_COUNT) * lane;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GAME_HEIGHT);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const car of snapshot.cars) {
    roundedCar(ctx, laneCenterX(car.lane), car.y, CAR_COLOR);
  }

  if (snapshot.state !== "start" && snapshot.playerAlive) {
    roundedCar(ctx, snapshot.playerX, snapshot.playerY, PLAYER_COLOR);
  }

  if (snapshot.explosion) {
    drawExplosion(ctx, snapshot.explosion.x, snapshot.explosion.y);
  }
}
