import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

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

let scene, camera, renderer, controls, raycaster;
let mouse = new THREE.Vector2();
let routingData = null;
let cityData = null;

// Interaction State
let startNode = null;
let endNode = null;
let markers = { start: null, end: null, pathMesh: null };

function init() {
  setupScene();
  setupInteractions();

  Promise.all([
    fetch(SETTINGS.files.visual).then(r => r.json()),
    fetch(SETTINGS.files.routing).then(r => r.json())
  ]).then(([visual, routing]) => {
    cityData = visual;
    routingData = routing;

    renderCity(cityData);
    prepareGraph(routingData); // This now fixes the coordinates!
  });

  animate();
}

// ==========================================
// 2. Data Preparation & Coordinate Fix
// ==========================================
function prepareGraph(data) {
  // We must FLIP the Y coordinate of the graph data to -Z
  // because our visual map is rotated -90deg on the X axis.

  data.adjacency = {};

  // 1. Fix Nodes
  for (let key in data.nodes) {
    data.nodes[key].y = -data.nodes[key].y; // FLIP Y to Negative
  }

  // 2. Fix Edges
  data.edges.forEach((edge, index) => {
    // Flip geometry points
    if (edge.points) {
      edge.points.forEach(p => { p[1] = -p[1]; });
    }

    // Build Adjacency List
    if (!data.adjacency[edge.u]) data.adjacency[edge.u] = [];
    data.adjacency[edge.u].push({
      to: edge.v,
      cost: edge.length || 1,
      edgeIndex: index
    });

    if (!edge.oneway) {
      if (!data.adjacency[edge.v]) data.adjacency[edge.v] = [];
      data.adjacency[edge.v].push({
        to: edge.u,
        cost: edge.length || 1,
        edgeIndex: index,
        isReverse: true
      });
    }
  });
}

// ==========================================
// 3. Scene Setup
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

  raycaster = new THREE.Raycaster();
}

function setupInteractions() {
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  window.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);
    const hit = intersects.find(obj => obj.object.name === "GROUND");

    if (hit && routingData) {
      // Pass the Hit Point (X, Z) directly. 
      // Z corresponds to our flipped Y in the graph.
      handleMapClick(hit.point.x, hit.point.z);
    }
  });
}

// ==========================================
// 4. Visual Rendering
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

// ==========================================
// 5. Routing Logic (A*)
// ==========================================
function handleMapClick(x, z) {
  const nearestId = findNearestNode(x, z);

  if (!startNode) {
    startNode = nearestId;
    placeMarker('start', routingData.nodes[nearestId], SETTINGS.colors.pathStart);
    if (markers.end) { scene.remove(markers.end); markers.end = null; }
    if (markers.pathMesh) { scene.remove(markers.pathMesh); markers.pathMesh = null; }
    endNode = null;
  } else {
    endNode = nearestId;
    placeMarker('end', routingData.nodes[nearestId], SETTINGS.colors.pathEnd);
    const path = computePathAStar(startNode, endNode);
    if (path) drawPath(path);
    startNode = null;
  }
}

function findNearestNode(x, z) {
  let closestId = null;
  let minDist = Infinity;
  for (const [id, node] of Object.entries(routingData.nodes)) {
    // node.y is already flipped to match Z
    const dx = node.x - x;
    const dz = node.y - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < minDist) {
      minDist = d2;
      closestId = parseInt(id);
    }
  }
  return closestId;
}

function computePathAStar(start, end) {
  const openSet = new Set([start]);
  const cameFrom = {};
  const gScore = {};
  const fScore = {};

  gScore[start] = 0;
  fScore[start] = heuristic(start, end);

  while (openSet.size > 0) {
    let current = null;
    let minF = Infinity;
    for (const node of openSet) {
      const score = fScore[node] !== undefined ? fScore[node] : Infinity;
      if (score < minF) { minF = score; current = node; }
    }

    if (current === end) return reconstructPath(cameFrom, current);

    openSet.delete(current);

    const neighbors = routingData.adjacency[current] || [];
    for (const neighbor of neighbors) {
      const tentativeG = gScore[current] + neighbor.cost;
      if (tentativeG < (gScore[neighbor.to] !== undefined ? gScore[neighbor.to] : Infinity)) {
        cameFrom[neighbor.to] = { prev: current, edgeIdx: neighbor.edgeIndex, isReverse: neighbor.isReverse };
        gScore[neighbor.to] = tentativeG;
        fScore[neighbor.to] = tentativeG + heuristic(neighbor.to, end);
        openSet.add(neighbor.to);
      }
    }
  }
  return null;
}

function heuristic(a, b) {
  const nA = routingData.nodes[a];
  const nB = routingData.nodes[b];
  return Math.sqrt((nA.x - nB.x) ** 2 + (nA.y - nB.y) ** 2);
}

function reconstructPath(cameFrom, current) {
  const edges = [];
  while (current in cameFrom) {
    const data = cameFrom[current];
    edges.push({ edgeData: routingData.edges[data.edgeIdx], isReverse: data.isReverse });
    current = data.prev;
  }
  return edges.reverse();
}

// ==========================================
// 6. Path Drawing
// ==========================================
function drawPath(pathEdges) {
  if (markers.pathMesh) scene.remove(markers.pathMesh);

  const points = [];
  const ROAD_OFFSET = 3.0;

  pathEdges.forEach(step => {
    const rawPoints = step.edgeData.points;
    // Map raw array to Vectors. Note: p[1] is already flipped to Z space
    let segmentPoints = rawPoints.map(p => new THREE.Vector2(p[0], p[1]));

    if (step.isReverse) segmentPoints.reverse();

    // Calculate offset for "Right Hand Drive"
    const offsetSegment = getOffsetPath(segmentPoints, ROAD_OFFSET);

    offsetSegment.forEach(p => {
      // p.x is X, p.y is Z (since we flipped it)
      points.push(new THREE.Vector3(p.x, 0.5, p.y));
    });
  });

  const curve = new THREE.CatmullRomCurve3(points);
  const tubeGeom = new THREE.TubeGeometry(curve, points.length, 1.5, 6, false);
  const tubeMat = new THREE.MeshBasicMaterial({ color: SETTINGS.colors.route });
  markers.pathMesh = new THREE.Mesh(tubeGeom, tubeMat);
  scene.add(markers.pathMesh);
}

function getOffsetPath(points, offset) {
  if (points.length < 2) return points;
  const newPath = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];

    const dir = new THREE.Vector2().subVectors(p2, p1).normalize();
    // Normal for Right side: (-y, x) 
    // Since our Coordinate system is flipped (Z is inverted), (-y, x) works as "Right"
    const normal = new THREE.Vector2(-dir.y, dir.x);

    const off = normal.multiplyScalar(offset);
    newPath.push(new THREE.Vector2().addVectors(p1, off));
    if (i === points.length - 2) newPath.push(new THREE.Vector2().addVectors(p2, off));
  }
  return newPath;
}

function placeMarker(type, node, color) {
  if (markers[type]) scene.remove(markers[type]);
  const geom = new THREE.SphereGeometry(4);
  const mat = new THREE.MeshBasicMaterial({ color: color });
  const mesh = new THREE.Mesh(geom, mat);
  // node.y is now Z
  mesh.position.set(node.x, 2, node.y);
  markers[type] = mesh;
  scene.add(mesh);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

init();
