import { useEffect, useRef } from "react";
import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { createStage } from "./stage.js";
import { createWire, ring } from "./wire.js";
import { COLORS } from "./theme.js";
import { clamp01, easeOutCubic, easeOutExpo, segment } from "./easing.js";

/*
  A wireframe globe that turns slowly, with a marker that sends out ping
  rings, and a satellite on a tilted orbit. Drag to spin it.
*/

const RADIUS = 1.25;
const PING_PERIOD = 2.6;
const LAT = (22 * Math.PI) / 180;
const LON = (35 * Math.PI) / 180;

function globeLines() {
  const out = [];
  // latitude rings
  [-60, -30, 0, 30, 60].forEach((deg) => {
    const lat = (deg * Math.PI) / 180;
    out.push(...ring(Math.cos(lat) * RADIUS, Math.sin(lat) * RADIUS, 64));
  });
  // meridians from pole to pole
  const steps = 40;
  for (let m = 0; m < 12; m += 1) {
    const lon = (m / 12) * Math.PI * 2;
    for (let i = 0; i < steps; i += 1) {
      const a = -Math.PI / 2 + (i / steps) * Math.PI;
      const b = -Math.PI / 2 + ((i + 1) / steps) * Math.PI;
      out.push(
        Math.cos(a) * Math.cos(lon) * RADIUS,
        Math.sin(a) * RADIUS,
        Math.cos(a) * Math.sin(lon) * RADIUS,
        Math.cos(b) * Math.cos(lon) * RADIUS,
        Math.sin(b) * RADIUS,
        Math.cos(b) * Math.sin(lon) * RADIUS
      );
    }
  }
  return out;
}

export default function ContactScene({ caption, onReady, onError }) {
  const stageRef = useRef(null);

  useEffect(() => {
    let wire;
    const disposables = [];
    const pings = [];
    let globe;
    let orbit;
    let satellite;
    let globeMaterial;
    let orbitMaterial;
    let label;
    let stage;
    const worldMarker = new Vector3();
    const toCamera = new Vector3();

    function tick(t) {
      const intro = easeOutCubic(segment(t, 0, 1.0));
      globe.rotation.y = t * 0.2;
      globeMaterial.opacity = intro;
      orbitMaterial.opacity = easeOutCubic(segment(t, 0.6, 1.0)) * 0.9;
      globe.scale.setScalar(0.85 + 0.15 * easeOutExpo(segment(t, 0, 1.1)));

      // satellite on the tilted orbit
      const angle = t * 0.55;
      satellite.position.set(Math.cos(angle) * 1.85, 0, Math.sin(angle) * 1.85);

      // ping rings expand from the marker and fade
      pings.forEach((ping, i) => {
        const local = (((t - 1.4 - i * (PING_PERIOD / 3)) % PING_PERIOD) + PING_PERIOD) % PING_PERIOD;
        const started = t > 1.4 + i * (PING_PERIOD / 3);
        const p = local / PING_PERIOD;
        const scale = 0.08 + easeOutExpo(p) * 0.62;
        ping.line.scale.setScalar(scale);
        ping.material.opacity = started ? Math.pow(1 - p, 1.4) : 0;
        ping.material.linewidth = 1.2 + 1.2 * (1 - p);
      });

      // keep the label on the marker and hide it when it turns away
      updateMarkerWorld();
      toCamera.copy(stage.camera.position).sub(worldMarker).normalize();
      const facing = worldMarker.clone().normalize().dot(toCamera);
      label.anchor.copy(worldMarker).multiplyScalar(1.12);
      label.fade = clamp01((facing - 0.1) / 0.3);
      label.energy = 0.6 + 0.4 * Math.sin(t * 2.2);
    }

    let markerMesh;
    function updateMarkerWorld() {
      markerMesh.getWorldPosition(worldMarker);
    }

    stage = createStage(stageRef.current, {
      fov: 32,
      bloom: 0.7,
      orbit: { target: [0, 0, 0], start: { azimuth: 0.3, polar: 1.3 }, polar: [0.6, 2.2] },
      fit: (halfV, halfH) => Math.max(4.6 / 2 / halfH, 4.6 / 2 / halfV),
      update: tick,
    });

    if (!stage) {
      onError?.();
      return undefined;
    }

    wire = createWire(stage);

    globe = new Group();
    const fillGeometry = new SphereGeometry(RADIUS * 0.995, 40, 28);
    disposables.push(fillGeometry);
    globe.add(new Mesh(fillGeometry, wire.fill));
    globeMaterial = wire.lineMaterial(COLORS.edge, 1.1);
    globe.add(wire.line(globeLines(), globeMaterial));
    stage.scene.add(globe);

    // marker on the surface
    const normal = new Vector3(
      Math.cos(LAT) * Math.cos(LON),
      Math.sin(LAT),
      Math.cos(LAT) * Math.sin(LON)
    );
    const markerGeometry = new BoxGeometry(0.1, 0.1, 0.1);
    const markerMaterial = new MeshBasicMaterial({
      color: new Color(COLORS.packetRequest).multiplyScalar(2.2),
    });
    disposables.push(markerGeometry, markerMaterial);
    markerMesh = new Mesh(markerGeometry, markerMaterial);
    markerMesh.position.copy(normal).multiplyScalar(RADIUS * 1.01);
    globe.add(markerMesh);

    // ping rings, lying flat on the surface at the marker
    const pingHolder = new Group();
    pingHolder.position.copy(normal).multiplyScalar(RADIUS * 1.012);
    pingHolder.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal));
    globe.add(pingHolder);
    for (let i = 0; i < 3; i += 1) {
      const material = new LineMaterial({
        color: new Color(COLORS.edgeActive).multiplyScalar(1.6),
        linewidth: 1.4,
        transparent: true,
        opacity: 0,
      });
      stage.trackLine(material);
      disposables.push(material);
      const line = wire.line(ring(1, 0, 48), material);
      pingHolder.add(line);
      pings.push({ line, material });
    }

    // tilted orbit with a satellite
    orbit = new Group();
    orbit.rotation.set(0.45, 0, 0.3);
    orbitMaterial = wire.lineMaterial(COLORS.line, 1);
    orbit.add(wire.line(ring(1.85, 0, 96), orbitMaterial));
    const satelliteGeometry = new BoxGeometry(0.09, 0.09, 0.09);
    const satelliteMaterial = new MeshBasicMaterial({
      color: new Color(COLORS.packetResponse).multiplyScalar(1.8),
    });
    disposables.push(satelliteGeometry, satelliteMaterial);
    satellite = new Mesh(satelliteGeometry, satelliteMaterial);
    orbit.add(satellite);
    stage.scene.add(orbit);

    label = stage.addLabel("open to roles", new Vector3(), { delay: 1.4 });

    stage.start();
    onReady?.();

    return () => {
      stage.dispose();
      wire.dispose();
      disposables.forEach((item) => item.dispose());
    };
    // built once; the callbacks are only used at start-up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scene">
      <div className="scene__stage" ref={stageRef} aria-hidden="true" />
      <p className="sr-only">Decorative wireframe globe.</p>
      <div className="scene__bar" aria-hidden="true">
        <span className="scene__caption">{caption}</span>
        <span className="scene__hint">drag to spin</span>
      </div>
    </div>
  );
}
