import * as THREE from 'three';

export class VehicleSystem {
  constructor(scene) {
    this.scene = scene;
    this.buses = []; // { mesh, points, dists, totalLen, currentDist, speed, direction }

    this.busGeom = new THREE.BoxGeometry(3.5, 4.0, 10.0);
    this.busGeom.translate(0, 3.5, 0);

    this.busMat = new THREE.MeshStandardMaterial({
      color: 0xF59E0B,      // Amber body
      emissive: 0xB45309,   // Slight orange glow so they don't get lost in shadow
      emissiveIntensity: 0.4,
      roughness: 0.2
    });
  }

  addBusToRoute(routePathPoints) {
    if (!routePathPoints || routePathPoints.length < 2) return;

    // Clone points to ensure they aren't affected by outside changes
    const points = routePathPoints.map(p => p.clone());

    const mesh = new THREE.Mesh(this.busGeom, this.busMat);
    mesh.position.copy(points[0]);
    mesh.castShadow = true;
    this.scene.add(mesh);

    // Pre-calculate cumulative distances for smooth interpolation
    let totalLen = 0;
    const dists = [0];
    for (let i = 0; i < points.length - 1; i++) {
      const d = points[i].distanceTo(points[i + 1]);
      totalLen += d;
      dists.push(totalLen);
    }

    this.buses.push({
      mesh: mesh,
      points: points,
      dists: dists,
      totalLen: totalLen,
      currentDist: 0,
      speed: 40, // Speed in units/sec
      direction: 1 // 1 = Forward, -1 = Backward
    });
  }

  update(deltaTime) {
    this.buses.forEach(bus => {
      // 1. Move
      bus.currentDist += bus.speed * deltaTime * bus.direction;

      // 2. Check Bounds & Reversal
      if (bus.currentDist >= bus.totalLen) {
        bus.currentDist = bus.totalLen;
        bus.direction = -1;
      } else if (bus.currentDist <= 0) {
        bus.currentDist = 0;
        bus.direction = 1;
      }

      // 3. Find current segment index
      let i = 0;
      // Simple linear search (efficient enough for small N points)
      while (i < bus.dists.length - 2 && bus.currentDist > bus.dists[i + 1]) {
        i++;
      }

      // 4. Interpolate Position
      const startDist = bus.dists[i];
      const endDist = bus.dists[i + 1];
      const segmentLen = endDist - startDist;

      // Avoid divide by zero if 2 points are identical
      const alpha = segmentLen > 0.0001 ? (bus.currentDist - startDist) / segmentLen : 0;

      const pStart = bus.points[i];
      const pEnd = bus.points[i + 1];

      bus.mesh.position.lerpVectors(pStart, pEnd, alpha);

      // 5. Rotation (Look at target)
      const lookTarget = bus.direction === 1 ? pEnd : pStart;
      bus.mesh.lookAt(lookTarget);
    });
  }
}
