import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

// ==========================================
// 1. Configuration & Constants
// ==========================================
const SETTINGS = {
  colors: {
    background: 0xcccccc,
    ground: 0x999999,
    building: 0xccffff,
    sun: 0xffffff,
    ambient: 0x444444,
  },
  camera: {
    fov: 60,
    near: 0.1,
    far: 20000,
    initialPos: { x: 500, y: 400, z: 400 }
  },
  shadows: {
    enabled: true,
    mapSize: 4096,
    areaSize: 2000, // Size of the shadow camera view
    bias: -0.0005
  },
  dataUrl: './city_data.json'
};

// Global variables for core components
let scene, camera, renderer, controls;
let sunLight; // Needs to be global to update position in render loop

// ==========================================
// 2. Initialization Logic
// ==========================================

function init() {
  // Setup core Three.js components
  setupScene();
  setupLighting();
  createGround();

  // Initialize controls
  setupControls();

  // Load external data
  loadCityData();

  // Start event listeners and loop
  window.addEventListener('resize', onWindowResize);
  animate();
}

/**
 * Sets up the Scene, Camera, and Renderer.
 */
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(SETTINGS.colors.background);
  // Fog blends the floor into the background at distance for depth perception
  scene.fog = new THREE.FogExp2(SETTINGS.colors.background, 0.0001);

  camera = new THREE.PerspectiveCamera(
    SETTINGS.camera.fov,
    window.innerWidth / window.innerHeight,
    SETTINGS.camera.near,
    SETTINGS.camera.far
  );
  camera.position.set(
    SETTINGS.camera.initialPos.x,
    SETTINGS.camera.initialPos.y,
    SETTINGS.camera.initialPos.z
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    logarithmicDepthBuffer: true // Prevents z-fighting on large scale scenes
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = SETTINGS.shadows.enabled;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  document.body.appendChild(renderer.domElement);
}

/**
 * Creates ambient and directional lighting.
 * Configures shadow properties for the directional light.
 */
function setupLighting() {
  // Ambient light for general illumination (so shadows aren't pitch black)
  const hemiLight = new THREE.HemisphereLight(
    SETTINGS.colors.sun,
    SETTINGS.colors.ambient,
    0.6
  );
  scene.add(hemiLight);

  // Directional light acting as the Sun
  sunLight = new THREE.DirectionalLight(SETTINGS.colors.sun, 1.5);
  sunLight.position.set(200, 400, 100);
  sunLight.castShadow = true;

  // Optimize shadow quality
  sunLight.shadow.mapSize.width = SETTINGS.shadows.mapSize;
  sunLight.shadow.mapSize.height = SETTINGS.shadows.mapSize;

  // Define the box in which shadows are calculated
  const d = SETTINGS.shadows.areaSize;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;

  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 4000;
  sunLight.shadow.bias = SETTINGS.shadows.bias; // Reduces shadow artifacts (striping)

  scene.add(sunLight);
}

function setupControls() {
  controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true; // Adds weight to movement for smoother feel
  controls.dampingFactor = 0.05;
  controls.target.set(-100, 0, 200);
}

// ==========================================
// 3. Scene Content Generation
// ==========================================

function createGround() {
  const geometry = new THREE.PlaneGeometry(5000, 5000);
  const material = new THREE.MeshStandardMaterial({
    color: SETTINGS.colors.ground
  });

  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2; // Rotate to lie flat
  ground.receiveShadow = true;
  scene.add(ground);
}

function loadCityData() {
  fetch(SETTINGS.dataUrl)
    .then(res => {
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      return res.json();
    })
    .then(buildingData => {
      generateCityMesh(buildingData);
    })
    .catch(error => {
      console.error("Failed to load city data:", error);
      // Optional: Add UI feedback here
    });
}

/**
 * efficiently renders thousands of buildings using InstancedMesh.
 * @param {Array} data - Array of arrays [x, z, width, depth, height]
 */
function generateCityMesh(data) {
  if (!data || data.length === 0) return;

  // Create a single geometry template
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  // Shift pivot point to bottom of box so scaling grows upwards
  geometry.translate(0, 0.5, 0);

  const material = new THREE.MeshStandardMaterial({
    color: SETTINGS.colors.building,
    roughness: 0.5,
    metalness: 0.1
  });

  const instancedMesh = new THREE.InstancedMesh(geometry, material, data.length);
  instancedMesh.castShadow = true;
  instancedMesh.receiveShadow = true;

  // Disable frustum culling to prevent flickering if the bounding sphere 
  // calculation is off for the entire group. Re-enable if performance is an issue.
  instancedMesh.frustumCulled = false;

  const transformHelper = new THREE.Object3D();

  data.forEach((building, index) => {
    const [posX, posZ, width, depth, height] = building;

    transformHelper.position.set(posX, 0, posZ);
    transformHelper.scale.set(width, height, depth);
    transformHelper.updateMatrix();

    instancedMesh.setMatrixAt(index, transformHelper.matrix);
  });

  scene.add(instancedMesh);
}

// ==========================================
// 4. Animation & Event Loop
// ==========================================

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateSunPosition() {
  // Move the light with the camera to simulate a "sun" that always 
  // casts high-res shadows near the player (Pseudo-Cascaded Shadow Map)
  if (sunLight && camera) {
    sunLight.position.x = camera.position.x + 100;
    sunLight.position.z = camera.position.z + 100;

    // Ensure the light points at the camera's ground position
    sunLight.target.position.set(camera.position.x, 0, camera.position.z);
    sunLight.target.updateMatrixWorld();
  }
}

function animate() {
  requestAnimationFrame(animate);

  controls.update();
  updateSunPosition();

  renderer.render(scene, camera);
}

// Start the application
init();
