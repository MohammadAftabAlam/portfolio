import { BoxGeometry, Color, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { APP_Z, X } from "./buildSystem.js";
import { COLORS } from "./theme.js";
import { clamp01, easeInOutCubic, easeOutCubic, lerp } from "./easing.js";

/*
  A request travels from one of the apps to the database and the response
  comes back. Each hop has its own duration and easing curve: requests
  ease in and out, responses snap out of the database quickly and settle.
*/

function waypoints(app) {
  const z = APP_Z[app];
  return [
    new Vector3(X.app + 0.25, 0, z),
    new Vector3(X.api - 0.08, 0, z),
    new Vector3(X.api + 0.08, 0, 0),
    new Vector3(X.service - 0.65, 0, 0),
    new Vector3(X.service + 0.65, 0, 0),
    new Vector3(X.orm - 0.16, 0, 0),
    new Vector3(X.orm + 0.16, 0, 0),
    new Vector3(X.db - 0.72, 0, 0),
  ];
}

const STEPS = [
  { move: [0, 1], dur: 0.55, ease: easeInOutCubic, hit: "api", phase: "request" },
  { move: [1, 3], dur: 0.6, ease: easeInOutCubic, hit: "service", phase: "request" },
  { move: [3, 5], dur: 0.55, ease: easeInOutCubic, hit: "orm", phase: "request" },
  { move: [5, 7], dur: 0.55, ease: easeInOutCubic, hit: "db", phase: "request" },
  { hold: 0.45, hit: "db", hitAtStart: true, phase: "query" },
  { move: [7, 6], dur: 0.3, ease: easeOutCubic, hit: "orm", phase: "response" },
  { move: [6, 4], dur: 0.4, ease: easeOutCubic, hit: "service", phase: "response" },
  { move: [4, 2], dur: 0.4, ease: easeOutCubic, hit: "api", phase: "response" },
  { move: [2, 0], dur: 0.45, ease: easeOutCubic, hit: "app", phase: "response" },
  { hold: 0.9, phase: "idle" },
];

class Flow {
  constructor(group, materials, app, delay, onHit) {
    this.materials = materials;
    this.onHit = onHit;
    this.mesh = new Mesh(new BoxGeometry(0.1, 0.1, 0.1), materials.request);
    this.mesh.visible = false;
    group.add(this.mesh);

    this.step = 0;
    this.time = -delay;
    this.setApp(app);
  }

  setApp(app) {
    this.app = app;
    this.path = waypoints(app);
    this.cumulative = [0];
    for (let i = 1; i < this.path.length; i += 1) {
      this.cumulative.push(
        this.cumulative[i - 1] + this.path[i].distanceTo(this.path[i - 1])
      );
    }
  }

  hit(step) {
    if (step.hit) this.onHit(step.hit === "app" ? `app${this.app}` : step.hit, step.phase, this.app);
  }

  sample(distance) {
    const { path, cumulative } = this;
    for (let i = 0; i < path.length - 1; i += 1) {
      if (distance <= cumulative[i + 1] || i === path.length - 2) {
        const span = cumulative[i + 1] - cumulative[i] || 1;
        this.mesh.position.lerpVectors(path[i], path[i + 1], clamp01((distance - cumulative[i]) / span));
        return;
      }
    }
  }

  update(dt) {
    this.time += dt;
    if (this.time < 0) {
      this.mesh.visible = false;
      return;
    }

    let step = STEPS[this.step];
    let duration = step.move ? step.dur : step.hold;
    while (this.time >= duration) {
      if (step.move) this.hit(step);
      this.time -= duration;
      this.step += 1;
      if (this.step >= STEPS.length) {
        this.step = 0;
        this.setApp((this.app + 1 + Math.floor(Math.random() * 2)) % 3);
      }
      step = STEPS[this.step];
      duration = step.move ? step.dur : step.hold;
      if (step.hitAtStart) this.hit(step);
    }

    if (step.move) {
      const progress = step.ease(clamp01(this.time / step.dur));
      const [from, to] = step.move;
      this.sample(lerp(this.cumulative[from], this.cumulative[to], progress));
      this.mesh.material = step.phase === "response" ? this.materials.response : this.materials.request;
      this.mesh.visible = true;
    } else {
      this.mesh.visible = false;
    }
  }
}

export function createFlows(group, onHit) {
  // Colours above 1.0 are intentional: they make the bloom pass glow.
  const materials = {
    request: new MeshBasicMaterial({ color: new Color(COLORS.packetRequest).multiplyScalar(2.2) }),
    response: new MeshBasicMaterial({ color: new Color(COLORS.packetResponse).multiplyScalar(1.8) }),
  };
  const flows = [
    new Flow(group, materials, 1, 0, onHit),
    new Flow(group, materials, 2, 2.4, onHit),
  ];

  return {
    update(dt) {
      flows.forEach((flow) => flow.update(dt));
    },
    dispose() {
      flows.forEach((flow) => flow.mesh.geometry.dispose());
      materials.request.dispose();
      materials.response.dispose();
    },
  };
}
