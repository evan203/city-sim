import * as THREE from 'three';

export class InputManager {
  constructor(camera, domElement, scene) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // State for Pan detection
    this.downPosition = new THREE.Vector2();
    this.upPosition = new THREE.Vector2();
    this.isDragging = false;

    // Callbacks
    this.onClick = null; // Function(point, intersectionObject)
  }

  init() {
    this.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.domElement.addEventListener('pointerup', this.onPointerUp.bind(this));
  }

  onPointerDown(event) {
    if (event.button !== 0) return; // Only left click

    this.downPosition.set(event.clientX, event.clientY);
    this.isDragging = false;
  }

  onPointerUp(event) {
    if (event.button !== 0) return;

    this.upPosition.set(event.clientX, event.clientY);

    // Calculate distance moved
    const distance = this.downPosition.distanceTo(this.upPosition);

    // Threshold (pixels): If moved more than 3px, it's a pan, not a click
    if (distance > 3) {
      this.isDragging = true;
      return; // Ignore
    }

    this.handleClick(event);
  }

  handleClick(event) {
    // 1. Normalize Mouse
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // 2. Raycast
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    if (intersects.length > 0) {
      // Find the first relevant hit (Ground or Markers)
      // For now, we prioritize Markers, then Ground
      const hit = intersects.find(obj =>
        obj.object.name === "GROUND" || obj.object.userData.isMarker
      );

      if (hit && this.onClick) {
        this.onClick(hit.point, hit.object);
      }
    }
  }
}
