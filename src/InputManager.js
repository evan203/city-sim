import * as THREE from 'three';

export class InputManager {
  constructor(camera, domElement, scene, controls) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;
    this.controls = controls;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Interaction State
    this.downPosition = new THREE.Vector2();
    this.dragObject = null;
    this.isPanning = false;

    // Callbacks
    this.onClick = null;     // (point, object) -> void
    this.onDrag = null;      // (object, newPoint) -> void
    this.onDragEnd = null;   // () -> void
    this.onHover = null;     // (point) -> void  <-- NEW
  }

  init() {
    this.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.domElement.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.domElement.addEventListener('pointerup', this.onPointerUp.bind(this));
  }

  onPointerDown(event) {
    if (event.button !== 0) return;

    this.downPosition.set(event.clientX, event.clientY);
    this.isPanning = false;

    const hit = this.raycast(event);

    if (hit) {
      if (hit.object.userData.isMarker) {
        this.dragObject = hit.object;
        this.controls.enabled = false;
        this.domElement.style.cursor = 'grabbing';
      }
    }
  }

  onPointerMove(event) {
    // Case A: Dragging a Marker
    if (this.dragObject) {
      const hit = this.raycastGround(event);
      if (hit && this.onDrag) {
        this.onDrag(this.dragObject, hit.point);
      }
      return;
    }

    // Case B: Hovering (Ghost Marker Logic) <-- NEW
    // We only care about hovering the ground for placing new nodes
    const hit = this.raycastGround(event);
    if (hit && this.onHover) {
      this.onHover(hit.point);
    }
  }

  onPointerUp(event) {
    if (event.button !== 0) return;

    if (this.dragObject) {
      this.dragObject = null;
      this.controls.enabled = true;
      this.domElement.style.cursor = 'auto';
      if (this.onDragEnd) this.onDragEnd();
      return;
    }

    const upPosition = new THREE.Vector2(event.clientX, event.clientY);
    if (this.downPosition.distanceTo(upPosition) > 3) {
      return;
    }

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
    // Ignore Ghost Marker in standard raycast interaction
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    return intersects.find(obj =>
      (obj.object.name === "GROUND" || obj.object.userData.isMarker) &&
      obj.object.name !== "GHOST_MARKER"
    );
  }

  raycastGround(event) {
    this.raycaster.setFromCamera(this.getMouse(event), this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);
    return intersects.find(obj => obj.object.name === "GROUND");
  }
}
