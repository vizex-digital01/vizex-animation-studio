const sceneSchema={type:"object",additionalProperties:false,properties:{function:{type:"string"},start_state:{type:"string"},action:{type:"string"},end_state:{type:"string"},camera:{type:"string"},outfit:{type:"string"},outfit_change_reason:{type:"string"},image_prompt:{type:"string"},video_prompt:{type:"string"}},required:["function","start_state","action","end_state","camera","outfit","outfit_change_reason","image_prompt","video_prompt"]};
const packageSchema={type:"object",additionalProperties:false,properties:{title:{type:"string"},hook:{type:"string"},payoff:{type:"string"},narration:{type:"string"},caption:{type:"string"},cover_text:{type:"string"},cover_prompt:{type:"string"},scenes:{type:"array",items:sceneSchema}},required:["title","hook","payoff","narration","caption","cover_text","cover_prompt","scenes"]};
async function askGroq(system,user,schema,name,max=9000){
 const model=process.env.GROQ_MODEL||"openai/gpt-oss-20b";
 const rr=await fetch("https://api.groq.com/openai/v1/chat/completions",{
  method:"POST",
  headers:{"Authorization":`Bearer ${process.env.GROQ_API_KEY}`,"Content-Type":"application/json"},
  body:JSON.stringify({
   model,
   messages:[{role:"system",content:system},{role:"user",content:user}],
   response_format:{type:"json_schema",json_schema:{name,strict:true,schema}},
   max_completion_tokens:max,
   reasoning_effort:"low"
  })
 });
 const d=await rr.json();
 if(!rr.ok){
  const msg=d?.error?.message||"Groq API error.";
  const failed=String(d?.error?.failed_generation||"").trim();
  const schemaFail=/schema|failed_generation|does not match/i.test(msg);
  if(schemaFail){
   const repairSystem=system+`\n\nCRITICAL JSON REPAIR: Your previous output failed the required JSON schema. Return the COMPLETE object again. Do not omit any required property. For every scene include non-empty function, start_state, action, end_state, camera, outfit, outfit_change_reason, image_prompt, and video_prompt.`;
   const repairUser=user+(failed?`\n\nPREVIOUS INVALID OUTPUT TO REPAIR:\n${failed}`:"");
   const retry=await fetch("https://api.groq.com/openai/v1/chat/completions",{
    method:"POST",
    headers:{"Authorization":`Bearer ${process.env.GROQ_API_KEY}`,"Content-Type":"application/json"},
    body:JSON.stringify({
     model,
     messages:[{role:"system",content:repairSystem},{role:"user",content:repairUser}],
     response_format:{type:"json_schema",json_schema:{name,strict:true,schema}},
     max_completion_tokens:max,
     reasoning_effort:"low"
    })
   });
   const rd=await retry.json();
   if(!retry.ok)throw new Error(rd?.error?.message||msg);
   const repaired=rd?.choices?.[0]?.message?.content?.trim();
   if(!repaired)throw new Error("Groq tidak mengembalikan output setelah perbaikan schema.");
   return JSON.parse(repaired);
  }
  throw new Error(msg);
 }
 const raw=d?.choices?.[0]?.message?.content?.trim();
 if(!raw)throw new Error("Groq tidak mengembalikan output.");
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
PROMPT RULES — PRODUCTION DETAIL:
- The TITLE is the single source of truth. First build one causal story from the title, then derive every scene, narration, image prompt, video prompt, caption and cover from that SAME story. Never add a random subplot just to make a prompt richer.
- EVERY scene object MUST include ALL nine fields with non-empty strings: function, start_state, action, end_state, camera, outfit, outfit_change_reason, image_prompt, video_prompt. Never omit end_state or any other required field.\n- Each image_prompt is ONE frozen frame only, normally 100-180 useful English words. Detail must come from the current storyboard state, not invented future events.
- Every image_prompt must naturally specify: exact visible character count; locked main-character identity and distinctive traits; exact CURRENT OUTFIT including colors/material/condition; pose and body language; current action frozen at one readable instant; exact relevant props and quantities; environment/location and spatial placement; time/weather when relevant; lighting direction/quality; composition; camera angle, shot size and lens feel; depth/background; the selected visual style/material rendering; vertical 9:16; continuity constraints; no watermark, no subtitles/text unless explicitly required, no duplicate people/props, no extra limbs.
- Do not write vague shortcuts such as "same as previous scene", "same character", or "same as image_prompt" inside a final image prompt. Restate the necessary visual continuity explicitly so each prompt can be used independently.
- Each video_prompt is normally 80-150 useful English words. Treat the scene image as FRAME ZERO, then describe a clean temporal progression: exact starting pose/state -> character motion -> prop/environment reaction -> camera movement -> pacing -> exact end pose/state that becomes the next continuity state.
- Video motion must animate ONLY the current scene beat. No new person, object, clothing, location, knowledge, damage, food quantity, weather change or payoff may appear unless the storyboard introduces it in THIS scene.
- Never use the shortcut "same as image_prompt". Restate the critical character, outfit, prop and environment state needed to keep video generation consistent.
- For outfit-change scenes, clearly show the physically plausible transition. Before the change, keep the old outfit; after the change, carry the new outfit forward exactly. Wet/dirty/torn is a condition of the same outfit, not a new outfit.
- Image/video/cover prompts are ENGLISH. Story states/actions, outfit_change_reason, narration, caption, hook, payoff and cover_text are natural INDONESIAN. outfit can be concise English for prompt consistency.
NARRATION RULES:
- Narration is a continuous first-person spoken story in natural Indonesian, casual gue/lo style when suitable. It must retell the SAME causal events in scene order and match what viewers actually see.
- Do NOT merely list scenes. Connect beats naturally with cause/effect and transitions such as "awalnya", "pas", "ternyata", "gara-gara itu", "akhirnya", etc. Vary wording; do not mechanically repeat these examples.
- If a scene introduces a person, object, outfit change, problem, discovery or payoff, narration may mention it only at that point or later—never before it visually exists.
- Do not contradict quantities, locations, actions, outfit state, character state or ending shown by the storyboard.
- Never expose production/engine language in narration: no "scene", "prompt", "karakter utama", "frame", "timeline", "continuity", "tampilkan", or generation instructions.
- Narration fits about ${dur} seconds; target about ${Math.round(dur*2.15)} Indonesian spoken words (±15%). It should have a hook, smooth middle escalation, clear payoff, then exactly ONE short contextual CTA that feels connected to the story rather than generic engagement bait.
- Caption is not a copy of narration. Write a substantial social-media caption in natural Indonesian: normally 80-140 words, about 2-4 short paragraphs, unless the story truly needs less. Do not make it a one-liner.
- Caption should expand the feeling/context of the SAME story without retelling every scene beat-by-beat. Keep it easy to read on a phone.
- End the caption with exactly ONE contextual CTA, and VARY the CTA wording/intent between generations. Choose naturally from patterns such as: ask for the viewer's experience, invite an opinion, ask which moment they relate to, invite them to tag/share with a relevant friend, ask what they would do, or invite a short comment. Do not mechanically repeat the same CTA phrase.
- The caption CTA must be DIFFERENT from the narration CTA and must fit the title/story. Avoid generic engagement bait unrelated to the story.
- Cover text is short, intriguing, truthful, and does not spoil the ending.
- Visual format 9:16. No watermark/logo/subtitles in scene images.
QUALITY GATE BEFORE RETURNING JSON:
- Silently verify chronological causality from Scene 1 through Scene ${n}.
- Verify every scene start_state follows the previous end_state.
- Verify visible-person counts and prop quantities do not jump without an on-screen cause.
- Verify identity never changes and outfit changes only at justified story beats.
- Verify image prompts are detailed standalone frozen frames and video prompts are detailed motion instructions, not short summaries.
- Verify narration, caption and cover describe the same title/story and do not reveal events early.
- If any check fails, repair it before returning JSON.`}
export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.GROQ_API_KEY)return res.status(500).json({error:"GROQ_API_KEY belum terpasang di Vercel."});
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
   const result=await askGroq(system,user,packageSchema,"vizex_finalized_package",10000);
   if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:"Final package scene tidak lengkap."});
   return res.status(200).json(result);
  }
  if(action==="regenerate_scene"){
   const pkg=body.package||{},idx=Math.max(0,Math.min(n-1,Number(body.sceneIndex)||0));
   const draft=body.draft||{};
   const system=coreRules(n,dur)+`\nYou are revising ONLY scene ${idx+1}. Respect previous scene state/outfit and next scene continuity. Return exactly one scene object. The user's edited action/outfit is authoritative unless it breaks physical continuity; repair minimally.`;
   const user=`TITLE: ${title}\nSTYLE: ${style}\nLOCKED CHARACTER: ${character}\nSCENE INDEX: ${idx+1}/${n}\nPREVIOUS SCENE: ${JSON.stringify(pkg.scenes?.[idx-1]||null)}\nCURRENT ORIGINAL: ${JSON.stringify(pkg.scenes?.[idx]||null)}\nUSER EDIT DRAFT: ${JSON.stringify(draft)}\nNEXT SCENE: ${JSON.stringify(pkg.scenes?.[idx+1]||null)}\nRegenerate only this scene with synchronized state, current outfit, image prompt and video prompt.`;
   const scene=await askGroq(system,user,sceneSchema,"vizex_scene_revision",4500);return res.status(200).json({scene});
  }
  const system=coreRules(n,dur);
  const user=`TITLE: ${title}\nSCENES: ${n}\nDURATION: ${dur} seconds\nVISUAL STYLE: ${style}\nLOCKED MAIN CHARACTER IDENTITY + BASE OUTFIT REFERENCE: ${character}\nImportant: treat the outfit inside the character description only as a BASE REFERENCE, not an eternal outfit lock. Build a logical outfit timeline from the title and scene events. Generate the complete production package now.`;
  const result=await askGroq(system,user,packageSchema,"vizex_animation_package",10000);
  if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:`Groq menghasilkan ${result.scenes?.length||0} scene, seharusnya ${n}. Coba generate lagi.`});
  return res.status(200).json(result);
 }catch(err){console.error(err);return res.status(500).json({error:err?.message||"Generator gagal."})}
}
