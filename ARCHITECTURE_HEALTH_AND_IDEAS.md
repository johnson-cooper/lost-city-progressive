# R&D and Maintenance Engineer Report

## 1. Logic Extraction: The Most Sophisticated Features of Our Internal Framework

As a Research & Development Engineer analyzing our injection into the LostCity (2004Scape) engine, here are the most advanced mechanisms we've implemented:

### A. The "God View" Functional Mapper (`SkillBehaviors.ts` & `BotUtils.ts`)
Instead of pixel-scraping (vision-based AI) or massive OOP inheritance trees, we are utilizing the server's absolute state. The most sophisticated feature is how we bypass complex pathfinding by directly invoking server-native `target` resolutions and using `handleAction` closures. This collapses thousands of lines of bot logic into O(1) dictionary lookups on the `onTick` cycle.

### B. Event-Driven FSM over Procedural Loops
Traditional bots use `while (true) { sleep(100); }`. Because we are inside the server, a thread-blocking `sleep` would crash the entire game engine. Our most sophisticated architectural triumph is the `EventBus.ts` and `BotFSM.ts`, which operate entirely non-blockingly, driven by engine ticks and packet-level events (e.g., `DAMAGE_TAKEN`).

### C. `CrowdControl.ts` (Anti-Stacking Logic)
A classic giveaway of server-side bots is perfect stacking (10 bots on exactly tile `3222, 3218`). Our `CrowdControl.ts` introduces simulated repulsive forces. When a bot finishes a waypoint, it checks the local tile; if occupied, it randomly steps aside to a neighboring non-clipping tile, creating natural human-like spread at banks and skilling spots.

### D. Dynamic Config Parsing (`DefinitionLoader.ts`)
Rather than maintaining external databases, we parse the raw `loc.pack`, `obj.pack`, and `npc.pack` from the 2004Scape repository directly in memory. This means the bots dynamically adapt if the server owner adds custom items or moves objects.

---

## 2. Lead Maintenance Engineer: The 'Health Check' Protocol

As your Lead Maintenance Engineer, my mandate is to ensure this code remains robust and performant. 
**Every time a new code snippet or log is provided, I will implicitly perform the following 'Health Check':**

1.  **Engine Cycle Load Check:**
    *   *Question:* Does this new logic perform heavy O(N^2) array filtering on the main thread?
    *   *Action:* If so, push the logic to a background async worker or cache the nearest entities (e.g., caching the nearest trees instead of scanning a 50x50 radius every 600ms tick).
2.  **Tick-Block Prevention:**
    *   *Question:* Are there any `while()` loops waiting on a state change?
    *   *Action:* Refactor into the FSM. Server ticks must resolve in < 600ms, usually < 50ms to allow headroom.
3.  **Null-Safety & Target Verification:**
    *   *Question:* Does the code assume an NPC/Object is always present?
    *   *Action:* Enforce strict null-checks (`if (!target) return;`) and verify entity states (`!target.isDead()`, `!target.isDespawned()`) before invoking `interact()`.
4.  **State Machine Memory Leak Check:**
    *   *Question:* Are observers (`EventBus.subscribe`) being unregistered when a bot is destroyed or switches states?
    *   *Action:* Enforce explicit teardown methods to prevent memory leaks in the Node.js process.

---

## 3. Suggestions for Advanced Bots (2004 Era)

Now that the core Gathering, Combat, and Processing systems are complete, here are concepts for the next tier of advanced bots to populate the server:

### A. The "Flax Spinner" (Seers' Village)
*   **Logic:** A multi-stage pathing bot.
*   **Path:** Walk to `Locations.Seers.flax_field`. Pick Flax (ID: 1779). Walk to `Locations.Seers.spinning_wheel`. Use Flax on Wheel. Walk to `Locations.Seers.bank`.
*   **Complexity:** Requires waypoint traversal between distinct zones. We can implement a simplified A* or use predefined arrays of `[x, z]` coordinates for the route.

### B. The "Air Rune Runner" / RC Crafter
*   **Logic:** Simulates the classic 2004 economy of runners.
*   **Path:** Take Rune Essence from Falador East Bank, walk south to the Air Altar, use the altar, and walk back.
*   **Complexity:** Requires handling the Air Tiara / Talisman equipment or inventory requirements, entering the altar instance, crafting, and returning.

### C. The "Safe-Spot Ranger / Mage"
*   **Logic:** Advanced combat. 
*   **Path:** Target an NPC (e.g., Blue Dragon in Taverley or Lesser Demon in Wiz Tower). Move behind a collision object (like a stalagmite or table). 
*   **Complexity:** Requires line-of-sight (LOS) algorithm checks. The bot must calculate coordinates that have projectile LOS but no walkable path to the target.

### D. The "Auto-Typer / Merchant" (Varrock West Bank)
*   **Logic:** Economy simulator.
*   **Path:** Stand at `Locations.Varrock.west_bank`. Emits public chat strings (`"Selling lobbies 250ea!"`). Listens for player trade requests.
*   **Complexity:** Needs to hook into the `TradeManager`. When traded, verify the item offered matches the text request and auto-accept if the gold amount is correct.
