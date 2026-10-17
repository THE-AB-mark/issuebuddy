// POST {skills, repo, issue:{number,title,body,labels,url}} -> contribution plan JSON
const { groqJSON, readBody } = require("./_groq");
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { skills = [], repo = "", issue } = readBody(req);
    if (!issue || !issue.title) return res.status(400).json({ error: "issue required" });
    const { data, model } = await groqJSON([
      { role: "system", content: "You are a friendly open-source mentor. Create a concrete contribution plan for a beginner. Reply ONLY with JSON: {\"summary\":\"2 sentences\",\"steps\":[\"...\"],\"files\":[\"likely file paths or areas (say 'likely')\"],\"tests\":[\"how to verify\"],\"branch\":\"a real descriptive branch name like docs/vector-w-field\",\"commit\":\"conventional commit message\",\"pr_title\":\"...\",\"pr_body\":\"markdown PR description that includes 'Fixes #N'\"}. Steps must cover: comment on the issue to ask for assignment, fork, clone, create branch, make change, run tests/lint, commit, push, open PR. Keep 7-10 steps, each one line." },
      { role: "user", content: `Repo: ${repo}\nMy skills: ${skills.join(", ") || "any"}\nIssue #${issue.number}: ${String(issue.title).slice(0, 200)}\nLabels: ${(issue.labels || []).join(", ")}\nBody:\n${String(issue.body || "").slice(0, 2500)}` },
    ], 2000);
    res.status(200).json({ ...data, model });
  } catch (e) { res.status(e.status || 500).json({ error: String(e.message || e) }); }
};
