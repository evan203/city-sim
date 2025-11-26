import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

// 1. Setup Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcccccc);
scene.fog = new THREE.FogExp2(0xcccccc, 0.002);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(200, 200, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 2. Lights
const dirLight = new THREE.DirectionalLight(0xffffff, 3);
dirLight.position.set(100, 300, 100);
scene.add(dirLight);
scene.add(new THREE.AmbientLight(0x404040));

// 3. Helpers (Ground)
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshBasicMaterial({ color: 0x999999 })
);
plane.rotation.x = -Math.PI / 2;
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

  const material = new THREE.MeshLambertMaterial({ color: 0x44aa88 });
  const mesh = new THREE.InstancedMesh(geometry, material, data.length);

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

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
