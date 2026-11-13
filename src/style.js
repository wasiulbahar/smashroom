// The two looks. Everything visual (materials, surfaces, lighting setup, post effects) goes through here.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Poly Haven CC0 textures in assets/textures (id_diff/nor/rough.jpg). color = the flat colour used by the stylized look.
export const SURF = {
  plywood: { id: 'plywood', color: 0x6c4f9e },
  rubber: { id: 'rubber_tiles', color: 0x4a3d5c },
  concreteFloor: { id: 'concrete_floor_damaged_01', color: 0x6b6670 },
  blockWall: { id: 'concrete_block_wall', color: 0x8a8494 },
  brick: { id: 'brick_wall_02', color: 0xa8553f },
  wallpaper: { id: 'decrepit_wallpaper', color: 0x4d3d5e },
  oldWood: { id: 'old_wood_floor', color: 0x6a4a34 },
  carpet: { id: 'dirty_carpet', color: 0x56607a },
  plaster: { id: 'painted_plaster_wall', color: 0xcfc6e0 },
  tiles: { id: 'floor_tiles_06', color: 0xd9d6cc },
  wallTiles: { id: 'dirty_tiles', color: 0x9fd6e0 },
  asphalt: { id: 'asphalt_02', color: 0x3c3a48 },
  rust: { id: 'rusty_metal_02', color: 0xb0603c, metal: 0.5 },
  wood: { id: 'kitchen_wood', color: 0x9b6a43 },
  steel: { id: 'metal_plate', color: 0x8d96a8, metal: 0.8 },
};

const loader = new THREE.TextureLoader();
const texCache = new Map();
function tex(id, kind, rx, ry) {
  const k = `${id}_${kind}_${rx}_${ry}`;
  if (!texCache.has(k)) {
    const t = loader.load(`assets/textures/${id}_${kind}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8;
    if (kind === 'diff') t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(k, t);
  }
  return texCache.get(k);
}

const grad = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x140d1f, side: THREE.BackSide });

export const QUALITY = {
  low: { pr: 1, shadow: 1024, post: false, ssao: false, transmission: false, chunks: 160 },
  medium: { pr: 1.5, shadow: 1024, post: true, ssao: false, transmission: true, chunks: 260 },
  high: { pr: 2, shadow: 2048, post: true, ssao: true, transmission: true, chunks: 360 },
};

// Guess what the device can handle, used for "Auto" quality.
export function detectGPU(renderer) {
  const mobile = matchMedia('(pointer:coarse)').matches;
  let name = '';
  try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ''; } catch (e) {}
  const weak = mobile || /intel|mali|adreno|powervr|apple gpu|swiftshader|llvmpipe|basic render/i.test(name);
  const strong = /rtx|gtx|radeon rx|radeon pro|arc a|apple m\d (pro|max|ultra)/i.test(name);
  return { name, mobile, tier: mobile ? 'low' : strong ? 'high' : weak ? 'medium' : 'medium', weak };
}

let envTex = null;
export function makeStyle(name, renderer, quality) {
  const realistic = name === 'realistic';
  const mats = new Map();
  const S = { name, realistic, quality, Q: QUALITY[quality], envI: 0.6, composer: null, grainPass: null };

  S.mat = (kind, color = 0xffffff, o = {}) => {
    const key = `${kind}|${color}|${o.map ? o.map.uuid : ''}`;
    if (mats.has(key)) return mats.get(key);
    let m;
    if (kind === 'screen' || kind === 'photo' || kind === 'emissive') {
      m = new THREE.MeshBasicMaterial({ color, map: o.map || null, toneMapped: kind !== 'emissive' });
    } else if (!realistic) {
      const glass = kind === 'glass' || kind === 'mirror' || kind === 'liquid';
      m = new THREE.MeshToonMaterial({ color: kind === 'mirror' ? 0xbfe6ff : color, gradientMap: grad, transparent: glass, opacity: glass ? 0.72 : 1, map: o.map || null });
    } else {
      const env = S.envI;
      if (kind === 'liquid') m = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.55, roughness: 0.05, depthWrite: false, envMapIntensity: env });
      else if (kind === 'glass') {
        m = S.Q.transmission
          ? new THREE.MeshPhysicalMaterial({ color, transmission: 0.92, roughness: 0.06, metalness: 0, ior: 1.5, thickness: 0.02, envMapIntensity: env * 1.6, transparent: true, side: THREE.DoubleSide })
          : new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.4, roughness: 0.05, envMapIntensity: env * 1.6, side: THREE.DoubleSide });
      } else if (kind === 'mirror') m = new THREE.MeshStandardMaterial({ color: 0xe8eef0, metalness: 1, roughness: 0.03, envMapIntensity: env * 2 });
      else if (kind === 'ceramic') m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: env });
      else if (kind === 'metal') m = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.32, envMapIntensity: env * 1.4 });
      else if (kind === 'paint') m = new THREE.MeshPhysicalMaterial({ color, metalness: 0.4, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: env * 1.2 });
      else if (kind === 'wood') m = new THREE.MeshStandardMaterial({ color, map: o.map || tex('kitchen_wood', 'diff', 1, 1), roughness: 0.7, envMapIntensity: env * 0.6 });
      else if (kind === 'stone') m = new THREE.MeshStandardMaterial({ color, map: tex('concrete_floor_damaged_01', 'diff', 0.5, 0.5), roughness: 0.95, envMapIntensity: env * 0.4 });
      else if (kind === 'clay') m = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, envMapIntensity: env * 0.5 });
      else if (kind === 'fabric') m = new THREE.MeshStandardMaterial({ color, roughness: 1, envMapIntensity: env * 0.3 });
      else m = new THREE.MeshStandardMaterial({ color, roughness: kind === 'electronics' ? 0.45 : 0.5, metalness: 0, envMapIntensity: env, map: o.map || null });
    }
    mats.set(key, m); return m;
  };

  // room surfaces: photo textures when realistic, flat colours when stylized
  S.surface = (sname, rx = 1, ry = 1, tint) => {
    const s = SURF[sname], key = `surf|${sname}|${rx}|${ry}|${tint}`;
    if (mats.has(key)) return mats.get(key);
    const m = realistic
      ? new THREE.MeshStandardMaterial({ color: tint ?? 0xffffff, map: tex(s.id, 'diff', rx, ry), normalMap: tex(s.id, 'nor', rx, ry), roughnessMap: tex(s.id, 'rough', rx, ry), metalness: s.metal || 0, envMapIntensity: S.envI * 0.7 })
      : new THREE.MeshToonMaterial({ color: tint ?? s.color, gradientMap: grad });
    mats.set(key, m); return m;
  };

  S.outline = (obj, k = 1.05) => {
    if (realistic) return obj;
    const list = []; obj.traverse(m => { if (m.isMesh && !m.userData.ol && !m.userData.noOutline) list.push(m); });
    for (const m of list) { const o = new THREE.Mesh(m.geometry, OUTLINE); o.userData.ol = true; o.scale.setScalar(k); o.castShadow = false; m.add(o); }
    return obj;
  };

  S.setup = (scene, camera, sceneDef) => {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = realistic && quality !== 'low' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    renderer.toneMapping = realistic ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = realistic ? (sceneDef.exposure ?? 1) : 1;
    if (realistic) {
      if (!envTex) { const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(renderer), 0.04).texture; pm.dispose(); }
      scene.environment = envTex;
    }
    S.setQuality(quality, scene, camera);
  };

  S.setQuality = (q, scene, camera) => {
    S.quality = q; S.Q = QUALITY[q];
    renderer.setPixelRatio(Math.min(devicePixelRatio, realistic ? S.Q.pr : 2));
    scene.traverse(o => { if (o.isLight && o.castShadow) { o.shadow.mapSize.set(S.Q.shadow, S.Q.shadow); o.shadow.map?.dispose(); o.shadow.map = null; } });
    if (S.composer) { S.composer.dispose?.(); S.composer = null; }
    if (realistic && S.Q.post) {
      const w = innerWidth, h = innerHeight, c = new EffectComposer(renderer);
      c.addPass(new RenderPass(scene, camera));
      if (S.Q.ssao) { const ao = new SSAOPass(scene, camera, w, h); ao.kernelRadius = 0.6; ao.minDistance = 0.002; ao.maxDistance = 0.06; c.addPass(ao); }
      c.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.5, 0.88));
      S.grainPass = new ShaderPass({
        uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
          void main(){ vec4 c=texture2D(tDiffuse,vUv); float n=fract(sin(dot(vUv*vec2(12.9898,78.233)+time,vec2(1.0)))*43758.5453);
          c.rgb+= (n-0.5)*0.035; float v=smoothstep(0.9,0.3,distance(vUv,vec2(0.5))); c.rgb*=mix(0.6,1.0,v); gl_FragColor=c; }` });
      c.addPass(S.grainPass); c.addPass(new OutputPass());
      c.setSize(w, h); S.composer = c;
    }
  };
  S.resize = (w, h) => S.composer && S.composer.setSize(w, h);
  S.render = (scene, camera, t) => {
    if (S.composer) { S.grainPass.uniforms.time.value = t % 10; S.composer.render(); } else renderer.render(scene, camera);
  };
  return S;
}

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.redraw = () => { draw(c.getContext('2d'), w, h); t.needsUpdate = true; };
  return t;
}
