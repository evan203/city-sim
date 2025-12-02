export class UIManager {
  constructor(routeManager) {
    this.routeManager = routeManager;

    // UI Elements
    this.elCurrentLength = document.getElementById('current-length');
    this.elCurrentCost = document.getElementById('current-cost');   // NEW
    this.elCurrentRiders = document.getElementById('current-riders'); // NEW

    this.elBudget = document.getElementById('val-budget'); // NEW
    this.elDay = document.getElementById('val-day');       // NEW
    this.elTotalRiders = document.getElementById('val-riders'); // NEW
    this.elIncomeFloat = document.getElementById('income-float'); // NEW

    this.elRouteList = document.getElementById('route-list');
    this.elContainer = document.getElementById('ui-container');

    this.btnSave = document.getElementById('btn-save');
    this.btnDiscard = document.getElementById('btn-discard');
    this.btnToggle = document.getElementById('ui-toggle');
    this.btnZoning = document.getElementById('btn-zoning');

    this.onToggleZoning = null;
    this.initListeners();
  }

  initListeners() {
    this.btnSave.addEventListener('click', () => {
      this.routeManager.saveCurrentRoute();
      this.renderRouteList();
    });

    this.btnDiscard.addEventListener('click', () => {
      this.routeManager.clearCurrentRoute();
    });

    this.btnToggle.addEventListener('click', () => {
      this.elContainer.classList.toggle('hidden');
    });

    this.btnZoning.addEventListener('click', () => {
      const isActive = this.btnZoning.classList.toggle('active');
      this.btnZoning.style.background = isActive ? '#4B5563' : '';
      this.btnZoning.style.color = isActive ? 'white' : '';
      if (this.onToggleZoning) this.onToggleZoning(isActive);
    });
  }

  // Called by GameManager
  updateGameStats(stats) {
    this.elBudget.textContent = "$" + stats.budget.toLocaleString();
    this.elDay.textContent = stats.day;
    this.elTotalRiders.textContent = stats.totalRiders.toLocaleString();
  }

  showIncomeFeedback(amount) {
    this.elIncomeFloat.textContent = "+ $" + amount.toLocaleString();
    this.elIncomeFloat.style.opacity = 1;
    this.elIncomeFloat.style.top = "40px";

    // Reset animation
    setTimeout(() => {
      this.elIncomeFloat.style.opacity = 0;
      this.elIncomeFloat.style.top = "60px";
    }, 2000);
  }

  // Called by RouteManager on path change
  updateDraftStats(stats) {
    // Length
    let lenText = stats.length > 1000
      ? (stats.length / 1000).toFixed(2) + " km"
      : Math.round(stats.length) + " m";
    this.elCurrentLength.textContent = lenText;

    // Cost
    this.elCurrentCost.textContent = "$" + stats.cost.toLocaleString();

    // Ridership
    this.elCurrentRiders.textContent = stats.ridership.toLocaleString() + " / day";
  }

  renderRouteList() {
    this.elRouteList.innerHTML = '';
    const routes = this.routeManager.getSavedRoutes();

    routes.forEach((route, index) => {
      const li = document.createElement('li');

      // Format Length
      let lenStr = route.stats.length > 1000
        ? (route.stats.length / 1000).toFixed(1) + "km"
        : Math.round(route.stats.length) + "m";

      const span = document.createElement('span');
      span.innerHTML = `
                <strong>Route ${index + 1}</strong> <br>
                <small>${lenStr} | ${route.stats.ridership} riders</small>
            `;
      li.appendChild(span);

      const btnEdit = document.createElement('button');
      btnEdit.textContent = "Edit";
      btnEdit.className = "btn-icon btn-edit";
      btnEdit.onclick = () => {
        this.routeManager.editSavedRoute(index);
        this.renderRouteList();
      };
      li.appendChild(btnEdit);

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
