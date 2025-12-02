export class UIManager {
  constructor(routeManager) {
    this.routeManager = routeManager;

    // UI Elements
    this.elCurrentLength = document.getElementById('current-length');
    this.elCurrentCost = document.getElementById('current-cost');
    this.elCurrentRiders = document.getElementById('current-riders');

    this.elBudget = document.getElementById('val-budget');
    this.elDay = document.getElementById('val-day');
    this.elTotalRiders = document.getElementById('val-riders');
    this.elApproval = document.getElementById('val-approval'); // NEW

    this.elIncomeFloat = document.getElementById('income-float');
    this.elRouteList = document.getElementById('route-list');
    this.elContainer = document.getElementById('ui-container');

    this.btnSave = document.getElementById('btn-save');
    this.btnDiscard = document.getElementById('btn-discard');
    this.btnToggle = document.getElementById('ui-toggle');

    // NEW: View Mode
    this.selectViewMode = document.getElementById('view-mode');

    this.onViewModeChanged = null;
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

    // Handle Dropdown Change
    this.selectViewMode.addEventListener('change', (e) => {
      if (this.onViewModeChanged) {
        this.onViewModeChanged(e.target.value);
      }
    });
  }

  updateGameStats(stats) {
    this.elBudget.textContent = "$" + stats.budget.toLocaleString();
    this.elDay.textContent = stats.day;
    this.elTotalRiders.textContent = stats.totalRiders.toLocaleString();

    // Update Approval
    this.elApproval.textContent = stats.approval + "%";
    // Color code it
    if (stats.approval > 75) this.elApproval.style.color = "#10B981"; // Green
    else if (stats.approval < 40) this.elApproval.style.color = "#EF4444"; // Red
    else this.elApproval.style.color = "#D97706"; // Orange
  }

  showIncomeFeedback(amount) {
    this.elIncomeFloat.textContent = "+ $" + amount.toLocaleString();
    this.elIncomeFloat.style.opacity = 1;
    this.elIncomeFloat.style.top = "40px";
    setTimeout(() => {
      this.elIncomeFloat.style.opacity = 0;
      this.elIncomeFloat.style.top = "60px";
    }, 2000);
  }

  updateDraftStats(stats) {
    let lenText = stats.length > 1000
      ? (stats.length / 1000).toFixed(2) + " km"
      : Math.round(stats.length) + " m";
    this.elCurrentLength.textContent = lenText;
    this.elCurrentCost.textContent = "$" + stats.cost.toLocaleString();
    this.elCurrentRiders.textContent = stats.ridership.toLocaleString() + " / day";
  }

  renderRouteList() {
    this.elRouteList.innerHTML = '';
    const routes = this.routeManager.getSavedRoutes();

    routes.forEach((route, index) => {
      const li = document.createElement('li');

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
