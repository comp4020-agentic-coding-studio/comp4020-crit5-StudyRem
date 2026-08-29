import type { Direction, Engine } from "./engine.ts";

export interface InputElements {
  leftButton: HTMLButtonElement;
  rightButton: HTMLButtonElement;
}

/**
 * Wires keyboard and on-screen buttons to the engine, both routed through
 * the same `canMove` check so a greyed-out button and its matching arrow
 * key go disabled together.
 */
export function wireInput(engine: Engine, elements: InputElements): void {
  const { leftButton, rightButton } = elements;

  const move = (direction: Direction) => {
    if (!engine.canMove(direction)) return;
    engine.requestMove(direction);
  };

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key === "ArrowLeft") move("left");
    else if (event.key === "ArrowRight") move("right");
  });

  leftButton.addEventListener("click", () => move("left"));
  rightButton.addEventListener("click", () => move("right"));
}

/** Call every frame so the buttons stay in sync with what's actually movable. */
export function syncButtons(engine: Engine, elements: InputElements): void {
  elements.leftButton.disabled = !engine.canMove("left");
  elements.rightButton.disabled = !engine.canMove("right");
}
