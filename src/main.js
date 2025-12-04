import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import { InputManager } from './InputManager.js';
import { RouteManager } from './RouteManager.js';
import { UIManager } from './UIManager.js';
import { GameManager } from './GameManager.js';
import { VehicleSystem } from './VehicleSystem.js';

// ==========================================
// 1. Configuration
// ==========================================
const SETTINGS = {
  colors: {
    background: 0xE6E6E6,
    ground: 0xDDDDDD,
    zoningRes: new THREE.Color(0xA855F7),
    zoningCom: new THREE.Color(0x3B82F6),
    coverageGood: new THREE.Color(0x10B981),
    coverageBad: new THREE.Color(0xEF4444),
    building: new THREE.Color(0xFFFFFF),
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
let inputManager, routeManager, uiManager, gameManager, vehicleSystem;

const clock = new THREE.Clock();

let currentViewMode = 'none'; // 'none', 'zoning', 'approval'

function init() {
  setupScene();

  // 1. Core Systems
  routeManager = new RouteManager(scene, SETTINGS);
  uiManager = new UIManager(routeManager);

  // 2. Game Logic
  gameManager = new GameManager(routeManager, uiManager);
  routeManager.setGameManager(gameManager);

  // Vehicle System
  vehicleSystem = new VehicleSystem(scene);
  routeManager.setVehicleSystem(vehicleSystem);

  // 3. Input
  inputManager = new InputManager(camera, renderer.domElement, scene, controls);
  inputManager.init();

  // Wiring Click
  inputManager.onClick = (point, object) => {
    // Only allow adding nodes if we are actually in drafting mode
    // (RouteManager handles the check internally, but we pass the intent)
    if (object.name === "GROUND") routeManager.addNodeByWorldPosition(point);
  };

  // Wiring Drag
  inputManager.onDrag = (markerObject, newPoint) => {
    routeManager.dragNode(markerObject, newPoint);
  };

  // Wiring Hover (NEW)
  inputManager.onHover = (point) => {
    routeManager.updateGhostMarker(point);
  };

  // Wire UI View Mode
  uiManager.onViewModeChanged = (mode) => {
    currentViewMode = mode;
    updateBuildingColors();
  };

  routeManager.onRouteChanged = (stats) => {
    uiManager.updateDraftStats(stats);
    if (currentViewMode === 'approval') updateBuildingColors();
  };

  // 4. Load Data
  Promise.all([
    fetch(SETTINGS.files.visual).then(r => r.json()),
    fetch(SETTINGS.files.routing).then(r => r.json())
  ]).then(([visual, routing]) => {
    routeManager.initGraph(routing);
    renderCity(visual);
    gameManager.start();
  });

  animate();
}

function updateBuildingColors() {
  scene.traverse((obj) => {
    if (obj.name === 'BUILDING_MESH') {
      const data = obj.userData.cityData;
      if (!data) return;

      // 1. STANDARD VIEW
      if (currentViewMode === 'none') {
        obj.material.color.copy(SETTINGS.colors.building);
      }

      // 2. ZONING VIEW
      else if (currentViewMode === 'zoning') {
        if (data.type === 'residential') {
          const color = SETTINGS.colors.building.clone();
          color.lerp(SETTINGS.colors.zoningRes, data.density || 0.5);
          obj.material.color.copy(color);
        } else if (data.type === 'commercial') {
          const color = SETTINGS.colors.building.clone();
          color.lerp(SETTINGS.colors.zoningCom, data.density || 0.5);
          obj.material.color.copy(color);
        } else {
          obj.material.color.copy(SETTINGS.colors.building);
        }
      }

      // 3. APPROVAL / COVERAGE VIEW (GRADIENT)
      else if (currentViewMode === 'approval') {
        // Get graph node position
        const nearestId = obj.userData.nearestNodeId;
        // RouteManager has logic for this
        const node = routeManager.graphData.nodes[nearestId];

        if (node) {
          // Calculate distance to nearest transit
          // node.y is Z in world space
          const dist = routeManager.getDistanceToNearestTransit(node.x, node.y);

          // Color Logic: 
          // < 100m = Green (Great)
          // < 300m = Yellow (Okay)
          // > 600m = Red (Bad)

          if (dist === Infinity) {
            obj.material.color.copy(SETTINGS.colors.coverageBad); // Deep Red
          } else {
            const MAX_DIST = 600;
            const factor = Math.min(1.0, dist / MAX_DIST); // 0.0 (Close) to 1.0 (Far)

            // Lerp from Green to Red
            // (Green at 0, Red at 1)
            const color = SETTINGS.colors.coverageGood.clone();
            // We can lerp to Red.
            // Or use a Yellow midpoint?
            // Simple lerp: Green -> Red
            color.lerp(SETTINGS.colors.coverageBad, factor);
            obj.material.color.copy(color);
          }
        }
      }
    }
  });
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
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 3000; // Must be > 1225 to reach the ground
  dirLight.shadow.bias = -0.01;    // Clean up shadow artifacts

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

  // Dedicated Building Creator to cache Nearest Node ID
  const createBuildingLayer = (buildings) => {
    if (!buildings || !buildings.length) return;

    const mat = new THREE.MeshStandardMaterial({
      color: SETTINGS.colors.building,
      roughness: 0.6,
      side: THREE.DoubleSide,
      shadowSide: THREE.DoubleSide
    });

    buildings.forEach(b => {
      const shape = new THREE.Shape();
      if (b.shape.outer.length < 3) return;
      shape.moveTo(b.shape.outer[0][0], b.shape.outer[0][1]);
      for (let i = 1; i < b.shape.outer.length; i++) shape.lineTo(b.shape.outer[i][0], b.shape.outer[i][1]);

      if (b.shape.holes) {
        b.shape.holes.forEach(h => {
          const path = new THREE.Path();
          path.moveTo(h[0][0], h[0][1]);
          for (let k = 1; k < h.length; k++) path.lineTo(h[k][0], h[k][1]);
          shape.holes.push(path);
        });
      }

      const geom = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
      geom.rotateX(-Math.PI / 2);

      const mesh = new THREE.Mesh(geom, mat.clone());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'BUILDING_MESH';
      mesh.userData.cityData = b.data;

      // CALCULATE NEAREST NODE FOR APPROVAL MECHANIC
      // We use the first point of the outer ring as a proxy for position
      const bx = b.shape.outer[0][0];
      const by = b.shape.outer[0][1];

      const nearestId = routeManager.findNearestNode(bx, -by);
      mesh.userData.nearestNodeId = nearestId;

      scene.add(mesh);
    });
  };

  createBuildingLayer(data.buildings);
  createLayer(data.water, SETTINGS.colors.water, 0, 0.1, false);
  createLayer(data.parks, SETTINGS.colors.park, 0, 0.2, false);
  createLayer(data.roads, SETTINGS.colors.road, 0, 0.3, false);
}


function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta(); // Get time since last frame

  controls.update();
  if (vehicleSystem) {
    vehicleSystem.update(delta);
  }

  renderer.render(scene, camera);
}

init();
