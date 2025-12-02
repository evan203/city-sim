export class UIManager {
  constructor(routeManager) {
    this.routeManager = routeManager;

    // DOM Elements
    this.elCurrentLength = document.getElementById('current-length');
    this.elRouteList = document.getElementById('route-list');
    this.elContainer = document.getElementById('ui-container');
    this.btnSave = document.getElementById('btn-save');
    this.btnDiscard = document.getElementById('btn-discard');
    this.btnToggle = document.getElementById('ui-toggle');

    this.initListeners();
  }

  initListeners() {
    this.btnSave.addEventListener('click', () => {
      this.routeManager.saveCurrentRoute();
      this.renderRouteList();
      this.updateStats(0);
    });

    this.btnDiscard.addEventListener('click', () => {
      this.routeManager.clearCurrentRoute();
      this.updateStats(0);
    });

    // Toggle Logic
    this.btnToggle.addEventListener('click', () => {
      this.elContainer.classList.toggle('hidden');
    });
  }

  updateStats(lengthInMeters) {
    let text = "";
    if (lengthInMeters > 1000) {
      text = (lengthInMeters / 1000).toFixed(2) + " km";
    } else {
      text = Math.round(lengthInMeters) + " m";
    }
    this.elCurrentLength.textContent = text;
  }

  renderRouteList() {
    this.elRouteList.innerHTML = '';
    const routes = this.routeManager.getSavedRoutes();

    routes.forEach((route, index) => {
      const li = document.createElement('li');

      let lenStr = route.length > 1000
        ? (route.length / 1000).toFixed(2) + " km"
        : Math.round(route.length) + " m";

      // Create Label
      const span = document.createElement('span');
      span.innerHTML = `<strong>Route ${index + 1}</strong> (${lenStr})`;
      li.appendChild(span);

      // Edit Button
      const btnEdit = document.createElement('button');
      btnEdit.textContent = "Edit";
      btnEdit.className = "btn-icon btn-edit";
      btnEdit.onclick = () => {
        this.routeManager.editSavedRoute(index);
        this.renderRouteList(); // Re-render to remove it from list
      };
      li.appendChild(btnEdit);

      // Delete Button
      const btnDel = document.createElement('button');
      btnDel.textContent = "✕";
      btnDel.className = "btn-icon btn-del";
      btnDel.onclick = () => {
        this.routeManager.deleteSavedRoute(index);
        this.renderRouteList();
      };
      li.appendChild(btnDel);

      this.elRouteList.appendChild(li);
    });
  }
}
