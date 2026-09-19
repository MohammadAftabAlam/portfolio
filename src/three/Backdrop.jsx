import { useEffect, useRef } from "react";
import {
  BoxGeometry,
  Color,
  EdgesGeometry,
  Fog,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineSegments,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { clamp01, damp, lerp } from "./easing.js";

/*
  Fixed behind the whole page: a faint floor grid that flows towards you and
  a few drifting wire boxes. As you scroll, the camera rises and the grid
  speeds up, then settles again. Everything is eased so it never jumps.
*/

const BACKGROUND = "#0b0e11";

// small seeded random generator so the boxes are the same on every visit
function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function Backdrop() {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;

    let renderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch (error) {
      return undefined;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color(BACKGROUND);
    scene.fog = new Fog(BACKGROUND, 10, 42);
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);

    const grid = new GridHelper(90, 90, "#222c37", "#19212a");
    grid.position.y = -2.5;
    scene.add(grid);

    // drifting wire boxes
    const random = seeded(7);
    const boxMaterial = new LineBasicMaterial({ color: "#26313e", transparent: true, opacity: 0.85 });
    const boxes = new Group();
    const boxGeometries = [];
    const items = [];
    for (let i = 0; i < 16; i += 1) {
      const size = 0.6 + random() * 1.8;
      const geometry = new EdgesGeometry(new BoxGeometry(size, size * (0.6 + random() * 0.8), size));
      boxGeometries.push(geometry);
      const mesh = new LineSegments(geometry, boxMaterial);
      mesh.position.set((random() - 0.5) * 30, -1.5 + random() * 8, -6 - random() * 26);
      mesh.rotation.set(random() * 3, random() * 3, 0);
      boxes.add(mesh);
      items.push({ mesh, spin: 0.05 + random() * 0.12, rise: 0.06 + random() * 0.12 });
    }
    scene.add(boxes);

    /* ---- eased scroll-linked state ---- */
    const lookAt = new Vector3();
    let progress = 0; // eased scroll position, 0 to 1
    let boost = 0; // eased extra speed while scrolling
    let flow = 0;
    let lastScroll = window.scrollY;
    let scrollTarget = 0;
    let raf = 0;
    let last = 0;

    function readScroll() {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scrollTarget = clamp01(window.scrollY / max);
    }

    function render(dt) {
      const scrollY = window.scrollY;
      const speed = dt > 0 ? Math.abs(scrollY - lastScroll) / dt : 0;
      lastScroll = scrollY;

      progress = damp(progress, scrollTarget, 3.5, dt);
      boost = damp(boost, Math.min(3, speed * 0.004), 4, dt);
      flow = (flow + dt * (0.3 + boost)) % 1;

      grid.position.z = flow; // one cell wide, so the loop is seamless
      items.forEach((item) => {
        item.mesh.rotation.y += dt * item.spin;
        item.mesh.position.y += dt * item.rise;
        if (item.mesh.position.y > 7) item.mesh.position.y = -2;
      });

      camera.position.set(Math.sin(progress * Math.PI * 2) * 1.2, lerp(0.8, 3.2, progress), 6);
      lookAt.set(0, lerp(-0.6, -2.6, progress), -12);
      camera.lookAt(lookAt);
      renderer.render(scene, camera);
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      render(dt);
    }

    function start() {
      if (reduced || raf || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    function resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      readScroll();
      if (reduced || !raf) render(0);
    }

    const onVisibility = () => (document.hidden ? stop() : start());
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", readScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    resize();
    start();
    // fade in once the first frame is drawn (the CSS transition eases it)
    requestAnimationFrame(() => host.classList.add("is-on"));

    return () => {
      stop();
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", readScroll);
      document.removeEventListener("visibilitychange", onVisibility);
      grid.geometry.dispose();
      [].concat(grid.material).forEach((material) => material.dispose());
      boxGeometries.forEach((geometry) => geometry.dispose());
      boxMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="backdrop" ref={hostRef} aria-hidden="true" />;
}
