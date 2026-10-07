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

const narrationSchema={type:"object",additionalProperties:false,properties:{narration:{type:"string"}},required:["narration"]};
function wordCount(text){return String(text||"").trim().split(/\s+/).filter(Boolean).length}
function narrationRange(dur){
 return ({15:[30,35],30:[60,70],45:[90,105],60:[120,140]})[Number(dur)]||[60,70];
}
async function enforceNarrationDuration(result,dur,title){
 if(!result||typeof result!=="object")return result;
 const [min,max]=narrationRange(dur);
 let count=wordCount(result.narration);
 if(count>=min&&count<=max)return result;

 const scenes=Array.isArray(result.scenes)?result.scenes:[];
 const system=`You are Vizex's strict Indonesian voice-over duration editor.
Rewrite ONLY narration. Return JSON with exactly one field: narration.
The final narration MUST contain ${min}-${max} words total for a ${dur}-second video, including CTA words.
Count words before answering and rewrite until the count is inside that range.
Follow the supplied scenes in exact chronological order. Every person, object, action, reaction, consequence and payoff must already exist in the scenes.
Do not invent dialogue, backstory, objects, people or events.
Make the narration sound like one flowing casual Indonesian story using consistent gue/lo, not a scene list.
The FIRST sentence must remain a strong truthful 1-3 second hook based on the title and early scenes: curiosity gap, tension, relatable pain, contradiction, consequence tease, specific question, pattern interrupt, or unfinished cause-effect. No greetings, generic intro, unsupported clickbait or early payoff reveal.
Do not mention scene, camera, frame, prompt or video production.
Keep CTAs natural and inside the word budget: ${dur===15?"maximum 1 ending CTA":dur===30?"up to 2 short CTAs: one contextual mid-story CTA only if natural and one ending CTA":"2-3 short contextual CTAs distributed naturally without interrupting the story"}.
Do not stack generic like/comment/follow commands.`;

 const user=`TITLE: ${title}
DURATION: ${dur} seconds
REQUIRED WORD RANGE: ${min}-${max}
CURRENT NARRATION (${count} words): ${String(result.narration||"")}
SCENES: ${JSON.stringify(scenes)}
Rewrite the narration now.`;

 try{
   const fixed=await askGemini(system,user,narrationSchema,"vizex_narration_duration_fix",2048);
   const fixedCount=wordCount(fixed?.narration);
   if(fixed?.narration && fixedCount>=min && fixedCount<=max)result.narration=fixed.narration;
 }catch(e){
   console.error("Narration duration repair failed:",e);
 }
 return result;
}

function coreRules(n,dur,freePlan=false){return `You direct Vizex short-form stories. TITLE is absolute source of truth.
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
CAPTION V3: write a natural Indonesian social-media caption that stays 100% faithful to the finished scenes but is NOT a transcript of narration. Match caption depth to requested video duration: about 45-70 words for 15s, 70-100 for 30s, 90-125 for 45s, and 110-150 for 60s. Use 2-4 short mobile-friendly paragraphs. Start from a fresh angle such as reaction, relatable observation, mini-confession, joke, question or punchline. Include 2-3 distinct natural CTA opportunities when length permits: for example one opinion/relatable question and one share/save/tag/request-next-part CTA. For 15s keep it to 1-2 CTAs. Never stack generic engagement commands, never repeat narration CTA wording, and never invent people, events, dialogue, motivation, backstory or outcomes absent from the scenes. Add only a small set of relevant hashtags at the end.
CAMERA: camera field MUST be exactly ONE of these preset shot names only: Establishing Wide Shot, Wide Shot, Full Shot, Medium Shot, Medium Close-Up, Close-Up, Low Angle, High Angle, Top-Down, Side Shot, Front Shot, Back Shot, Over-the-Shoulder, Tracking Shot. Choose the preset that best communicates each scene; vary shots only when story readability benefits, not randomly. Do not add lens, lighting, movement, focal length, or explanations inside camera; those details belong in image_prompt/video_prompt.
COVER: English visual prompt; Indonesian short cover_text; intriguing, truthful, no ending spoiler.
FINAL CHECK BEFORE JSON: (1) title and payoff are the same story, (2) every action is possible from its start_state, (3) previous end_state -> next start_state, (4) people/prop/food quantities never jump, (5) identity stays locked, (6) outfit and wet/dirty/damage condition follow story causally, (7) camera is one allowed preset only, (8) narration contains ZERO unsupported person/object/event, follows scene order, and its total word count fits the requested duration including CTAs, (9) narration CTA count follows the duration rule and CTAs are naturally distributed, (10) caption is not a narration rewrite, contains ZERO unsupported facts, and uses varied contextual CTAs, (11) image/video prompts depict exactly their scene with no future leakage. Silently repair any failure before returning JSON.

PROMPT QUALITY TIER:
${freePlan ? `FREE / STANDARD:
IMAGE PROMPT must be concise, clear English, about 65-95 useful words. Include character identity, current outfit, visible action/pose, essential props, location, simple lighting, selected camera shot, visual style and vertical 9:16. Keep continuity correct, but do not add premium cinematography breakdowns, lens engineering, layered foreground/midground/background direction, micro-texture, detailed light shaping or advanced composition language.
VIDEO PROMPT must be concise English, about 50-80 useful words. State frame-zero setup, the main subject action, essential object/environment response, one simple camera movement and the end state. Keep identity/outfit/props consistent. No future leakage or random additions.` : `PRO / ADVANCED CINEMATIC:
IMAGE PROMPT must be 180-240 useful English words with dense, model-ready visual direction and no filler. Treat it like a professional image-generation brief. Lock exact character identity and facial traits; exact hairstyle; skin/material appearance; outfit, accessories and their current wet/dirty/damaged condition; facial expression and eye direction; head/shoulder/torso/hand/foot placement; exact frozen action instant; prop count, state, orientation and spatial relationship; foreground, midground and background separation; architecture/environment details that already exist in the story; time/weather/atmosphere; key/fill/rim/practical light source, direction, intensity relationship and believable shadow behavior; surface/material texture; color palette; composition, subject placement, negative space, leading lines when appropriate; selected shot and camera height/angle; believable focal-length/lens feel, perspective compression, focus plane, depth of field and bokeh only when useful; cinematic contrast and subject separation; exact requested visual style; vertical 9:16. Optimize wording for high-quality GPT/image models. Explicitly preserve continuity and forbid future events, extra people/props, duplicate subjects, anatomy errors, random text, logos, subtitles and watermarks.
VIDEO PROMPT must be 170-230 useful English words and read like a premium short-form image-to-video shot direction built for visual retention. Re-establish exact frame zero from this scene's image: identity, outfit/condition, body pose, props, environment and current story state. Then choreograph subject motion chronologically: gaze/expression change, head/torso/arm/hand/leg movement, prop interaction and physical cause/effect; secondary motion such as hair, fabric, steam, rain, dust, reflections or nearby objects only when supported. PRO CAMERA DYNAMICS: every scene should have purposeful visual progression instead of a static camera. Choose 1 primary camera move and, only when physically coherent, 1 subtle secondary evolution: slow/fast dolly-in, dolly-out reveal, lateral tracking, arc/orbit, pedestal rise/drop, crane/jib reveal, push-in with slight handheld urgency, controlled pull-back, over-the-shoulder drift, foreground parallax pass, rack-focus/reframe, or subject-following tracking. Match movement to story emotion: hook/tension may push or reveal; action may track; awkward/comedic beats may hold then subtly push; payoff may reveal, arc, or pull back. Specify direction, speed, acceleration/deceleration, camera height, stability, framing transition and parallax. Create a meaningful visual change within the shot roughly every 2-4 seconds through subject blocking, camera progression, focus shift or environmental motion, but NEVER add random movement just for spectacle. Avoid repeating the same camera move in consecutive scenes when another coherent move communicates the beat better. No chaotic whip-pans, fake cuts, impossible drone moves indoors, excessive shake, constant zooming or motion that breaks continuity. Describe focus behavior when useful, what remains static, and the exact final pose, prop state, framing and environment state so the next scene continues cleanly. Preserve believable physics and continuity. No morphing, teleporting, costume changes, random cuts, new objects/people, premature payoff, subtitles, logos or watermark.`}

NARRATION V4 — STRONG HOOK + DURATION + SCENE SYNC + MULTI CTA:
HOOK / FIRST 1-3 SECONDS: narration must open immediately with the strongest truthful hook supported by the title and early scenes. The first sentence should create an open loop, tension, curiosity, surprise, relatable pain, contradiction, consequence tease, or specific high-stakes question WITHOUT inventing facts and WITHOUT revealing the final payoff. Prefer concrete hooks tied to what is actually happening over generic intros. Do not start with greetings, channel introductions, "jadi guys", "di video kali ini", "pernah nggak sih" by default, vague motivational lines, or slow context dumping. The hook must naturally lead into Scene 1 and the next sentence must continue the same thought/story. Vary hook construction across generations: consequence-first teaser, unexpected problem, relatable frustration, curiosity gap, time-pressure setup, specific question, pattern interrupt, or an unfinished cause-effect statement. Never use clickbait unsupported by the scenes.
Write narration LAST, only after all scenes are final. The narration must follow the exact scene chronology from Scene 1 through the final scene and must sound like ONE continuous story, not disconnected scene summaries. Every narrated person, object, action, reaction, consequence and payoff must be visibly/story-supported by the corresponding scenes; never invent extra facts.

DURATION IS STRICT. Target a natural Indonesian voice-over speed of about 2.0-2.15 spoken words/second, INCLUDING CTA words:
- 15 seconds: 30-33 words total
- 30 seconds: 60-66 words total
- 45 seconds: 90-97 words total
- 60 seconds: 120-129 words total
Silently count/rewrite before returning JSON so narration fits the requested duration. Do not make a 15-second narration read like 30 seconds, and do not leave a 60-second narration too short.

SCENE SYNC: distribute narration across the full runtime in the same order as the scenes. Early narration must describe setup/early beats only; middle narration covers escalation/reaction; final narration covers payoff. Never reveal a later-scene event before its scene. Transitions must connect causally and naturally so the voice-over feels continuous when the visuals change.

CTA: use 2-3 SHORT, natural CTA moments when the duration allows, without breaking the story:
- 15s: 1 CTA maximum, near the ending.
- 30s: up to 2 CTAs: one very short contextual engagement line around the middle only if it fits, plus one ending CTA.
- 45s/60s: 2-3 CTAs spread naturally: a brief curiosity/opinion CTA after an appropriate beat, optionally a relatable/share/save CTA later, and a final contextual CTA after payoff.
CTAs must be short and included inside the duration word budget. They may ask opinion, prediction, relatable experience, either/or choice, tag/share/save, request a next part, or a story-specific question. Do NOT stack generic "like, comment, follow" commands, do not repeat the same CTA wording, and do not let a CTA introduce facts that are absent from scenes.

Use consistent casual Indonesian gue/lo. Keep narration concrete, conversational and easy to speak. Do not narrate camera production. Do not use stiff translated/AI prose.

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
  const title=String(body.title||"").trim(),character=String(body.character||"").trim(),style=String(body.style||"3D Vinyl Toy");
  const requestedScenes=Number(body.sceneCount)||5;
  const n=freePlan?3:Math.max(3,Math.min(10,requestedScenes)),dur=[15,30,45,60].includes(Number(body.duration))?Number(body.duration):30;
  if(!title)return res.status(400).json({error:"Judul kosong."});if(!character)return res.status(400).json({error:"Karakter belum dipilih."});
  if(action==="finalize"){
   const pkg=body.package||{};
   if(!Array.isArray(pkg.scenes)||pkg.scenes.length!==n)return res.status(400).json({error:"Storyboard belum lengkap."});
   const system=coreRules(n,dur,freePlan)+`\nFINALIZATION MODE: The supplied storyboard scene actions and outfit timeline are authoritative. Rebuild synchronized start/end states, image/video prompts, narration, caption and cover around them. Preserve the user's intended actions and outfit choices unless they are physically impossible; repair only the minimum needed for continuity. Do not silently revert an edited outfit.`;
   const user=`TITLE: ${title}\nSTYLE: ${style}\nLOCKED CHARACTER: ${character}\nEDITED STORYBOARD: ${JSON.stringify(pkg.scenes)}\nORIGINAL HOOK/PAYOFF: ${JSON.stringify({hook:pkg.hook,payoff:pkg.payoff})}\nReturn the complete finalized package with exactly ${n} scenes.`;
   let result=await askGemini(system,user,packageSchema,"vizex_finalized_package",8192);
   result=await enforceNarrationDuration(result,dur,title);
   if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:"Final package scene tidak lengkap."});
   return res.status(200).json(result);
  }
  if(action==="regenerate_scene"){
   if(freePlan)return res.status(403).json({error:"Regenerate Scene tersedia untuk akun PRO."});
   const pkg=body.package||{},idx=Math.max(0,Math.min(n-1,Number(body.sceneIndex)||0));
   const draft=body.draft||{};
   const system=coreRules(n,dur,freePlan)+`\nYou are revising ONLY scene ${idx+1}. Respect previous scene state/outfit and next scene continuity. Return exactly one scene object. The user's edited action/outfit is authoritative unless it breaks physical continuity; repair minimally.`;
   const user=`TITLE: ${title}\nSTYLE: ${style}\nLOCKED CHARACTER: ${character}\nSCENE INDEX: ${idx+1}/${n}\nPREVIOUS SCENE: ${JSON.stringify(pkg.scenes?.[idx-1]||null)}\nCURRENT ORIGINAL: ${JSON.stringify(pkg.scenes?.[idx]||null)}\nUSER EDIT DRAFT: ${JSON.stringify(draft)}\nNEXT SCENE: ${JSON.stringify(pkg.scenes?.[idx+1]||null)}\nRegenerate only this scene with synchronized state, current outfit, image prompt and video prompt.`;
   const scene=await askGemini(system,user,sceneSchema,"vizex_scene_revision",3072);return res.status(200).json({scene});
  }
  const system=coreRules(n,dur,freePlan);
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
