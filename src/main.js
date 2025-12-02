import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

import { InputManager } from './InputManager.js';
import { RouteManager } from './RouteManager.js';
import { UIManager } from './UIManager.js';


// ==========================================
// 1. Configuration
// ==========================================
const SETTINGS = {
  colors: {
    background: 0xE6E6E6,
    ground: 0xDDDDDD,
    zoningRes: new THREE.Color(0xA855F7),
    zoningCom: new THREE.Color(0x3B82F6),
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
let inputManager, routeManager, uiManager;

function init() {
  setupScene();

  // 1. Managers
  routeManager = new RouteManager(scene, SETTINGS);
  inputManager = new InputManager(camera, renderer.domElement, scene, controls);
  uiManager = new UIManager(routeManager); // Wire UI to Route Logic

  // 2. Events
  inputManager.init();

  inputManager.onClick = (point, object) => {
    if (object.name === "GROUND") {
      routeManager.addNodeByWorldPosition(point);
    }
  };

  inputManager.onDrag = (markerObject, newPoint) => {
    routeManager.dragNode(markerObject, newPoint);
  };

  // Wire RouteManager back to UI (to update stats when dragging)
  routeManager.onRouteChanged = (dist) => {
    uiManager.updateStats(dist);
  };

  uiManager.onToggleZoning = (isActive) => {
    updateBuildingColors(isActive);
  };

  // 3. Data Load
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

function updateBuildingColors(showZoning) {
  scene.traverse((obj) => {
    // We tagged buildings with userData in renderCity (see below)
    if (obj.name === 'BUILDING_MESH') {

      if (!showZoning) {
        // Revert to white
        obj.material.color.setHex(SETTINGS.colors.building.getHex());
        return;
      }

      // Get Data
      const data = obj.userData.cityData; // We need to ensure we save this during creation
      if (!data) return;

      if (data.type === 'residential') {
        // Lerp from White to Purple based on density
        const color = SETTINGS.colors.building.clone();
        color.lerp(SETTINGS.colors.zoningRes, data.density || 0.5);
        obj.material.color.copy(color);
      }
      else if (data.type === 'commercial') {
        // Lerp from White to Blue
        const color = SETTINGS.colors.building.clone();
        color.lerp(SETTINGS.colors.zoningCom, data.density || 0.5);
        obj.material.color.copy(color);
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

  createBuildingLayer(data.buildings);

  createLayer(data.water, SETTINGS.colors.water, 0, 0.1, false);
  createLayer(data.parks, SETTINGS.colors.park, 0, 0.2, false);
  createLayer(data.roads, SETTINGS.colors.road, 0, 0.3, false);

}

function createBuildingLayer(buildings) {
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

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: b.height,
      bevelEnabled: false
    });
    geom.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(geom, mat.clone());
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Store metadata for the Zoning Toggle
    mesh.name = 'BUILDING_MESH';
    mesh.userData.cityData = b.data;

    scene.add(mesh);
  });
}


function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

init();
