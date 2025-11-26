import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

// 1. Setup Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcccccc);
scene.fog = new THREE.FogExp2(0xcccccc, 0.0001);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  20000);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  logarithmicDepthBuffer: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Optional: Makes them look nicer
document.body.appendChild(renderer.domElement);

// 2. Lights

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(200, 400, 100);
dirLight.castShadow = true;

dirLight.shadow.mapSize.width = 4096;
dirLight.shadow.mapSize.height = 4096;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 4000;

const d = 2000;
dirLight.shadow.camera.left = -d;
dirLight.shadow.camera.right = d;
dirLight.shadow.camera.top = d;
dirLight.shadow.camera.bottom = -d;
dirLight.shadow.bias = -0.0005;

scene.add(dirLight);

// 3. Helpers (Ground)
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(5000, 5000),
  new THREE.MeshStandardMaterial({ color: 0x999999 })
);
plane.rotation.x = -Math.PI / 2;
plane.receiveShadow = true;
scene.add(plane);

// 4. Load Data & Create Buildings
fetch('./city_data.json')
  .then(res => res.json())
  .then(buildings => {
    createCity(buildings);
  })
  .catch(e => console.error("Data load failed", e));

function createCity(data) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // Move pivot to bottom of box so scaling works comfortably
  geometry.translate(0, 0.5, 0);

  const material = new THREE.MeshStandardMaterial({
    color: 0xccffff,
    roughness: 0.5,
    metalness: 0.1
  });

  const mesh = new THREE.InstancedMesh(geometry, material, data.length);
  mesh.castShadow = true; // Buildings cast shadows
  mesh.receiveShadow = true; // Buildings receive shadows from others
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();

  data.forEach((b, i) => {
    const [x, z, w, d, h] = b;

    dummy.position.set(x, 0, z);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();

    mesh.setMatrixAt(i, dummy.matrix);
  });

  scene.add(mesh);
}

// 5. Controls & Animation
const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(-100, 0, 200);
camera.position.set(500, 400, 400);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  dirLight.position.x = camera.position.x + 100;
  dirLight.position.z = camera.position.z + 100;

  // You also need to move the shadow target to match
  dirLight.target.position.set(camera.position.x, 0, camera.position.z);
  dirLight.target.updateMatrixWorld();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
