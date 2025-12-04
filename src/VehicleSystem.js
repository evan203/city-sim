import * as THREE from 'three';

export class VehicleSystem {
  constructor(scene) {
    this.scene = scene;
    this.buses = []; // { mesh, points, dists, totalLen, currentDist, speed, direction, routeIndex }

    this.busGeom = new THREE.BoxGeometry(3.5, 4.0, 10.0);
    this.busGeom.translate(0, 3.5, 0);

    this.baseBusMat = new THREE.MeshStandardMaterial({
      color: 0xF59E0B,
      emissive: 0xB45309,
      emissiveIntensity: 0.2,
      roughness: 0.2
    });
  }

  addBusToRoute(routePathPoints, colorStr, routeIndex) {
    if (!routePathPoints || routePathPoints.length < 2) return;

    const points = routePathPoints.map(p => p.clone());

    // Create material specific to this bus/route
    const mat = this.baseBusMat.clone();
    if (colorStr) {
      mat.color.set(colorStr);
      // Slight emissive tint of same color
      const c = new THREE.Color(colorStr);
      mat.emissive.set(c.multiplyScalar(0.5));
    }

    const mesh = new THREE.Mesh(this.busGeom, mat);
    mesh.position.copy(points[0]);
    mesh.castShadow = true;
    this.scene.add(mesh);

    // Pre-calculate
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
      speed: 40,
      direction: 1,
      routeIndex: routeIndex
    });
  }

  updateRouteColor(routeIndex, hexColor) {
    // Update all buses belonging to this route
    this.buses.forEach(bus => {
      if (bus.routeIndex === routeIndex) {
        bus.mesh.material.color.set(hexColor);
        const c = new THREE.Color(hexColor);
        bus.mesh.material.emissive.set(c.multiplyScalar(0.5));
      }
    });
  }

  clearVehicles() {
    this.buses.forEach(bus => {
      this.scene.remove(bus.mesh);
      bus.mesh.geometry.dispose();
      bus.mesh.material.dispose();
    });
    this.buses = [];
  }

  update(deltaTime) {
    this.buses.forEach(bus => {
      bus.currentDist += bus.speed * deltaTime * bus.direction;

      if (bus.currentDist >= bus.totalLen) {
        bus.currentDist = bus.totalLen;
        bus.direction = -1;
      } else if (bus.currentDist <= 0) {
        bus.currentDist = 0;
        bus.direction = 1;
      }

      let i = 0;
      while (i < bus.dists.length - 2 && bus.currentDist > bus.dists[i + 1]) {
        i++;
      }

      const startDist = bus.dists[i];
      const endDist = bus.dists[i + 1];
      const segmentLen = endDist - startDist;

      const alpha = segmentLen > 0.0001 ? (bus.currentDist - startDist) / segmentLen : 0;
      const pStart = bus.points[i];
      const pEnd = bus.points[i + 1];

      bus.mesh.position.lerpVectors(pStart, pEnd, alpha);
      const lookTarget = bus.direction === 1 ? pEnd : pStart;
      bus.mesh.lookAt(lookTarget);
    });
  }
}
