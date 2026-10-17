// Shared Groq helper (OpenAI-compatible). Key only from env GROQ_API_KEY.
const MODELS = [process.env.GROQ_MODEL, "openai/gpt-oss-20b", "openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"].filter(Boolean);
const clean = (t) => (t || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
function parseJSON(text) {
  const t = clean(text).replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch {}
  const m = t.match(/[\[{][\s\S]*[\]}]/);
  if (m) return JSON.parse(m[0]);
  throw new Error("Model returned invalid JSON");
}
async function groqJSON(messages, max_tokens = 1500) {
  if (!process.env.GROQ_API_KEY) throw Object.assign(new Error("Server missing GROQ_API_KEY"), { status: 500 });
  let lastErr = "Groq error";
  for (const model of MODELS) {
    const payload = { model, messages, max_tokens, temperature: 0.3, response_format: { type: "json_object" } };
    if (model.startsWith("openai/gpt-oss")) payload.include_reasoning = false;
    else if (model.startsWith("qwen/")) payload.reasoning_format = "hidden";
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    }).catch((e) => ({ ok: false, status: 504, json: async () => ({ error: { message: `${model} timed out` } }) }));
    const j = await r.json().catch(() => ({}));
    if (r.ok) { try { return { data: parseJSON(j.choices?.[0]?.message?.content), model }; } catch (e) { lastErr = e.message; continue; } }
    console.warn("[groq]", model, r.status, j.error?.message);
    lastErr = j.error?.message || `Groq error ${r.status}`;
    if (r.status === 401) break; // other errors (404 model, 429, 5xx) -> try next model
  }
  throw Object.assign(new Error(lastErr), { status: 502 });
}
const readBody = (req) => (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {});
module.exports = { groqJSON, readBody };
