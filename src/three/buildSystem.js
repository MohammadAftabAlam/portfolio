import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { COLORS } from "./theme.js";
import { easeOutCubic, easeOutExpo, segment } from "./easing.js";

/*
  The system diagram, left to right:

    Flutter apps (x3)  ->  REST API  ->  Spring Boot  ->  Hibernate  ->  MySQL

  Every part is a solid dark box with thin, constant-width edge lines
  (three.js "fat lines"), so it reads like an engineering schematic.
*/

export const X = { app: -4.3, api: -2.2, service: 0, orm: 2.0, db: 4.1 };
export const APP_Z = [-1.15, 0, 1.15];

const DIM = new Color(COLORS.edge);
const HOT = new Color(COLORS.edgeActive);

function edgesOf(geometry, threshold = 20) {
  const edges = new EdgesGeometry(geometry, threshold);
  const positions = Array.from(edges.attributes.position.array);
  edges.dispose();
  return positions;
}

function ring(radius, y, count = 48) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const b = ((i + 1) / count) * Math.PI * 2;
    out.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    out.push(Math.cos(b) * radius, y, Math.sin(b) * radius);
  }
  return out;
}

function outline(width, height, z) {
  const x = width / 2;
  const y = height / 2;
  return [-x, -y, z, x, -y, z, x, -y, z, x, y, z, x, y, z, -x, y, z, -x, y, z, -x, -y, z];
}

export function createSystem() {
  const group = new Group();
  const nodes = [];
  const nodeById = {};
  const lineMaterials = [];
  const materials = [];

  const fillMaterial = new MeshBasicMaterial({
    color: COLORS.fill,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  materials.push(fillMaterial);

  function lineMaterial(color, width) {
    const material = new LineMaterial({
      color,
      linewidth: width,
      transparent: true,
      opacity: 0,
    });
    lineMaterials.push(material);
    materials.push(material);
    return material;
  }

  function lineFrom(positions, material) {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    return new LineSegments2(geometry, material);
  }

  function addNode({ id, x, z = 0, geometry, extra = [], label, anchorY, delay }) {
    const holder = new Group();
    holder.position.set(x, 0, z);
    holder.add(new Mesh(geometry, fillMaterial));

    const material = lineMaterial(COLORS.edge, 1.4);
    holder.add(lineFrom(edgesOf(geometry), material));
    extra.forEach((positions) => holder.add(lineFrom(positions, material)));
    group.add(holder);

    const node = {
      id,
      holder,
      material,
      energy: 0,
      label,
      anchor: new Vector3(x, anchorY, z),
      delay,
    };
    nodes.push(node);
    nodeById[id] = node;
  }

  APP_Z.forEach((z, i) =>
    addNode({
      id: `app${i}`,
      x: X.app,
      z,
      geometry: new BoxGeometry(0.5, 1.05, 0.09),
      extra: [outline(0.38, 0.9, 0.048)],
      label: i === 1 ? "Flutter apps ×3" : null,
      anchorY: 0.95,
      delay: 0,
    })
  );

  addNode({
    id: "api",
    x: X.api,
    geometry: new BoxGeometry(0.16, 1.5, 3.1),
    label: "REST API",
    anchorY: 1.15,
    delay: 0.12,
  });

  addNode({
    id: "service",
    x: X.service,
    geometry: new BoxGeometry(1.3, 1.25, 1.7),
    label: "Spring Boot",
    anchorY: 1.2,
    delay: 0.24,
  });

  addNode({
    id: "orm",
    x: X.orm,
    geometry: new BoxGeometry(0.32, 1.1, 1.7),
    label: "Hibernate",
    anchorY: 1.05,
    delay: 0.36,
  });

  addNode({
    id: "db",
    x: X.db,
    geometry: new CylinderGeometry(0.72, 0.72, 1.25, 32),
    extra: [ring(0.722, 0.21), ring(0.722, -0.21)],
    label: "MySQL",
    anchorY: 1.1,
    delay: 0.48,
  });

  // thin links between the parts
  const linkMaterial = lineMaterial(COLORS.line, 1);
  const link = (a, b) => group.add(lineFrom([...a, ...b], linkMaterial));
  APP_Z.forEach((z) => link([X.app + 0.25, 0, z], [X.api - 0.08, 0, z]));
  link([X.api + 0.08, 0, 0], [X.service - 0.65, 0, 0]);
  link([X.service + 0.65, 0, 0], [X.orm - 0.16, 0, 0]);
  link([X.orm + 0.16, 0, 0], [X.db - 0.72, 0, 0]);

  // faint floor grid
  const grid = new GridHelper(18, 36, COLORS.gridStrong, COLORS.grid);
  grid.position.y = -0.95;
  const gridMaterials = [].concat(grid.material);
  gridMaterials.forEach((material) => {
    material.transparent = true;
    material.opacity = 0;
  });
  group.add(grid);

  function update(t, dt) {
    nodes.forEach((node) => {
      const grow = easeOutExpo(segment(t, node.delay, 0.9));
      node.holder.scale.setScalar(Math.max(grow, 0.001));

      node.energy *= Math.exp(-dt * 2.4);
      node.material.opacity = easeOutCubic(segment(t, node.delay, 0.6));
      node.material.color
        .copy(DIM)
        .lerp(HOT, node.energy)
        .multiplyScalar(1 + 0.9 * node.energy);
      node.material.linewidth = 1.4 + 1.0 * node.energy;
    });

    linkMaterial.opacity = easeOutCubic(segment(t, 0.7, 1.0));
    gridMaterials.forEach((material) => {
      material.opacity = 0.9 * easeOutCubic(segment(t, 0, 1.4));
    });
  }

  function dispose() {
    group.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
    });
    materials.forEach((material) => material.dispose());
    gridMaterials.forEach((material) => material.dispose());
  }

  return { group, nodes, nodeById, lineMaterials, update, dispose };
}
