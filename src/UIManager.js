export class UIManager {
  constructor(routeManager) {
    this.routeManager = routeManager;

    // DOM Elements
    this.elCurrentLength = document.getElementById('current-length');
    this.elRouteList = document.getElementById('route-list');
    this.btnSave = document.getElementById('btn-save');
    this.btnDiscard = document.getElementById('btn-discard');

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
  }

  /**
   * Updates the text display for current route length
   * @param {number} lengthInMeters 
   */
  updateStats(lengthInMeters) {
    // Format: If > 1000m, show km. Else meters.
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

      // Format Length
      let lenStr = route.length > 1000
        ? (route.length / 1000).toFixed(2) + " km"
        : Math.round(route.length) + " m";

      li.innerHTML = `
                <span><strong>Route ${index + 1}</strong> (${lenStr})</span>
            `;

      // Delete Button
      const btnDel = document.createElement('button');
      btnDel.textContent = "✕";
      btnDel.onclick = () => {
        this.routeManager.deleteSavedRoute(index);
        this.renderRouteList();
      };

      li.appendChild(btnDel);
      this.elRouteList.appendChild(li);
    });
  }
}
