import * as THREE from 'three';

export class RouteManager {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;

    this.graphData = null;

    // -- State --
    this.isDrafting = false;
    this.currentRouteNodes = [];
    this.savedRoutes = [];

    // -- Visuals --
    this.markers = [];
    this.currentPathMesh = null;
    this.ghostMarker = null;

    this.servedNodes = new Set();
    this.servedCoordinates = [];
    this.ROAD_OFFSET = 2.5;

    this.onRouteChanged = null;
    this.gameManager = null;
    this.vehicleSystem = null;

    // Draft state
    this.latestPathPoints = [];

    // -- Spatial Optimization --
    this.spatialGrid = {};
    this.cellSize = 200; // Tune this: Larger = more nodes per cell, Smaller = more empty cells

    this.initGhostMarker();
  }

  setVehicleSystem(vs) {
    this.vehicleSystem = vs;
  }

  setGameManager(gm) {
    this.gameManager = gm;
  }

  initGraph(data) {
    this.graphData = data;
    this.graphData.adjacency = {};

    // 1. Fix Coordinates
    for (let key in this.graphData.nodes) {
      this.graphData.nodes[key].y = -this.graphData.nodes[key].y;
    }

    // 2. Build Adjacency
    this.graphData.edges.forEach((edge, index) => {
      if (edge.points) edge.points.forEach(p => { p[1] = -p[1]; });
      if (!this.graphData.adjacency[edge.u]) this.graphData.adjacency[edge.u] = [];
      this.graphData.adjacency[edge.u].push({ to: edge.v, cost: edge.length || 1, edgeIndex: index });
      if (!edge.oneway) {
        if (!this.graphData.adjacency[edge.v]) this.graphData.adjacency[edge.v] = [];
        this.graphData.adjacency[edge.v].push({ to: edge.u, cost: edge.length || 1, edgeIndex: index, isReverse: true });
      }
    });

    // 3. Build Spatial Index (The Performance Fix)
    this.buildSpatialIndex();
  }

  // ============================
  // Spatial Optimization
  // ============================

  buildSpatialIndex() {
    this.spatialGrid = {};

    // Iterate over all nodes once
    for (const [id, node] of Object.entries(this.graphData.nodes)) {
      const key = this.getGridKey(node.x, node.y);
      if (!this.spatialGrid[key]) {
        this.spatialGrid[key] = [];
      }
      // Store simple object for fast iteration
      this.spatialGrid[key].push({ id: parseInt(id), x: node.x, y: node.y });
    }
  }

  getGridKey(x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx}:${cy}`;
  }

  // Optimized Nearest Node Search
  findNearestNode(x, z) {
    if (!this.graphData) return null;

    const centerCx = Math.floor(x / this.cellSize);
    const centerCy = Math.floor(z / this.cellSize);

    let closestId = null;
    let minDist = Infinity;

    // Check center cell and immediate 8 neighbors
    // This reduces checks from ~5000 to ~20
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const key = `${centerCx + i}:${centerCy + j}`;
        const cellNodes = this.spatialGrid[key];

        if (cellNodes) {
          for (let k = 0; k < cellNodes.length; k++) {
            const node = cellNodes[k];
            const dx = node.x - x;
            const dz = node.y - z; // graph node.y is actually z in 3D space
            const d2 = dx * dx + dz * dz;

            if (d2 < minDist) {
              minDist = d2;
              closestId = node.id;
            }
          }
        }
      }
    }

    // Fallback: If no node was found in the local grid (e.g. sparse area), 
    // do a global search. This rarely happens if cellSize is reasonable.
    if (closestId === null) {
      return this.findNearestNodeBruteForce(x, z);
    }

    return closestId;
  }

  findNearestNodeBruteForce(x, z) {
    let closestId = null;
    let minDist = Infinity;
    for (const [id, node] of Object.entries(this.graphData.nodes)) {
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

  // ============================
  // Draft Mode & Ghost Marker
  // ============================

  initGhostMarker() {
    const geom = new THREE.SphereGeometry(4);
    const mat = new THREE.MeshBasicMaterial({
      color: this.settings.colors.pathStart,
      transparent: true,
      opacity: 0.5
    });
    this.ghostMarker = new THREE.Mesh(geom, mat);
    this.ghostMarker.visible = false;
    this.ghostMarker.name = "GHOST_MARKER";
    this.scene.add(this.ghostMarker);
  }

  startDrafting() {
    this.isDrafting = true;
    this.resetDraftingState();
  }

  stopDrafting() {
    this.isDrafting = false;
    this.ghostMarker.visible = false;
    this.clearCurrentRoute();
  }

  updateGhostMarker(worldPoint) {
    if (!this.isDrafting || !this.graphData) {
      this.ghostMarker.visible = false;
      return;
    }

    if (!worldPoint) {
      this.ghostMarker.visible = false;
      return;
    }

    const nodeId = this.findNearestNode(worldPoint.x, worldPoint.z);
    if (nodeId !== null) {
      const node = this.graphData.nodes[nodeId];
      this.ghostMarker.position.set(node.x, 2, node.y);
      this.ghostMarker.visible = true;
    } else {
      this.ghostMarker.visible = false;
    }
  }

  // ============================
  // Save / Load / Serialization
  // ============================

  getSerializableRoutes() {
    return this.savedRoutes.map(r => ({
      nodes: r.nodes,
      color: r.color
    }));
  }

  loadRoutes(routesData) {
    this.savedRoutes.forEach(r => {
      if (r.mesh) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
      }
    });
    this.savedRoutes = [];
    this.servedNodes.clear();

    if (this.vehicleSystem) this.vehicleSystem.clearVehicles();

    routesData.forEach((data, index) => {
      this.rebuildRouteFromData(data.nodes, data.color || this.getRandomColor(), index);
    });

    this.refreshServedNodes();
  }

  rebuildRouteFromData(nodes, color, routeIndex) {
    const pathResult = this.calculateGeometryFromNodes(nodes);
    if (!pathResult) return;

    const tubeMat = new THREE.MeshBasicMaterial({ color: color });
    const mesh = new THREE.Mesh(pathResult.geometry, tubeMat);
    this.scene.add(mesh);

    if (this.vehicleSystem && pathResult.points.length > 0) {
      this.vehicleSystem.addBusToRoute(pathResult.points, color, routeIndex);
    }

    const ridership = this.calculateRidership(nodes);

    this.savedRoutes.push({
      nodes: [...nodes],
      stats: { length: pathResult.length, cost: 0, ridership },
      mesh: mesh,
      color: color
    });
  }

  getRandomColor() {
    const colors = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#d946ef"];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // ============================
  // Gameplay Actions
  // ============================

  saveCurrentRoute() {
    if (!this.isDrafting) return false;
    if (this.currentRouteNodes.length < 2 || !this.currentPathMesh) {
      alert("Route must have at least 2 points.");
      return false;
    }

    const length = this.currentPathMesh.userData.length || 0;
    const cost = this.gameManager.getProjectedCost(length);

    if (!this.gameManager.canAfford(cost)) {
      alert("Insufficient Funds!");
      return false;
    }

    this.gameManager.deductFunds(cost);

    const color = this.getRandomColor();
    this.currentPathMesh.material.color.set(color);

    const routeIndex = this.savedRoutes.length;

    if (this.vehicleSystem && this.latestPathPoints.length > 0) {
      this.vehicleSystem.addBusToRoute(this.latestPathPoints, color, routeIndex);
    }

    const ridership = this.calculateRidership(this.currentRouteNodes);

    this.savedRoutes.push({
      nodes: [...this.currentRouteNodes],
      stats: { length, cost, ridership },
      mesh: this.currentPathMesh,
      color: color
    });

    this.currentPathMesh = null;
    this.refreshServedNodes();
    this.gameManager.recalculateApproval();
    this.gameManager.updateUI();

    return true;
  }

  updateRouteColor(index, hexColor) {
    if (index < 0 || index >= this.savedRoutes.length) return;
    const route = this.savedRoutes[index];
    route.color = hexColor;
    if (route.mesh) route.mesh.material.color.set(hexColor);
    if (this.vehicleSystem) this.vehicleSystem.updateRouteColor(index, hexColor);
  }

  deleteSavedRoute(index) {
    if (index < 0 || index >= this.savedRoutes.length) return;

    const route = this.savedRoutes[index];
    if (route.mesh) {
      this.scene.remove(route.mesh);
      route.mesh.geometry.dispose();
    }

    this.savedRoutes.splice(index, 1);

    if (this.vehicleSystem) {
      this.vehicleSystem.clearVehicles();
      this.savedRoutes.forEach((r, idx) => {
        const pathRes = this.calculateGeometryFromNodes(r.nodes);
        if (pathRes && pathRes.points.length > 0) {
          this.vehicleSystem.addBusToRoute(pathRes.points, r.color, idx);
        }
      });
    }

    this.refreshServedNodes();
    this.gameManager.recalculateApproval();
    this.gameManager.updateUI();
  }

  editSavedRoute(index) {
    if (index < 0 || index >= this.savedRoutes.length) return;

    const route = this.savedRoutes[index];
    this.currentRouteNodes = [...route.nodes];
    this.deleteSavedRoute(index);

    this.currentRouteNodes.forEach(nodeId => this.addMarkerVisual(nodeId));
    this.updatePathVisuals();
  }

  // ============================
  // Helpers
  // ============================

  calculateGeometryFromNodes(nodeList) {
    if (nodeList.length < 2) return null;

    let fullPathPoints = [];
    let totalDist = 0;

    for (let i = 0; i < nodeList.length - 1; i++) {
      const start = nodeList[i];
      const end = nodeList[i + 1];
      const segmentEdges = this.computePathAStar(start, end);

      if (!segmentEdges) continue;

      segmentEdges.forEach(step => {
        let dist = step.edgeData.length;
        if (!dist) {
          const p1 = step.edgeData.points[0];
          const p2 = step.edgeData.points[step.edgeData.points.length - 1];
          dist = Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
        }
        totalDist += dist;

        const rawPoints = step.edgeData.points;
        let segmentPoints = rawPoints.map(p => new THREE.Vector2(p[0], p[1]));
        if (step.isReverse) segmentPoints.reverse();

        const offsetSegment = this.getOffsetPath(segmentPoints, this.ROAD_OFFSET);
        offsetSegment.forEach(p => fullPathPoints.push(new THREE.Vector3(p.x, 0.5, p.y)));
      });
    }

    if (fullPathPoints.length < 2) return null;

    const curve = new THREE.CatmullRomCurve3(fullPathPoints);
    const geometry = new THREE.TubeGeometry(curve, fullPathPoints.length, 1.5, 6, false);

    return { geometry, length: totalDist, points: fullPathPoints };
  }

  calculateRidership(nodeList) {
    if (!this.graphData || nodeList.length < 2) return 0;
    let totalPop = 0;
    let totalJobs = 0;
    nodeList.forEach(nodeId => {
      const node = this.graphData.nodes[nodeId];
      if (node) {
        totalPop += (node.pop || 0);
        totalJobs += (node.jobs || 0);
      }
    });
    const synergy = Math.min(totalPop, totalJobs);
    const GAME_BALANCE_MULTIPLIER = 1.0;
    return Math.floor(synergy * GAME_BALANCE_MULTIPLIER);
  }

  addNodeByWorldPosition(vector3) {
    if (!this.isDrafting) return;
    if (!this.graphData) return;

    const nodeId = this.findNearestNode(vector3.x, vector3.z);
    if (nodeId === null) return;
    if (this.currentRouteNodes.length > 0 && this.currentRouteNodes[this.currentRouteNodes.length - 1] === nodeId) return;
    this.currentRouteNodes.push(nodeId);
    this.addMarkerVisual(nodeId);
    this.updatePathVisuals();
  }

  dragNode(markerObject, worldPoint) {
    if (!this.isDrafting) return;
    if (!this.graphData) return;
    const index = this.markers.indexOf(markerObject);
    if (index === -1) return;
    const newNodeId = this.findNearestNode(worldPoint.x, worldPoint.z);
    if (this.currentRouteNodes[index] !== newNodeId) {
      this.currentRouteNodes[index] = newNodeId;
      const nodeData = this.graphData.nodes[newNodeId];
      markerObject.position.set(nodeData.x, 2, nodeData.y);
      markerObject.userData.nodeId = newNodeId;
      this.updatePathVisuals();
    }
  }

  clearCurrentRoute() {
    if (this.currentPathMesh) { this.scene.remove(this.currentPathMesh); this.currentPathMesh.geometry.dispose(); this.currentPathMesh = null; }
    this.resetDraftingState();
  }

  resetDraftingState() {
    this.currentRouteNodes = [];
    this.markers.forEach(m => this.scene.remove(m));
    this.markers = [];
    if (this.onRouteChanged) this.onRouteChanged({ length: 0, cost: 0, ridership: 0 });
  }

  getSavedRoutes() { return this.savedRoutes; }

  updatePathVisuals() {
    if (this.currentRouteNodes.length < 2) {
      if (this.currentPathMesh) {
        this.scene.remove(this.currentPathMesh);
        this.currentPathMesh = null;
      }
      if (this.onRouteChanged) this.onRouteChanged({ length: 0, cost: 0, ridership: 0 });
      return;
    }

    const result = this.calculateGeometryFromNodes(this.currentRouteNodes);
    if (!result) return;

    this.latestPathPoints = result.points;

    if (this.currentPathMesh) {
      this.scene.remove(this.currentPathMesh);
      this.currentPathMesh.geometry.dispose();
    }

    const tubeMat = new THREE.MeshBasicMaterial({ color: this.settings.colors.route });
    this.currentPathMesh = new THREE.Mesh(result.geometry, tubeMat);
    this.currentPathMesh.userData.length = result.length;
    this.scene.add(this.currentPathMesh);

    this.updateMarkerColors();

    const projectedRiders = this.calculateRidership(this.currentRouteNodes);
    const projectedCost = this.gameManager ? this.gameManager.getProjectedCost(result.length) : 0;

    if (this.onRouteChanged) {
      this.onRouteChanged({
        length: result.length,
        cost: projectedCost,
        ridership: projectedRiders
      });
    }
  }

  updateMarkerColors() {
    this.markers.forEach((marker, i) => {
      let color = 0xFFFF00;
      if (i === 0) color = this.settings.colors.pathStart;
      else if (i === this.markers.length - 1) color = this.settings.colors.pathEnd;
      marker.material.color.setHex(color);
    });
  }

  addMarkerVisual(nodeId) {
    const node = this.graphData.nodes[nodeId];
    const geom = new THREE.SphereGeometry(4);
    const mat = new THREE.MeshBasicMaterial({ color: this.settings.colors.pathEnd });
    const mesh = new THREE.Mesh(geom, mat);

    mesh.position.set(node.x, 2, node.y);
    mesh.userData = { isMarker: true, nodeId: nodeId };

    this.scene.add(mesh);
    this.markers.push(mesh);
    this.updateMarkerColors();
  }

  refreshServedNodes() {
    this.servedNodes.clear();
    this.servedCoordinates = [];

    this.savedRoutes.forEach(route => {
      route.nodes.forEach(nodeId => {
        if (!this.servedNodes.has(nodeId)) {
          this.servedNodes.add(nodeId);
          const node = this.graphData.nodes[nodeId];
          if (node) {
            this.servedCoordinates.push({ x: node.x, z: node.y });
          }
        }
      });
    });
  }

  getDistanceToNearestTransit(x, z) {
    if (this.servedCoordinates.length === 0) return Infinity;
    let minSq = Infinity;
    for (let i = 0; i < this.servedCoordinates.length; i++) {
      const sc = this.servedCoordinates[i];
      const dx = sc.x - x;
      const dz = sc.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minSq) minSq = d2;
    }
    return Math.sqrt(minSq);
  }

  computePathAStar(start, end) {
    if (start === end) return [];
    const openSet = new Set([start]);
    const cameFrom = {};
    const gScore = {};
    const fScore = {};
    gScore[start] = 0;
    fScore[start] = this.heuristic(start, end);

    while (openSet.size > 0) {
      let current = null;
      let minF = Infinity;
      for (const node of openSet) {
        const score = fScore[node] !== undefined ? fScore[node] : Infinity;
        if (score < minF) { minF = score; current = node; }
      }
      if (current === end) return this.reconstructPath(cameFrom, current);
      openSet.delete(current);

      const neighbors = this.graphData.adjacency[current] || [];
      for (const neighbor of neighbors) {
        const tentativeG = gScore[current] + neighbor.cost;
        if (tentativeG < (gScore[neighbor.to] !== undefined ? gScore[neighbor.to] : Infinity)) {
          cameFrom[neighbor.to] = { prev: current, edgeIdx: neighbor.edgeIndex, isReverse: neighbor.isReverse };
          gScore[neighbor.to] = tentativeG;
          fScore[neighbor.to] = tentativeG + this.heuristic(neighbor.to, end);
          openSet.add(neighbor.to);
        }
      }
    }
    return null;
  }

  heuristic(a, b) {
    const nA = this.graphData.nodes[a];
    const nB = this.graphData.nodes[b];
    return Math.sqrt((nA.x - nB.x) ** 2 + (nA.y - nB.y) ** 2);
  }

  reconstructPath(cameFrom, current) {
    const edges = [];
    while (current in cameFrom) {
      const data = cameFrom[current];
      edges.push({ edgeData: this.graphData.edges[data.edgeIdx], isReverse: data.isReverse });
      current = data.prev;
    }
    return edges.reverse();
  }

  getOffsetPath(points, offset) {
    if (points.length < 2) return points;
    const newPath = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dir = new THREE.Vector2().subVectors(p2, p1).normalize();
      const normal = new THREE.Vector2(-dir.y, dir.x);
      const off = normal.multiplyScalar(offset);
      newPath.push(new THREE.Vector2().addVectors(p1, off));
      if (i === points.length - 2) newPath.push(new THREE.Vector2().addVectors(p2, off));
    }
    return newPath;
  }
}
