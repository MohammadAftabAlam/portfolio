import { Color, EdgesGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { COLORS } from "./theme.js";

/* Helpers for the schematic look: solid dark shapes with thin constant-width edges. */

const DIM = new Color(COLORS.edge);
const HOT = new Color(COLORS.edgeActive);

export function edgesOf(geometry, threshold = 20) {
  const edges = new EdgesGeometry(geometry, threshold);
  const positions = Array.from(edges.attributes.position.array);
  edges.dispose();
  return positions;
}

/** Line segments for a circle in the XZ plane. */
export function ring(radius, y = 0, count = 48) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const b = ((i + 1) / count) * Math.PI * 2;
    out.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    out.push(Math.cos(b) * radius, y, Math.sin(b) * radius);
  }
  return out;
}

/** Line segments for a rectangle in the XY plane at depth z. */
export function outline(width, height, z) {
  const x = width / 2;
  const y = height / 2;
  return [-x, -y, z, x, -y, z, x, -y, z, x, y, z, x, y, z, -x, y, z, -x, y, z, -x, -y, z];
}

/** Sets a line material's colour and width from an energy value (0 = dim, 1 = amber). */
export function heat(material, energy, opacity = 1) {
  material.opacity = opacity;
  material.color
    .copy(DIM)
    .lerp(HOT, energy)
    .multiplyScalar(1 + 0.9 * energy);
  material.linewidth = (material.userData.width ?? 1.4) + energy;
}

export function createWire(stage) {
  const materials = [];
  const geometries = [];

  const fill = new MeshBasicMaterial({
    color: COLORS.fill,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  materials.push(fill);

  function lineMaterial(color = COLORS.edge, width = 1.4) {
    const material = new LineMaterial({ color, linewidth: width, transparent: true, opacity: 0 });
    material.userData.width = width;
    stage.trackLine(material);
    materials.push(material);
    return material;
  }

  function line(positions, material) {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    geometries.push(geometry);
    return new LineSegments2(geometry, material);
  }

  /** A solid dark shape with an edge outline. Returns { group, material }. */
  function part(geometry, { extra = [], material = lineMaterial(), solid = true } = {}) {
    const group = new Group();
    geometries.push(geometry);
    if (solid) group.add(new Mesh(geometry, fill));
    group.add(line(edgesOf(geometry), material));
    extra.forEach((positions) => group.add(line(positions, material)));
    return { group, material };
  }

  function dispose() {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }

  return { fill, lineMaterial, line, part, dispose };
}
