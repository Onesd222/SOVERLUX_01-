// 12주차 항공정비 인적요소 — 3D 수업 영상 (Three.js, 프레임 단위 결정적 렌더)
// window.renderAt(t) 가 시간 t(초)의 한 장면을 그린다. 실시간 재생에 의존하지 않는다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { C, STR, CAPS } from './content.js';

const W = 1920, H = 1080, DURATION = 114;
window.DURATION = DURATION;

// ---------------------------------------------------------------- 수학 도우미
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, x) => a + (b - a) * x;
const ss = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const sm = (a, b, t) => { const x = clamp((t - a) / (b - a)); return x * x * x * (x * (x * 6 - 15) + 10); };
const eOut = (a, b, t) => { const x = clamp((t - a) / (b - a)); return 1 - Math.pow(1 - x, 3); };
const back = (a, b, t, s = 1.4) => { const x = clamp((t - a) / (b - a)); return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
const win = (t, a, b, d = 0.4) => Math.min(ss(a, a + d, t), 1 - ss(b - d, b, t));
const mix3 = (p, q, x) => [lerp(p[0], q[0], x), lerp(p[1], q[1], x), lerp(p[2], q[2], x)];
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ---------------------------------------------------------------- 렌더러/장면
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.sky);
scene.fog = new THREE.Fog(C.sky, 80, 260);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 700);

const hemi = new THREE.HemisphereLight('#ffffff', '#93a3bb', 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e6', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 3;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#dfe8ff', 0.55);
fill.position.set(-30, 18, 40);
scene.add(fill, fill.target);
function setSun(f, ext) {
  sun.position.set(f[0] + 16, f[1] + 30, f[2] + 18);
  sun.target.position.set(f[0], f[1], f[2]);
  fill.position.set(f[0] - 30, f[1] + 18, f[2] + 40);
  fill.target.position.set(f[0], f[1], f[2]);
  const c = sun.shadow.camera;
  if (c.right !== ext) { c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 1; c.far = 120; c.updateProjectionMatrix(); }
}

const matCache = new Map();
function M(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.78, metalness: o.metal ?? 0, flatShading: o.flat ?? true,
    emissive: o.em ?? '#000000', emissiveIntensity: o.emi ?? 0, side: o.side ?? THREE.FrontSide });
  matCache.set(key, m);
  return m;
}
const U = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: 0, flatShading: o.flat ?? false,
  transparent: !!o.transparent, opacity: o.opacity ?? 1, emissive: o.em ?? '#000000', emissiveIntensity: o.emi ?? 0, depthWrite: o.depthWrite ?? true });

function add(parent, geo, mat, pos = [0, 0, 0], o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(pos[0], pos[1], pos[2]);
  if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  if (o.scale) m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.recv ?? true;
  parent.add(m);
  return m;
}
const grp = (parent, pos = [0, 0, 0]) => { const g = new THREE.Group(); g.position.set(...pos); parent.add(g); return g; };

// ---------------------------------------------------------------- 캔버스 텍스트
const PPU = 240; // 텍스처 해상도 (pixels per world unit)
const usedText = [];
const fnt = (w, px) => `${w} ${px}px "Noto Sans KR"`;
function fitFont(g, text, w, px, maxW) {
  let p = px; g.font = fnt(w, p);
  while (g.measureText(text).width > maxW && p > 8) { p -= 1; g.font = fnt(w, p); }
  usedText.push([fnt(w, p), text]);
  return p;
}
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function texFrom(cw, ch, draw) {
  const c = document.createElement('canvas'); c.width = Math.round(cw); c.height = Math.round(ch);
  const g = c.getContext('2d'); g.textBaseline = 'middle'; g.textAlign = 'center';
  draw(g, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  return t;
}
function textPlane(w, h, draw, o = {}) {
  const tex = texFrom(w * PPU, h * PPU, draw);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: o.depthWrite ?? true,
    opacity: 1, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.castShadow = false; m.receiveShadow = false;
  return m;
}
// 카메라를 향하는 라벨 (sprite). lines: [{t, px, w, c}]
function label(lines, o = {}) {
  const pad = o.pad ?? 26, gap = o.gap ?? 6;
  const mc = document.createElement('canvas').getContext('2d');
  let maxW = 0, totH = 0;
  for (const L of lines) { mc.font = fnt(L.w ?? 700, L.px); maxW = Math.max(maxW, mc.measureText(L.t).width); totH += L.px * 1.25; usedText.push([fnt(L.w ?? 700, L.px), L.t]); }
  totH += gap * (lines.length - 1);
  const cw = Math.ceil(maxW + pad * 2 + (o.extraW ?? 0)), ch = Math.ceil(totH + pad * 1.4);
  const tex = texFrom(cw, ch, (g) => {
    if (o.bg) { g.fillStyle = o.bg; rr(g, 3, 3, cw - 6, ch - 6, o.radius ?? 22); g.fill(); }
    if (o.border) { g.lineWidth = 6; g.strokeStyle = o.border; rr(g, 4, 4, cw - 8, ch - 8, o.radius ?? 22); g.stroke(); }
    let y = pad * 0.7;
    for (const L of lines) { g.font = fnt(L.w ?? 700, L.px); g.fillStyle = L.c ?? C.navy; y += L.px * 0.625; g.fillText(L.t, cw / 2, y + L.px * 0.04); y += L.px * 0.625 + gap; }
  });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: o.depthTest ?? false, depthWrite: false, toneMapped: false });
  const s = new THREE.Sprite(mat);
  const hh = o.height ?? 0.5;
  s.scale.set(hh * cw / ch, hh, 1);
  s.renderOrder = 10;
  return s;
}

// ---------------------------------------------------------------- 지면/격납고/활주로
const world = new THREE.Group(); scene.add(world);
const ground = add(world, new THREE.PlaneGeometry(3200, 900), M(C.ground, { flat: true, rough: 0.95 }), [500, 0, 0], { rot: [-Math.PI / 2, 0, 0], cast: false });
const apron = grp(world);
// 계류장 패널 줄눈
{
  const jm = M('#BCC7D4');
  for (let i = -6; i <= 8; i++) add(apron, new THREE.BoxGeometry(0.08, 0.004, 140), jm, [i * 10 - 5, 0.002, 10], { cast: false });
  for (let j = -4; j <= 9; j++) add(apron, new THREE.BoxGeometry(140, 0.004, 0.08), jm, [0, 0.002, j * 10], { cast: false });
  const yl = M(C.yellow, { rough: 0.6 });
  add(apron, new THREE.BoxGeometry(0.3, 0.01, 70), yl, [0, 0.006, 25], { cast: false });
  add(apron, new THREE.BoxGeometry(6, 0.01, 0.3), yl, [0, 0.006, 13.5], { cast: false });
  // 활주로 (마지막 장면 배경)
  add(apron, new THREE.BoxGeometry(900, 0.02, 36), M('#9DA9B9', { rough: 1 }), [0, 0.01, 96], { cast: false });
  const wm = M('#F4F7FB');
  for (let i = -30; i <= 30; i++) add(apron, new THREE.BoxGeometry(6, 0.03, 0.5), wm, [i * 14, 0.02, 96], { cast: false });
  add(apron, new THREE.BoxGeometry(900, 0.03, 0.4), wm, [0, 0.02, 80], { cast: false });
  add(apron, new THREE.BoxGeometry(900, 0.03, 0.4), wm, [0, 0.02, 112], { cast: false });
  // 먼 언덕 (저폴리)
  const hm = M('#B6C4D6', { rough: 1 });
  for (let i = 0; i < 9; i++) {
    const h = add(apron, new THREE.IcosahedronGeometry(30 + (i % 3) * 12, 0), hm, [-160 + i * 42, -14, 190 + (i % 2) * 25], { cast: false, scale: [1.6, 0.55, 0.8] });
    h.rotation.y = i * 1.3;
  }
}
// 격납고
{
  const hg = grp(apron, [0, 0, -50]);
  const wallM = M('#E9EEF4', { rough: 0.9 }), trim = M(C.navy2), inner = M('#AEB9C8', { rough: 1 });
  add(hg, new THREE.BoxGeometry(80, 22, 1), wallM, [0, 11, -26]);
  add(hg, new THREE.BoxGeometry(1, 22, 52), wallM, [-40, 11, 0]);
  add(hg, new THREE.BoxGeometry(1, 22, 52), wallM, [40, 11, 0]);
  const roof = new THREE.CylinderGeometry(40, 40, 53, 28, 1, true, Math.PI / 2, Math.PI);
  roof.rotateX(Math.PI / 2);
  const r = add(hg, roof, M('#DCE3EC', { side: THREE.DoubleSide }), [0, 22, 0], { scale: [1, 0.28, 1] });
  r.scale.set(1, 1, 1); r.geometry.scale(1, 0.28, 1);
  add(hg, new THREE.BoxGeometry(81, 2.4, 1.2), trim, [0, 21.6, 26]);
  add(hg, new THREE.PlaneGeometry(78, 51), inner, [0, 0.01, 0], { rot: [-Math.PI / 2, 0, 0], cast: false });
  for (const s of [-1, 1]) add(hg, new THREE.BoxGeometry(14, 20.4, 0.8), M('#C9D4E2'), [s * 33, 10.2, 26.6]);
  // 천장 조명 줄
  for (let i = -2; i <= 2; i++) add(hg, new THREE.BoxGeometry(0.6, 0.2, 40), M('#ffffff', { em: '#ffffff', emi: 0.6 }), [i * 12, 19.5, 0], { cast: false });
  // 콘
  const coneM = M(C.yellow), coneW = M('#ffffff');
  for (const p of [[-17.5, 0, -4], [17.5, 0, -4], [-9, 0, 15], [12, 0, 14]]) {
    const cg = grp(apron, p);
    add(cg, new THREE.ConeGeometry(0.32, 0.8, 8), coneM, [0, 0.42, 0]);
    add(cg, new THREE.CylinderGeometry(0.2, 0.23, 0.12, 8), coneW, [0, 0.48, 0]);
    add(cg, new THREE.BoxGeometry(0.7, 0.05, 0.7), coneM, [0, 0.025, 0]);
  }
}

// ---------------------------------------------------------------- 여객기 (일반형, 도장·로고 없음)
function makeAirliner() {
  const root = new THREE.Group();
  const g = new THREE.Group(); root.add(g); // 피치 회전용
  const white = M('#F4F7FB', { rough: 0.5 }), belly = M('#C7D1DE', { rough: 0.6 }), dark = M('#24334F', { rough: 0.3 }),
    metal = M('#D3DAE4', { rough: 0.45 }), tire = M('#2A2F38'), strut = M('#9AA6B6');
  const prof = [[0, -17.2], [0.55, -16.9], [1.15, -15.4], [1.6, -13.2], [1.9, -10.5], [1.95, -8], [1.95, 11.2], [1.85, 13.0], [1.55, 14.6], [1.1, 15.7], [0.55, 16.3], [0, 16.5]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const fg = new THREE.LatheGeometry(prof, 22);
  fg.rotateX(Math.PI / 2);
  const pa = fg.attributes.position;
  for (let i = 0; i < pa.count; i++) { const z = pa.getZ(i); if (z < -9) pa.setY(i, pa.getY(i) + (-9 - z) * 0.13); }
  fg.computeVertexNormals();
  add(g, fg, white, [0, 3.4, 0]);
  add(g, new THREE.SphereGeometry(1, 12, 8), belly, [0, 2.15, -0.8], { scale: [2.0, 0.85, 6.2] });
  // 창문
  const winG = new THREE.BoxGeometry(0.08, 0.3, 0.22);
  const nW = 26, inst = new THREE.InstancedMesh(winG, dark, nW * 2);
  const mm = new THREE.Matrix4(); let k = 0;
  for (const s of [-1, 1]) for (let i = 0; i < nW; i++) { mm.makeTranslation(s * 1.93, 3.95, -9.6 + i * 0.82); inst.setMatrixAt(k++, mm); }
  g.add(inst);
  // 조종실 창
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(0.62, 0.3, 0.5), dark, [s * 0.55, 4.42, 14.25], { rot: [0.55, s * 0.35, 0] });
    add(g, new THREE.BoxGeometry(0.4, 0.28, 0.5), dark, [s * 1.15, 4.3, 13.95], { rot: [0.4, s * 0.85, 0] });
  }
  // 도어 윤곽 (얇은 선)
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.04, 1.6, 0.85), M('#DCE3EC'), [s * 1.95, 3.6, 12.0]);
  // 날개
  function wing(pts, y, z, dih) {
    const sh = new THREE.Shape(pts.map(([x, zz]) => new THREE.Vector2(x, -zz)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
    geo.rotateX(-Math.PI / 2);
    const m = add(g, geo, white, [0, y, z]);
    m.rotation.z = dih;
    return m;
  }
  wing([[1.4, 3.6], [1.4, -4.2], [17.2, -8.6], [17.2, -6.7]], 2.25, 0, 0.06);
  wing([[-1.4, 3.6], [-17.2, -6.7], [-17.2, -8.6], [-1.4, -4.2]], 2.25, 0, -0.06);
  for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.16, 1.5, 1.6), white, [s * 17.15, 3.65, -7.7], { rot: [0, 0, -s * 0.12] });
  wing([[0.6, -12.6], [0.6, -15.9], [6.6, -17.6], [6.6, -16.2]], 4.15, 0, 0.1);
  wing([[-0.6, -12.6], [-6.6, -16.2], [-6.6, -17.6], [-0.6, -15.9]], 4.15, 0, -0.1);
  // 수직꼬리
  {
    const sh = new THREE.Shape([[-11.2, 4.8], [-16.9, 4.8], [-18.1, 11.4], [-16.0, 11.4]].map(([a, b]) => new THREE.Vector2(a, b)));
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 });
    geo.rotateY(-Math.PI / 2);
    add(g, geo, white, [0.17, 0, 0]);
  }
  // 엔진
  for (const s of [-1, 1]) {
    const e = grp(g, [s * 5.6, 1.45, 2.4]);
    const n = new THREE.CylinderGeometry(0.92, 0.78, 3.7, 18, 1, true); n.rotateX(Math.PI / 2);
    add(e, n, metal);
    const lip = new THREE.TorusGeometry(0.86, 0.08, 6, 18); add(e, lip, metal, [0, 0, 1.85]);
    add(e, new THREE.CircleGeometry(0.86, 18), dark, [0, 0, 1.7]);
    const sp = new THREE.ConeGeometry(0.28, 0.5, 10); sp.rotateX(Math.PI / 2); add(e, sp, white, [0, 0, 1.9]);
    add(e, new THREE.CircleGeometry(0.62, 16), dark, [0, 0, -1.84], { rot: [0, Math.PI, 0] });
    add(g, new THREE.BoxGeometry(0.26, 0.9, 2.8), white, [s * 5.6, 2.25, 1.2]);
  }
  // 착륙장치
  const gear = grp(g);
  add(gear, new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6), strut, [0, 1.05, 12.6]);
  for (const s of [-1, 1]) { const w = new THREE.CylinderGeometry(0.4, 0.4, 0.24, 12); w.rotateZ(Math.PI / 2); add(gear, w, tire, [s * 0.2, 0.4, 12.6]); }
  for (const s of [-1, 1]) {
    add(gear, new THREE.CylinderGeometry(0.13, 0.13, 1.9, 6), strut, [s * 2.5, 1.35, -1.6]);
    for (const dz of [-0.45, 0.45]) for (const dx of [-0.24, 0.24]) {
      const w = new THREE.CylinderGeometry(0.55, 0.55, 0.3, 14); w.rotateZ(Math.PI / 2);
      add(gear, w, tire, [s * 2.5 + dx, 0.55, -1.6 + dz]);
    }
  }
  root.userData = { pitch: g, gear };
  return root;
}
const plane = makeAirliner(); world.add(plane);

// ---------------------------------------------------------------- 사람 (얼굴 없는 저폴리)
function makePerson(kind) {
  const g = new THREE.Group();
  const isT = kind === 'tech';
  const pants = M(isT ? C.navy : '#4A5263'), top = M(isT ? C.navy2 : '#34425F'), skin = M(C.skin), shoe = M('#22262E');
  for (const s of [-1, 1]) {
    add(g, new THREE.CylinderGeometry(0.1, 0.085, 0.84, 7), pants, [s * 0.12, 0.5, 0]);
    add(g, new THREE.BoxGeometry(0.15, 0.09, 0.28), shoe, [s * 0.12, 0.045, 0.04]);
  }
  add(g, new THREE.CylinderGeometry(0.23, 0.22, 0.18, 8), pants, [0, 0.95, 0]);
  add(g, new THREE.CylinderGeometry(0.255, 0.225, 0.62, 8), top, [0, 1.28, 0]);
  if (isT) {
    add(g, new THREE.CylinderGeometry(0.268, 0.238, 0.5, 8), M(C.vest, { rough: 0.6 }), [0, 1.25, 0]);
    const st = M('#F2F5FA', { em: '#ffffff', emi: 0.25, rough: 0.3 });
    add(g, new THREE.CylinderGeometry(0.253, 0.249, 0.05, 8), st, [0, 1.13, 0]);
    add(g, new THREE.CylinderGeometry(0.265, 0.26, 0.05, 8), st, [0, 1.35, 0]);
  } else {
    add(g, new THREE.BoxGeometry(0.14, 0.24, 0.02), M('#F4F6FA'), [0, 1.45, 0.238], { rot: [-0.05, 0, 0] });
    add(g, new THREE.BoxGeometry(0.045, 0.24, 0.02), M(C.navy), [0, 1.41, 0.25], { rot: [-0.05, 0, 0] });
  }
  add(g, new THREE.CylinderGeometry(0.065, 0.07, 0.1, 6), skin, [0, 1.62, 0]);
  const headG = grp(g, [0, 1.64, 0]);
  add(headG, new THREE.IcosahedronGeometry(0.155, 1), skin, [0, 0.15, 0]);
  if (isT) {
    add(headG, new THREE.SphereGeometry(0.165, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(C.navy), [0, 0.19, 0]);
    add(headG, new THREE.BoxGeometry(0.24, 0.025, 0.16), M(C.navy), [0, 0.2, 0.17], { rot: [0.12, 0, 0] });
  } else {
    add(headG, new THREE.SphereGeometry(0.163, 10, 6, 0, Math.PI * 2, 0, Math.PI / 1.9), M('#3B312C'), [0, 0.17, -0.012], { rot: [-0.15, 0, 0] });
  }
  const arms = {};
  for (const s of [-1, 1]) {
    const sh = grp(g, [s * 0.3, 1.53, 0]);
    add(sh, new THREE.CylinderGeometry(0.068, 0.06, 0.36, 6), top, [0, -0.18, 0]);
    const el = grp(sh, [0, -0.36, 0]);
    add(el, new THREE.CylinderGeometry(0.06, 0.052, 0.32, 6), top, [0, -0.16, 0]);
    add(el, new THREE.IcosahedronGeometry(0.06, 0), skin, [0, -0.34, 0]);
    sh.rotation.z = s * 0.1;
    arms[s] = { sh, el };
  }
  g.userData = { headG, arms };
  return g;
}
function holdTablet(p) {
  for (const s of [-1, 1]) { p.userData.arms[s].sh.rotation.set(-0.3, 0, -s * 0.12); p.userData.arms[s].el.rotation.set(-1.15, 0, 0); }
  const tg = grp(p, [0, 1.17, 0.42]);
  tg.rotation.x = -2.0;
  add(tg, new THREE.BoxGeometry(0.4, 0.28, 0.025), M('#2A3550'));
  add(tg, new THREE.PlaneGeometry(0.35, 0.23), M('#BFD6F2', { em: '#9ec5f5', emi: 0.6 }), [0, 0, 0.014], { cast: false });
  return tg;
}

// ---------------------------------------------------------------- 장면 2·3 소품 (계류장 앞)
const s23 = grp(world);
const tech = makePerson('tech'); tech.position.set(-4, 0, 19); tech.rotation.y = 0.3; s23.add(tech);
const planner = makePerson('planner'); planner.position.set(4, 0, 19); planner.rotation.y = -0.35; s23.add(planner);
holdTablet(planner);
// 책상 + 모니터
{
  const d = grp(s23, [5.5, 0, 18.3]); d.rotation.y = -0.3;
  add(d, new THREE.BoxGeometry(1.6, 0.06, 0.8), M('#E9EEF4'), [0, 0.75, 0]);
  for (const x of [-0.72, 0.72]) for (const z of [-0.33, 0.33]) add(d, new THREE.BoxGeometry(0.05, 0.75, 0.05), M(C.gb4), [x, 0.375, z]);
  add(d, new THREE.BoxGeometry(0.75, 0.46, 0.04), M('#2A3550'), [0, 1.13, -0.2]);
  add(d, new THREE.BoxGeometry(0.06, 0.3, 0.06), M(C.gb4), [0, 0.9, -0.22]);
  const scr = textPlane(0.68, 0.39, (g, w, h) => {
    g.fillStyle = '#DCE8F7'; g.fillRect(0, 0, w, h);
    g.fillStyle = C.navy2; for (let i = 0; i < 5; i++) g.fillRect(14 + i * 30, h - 14 - (20 + i * 9), 18, 20 + i * 9);
    g.fillStyle = C.yellow; g.fillRect(14, 12, 70, 8);
  });
  scr.position.set(0, 1.13, -0.178); d.add(scr);
}
// 일정판
{
  const b = grp(s23, [5.0, 0, 16.9]); b.rotation.y = -0.25;
  add(b, new THREE.BoxGeometry(2.7, 1.65, 0.08), M('#F4F7FB'), [0, 2.05, 0]);
  for (const x of [-1.2, 1.2]) add(b, new THREE.BoxGeometry(0.07, 2.0, 0.07), M(C.gb4), [x, 1.0, 0]);
  const tp = textPlane(2.6, 1.55, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = C.navy; g.fillRect(0, 0, w, 60);
    const x0 = 40, x1 = w - 30;
    g.font = fnt(700, 34);
    STR.board.forEach((s, i) => { const x = x0 + (x1 - x0) * i / 6; g.fillStyle = '#ffffff'; g.fillText(s, x, 31); g.fillStyle = '#E3E9F1'; g.fillRect(x - 1, 62, 2, h - 62); });
    usedText.push([fnt(700, 34), STR.board.join('')]);
    const rows = [[0.05, 0.3, C.navy2], [0.2, 0.55, C.gb3], [0.45, 0.62, C.yellow], [0.6, 0.85, C.navy2], [0.3, 0.5, C.gb3], [0.7, 0.95, C.gb3]];
    rows.forEach(([a, bb, col], i) => { g.fillStyle = col; rr(g, x0 + (x1 - x0) * a, 86 + i * 50, (x1 - x0) * (bb - a), 32, 10); g.fill(); });
  });
  tp.position.set(0, 2.05, 0.045); b.add(tp);
}
// 스톱워치
function makeStopwatch() {
  const g = new THREE.Group();
  const body = new THREE.CylinderGeometry(0.6, 0.6, 0.2, 28); body.rotateX(Math.PI / 2);
  add(g, body, M(C.navy, { flat: false, rough: 0.4 }));
  add(g, new THREE.TorusGeometry(0.6, 0.06, 8, 28), M(C.yellow, { flat: false }), [0, 0, 0.08]);
  add(g, new THREE.CylinderGeometry(0.09, 0.09, 0.18, 10), M(C.navy), [0, 0.72, 0]);
  add(g, new THREE.BoxGeometry(0.26, 0.08, 0.14), M(C.yellow), [0, 0.83, 0]);
  add(g, new THREE.BoxGeometry(0.12, 0.08, 0.1), M(C.navy), [0.42, 0.5, 0], { rot: [0, 0, -0.7] });
  const face = textPlane(1.04, 1.04, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = C.navy; c.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * Math.PI * 2, r0 = i % 5 ? w * 0.41 : w * 0.36, r1 = w * 0.45;
      c.lineWidth = i % 5 ? 3 : 8;
      c.beginPath(); c.moveTo(w / 2 + Math.sin(a) * r0, h / 2 - Math.cos(a) * r0); c.lineTo(w / 2 + Math.sin(a) * r1, h / 2 - Math.cos(a) * r1); c.stroke();
    }
    c.fillStyle = 'rgba(214,58,58,0.18)'; c.beginPath(); c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, w * 0.34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 35 / 60); c.fill();
  });
  face.position.z = 0.105; g.add(face);
  const hand = grp(g, [0, 0, 0.13]);
  add(hand, new THREE.BoxGeometry(0.05, 0.46, 0.02), M(C.red, { em: C.red, emi: 0.3 }), [0, 0.2, 0], { cast: false });
  add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10).rotateX(Math.PI / 2), M(C.navy), [0, 0, 0.14]);
  g.userData.hand = hand;
  return g;
}
const watch = makeStopwatch(); watch.position.set(-4, 2.45, 19.1); s23.add(watch);
// 연결선 + 목표 아이콘
const joinCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-3.55, 1.85, 19.1), new THREE.Vector3(0, 3.9, 19.4), new THREE.Vector3(3.55, 1.95, 19.1));
const joinGeo = new THREE.TubeGeometry(joinCurve, 64, 0.045, 8, false);
const joinMat = U(C.yellow, { em: C.yellow, emi: 0.5, transparent: true });
const joinLine = add(s23, joinGeo, joinMat, [0, 0, 0], { cast: false });
const goal = grp(s23, [0, 2.95, 19.3]);
{
  add(goal, new THREE.TorusGeometry(0.34, 0.05, 8, 28), M(C.yellow, { flat: false, em: C.yellow, emi: 0.3 }), [0, 0, 0], { cast: false });
  add(goal, new THREE.TorusGeometry(0.2, 0.045, 8, 24), M(C.navy, { flat: false }), [0, 0, 0], { cast: false });
  add(goal, new THREE.CircleGeometry(0.08, 16), M(C.yellow, { em: C.yellow, emi: 0.3 }), [0, 0, 0], { cast: false });
}
// 디지털 시계 13:00
const clock = grp(s23, [0, 4.35, 19]);
{
  add(clock, new RoundedBoxGeometry(2.3, 0.95, 0.32, 3, 0.12), U(C.navy, { rough: 0.5 }));
  const tp = textPlane(2.02, 0.7, (g, w, h) => {
    g.fillStyle = '#0F1A30'; rr(g, 0, 0, w, h, 26); g.fill();
    g.font = fnt(900, 140); g.fillStyle = '#FFF3C4'; g.fillText(STR.clock, w / 2, h / 2 + 8);
    usedText.push([fnt(900, 140), STR.clock]);
  });
  tp.position.z = 0.165; clock.add(tp);
  add(clock, new THREE.BoxGeometry(0.1, 0.45, 0.1), M(C.gb4), [0, -0.7, 0]);
}
// 말풍선
const bubble = grp(s23, [1.75, 3.15, 19.5]);
{
  add(bubble, new RoundedBoxGeometry(3.5, 0.95, 0.16, 3, 0.2), U('#ffffff', { rough: 0.5 }));
  const tail = new THREE.ConeGeometry(0.22, 0.75, 4); tail.rotateZ(Math.PI * 0.78);
  add(bubble, tail, U('#ffffff'), [1.25, -0.6, 0], { scale: [1, 1, 0.3] });
  const tp = textPlane(3.3, 0.8, (g, w, h) => {
    g.fillStyle = C.navy; fitFont(g, STR.bubble, 900, 112, w - 50); g.fillText(STR.bubble, w / 2, h / 2 + 6);
  });
  tp.position.z = 0.085; bubble.add(tp);
}
// 막대 두 개 (35분 / 20분)
const barsG = grp(s23, [-1.3, 0, 20.7]);
const PER_MIN = 0.065;
const ped3 = add(barsG, new RoundedBoxGeometry(3.6, 0.45, 1.7, 2, 0.06), U('#F4F7FB'), [0, 0.225, 0]);
const bar35 = add(barsG, new THREE.BoxGeometry(1.0, 1, 1.0).translate(0, 0.5, 0), U(C.navy2, { rough: 0.5 }), [-0.85, 0.45, 0]);
const bar20 = add(barsG, new THREE.BoxGeometry(1.0, 1, 1.0).translate(0, 0.5, 0), U(C.gb3, { rough: 0.5 }), [0.85, 0.45, 0]);
const gapMat = U(C.yellow, { transparent: true, opacity: 0.35, em: C.yellow, emi: 0.4, depthWrite: false });
const gapH = 15 * PER_MIN;
const gapBox = add(barsG, new THREE.BoxGeometry(1.04, gapH, 1.04).translate(0, gapH / 2, 0), gapMat, [0.85, 0.45 + 20 * PER_MIN, 0], { cast: false });
const gapEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.06, gapH, 1.06).translate(0, gapH / 2, 0)), new THREE.LineBasicMaterial({ color: C.yellow, transparent: true }));
gapEdge.position.copy(gapBox.position); barsG.add(gapEdge);
const lab35 = label([{ t: STR.bar35[0], px: 52, w: 700, c: C.navy3 }, { t: STR.bar35[1], px: 84, w: 900, c: C.navy }], { height: 0.7 });
lab35.position.set(-0.85, 0.24, 0.95); barsG.add(lab35);
const lab20 = label([{ t: STR.bar20[0], px: 52, w: 700, c: C.navy3 }, { t: STR.bar20[1], px: 84, w: 900, c: C.navy }], { height: 0.7 });
lab20.position.set(0.85, 0.24, 0.95); barsG.add(lab20);
const labGap = label([{ t: STR.gap, px: 76, w: 900, c: C.navy }], { height: 0.42, bg: C.yellow, radius: 30 });
labGap.position.set(2.35, 0.45 + 27.5 * PER_MIN, 0.2); barsG.add(labGap);

// ---------------------------------------------------------------- 스튜디오 (장면 4~8)
const STUDIO_X = 1000;
const studio = grp(world, [STUDIO_X, 0, 0]);
add(studio, new THREE.CircleGeometry(150, 64), M('#DCE4EE', { rough: 1 }), [130, 0.01, 0], { rot: [-Math.PI / 2, 0, 0], cast: false });
{
  const gm = M('#CED8E4');
  for (let i = -8; i <= 30; i++) add(studio, new THREE.BoxGeometry(0.05, 0.004, 120), gm, [i * 8, 0.015, 0], { cast: false });
  for (let j = -7; j <= 7; j++) add(studio, new THREE.BoxGeometry(320, 0.004, 0.05), gm, [120, 0.015, j * 8], { cast: false });
}

// ---- 장면 4: 게이지
const L4 = [0, 0, 0];
const s4 = grp(studio, L4);
const GC = [0, 1.75, 0]; // 게이지 중심
const vToA = (v) => Math.PI - v / 2 * Math.PI;
function sector(r0, r1, v0, v1, depth, mat) {
  const a0 = vToA(v0), a1 = vToA(v1);
  const s = new THREE.Shape(); s.absarc(0, 0, r1, a0, a1, true); s.absarc(0, 0, r0, a1, a0, false);
  const geo = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 40 });
  return add(s4, geo, mat, [GC[0], GC[1], 0.12]);
}
add(s4, new RoundedBoxGeometry(4.6, 1.75, 1.4, 2, 0.08), U('#F4F7FB'), [0, 0.875, 0]);
{
  const sh = new THREE.Shape(); sh.absarc(0, 0, 3.55, 0, Math.PI, false); sh.lineTo(-3.55, 0);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false, curveSegments: 48 });
  add(s4, geo, U(C.navy, { rough: 0.6 }), [GC[0], GC[1], -0.02]);
}
const zMat = [U(C.calm, { em: C.calm, emi: 0 }), U(C.yellow, { em: C.yellow, emi: 0 }), U(C.red, { em: C.red, emi: 0 })];
const zones = [sector(2.3, 3.15, 0, 0.79, 0.3, zMat[0]), sector(2.3, 3.15, 0.81, 0.99, 0.3, zMat[1]), sector(2.3, 3.15, 1.01, 2.0, 0.3, zMat[2])];
for (const v of [0, 0.5, 0.8, 1.0, 1.5, 2.0]) {
  const a = vToA(v), major = [0, 0.8, 1.0, 2.0].includes(v);
  const tk = add(s4, new THREE.BoxGeometry(major ? 0.07 : 0.045, major ? 0.42 : 0.26, 0.06), M('#ffffff'), [GC[0] + Math.cos(a) * 3.38, GC[1] + Math.sin(a) * 3.38, 0.2], { cast: false });
  tk.rotation.z = a - Math.PI / 2;
}
STR.ticks.forEach((s, i) => {
  const v = [0, 0.8, 1.0, 2.0][i], a = vToA(v);
  const lb = label([{ t: s, px: 70, w: 900, c: C.navy }], { height: 0.42 });
  const r = 3.98;
  lb.position.set(GC[0] + Math.cos(a) * r, GC[1] + Math.sin(a) * r + (i === 0 || i === 3 ? 0.25 : 0), 0.3);
  s4.add(lb);
});
const needle = grp(s4, [GC[0], GC[1], 0.5]);
{
  const sh = new THREE.Shape([new THREE.Vector2(-0.13, 0), new THREE.Vector2(0.13, 0), new THREE.Vector2(0.025, 2.85), new THREE.Vector2(-0.025, 2.85)]);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false });
  add(needle, geo, M('#ffffff', { rough: 0.4 }), [0, 0, 0]);
  add(needle, new THREE.CylinderGeometry(0.3, 0.3, 0.25, 20).rotateX(Math.PI / 2), M(C.yellow, { flat: false }), [0, 0, 0.05]);
  add(needle, new THREE.CylinderGeometry(0.14, 0.14, 0.3, 16).rotateX(Math.PI / 2), M(C.navy, { flat: false }), [0, 0, 0.08]);
}
const readout = label([{ t: STR.readout[0], px: 110, w: 900, c: '#ffffff' }, { t: STR.readout[1], px: 56, w: 900, c: '#ffffff' }], { height: 1.05, bg: C.red, radius: 34, pad: 30, extraW: 60 });
readout.position.set(0, GC[1] + 1.2, 0.85); s4.add(readout);

// ---- 장면 5·6: 기록 카드 → 기록 더미 → 막대그래프
const L5 = [60, 0, 0];
const s5 = grp(studio, L5);
const CARD_W = [2.0, 2.0, 1.7, 2.0, 1.9, 3.0, 3.1], CARD_H = 1.4, GAPX = 0.16;
const ROW_W = CARD_W.reduce((a, b) => a + b, 0) + GAPX * (CARD_W.length - 1);
function drawCell(g, x, y, w, h, field, value, scale = 1) {
  g.fillStyle = '#ffffff'; rr(g, x, y, w, h, 22 * scale); g.fill();
  g.fillStyle = '#E3EAF3'; rr(g, x, y, w, h * 0.36, 22 * scale); g.fill(); g.fillRect(x, y + h * 0.2, w, h * 0.16);
  g.fillStyle = C.yellow; g.fillRect(x, y + h * 0.36 - 5 * scale, w, 5 * scale);
  g.fillStyle = C.navy3; fitFont(g, field, 700, Math.round(h * 0.2), w - 30 * scale); g.fillText(field, x + w / 2, y + h * 0.19);
  g.fillStyle = C.navy; fitFont(g, value, 900, Math.round(h * 0.3), w - 36 * scale); g.fillText(value, x + w / 2, y + h * 0.68);
}
// 기록판
const board = grp(s5, [0, 0, -0.6]);
const BOARD_TILT = -0.16;
const boardFace = grp(board, [0, 3.7, 0]); boardFace.rotation.x = BOARD_TILT;
add(boardFace, new RoundedBoxGeometry(ROW_W + 1.4, 6.2, 0.22, 2, 0.08), U('#EEF3F8'));
{
  const tp = textPlane(ROW_W + 1.2, 6.0, (g, w, h) => {
    g.fillStyle = C.navy; rr(g, 0, 0, w, 70, 18); g.fill();
    const rowH = CARD_H * PPU, top0 = 0.48 * PPU;
    g.setLineDash([22, 16]); g.lineWidth = 5; g.strokeStyle = '#AFC0D4';
    for (let r = 0; r < 3; r++) {
      let x = 0.6 * PPU; const y = top0 + r * (rowH + 0.25 * PPU);
      CARD_W.forEach((cw) => { rr(g, x, y, cw * PPU, rowH, 22); g.stroke(); x += (cw + GAPX) * PPU; });
    }
  });
  tp.position.z = 0.115; boardFace.add(tp);
}
for (const x of [-(ROW_W / 2), ROW_W / 2]) add(board, new THREE.BoxGeometry(0.16, 1.2, 0.16), M(C.gb4), [x, 0.4, -0.2]);
// 1행의 위치 (boardFace 로컬): 위 0.48u 아래부터
const ROW_LOCAL_Y = 3.0 - 0.48 - CARD_H / 2;
const rowAnchor = grp(boardFace, [0, ROW_LOCAL_Y, 0.2]);
const rowHolder = grp(s5); // 위치는 renderAt 에서 계산
const cards = [];
{
  let x = -ROW_W / 2;
  STR.rec.forEach(([f, v], i) => {
    const w = CARD_W[i];
    const cg = grp(rowHolder);
    add(cg, new RoundedBoxGeometry(w, CARD_H, 0.08, 2, 0.04), U('#ffffff', { rough: 0.6 }));
    const tp = textPlane(w, CARD_H, (g, cw, ch) => drawCell(g, 0, 0, cw, ch, f, v));
    tp.position.z = 0.045; cg.add(tp);
    cg.userData.home = [x + w / 2, 0, 0];
    cards.push(cg);
    x += w + GAPX;
  });
}
const rowFlash = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(ROW_W + 0.2, CARD_H + 0.2, 0.1)), new THREE.LineBasicMaterial({ color: C.yellow, transparent: true, opacity: 0 }));
rowHolder.add(rowFlash);
// 기록 더미용 텍스처 (카드 한 줄)
const rowTex = texFrom(ROW_W * 120, CARD_H * 120, (g, w, h) => {
  let x = 0; const s = 120 / PPU;
  STR.rec.forEach(([f, v], i) => { drawCell(g, x, 0, CARD_W[i] * 120, h, f, v, s); x += (CARD_W[i] + GAPX) * 120; });
});
const PILE_N = 20, PILE_SCALE = 0.6, PILE_POS = [0, 0, 4.2];
const slabs = [];
for (let i = 0; i < PILE_N; i++) {
  const side = U(i % 3 === 1 ? '#E8A0A0' : '#EEF3F8');
  const topM = new THREE.MeshStandardMaterial({ map: rowTex, roughness: 0.7 });
  const geo = new THREE.BoxGeometry(ROW_W, 0.1, CARD_H);
  const m = new THREE.Mesh(geo, [side, side, topM, side, side, side]);
  m.castShadow = true; m.receiveShadow = true;
  s5.add(m); slabs.push(m);
}
// 막대그래프
const chart = grp(s5, [0, 0, -1.2]);
const CH_H = 6.0, CH_BASE = 0.5, COLX = [-4.8, -2.4, 0, 2.4, 4.8];
const chartPed = add(chart, new RoundedBoxGeometry(13.6, CH_BASE, 2.8, 2, 0.08).translate(0, CH_BASE / 2, 0), U('#F4F7FB'), [0, 0, 0]);
const backPanel = add(chart, new THREE.PlaneGeometry(13.6, CH_H + 0.4), U('#ffffff', { transparent: true, opacity: 0.6, depthWrite: false }), [0, CH_BASE + CH_H / 2 + 0.2, -1.45], { cast: false });
const gridLines = [], axisLabels = [];
STR.axis.forEach((s, i) => {
  const y = CH_BASE + CH_H * i / 4;
  const gl = add(chart, new THREE.BoxGeometry(13.2, 0.035, 0.035), U(i === 0 ? C.gb4 : C.gb2), [0, y, -1.4], { cast: false });
  gridLines.push(gl);
  const lb = label([{ t: s, px: 60, w: 700, c: C.navy3 }], { height: 0.46 });
  lb.position.set(-7.45, y, -1.4); chart.add(lb); axisLabels.push(lb);
});
const bars = [], barTop = [], catLabels = [], valLabels = [];
COLX.forEach((x, i) => {
  const b = add(chart, new THREE.BoxGeometry(1.45, 1, 1.45).translate(0, 0.5, 0), U(C.navy2, { rough: 0.5, em: C.yellow, emi: 0 }), [x, CH_BASE, 0]);
  bars.push(b);
  const cl = label([{ t: STR.cats[i], px: 58, w: 700, c: C.navy }], { height: 0.46 });
  cl.position.set(x, CH_BASE * 0.5, 1.55); chart.add(cl); catLabels.push(cl);
  const vl = label([{ t: STR.pct[i] + '%', px: 80, w: 900, c: i === 2 ? C.navy : C.navy }], { height: 0.52, bg: i === 2 ? C.yellow : 'rgba(255,255,255,0.92)', radius: 26 });
  chart.add(vl); valLabels.push(vl);
});
const hiRing = add(chart, new THREE.TorusGeometry(1.2, 0.06, 8, 40).rotateX(Math.PI / 2), U(C.yellow, { em: C.yellow, emi: 0.8, transparent: true }), [0, CH_BASE + 0.03, 0], { cast: false });

// ---- 장면 7: 인적요소 타일
const L7 = [120, 0, 0];
const s7 = grp(studio, L7);
const tiles = [];
STR.tiles.forEach(([ko, en], i) => {
  const hi = i === 0;
  const tg = grp(s7);
  tg.userData.home = [(i - 2) * 3.05, 0, -Math.abs(i - 2) * 0.25];
  tg.rotation.y = -(i - 2) * 0.04;
  add(tg, new RoundedBoxGeometry(2.75, 1.9, 0.36, 3, 0.1), U(hi ? C.yellow : C.navy2, { rough: 0.5 }), [0, 0.95, 0]);
  const tp = textPlane(2.65, 1.8, (g, w, h) => {
    g.fillStyle = hi ? C.navy : '#ffffff'; fitFont(g, ko, 900, 150, w - 60); g.fillText(ko, w / 2, h * 0.42);
    g.fillStyle = hi ? C.navy2 : '#BFD0E6'; fitFont(g, en, 700, 60, w - 50); g.fillText(en, w / 2, h * 0.76);
  });
  tp.position.set(0, 0.95, 0.185); tg.add(tp);
  tiles.push(tg);
});
add(s7, new RoundedBoxGeometry(17.5, 0.12, 3.4, 2, 0.05), U('#EEF3F8'), [0, 0.06, -0.55], { cast: false });
const links = [];
for (let j = 1; j < 5; j++) {
  const p0 = new THREE.Vector3((0 - 2) * 3.05 + 0.5, 1.95, -0.6), p2 = new THREE.Vector3((j - 2) * 3.05, 1.95, -Math.abs(j - 2) * 0.25 - 0.1);
  const p1 = new THREE.Vector3((p0.x + p2.x) / 2, 3.0 + j * 0.42, (p0.z + p2.z) / 2 - 0.6);
  const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 48, 0.04, 6, false);
  const m = add(s7, geo, U(C.yellow, { em: C.yellow, emi: 0.6 }), [0, 0, 0], { cast: false });
  links.push(m);
}

// ---- 장면 8: 보고서 + AI 도우미
const L8 = [180, 0, 0];
const s8 = grp(studio, L8);
const sheet = grp(s8, [-3.1, 0, 0]);
const sheetFace = grp(sheet, [0, 2.75, 0]); sheetFace.rotation.x = -0.1;
add(sheetFace, new THREE.BoxGeometry(3.8, 4.9, 0.08), U('#ffffff', { rough: 0.8 }));
add(sheetFace, new THREE.BoxGeometry(3.8, 0.42, 0.02), U(C.navy), [0, 2.24, 0.05], { cast: false });
add(sheet, new THREE.BoxGeometry(0.1, 0.9, 0.1), M(C.gb4), [-1.3, 0.45, -0.25]);
add(sheet, new THREE.BoxGeometry(0.1, 0.9, 0.1), M(C.gb4), [1.3, 0.45, -0.25]);
const rBoxes = STR.report.map((s, i) => {
  const bg = grp(sheetFace, [0, 1.25 - i * 1.42, 0.08]);
  add(bg, new RoundedBoxGeometry(3.3, 1.22, 0.06, 2, 0.03), U('#F1F5FA'));
  const tp = textPlane(3.25, 1.18, (g, w, h) => {
    g.strokeStyle = C.navy2; g.lineWidth = 6; rr(g, 4, 4, w - 8, h - 8, 20); g.stroke();
    g.fillStyle = C.yellow; g.fillRect(36, 42, 22, 60);
    g.fillStyle = C.navy; g.textAlign = 'left'; fitFont(g, s, 900, 64, w - 120); g.fillText(s, 76, 74);
    g.fillStyle = '#C7D2E0';
    [[0.72], [0.55]].forEach(([fr], k) => { rr(g, 40, 140 + k * 58, (w - 80) * fr, 24, 12); g.fill(); });
  });
  tp.position.z = 0.035; bg.add(tp);
  return bg;
});
const aiG = grp(s8, [3.2, 0, 0]);
const aiPanel = grp(aiG, [0, 2.55, 0]);
add(aiPanel, new RoundedBoxGeometry(4.0, 3.5, 0.22, 3, 0.16), U(C.navy2, { rough: 0.5 }));
const aiPills = STR.ai.map((s, i) => {
  const pg = grp(aiPanel, [0, 1.0 - i * 1.0, 0.14]);
  add(pg, new RoundedBoxGeometry(3.4, 0.74, 0.08, 2, 0.12), U('#ffffff'));
  const tp = textPlane(3.3, 0.7, (g, w, h) => {
    g.fillStyle = C.yellow; g.beginPath(); g.arc(70, h / 2, 40, 0, Math.PI * 2); g.fill();
    g.strokeStyle = C.navy; g.lineWidth = 11; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(50, h / 2 + 2); g.lineTo(66, h / 2 + 18); g.lineTo(92, h / 2 - 14); g.stroke();
    g.fillStyle = C.navy; g.textAlign = 'left'; fitFont(g, s, 900, 78, w - 160); g.fillText(s, 136, h / 2 + 4);
  });
  tp.position.z = 0.045; pg.add(tp);
  return pg;
});
const aiIcon = grp(aiG, [-1.2, 4.85, 0.2]);
{
  add(aiIcon, new RoundedBoxGeometry(1.3, 0.85, 0.2, 3, 0.18), U('#ffffff'));
  const tail = new THREE.ConeGeometry(0.16, 0.42, 4); tail.rotateZ(Math.PI * 0.85);
  add(aiIcon, tail, U('#ffffff'), [-0.38, -0.5, 0], { scale: [1, 1, 0.4] });
}
const dots = [-0.33, 0, 0.33].map((x) => add(aiIcon, new THREE.SphereGeometry(0.1, 10, 8), U(C.navy2), [x, 0, 0.12], { cast: false }));
const flowDots = [];
const flowCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(1.1, 3.4, 0.4), new THREE.Vector3(0, 4.7, 1.0), new THREE.Vector3(-1.1, 3.4, 0.4));
for (let i = 0; i < 7; i++) flowDots.push(add(s8, new THREE.SphereGeometry(0.075, 10, 8), U(C.yellow, { em: C.yellow, emi: 0.8 }), [0, 0, 0], { cast: false }));
const tech8 = makePerson('tech'); tech8.position.set(-0.1, 0, -0.1); tech8.rotation.y = -0.55; s8.add(tech8);
tech8.userData.headG.rotation.x = -0.12;
const ring8 = add(s8, new THREE.TorusGeometry(0.62, 0.05, 8, 40).rotateX(Math.PI / 2), U(C.yellow, { em: C.yellow, emi: 0.9, transparent: true }), [-0.1, 0.04, -0.1], { cast: false });

// ---------------------------------------------------------------- 장면 9: 함께 보는 두 사람
const s9 = grp(world);
const tech9 = makePerson('tech'); tech9.position.set(-0.36, 0, 19.6); tech9.rotation.y = 2.62; s9.add(tech9);
const plan9 = makePerson('planner'); plan9.position.set(0.4, 0, 19.75); plan9.rotation.y = -2.62; s9.add(plan9);
holdTablet(plan9);
tech9.userData.headG.rotation.set(0.32, -0.25, 0);
plan9.userData.headG.rotation.set(0.35, 0.1, 0);
tech9.userData.arms[1].sh.rotation.set(-0.45, 0, 0.05); tech9.userData.arms[1].el.rotation.set(-0.7, 0, 0);

// ---------------------------------------------------------------- 오버레이 DOM
const overlay = document.getElementById('overlay');
const fadeEl = document.getElementById('fade');
const capEls = CAPS.map((c) => {
  const d = document.createElement('div');
  d.className = 'cap ' + c.cls;
  if (c.html) d.innerHTML = c.html; else if (c.text) d.textContent = c.text;
  overlay.appendChild(d);
  return d;
});
function checkCaptions() {
  const errs = [];
  for (let i = 0; i < CAPS.length; i++) for (let j = i + 1; j < CAPS.length; j++) {
    const a = CAPS[i], b = CAPS[j];
    if (a.slot === b.slot && a.a < b.b && b.a < a.b) errs.push(`겹침: ${a.text} / ${b.text}`);
  }
  return errs;
}

// ---------------------------------------------------------------- 카메라 경로
function track(keys, t) {
  if (t <= keys[0][0]) return [keys[0][1], keys[0][2]];
  for (let i = 0; i < keys.length - 1; i++) {
    const k0 = keys[i], k1 = keys[i + 1];
    if (t <= k1[0]) { const x = sm(k0[0], k1[0], t); return [mix3(k0[1], k1[1], x), mix3(k0[2], k1[2], x)]; }
  }
  const k = keys[keys.length - 1]; return [k[1], k[2]];
}
const SX = STUDIO_X;
const orbit = (c, r, h, a) => [c[0] + Math.sin(a) * r, c[1] + h, c[2] + Math.cos(a) * r];
const CH_C = [SX + L5[0], 3.1, -1.2];
const CAM = {
  apron: [ // 장면 1~3
    [0, [24, 4.6, 40], [-17, 4.6, 2]],
    [7.1, [17, 3.6, 31], [-18, 4.0, 5]],
    [9.4, [-1.0, 2.0, 26.6], [-4, 1.5, 19]],
    [13.5, [-1.8, 1.9, 25.9], [-4, 1.48, 19]],
    [14.8, [6.8, 2.0, 26.4], [4.4, 1.45, 19]],
    [17.8, [6.2, 1.9, 25.7], [4.3, 1.42, 19]],
    [19.2, [0, 3.0, 31], [0, 2.0, 19]],
    [22.2, [0.4, 3.0, 30.2], [0, 2.1, 19]],
    [23.4, [1.2, 3.0, 29.2], [0.3, 2.6, 19]],
    [26.6, [0.8, 2.9, 28.4], [0.3, 2.5, 19]],
    [28.4, [-0.1, 2.4, 28.9], [-0.15, 1.65, 20.5]],
    [36.0, [-1.1, 2.5, 28.3], [-0.2, 1.65, 20.5]]
  ],
  s4: [
    [36.0, [SX + 3.2, 4.6, 16.6], [SX, 3.7, 0]],
    [41.0, [SX + 1.0, 4.5, 16.0], [SX, 3.72, 0]],
    [48.0, [SX - 2.0, 4.6, 15.6], [SX, 3.75, 0]]
  ],
  s5: [
    [48.0, [SX + 60 + 3.0, 3.4, 18.4], [SX + 60, 3.75, 0]],
    [55.0, [SX + 60 + 0.5, 4.0, 17.4], [SX + 60, 3.7, 0]],
    [62.0, [SX + 60 - 1.0, 4.4, 17.0], [SX + 60, 3.6, 0]],
    [63.8, [SX + 60 + 4.0, 5.2, 14.0], [SX + 60, 1.0, 3.6]],
    [65.6, [SX + 60 + 2.0, 5.6, 14.6], [SX + 60, 1.4, 2.6]],
    [67.6, orbit(CH_C, 18.8, 2.4, -0.42), CH_C]
  ],
  s7: [
    [76.0, [SX + 120 - 5.0, 1.3, 11.5], [SX + 120 - 2.8, 1.5, 0]],
    [81.0, [SX + 120 - 1.0, 3.0, 16.4], [SX + 120, 2.25, -0.5]],
    [88.0, [SX + 120 + 1.8, 3.6, 16.0], [SX + 120 + 0.2, 2.3, -0.5]]
  ],
  s8: [
    [88.0, [SX + 180 + 3.4, 5.1, 11.8], [SX + 180 + 0.3, 2.35, 0]],
    [95.0, [SX + 180 + 0.8, 5.0, 11.2], [SX + 180, 2.3, 0]],
    [102.0, [SX + 180 - 1.6, 4.9, 10.8], [SX + 180 - 0.2, 2.25, 0.2]]
  ],
  s9: [
    [102.0, [-1.2, 1.5, 11.4], [-2.6, 2.6, 30]],
    [114.0, [-1.8, 1.4, 12.2], [-2.9, 3.0, 30]]
  ]
};
function cameraAt(t) {
  if (t < 36) return track(CAM.apron, t);
  if (t < 48) return track(CAM.s4, t);
  if (t < 67.6) return track(CAM.s5, t);
  if (t < 76) { const a = lerp(-0.42, 0.36, sm(67.6, 76.6, t)); return [orbit(CH_C, 18.8 - 0.8 * ss(67.6, 76, t), 2.4, a), CH_C]; }
  if (t < 88) return track(CAM.s7, t);
  if (t < 102) return track(CAM.s8, t);
  return track(CAM.s9, t);
}

// ---------------------------------------------------------------- 장면 갱신
const tmpM = new THREE.Matrix4(), tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
const qFlat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
function setOpacity(sprite, o) { sprite.material.opacity = o; sprite.visible = o > 0.001; }

function renderAt(t) {
  const sc = t < 8 ? 1 : t < 22 ? 2 : t < 36 ? 3 : t < 48 ? 4 : t < 62 ? 5 : t < 76 ? 6 : t < 88 ? 7 : t < 102 ? 8 : 9;
  const onApron = sc <= 3 || sc === 9;
  apron.visible = onApron; plane.visible = onApron;
  s23.visible = sc <= 3; s9.visible = sc === 9;
  studio.visible = !onApron;
  s4.visible = sc === 4; s5.visible = sc === 5 || sc === 6; s7.visible = sc === 7; s8.visible = sc === 8;

  // --- 카메라
  const [p, l] = cameraAt(t);
  camera.position.set(p[0], p[1], p[2]); camera.lookAt(l[0], l[1], l[2]);
  if (sc === 1) setSun([0, 0, 4], 30);
  else if (sc <= 3) setSun([0, 0, 19.5], 9);
  else if (sc === 9) setSun([0, 0, 19.7], 6);
  else setSun([SX + [0, 0, 0, 0, 0, 60, 60, 120, 180][sc - 1], 0, 0], 12);

  // --- 여객기
  plane.position.set(0, 0, 0); plane.rotation.set(0, 0, 0); plane.userData.pitch.rotation.set(0, 0, 0); plane.userData.pitch.position.set(0, 0, 0);
  plane.userData.gear.visible = true;
  if (sc === 9) {
    const u = t - 102;
    const x = 2 - (3 * u + 0.5 * u * u); // 가속 활주 (화면 왼쪽 → 오른쪽)
    const lift = Math.max(0, -16 - x);
    const y = lift * lift / 90;
    plane.position.set(x, y, 98); plane.rotation.y = -Math.PI / 2;
    const pitch = -Math.min(0.16, lift * 0.02);
    plane.userData.pitch.rotation.x = pitch;
    plane.userData.gear.visible = y < 6;
  }

  // --- 장면 2·3
  if (sc <= 3) {
    watch.visible = t > 7 && t < 22.6;
    const wp = back(8.6, 9.4, t) * (1 - ss(21.8, 22.5, t));
    watch.scale.setScalar(Math.max(0.001, wp));
    watch.position.y = 2.47 + Math.sin(t * 2.0) * 0.05;
    watch.rotation.y = 0.3 + Math.sin(t * 0.8) * 0.12;
    watch.userData.hand.rotation.z = -clamp((t - 9.2) / 4.5) * Math.PI * 2 * 35 / 60;
    const jp = sm(18.6, 19.8, t) * (1 - ss(22.4, 23.0, t));
    joinLine.visible = jp > 0.002;
    joinGeo.setDrawRange(0, Math.floor(joinGeo.index.count * clamp(sm(18.6, 19.8, t)) / 3) * 3);
    joinMat.opacity = 1 - ss(22.4, 23.0, t);
    goal.visible = t > 19.4 && t < 23.0;
    goal.scale.setScalar(Math.max(0.001, back(19.5, 20.1, t) * (1 - ss(22.4, 22.9, t))));
    goal.rotation.y = Math.sin(t * 1.3) * 0.3;
    const cp = back(22.6, 23.2, t) * (1 - ss(27.3, 27.9, t));
    clock.visible = t > 22.6 && t < 27.9; clock.scale.setScalar(Math.max(0.001, cp));
    const bp = back(23.3, 23.85, t);
    bubble.visible = t > 23.3; bubble.scale.setScalar(Math.max(0.001, bp));
    bubble.position.y = 3.15 + Math.sin(t * 1.7) * 0.03;
    barsG.visible = t > 26.4;
    const pp = eOut(26.4, 27.2, t);
    barsG.scale.set(1, Math.max(0.001, pp), 1);
    const h35 = 35 * PER_MIN * sm(27.8, 29.8, t), h20 = 20 * PER_MIN * sm(28.3, 30.0, t);
    bar35.scale.y = Math.max(0.001, h35); bar20.scale.y = Math.max(0.001, h20);
    setOpacity(lab35, ss(27.4, 28.0, t)); setOpacity(lab20, ss(27.7, 28.3, t));
    const gp = ss(30.6, 31.2, t);
    gapBox.visible = gp > 0.001; gapEdge.visible = gp > 0.001;
    gapMat.opacity = gp * (0.28 + 0.14 * (0.5 + 0.5 * Math.sin((t - 30.6) * 5)));
    gapEdge.material.opacity = gp;
    gapBox.scale.y = Math.max(0.001, eOut(30.6, 31.3, t)); gapEdge.scale.y = gapBox.scale.y;
    setOpacity(labGap, ss(31.1, 31.6, t));
  }

  // --- 장면 4: 게이지
  if (sc === 4) {
    const v = 1.75 * back(40.0, 42.6, t, 1.1);
    needle.rotation.z = vToA(v) - Math.PI / 2;
    zMat[0].emissiveIntensity = 0.0 + 0.25 * win(t, 40.0, 41.0, 0.3);
    zMat[1].emissiveIntensity = 0.0 + 0.25 * win(t, 40.6, 41.4, 0.3);
    const red = ss(41.2, 41.6, t);
    zMat[2].emissiveIntensity = red * (0.25 + 0.2 * (0.5 + 0.5 * Math.sin((t - 41.2) * 5.5)));
    setOpacity(readout, ss(42.4, 42.9, t));
    readout.scale.set(readout.userData.sx ??= readout.scale.x, readout.userData.sy ??= readout.scale.y, 1);
    const rs = back(42.4, 42.95, t);
    readout.scale.set(readout.userData.sx * rs, readout.userData.sy * rs, 1);
  }

  // --- 장면 5·6
  if (sc === 5 || sc === 6) {
    // 기록판 / 카드
    const sink = sm(62.4, 63.8, t);
    board.position.y = -7.2 * sink; board.visible = sink < 0.999;
    rowAnchor.updateMatrixWorld(true);
    s5.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(s5.matrixWorld).invert();
    tmpM.multiplyMatrices(inv, rowAnchor.matrixWorld).decompose(tmpP, tmpQ, tmpS);
    const mv = sm(62.0, 63.3, t);
    const pileP = new THREE.Vector3(PILE_POS[0], 0.06, PILE_POS[2]);
    rowHolder.position.lerpVectors(tmpP, pileP, mv);
    rowHolder.position.y += Math.sin(mv * Math.PI) * 1.5;
    rowHolder.quaternion.slerpQuaternions(tmpQ, qFlat, mv);
    rowHolder.scale.setScalar(lerp(1, PILE_SCALE, mv));
    rowHolder.visible = t < 63.3;
    cards.forEach((cg, i) => {
      const t0 = 49.3 + i * 0.62, k = eOut(t0, t0 + 1.25, t);
      const h = cg.userData.home;
      const sx = h[0] * 1.5 + (i % 2 ? 7 : -7), sy = -1.5 - (i % 3) * 0.8, sz = 8 + (i % 2) * 2;
      cg.position.set(lerp(sx, h[0], k), lerp(sy, h[1], k) + Math.sin(k * Math.PI) * 0.3, lerp(sz, h[2], k));
      cg.rotation.set(lerp((i % 2 ? 0.9 : -0.7), 0, k), lerp((i % 3 - 1) * 1.6, 0, k), lerp(i % 2 ? -0.5 : 0.6, 0, k));
      cg.visible = t > t0;
    });
    rowFlash.material.opacity = win(t, 54.7, 56.0, 0.3);
    // 기록 더미
    const toCol = sm(66.0, 67.5, t);
    slabs.forEach((m, i) => {
      const tDrop = 63.3 + (i - 1) * 0.14;
      const appear = i === 0 ? (t >= 63.3) : t > tDrop;
      const dp = i === 0 ? 1 : eOut(tDrop, tDrop + 0.35, t);
      const py = 0.06 + i * 0.13;
      const pile = [PILE_POS[0] + Math.sin(i * 2.3) * 0.08, py + (1 - dp) * 3.0, PILE_POS[2] + Math.cos(i * 1.7) * 0.06];
      const c = i % 5;
      const colP = [COLX[c], CH_BASE + 0.05 + Math.floor(i / 5) * 0.02, -1.2];
      m.position.set(...mix3(pile, colP, toCol));
      m.position.y += Math.sin(toCol * Math.PI) * (1.6 + (i % 4) * 0.4);
      m.rotation.set(0, lerp(Math.sin(i * 1.1) * 0.05, 0, toCol), 0);
      m.scale.set(lerp(PILE_SCALE, 1.4 / ROW_W, toCol), lerp(PILE_SCALE, 0.4, toCol), lerp(PILE_SCALE, 1.4 / CARD_H, toCol));
      m.visible = appear && t < 67.6;
    });
    // 그래프
    chart.visible = t > 65.6;
    const pedP = eOut(65.6, 66.4, t);
    chartPed.scale.set(1, Math.max(0.001, pedP), 1);
    const gridP = ss(66.4, 67.2, t);
    backPanel.material.opacity = 0.6 * gridP; backPanel.visible = gridP > 0.001;
    gridLines.forEach((g) => { g.visible = gridP > 0.001; g.scale.x = Math.max(0.001, gridP); });
    axisLabels.forEach((lb) => setOpacity(lb, gridP));
    bars.forEach((b, i) => {
      const t0 = 67.3 + i * 0.45;
      const target = Math.max(0.05, CH_H * STR.pct[i] / 100);
      const hgt = Math.max(0.001, target * sm(t0, t0 + 1.3, t));
      b.scale.y = hgt; b.visible = t > 67.2;
      setOpacity(valLabels[i], ss(t0 + 0.9, t0 + 1.3, t));
      valLabels[i].position.set(COLX[i], CH_BASE + hgt + 0.45, 0.2);
      setOpacity(catLabels[i], ss(66.6, 67.2, t));
    });
    const hl = ss(70.6, 71.2, t);
    bars[2].material.color.set(C.navy2).lerp(new THREE.Color(C.yellow), hl);
    bars[2].material.emissiveIntensity = hl * (0.12 + 0.12 * (0.5 + 0.5 * Math.sin((t - 70.6) * 4)));
    hiRing.visible = hl > 0.001; hiRing.material.opacity = hl;
    hiRing.scale.setScalar(1 + 0.06 * Math.sin((t - 70.6) * 4));
  }

  // --- 장면 7
  if (sc === 7) {
    tiles.forEach((tg, i) => {
      const t0 = 76.6 + i * 1.05;
      const k = back(t0, t0 + 0.9, t, 1.2);
      const h = tg.userData.home;
      tg.position.set(h[0], lerp(-2.4, 0.12, k), h[2]);
      tg.visible = t > t0;
    });
    tiles[0].scale.setScalar(1 + 0.03 * ss(82, 82.5, t) * Math.sin((t - 82) * 4));
    links.forEach((m, j) => {
      const t0 = 82.2 + j * 0.35, k = sm(t0, t0 + 1.0, t);
      m.visible = k > 0.002;
      m.geometry.setDrawRange(0, Math.floor(m.geometry.index.count * k / 3) * 3);
    });
  }

  // --- 장면 8
  if (sc === 8) {
    rBoxes.forEach((b, i) => { const k = back(88.9 + i * 0.75, 89.5 + i * 0.75, t); b.scale.setScalar(Math.max(0.001, k)); b.visible = k > 0.001; });
    const ip = back(90.2, 90.8, t);
    aiIcon.scale.setScalar(Math.max(0.001, ip)); aiIcon.position.y = 4.85 + Math.sin(t * 1.6) * 0.06;
    dots.forEach((d, i) => { d.position.y = Math.max(0, Math.sin((t - 90.4) * 7 - i * 0.9)) * 0.12 * (1 - ss(93.8, 94.2, t)); });
    aiPills.forEach((pg, i) => {
      const t0 = 91.6 + i * 1.0, k = eOut(t0, t0 + 0.55, t);
      pg.position.x = lerp(0.8, 0, k); pg.scale.setScalar(Math.max(0.001, lerp(0.6, 1, k))); pg.visible = t > t0;
    });
    flowDots.forEach((d, i) => {
      const vis = win(t, 93.8, 99.0, 0.5);
      const u = ((t - 93.8) * 0.55 + i / flowDots.length) % 1;
      flowCurve.getPoint(u, d.position);
      d.visible = vis > 0.01 && t > 93.8;
      d.scale.setScalar(Math.max(0.001, vis * Math.sin(u * Math.PI)));
    });
    const rp = ss(95.8, 96.4, t);
    ring8.visible = rp > 0.001; ring8.material.opacity = rp;
    ring8.scale.setScalar(1 + 0.08 * Math.sin((t - 95.8) * 3.5));
  }

  // --- 오버레이
  CAPS.forEach((c, i) => {
    const el = capEls[i];
    const d = c.cls === 'scrim' || c.cls === 'dim' ? 0.6 : 0.45;
    let o = win(t, c.a, c.b, d);
    if (c.b > 900) o = ss(c.a, c.a + 0.8, t);
    el.style.opacity = o.toFixed(3);
    el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
    const dy = (1 - eOut(c.a, c.a + 0.6, t)) * 18;
    const center = ['bottom', 'top', 'top2', 'note', 'legend'].includes(c.cls);
    el.style.transform = (center ? 'translateX(-50%) ' : '') + `translateY(${dy.toFixed(2)}px)`;
  });
  // 장면 전환 페이드
  let f = 0;
  for (const b of [36, 48, 76, 88, 102]) f = Math.max(f, clamp((0.42 - Math.abs(t - b)) / 0.3));
  let fcol = '#E6EDF5';
  const fin = 1 - ss(0, 0.8, t), fout = ss(DURATION - 1.4, DURATION - 0.2, t);
  if (fin > f) { f = fin; fcol = C.navy; }
  if (fout > f) { f = fout; fcol = C.navy; }
  fadeEl.style.opacity = f.toFixed(3); fadeEl.style.background = fcol;

  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- 시작 (boot.js 가 폰트를 먼저 불러온 뒤 이 모듈을 import 한다)
{
  const bad = usedText.filter(([f, s]) => !document.fonts.check(f, s)).map(([f, s]) => f + ' | ' + s);
  window.__textCheck = { drawn: usedText.length, notCovered: bad };
  window.renderAt = renderAt;
  window.__checkCaptions = checkCaptions();
  window.__ready = true;
}
