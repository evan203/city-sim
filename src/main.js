import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

// Import our Classes
import { InputManager } from './InputManager.js';
import { RouteManager } from './RouteManager.js';

// ==========================================
// 1. Configuration
// ==========================================
const SETTINGS = {
  colors: {
    background: 0xE6E6E6,
    ground: 0xDDDDDD,
    building: 0xFFFFFF,
    water: 0xAADAFF,
    park: 0xC3E6CB,
    road: 0x999999,
    pathStart: 0x00FF00,
    pathEnd: 0xFF0000,
    route: 0x2563EB,
  },
  files: {
    visual: './city_data.json',
    routing: './routing_graph.json'
  }
};

let scene, camera, renderer, controls;
let inputManager, routeManager;

function init() {
  setupScene();

  // -- INITIALIZATION --
  // 1. Create Route Manager
  routeManager = new RouteManager(scene, SETTINGS);

  // 2. Create Input Manager (Pass controls so we can disable them during drag)
  inputManager = new InputManager(camera, renderer.domElement, scene, controls);
  inputManager.init();

  // 3. Wire Events

  // Handle Click (Add Node)
  inputManager.onClick = (point, object) => {
    if (object.name === "GROUND") {
      routeManager.addNodeByWorldPosition(point);
    }
  };

  // Handle Drag (Move Node)
  inputManager.onDrag = (markerObject, newPoint) => {
    routeManager.dragNode(markerObject, newPoint);
  };

  // 4. Load Data
  Promise.all([
    fetch(SETTINGS.files.visual).then(r => r.json()),
    fetch(SETTINGS.files.routing).then(r => r.json())
  ]).then(([visual, routing]) => {
    console.log("Data loaded.");
    renderCity(visual);
    routeManager.initGraph(routing);
  });

  animate();
}

// ==========================================
// 2. Scene Setup
// ==========================================
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(SETTINGS.colors.background);
  scene.fog = new THREE.FogExp2(SETTINGS.colors.background, 0.0002);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, 20000);
  camera.position.set(0, 800, 800);

  renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x555555, 0.7);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(500, 1000, 500);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(2048, 2048);
  dirLight.shadow.camera.left = -1500;
  dirLight.shadow.camera.right = 1500;
  dirLight.shadow.camera.top = 1500;
  dirLight.shadow.camera.bottom = -1500;
  scene.add(dirLight);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(10000, 10000),
    new THREE.MeshLambertMaterial({ color: SETTINGS.colors.ground })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.5;
  plane.name = "GROUND";
  plane.receiveShadow = true;
  scene.add(plane);

  controls = new MapControls(camera, renderer.domElement);
  controls.dampingFactor = 0.05;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.1;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

// ==========================================
// 3. Visual Rendering
// ==========================================
function renderCity(data) {
  const createLayer = (items, color, height, lift, isExtruded) => {
    if (!items || !items.length) return;
    const geometries = [];

    items.forEach(item => {
      const polyData = item.shape;
      if (!polyData || !polyData.outer || polyData.outer.length < 3) return;

      const shape = new THREE.Shape();
      shape.moveTo(polyData.outer[0][0], polyData.outer[0][1]);
      for (let i = 1; i < polyData.outer.length; i++) shape.lineTo(polyData.outer[i][0], polyData.outer[i][1]);

      if (polyData.holes) {
        polyData.holes.forEach(holePts => {
          if (holePts.length < 3) return;
          const holePath = new THREE.Path();
          holePath.moveTo(holePts[0][0], holePts[0][1]);
          for (let j = 1; j < holePts.length; j++) holePath.lineTo(holePts[j][0], holePts[j][1]);
          shape.holes.push(holePath);
        });
      }

      if (isExtruded) {
        const geom = new THREE.ExtrudeGeometry(shape, { depth: item.height || height, bevelEnabled: false });
        geom.rotateX(-Math.PI / 2);
        geometries.push(geom);
      } else {
        const geom = new THREE.ShapeGeometry(shape);
        geom.rotateX(-Math.PI / 2);
        geom.translate(0, lift, 0);
        geometries.push(geom);
      }
    });

    if (!geometries.length) return;
    const merged = BufferGeometryUtils.mergeGeometries(geometries);
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.8, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    if (isExtruded) mesh.castShadow = true;
    scene.add(mesh);
  };

  createLayer(data.water, SETTINGS.colors.water, 0, 0.1, false);
  createLayer(data.parks, SETTINGS.colors.park, 0, 0.2, false);
  createLayer(data.roads, SETTINGS.colors.road, 0, 0.3, false);
  createLayer(data.buildings, SETTINGS.colors.building, 10, 0, true);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

init();
