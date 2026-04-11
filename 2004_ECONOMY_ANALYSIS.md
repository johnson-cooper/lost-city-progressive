# 2004 RuneScape (LostCityRS) Economy & Atmosphere Analysis

Building a simulated bot population for a 2004-era RuneScape server isn't just about scripting clicking actions; it's about simulating a living, breathing digital economy. In 2004, the player base relied heavily on low-level players (and yes, bots) to generate the raw materials that fueled high-level skilling and PvM.

## The 2004 Economy Gaps

Without a massive influx of real players, a private server's economy quickly stagnates. The following "Missing Links" are essential to simulate a realistic supply chain:

### 1. Resource Supply (Raw Materials)
High-level players burn through materials incredibly fast but rarely want to gather them.
- **Rune Essence:** The absolute backbone of the magical economy. Without pure/rune essence flowing into the market, Runecrafting is impossible.
- **Flax:** High-level fletchers and crafters need thousands of Bow Strings.
- **Snape Grass & Limpwurt Roots:** Essential secondary ingredients for Herblore (Prayer and Strength potions).
- **Vials of Water:** The most tedious item to gather in bulk, yet required for every single potion in the game.

### 2. Consumables (Food & Potions)
Players doing Slayer, Barrows, or PvP need bulk food.
- **Raw Lobsters/Swordfish:** The primary healing items of 2004. Without fishers constantly supplying the Grand Exchange/banks, combat grinds to a halt.

## Atmospheric Needs

A 2004 server feels "dead" if certain iconic locations are empty. Bots serve the secondary purpose of making the world feel populated and nostalgic.

- **Varrock East/West Mines:** Should constantly have players competing for Iron and Coal.
- **Draynor Village Willows:** The classic woodcutting hotspot. Seeing 5-10 players here is a massive nostalgia hit.
- **Seers' Village Maples & Flax:** The hub of fletching and crafting.
- **Catherby Shore:** The fishing hub. A line of players along the coast is iconic.

---

## The 7 Essential Bot Archetypes

To fix the economy gaps and atmospheric needs, the following 7 bots should be implemented using the GOAP/FSM framework:

### 1. The Essence Miner (Resource Supply)
* **Atmosphere:** Populates the Varrock East Bank and the mysterious Aubury rune essence mine.
* **Behavior Loop:** Starts at Varrock East Bank -> Walks to Aubury's Rune Shop -> Right-clicks "Teleport" -> Mines Essence until inventory is full -> Takes the portal back -> Walks to Varrock East Bank -> Deposits Essence.

### 2. The Flax Picker (Resource Supply)
* **Atmosphere:** Populates the Seers' Village flax fields, an incredibly iconic 2004 location.
* **Behavior Loop:** Starts at Seers' Village Bank -> Walks south to the Flax field -> Picks 28 Flax -> Walks back to the bank -> Deposits. (Advanced variation: Uses the Spinning Wheel upstairs to make Bow Strings).

### 3. The Catherby Fisher (Consumables & Atmosphere)
* **Atmosphere:** Populates the Catherby shores.
* **Behavior Loop:** Starts at Catherby Bank -> Withdraws a Harpoon/Lobster Pot -> Walks to the shore -> Interacts with "Fishing Spot" -> Waits until inventory is full -> Walks back to bank -> Deposits raw fish.

### 4. The Draynor Woodcutter (Atmosphere)
* **Atmosphere:** Populates Draynor Village, bringing life to the willow trees and the nearby bank.
* **Behavior Loop:** Starts at Draynor Bank -> Withdraws Axe -> Walks south to the Willow trees -> Chops until inventory is full -> Walks back to bank -> Deposits logs.

### 5. The Vial Filler (Resource Supply)
* **Atmosphere:** Populates the fountains/sinks in Lumbridge or Falador.
* **Behavior Loop:** Starts at Bank -> Withdraws 28 Empty Vials -> Walks to nearest water source (Fountain/Sink) -> Uses Vial on Water Source -> Waits for animation loop -> Walks back to bank -> Deposits Vials of Water.

### 6. The Varrock Miner (Atmosphere & Resource)
* **Atmosphere:** Populates the Varrock East or West mines.
* **Behavior Loop:** Starts at Varrock Bank -> Withdraws Pickaxe -> Walks to Mine -> Mines Iron/Coal until full -> Walks back to bank -> Deposits ores.

### 7. The Chaos Druid Killer (Resource Supply)
* **Atmosphere:** Populates the Edgeville Dungeon or Taverley Dungeon.
* **Behavior Loop:** Starts at Edgeville Bank -> Withdraws food -> Walks to Edgeville Dungeon -> Kills Chaos Druids -> Loots specific Herbs (Ranarr, Irit) and Snape Grass -> Eats food when HP < 50% -> Teleports or walks back when inventory is full of valuable herbs or out of food -> Banks.
