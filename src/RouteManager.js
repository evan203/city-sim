import * as THREE from 'three';

export class RouteManager {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;

    this.graphData = null;

    // -- State --
    this.currentRouteNodes = [];
    this.savedRoutes = [];

    // -- Visuals --
    this.markers = [];
    this.currentPathMesh = null;

    this.servedNodes = new Set();

    this.servedCoordinates = [];

    this.ROAD_OFFSET = 2.5;

    this.onRouteChanged = null;
    this.gameManager = null;

    this.vehicleSystem = null;
    this.latestPathPoints = [];
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
    for (let key in this.graphData.nodes) {
      this.graphData.nodes[key].y = -this.graphData.nodes[key].y;
    }
    this.graphData.edges.forEach((edge, index) => {
      if (edge.points) edge.points.forEach(p => { p[1] = -p[1]; });
      if (!this.graphData.adjacency[edge.u]) this.graphData.adjacency[edge.u] = [];
      this.graphData.adjacency[edge.u].push({ to: edge.v, cost: edge.length || 1, edgeIndex: index });
      if (!edge.oneway) {
        if (!this.graphData.adjacency[edge.v]) this.graphData.adjacency[edge.v] = [];
        this.graphData.adjacency[edge.v].push({ to: edge.u, cost: edge.length || 1, edgeIndex: index, isReverse: true });
      }
    });
  }

  // Helper to check if a node is covered
  isNodeServed(nodeId) {
    return this.servedNodes.has(parseInt(nodeId));
  }

  // Rebuild the Set of served nodes
  refreshServedNodes() {
    this.servedNodes.clear();
    this.servedCoordinates = [];

    this.savedRoutes.forEach(route => {
      route.nodes.forEach(nodeId => {
        if (!this.servedNodes.has(nodeId)) {
          this.servedNodes.add(nodeId);

          const node = this.graphData.nodes[nodeId];
          if (node) {
            // Cache World Coordinates (x, z)
            // Note: node.y in graphData is already flipped to match World Z
            this.servedCoordinates.push({ x: node.x, z: node.y });
          }
        }
      });
    });
  }

  // Returns distance in meters. Returns Infinity if no routes exist.
  getDistanceToNearestTransit(x, z) {
    if (this.servedCoordinates.length === 0) return Infinity;

    let minSq = Infinity;

    // Optimization: Standard loop is faster than forEach for high freq calls
    for (let i = 0; i < this.servedCoordinates.length; i++) {
      const sc = this.servedCoordinates[i];
      const dx = sc.x - x;
      const dz = sc.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minSq) minSq = d2;
    }

    return Math.sqrt(minSq);
  }


  calculateRidership(nodeList) {
    if (!this.graphData || nodeList.length < 2) return 0;

    let totalPop = 0;
    let totalJobs = 0;

    // Sum census data for all nodes traversed by the route
    nodeList.forEach(nodeId => {
      const node = this.graphData.nodes[nodeId];
      if (node) {
        totalPop += (node.pop || 0);
        totalJobs += (node.jobs || 0);
      }
    });

    const synergy = Math.min(totalPop, totalJobs);

    // Efficiency Factor: How balanced is the route?
    // + Base multiplier (arbitrary game balance constant)
    const GAME_BALANCE_MULTIPLIER = 5.0;


    return Math.floor(synergy * GAME_BALANCE_MULTIPLIER);
  }

  // ============================
  // API Methods
  // ============================

  addNodeByWorldPosition(vector3) {
    if (!this.graphData) return;
    const nodeId = this.findNearestNode(vector3.x, vector3.z);
    if (nodeId === null) return;
    if (this.currentRouteNodes.length > 0 && this.currentRouteNodes[this.currentRouteNodes.length - 1] === nodeId) return;
    this.currentRouteNodes.push(nodeId);
    this.addMarkerVisual(nodeId);
    this.updatePathVisuals();
  }

  dragNode(markerObject, worldPoint) {
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


  saveCurrentRoute() {
    if (this.currentRouteNodes.length < 2 || !this.currentPathMesh) return;

    const length = this.currentPathMesh.userData.length || 0;
    const cost = this.gameManager.getProjectedCost(length);

    // 1. Check Funds
    if (!this.gameManager.canAfford(cost)) {
      alert("Insufficient Funds!");
      return;
    }

    // 2. Pay
    this.gameManager.deductFunds(cost);

    // Spawn bus
    if (this.vehicleSystem && this.latestPathPoints.length > 0) {
      this.vehicleSystem.addBusToRoute(this.latestPathPoints);
    }

    // 3. Freeze & Save
    this.currentPathMesh.material.color.setHex(0x10B981);

    const ridership = this.calculateRidership(this.currentRouteNodes);

    this.savedRoutes.push({
      nodes: [...this.currentRouteNodes],
      stats: { length, cost, ridership },
      mesh: this.currentPathMesh
    });

    this.currentPathMesh = null;
    this.resetDraftingState();

    this.refreshServedNodes();

    // Force UI update to show new total riders
    this.gameManager.updateUI();
  }

  editSavedRoute(index) {
    if (index < 0 || index >= this.savedRoutes.length) return;
    this.clearCurrentRoute();
    const route = this.savedRoutes[index];
    this.currentRouteNodes = [...route.nodes];
    if (route.mesh) { this.scene.remove(route.mesh); route.mesh.geometry.dispose(); }
    this.savedRoutes.splice(index, 1);

    this.refreshServedNodes();

    this.currentRouteNodes.forEach(nodeId => this.addMarkerVisual(nodeId));
    this.updatePathVisuals();
    this.gameManager.updateUI(); // Update UI since we removed a route (income drops)
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

  deleteSavedRoute(index) {
    if (index < 0 || index >= this.savedRoutes.length) return;
    const route = this.savedRoutes[index];
    if (route.mesh) { this.scene.remove(route.mesh); route.mesh.geometry.dispose(); }
    this.savedRoutes.splice(index, 1);
    this.refreshServedNodes();
    this.gameManager.updateUI();
  }

  getSavedRoutes() { return this.savedRoutes; }

  // ============================
  // Visuals & Logic
  // ============================

  updatePathVisuals() {
    if (this.currentRouteNodes.length < 2) {
      if (this.currentPathMesh) {
        this.scene.remove(this.currentPathMesh);
        this.currentPathMesh = null;
      }
      // Report 0 stats
      if (this.onRouteChanged) this.onRouteChanged({ length: 0, cost: 0, ridership: 0 });
      return;
    }

    let fullPathPoints = [];
    let totalDist = 0;

    for (let i = 0; i < this.currentRouteNodes.length - 1; i++) {
      const start = this.currentRouteNodes[i];
      const end = this.currentRouteNodes[i + 1];
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

    this.latestPathPoints = fullPathPoints;

    // Rebuild Mesh
    if (this.currentPathMesh) {
      this.scene.remove(this.currentPathMesh);
      this.currentPathMesh.geometry.dispose();
    }

    if (fullPathPoints.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(fullPathPoints);
    const tubeGeom = new THREE.TubeGeometry(curve, fullPathPoints.length, 1.5, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: this.settings.colors.route });

    this.currentPathMesh = new THREE.Mesh(tubeGeom, tubeMat);
    this.currentPathMesh.userData.length = totalDist;
    this.scene.add(this.currentPathMesh);

    this.updateMarkerColors();

    // -- CALCULATE LIVE GAMEPLAY STATS --
    const projectedRiders = this.calculateRidership(this.currentRouteNodes);
    const projectedCost = this.gameManager ? this.gameManager.getProjectedCost(totalDist) : 0;

    if (this.onRouteChanged) {
      this.onRouteChanged({
        length: totalDist,
        cost: projectedCost,
        ridership: projectedRiders
      });
    }
  }

  updateMarkerColors() {
    this.markers.forEach((marker, i) => {
      let color = 0xFFFF00; // Yellow
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

  // ============================
  // Algorithms
  // ============================

  findNearestNode(x, z) {
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
