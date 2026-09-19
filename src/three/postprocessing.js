import { HalfFloatType, Vector2, WebGLRenderTarget } from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/*
  Render -> bloom -> output. Only the amber highlights are bright enough to
  pass the bloom threshold, so the dim schematic lines stay crisp and the
  active parts glow softly.
*/
export function createComposer(renderer, scene, camera) {
  // 4x multisampling keeps the thin lines smooth
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0, 0.6, 0.35);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return { composer, bloom };
}
