export class GameManager {
  constructor(routeManager, uiManager) {
    this.routeManager = routeManager;
    this.uiManager = uiManager;

    // Game State
    this.budget = 1000000; // Start with $1M
    this.day = 1;
    this.ticketPrice = 2.50;

    // Constants
    this.COST_PER_METER = 200; // Construction cost
    this.BUS_COST = 50000;     // Cost per vehicle

    // Timer for "Daily" cycle (every 5 seconds)
    this.gameLoopInterval = null;
  }

  start() {
    this.updateUI();

    // Start the game loop: Every 5 seconds = 1 Day
    this.gameLoopInterval = setInterval(() => {
      this.processDay();
    }, 5000);
  }

  processDay() {
    this.day++;

    // Calculate total income from all active routes
    const savedRoutes = this.routeManager.getSavedRoutes();
    let dailyIncome = 0;
    let totalRiders = 0;

    savedRoutes.forEach(route => {
      dailyIncome += route.stats.ridership * this.ticketPrice;
      totalRiders += route.stats.ridership;
    });

    this.budget += dailyIncome;

    // Flash visual feedback if income > 0
    if (dailyIncome > 0) {
      this.uiManager.showIncomeFeedback(dailyIncome);
    }

    this.updateUI();
  }

  /**
   * Estimates cost for a route based on length and needed buses
   */
  getProjectedCost(lengthInMeters) {
    // Construction Cost
    const construction = lengthInMeters * this.COST_PER_METER;

    // Fleet Cost: 1 Bus per 800m
    const busesNeeded = Math.ceil(lengthInMeters / 800);
    const fleet = busesNeeded * this.BUS_COST;

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
    // Calculate aggregate stats
    const savedRoutes = this.routeManager.getSavedRoutes();
    let totalRiders = 0;
    savedRoutes.forEach(r => totalRiders += r.stats.ridership);

    this.uiManager.updateGameStats({
      budget: this.budget,
      day: this.day,
      totalRiders: totalRiders
    });
  }
}
