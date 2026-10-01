const sceneSchema={type:"OBJECT",properties:{function:{type:"STRING"},start_state:{type:"STRING"},action:{type:"STRING"},end_state:{type:"STRING"},camera:{type:"STRING"},outfit:{type:"STRING"},outfit_change_reason:{type:"STRING"},image_prompt:{type:"STRING"},video_prompt:{type:"STRING"}},required:["function","start_state","action","end_state","camera","outfit","outfit_change_reason","image_prompt","video_prompt"]};
const packageSchema={type:"OBJECT",properties:{title:{type:"STRING"},hook:{type:"STRING"},payoff:{type:"STRING"},narration:{type:"STRING"},caption:{type:"STRING"},cover_text:{type:"STRING"},cover_prompt:{type:"STRING"},scenes:{type:"ARRAY",items:sceneSchema}},required:["title","hook","payoff","narration","caption","cover_text","cover_prompt","scenes"]};
async function askGemini(system,user,schema,name,max=9000){
 const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";
 const prompt=`${system}\n\n${user}`;
 const rr=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",responseSchema:schema,temperature:0.8,maxOutputTokens:max}})});
 const d=await rr.json();
 if(!rr.ok)throw new Error(d?.error?.message||"Gemini API error.");
 const raw=(d?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||"").join("").trim();
 if(!raw){const reason=d?.candidates?.[0]?.finishReason||d?.promptFeedback?.blockReason||"unknown";throw new Error(`Gemini tidak mengembalikan output (${reason}).`)}
 return JSON.parse(raw);
}
function coreRules(n,dur){return `You are the story director and prompt architect for Vizex Studio. The title is the source of truth.
STORY RULES:
- Exactly ${n} chronological scenes: cause -> reaction -> escalation -> payoff. No unrelated subplot.
- Scene N may know ONLY events that happened through Scene N. Never leak future people, props, payoff or ending into earlier images.
- Physical state carries forward. No teleporting, duplication or reset. Consumables stay the same or decrease unless explicitly replenished.
- Supporting people appear only when the current beat introduces them.
CHARACTER + OUTFIT ENGINE:
- Lock immutable identity across every scene: same person, hairstyle/hair color, body proportions, skin/material treatment, distinctive details, face/faceless setting and accessories that are identity-defining.
- Clothing is a SEPARATE story state. Do NOT blindly keep the base outfit forever.
- Infer the most logical clothing from TITLE + location + time + activity. Examples: sleeping can use sleepwear; school uses school uniform when the character has actually changed; office uses workwear; rain changes the SAME outfit to wet unless a real clothing change occurs.
- Outfit may change ONLY when the story logically requires or explicitly shows a clothing change. Until that moment, copy the previous scene outfit exactly.
- After a clothing change, lock the NEW outfit exactly into later scenes until another justified change happens.
- Never change clothes just to create visual variety. Never silently change color, shoes, pants, top, accessories, fabric, or pattern between consecutive scenes.
- outfit must describe the EXACT clothing visible in that scene. outfit_change_reason must be short Indonesian. Use "TIDAK BERUBAH" when copied from previous scene.
- If the current scene is the clothing-change beat, make the action and prompts physically clear and non-contradictory.
PROMPT RULES:
- Each image_prompt is ONE frozen frame only and explicitly includes the exact CURRENT OUTFIT.
- Each video_prompt uses that scene image as frame zero, animates ONLY the current beat, and preserves that outfit unless THIS scene explicitly changes clothing.
- Image/video/cover prompts are ENGLISH. Story states/actions, outfit_change_reason, narration, caption, hook, payoff and cover_text are natural INDONESIAN. outfit can be concise English for prompt consistency.
- Narration is a continuous first-person spoken story, natural gue/lo style when suitable, retelling the SAME events in scene order.
- Never expose production/engine language in narration.
- Narration fits about ${dur} seconds; target about ${Math.round(dur*2.15)} Indonesian spoken words (±15%), ending with ONE contextual varied CTA.
- Caption is not a copy of narration. Write a substantial social-media caption in natural Indonesian: normally 80-140 words, about 2-4 short paragraphs, unless the story truly needs less. Do not make it a one-liner.
- Caption should expand the feeling/context of the SAME story without retelling every scene beat-by-beat. Keep it easy to read on a phone.
- End the caption with exactly ONE contextual CTA, and VARY the CTA wording/intent between generations. Choose naturally from patterns such as: ask for the viewer's experience, invite an opinion, ask which moment they relate to, invite them to tag/share with a relevant friend, ask what they would do, or invite a short comment. Do not mechanically repeat the same CTA phrase.
- The caption CTA must be DIFFERENT from the narration CTA and must fit the title/story. Avoid generic engagement bait unrelated to the story.
- Cover text is short, intriguing, truthful, and does not spoil the ending.
- Visual format 9:16. No watermark/logo/subtitles in scene images.`}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.GEMINI_API_KEY)return res.status(500).json({error:"GEMINI_API_KEY belum terpasang di Vercel."});
 try{
  const body=req.body||{}, action=String(body.action||"generate");
  const title=String(body.title||"").trim(),character=String(body.character||"").trim(),style=String(body.style||"3D Vinyl Toy");
  const n=Math.max(3,Math.min(10,Number(body.sceneCount)||5)),dur=[15,30,45,60].includes(Number(body.duration))?Number(body.duration):30;
  if(!title)return res.status(400).json({error:"Judul kosong."});if(!character)return res.status(400).json({error:"Karakter belum dipilih."});
  if(action==="finalize"){
   const pkg=body.package||{};
   if(!Array.isArray(pkg.scenes)||pkg.scenes.length!==n)return res.status(400).json({error:"Storyboard belum lengkap."});
   const system=coreRules(n,dur)+`\nFINALIZATION MODE: The supplied storyboard scene actions and outfit timeline are authoritative. Rebuild synchronized start/end states, image/video prompts, narration, caption and cover around them. Preserve the user's intended actions and outfit choices unless they are physically impossible; repair only the minimum needed for continuity. Do not silently revert an edited outfit.`;
   const user=`TITLE: ${title}\nSTYLE: ${style}\nLOCKED CHARACTER: ${character}\nEDITED STORYBOARD: ${JSON.stringify(pkg.scenes)}\nORIGINAL HOOK/PAYOFF: ${JSON.stringify({hook:pkg.hook,payoff:pkg.payoff})}\nReturn the complete finalized package with exactly ${n} scenes.`;
   const result=await askGemini(system,user,packageSchema,"vizex_finalized_package",10000);
   if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:"Final package scene tidak lengkap."});
   return res.status(200).json(result);
  }
  if(action==="regenerate_scene"){
   const pkg=body.package||{},idx=Math.max(0,Math.min(n-1,Number(body.sceneIndex)||0));
   const draft=body.draft||{};
   const system=coreRules(n,dur)+`\nYou are revising ONLY scene ${idx+1}. Respect previous scene state/outfit and next scene continuity. Return exactly one scene object. The user's edited action/outfit is authoritative unless it breaks physical continuity; repair minimally.`;
   const user=`TITLE: ${title}\nSTYLE: ${style}\nLOCKED CHARACTER: ${character}\nSCENE INDEX: ${idx+1}/${n}\nPREVIOUS SCENE: ${JSON.stringify(pkg.scenes?.[idx-1]||null)}\nCURRENT ORIGINAL: ${JSON.stringify(pkg.scenes?.[idx]||null)}\nUSER EDIT DRAFT: ${JSON.stringify(draft)}\nNEXT SCENE: ${JSON.stringify(pkg.scenes?.[idx+1]||null)}\nRegenerate only this scene with synchronized state, current outfit, image prompt and video prompt.`;
   const scene=await askGemini(system,user,sceneSchema,"vizex_scene_revision",4500);return res.status(200).json({scene});
  }
  const system=coreRules(n,dur);
  const user=`TITLE: ${title}\nSCENES: ${n}\nDURATION: ${dur} seconds\nVISUAL STYLE: ${style}\nLOCKED MAIN CHARACTER IDENTITY + BASE OUTFIT REFERENCE: ${character}\nImportant: treat the outfit inside the character description only as a BASE REFERENCE, not an eternal outfit lock. Build a logical outfit timeline from the title and scene events. Generate the complete production package now.`;
  const result=await askGemini(system,user,packageSchema,"vizex_animation_package",10000);
  if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:`Gemini menghasilkan ${result.scenes?.length||0} scene, seharusnya ${n}. Coba generate lagi.`});
  return res.status(200).json(result);
 }catch(err){console.error(err);return res.status(500).json({error:err?.message||"Generator gagal."})}
}
