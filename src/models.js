// CC0 glTF models from Poly Haven (assets/models). Used by the realistic look only; the simple shapes are the fallback.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map(), ready = new Map();

export function loadModel(id) {
  if (!cache.has(id)) cache.set(id, loader.loadAsync(`assets/models/${id}/${id}_1k.gltf`)
    .then(g => { g.scene.traverse(m => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } }); ready.set(id, g.scene); return g.scene; })
    .catch(() => null));
  return cache.get(id);
}

// breakable item -> model choices. 'id#name' takes only the pieces of a set whose name contains `name`.
export const ITEM_MODELS = {
  tv: ['Television_01'], crt: ['television_02'], pot: ['ceramic_pot'], chair: ['WoodenChair_01'], stool: ['wooden_stool_01'], crate: ['wooden_crate_01'],
  vase: ['ceramic_vase_01', 'ceramic_vase_02', 'ceramic_vase_03', 'ceramic_vase_04', 'antique_ceramic_vase_01'],
  laptop: ['classic_laptop'], lamp: ['desk_lamp_arm_01'], clock: ['alarm_clock_01', 'mantel_clock_01'], kettle: ['vintage_electric_kettle'], microwave: ['vintage_microwave'],
  jug: ['jug_01'], pan: ['brass_pan_01'], saucepan: ['pot_enamel_01'], speaker: ['boombox'],
  bottle: ['wine_bottles_01#bordeaux', 'wine_bottles_01#alsace', 'wine_bottles_01#burgundy', 'wine_bottles_01#champagne'],
  teapot: ['tea_set_01#teapot_01'], mug: ['tea_set_01#cup_small_01', 'tea_set_01#cup_small_02'],
  plate: ['tea_set_01#plate_large_circular', 'tea_set_01#saucer_circular_03', 'tea_set_01#saucer_circular_04'],
};
const fileOf = spec => spec.split('#')[0];
export const preloadItemModels = () => Promise.all([...new Set(Object.values(ITEM_MODELS).flat().map(fileOf))].map(loadModel));
const pieces = new Map();
function piece(spec) { // one item out of a set, keeping each part where it sits in the set
  if (pieces.has(spec)) return pieces.get(spec);
  const [id, name] = spec.split('#'), src = ready.get(id), g = new THREE.Group();
  src.updateMatrixWorld(true);
  src.traverse(o => { if (o.isMesh && o.name.includes(name)) { const c = o.clone(); o.matrixWorld.decompose(c.position, c.quaternion, c.scale); g.add(c); } });
  pieces.set(spec, g.children.length ? g : null); return pieces.get(spec);
}
export const itemModel = key => {
  const specs = (ITEM_MODELS[key] || []).filter(s => ready.get(fileOf(s)));
  if (!specs.length) return null;
  const s = specs[Math.floor(Math.random() * specs.length)];
  return s.includes('#') ? piece(s) : ready.get(s);
};

// Scale a copy of `src` uniformly so it fits inside `box` (or matches its height), sitting on the box's floor.
// mode 'height' = match height; 'item' = match height but never much wider than the box (keeps physics believable)
export function fitInto(src, box, mode = 'inside', ry = 0) {
  const m = src.clone(true); m.rotation.y = ry;
  const b = new THREE.Box3().setFromObject(m), size = b.getSize(new THREE.Vector3()), t = box.getSize(new THREE.Vector3());
  const s = mode === 'height' ? t.y / size.y
    : mode === 'item' ? Math.min(t.y / size.y, 1.4 * Math.max(t.x, t.z) / Math.max(size.x, size.z))
    : Math.min(t.x / size.x, t.y / size.y, t.z / size.z);
  m.scale.multiplyScalar(s);
  const b2 = new THREE.Box3().setFromObject(m), c = b2.getCenter(new THREE.Vector3()), tc = box.getCenter(new THREE.Vector3());
  m.position.add(new THREE.Vector3(tc.x - c.x, box.min.y - b2.min.y, tc.z - c.z));
  return m;
}
