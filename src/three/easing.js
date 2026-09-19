// Easing curves and helpers. Every input `t` is a progress value from 0 to 1.

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const lerp = (a, b, t) => a + (b - a) * t;

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Progress (0 to 1) of an animation that starts at `start` seconds and lasts
 * `duration` seconds, given the current time `t`.
 */
export const segment = (t, start, duration) => clamp01((t - start) / duration);

/**
 * Frame-rate independent smoothing: moves `value` towards `target` and
 * slows down as it gets close. Higher `rate` means a faster approach.
 */
export const damp = (value, target, rate, dt) =>
  lerp(value, target, 1 - Math.exp(-rate * dt));
