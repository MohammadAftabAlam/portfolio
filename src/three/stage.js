import { Color, MathUtils, PerspectiveCamera, Scene, Spherical, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createComposer } from "./postprocessing.js";
import { COLORS } from "./theme.js";
import { damp, easeOutCubic, segment } from "./easing.js";

/*
  Shared set-up for the section diagrams: renderer, camera, damped
  OrbitControls, bloom, DOM labels and a render loop that only runs while the
  diagram is on screen. Each scene supplies its own parts and an `update`
  function, and gets the same look as the hero diagram.
*/

const LABEL_DIM = [135, 147, 160]; // #8793a0
const LABEL_HOT = [227, 177, 92]; // #e3b15c

export function createStage(container, options = {}) {
  const { fov = 32, bloom = 0.7, orbit = {}, fit, update, dolly = 0.5 } = options;

  let renderer;
  try {
    renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  } catch (error) {
    return null;
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  renderer.domElement.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;display:block;";
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color(COLORS.background);
  const camera = new PerspectiveCamera(fov, 1, 0.1, 100);

  /* ---- labels and line materials that need the canvas size ---- */
  const overlay = document.createElement("div");
  overlay.className = "scene__labels";
  container.appendChild(overlay);
  const labels = [];
  const lineMaterials = [];
  const size = { width: 1, height: 1 };

  function addLabel(text, anchor, { delay = 0 } = {}) {
    const el = document.createElement("span");
    el.className = "scene__label";
    el.textContent = text;
    overlay.appendChild(el);
    const label = { el, anchor, delay, energy: 0, fade: 1 };
    labels.push(label);
    return label;
  }

  function trackLine(material) {
    lineMaterials.push(material);
    material.resolution.set(size.width, size.height);
  }

  /* ---- controls ---- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...(orbit.target ?? [0, 0, 0]));
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = !reduced;
  controls.dampingFactor = 0.07;
  if (orbit.polar) {
    controls.minPolarAngle = orbit.polar[0];
    controls.maxPolarAngle = orbit.polar[1];
  }
  if (orbit.azimuth) {
    controls.minAzimuthAngle = orbit.azimuth[0];
    controls.maxAzimuthAngle = orbit.azimuth[1];
  }
  const speed = orbit.speed ?? 0;
  const sweep = Boolean(speed && orbit.azimuth); // sweep back and forth between the limits
  controls.autoRotate = !reduced && speed > 0;
  controls.autoRotateSpeed = speed;
  renderer.domElement.style.touchAction = "pan-y"; // vertical swipes still scroll the page

  let resumeTimer = 0;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    clearTimeout(resumeTimer);
  });
  controls.addEventListener("end", () => {
    clearTimeout(resumeTimer);
    if (!reduced && speed > 0) resumeTimer = setTimeout(() => (controls.autoRotate = true), 2500);
  });

  /* ---- post-processing ---- */
  const { composer, bloom: bloomPass } = createComposer(renderer, scene, camera);

  /* ---- state ---- */
  const offset = new Vector3();
  const projected = new Vector3();
  let fitDistance = 12;
  let time = 0;
  let turn = 1; // eased towards +1 / -1 so the sweep turns smoothly
  let turnTarget = 1;
  let raf = 0;
  let last = 0;
  let visible = false;

  const start = orbit.start ?? { azimuth: 0.15, polar: 1.1 };
  camera.position
    .setFromSpherical(new Spherical(fitDistance * (1 + dolly), start.polar, start.azimuth))
    .add(controls.target);

  function setDistance(distance) {
    offset.copy(camera.position).sub(controls.target);
    offset.setLength(distance);
    camera.position.copy(controls.target).add(offset);
  }

  function updateLabels(t) {
    labels.forEach((label) => {
      projected.copy(label.anchor).project(camera);
      const x = (projected.x * 0.5 + 0.5) * size.width;
      const y = (-projected.y * 0.5 + 0.5) * size.height;
      const show = projected.z < 1 ? easeOutCubic(segment(t, label.delay + 0.5, 0.7)) : 0;
      label.el.style.opacity = String(show * label.fade);
      label.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      const e = label.energy;
      label.el.style.color = `rgb(${LABEL_DIM.map((c, i) =>
        Math.round(c + (LABEL_HOT[i] - c) * e)
      ).join(",")})`;
    });
  }

  function step(dt) {
    time += dt;
    const t = reduced ? 99 : time;

    update?.(t, dt);

    setDistance(fitDistance * (1 + dolly * (1 - easeOutCubic(segment(t, 0, 2.0)))));
    if (sweep && !reduced) {
      const azimuth = controls.getAzimuthalAngle();
      if (azimuth <= controls.minAzimuthAngle + 0.06) turnTarget = -1;
      else if (azimuth >= controls.maxAzimuthAngle - 0.06) turnTarget = 1;
      turn = damp(turn, turnTarget, 2.5, dt);
      controls.autoRotateSpeed = speed * turn;
    }
    controls.update(dt || undefined);

    bloomPass.strength = bloom * easeOutCubic(segment(t, 0.8, 1.4));
    updateLabels(t);
    composer.render();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    step(dt);
  }

  function run() {
    if (reduced || raf || !visible || document.hidden) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function halt() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    size.width = width;
    size.height = height;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    lineMaterials.forEach((material) => material.resolution.set(width, height));

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const halfV = Math.tan(MathUtils.degToRad(camera.fov / 2));
    fitDistance = fit ? fit(halfV, halfV * camera.aspect) : 12;

    if (reduced || !raf) step(0);
  }

  // with reduced motion there is no loop, so redraw when the person drags
  const redraw = () => {
    if (!raf) step(0);
  };
  if (reduced) controls.addEventListener("change", redraw);

  const onVisibility = () => (document.hidden ? halt() : run());
  document.addEventListener("visibilitychange", onVisibility);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  // the clock only advances while the diagram is on screen, so the intro plays when it is seen
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) run();
    else halt();
  });
  intersection.observe(container);

  function dispose() {
    halt();
    clearTimeout(resumeTimer);
    resizeObserver.disconnect();
    intersection.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    controls.dispose();
    bloomPass.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    overlay.remove();
  }

  return { scene, camera, addLabel, trackLine, dispose, start: resize };
}
