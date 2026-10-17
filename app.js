// IssueBuddy frontend: GitHub public REST API (browser) + /api/rank + /api/plan (Google Gemma via Gemini API).
const SKILLS = ["JavaScript", "TypeScript", "Python", "React", "CSS", "HTML", "Docs", "Java", "Go", "Rust", "C++", "Testing", "Design/UI"];
const SAMPLES = ["processing/p5.js", "excalidraw/excalidraw", "oppia/oppia"];
const LABELS = ["good first issue", "hacktoberfest", "help wanted", "documentation"];
const $ = (s) => document.querySelector(s);
const state = { skills: new Set(["JavaScript", "Docs"]), repo: "", issues: [] };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderChips() {
  $("#chips").innerHTML = SKILLS.map((s) => `<button class="chip ${state.skills.has(s) ? "on" : ""}" data-s="${s}" aria-pressed="${state.skills.has(s)}">${s}</button>`).join("");
}
$("#chips").onclick = (e) => { const s = e.target.dataset.s; if (!s) return; state.skills.has(s) ? state.skills.delete(s) : state.skills.add(s); renderChips(); };
$("#samples").innerHTML = SAMPLES.map((r) => `<button data-r="${r}">${r}</button>`).join("");
$("#samples").onclick = (e) => { if (e.target.dataset.r) { $("#repo").value = e.target.dataset.r; find(); } };
$("#go").onclick = find;
$("#repo").onkeydown = (e) => e.key === "Enter" && find();
$("#close").onclick = () => $("#modal").classList.add("hidden");
$("#modal").onclick = (e) => e.target.id === "modal" && $("#modal").classList.add("hidden");
document.onkeydown = (e) => e.key === "Escape" && $("#modal").classList.add("hidden");

function status(msg, err = false, spin = false) { $("#status").className = "status" + (err ? " err" : ""); $("#status").innerHTML = (spin ? '<span class="spin"></span>' : "") + msg; }
function parseRepo(v) {
  const m = v.trim().replace(/\.git$/, "").match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+)/i);
  return m ? `${m[1]}/${m[2]}` : null;
}
async function gh(path) {
  const r = await fetch("https://api.github.com" + path, { headers: { Accept: "application/vnd.github+json" } });
  if (r.status === 403 || r.status === 429) {
    const reset = r.headers.get("x-ratelimit-reset");
    const mins = reset ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : "a few";
    throw new Error(`GitHub's free API limit (60 requests/hour) was reached. Try again in ${mins} min.`);
  }
  if (r.status === 404) throw new Error("Repo not found. Check the owner/name (it must be public).");
  if (!r.ok) throw new Error(`GitHub error ${r.status}`);
  return r.json();
}
async function api(path, body, tries = 3) {
  for (let a = 1; ; a++) {
    let r;
    try {
      r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      if (a < tries) { await new Promise((ok) => setTimeout(ok, 1500 * a)); continue; }
      throw new Error("Network hiccup reaching the AI server. Please check your connection and try again.");
    }
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j;
    if (r.status >= 500 && r.status !== 501 && a < tries) { await new Promise((ok) => setTimeout(ok, 1500 * a)); continue; }
    throw new Error(j.error || (r.status === 504 ? "Gemma took too long to answer. Please try again." : `Server error ${r.status}`));
  }
}

async function find() {
  const repo = parseRepo($("#repo").value);
  if (!repo) return status("Enter a repo like <b>owner/name</b> or a github.com URL.", true);
  state.repo = repo; $("#go").disabled = true;
  $("#results").innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
  try {
    status(`Fetching beginner-friendly issues from <b>${esc(repo)}</b>…`, false, true);
    const lists = await Promise.all(LABELS.map((l) => gh(`/repos/${repo}/issues?state=open&per_page=15&labels=${encodeURIComponent(l)}`).catch((e) => { if (/limit|not found/.test(e.message)) throw e; return []; })));
    const map = new Map();
    lists.flat().filter((i) => !i.pull_request).forEach((i) => map.set(i.number, {
      number: i.number, title: i.title, url: i.html_url, body: (i.body || "").slice(0, 3000), comments: i.comments,
      assigned: !!(i.assignee || (i.assignees || []).length), labels: i.labels.map((l) => (typeof l === "string" ? l : l.name)),
    }));
    state.issues = [...map.values()].sort((a, b) => a.assigned - b.assigned).slice(0, 15);
    if (!state.issues.length) { $("#results").innerHTML = ""; return status(`No open issues labelled ${LABELS.join(" / ")} in ${esc(repo)}. Try a sample repo.`, true); }
    status(`Found ${state.issues.length} issues. AI is ranking them for <b>${[...state.skills].join(", ") || "any skill"}</b>…`, false, true);
    let ranked = [], rankModel = "";
    try { ({ ranked, model: rankModel } = await api("/api/rank", { skills: [...state.skills], repo, issues: state.issues })); }
    catch (e) { status(`AI ranking unavailable (${esc(e.message)}). Showing issues unranked.`, true); }
    const byNum = new Map(ranked.map((r) => [r.number, r]));
    const rows = state.issues.map((i) => ({ ...i, ...(byNum.get(i.number) || { score: 0, difficulty: "", reason: "" }) })).sort((a, b) => b.score - a.score);
    render(rows);
    if (ranked.length) status(`✅ ${rows.length} issues ranked for you in <b>${esc(repo)}</b> by Google Gemma 4 (<code>${esc(rankModel || "gemma-4")}</code>). Click <b>Plan it</b> on one to start.`);
  } catch (e) { $("#results").innerHTML = ""; status("⚠️ " + esc(e.message), true); }
  finally { $("#go").disabled = false; }
}

function render(rows) {
  $("#results").innerHTML = rows.map((i) => `
  <article class="issue">
    <div class="score" style="--p:${i.score || 0}" title="Fit score"><span>${i.score ? i.score : "–"}</span></div>
    <div>
      <h3><a href="${esc(i.url)}" target="_blank" rel="noopener">#${i.number} ${esc(i.title)}</a></h3>
      <div class="meta">${i.difficulty ? `<span class="tag diff ${esc(i.difficulty)}">${esc(i.difficulty)}</span>` : ""}${i.assigned ? '<span class="tag Hard">assigned</span>' : ""}${i.labels.slice(0, 4).map((l) => `<span class="tag">${esc(l)}</span>`).join("")}<span class="tag">💬 ${i.comments}</span></div>
      ${i.reason ? `<p class="reason">${esc(i.reason)}</p>` : ""}
      <div class="actions"><button class="primary" data-plan="${i.number}">🗺️ Plan it</button><a href="${esc(i.url)}" target="_blank" rel="noopener"><button>Open on GitHub ↗</button></a></div>
    </div>
  </article>`).join("");
}
$("#results").onclick = (e) => { const n = e.target.dataset.plan; if (n) plan(+n, e.target); };

async function plan(num, btn) {
  const issue = state.issues.find((i) => i.number === num);
  btn.disabled = true; const old = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>Planning…';
  try {
    const p = await api("/api/plan", { skills: [...state.skills], repo: state.repo, issue });
    const li = (a) => (a || []).map((x) => `<li>${esc(x)}</li>`).join("");
    const block = (title, text) => `<div class="copyrow"><h4>${title}</h4><button class="copy">Copy</button></div><pre>${esc(text)}</pre>`;
    $("#modalBody").innerHTML = `
      <h3>🗺️ Plan for #${issue.number}: ${esc(issue.title)}</h3>
      <p class="reason">${esc(p.summary)}</p>
      <h4>Steps</h4><ol>${li(p.steps)}</ol>
      <h4>Files likely touched</h4><ul>${li(p.files)}</ul>
      <h4>How to test</h4><ul>${li(p.tests)}</ul>
      ${block("Branch", `git checkout -b ${p.branch || "fix/issue-" + issue.number}`)}
      ${block("Commit message", p.commit || "")}
      ${block("PR title", p.pr_title || "")}
      ${block("PR description", p.pr_body || "")}
      <p class="reason" style="margin-top:14px;font-size:12px">AI-generated by Google Gemma 4 (<code>${esc(p.model || "gemma-4")}</code>) via the Gemini API. Always read the repo's CONTRIBUTING guide and ask to be assigned first.</p>`;
    $("#modalBody").querySelectorAll(".copy").forEach((b) => (b.onclick = async () => {
      const t = b.parentElement.nextElementSibling.textContent;
      try { await navigator.clipboard.writeText(t); b.textContent = "Copied ✓"; } catch { b.textContent = "Select & copy"; }
      setTimeout(() => (b.textContent = "Copy"), 1500);
    }));
    $("#modal").classList.remove("hidden");
  } catch (e) { status("⚠️ Couldn't build a plan: " + esc(e.message), true); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}
renderChips();
