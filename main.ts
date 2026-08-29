import { Engine } from "./src/game/engine.ts";
import { syncButtons, wireInput } from "./src/game/input.ts";
import { drawFrame } from "./src/game/render.ts";

function required<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as unknown as T;
}

const canvas = required<HTMLCanvasElement>("game-canvas");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d canvas context unavailable");

const startScreen = required<HTMLElement>("start-screen");
const hud = required<HTMLElement>("hud");
const gameoverScreen = required<HTMLElement>("gameover-screen");
const scoreEl = required<HTMLElement>("score");
const finalScoreEl = required<HTMLElement>("final-score");
const playButton = required<HTMLButtonElement>("play-button");
const restartButton = required<HTMLButtonElement>("restart-button");
const leftButton = required<HTMLButtonElement>("left-button");
const rightButton = required<HTMLButtonElement>("right-button");

const engine = new Engine();
wireInput(engine, { leftButton, rightButton });

playButton.addEventListener("click", () => engine.start());
restartButton.addEventListener("click", () => engine.restart());

let lastTime: number | null = null;

function frame(time: number): void {
  const dtMs = lastTime === null ? 0 : time - lastTime;
  lastTime = time;

  engine.update(dtMs);
  const snapshot = engine.getSnapshot();

  drawFrame(ctx as CanvasRenderingContext2D, snapshot);
  syncButtons(engine, { leftButton, rightButton });

  startScreen.hidden = snapshot.state !== "start";
  hud.hidden = snapshot.state === "start" || snapshot.state === "gameover";
  gameoverScreen.hidden = snapshot.state !== "gameover";

  scoreEl.textContent = String(snapshot.score);
  finalScoreEl.textContent = String(snapshot.score);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
