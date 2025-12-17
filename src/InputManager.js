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

    // Optimization: Cache the ground mesh so we don't search for it every frame
    this.groundMesh = null;

    // Callbacks
    this.onClick = null;
    this.onDrag = null;
    this.onDragEnd = null;
    this.onHover = null;
  }

  init() {
    this.domElement.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.domElement.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.domElement.addEventListener('pointerup', this.onPointerUp.bind(this));

    // OPTIMIZATION 1: Find and cache the ground mesh once.
    // We assume the object is named "GROUND" as per main.js
    this.groundMesh = this.scene.getObjectByName("GROUND");
    if (!this.groundMesh) {
      console.warn("InputManager: Ground mesh not found during init. Raycasting may fail.");
    }
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
      // Use the optimized ground check
      const hit = this.raycastGround(event);
      if (hit && this.onDrag) {
        this.onDrag(this.dragObject, hit.point);
      }
      return;
    }

    // Case B: Hovering (Ghost Marker Logic)
    // OPTIMIZATION: This runs every frame. It must be blazing fast.
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

  /**
   * OPTIMIZATION 2: Filtered Raycast
   * Instead of checking scene.children (which checks 300k triangles in the city mesh),
   * we construct a small list of interactable objects: [Ground, ...Markers].
   */
  raycast(event) {
    if (!this.groundMesh) this.groundMesh = this.scene.getObjectByName("GROUND");

    this.raycaster.setFromCamera(this.getMouse(event), this.camera);

    // 1. Gather interactables
    const interactables = [this.groundMesh];

    // Efficiently gather markers without traversing deep hierarchies
    // We scan the top level children. If markers are grouped, update this loop.
    for (let i = 0; i < this.scene.children.length; i++) {
      const child = this.scene.children[i];
      if (child.userData.isMarker && child.name !== "GHOST_MARKER") {
        interactables.push(child);
      }
    }

    // 2. Raycast against ONLY these objects
    // Recursive = false (we assume markers and ground are simple meshes)
    const intersects = this.raycaster.intersectObjects(interactables, false);

    return intersects.length > 0 ? intersects[0] : null;
  }

  /**
   * OPTIMIZATION 3: Dedicated Ground Raycast
   * Only checks the ground plane. 
   * Used heavily in onPointerMove.
   */
  raycastGround(event) {
    if (!this.groundMesh) return null;

    this.raycaster.setFromCamera(this.getMouse(event), this.camera);

    // intersectObject (singular), recursive = false
    const intersects = this.raycaster.intersectObject(this.groundMesh, false);
    return intersects.length > 0 ? intersects[0] : null;
  }
}
