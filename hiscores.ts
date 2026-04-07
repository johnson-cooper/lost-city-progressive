import { serve } from "bun";
import { Database } from "bun:sqlite";

const db = new Database("db.sqlite");

serve({
  port: 3000,

  async fetch(req) {
    const url = new URL(req.url);

    // -------------------------
    // 🌍 API ROUTES
    // -------------------------

    // GET /api/hiscores?skill=overall|<skillId>&page=0
    // - overall  → uses hiscore_large (type=0 = pre-computed total level)
    // - skill id → uses hiscore (individual skill rows)
    if (url.pathname === "/api/hiscores") {
      const skillParam = url.searchParams.get("skill") ?? "overall";
      const page   = Math.max(0, parseInt(url.searchParams.get("page") ?? "0"));
      const limit  = 25;
      const offset = page * limit;

      if (skillParam === "overall") {
        const stmt = db.query(`
          SELECT a.username,
                 hl.level,
                 hl.value AS xp
          FROM hiscore_large hl
          JOIN account a ON a.id = hl.account_id
          WHERE hl.profile = 'main' AND hl.type = 0
          ORDER BY hl.level DESC, hl.value DESC
          LIMIT ? OFFSET ?
        `);
        return Response.json(stmt.all(limit, offset));
      } else {
        const skillType = parseInt(skillParam);
        if (isNaN(skillType)) {
          return new Response("Bad skill param", { status: 400 });
        }
        const stmt = db.query(`
          SELECT a.username,
                 h.level,
                 h.value AS xp
          FROM hiscore h
          JOIN account a ON a.id = h.account_id
          WHERE h.profile = 'main' AND h.type = ?
          ORDER BY h.level DESC, h.value DESC
          LIMIT ? OFFSET ?
        `);
        return Response.json(stmt.all(skillType, limit, offset));
      }
    }

    // GET /api/player/:username
    if (url.pathname.startsWith("/api/player/")) {
      const username = decodeURIComponent(url.pathname.split("/").pop()!);

      const accountStmt = db.query(
        "SELECT id, username FROM account WHERE username = ? COLLATE NOCASE"
      );
      const account = accountStmt.get(username) as { id: number; username: string } | null;

      if (!account) {
        return new Response("Not found", { status: 404 });
      }

      // Overall total from hiscore_large (type = 0)
      const overallStmt = db.query(`
        SELECT level, value FROM hiscore_large
        WHERE account_id = ? AND profile = 'main' AND type = 0
      `);
      const overall = overallStmt.get(account.id) as { level: number; value: number } | null;

      // Individual skills from hiscore
      const skillsStmt = db.query(`
        SELECT type, level, value FROM hiscore
        WHERE account_id = ? AND profile = 'main'
        ORDER BY type
      `);
      const skills = skillsStmt.all(account.id) as { type: number; level: number; value: number }[];

      // Per-skill rank
      const rankMap: Record<number, number> = {};
      for (const skill of skills) {
        const rankStmt = db.query(`
          SELECT COUNT(*) + 1 AS rank
          FROM hiscore
          WHERE profile = 'main' AND type = ?
            AND (level > ? OR (level = ? AND value > ?))
        `);
        const r = rankStmt.get(skill.type, skill.level, skill.level, skill.value) as { rank: number };
        rankMap[skill.type] = r.rank;
      }

      // Overall rank from hiscore_large
      let overallRank = 1;
      if (overall) {
        const overallRankStmt = db.query(`
          SELECT COUNT(*) + 1 AS rank
          FROM hiscore_large
          WHERE profile = 'main' AND type = 0
            AND (level > ? OR (level = ? AND value > ?))
        `);
        const r = overallRankStmt.get(overall.level, overall.level, overall.value) as { rank: number };
        overallRank = r.rank;
      }

      return Response.json({
        username: account.username,
        overall: overall
          ? { level: overall.level, xp: overall.value, rank: overallRank }
          : null,
        skills: skills.map(s => ({ ...s, rank: rankMap[s.type] ?? null })),
      });
    }

    // -------------------------
    // 🌐 STATIC FILE ROUTES
    // -------------------------
    let path = url.pathname;
    if (path === "/") path = "/index.html";

    const filePath = `./public${path}`;
    const asset = Bun.file(filePath);

    if (await asset.exists()) {
      return new Response(asset);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log("🔥 Running on http://localhost:3000");
