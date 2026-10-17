// POST {skills:[...], repo:"owner/name", issues:[{number,title,labels,body}]} -> {ranked:[{number,score,difficulty,reason}]}
const { groqJSON, readBody } = require("./_groq");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { skills = [], repo = "", issues = [] } = readBody(req);
    if (!Array.isArray(issues) || !issues.length) return res.status(400).json({ error: "issues required" });
    const list = issues.slice(0, 15).map((i) => ({
      number: i.number, title: String(i.title || "").slice(0, 200),
      labels: (i.labels || []).slice(0, 8), body: String(i.body || "").slice(0, 250),
    }));
    const { data, model } = await groqJSON([
      { role: "system", content: "You help first-time open-source contributors pick issues. Reply ONLY with JSON: {\"ranked\":[{\"number\":int,\"score\":0-100,\"difficulty\":\"Easy\"|\"Medium\"|\"Hard\",\"reason\":\"one short sentence, mention which skill fits\"}]}. Include every issue, sorted by score desc (best fit for the contributor's skills and beginner-friendliness first)." },
      { role: "user", content: `Contributor skills: ${skills.join(", ") || "any"}\nRepo: ${repo}\nIssues:\n${JSON.stringify(list)}` },
    ], 3000);
    const ranked = (data.ranked || []).filter((r) => list.some((i) => i.number === r.number));
    res.status(200).json({ ranked, model });
  } catch (e) { res.status(e.status || 500).json({ error: String(e.message || e) }); }
};
