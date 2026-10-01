import {auth} from "../lib/_auth.js";
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
- IMAGE PROMPT DETAIL STANDARD: every image_prompt must be a production-ready ENGLISH prompt, normally 140-230 words. Describe the locked main character's stable physical identity and outfit, exact visible-person count, each supporting person's distinct appearance when present, facial expression, gaze direction, precise body pose, hand positions, interaction with props, exact prop quantity/state, location, foreground/midground/background, spatial relationships, time of day, key/fill/rim lighting direction and quality, mood, shot size, camera angle, composition, lens/look, depth of field, textures/materials, color palette, visual style, and vertical 9:16 framing.
- Do NOT pad image prompts with generic adjectives. Every detail must be visually actionable and compatible with the current story state.
- End every image_prompt with useful continuity constraints: preserve the locked character identity/outfit; do not add unintroduced people or duplicate props; no text, subtitles, watermark, logo, split screen, collage, extra limbs/fingers, deformed hands, or contradictory objects.
- VIDEO PROMPT DETAIL STANDARD: every video_prompt must be a production-ready ENGLISH motion prompt, normally 120-210 words. Frame 0 must match that scene's image_prompt exactly. Describe the initial pose/object state, then the chronological micro-actions during ONLY this beat: eye/head movement, facial-expression transition, torso/arm/hand motion, prop interaction, supporting-character movement, environmental motion, realistic physics, camera movement, focus behavior, pacing/timing, and the precise end-frame state.
- Video prompts must NOT redesign the subject, outfit, location, lighting, or props. No teleporting, morphing, object duplication, sudden extra people, time jump, scene transition, montage, or future-story action.
- The final frame of each video must preserve the scene end_state so continuity can carry into the next scene.
- Each video_prompt uses that scene image as frame zero and animates ONLY the current beat toward its end_state.
- Main character identity/outfit remains identical. Supporting people look clearly different.
- CUSTOMER SELECTION = ABSOLUTE LOCK. The selected VISUAL STYLE and LOCKED MAIN CHARACTER are mandatory production constraints.
- VISUAL STYLE LOCK: every image_prompt, video_prompt, and cover_prompt MUST explicitly preserve the exact customer-selected visual style. Never switch, blend, reinterpret, or drift into another style/medium between scenes.
- CHARACTER LOCK: whenever the main character is visible, preserve the exact supplied identity: age impression, hairstyle/hair shape, facial identity, body/proportions, outfit pieces/silhouette, and accessories or absence of accessories.
- Never redesign, recolor, replace, add accessories, or change the locked outfit unless the story explicitly requires a visible wardrobe change.
- Pose, expression, gaze, action, framing, and camera angle MAY change; locked identity, outfit, and selected visual style MUST NOT.
- Supporting characters must look clearly different from the main character while remaining in the SAME selected visual style.
- Every image_prompt must restate enough of the selected style and locked character description to work as a standalone image-generation prompt with no memory of previous scenes.
- Every video_prompt must explicitly preserve the selected visual style, character identity, outfit, materials, and proportions from frame zero through the final frame.
- cover_prompt must use the SAME selected visual style and, when the main character appears, the SAME locked character identity/outfit.
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
VISUAL STYLE (ABSOLUTE CUSTOMER LOCK): ${String(style || "")}
LOCKED MAIN CHARACTER (ABSOLUTE CUSTOMER LOCK): ${String(character).trim()}
IMPORTANT: Treat both selections above as immutable constraints across every scene, image prompt, video prompt, and cover prompt.

Generate the complete production package now.`;

    // Resilient Gemini routing:
    // 1) preferred model, 2) stable fallback, 3) lightweight fallback.
    // Transient 429/5xx errors are retried with exponential backoff.
    const models = [
      process.env.GEMINI_MODEL || "gemini-3.8-flash",
      "gemini-3.7-flash",
      "gemini-3.5-flash-lite"
    ].filter((m, i, a) => a.indexOf(m) === i);

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const retryable = status => status === 429 || status >= 500;
    let d = null;
    let lastStatus = 502;
    let lastError = "Semua model Gemini sedang tidak tersedia.";

    for (const model of models) {
      for (let attempt = 0; attempt < 3; attempt++) {
        let rr;
        try {
          rr = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            {
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
            }
          );
          d = await rr.json();
        } catch (networkErr) {
          lastStatus = 503;
          lastError = networkErr?.message || "Gangguan jaringan saat menghubungi Gemini.";
          if (attempt < 2) {
            await sleep(700 * (2 ** attempt));
            continue;
          }
          break;
        }

        if (rr.ok) break;

        lastStatus = rr.status;
        lastError = d?.error?.message || `Gemini API error (${rr.status}).`;

        if (retryable(rr.status) && attempt < 2) {
          await sleep(700 * (2 ** attempt));
          continue;
        }
        break;
      }

      if (d?.candidates?.[0]?.content?.parts?.some(p => p?.text)) break;
    }

    if (!d?.candidates?.[0]?.content?.parts?.some(p => p?.text)) {
      return res.status(lastStatus).json({
        error: `${lastError} Vizex sudah mencoba model cadangan otomatis. Coba lagi sebentar lagi.`
      });
    }

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
