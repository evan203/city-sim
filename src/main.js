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
  },
  graphics: {
    shadows: true,
    antialias: true,
    maxPixelRatio: 1.0, // lower == more blurry, 2 or 3 for high res
    materialType: 'standard', // or 'standard'
    farClip: 9000, // view distance limit
  }
};

let scene, camera, renderer, controls;
let inputManager, routeManager, uiManager, gameManager, vehicleSystem;

let cityMesh; // The single mesh containing all buildings
let buildingRegistry = []; // Stores { data, nearestNodeId, startIndex, count } for each building

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
  if (!cityMesh || !buildingRegistry.length) return;

  const colorAttribute = cityMesh.geometry.attributes.color;
  const colorArray = colorAttribute.array;

  // Temp variables to avoid creating objects in loop
  const _color = new THREE.Color();

  // Iterate through every building in our registry
  for (let i = 0; i < buildingRegistry.length; i++) {
    const entry = buildingRegistry[i];
    const data = entry.data;

    // --- 1. Determine Target Color based on Mode ---

    // STANDARD VIEW
    if (currentViewMode === 'none') {
      _color.copy(SETTINGS.colors.building);
    }

    // ZONING VIEW
    else if (currentViewMode === 'zoning') {
      if (data.type === 'residential') {
        _color.copy(SETTINGS.colors.building).lerp(SETTINGS.colors.zoningRes, data.density || 0.5);
      } else if (data.type === 'commercial') {
        _color.copy(SETTINGS.colors.building).lerp(SETTINGS.colors.zoningCom, data.density || 0.5);
      } else {
        _color.copy(SETTINGS.colors.building);
      }
    }

    // APPROVAL VIEW
    else if (currentViewMode === 'approval') {
      // Use the pre-calculated nearest ID from registry
      const node = routeManager.graphData.nodes[entry.nearestNodeId];

      if (node) {
        const dist = routeManager.getDistanceToNearestTransit(node.x, node.y);

        if (dist === Infinity) {
          _color.copy(SETTINGS.colors.coverageBad);
        } else {
          const MAX_DIST = 600;
          const factor = Math.min(1.0, dist / MAX_DIST);
          // Lerp Good -> Bad
          _color.copy(SETTINGS.colors.coverageGood).lerp(SETTINGS.colors.coverageBad, factor);
        }
      } else {
        // Fallback if node not found
        _color.copy(SETTINGS.colors.coverageBad);
      }
    }

    // --- 2. Apply Color to Vertices ---
    // We update the specific range of vertices belonging to this building
    const start = entry.startIndex;
    const end = start + entry.count;

    for (let v = start; v < end; v++) {
      const idx = v * 3;
      colorArray[idx] = _color.r;
      colorArray[idx + 1] = _color.g;
      colorArray[idx + 2] = _color.b;
    }
  }

  // Flag that the geometry colors have changed so GPU updates
  colorAttribute.needsUpdate = true;
}


// ==========================================
// 2. Scene Setup
// ==========================================
function setupScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(SETTINGS.colors.background);
  scene.fog = new THREE.FogExp2(SETTINGS.colors.background, 0.0002);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 1, SETTINGS.graphics.farClip);
  camera.position.set(0, 800, 800);

  renderer = new THREE.WebGLRenderer({ antialias: SETTINGS.graphics.antialias, logarithmicDepthBuffer: true });
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';

  document.documentElement.style.margin = '0';
  document.documentElement.style.height = '100%';
  document.body.style.margin = '0';
  document.body.style.height = '100%';
  document.body.style.overflow = 'hidden'; // Prevents scrollbars

  renderer.shadowMap.enabled = SETTINGS.graphics.shadows;
  document.body.appendChild(renderer.domElement);

  const ambient = new THREE.HemisphereLight(0xffffff, 0x555555, 0.7);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight.position.set(500, 1000, 500);
  dirLight.castShadow = SETTINGS.graphics.shadows;
  if (SETTINGS.graphics.shadows) {
    dirLight.shadow.mapSize.set(2048, 2048);
    dirLight.shadow.camera.left = -1500;
    dirLight.shadow.camera.right = 1500;
    dirLight.shadow.camera.top = 1500;
    dirLight.shadow.camera.bottom = -1500;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 3000; // Must be > 1225 to reach the ground
    dirLight.shadow.bias = -0.0001;    // Clean up shadow artifacts
  }

  scene.add(dirLight);

  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(10000, 10000),
    new THREE.MeshLambertMaterial({ color: SETTINGS.colors.ground })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.5;
  plane.name = "GROUND";
  plane.receiveShadow = SETTINGS.graphics.shadows;
  scene.add(plane);

  controls = new MapControls(camera, renderer.domElement);
  controls.dampingFactor = 0.07;
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.1;

}

function resizeRendererToDisplaySize() {
  const canvas = renderer.domElement;
  const rect = canvas.getBoundingClientRect();

  const pixelRatio = Math.min(window.devicePixelRatio, SETTINGS.graphics.maxPixelRatio);

  // Calculate the required resolution
  const width = Math.round(rect.width * pixelRatio);
  const height = Math.round(rect.height * pixelRatio);

  // Check if the canvas is already the right size
  const needResize = canvas.width !== width || canvas.height !== height;

  if (needResize) {
    // Resize the render buffer, but do NOT change CSS style (false)
    renderer.setSize(width, height, false);
  }

  return needResize;
}

// ==========================================
// 3. Visual Rendering
// ==========================================

function renderCity(data) {
  // Helper for non-interactive layers (Water, Parks, Roads) - Optimizing these too is good practice
  // We will merge these per type as well to keep draw calls low
  const createMergedLayer = (items, color, height, lift, isExtruded) => {
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

      let geom;
      if (isExtruded) {
        geom = new THREE.ExtrudeGeometry(shape, { depth: item.height || height, bevelEnabled: false });
      } else {
        geom = new THREE.ShapeGeometry(shape);
      }

      geom.rotateX(-Math.PI / 2);
      if (!isExtruded) geom.translate(0, lift, 0);

      geometries.push(geom);
    });

    if (geometries.length === 0) return;

    const mergedGeom = BufferGeometryUtils.mergeGeometries(geometries);
    const mat = new THREE.MeshLambertMaterial({ color: color }); // Simple color for static layers
    const mesh = new THREE.Mesh(mergedGeom, mat);
    mesh.receiveShadow = SETTINGS.graphics.shadows;
    if (isExtruded) mesh.castShadow = SETTINGS.graphics.shadows;
    scene.add(mesh);
  };

  // --- OPTIMIZED BUILDING GENERATION ---
  const createBuildingLayer = (buildings) => {
    if (!buildings || !buildings.length) return;

    const geometries = [];
    buildingRegistry = []; // Reset registry

    let currentVertexOffset = 0;

    buildings.forEach(b => {
      // 1. Create Shape
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

      // 2. Create Geometry
      const geom = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false });
      geom.rotateX(-Math.PI / 2);

      // 3. Pre-calculate Logic Data (Nearest Node)
      const bx = b.shape.outer[0][0];
      const by = b.shape.outer[0][1];
      const nearestId = routeManager.findNearestNode(bx, -by);

      // 4. Register Metadata
      // We need to know how many vertices this building has to color it later
      const vertexCount = geom.attributes.position.count;

      buildingRegistry.push({
        data: b.data,           // Zoning/Density data
        nearestNodeId: nearestId, // For approval view
        startIndex: currentVertexOffset,
        count: vertexCount
      });

      currentVertexOffset += vertexCount;
      geometries.push(geom);
    });

    if (geometries.length === 0) return;

    // 5. Merge
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);

    // 6. Initialize Vertex Colors Attribute
    // Create a color buffer filled with white (1,1,1) by default
    const count = mergedGeometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      colors[i] = 1;
    }
    mergedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // 7. Material Setup
    let mat;
    if (SETTINGS.graphics.materialType === 'standard') {
      mat = new THREE.MeshStandardMaterial({
        vertexColors: true, // IMPORTANT: valid for merged mesh
        roughness: 0.6,
        side: THREE.DoubleSide,
        shadowSide: THREE.BackSide
      });
    } else {
      mat = new THREE.MeshLambertMaterial({
        vertexColors: true, // IMPORTANT
        roughness: 0.6,
        shadowSide: THREE.BackSide
      });
    }

    // 8. Create and Add Single Mesh
    cityMesh = new THREE.Mesh(mergedGeometry, mat);
    cityMesh.castShadow = SETTINGS.graphics.shadows;
    cityMesh.receiveShadow = SETTINGS.graphics.shadows;
    cityMesh.name = 'CITY_MESH';
    scene.add(cityMesh);
  };

  createBuildingLayer(data.buildings);
  createMergedLayer(data.water, SETTINGS.colors.water, 0, 0.1, false);
  createMergedLayer(data.parks, SETTINGS.colors.park, 0, 0.2, false);
  createMergedLayer(data.roads, SETTINGS.colors.road, 0, 0.3, false);
}


function animate() {
  requestAnimationFrame(animate);

  if (resizeRendererToDisplaySize()) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }

  const delta = clock.getDelta(); // Get time since last frame

  controls.update();
  if (vehicleSystem) {
    vehicleSystem.update(delta);
  }

  renderer.render(scene, camera);
}

init();
