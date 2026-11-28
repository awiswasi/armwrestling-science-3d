/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where to load the arm model from. Defaults to ./models/arm_right.glb (copied from ../models). */
  readonly VITE_ARM_URL?: string;
}

interface Window {
  /** Ask for a redraw (render-on-demand). */
  __invalidate?: () => void;
}
