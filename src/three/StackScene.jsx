import { useEffect, useRef } from "react";
import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { createStage } from "./stage.js";
import { createWire, heat } from "./wire.js";
import { COLORS } from "./theme.js";
import { clamp01, damp, easeInOutCubic, easeOutCubic, easeOutExpo, lerp, segment } from "./easing.js";

/*
  The stack as four layers. A packet runs down a rail beside the layers and
  each layer lights up as it passes. Hover a card on the left to hold its
  layer lit and lift its parts.
*/

const ORDER = ["Platforms", "Client", "Backend", "Data"];
const GAP = 0.95;
const RAIL_X = 1.95;

export default function StackScene({ groups, activeRef, onReady, onError }) {
  const stageRef = useRef(null);
  const captionRef = useRef(null);

  useEffect(() => {
    const layers = [...groups].sort((a, b) => {
      const ia = ORDER.indexOf(a.label);
      const ib = ORDER.indexOf(b.label);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const count = layers.length;

    const rows = [];
    const packetMaterial = new MeshBasicMaterial({
      color: new Color(COLORS.packetRequest).multiplyScalar(2.2),
    });
    const packetGeometry = new BoxGeometry(0.11, 0.11, 0.11);
    const packet = new Mesh(packetGeometry, packetMaterial);
    let wire;
    let railMaterial;
    let shownIndex = -1;

    const setCaption = (text) => {
      if (captionRef.current) captionRef.current.textContent = text;
    };

    function tick(t, dt) {
      const hover = activeRef?.current ?? null;

      // packet: down the rail slowly, back up quickly, with a pause at each end
      const pt = (t - 1.8) % 5.4;
      let s = 0;
      if (t > 1.8) {
        if (pt < 3.2) s = easeInOutCubic(pt / 3.2);
        else if (pt < 3.5) s = 1;
        else if (pt < 4.9) s = 1 - easeOutCubic((pt - 3.5) / 1.4);
      }
      const packetY = lerp(rows[0].y, rows[count - 1].y, s);
      packet.position.set(RAIL_X, packetY, 0);
      packet.scale.setScalar(easeOutCubic(segment(t, 1.6, 0.4)));

      let brightest = -1;
      let best = 0.5;
      rows.forEach((row, i) => {
        const target = hover
          ? row.layer.label === hover
            ? 1
            : 0
          : clamp01(1 - Math.abs(packetY - row.y) / 0.45);
        row.energy = damp(row.energy, target, hover ? 8 : 12, dt);
        if (row.energy > best) {
          best = row.energy;
          brightest = i;
        }

        // layers drop in from above, the bottom one first
        const arrive = easeOutExpo(segment(t, row.delay, 0.9));
        row.holder.position.y = row.y + (1 - arrive) * 3;
        heat(row.material, row.energy, easeOutCubic(segment(t, row.delay, 0.5)));

        // the parts on the layer lift while it is lit
        row.lift = damp(row.lift, row.energy > 0.5 ? 0.28 : 0, 8, dt);
        row.items.forEach((item, k) => {
          item.position.y =
            0.28 + row.lift + Math.sin(t * 1.4 + k) * 0.02 * row.energy;
          item.scale.setScalar(easeOutExpo(segment(t, row.delay + 0.5 + k * 0.08, 0.6)) || 0.001);
        });
        row.label.energy = row.energy;
      });

      railMaterial.opacity = easeOutCubic(segment(t, 0.8, 1.0));

      if (brightest !== shownIndex) {
        shownIndex = brightest;
        if (brightest >= 0) {
          const { label, items } = rows[brightest].layer;
          setCaption(`${label.padEnd(10)}${items.join(", ")}`);
        }
      }
    }

    const stage = createStage(stageRef.current, {
      fov: 32,
      bloom: 0.7,
      orbit: {
        target: [0, 0, 0],
        azimuth: [-0.6, 0.6],
        polar: [0.95, 1.35],
        start: { azimuth: 0.3, polar: 1.12 },
        speed: 0.7,
      },
      fit: (halfV, halfH) => Math.max(7.2 / 2 / halfH, 5.6 / 2 / halfV),
      update: tick,
    });

    if (!stage) {
      onError?.();
      return undefined;
    }

    wire = createWire(stage);
    railMaterial = wire.lineMaterial(COLORS.line, 1);
    const slabGeometry = new BoxGeometry(3.4, 0.26, 2.2);
    const itemGeometry = new BoxGeometry(0.3, 0.3, 0.3);

    layers.forEach((layer, i) => {
      const y = ((count - 1) / 2 - i) * GAP;
      const delay = (count - 1 - i) * 0.14;

      const slab = wire.part(slabGeometry);
      const holder = slab.group;
      holder.position.y = y;

      const items = layer.items.map((_, k) => {
        const cube = wire.part(itemGeometry, { material: slab.material }).group;
        const spacing = 0.72;
        cube.position.set((k - (layer.items.length - 1) / 2) * spacing, 0.28, 0);
        holder.add(cube);
        return cube;
      });

      stage.scene.add(holder);
      const label = stage.addLabel(layer.label, new Vector3(-2.45, y + 0.1, 0), {
        delay,
      });
      rows.push({ layer, y, delay, holder, material: slab.material, items, label, energy: 0, lift: 0 });
    });

    // rail with a stub to each layer
    const top = rows[0].y;
    const bottom = rows[count - 1].y;
    const railPositions = [RAIL_X, top + 0.35, 0, RAIL_X, bottom - 0.35, 0];
    rows.forEach((row) => railPositions.push(1.7, row.y, 0, RAIL_X, row.y, 0));
    stage.scene.add(wire.line(railPositions, railMaterial));
    stage.scene.add(packet);

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
        Diagram of the stack as layers: platforms, client, backend and data.
      </p>
      <div className="scene__bar" aria-hidden="true">
        <span className="scene__caption" ref={captionRef}>
          stack layers
        </span>
        <span className="scene__hint">drag to rotate</span>
      </div>
    </div>
  );
}
