export class UIManager {
  constructor(routeManager) {
    this.routeManager = routeManager;
    this.gameManager = null;

    // Panels
    this.panelMain = document.getElementById('ui-main-menu');
    this.panelDraft = document.getElementById('ui-draft-menu');

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

    // Buttons
    this.btnCreate = document.getElementById('btn-create-route');
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
    // --- MODE SWITCHING ---
    this.btnCreate.addEventListener('click', () => {
      this.enterDraftMode();
    });

    this.btnSave.addEventListener('click', () => {
      const success = this.routeManager.saveCurrentRoute();
      if (success) {
        this.renderRouteList();
        this.exitDraftMode();
      }
    });

    this.btnDiscard.addEventListener('click', () => {
      this.routeManager.clearCurrentRoute();
      this.exitDraftMode();
    });
    // ----------------------

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
      e.target.value = '';
    });
  }

  enterDraftMode() {
    this.panelMain.style.display = 'none';
    this.panelDraft.style.display = 'block';
    this.routeManager.startDrafting();
  }

  exitDraftMode() {
    this.panelMain.style.display = 'block';
    this.panelDraft.style.display = 'none';
    this.routeManager.stopDrafting();
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

    if (routes.length === 0) {
      this.elRouteList.innerHTML = '<li style="color:#999; text-align:center; font-style:italic; padding:10px;">No active routes.<br>Click create to build one.</li>';
      return;
    }

    routes.forEach((route, index) => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.alignItems = 'center';
      li.style.justifyContent = 'space-between';
      li.style.padding = '8px 0';
      li.style.borderBottom = '1px solid #eee';

      // --- BADGE CONTAINER ---
      const badgeContainer = document.createElement('div');
      badgeContainer.style.position = 'relative';
      badgeContainer.style.width = '28px';
      badgeContainer.style.height = '28px';
      badgeContainer.style.marginRight = '10px';

      const badge = document.createElement('div');
      badge.textContent = (index + 1);
      badge.style.width = '100%';
      badge.style.height = '100%';
      badge.style.backgroundColor = route.color;
      badge.style.color = '#fff';
      badge.style.fontWeight = 'bold';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.justifyContent = 'center';
      badge.style.borderRadius = '4px';
      badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      badge.style.textShadow = '0 1px 2px rgba(0,0,0,0.5)';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = route.color || "#000000";
      colorInput.style.position = 'absolute';
      colorInput.style.top = '0';
      colorInput.style.left = '0';
      colorInput.style.width = '100%';
      colorInput.style.height = '100%';
      colorInput.style.opacity = '0';
      colorInput.style.cursor = 'pointer';
      colorInput.style.border = 'none';
      colorInput.style.padding = '0';

      colorInput.addEventListener('input', (e) => {
        const newColor = e.target.value;
        badge.style.backgroundColor = newColor;
        this.routeManager.updateRouteColor(index, newColor);
      });

      badgeContainer.appendChild(badge);
      badgeContainer.appendChild(colorInput);
      li.appendChild(badgeContainer);

      // --- ROUTE INFO ---
      let lenStr = route.stats.length > 1000
        ? (route.stats.length / 1000).toFixed(1) + "km"
        : Math.round(route.stats.length) + "m";

      const infoDiv = document.createElement('div');
      infoDiv.style.flex = '1';
      infoDiv.style.display = 'flex';
      infoDiv.style.flexDirection = 'column';

      infoDiv.innerHTML = `
        <span style="font-size:12px; font-weight:600; color:#333;">Line ${index + 1}</span>
        <span style="font-size:11px; color:#666;">${lenStr} | ${route.stats.ridership} riders</span>
      `;

      // --- BUTTONS ---
      const btnDiv = document.createElement('div');
      btnDiv.style.display = 'flex';
      btnDiv.style.gap = '4px';

      const btnEdit = document.createElement('button');
      btnEdit.textContent = "✎";
      btnEdit.className = "btn-icon";
      btnEdit.title = "Redraw Route";
      btnEdit.style.padding = "4px 8px";
      btnEdit.onclick = () => {
        // --- FIX IS HERE ---
        // 1. Enter draft mode first (this resets the drafting state)
        this.enterDraftMode();
        // 2. Load the route data (this populates the drafting state)
        this.routeManager.editSavedRoute(index);
      };

      const btnDel = document.createElement('button');
      btnDel.textContent = "✕";
      btnDel.className = "btn-icon";
      btnDel.title = "Delete Route";
      btnDel.style.color = "#ef4444";
      btnDel.style.padding = "4px 8px";
      btnDel.onclick = () => {
        if (confirm("Delete this route?")) {
          this.routeManager.deleteSavedRoute(index);
          this.renderRouteList();
        }
      };

      btnDiv.appendChild(btnEdit);
      btnDiv.appendChild(btnDel);

      li.appendChild(infoDiv);
      li.appendChild(btnDiv);

      this.elRouteList.appendChild(li);
    });
  }
}
