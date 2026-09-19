import { useEffect, useRef } from "react";
import { BoxGeometry, Color, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { createStage } from "./stage.js";
import { createWire, heat, outline } from "./wire.js";
import { COLORS } from "./theme.js";
import { clamp01, easeInOutCubic, easeOutCubic, easeOutExpo, segment } from "./easing.js";

/*
  Three apps, each built once in Flutter and shipped to iOS and Android.
  A cube stands for the Dart codebase; packets fan out from it to the two
  phones, one app after another.
*/

const CENTERS = [-3.8, 0, 3.8];
const CUBE_Z = -1.5;
const PHONE_Z = 0.9;
const PHONE_DX = 0.55;
const CYCLE = 4.4;
const TRAVEL = 0.9;

export default function ExperienceScene({ onReady, onError }) {
  const stageRef = useRef(null);
  const captionRef = useRef(null);

  useEffect(() => {
    const groups = [];
    let wire;
    let packetGeometry;
    let packetMaterial;
    let linkMaterial;

    function tick(t, dt) {
      const decay = Math.exp(-dt * 2.2);
      linkMaterial.opacity = easeOutCubic(segment(t, 0.7, 1.0));

      groups.forEach((group, g) => {
        const arrive = easeOutExpo(segment(t, group.delay, 0.9));
        const drop = (1 - arrive) * 2.5;
        [group.cube, ...group.phones].forEach((part) => {
          part.group.position.y = drop;
        });
        [group.cube, ...group.phones].forEach((part) => {
          part.energy *= decay;
          heat(part.material, part.energy, easeOutCubic(segment(t, group.delay, 0.5)));
        });

        // one send cycle per app, staggered so they take turns
        const started = t - (2.0 + g * 1.4);
        const local = started < 0 ? -1 : started % CYCLE;
        if (local >= 0 && (group.last < 0 || local < group.last)) group.cube.energy = 1;
        if (local >= TRAVEL + 0.2 && group.last < TRAVEL + 0.2) {
          group.phones.forEach((phone) => (phone.energy = 1));
        }
        group.last = local;

        group.packets.forEach((packet, k) => {
          const moving = local >= 0.2 && local <= 0.2 + TRAVEL;
          if (moving) {
            const p = easeInOutCubic(clamp01((local - 0.2) / TRAVEL));
            packet.position.lerpVectors(group.from, group.to[k], p);
          }
          packet.visible = moving;
        });
      });

      groups[0].label.energy = groups[0].cube.energy;
    }

    const stage = createStage(stageRef.current, {
      fov: 32,
      bloom: 0.7,
      orbit: {
        target: [0, 0, 0],
        azimuth: [-0.5, 0.5],
        polar: [1.0, 1.35],
        start: { azimuth: 0.1, polar: 1.15 },
        speed: 0.6,
      },
      fit: (halfV, halfH) => Math.max(11.6 / 2 / halfH, 4.6 / 2 / halfV),
      update: tick,
    });

    if (!stage) {
      onError?.();
      return undefined;
    }

    wire = createWire(stage);
    packetGeometry = new BoxGeometry(0.1, 0.1, 0.1);
    packetMaterial = new MeshBasicMaterial({
      color: new Color(COLORS.packetRequest).multiplyScalar(2.2),
    });
    linkMaterial = wire.lineMaterial(COLORS.line, 1);
    const cubeGeometry = new BoxGeometry(0.75, 0.75, 0.75);
    const phoneGeometry = new BoxGeometry(0.6, 1.15, 0.08);

    CENTERS.forEach((cx, g) => {
      const delay = g * 0.16;

      const cube = wire.part(cubeGeometry);
      cube.group.position.set(cx, 0, CUBE_Z);
      cube.energy = 0;

      const phones = [-PHONE_DX, PHONE_DX].map((dx) => {
        const phone = wire.part(phoneGeometry, { extra: [outline(0.48, 1.0, 0.048)] });
        phone.group.position.set(cx + dx, 0, PHONE_Z);
        phone.energy = 0;
        return phone;
      });

      [cube, ...phones].forEach((part) => stage.scene.add(part.group));

      // thin links from the cube to each phone
      const from = new Vector3(cx, 0, CUBE_Z + 0.375);
      const to = phones.map((_, k) => new Vector3(cx + (k === 0 ? -PHONE_DX : PHONE_DX), 0, PHONE_Z - 0.04));
      const links = [];
      to.forEach((end) => links.push(from.x, from.y, from.z, end.x, end.y, end.z));
      stage.scene.add(wire.line(links, linkMaterial));

      const packets = to.map(() => {
        const packet = new Mesh(packetGeometry, packetMaterial);
        packet.visible = false;
        stage.scene.add(packet);
        return packet;
      });

      const label = stage.addLabel(`App ${g + 1}`, new Vector3(cx, 0.72, CUBE_Z), { delay });
      if (g === 0) {
        stage.addLabel("iOS", new Vector3(cx - PHONE_DX, 0.72, PHONE_Z), { delay: delay + 0.2 });
        stage.addLabel("Android", new Vector3(cx + PHONE_DX, 0.72, PHONE_Z), { delay: delay + 0.2 });
      }
      groups.push({ cube, phones, from, to, packets, label, delay, last: -1 });
    });

    stage.start();
    onReady?.();

    return () => {
      stage.dispose();
      wire.dispose();
      packetGeometry.dispose();
      packetMaterial.dispose();
    };
    // built once; the callbacks are only used at start-up
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scene">
      <div className="scene__stage" ref={stageRef} aria-hidden="true" />
      <p className="sr-only">
        Diagram: three apps, each built once in Flutter and delivered to both iOS and Android.
      </p>
      <div className="scene__bar" aria-hidden="true">
        <span className="scene__caption" ref={captionRef}>
          one Flutter codebase per app, shipped to iOS and Android
        </span>
        <span className="scene__hint">drag to rotate</span>
      </div>
    </div>
  );
}
