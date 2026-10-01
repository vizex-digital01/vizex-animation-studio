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
CHARACTER + STORY OUTFIT ENGINE:
- Lock immutable physical identity across every scene: same person, hairstyle/hair color, body proportions, skin/material treatment, distinctive identity details and face/faceless setting.
- DO NOT treat clothing written in LOCKED MAIN CHARACTER as a mandatory wardrobe. It is only a fallback visual reference when the TITLE and story give no better contextual clue.
- BEFORE writing scenes, infer the character's logical starting outfit from the TITLE's situation, place, time, role and activity. Example logic: sleeping/just woke up -> sleepwear or believable home clothes; school day -> appropriate uniform only after/when getting ready; office/work -> workwear when actually going to work; sports -> sportswear when doing the activity; formal event -> formal clothing; relaxing at home -> casual homewear.
- The title/story decides the outfit; do not force an arbitrary white t-shirt, black pants, jeans, or other base clothes into every story.
- Outfit is a continuous STORY STATE. Scene 1 gets the contextually correct starting outfit. Scene N+1 copies Scene N's outfit exactly unless a visible/logical event changes clothing.
- A wardrobe change must have a story cause: getting dressed, changing after bathing, changing for school/work/event, replacing soaked/dirty clothes, disguise/costume, or another explicit causal beat. Never change clothes merely for visual variety.
- Clothing CONDITION is separate from wardrobe identity: wet, dirty, dusty, torn, stained, rolled sleeves, loosened tie, etc. If clothes become wet/dirty/damaged, carry that condition forward realistically. Do not magically become dry/clean between scenes.
- If the story naturally includes changing out of wet/dirty clothes, show that causal change at the correct beat and then lock the new outfit forward.
- outfit must state the exact visible clothes in that scene. outfit_change_reason must explain the STORY reason in natural Indonesian. Use "TIDAK BERUBAH" only when both garment identity and relevant condition truly carry forward.
- Never let outfit logic create a subplot that is not supported by the title.
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
NARRATION RULES — NATURAL SPOKEN INDONESIAN:
- Narration must sound like a real Indonesian creator casually telling ONE story, not reading a storyboard, report, checklist, or AI summary.
- Use natural conversational phrasing and rhythm. "Gue/lo" is allowed when it fits; contractions and everyday words are preferred over stiff formal wording.
- Open with a strong natural hook tied directly to the title/event. Then tell the events in the same chronological order viewers see them, using cause-and-effect rather than enumerating actions.
- Do not narrate every tiny visible movement. Mention only story-relevant actions, reactions, discoveries and consequences. Let obvious visuals speak for themselves.
- Vary sentence length. Use natural transitions only where they fit; do not mechanically repeat "awalnya", "lalu", "kemudian", "akhirnya" every scene.
- Avoid stiff phrases such as "saya kemudian", "pada saat itu", "karakter tersebut", "selanjutnya saya melakukan", or production language.
- The narration must match the title, storyboard, outfit state, props, people, location and payoff exactly. No event may be narrated before it happens visually.
- Give the speaker a believable reaction/emotion when supported by the story: panik, lega, malu, kesel, bingung, ngakak, kaget, etc., without inventing a new event.
- Narration fits about ${dur} seconds; target about ${Math.round(dur*2.15)} Indonesian spoken words (±15%). End after the payoff with exactly ONE short contextual CTA that sounds like part of the creator's voice, not generic engagement bait.
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
- Verify identity never changes. Verify Scene 1 outfit is inferred from the TITLE/story context, not blindly copied from the saved character reference. Verify later outfits follow scene causality and clothing condition persists realistically.
- Verify image prompts are detailed standalone frozen frames and video prompts are detailed motion instructions, not short summaries.
- Read narration aloud mentally: it must sound conversational, fluid and human, not like a scene list. Verify narration, caption and cover describe the same title/story and do not reveal events early.
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
  const user=`TITLE: ${title}\nSCENES: ${n}\nDURATION: ${dur} seconds\nVISUAL STYLE: ${style}\nLOCKED MAIN CHARACTER IDENTITY (physical identity is authoritative): ${character}\nIMPORTANT: any outfit mentioned inside this saved character description is NOT authoritative. First infer Scene 1 clothing from TITLE + situation + place + time + activity. Use the saved outfit only as fallback when the story gives no contextual wardrobe clue. Then carry outfit state causally through the scenes. Generate the complete production package now.`;
  const result=await askGroq(system,user,packageSchema,"vizex_animation_package",10000);
  if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:`Groq menghasilkan ${result.scenes?.length||0} scene, seharusnya ${n}. Coba generate lagi.`});
  return res.status(200).json(result);
 }catch(err){console.error(err);return res.status(500).json({error:err?.message||"Generator gagal."})}
}
