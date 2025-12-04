export class UIManager {
  constructor(routeManager) {
    this.routeManager = routeManager;
    this.gameManager = null; // Set via dependency injection in main.js if needed, or we just access logic differently

    // UI Elements
    this.elCurrentLength = document.getElementById('current-length');
    this.elCurrentCost = document.getElementById('current-cost');
    this.elCurrentRiders = document.getElementById('current-riders');

    this.elBudget = document.getElementById('val-budget');
    this.elDay = document.getElementById('val-day');
    this.elTotalRiders = document.getElementById('val-riders');
    this.elApproval = document.getElementById('val-approval');

    this.elIncomeFloat = document.getElementById('income-float');
    this.elRouteList = document.getElementById('route-list');
    this.elContainer = document.getElementById('ui-container');

    this.btnSave = document.getElementById('btn-save');
    this.btnDiscard = document.getElementById('btn-discard');
    this.btnToggle = document.getElementById('ui-toggle');

    // Save/Load
    this.btnSaveGame = document.getElementById('btn-save-game');
    this.btnLoadGame = document.getElementById('btn-load-game');
    this.inputLoadGame = document.getElementById('file-load-game');

    // View Mode
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

    this.selectViewMode.addEventListener('change', (e) => {
      if (this.onViewModeChanged) {
        this.onViewModeChanged(e.target.value);
      }
    });

    // Save / Load System
    this.btnSaveGame.addEventListener('click', () => {
      if (this.routeManager.gameManager) {
        this.routeManager.gameManager.saveGame();
      }
    });

    this.btnLoadGame.addEventListener('click', () => {
      this.inputLoadGame.click();
    });

    this.inputLoadGame.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        if (this.routeManager.gameManager) {
          this.routeManager.gameManager.loadGame(evt.target.result);
          this.renderRouteList();
        }
      };
      reader.readAsText(file);
      e.target.value = ''; // Reset so we can load same file again if needed
    });
  }

  updateGameStats(stats) {
    this.elBudget.textContent = "$" + stats.budget.toLocaleString();
    this.elDay.textContent = stats.day;
    this.elTotalRiders.textContent = stats.totalRiders.toLocaleString();

    this.elApproval.textContent = stats.approval + "%";
    if (stats.approval > 75) this.elApproval.style.color = "#10B981";
    else if (stats.approval < 40) this.elApproval.style.color = "#EF4444";
    else this.elApproval.style.color = "#D97706";
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

      // Color Picker
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = route.color || "#000000";
      colorInput.style.border = "none";
      colorInput.style.width = "24px";
      colorInput.style.height = "24px";
      colorInput.style.cursor = "pointer";
      colorInput.title = "Change Route Color";

      colorInput.addEventListener('input', (e) => {
        this.routeManager.updateRouteColor(index, e.target.value);
      });

      const span = document.createElement('span');
      span.innerHTML = `
                <strong>Route ${index + 1}</strong> <br>
                <small>${lenStr} | ${route.stats.ridership} riders</small>
            `;

      const detailsDiv = document.createElement('div');
      detailsDiv.style.display = "flex";
      detailsDiv.style.alignItems = "center";
      detailsDiv.style.gap = "8px";
      detailsDiv.appendChild(colorInput);
      detailsDiv.appendChild(span);

      li.appendChild(detailsDiv);

      const btnEdit = document.createElement('button');
      btnEdit.textContent = "Edit";
      btnEdit.className = "btn-icon btn-edit";
      btnEdit.onclick = () => {
        this.routeManager.editSavedRoute(index);
        this.renderRouteList();
      };

      const btnDel = document.createElement('button');
      btnDel.textContent = "✕";
      btnDel.className = "btn-icon btn-del";
      btnDel.onclick = () => {
        this.routeManager.deleteSavedRoute(index);
        this.renderRouteList();
      };

      const btnDiv = document.createElement('div');
      btnDiv.appendChild(btnEdit);
      btnDiv.appendChild(btnDel);

      li.appendChild(btnDiv);

      this.elRouteList.appendChild(li);
    });
  }
}
