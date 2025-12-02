import * as THREE from 'three';

export class InputManager {
  constructor(camera, domElement, scene, controls) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;
    this.controls = controls; // Need access to controls to disable them during drag

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Interaction State
    this.downPosition = new THREE.Vector2();
    this.dragObject = null; // The object currently being dragged (marker)
    this.isPanning = false;

    // Callbacks
    this.onClick = null;     // (point, object) -> void
    this.onDrag = null;      // (object, newPoint) -> void
    this.onDragEnd = null;   // () -> void
  }

  init() {
    this.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.domElement.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.domElement.addEventListener('pointerup', this.onPointerUp.bind(this));
  }

  onPointerDown(event) {
    if (event.button !== 0) return; // Left click only

    // Record start position for Pan detection
    this.downPosition.set(event.clientX, event.clientY);
    this.isPanning = false;

    // Raycast to see what we hit (Marker vs Ground)
    const hit = this.raycast(event);

    if (hit) {
      // Case A: We hit a Marker -> Start Dragging
      if (hit.object.userData.isMarker) {
        this.dragObject = hit.object;
        this.controls.enabled = false; // Disable camera orbit
        this.domElement.style.cursor = 'grabbing';
      }
    }
  }

  onPointerMove(event) {
    // Case A: Dragging a Marker
    if (this.dragObject) {
      // Raycast against the GROUND to find where we are dragging to
      const hit = this.raycastGround(event);
      if (hit && this.onDrag) {
        this.onDrag(this.dragObject, hit.point);
      }
      return;
    }

    // Case B: Detecting Pan
    // If mouse is down and moving, check distance
    // (We don't need continuous logic here, just the final check in pointerUp is usually enough,
    // but for "floating pointer" later we'd use this.)
  }

  onPointerUp(event) {
    if (event.button !== 0) return;

    // 1. If we were dragging a marker, stop now.
    if (this.dragObject) {
      this.dragObject = null;
      this.controls.enabled = true; // Re-enable camera
      this.domElement.style.cursor = 'auto';
      if (this.onDragEnd) this.onDragEnd();
      return; // Don't trigger a click
    }

    // 2. Check if it was a Camera Pan (move > 3px)
    const upPosition = new THREE.Vector2(event.clientX, event.clientY);
    if (this.downPosition.distanceTo(upPosition) > 3) {
      return; // It was a pan, ignore
    }

    // 3. It was a clean Click (Place new node)
    const hit = this.raycast(event);
    if (hit && hit.object.name === "GROUND" && this.onClick) {
      this.onClick(hit.point, hit.object);
    }
  }

  // --- Helpers ---

  getMouse(event) {
    const r = this.domElement.getBoundingClientRect();
    const x = ((event.clientX - r.left) / r.width) * 2 - 1;
    const y = -((event.clientY - r.top) / r.height) * 2 + 1;
    return new THREE.Vector2(x, y);
  }

  raycast(event) {
    this.raycaster.setFromCamera(this.getMouse(event), this.camera);
    // Intersection order: Markers (sorted by dist) -> Ground
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    // Return first valid hit (Marker or Ground)
    return intersects.find(obj => obj.object.name === "GROUND" || obj.object.userData.isMarker);
  }

  raycastGround(event) {
    this.raycaster.setFromCamera(this.getMouse(event), this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    return intersects.find(obj => obj.object.name === "GROUND");
  }
}
