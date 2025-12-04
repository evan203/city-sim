# CS 559 GP Presentation

## Group ID 3826

### 3D City Transit Simulator

### 1. Route Planning & Construction

* **Drafting Mode:** The game separates "Planning" from "Building." You must click "Create New Route" to enter a drafting mode where you can experiment without spending money.
* **Point-and-Click Plotting:** You build routes by clicking on the ground. The system automatically finds the shortest path along the road network between the points you select.
* **Smart Snapping (Ghost Marker):** When hovering the mouse over the map in drafting mode, a transparent "ghost" sphere appears, indicating exactly which road intersection or node the route will snap to if you click.
* **Draft Interaction:**
  * **Add Point:** Left-click to extend the route.
  * **Move Point:** Click and drag existing yellow markers to adjust the path dynamically.
* **Draft Statistics:** While planning, you see real-time estimates for:
  * **Length:** Total distance of the route.
  * **Cost:** Construction cost (track/road upgrades) + Fleet cost (buses required).
  * **Est. Riders:** Projected daily passengers based on the population density near your stops.
* **Commit or Discard:** You can finalize the route (spending the money) or discard the draft to cancel.

### 2. Route Management

* **Active Route List:** A sidebar lists all currently operating transit lines.
* **Color Customization:** You can click the colored box next to any route number to pick a custom color for that line and its vehicles.
* **Editing:** You can click the "Pencil" icon to edit a route. *Note: This deletes the existing route and puts its nodes back into "Draft Mode" for you to redraw.*
* **Deleting:** You can permanently remove a route to clear clutter (though construction costs are sunk).

### 3. Economy & Simulation

* **Budget System:** You start with a fixed amount of capital ($1,000,000). You must manage construction costs against your remaining funds.
* **Daily Income:** Every in-game "Day," you earn cash based on the total ridership across all your lines (Ticket Sales).
* **Floating Feedback:** When a day passes, floating green text appears over the UI showing exactly how much cash you just earned.
* **Ridership Logic:** Ridership is calculated based on "Synergy"—connecting Residential areas (Population) to Commercial/Industrial areas (Jobs).
* **Public Approval:** A percentage score (0-100%) that tracks how happy the city is. This is calculated based on how many buildings are within walking distance (approx. 600m) of your transit stops.

### 4. Visuals & Map Modes

* **3D City Rendering:** The map features extruded 3D buildings, water bodies, parks, and a road network.
* **Vehicle Simulation:** Small blocky buses travel along your constructed routes in real-time.
* **Data Views:** You can toggle the map visualization to help plan better routes:
  * **Standard:** Default visual look.
  * **Zoning Density:** Colors buildings by type (Purple for Residential, Blue for Commercial) and intensity (darker colors = higher density/more potential riders).
  * **Transit Coverage (Approval):** A heat map showing service coverage. Buildings turn Green if they are close to a stop, Yellow if they are borderline, and Red if they have no transit access.

### 5. System Features

* **Save/Load System:** You can save your current city state (routes, budget, day, approval) to a local JSON file and load it back later to continue playing.
* **UI Toggling:** The entire interface can be hidden/shown via a hamburger menu button for cinematic screenshots.

## For Peer Evaluators

* Recall: each component can be only claimed by one group member
* I created this project alone
* I only claim to complete **user interaction**, including:
  * Click to add route nodes
  * Drag to edit route nodes
  * A* pathfinding updates instantly on node movement
  * UI provides immediate feedback on cost and ridership
  * Multiple mapping layers to help plan out building routes
  * Save/load system
* You only will grade me on that category
* All other categories you should score with a 1, as I do not claim to complete
  them
