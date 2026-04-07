// ── SKILLS LIST ──────────────────────────────────────────────────────────────
// id matches the "type" column in hiscore_large
const SKILLS = [
  // Combat
  { id: 0,  key: 'attack',      name: 'Attack',      category: 'combat'    },
  { id: 2,  key: 'strength',    name: 'Strength',    category: 'combat'    },
  { id: 1,  key: 'defence',     name: 'Defence',     category: 'combat'    },
  { id: 3,  key: 'hitpoints',   name: 'Hitpoints',   category: 'combat'    },
  { id: 4,  key: 'ranged',      name: 'Ranged',      category: 'combat'    },
  { id: 5,  key: 'prayer',      name: 'Prayer',      category: 'combat'    },
  { id: 6,  key: 'magic',       name: 'Magic',       category: 'combat'    },
  // Gathering
  { id: 14, key: 'mining',      name: 'Mining',      category: 'gathering' },
  { id: 9,  key: 'woodcutting', name: 'Woodcutting', category: 'gathering' },
  { id: 10, key: 'fishing',     name: 'Fishing',     category: 'gathering' },
  // Artisan
  { id: 13, key: 'smithing',    name: 'Smithing',    category: 'artisan'   },
  { id: 7,  key: 'cooking',     name: 'Cooking',     category: 'artisan'   },
  { id: 8,  key: 'fletching',   name: 'Fletching',   category: 'artisan'   },
  { id: 11, key: 'firemaking',  name: 'Firemaking',  category: 'artisan'   },
  { id: 12, key: 'crafting',    name: 'Crafting',    category: 'artisan'   },
  // Support
  { id: 15, key: 'herblore',    name: 'Herblore',    category: 'support'   },
  { id: 16, key: 'agility',     name: 'Agility',     category: 'support'   },
  { id: 17, key: 'thieving',    name: 'Thieving',    category: 'support'   },
  { id: 20, key: 'runecrafting',name: 'Runecrafting',category: 'support'   },
];

// ── SVG ICONS ─────────────────────────────────────────────────────────────────
// All inline 22×22 SVGs, coloured to match classic RS skill icons
const svgIcons = {

  overall: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="10" fill="#3d2200" stroke="#c8a84b" stroke-width="1.5"/>
    <polygon points="11,4 13.5,9 19,9.5 15,13 16.5,18.5 11,15.5 5.5,18.5 7,13 3,9.5 8.5,9" fill="#ffd700" stroke="#8b6914" stroke-width="0.5"/>
  </svg>`,

  attack: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- sword blade -->
    <line x1="4" y1="18" x2="16" y2="4" stroke="#d0d0d0" stroke-width="2.5" stroke-linecap="round"/>
    <!-- crossguard -->
    <line x1="13" y1="7" x2="17" y2="11" stroke="#c8a84b" stroke-width="2" stroke-linecap="round"/>
    <!-- handle -->
    <line x1="4" y1="18" x2="7" y2="15" stroke="#8b6914" stroke-width="2.5" stroke-linecap="round"/>
    <!-- tip highlight -->
    <circle cx="16.5" cy="3.5" r="1" fill="#ffffff"/>
  </svg>`,

  strength: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- mace head -->
    <rect x="13" y="3" width="6" height="6" rx="1" fill="#8b8b8b" stroke="#555" stroke-width="0.5"/>
    <line x1="13" y1="3" x2="19" y2="9" stroke="#aaa" stroke-width="0.5"/>
    <!-- spikes -->
    <polygon points="16,3 17.5,1 18,3" fill="#d0d0d0"/>
    <polygon points="19,6 21,5 19,8" fill="#d0d0d0"/>
    <!-- handle -->
    <line x1="13" y1="9" x2="4" y2="18" stroke="#8b6914" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  defence: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- shield -->
    <path d="M11 3 L19 7 L19 13 Q19 18 11 20 Q3 18 3 13 L3 7 Z" fill="#4a4a8a" stroke="#7070cc" stroke-width="1"/>
    <!-- boss -->
    <circle cx="11" cy="11" r="3" fill="#c8a84b" stroke="#8b6914" stroke-width="1"/>
    <!-- highlight -->
    <path d="M11 3 L19 7 L19 13" stroke="#9090dd" stroke-width="0.5" fill="none"/>
  </svg>`,

  hitpoints: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- heart -->
    <path d="M11 17 C11 17 3 12 3 7.5 C3 5 5 3.5 7.5 4.5 C9 5 11 7 11 7 C11 7 13 5 14.5 4.5 C17 3.5 19 5 19 7.5 C19 12 11 17 11 17Z" fill="#cc2222" stroke="#881111" stroke-width="0.5"/>
    <!-- shine -->
    <ellipse cx="8" cy="7" rx="2" ry="1.5" fill="#ee6666" opacity="0.5" transform="rotate(-30 8 7)"/>
  </svg>`,

  ranged: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- bow -->
    <path d="M6 3 Q2 11 6 19" stroke="#8b6914" stroke-width="2" fill="none" stroke-linecap="round"/>
    <line x1="6" y1="3" x2="6" y2="19" stroke="#c8a84b" stroke-width="1" stroke-dasharray="2,2"/>
    <!-- arrow -->
    <line x1="7" y1="11" x2="19" y2="11" stroke="#d0b070" stroke-width="1.5" stroke-linecap="round"/>
    <!-- arrowhead -->
    <polygon points="19,11 16,9 16,13" fill="#d0d0d0"/>
    <!-- fletching -->
    <polygon points="7,11 9,9 9,13" fill="#cc2222"/>
  </svg>`,

  prayer: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- cross / prayer symbol -->
    <rect x="9.5" y="3" width="3" height="16" rx="1.5" fill="#e8e0a0"/>
    <rect x="4" y="8" width="14" height="3" rx="1.5" fill="#e8e0a0"/>
    <!-- glow -->
    <circle cx="11" cy="11" r="5" fill="none" stroke="#ffffa0" stroke-width="0.5" opacity="0.6"/>
  </svg>`,

  magic: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- magic staff -->
    <line x1="6" y1="19" x2="15" y2="6" stroke="#8b6914" stroke-width="2" stroke-linecap="round"/>
    <!-- orb -->
    <circle cx="16" cy="5" r="4" fill="#4444cc" stroke="#8888ff" stroke-width="1"/>
    <circle cx="15" cy="4" r="1.5" fill="#aaaaff" opacity="0.6"/>
    <!-- sparkles -->
    <circle cx="4" cy="8" r="1" fill="#88aaff"/>
    <circle cx="7" cy="4" r="0.8" fill="#aaccff"/>
    <circle cx="3" cy="14" r="0.7" fill="#6688ff"/>
  </svg>`,

  cooking: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- pot -->
    <ellipse cx="11" cy="14" rx="7" ry="5" fill="#555" stroke="#888" stroke-width="1"/>
    <ellipse cx="11" cy="10" rx="7" ry="2.5" fill="#666" stroke="#888" stroke-width="1"/>
    <!-- handles -->
    <path d="M4 10 Q2 10 2 12 Q2 14 4 14" stroke="#888" stroke-width="1.5" fill="none"/>
    <path d="M18 10 Q20 10 20 12 Q20 14 18 14" stroke="#888" stroke-width="1.5" fill="none"/>
    <!-- steam -->
    <path d="M8 8 Q7 6 8 4 Q9 2 8 0" stroke="#cccccc" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.6"/>
    <path d="M14 8 Q13 6 14 4 Q15 2 14 0" stroke="#cccccc" stroke-width="1" fill="none" stroke-linecap="round" opacity="0.6"/>
  </svg>`,

  woodcutting: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- axe head -->
    <path d="M14 4 L20 7 L16 13 L10 10 Z" fill="#9090a0" stroke="#666" stroke-width="0.5"/>
    <!-- handle -->
    <line x1="10" y1="10" x2="3" y2="19" stroke="#8b6914" stroke-width="2.5" stroke-linecap="round"/>
    <!-- blade edge highlight -->
    <line x1="20" y1="7" x2="16" y2="13" stroke="#d0d0d0" stroke-width="1"/>
    <!-- wood chips -->
    <rect x="4" y="13" width="5" height="2" rx="0.5" fill="#8b6914" transform="rotate(-20 4 13)"/>
  </svg>`,

  fletching: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- arrow shaft -->
    <line x1="3" y1="11" x2="19" y2="11" stroke="#d0b070" stroke-width="1.5" stroke-linecap="round"/>
    <!-- arrowhead -->
    <polygon points="19,11 15,8 15,14" fill="#d0d0d0" stroke="#aaa" stroke-width="0.5"/>
    <!-- feather 1 -->
    <path d="M3 11 Q5 8 7 9 Q5 11 3 11Z" fill="#cc2222"/>
    <!-- feather 2 -->
    <path d="M3 11 Q5 14 7 13 Q5 11 3 11Z" fill="#882222"/>
    <!-- knife -->
    <path d="M9 5 L13 9 L11 10 L9 8 Z" fill="#a0a0a0" stroke="#666" stroke-width="0.5"/>
    <line x1="9" y1="8" x2="6" y2="11" stroke="#8b6914" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  fishing: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- rod -->
    <line x1="3" y1="18" x2="17" y2="4" stroke="#8b6914" stroke-width="2" stroke-linecap="round"/>
    <!-- line -->
    <path d="M17 4 Q22 8 18 14" stroke="#cccccc" stroke-width="1" fill="none"/>
    <!-- hook -->
    <path d="M18 14 Q20 16 18 18 Q16 19 15 17" stroke="#aaaaaa" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <!-- water waves -->
    <path d="M3 17 Q7 15 11 17 Q15 19 19 17" stroke="#4488cc" stroke-width="1" fill="none" opacity="0.7"/>
  </svg>`,

  firemaking: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- logs -->
    <rect x="3" y="16" width="16" height="4" rx="1" fill="#6b3d00"/>
    <!-- flame outer -->
    <path d="M11 3 C8 6 5 9 6 13 C7 16 9 17 11 17 C13 17 15 16 16 13 C17 9 14 6 11 3Z" fill="#ff6600" opacity="0.9"/>
    <!-- flame mid -->
    <path d="M11 6 C9 8 8 11 9 13 C10 15 11 16 11 16 C11 16 12 15 13 13 C14 11 13 8 11 6Z" fill="#ffaa00"/>
    <!-- flame core -->
    <path d="M11 9 C10 10 10 12 11 13 C11 14 11 13 12 12 C13 11 12 10 11 9Z" fill="#ffff00"/>
  </svg>`,

  crafting: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- gem shape -->
    <polygon points="11,3 17,7 17,15 11,19 5,15 5,7" fill="#cc44aa" stroke="#ff88dd" stroke-width="0.8"/>
    <!-- gem facets -->
    <polygon points="11,3 17,7 11,10 5,7" fill="#ee66cc"/>
    <polygon points="11,10 17,7 17,15" fill="#aa2288"/>
    <polygon points="11,10 5,7 5,15" fill="#bb3399"/>
    <!-- shine -->
    <circle cx="9" cy="7" r="1.5" fill="#ffccff" opacity="0.5"/>
  </svg>`,

  smithing: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- anvil -->
    <rect x="4" y="12" width="14" height="6" rx="1" fill="#555"/>
    <rect x="6" y="9" width="10" height="4" rx="1" fill="#666"/>
    <rect x="8" y="7" width="6" height="3" rx="1" fill="#777"/>
    <!-- hammer -->
    <rect x="13" y="3" width="5" height="3" rx="0.5" fill="#999" stroke="#666" stroke-width="0.5"/>
    <line x1="13" y1="5" x2="7" y2="11" stroke="#8b6914" stroke-width="2" stroke-linecap="round"/>
    <!-- spark -->
    <circle cx="8" cy="10" r="1" fill="#ffff44"/>
  </svg>`,

  mining: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- pickaxe head -->
    <path d="M16 3 L20 7 L13 10 Z" fill="#9090a0" stroke="#666" stroke-width="0.5"/>
    <path d="M16 3 L12 6 L10 10 L13 10 Z" fill="#7070a0"/>
    <!-- handle -->
    <line x1="10" y1="10" x2="3" y2="19" stroke="#8b6914" stroke-width="2.5" stroke-linecap="round"/>
    <!-- ore in rock -->
    <rect x="4" y="13" width="8" height="6" rx="1" fill="#555" stroke="#444"/>
    <circle cx="7" cy="16" r="1.5" fill="#22aa88"/>
    <circle cx="10" cy="15" r="1" fill="#22aa88"/>
  </svg>`,

  herblore: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- vial -->
    <path d="M10 4 L10 13 Q10 17 14 17 Q18 17 18 13 L18 4Z" fill="#88ccff" stroke="#4488aa" stroke-width="1" opacity="0.85"/>
    <rect x="9" y="3" width="10" height="2" rx="0.5" fill="#4488aa"/>
    <!-- liquid -->
    <path d="M10 11 L10 13 Q10 17 14 17 Q18 17 18 13 L18 11Z" fill="#44cc44"/>
    <!-- herb -->
    <path d="M3 19 Q5 14 8 12 Q7 16 5 19Z" fill="#228822"/>
    <path d="M3 19 Q6 12 9 10 Q9 14 6 18Z" fill="#33aa33"/>
    <line x1="6" y1="10" x2="3" y2="19" stroke="#228822" stroke-width="1.2"/>
  </svg>`,

  agility: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- running figure -->
    <!-- head -->
    <circle cx="15" cy="4" r="2.5" fill="#c8a84b"/>
    <!-- torso -->
    <line x1="15" y1="7" x2="12" y2="13" stroke="#c8a84b" stroke-width="2" stroke-linecap="round"/>
    <!-- arms -->
    <line x1="13" y1="9" x2="8" y2="7" stroke="#c8a84b" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="13" y1="9" x2="17" y2="12" stroke="#c8a84b" stroke-width="1.5" stroke-linecap="round"/>
    <!-- legs -->
    <line x1="12" y1="13" x2="7" y2="18" stroke="#c8a84b" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="12" y1="13" x2="16" y2="19" stroke="#c8a84b" stroke-width="1.5" stroke-linecap="round"/>
    <!-- motion lines -->
    <line x1="3" y1="10" x2="7" y2="10" stroke="#888" stroke-width="1" stroke-dasharray="1,1" opacity="0.6"/>
    <line x1="2" y1="13" x2="6" y2="13" stroke="#888" stroke-width="1" stroke-dasharray="1,1" opacity="0.4"/>
  </svg>`,

  thieving: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- lock body -->
    <rect x="6" y="10" width="10" height="9" rx="1.5" fill="#c8a84b" stroke="#8b6914" stroke-width="1"/>
    <!-- shackle -->
    <path d="M9 10 Q9 5 11 5 Q13 5 13 10" stroke="#8b6914" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <!-- keyhole -->
    <circle cx="11" cy="14" r="1.8" fill="#5a3200"/>
    <rect x="10.3" y="14" width="1.4" height="3" rx="0.5" fill="#5a3200"/>
    <!-- picks -->
    <line x1="3" y1="3" x2="8" y2="10" stroke="#aaaaaa" stroke-width="1.2" stroke-linecap="round"/>
    <line x1="6" y1="3" x2="10" y2="9" stroke="#888888" stroke-width="1" stroke-linecap="round"/>
  </svg>`,

  runecrafting: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="22" rx="3" fill="#2a1800"/>
    <!-- rune stone -->
    <polygon points="11,3 19,8 19,16 11,21 3,16 3,8" fill="#334477" stroke="#6688cc" stroke-width="1"/>
    <!-- rune symbol (air rune-ish) -->
    <circle cx="11" cy="12" r="4" fill="none" stroke="#aaccff" stroke-width="1.5"/>
    <line x1="11" y1="8" x2="11" y2="6" stroke="#aaccff" stroke-width="1.5"/>
    <line x1="11" y1="16" x2="11" y2="18" stroke="#aaccff" stroke-width="1.5"/>
    <line x1="7" y1="12" x2="5" y2="12" stroke="#aaccff" stroke-width="1.5"/>
    <line x1="15" y1="12" x2="17" y2="12" stroke="#aaccff" stroke-width="1.5"/>
    <!-- inner glow -->
    <circle cx="11" cy="12" r="2" fill="#6688ff" opacity="0.5"/>
  </svg>`,
};
