import * as THREE from 'three';

export class RouteManager {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;

    this.graphData = null;

    // State: A route is an ordered list of Node IDs
    this.currentRouteNodes = [];

    // Visuals
    this.markers = []; // Array of Meshes. index matches currentRouteNodes
    this.pathMesh = null;

    this.ROAD_OFFSET = 2.5; // Meters
  }

  initGraph(data) {
    this.graphData = data;
    this.graphData.adjacency = {};

    // 1. Flip Coordinates (Data is +Y North, 3D is -Z North)
    for (let key in this.graphData.nodes) {
      this.graphData.nodes[key].y = -this.graphData.nodes[key].y;
    }

    // 2. Build Adjacency
    this.graphData.edges.forEach((edge, index) => {
      // Flip edge geometry
      if (edge.points) edge.points.forEach(p => { p[1] = -p[1]; });

      // Forward
      if (!this.graphData.adjacency[edge.u]) this.graphData.adjacency[edge.u] = [];
      this.graphData.adjacency[edge.u].push({
        to: edge.v, cost: edge.length || 1, edgeIndex: index
      });

      // Reverse (if not oneway)
      if (!edge.oneway) {
        if (!this.graphData.adjacency[edge.v]) this.graphData.adjacency[edge.v] = [];
        this.graphData.adjacency[edge.v].push({
          to: edge.u, cost: edge.length || 1, edgeIndex: index, isReverse: true
        });
      }
    });
  }

  // ============================
  // Interaction Methods
  // ============================

  addNodeByWorldPosition(vector3) {
    if (!this.graphData) return;
    const nodeId = this.findNearestNode(vector3.x, vector3.z);
    if (nodeId === null) return;

    // Don't add duplicate adjacent nodes
    if (this.currentRouteNodes.length > 0 &&
      this.currentRouteNodes[this.currentRouteNodes.length - 1] === nodeId) {
      return;
    }

    this.currentRouteNodes.push(nodeId);

    // Add new marker
    this.addMarkerVisual(nodeId);

    // Update path
    this.updatePathVisuals();
  }

  /**
   * Called while dragging a marker.
   * Updates the node at markerIndex to the nearest graph node at worldPoint.
   */
  dragNode(markerObject, worldPoint) {
    if (!this.graphData) return;

    // 1. Identify which node index this marker represents
    const index = this.markers.indexOf(markerObject);
    if (index === -1) return;

    // 2. Find nearest node to new mouse position
    const newNodeId = this.findNearestNode(worldPoint.x, worldPoint.z);

    // 3. Optimization: Only update if the node ID actually changed
    if (this.currentRouteNodes[index] !== newNodeId) {

      this.currentRouteNodes[index] = newNodeId;

      // Update Marker Visual Position
      const nodeData = this.graphData.nodes[newNodeId];
      markerObject.position.set(nodeData.x, 2, nodeData.y);
      markerObject.userData.nodeId = newNodeId; // Keep sync

      // Recalculate Path
      this.updatePathVisuals();
    }
  }

  // ============================
  // Visual Logic
  // ============================

  updatePathVisuals() {
    // Need 2+ nodes to make a path
    if (this.currentRouteNodes.length < 2) {
      if (this.pathMesh) {
        this.scene.remove(this.pathMesh);
        this.pathMesh = null;
      }
      return;
    }

    // 1. Calculate Geometry
    let fullPathPoints = [];

    for (let i = 0; i < this.currentRouteNodes.length - 1; i++) {
      const start = this.currentRouteNodes[i];
      const end = this.currentRouteNodes[i + 1];

      // Run A* for this segment
      const segmentEdges = this.computePathAStar(start, end);

      if (!segmentEdges) {
        // No path found (disconnected graph?), just draw straight line or skip
        continue;
      }

      // Process Geometry
      segmentEdges.forEach(step => {
        const rawPoints = step.edgeData.points;
        let segmentPoints = rawPoints.map(p => new THREE.Vector2(p[0], p[1]));
        if (step.isReverse) segmentPoints.reverse();

        // Offset
        const offsetSegment = this.getOffsetPath(segmentPoints, this.ROAD_OFFSET);
        offsetSegment.forEach(p => fullPathPoints.push(new THREE.Vector3(p.x, 0.5, p.y)));
      });
    }

    // 2. Update/Create Mesh
    if (this.pathMesh) {
      this.scene.remove(this.pathMesh);
      this.pathMesh.geometry.dispose();
    }

    if (fullPathPoints.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(fullPathPoints);
    // Low tension = smoother corners
    const tubeGeom = new THREE.TubeGeometry(curve, fullPathPoints.length, 1.5, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: this.settings.colors.route });

    this.pathMesh = new THREE.Mesh(tubeGeom, tubeMat);
    this.scene.add(this.pathMesh);
  }

  addMarkerVisual(nodeId) {
    const node = this.graphData.nodes[nodeId];
    const geom = new THREE.SphereGeometry(4);

    // Color Logic: Start(Green) -> End(Red). Intermediate? Yellow.
    let color = this.settings.colors.pathStart;
    if (this.markers.length > 0) color = this.settings.colors.pathEnd; // Default to End color

    // If we are adding a new end, turn the PREVIOUS end into a waypoint (Yellow)
    if (this.markers.length > 0) {
      // Change the previous last marker to yellow (waypoint)
      // Unless it was the start marker (index 0)
      if (this.markers.length > 1) {
        this.markers[this.markers.length - 1].material.color.setHex(0xFFFF00);
      }
    }

    const mat = new THREE.MeshBasicMaterial({ color: color });
    const mesh = new THREE.Mesh(geom, mat);

    mesh.position.set(node.x, 2, node.y);
    mesh.userData = { isMarker: true, nodeId: nodeId };

    this.scene.add(mesh);
    this.markers.push(mesh);
  }

  // ============================
  // Algorithms (A* & Math)
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
