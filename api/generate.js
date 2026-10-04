import {auth} from "../lib/_auth.js";
const sceneSchema={type:"object",additionalProperties:false,properties:{function:{type:"string"},start_state:{type:"string"},action:{type:"string"},end_state:{type:"string"},camera:{type:"string"},outfit:{type:"string"},outfit_change_reason:{type:"string"},image_prompt:{type:"string"},video_prompt:{type:"string"}},required:["function","start_state","action","end_state","camera","outfit","outfit_change_reason","image_prompt","video_prompt"]};
const packageSchema={type:"object",additionalProperties:false,properties:{title:{type:"string"},hook:{type:"string"},payoff:{type:"string"},narration:{type:"string"},caption:{type:"string"},cover_text:{type:"string"},cover_prompt:{type:"string"},scenes:{type:"array",items:sceneSchema}},required:["title","hook","payoff","narration","caption","cover_text","cover_prompt","scenes"]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function geminiSchema(x){if(Array.isArray(x))return x.map(geminiSchema);if(!x||typeof x!=="object")return x;const o={};for(const [k,v] of Object.entries(x))if(k!=="additionalProperties")o[k]=geminiSchema(v);return o}
function parseGeminiJson(raw){
 const cleaned=String(raw||"").trim().replace(/^```json\s*/i,"").replace(/```$/,"").trim();
 try{return JSON.parse(cleaned)}catch{}
 const a=cleaned.indexOf("{"), b=cleaned.lastIndexOf("}");
 if(a>=0&&b>a){try{return JSON.parse(cleaned.slice(a,b+1))}catch{}}
 return null;
}
async function askGemini(system,user,schema,name,max=8192){
 const key=process.env.GEMINI_API_KEY;
 if(!key)throw new Error("GEMINI_API_KEY belum diatur.");
 const models=[process.env.GEMINI_MODEL,"gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite"].filter((v,i,a)=>v&&a.indexOf(v)===i);
 const payload={systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:user}]}],generationConfig:{maxOutputTokens:max,responseMimeType:"application/json",responseSchema:geminiSchema(schema),thinkingConfig:{thinkingLevel:"low"}}};
 let last="Gemini sedang sibuk.";
 for(const model of models){
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  let r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  let d=await r.json();
  if(r.ok){
   const raw=d?.candidates?.[0]?.content?.parts?.map(x=>x?.text||"").join("").trim();
   if(!raw){last=`${model} tidak mengembalikan output.`;continue}
   const parsed=parseGeminiJson(raw);
   if(parsed)return parsed;
   // One repair attempt only when the model answered but JSON formatting broke.
   const repairPayload={systemInstruction:{parts:[{text:"Return ONLY valid JSON matching the supplied response schema. Repair formatting/truncation artifacts without adding commentary."}]},contents:[{role:"user",parts:[{text:"Repair this into valid JSON only:\n"+raw}]}],generationConfig:{maxOutputTokens:max,responseMimeType:"application/json",responseSchema:geminiSchema(schema),thinkingConfig:{thinkingLevel:"low"}}};
   const rr=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(repairPayload)});
   const rd=await rr.json();
   if(rr.ok){
    const fixed=rd?.candidates?.[0]?.content?.parts?.map(x=>x?.text||"").join("").trim();
    const repaired=parseGeminiJson(fixed);
    if(repaired)return repaired;
   }
   last=`Output ${model} belum menjadi JSON valid setelah repair.`;continue
  }
  last=d?.error?.message||last;
  if([429,500,502,503,504,400,403,404].includes(r.status)){await sleep(700);continue}
  break;
 }
 throw new Error(last+" Semua model Gemini cadangan sudah dicoba.");
}
function coreRules(n,dur){return `You direct Vizex short-form stories. TITLE is absolute source of truth.
WORK ORDER: silently decide one simple story spine from TITLE first (setup -> trigger -> consequence -> payoff). Then derive every scene from that SAME spine. Only after all scenes are fixed, write narration/caption/cover from those scenes. Never create a second version of the story in narration.
STORY: exactly ${n} chronological scenes built directly from TITLE, with the simplest believable cause -> reaction -> escalation -> payoff. Do not add random strangers, secret notes/messages, mystery boxes, sudden discoveries, magical coincidences or unrelated twists unless TITLE explicitly requires them. Scene N knows only events already introduced. Each action must be physically plausible from start_state and must produce end_state. The next scene start_state must inherit the previous end_state. State, people, props, quantities, food amount, damage/wetness, outfit condition and location carry forward; nothing teleports, duplicates, resets, dries/cleans magically or appears early.
IDENTITY: keep the same physical character identity, hair, proportions, distinctive traits and face/faceless setting.
TITLE FIDELITY: do not "improve" the title by adding mystery, strangers, notes, gifts, secrets, accidents or twists. Expand only details logically necessary to show the title.
OUTFIT: infer Scene 1 clothes from title + place + time + role + activity. Saved character outfit is fallback only. Later scenes copy the current outfit until a visible/logical story event changes it. Wet/dirty/torn is a condition of the same outfit and persists realistically. Never change clothes for variety. outfit_change_reason is Indonesian; use "TIDAK BERUBAH" only when garment and relevant condition truly carry forward.
SCENE JSON: every scene MUST contain non-empty function,start_state,action,end_state,camera,outfit,outfit_change_reason,image_prompt,video_prompt.
IMAGE PROMPT: English, standalone frozen frame, about 80-130 useful words. Include exact visible-person count, locked identity, exact current outfit+condition, pose/action, relevant props+quantities, environment/spatial placement, time/light when relevant, composition, camera/shot/lens feel, depth, visual style, vertical 9:16, continuity constraints, no watermark/subtitles/duplicates/extra limbs. Never say "same as previous".
VIDEO PROMPT: English, about 60-100 useful words. Restate critical identity/outfit/props/environment. Describe frame-zero state -> current beat motion -> object/environment reaction -> camera motion -> exact end state. Animate only this scene; introduce nothing early. Never say "same as image_prompt".
NARRATION VOICE — STRICT STORY-FAITHFUL INDONESIAN:
- Narration is written LAST from the finished scenes. Every narrated person, object, discovery, joke, note/message, location, action and outcome MUST already exist in those scenes. NEVER invent a stranger, secret note, surprise object, hidden information, extra event or gimmick just to make narration interesting.
- Use ONE pronoun style consistently for the whole narration: default casual "gue"; never mix "gue" with "aku/saya" in the same narration.
- Sound like a normal Indonesian creator recounting what actually happened. Use simple everyday wording that a person would naturally say aloud. Grammar and verb choice must make literal sense.
- Do NOT narrate camera/video production. Never say "gue buka video ini", "video ini", "di scene ini", "kamera", "frame", "prompt", or address the fact that this is an animation/video.
- Avoid unnatural verbs/collocations such as "nangkap mangkuk", "tawa berbagi rasa", "malam menutup", or other poetic AI wording. Say the ordinary action instead: "angkat mangkuk", "gue ketawa", "akhirnya beres", etc.
- Do not turn the storyboard into an action list. Skip unimportant hand movements and connect only meaningful beats: situation -> reason/problem -> what happened -> reaction/consequence -> payoff.
- Tone follows the actual story: funny may be playful, awkward may be canggung, tense may build curiosity, wholesome may be warm, nostalgia may be reflective. Humor/emotion comes from existing events, not invented twists.
- Vary sentence length and openings naturally. Avoid repetitive "gue... gue... gue..." and mechanical "lalu/kemudian/akhirnya" chains.
- Same chronology and facts as visuals, with no early reveal. Before returning JSON, compare narration sentence-by-sentence against the scenes and DELETE or rewrite anything not visually/story-supported.
- Prefer concrete casual Indonesian over translated-English phrasing. If a sentence would sound weird when spoken to a friend, rewrite it simpler.
- Never narrate bodily states as instantly resolved just because an action starts (for example, eating one bite does not instantly mean "perut terisi"). Describe only what the story visibly supports.
- Narration should usually use 4-7 flowing sentences for short videos, not one sentence per scene.
- FINAL NARRATION AUDIT: for every noun/event in narration ask "where is this in the scenes?" If nowhere, remove it. For every sentence ask "would an Indonesian creator actually say this?" If no, rewrite it.
- Target about ${Math.round(dur*2.05)} spoken Indonesian words (±15%) for ${dur}s.
CTA: after the payoff, choose ONE CTA only if it sounds like something this narrator would naturally say. Vary by context: relatable question, "lo pernah...?", either/or choice, "kalau lo jadi gue...", opinion, prediction, playful challenge, tag-a-friend, share-to-someone, save idea, request-next-part, or punchline question. Never default to "mau coba...?", "gimana menurut lo?", "setuju nggak?", or generic like/comment/follow. Do not reuse the same CTA construction repeatedly. CTA must be a natural final spoken sentence, not a marketing attachment. CTA is NOT part of the story payoff and must never introduce a new fact/event.
CAPTION: write a natural Indonesian social-media caption, 80-130 words in 2-4 short paragraphs. It must feel independently written after watching the video, NOT a transcript or paraphrase of narration. Pick a fresh angle that fits the story: reaction, relatable observation, mini-confession, behind-the-moment thought, question, joke, or punchline. Keep facts faithful to the video: every person/object/event mentioned must exist in the scenes. Do not add backstory, motivation, dialogue, secrets or outcomes that are not shown. Finish with ONE contextual CTA, but its intent AND wording must differ from narration CTA. Across generations vary caption openings, rhythm and CTA type; avoid formulaic engagement bait.
CAMERA: camera field MUST be exactly ONE of these preset shot names only: Establishing Wide Shot, Wide Shot, Full Shot, Medium Shot, Medium Close-Up, Close-Up, Low Angle, High Angle, Top-Down, Side Shot, Front Shot, Back Shot, Over-the-Shoulder, Tracking Shot. Choose the preset that best communicates each scene; vary shots only when story readability benefits, not randomly. Do not add lens, lighting, movement, focal length, or explanations inside camera; those details belong in image_prompt/video_prompt.
COVER: English visual prompt; Indonesian short cover_text; intriguing, truthful, no ending spoiler.
FINAL CHECK BEFORE JSON: (1) title and payoff are the same story, (2) every action is possible from its start_state, (3) previous end_state -> next start_state, (4) people/prop/food quantities never jump, (5) identity stays locked, (6) outfit and wet/dirty/damage condition follow story causally, (7) camera is one allowed preset only, (8) narration contains ZERO unsupported person/object/event and sounds naturally spoken Indonesian, (9) caption is not a narration rewrite and contains ZERO unsupported facts, (10) image/video prompts depict exactly their scene with no future leakage. Silently repair any failure before returning JSON.

ULTRA DETAIL V2:
IMAGE PROMPT must now be 150-200 useful English words, not filler. Add locked identity traits; exact outfit + condition; expression/eye direction; posture; visible hand/foot placement; exact action instant; each relevant prop with quantity/state/spatial position; foreground/midground/background; relevant time/weather; practical light source/direction; shadows; material/texture; composition; subject placement; selected shot/angle; believable lens/depth feel; visual style; vertical 9:16; continuity constraints. No future leakage, random text, new props, duplicates or anatomy errors.
VIDEO PROMPT must now be 120-160 useful English words. Describe exact frame zero from start_state -> chronological body/hand/facial motion -> object interaction -> secondary/environment motion -> restrained camera motion/pacing -> EXACT end_state. No new person, prop, outfit, location, information or future event.

NARRATION V2:
Write narration only after all scenes are final. Silently map EVERY narration sentence to scene facts; if it cannot be mapped, delete/rewrite it. Use consistent gue/lo. Sound like a real Indonesian creator telling a friend: casual, concrete, flowing and context-aware. Do not narrate every visible movement; focus on meaningful setup, reaction/thought, consequence and payoff. Ban stiff translated/AI prose and decorative phrases. Never invent dialogue, strangers, notes, secrets, surprise objects, hidden info, backstory or outcomes absent from scenes. CTA maximum one natural final spoken sentence and must fit the actual story.

COVER V2:
cover_text must be exact Indonesian 2-6 words: short, punchy, truthful, readable at thumbnail size, curiosity-driven without spoiling payoff.
cover_prompt must be English, 100-150 useful words, vertical 9:16, based on the strongest truthful PRE-PAYOFF moment from actual scenes.
CRITICAL: cover_prompt MUST explicitly instruct the image model to visibly render the exact cover_text value letter-for-letter as the headline. Put headline at top or upper-middle with large bold high-contrast typography, clean safe margins, strong mobile readability and negative space behind it; never cover face/key action. The exact cover_text is the ONLY readable text allowed: no extra words, logo, subtitle, watermark, UI, labels or gibberish. Character identity, outfit/condition, expression, prop/action, environment and lighting must exactly match the chosen scene.`}
export default async function handler(req,res){
 const account=await auth(req).catch(()=>null);
 if(!account)return res.status(401).json({error:"Sesi login tidak valid."});
 const freePlan=String(account.plan||"PRO").toUpperCase()==="FREE";
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.GEMINI_API_KEY)return res.status(500).json({error:"GEMINI_API_KEY belum terpasang di Vercel."});
 try{
  const body=req.body||{}, action=String(body.action||"generate");
   if(freePlan&&action==="regenerate_scene")return res.status(403).json({error:"Regenerate Scene tersedia untuk akun PRO."});
  const title=String(body.title||"").trim(),character=String(body.character||"").trim(),style=String(body.style||"3D Vinyl Toy");
  const requestedScenes=Number(body.sceneCount)||5;
   const n=freePlan?3:Math.max(3,Math.min(10,requestedScenes)),dur=[15,30,45,60].includes(Number(body.duration))?Number(body.duration):30;
  if(!title)return res.status(400).json({error:"Judul kosong."});if(!character)return res.status(400).json({error:"Karakter belum dipilih."});
  if(action==="finalize"){
   const pkg=body.package||{};
   if(!Array.isArray(pkg.scenes)||pkg.scenes.length!==n)return res.status(400).json({error:"Storyboard belum lengkap."});
   const system=coreRules(n,dur)+`\nFINALIZATION MODE: The supplied storyboard scene actions and outfit timeline are authoritative. Rebuild synchronized start/end states, image/video prompts, narration, caption and cover around them. Preserve the user's intended actions and outfit choices unless they are physically impossible; repair only the minimum needed for continuity. Do not silently revert an edited outfit.`;
   const user=`TITLE: ${title}\nSTYLE: ${style}\nLOCKED CHARACTER: ${character}\nEDITED STORYBOARD: ${JSON.stringify(pkg.scenes)}\nORIGINAL HOOK/PAYOFF: ${JSON.stringify({hook:pkg.hook,payoff:pkg.payoff})}\nReturn the complete finalized package with exactly ${n} scenes.`;
   const result=await askGemini(system,user,packageSchema,"vizex_finalized_package",8192);
   if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:"Final package scene tidak lengkap."});
   return res.status(200).json(result);
  }
  if(action==="regenerate_scene"){
   const pkg=body.package||{},idx=Math.max(0,Math.min(n-1,Number(body.sceneIndex)||0));
   const draft=body.draft||{};
   const system=coreRules(n,dur)+`\nYou are revising ONLY scene ${idx+1}. Respect previous scene state/outfit and next scene continuity. Return exactly one scene object. The user's edited action/outfit is authoritative unless it breaks physical continuity; repair minimally.`;
   const user=`TITLE: ${title}\nSTYLE: ${style}\nLOCKED CHARACTER: ${character}\nSCENE INDEX: ${idx+1}/${n}\nPREVIOUS SCENE: ${JSON.stringify(pkg.scenes?.[idx-1]||null)}\nCURRENT ORIGINAL: ${JSON.stringify(pkg.scenes?.[idx]||null)}\nUSER EDIT DRAFT: ${JSON.stringify(draft)}\nNEXT SCENE: ${JSON.stringify(pkg.scenes?.[idx+1]||null)}\nRegenerate only this scene with synchronized state, current outfit, image prompt and video prompt.`;
   const scene=await askGemini(system,user,sceneSchema,"vizex_scene_revision",3072);return res.status(200).json({scene});
  }
  const system=coreRules(n,dur);
  const user=`TITLE:${title}
SCENES:${n}
DURATION:${dur}s
STYLE:${style}
IDENTITY:${character}
Generate one coherent package. Infer outfit from story context; saved outfit is fallback only.`;
  const result=await askGemini(system,user,packageSchema,"vizex_animation_package",8192);
  if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:`Gemini menghasilkan ${result.scenes?.length||0} scene, seharusnya ${n}. Coba generate lagi.`});
  return res.status(200).json(result);
 }catch(err){console.error(err);return res.status(500).json({error:err?.message||"Generator gagal."})}
}
