import * as THREE from 'three';

export class RouteManager {
  constructor(scene, settings) {
    this.scene = scene;
    this.settings = settings;

    this.graphData = null;

    // State: A route is an ordered list of Node IDs
    this.currentRouteNodes = [];

    // Visuals
    this.markers = [];
    this.pathMesh = null;

    // Constants
    this.ROAD_OFFSET = 3.0; // Meters to right
  }

  initGraph(data) {
    this.graphData = data;

    // Prepare Adjacency List (mirrors previous logic)
    // IMPORTANT: Fix coordinates here once, so logic uses correct Z
    this.graphData.adjacency = {};

    // 1. Flip Y to Z for Nodes
    for (let key in this.graphData.nodes) {
      this.graphData.nodes[key].y = -this.graphData.nodes[key].y;
    }

    // 2. Process Edges
    this.graphData.edges.forEach((edge, index) => {
      // Flip geometry points
      if (edge.points) {
        edge.points.forEach(p => { p[1] = -p[1]; });
      }

      if (!this.graphData.adjacency[edge.u]) this.graphData.adjacency[edge.u] = [];
      this.graphData.adjacency[edge.u].push({
        to: edge.v,
        cost: edge.length || 1,
        edgeIndex: index
      });

      if (!edge.oneway) {
        if (!this.graphData.adjacency[edge.v]) this.graphData.adjacency[edge.v] = [];
        this.graphData.adjacency[edge.v].push({
          to: edge.u,
          cost: edge.length || 1,
          edgeIndex: index,
          isReverse: true
        });
      }
    });
  }

  // ============================
  // Interaction Methods
  // ============================

  /**
   * Called when user clicks the map. Adds a node to the route.
   */
  addNodeByWorldPosition(vector3) {
    if (!this.graphData) return;

    const nodeId = this.findNearestNode(vector3.x, vector3.z);

    // Prevent adding same node twice in a row
    if (this.currentRouteNodes.length > 0 &&
      this.currentRouteNodes[this.currentRouteNodes.length - 1] === nodeId) {
      return;
    }

    this.currentRouteNodes.push(nodeId);

    // Visuals
    this.addMarker(nodeId);
    this.updatePathVisuals();
  }

  resetRoute() {
    this.currentRouteNodes = [];
    // Clear Visuals
    this.markers.forEach(m => this.scene.remove(m));
    this.markers = [];
    if (this.pathMesh) {
      this.scene.remove(this.pathMesh);
      this.pathMesh = null;
    }
  }

  // ============================
  // Logic & Algorithms
  // ============================

  findNearestNode(x, z) {
    let closestId = null;
    let minDist = Infinity;
    for (const [id, node] of Object.entries(this.graphData.nodes)) {
      const dx = node.x - x;
      const dz = node.y - z; // Graph Y is World Z
      const d2 = dx * dx + dz * dz;
      if (d2 < minDist) {
        minDist = d2;
        closestId = parseInt(id);
      }
    }
    return closestId;
  }

  updatePathVisuals() {
    // We need at least 2 nodes to draw a path
    if (this.currentRouteNodes.length < 2) return;

    // 1. Calculate Full Path (Segment by Segment)
    let fullPathPoints = [];

    for (let i = 0; i < this.currentRouteNodes.length - 1; i++) {
      const start = this.currentRouteNodes[i];
      const end = this.currentRouteNodes[i + 1];

      const segmentEdges = this.computePathAStar(start, end);

      if (!segmentEdges) {
        console.warn(`No path found between ${start} and ${end}`);
        continue;
      }

      // Process Geometry for this segment
      segmentEdges.forEach(step => {
        const rawPoints = step.edgeData.points;
        let segmentPoints = rawPoints.map(p => new THREE.Vector2(p[0], p[1]));
        if (step.isReverse) segmentPoints.reverse();

        const offsetSegment = this.getOffsetPath(segmentPoints, this.ROAD_OFFSET);

        offsetSegment.forEach(p => {
          fullPathPoints.push(new THREE.Vector3(p.x, 0.5, p.y));
        });
      });
    }

    // 2. Draw Tube
    if (this.pathMesh) this.scene.remove(this.pathMesh);
    if (fullPathPoints.length < 2) return;

    const curve = new THREE.CatmullRomCurve3(fullPathPoints);
    const tubeGeom = new THREE.TubeGeometry(curve, fullPathPoints.length, 1.5, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: this.settings.colors.route });

    this.pathMesh = new THREE.Mesh(tubeGeom, tubeMat);
    this.scene.add(this.pathMesh);
  }

  addMarker(nodeId) {
    const node = this.graphData.nodes[nodeId];
    const geom = new THREE.SphereGeometry(4);

    // Color logic: Green for start, Red for end, Yellow for waypoints
    let color = this.settings.colors.pathStart;
    if (this.markers.length > 0) color = 0xFFFF00; // Middle

    const mat = new THREE.MeshBasicMaterial({ color: color });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(node.x, 2, node.y);
    mesh.userData = { isMarker: true, nodeId: nodeId }; // Tag for input manager

    this.scene.add(mesh);
    this.markers.push(mesh);

    // Update last marker to Red
    if (this.markers.length > 1) {
      this.markers[this.markers.length - 1].material.color.setHex(this.settings.colors.pathEnd);
    }
  }

  // ============================
  // A* Implementation
  // ============================
  computePathAStar(start, end) {
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
