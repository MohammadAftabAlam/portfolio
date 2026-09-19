import { useEffect, useRef } from "react";
import { Color, MathUtils, PerspectiveCamera, Scene, Spherical, Vector3, WebGLRenderer } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createSystem } from "./buildSystem.js";
import { createFlows } from "./packets.js";
import { createComposer } from "./postprocessing.js";
import { COLORS } from "./theme.js";
import { damp, easeOutCubic, segment } from "./easing.js";

/*
  Live system diagram. Drag to rotate (OrbitControls with damping).
  Left alone, the camera sweeps slowly and reverses with an eased turn.
*/

const LABEL_DIM = [135, 147, 160]; // #8793a0
const LABEL_HOT = [227, 177, 92]; // #e3b15c

const ROUTES = {
  request: {
    api: (app) => `app ${app + 1} → REST API`,
    service: () => "REST API → Spring Boot",
    orm: () => "Spring Boot → Hibernate",
    db: () => "Hibernate → MySQL",
  },
  query: { db: () => "MySQL runs the query" },
  response: {
    orm: () => "MySQL → Hibernate",
    service: () => "Hibernate → Spring Boot",
    api: () => "Spring Boot → REST API",
    app: (app) => `REST API → app ${app + 1}`,
  },
};

export default function SystemScene({ onReady, onError }) {
  const stageRef = useRef(null);
  const captionRef = useRef(null);

  useEffect(() => {
    const stage = stageRef.current;

    let renderer;
    try {
      renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    } catch (error) {
      onError?.();
      return undefined;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    stage.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color(COLORS.background);
    const camera = new PerspectiveCamera(32, 1, 0.1, 100);

    /* ---- the diagram ---- */
    const system = createSystem();
    scene.add(system.group);

    const setCaption = (text) => {
      if (captionRef.current) captionRef.current.textContent = text;
    };
    const flows = reduced
      ? null
      : createFlows(system.group, (nodeId, phase, app) => {
          const node = system.nodeById[nodeId];
          if (node) node.energy = 1;
          const route = ROUTES[phase]?.[nodeId.startsWith("app") ? "app" : nodeId];
          if (route) setCaption(`${phase.padEnd(9)}${route(app)}`);
        });

    /* ---- labels (crisp DOM text placed over the canvas) ---- */
    const overlay = document.createElement("div");
    overlay.className = "scene__labels";
    stage.appendChild(overlay);
    const labels = system.nodes
      .filter((node) => node.label)
      .map((node) => {
        const el = document.createElement("span");
        el.className = "scene__label";
        el.textContent = node.label;
        overlay.appendChild(el);
        return { node, el };
      });

    /* ---- controls ---- */
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -0.05, 0);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = !reduced;
    controls.dampingFactor = 0.07;
    controls.minPolarAngle = 0.9;
    controls.maxPolarAngle = 1.35;
    controls.minAzimuthAngle = -0.55;
    controls.maxAzimuthAngle = 0.85;
    controls.autoRotate = !reduced;
    controls.autoRotateSpeed = 0.9;
    // let a vertical swipe scroll the page on touch screens
    renderer.domElement.style.touchAction = "pan-y";

    let resumeTimer = 0;
    controls.addEventListener("start", () => {
      controls.autoRotate = false;
      clearTimeout(resumeTimer);
    });
    controls.addEventListener("end", () => {
      clearTimeout(resumeTimer);
      if (!reduced) resumeTimer = setTimeout(() => (controls.autoRotate = true), 2500);
    });

    /* ---- post-processing ---- */
    const { composer, bloom } = createComposer(renderer, scene, camera);

    /* ---- state ---- */
    const offset = new Vector3();
    const projected = new Vector3();
    let fitDistance = 14;
    let time = 0;
    let orbitDirection = 1; // eased towards +1 / -1 so the sweep turns smoothly
    let orbitTarget = 1;
    let raf = 0;
    let last = 0;
    let visible = true;

    camera.position.setFromSpherical(new Spherical(fitDistance * 1.5, 1.05, 0.15)).add(controls.target);

    function setDistance(distance) {
      offset.copy(camera.position).sub(controls.target);
      offset.setLength(distance);
      camera.position.copy(controls.target).add(offset);
    }

    function updateLabels(t, width, height) {
      labels.forEach(({ node, el }) => {
        projected.copy(node.anchor).project(camera);
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height;
        const show = projected.z < 1 ? easeOutCubic(segment(t, node.delay + 0.5, 0.7)) : 0;
        el.style.opacity = String(show);
        el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
        const e = node.energy;
        el.style.color = `rgb(${LABEL_DIM.map((c, i) => Math.round(c + (LABEL_HOT[i] - c) * e)).join(",")})`;
      });
    }

    function step(dt) {
      time += dt;
      const t = reduced ? 99 : time;

      system.update(t, dt);
      if (flows && t > 2.2) flows.update(dt);

      // camera: dolly in on load, then a slow sweep that turns around smoothly
      setDistance(fitDistance * (1 + 0.5 * (1 - easeOutCubic(segment(t, 0, 2.4)))));
      if (!reduced) {
        const azimuth = controls.getAzimuthalAngle();
        if (azimuth <= controls.minAzimuthAngle + 0.06) orbitTarget = -1;
        else if (azimuth >= controls.maxAzimuthAngle - 0.06) orbitTarget = 1;
        orbitDirection = damp(orbitDirection, orbitTarget, 2.5, dt);
        controls.autoRotateSpeed = 0.9 * orbitDirection;
      }
      controls.update(dt || undefined);

      bloom.strength = 0.7 * easeOutCubic(segment(t, 1.2, 1.6));

      updateLabels(t, stage.clientWidth, stage.clientHeight);
      composer.render();
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      step(dt);
    }

    function start() {
      if (reduced || raf || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    function resize() {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      if (!width || !height) return;

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      system.lineMaterials.forEach((material) => material.resolution.set(width, height));

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const halfV = Math.tan(MathUtils.degToRad(camera.fov / 2));
      const halfH = halfV * camera.aspect;
      fitDistance = Math.max(11.4 / 2 / halfH, 4.8 / 2 / halfV);

      if (reduced || !raf) step(0);
    }

    // with reduced motion there is no loop, so redraw when the person drags
    const redraw = () => {
      if (!raf) step(0);
    };
    if (reduced) controls.addEventListener("change", redraw);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);

    // only animate while the diagram is on screen
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    intersection.observe(stage);

    resize();
    step(0);
    start();
    onReady?.();

    return () => {
      stop();
      clearTimeout(resumeTimer);
      resizeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      controls.dispose();
      flows?.dispose();
      system.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      overlay.remove();
    };
    // built once; the callbacks are only used at start-up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scene">
      <div className="scene__stage" ref={stageRef} aria-hidden="true" />
      <p className="sr-only">
        Diagram: Flutter apps send requests to a REST API on Spring Boot, which uses Hibernate to
        read and write a MySQL database.
      </p>
      <div className="scene__bar" aria-hidden="true">
        <span className="scene__caption" ref={captionRef}>
          waiting for requests
        </span>
        <span className="scene__hint">drag to rotate</span>
      </div>
    </div>
  );
}
