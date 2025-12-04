export class GameManager {
  constructor(routeManager, uiManager) {
    this.routeManager = routeManager;
    this.uiManager = uiManager;

    // Game State
    this.budget = 1000000;
    this.day = 1;
    this.ticketPrice = 2.50;

    // Approval
    this.approvalRating = 0;

    // Config
    this.COST_PER_METER = 200;
    this.BUS_COST = 50000;
    this.gameLoopInterval = null;

    // Cache for nodes that have people or jobs
    this.censusNodes = [];
  }

  start() {
    this.buildCensusArrays();
    this.recalculateApproval();
    this.updateUI();

    if (this.gameLoopInterval) clearInterval(this.gameLoopInterval);
    this.gameLoopInterval = setInterval(() => {
      this.processDay();
    }, 5000);
  }

  // ==========================
  // Save / Load System
  // ==========================

  saveGame() {
    const data = {
      version: 1,
      timestamp: Date.now(),
      gameState: {
        budget: this.budget,
        day: this.day,
        approval: this.approvalRating
      },
      routes: this.routeManager.getSerializableRoutes()
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `city_transit_save_day${this.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  loadGame(jsonString) {
    try {
      const data = JSON.parse(jsonString);

      // 1. Restore State
      this.budget = data.gameState.budget;
      this.day = data.gameState.day;

      // 2. Restore Routes
      // This will clear existing routes and rebuild meshes/vehicles
      this.routeManager.loadRoutes(data.routes);

      // 3. Recalculate Logic
      this.buildCensusArrays();
      this.recalculateApproval();
      this.updateUI();

      console.log("Game loaded successfully.");
    } catch (e) {
      console.error("Failed to load save file", e);
      alert("Error loading save file. See console.");
    }
  }

  // ==========================
  // Core Logic
  // ==========================

  buildCensusArrays() {
    if (!this.routeManager.graphData) return;

    this.censusNodes = []; // Clear array
    const nodes = this.routeManager.graphData.nodes;

    for (const [id, node] of Object.entries(nodes)) {
      // Combine Population and Jobs for total "Human Presence"
      const totalPeople = (node.pop || 0) + (node.jobs || 0);

      if (totalPeople > 0) {
        this.censusNodes.push({
          id: parseInt(id),
          count: totalPeople, // Weighting factor
          x: node.x,
          z: node.y // Graph Y is World Z
        });
      }
    }
  }

  recalculateApproval() {
    if (!this.censusNodes || this.censusNodes.length === 0) {
      this.approvalRating = 0;
      return;
    }

    let totalWeightedScore = 0;
    let totalMaxScore = 0; // The score if everyone had 0m walk

    // Constants for walking distance
    const MAX_WALK_DIST = 1700; // Meters. Beyond this, satisfaction is 0.
    const IDEAL_WALK_DIST = 50; // Meters. Below this, satisfaction is 100%.

    for (const node of this.censusNodes) {
      // 1. Add this building's population/jobs to the potential max score
      totalMaxScore += node.count;

      // 2. Get walking distance to nearest transit
      const dist = this.routeManager.getDistanceToNearestTransit(node.x, node.z);

      // 3. Calculate Satisfaction Factor (0.0 to 1.0)
      if (dist < MAX_WALK_DIST) {
        // Linear falloff from 1.0 (at 50m) to 0.0 (at 600m)
        let satisfaction = 1.0 - (Math.max(0, dist - IDEAL_WALK_DIST) / (MAX_WALK_DIST - IDEAL_WALK_DIST));
        satisfaction = Math.max(0, satisfaction);

        // 4. Add weighted score (Satisfaction * People Count)
        totalWeightedScore += (satisfaction * node.count);
      }
    }

    // Approval % = (Actual Weighted Score / Max Possible Weighted Score)
    if (totalMaxScore > 0) {
      this.approvalRating = Math.floor((totalWeightedScore / totalMaxScore) * 100);
    } else {
      this.approvalRating = 0;
    }
  }

  processDay() {
    this.day++;

    const savedRoutes = this.routeManager.getSavedRoutes();
    let dailyIncome = 0;
    savedRoutes.forEach(route => {
      dailyIncome += route.stats.ridership * this.ticketPrice;
    });

    this.budget += dailyIncome;

    if (dailyIncome > 0) {
      this.uiManager.showIncomeFeedback(dailyIncome);
    }

    this.updateUI();
  }

  getLastKnownRiders() {
    const savedRoutes = this.routeManager.getSavedRoutes();
    let total = 0;
    savedRoutes.forEach(r => total += r.stats.ridership);
    return total;
  }

  getProjectedCost(lengthInMeters) {
    const construction = lengthInMeters * this.COST_PER_METER;
    const fleet = Math.ceil(lengthInMeters / 800) * this.BUS_COST;
    return Math.floor(construction + fleet);
  }

  canAfford(cost) {
    return this.budget >= cost;
  }

  deductFunds(amount) {
    this.budget -= amount;
    this.updateUI();
  }

  updateUI() {
    this.uiManager.updateGameStats({
      budget: this.budget,
      day: this.day,
      totalRiders: this.getLastKnownRiders(),
      approval: this.approvalRating
    });
  }
}
