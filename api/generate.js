const schema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    hook: { type: "STRING" },
    payoff: { type: "STRING" },
    narration: { type: "STRING" },
    caption: { type: "STRING" },
    cover_text: { type: "STRING" },
    cover_prompt: { type: "STRING" },
    scenes: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          function: { type: "STRING" },
          start_state: { type: "STRING" },
          action: { type: "STRING" },
          end_state: { type: "STRING" },
          camera: { type: "STRING" },
          image_prompt: { type: "STRING" },
          video_prompt: { type: "STRING" }
        },
        required: ["function","start_state","action","end_state","camera","image_prompt","video_prompt"]
      }
    }
  },
  required: ["title","hook","payoff","narration","caption","cover_text","cover_prompt","scenes"]
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: "GEMINI_API_KEY belum terpasang di Vercel." });

  try {
    const { title, sceneCount, duration, style, character } = req.body || {};
    const n = Math.max(3, Math.min(10, Number(sceneCount) || 5));
    const dur = [15,30,45,60].includes(Number(duration)) ? Number(duration) : 30;
    if (!String(title || "").trim()) return res.status(400).json({ error: "Judul kosong." });
    if (!String(character || "").trim()) return res.status(400).json({ error: "Karakter belum dipilih." });

    const prompt = `You are the story director and prompt architect for Vizex Studio. Create ONE coherent short-form visual story from the user's title. The title is the source of truth.

RULES:
- Exactly ${n} chronological scenes: cause -> reaction -> escalation -> payoff. No unrelated subplot.
- Build the causal story first, then derive ALL scene states, image prompts, video prompts, narration, caption and cover from that SAME story.
- Scene N may know ONLY events that happened through Scene N. Never leak future people, props, payoff or ending into earlier images.
- State carries forward. No teleporting, duplication or reset. Consumables stay the same or decrease unless the story explicitly adds more.
- If the story starts with one person alone, Scene 1 shows exactly that one person. Introduce supporting people only when the current beat introduces them.
- Each image_prompt is ONE frozen frame only. Explicitly state exact visible-person count and important prop quantities whenever relevant.
- Each video_prompt uses that scene image as frame zero and animates ONLY the current beat toward its end_state.
- Main character identity/outfit remains identical. Supporting people look clearly different.
- Image/video/cover prompts are ENGLISH. Story states/actions, narration, caption, hook, payoff and cover_text are natural INDONESIAN.
- Narration is a continuous first-person spoken story, natural gue/lo style when suitable, retelling the SAME events in scene order.
- Never expose engine language in narration: do not say karakter utama, tampilkan, scene, timeline, prompt, penyebab langsung, respons harus, or production instructions.
- Narration must fit about ${dur} seconds; target about ${Math.round(dur * 2.15)} Indonesian spoken words (plus/minus 15%), ending with ONE contextual varied CTA.
- Caption is not a copy of narration and uses a DIFFERENT contextual CTA.
- Cover text is short, intriguing, truthful, and does not spoil the ending. Cover prompt requests that exact visible text.
- Visual format 9:16. No watermark/logo/subtitles in scene images.

TITLE: ${String(title).trim()}
SCENES: ${n}
DURATION: ${dur} seconds
VISUAL STYLE: ${String(style || "")}
LOCKED MAIN CHARACTER: ${String(character).trim()}

Generate the complete production package now.`;

    const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
    const rr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.8,
          maxOutputTokens: 8192
        }
      })
    });

    const d = await rr.json();
    if (!rr.ok) return res.status(rr.status).json({ error: d?.error?.message || "Gemini API error." });

    const raw = (d?.candidates?.[0]?.content?.parts || []).map(p => p?.text || "").join("").trim();
    if (!raw) {
      const reason = d?.candidates?.[0]?.finishReason || d?.promptFeedback?.blockReason || "unknown";
      return res.status(502).json({ error: `Gemini tidak mengembalikan output (${reason}).` });
    }

    const result = JSON.parse(raw);
    if (!Array.isArray(result.scenes) || result.scenes.length !== n) {
      return res.status(502).json({ error: `Gemini menghasilkan ${result.scenes?.length || 0} scene, seharusnya ${n}. Coba generate lagi.` });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err?.message || "Generator gagal." });
  }
}
