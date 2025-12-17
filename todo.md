# Project Development Roadmap

---

### Phase 1: The "Power User" Planner (UX & Tooling)
*Focus: Making the act of drawing routes feel responsive, intelligent, and precise.*

**1. Live "Ghost" Pathfinding (Live A\*)**
*   **Concept:** Instead of drawing a straight line from the last stop to your mouse, the system runs A* pathfinding in real-time (every ~100ms on mouse move).
*   **Benefit:** The user sees exactly where the bus/train will travel along the road network before they click.
*   **Visuals:** A semi-transparent "ghost" line snaps to the roads. If the mouse hovers over a building, it snaps to the nearest road node.
*   **Feedback:** A floating tooltip near the mouse shows the segment distance and estimated travel time instantly.

**2. Mid-Line Modification (Splitting & Dragging)**
*   **Concept:** The ability to modify a route without deleting the whole thing.
*   **Interaction:** Hovering over an existing line segment reveals a "ghost node" in the middle. Clicking and dragging this ghost node splits the segment and creates a new stop or waypoint.
*   **Healing:** Deleting a node in the middle of a route automatically reconnects the previous node to the next node using the shortest path.

**3. Dynamic Walkshed Heatmaps (Isochrones)**
*   **Concept:** When placing a stop, the map visualizes the "catchment area."
*   **Implementation:** Instead of a simple circle radius, use the road network to calculate how far a human can walk in 5 or 10 minutes.
*   **Visuals:** Color the roads/sidewalks green (2 min walk), yellow (5 min walk), and red (10 min walk) radiating from the cursor. This helps users place stops efficiently without overlapping coverage too much.

**4. Route "Snapping" Logic**
*   **Magnetic Stops:** If you drag a new route near an *existing* stop from a different line, it should snap to that stop. This creates a "Transfer Station" logic automatically.
*   **Key Interest Points:** Snap to high-density buildings (hospitals, schools, stadiums) to ensure maximum ridership.

---

### Phase 2: Professional-Grade Ridership Modeling
*Focus: moving from "distance-based" checks to legitimate transportation engineering logic.*

**5. The "Four-Step Model" (Simplified for Gaming)**
Real planners use this. You can implement a gamified version:
*   **Generation:** Every building generates specific trips based on its zoning data (e.g., A house generates "Home-to-Work" trips in AM, "Work-to-Home" in PM).
*   **Distribution:** Determine *where* they want to go. (e.g., A resident at coordinate A selects a job at coordinate B).
*   **Mode Choice (The Utility Function):** The most critical part. An agent calculates a score for every option:
    *   *Score (Car)* = Traffic Time + Gas Cost + Parking annoyance.
    *   *Score (Transit)* = Walk Time + Wait Time + Ride Time + Fare.
    *   *Logic:* If `Score(Transit) < Score(Car)`, the agent becomes a rider.
*   **Assignment:** The agent picks the specific route (Line A vs Line B) that gets them there fastest.

**6. Transfer Penalties**
*   In real life, people hate transferring.
*   **Logic:** Add a "penalty weight" to the pathfinding algorithm when switching lines. A direct route that takes 20 mins is preferred over a 15 min route that requires switching buses.

**7. Peak vs. Off-Peak Dynamics**
*   **Time Scales:** Simulate a 24-hour cycle.
*   **AM Rush (7-9 AM):** Massive flow from Residential -> Commercial/Industrial.
*   **PM Rush (4-6 PM):** Massive flow Commercial -> Residential.
*   **Night:** Low demand, mostly service industry or entertainment areas.
*   **Gameplay:** You must buy enough vehicles to handle the Peak, even if they sit idle at night.

**8. Crowd Dynamics & Capacity**
*   **Station Overcrowding:** If a station has too many waiting people, new passengers might leave (despawn) and drive instead (lowering your approval rating).
*   **Vehicle Capacity:** If a bus is full (40/40), it drives past the stop without picking anyone up. This forces the player to add more vehicles or upgrade to trains.

---

### Phase 3: Topography & Environment
*Focus: Utilizing your data pipeline to create a challenging 3D world.*

**9. Lidar-Based Terrain & Constraints**
*   **Visuals:** The ground plane should not be flat. Use a heightmap to deform the mesh.
*   **Vehicle Physics:**
    *   *Buses:* Can climb steep hills but slow down significantly.
    *   *Light Rail:* Can climb moderate hills.
    *   *Heavy Rail/Subway:* Cannot climb hills. Requires digging tunnels (very expensive) or building viaducts (expensive).
*   **Cost Logic:** Building a route over flat ground = $100/m. Building up a 30% grade = $500/m.

**10. "Fog of War" or Discovery**
*   If playing a career mode, don't show the detailed density map immediately. The player might need to "survey" areas or pay for traffic data to see where the demand actually is.

**11. Environmental Impact**
*   **Noise Pollution:** Residents get unhappy if you build noisy elevated trains right next to their bedroom windows (NIMBY mechanic).
*   **Land Value:** Good transit raises land value (gentrification simulation), which might change the density of buildings over time (Dynamic City Growth).

---

### Phase 4: Economy & Management
*Focus: The "Tycoon" aspect.*

**12. Operational Expenditure (OPEX)**
*   It's not just about the cost to build the track (CAPEX).
*   **Fuel/Electricity:** Every mile a vehicle drives costs money.
*   **Driver Wages:** Every active vehicle costs money per hour.
*   **Maintenance:** Tracks and vehicles degrade over time and need repair costs.

**13. Zone-Based Fares**
*   Allow the player to set ticket prices.
*   **Strategy:** Low price = High Ridership / Low Revenue. High Price = Low Ridership / High Revenue.
*   **Zones:** Charge more for longer trips (Zone A to Zone B).

**14. Loans and Bonds**
*   Allow the player to go into debt to build a massive subway line, hoping the future revenue pays off the interest.

---

### Phase 5: Visuals & "Juice"
*Focus: Making the map feel alive.*

**15. Procedural City Decor**
*   Even if not strictly simulated, use "Instanced Mesh" rendering to scatter generic trees in park zones and parked cars along roads. It adds scale and realism for cheap performance cost.

**16. Dynamic Weather**
*   **Rain/Snow:** Affects vehicle speed and visual atmosphere.
*   **Visuals:** Particle effects and changing the skybox fog density.

**17. Data Visualization Filters (The "Lens" system)**
*   Toggleable views:
    *   *Traffic View:* Roads turn red where congestion is high.
    *   *Satisfaction View:* Buildings turn red where residents are unhappy with transit.
    *   *Profit View:* Lines turn green/red based on profitability.

**18. Day/Night Cycle with Lighting**
*   As the sun sets, turn on point lights at street intersections and emissive textures on building windows. This makes the city feel like a living organism.

---

### Phase 6: Tech Stack & System Architecture

**19. Multi-threading (Web Workers)**
*   **Issue:** Running pathfinding for 1,000 agents or calculating complex ridership models will freeze the UI thread.
*   **Solution:** Move the simulation logic (Movement, Pathfinding, Economy) to a Web Worker. The Main thread just renders the result.

**20. Spatial Hashing / Quadtrees**
*   **Optimization:** When checking "Who is near this stop?", don't loop through 10,000 buildings. Use a Quadtree to instantly find the 50 buildings in range. This is essential for the "Live Walkshed" feature.

**21. Real-World Data Import (GTFS)**
*   **Feature:** Allow users to upload a `GTFS.zip` file (General Transit Feed Specification). This is the standard format used by Google Maps.
*   **Result:** You could load the *actual* bus routes and schedules of Madison, WI instantly as a starting point for the player to improve.
