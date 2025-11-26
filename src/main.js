import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// ==========================================
// 1. Configuration & Constants
// ==========================================
const SETTINGS = {
  colors: {
    background: 0xe0e0e0, // Lighter fog
    ground: 0xdddddd,
    building: 0xffffff,
    water: 0x4fa4e4,
    park: 0x98d98e,
    road: 0x999999,
    sun: 0xffffff,
    ambient: 0x777777,
  },
  camera: {
    fov: 45, // Narrower FOV for better city look
    near: 1,
    far: 20000,
    initialPos: { x: 0, y: 600, z: 800 }
  },
  shadows: {
    enabled: true,
    mapSize: 4096,
    areaSize: 1500,
    bias: -0.0001
  },
  dataUrl: './city_data.json'
};

let scene, camera, renderer, controls, sunLight;

// ==========================================
// 2. Initialization
// ==========================================

function init() {
  setupScene();
  setupLighting();
  createGround();
  setupControls();
  loadCityData();

  window.addEventListener('resize', onWindowResize);
  animate();
}

function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(SETTINGS.colors.background);
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
    logarithmicDepthBuffer: true
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
  const ambient = new THREE.HemisphereLight(SETTINGS.colors.sun, SETTINGS.colors.ground, 0.6);
  scene.add(ambient);

  sunLight = new THREE.DirectionalLight(SETTINGS.colors.sun, 2.0);
  sunLight.position.set(100, 500, 200);
  sunLight.castShadow = true;

  sunLight.shadow.mapSize.set(SETTINGS.shadows.mapSize, SETTINGS.shadows.mapSize);
  const d = SETTINGS.shadows.areaSize;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;

  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 4500;
  sunLight.shadow.bias = SETTINGS.shadows.bias;

  scene.add(sunLight);
}

function setupControls() {
  controls = new MapControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = 50;
  controls.maxDistance = 3000;
  controls.maxPolarAngle = Math.PI / 2 - 0.1; // Don't go below ground
}

function createGround() {
  const geom = new THREE.PlaneGeometry(10000, 10000);
  const mat = new THREE.MeshLambertMaterial({ color: SETTINGS.colors.ground });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.5; // Slightly below features
  mesh.receiveShadow = true;
  scene.add(mesh);
}

// ==========================================
// 3. Data Processing & Mesh Generation
// ==========================================

function loadCityData() {
  fetch(SETTINGS.dataUrl)
    .then(res => res.json())
    .then(data => {
      console.log("City data loaded. Generating geometry...");
      generateCity(data);
    })
    .catch(err => console.error("Error loading city data:", err));
}

function generateCity(data) {
  // 1. Water (Flat Polygons)
  if (data.water && data.water.length) {
    createPolygonLayer(data.water, SETTINGS.colors.water, 0, 0.1);
  }

  // 2. Parks (Flat Polygons)
  if (data.parks && data.parks.length) {
    createPolygonLayer(data.parks, SETTINGS.colors.park, 0, 0.2);
  }

  // 3. Roads (Lines)
  if (data.roads && data.roads.length) {
    createRoadLayer(data.roads, SETTINGS.colors.road, 0.3);
  }

  // 4. Buildings (Extruded Polygons)
  if (data.buildings && data.buildings.length) {
    createBuildingLayer(data.buildings, SETTINGS.colors.building);
  }
}

/**
 * Creates flat meshes for things like water or parks.
 * Uses BufferGeometryUtils to merge them into one draw call.
 */
function createPolygonLayer(items, color, height, yOffset) {
  const geometries = [];

  items.forEach(item => {
    const shape = createShapeFromPoints(item.shape);
    const geometry = new THREE.ShapeGeometry(shape);

    // Rotate to lie flat on XZ plane
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, yOffset, 0); // Lift slightly to avoid z-fighting

    geometries.push(geometry);
  });

  if (geometries.length === 0) return;

  const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
  const material = new THREE.MeshLambertMaterial({ color: color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(mergedGeometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/**
 * Creates extruded meshes for buildings.
 */
function createBuildingLayer(buildings, color) {
  const geometries = [];

  buildings.forEach(b => {
    const shape = createShapeFromPoints(b.shape);

    // Extrude Settings
    const extrudeSettings = {
      depth: b.height,
      bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    geometry.rotateX(-Math.PI / 2);

    geometries.push(geometry);
  });

  if (geometries.length === 0) return;

  const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
  // Center the geometry to optimize bounding sphere calculations
  mergedGeometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.6,
    metalness: 0.1
  });

  const mesh = new THREE.Mesh(mergedGeometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
}

/**
 * Creates simple lines for roads.
 * Note: THREE.Line doesn't cast shadows easily, but it's performant.
 */
function createRoadLayer(roads, color, yOffset) {
  const positions = [];

  roads.forEach(road => {
    const path = road.path;
    for (let i = 0; i < path.length - 1; i++) {
      positions.push(path[i][0], path[i][1], 0);
      positions.push(path[i + 1][0], path[i + 1][1], 0);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, yOffset, 0);


  const material = new THREE.LineBasicMaterial({
    color: color,
    opacity: 0.8,
    transparent: true
  });

  const lineSegments = new THREE.LineSegments(geometry, material);
  scene.add(lineSegments);
}

/**
 * Helper to convert array of [x,z] points into a THREE.Shape
 */
function createShapeFromPoints(points) {
  const shape = new THREE.Shape();
  if (!points || points.length === 0) return shape;

  // First point
  shape.moveTo(points[0][0], points[0][1]);

  // Subsequent points
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1]);
  }

  return shape;
}

// ==========================================
// 4. Animation Loop
// ==========================================

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateSunPosition() {
  if (sunLight && camera) {
    // Keep shadow map centered around camera
    sunLight.position.x = camera.position.x + 100;
    sunLight.position.z = camera.position.z + 200;
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

// Start
init();
