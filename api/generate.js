const sceneSchema={type:"object",additionalProperties:false,properties:{function:{type:"string"},start_state:{type:"string"},action:{type:"string"},end_state:{type:"string"},camera:{type:"string"},outfit:{type:"string"},outfit_change_reason:{type:"string"},image_prompt:{type:"string"},video_prompt:{type:"string"}},required:["function","start_state","action","end_state","camera","outfit","outfit_change_reason","image_prompt","video_prompt"]};
const packageSchema={type:"object",additionalProperties:false,properties:{title:{type:"string"},hook:{type:"string"},payoff:{type:"string"},narration:{type:"string"},caption:{type:"string"},cover_text:{type:"string"},cover_prompt:{type:"string"},scenes:{type:"array",items:sceneSchema}},required:["title","hook","payoff","narration","caption","cover_text","cover_prompt","scenes"]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function retryMs(msg,headers){
 const h=Number(headers?.get?.("retry-after"));
 if(Number.isFinite(h)&&h>0)return Math.min(12000,Math.max(400,h*1000));
 const m=String(msg||"").match(/try again in\s*([\d.]+)\s*(ms|s)/i);
 if(m){const v=Number(m[1]);return Math.min(12000,Math.max(400,m[2].toLowerCase()==="s"?v*1000:v))}
 return 1800;
}
async function groqCall(payload){
 return fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Authorization":`Bearer ${process.env.GROQ_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});
}
async function askGroq(system,user,schema,name,max=3200){
 const model=process.env.GROQ_MODEL||"openai/gpt-oss-20b";
 const payload={model,messages:[{role:"system",content:system},{role:"user",content:user}],response_format:{type:"json_schema",json_schema:{name,strict:true,schema}},max_completion_tokens:max,reasoning_effort:"low"};
 let rr=await groqCall(payload),d=await rr.json();
 if(rr.status===429){
  await sleep(retryMs(d?.error?.message,rr.headers));
  rr=await groqCall(payload);d=await rr.json();
 }
 if(!rr.ok){
  const msg=d?.error?.message||"Groq API error.";
  const failed=String(d?.error?.failed_generation||"").trim();
  if(/schema|failed_generation|does not match/i.test(msg)){
   const repair={...payload,messages:[{role:"system",content:system+"\nReturn complete valid JSON. Never omit required fields; every scene needs function,start_state,action,end_state,camera,outfit,outfit_change_reason,image_prompt,video_prompt."},{role:"user",content:user+(failed?`\nRepair this invalid attempt:\n${failed.slice(0,6000)}`:"")}]};
   let r2=await groqCall(repair),d2=await r2.json();
   if(r2.status===429){await sleep(retryMs(d2?.error?.message,r2.headers));r2=await groqCall(repair);d2=await r2.json()}
   if(!r2.ok)throw new Error(d2?.error?.message||msg);
   const fixed=d2?.choices?.[0]?.message?.content?.trim();
   if(!fixed)throw new Error("Groq tidak mengembalikan output setelah repair.");
   return JSON.parse(fixed);
  }
  throw new Error(msg);
 }
 const raw=d?.choices?.[0]?.message?.content?.trim();
 if(!raw)throw new Error("Groq tidak mengembalikan output.");
 return JSON.parse(raw);
}
function coreRules(n,dur){return `You direct Vizex short-form stories. TITLE is absolute source of truth.
STORY: exactly ${n} chronological scenes with clear cause -> reaction -> escalation -> payoff. Scene N knows only events already introduced. State, people, props, quantities, damage/wetness and location carry forward; nothing teleports, duplicates, resets or appears early.
IDENTITY: keep the same physical character identity, hair, proportions, distinctive traits and face/faceless setting.
OUTFIT: infer Scene 1 clothes from title + place + time + role + activity. Saved character outfit is fallback only. Later scenes copy the current outfit until a visible/logical story event changes it. Wet/dirty/torn is a condition of the same outfit and persists realistically. Never change clothes for variety. outfit_change_reason is Indonesian; use "TIDAK BERUBAH" only when garment and relevant condition truly carry forward.
SCENE JSON: every scene MUST contain non-empty function,start_state,action,end_state,camera,outfit,outfit_change_reason,image_prompt,video_prompt.
IMAGE PROMPT: English, standalone frozen frame, about 80-130 useful words. Include exact visible-person count, locked identity, exact current outfit+condition, pose/action, relevant props+quantities, environment/spatial placement, time/light when relevant, composition, camera/shot/lens feel, depth, visual style, vertical 9:16, continuity constraints, no watermark/subtitles/duplicates/extra limbs. Never say "same as previous".
VIDEO PROMPT: English, about 60-100 useful words. Restate critical identity/outfit/props/environment. Describe frame-zero state -> current beat motion -> object/environment reaction -> camera motion -> exact end state. Animate only this scene; introduce nothing early. Never say "same as image_prompt".
NARRATION: Indonesian, first-person conversational creator voice; natural gue/lo when suitable. Same events and order as visuals, with cause/effect and believable emotion. Do not list every movement or sound like a report. Vary sentence rhythm/transitions. No production words such as scene,prompt,frame,timeline,karakter utama. Target about ${Math.round(dur*2.05)} spoken words (±15%) for ${dur}s. End after payoff with ONE short contextual CTA.
CAPTION: Indonesian, same story but not copied narration, 80-130 words in 2-4 short paragraphs. End with exactly ONE contextual CTA different from narration CTA; vary between experience/opinion/relatable moment/tag-share/what-would-you-do.
COVER: English visual prompt; Indonesian short cover_text; intriguing, truthful, no ending spoiler.
FINAL CHECK: causality; previous end_state -> next start_state; people/prop counts; identity; outfit+condition continuity; narration matches visuals; no future leakage. Repair silently before JSON.`}
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
   const result=await askGroq(system,user,packageSchema,"vizex_finalized_package",3600);
   if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:"Final package scene tidak lengkap."});
   return res.status(200).json(result);
  }
  if(action==="regenerate_scene"){
   const pkg=body.package||{},idx=Math.max(0,Math.min(n-1,Number(body.sceneIndex)||0));
   const draft=body.draft||{};
   const system=coreRules(n,dur)+`\nYou are revising ONLY scene ${idx+1}. Respect previous scene state/outfit and next scene continuity. Return exactly one scene object. The user's edited action/outfit is authoritative unless it breaks physical continuity; repair minimally.`;
   const user=`TITLE: ${title}\nSTYLE: ${style}\nLOCKED CHARACTER: ${character}\nSCENE INDEX: ${idx+1}/${n}\nPREVIOUS SCENE: ${JSON.stringify(pkg.scenes?.[idx-1]||null)}\nCURRENT ORIGINAL: ${JSON.stringify(pkg.scenes?.[idx]||null)}\nUSER EDIT DRAFT: ${JSON.stringify(draft)}\nNEXT SCENE: ${JSON.stringify(pkg.scenes?.[idx+1]||null)}\nRegenerate only this scene with synchronized state, current outfit, image prompt and video prompt.`;
   const scene=await askGroq(system,user,sceneSchema,"vizex_scene_revision",1400);return res.status(200).json({scene});
  }
  const system=coreRules(n,dur);
  const user=`TITLE:${title}
SCENES:${n}
DURATION:${dur}s
STYLE:${style}
IDENTITY:${character}
Generate one coherent package. Infer outfit from story context; saved outfit is fallback only.`;
  const result=await askGroq(system,user,packageSchema,"vizex_animation_package",3600);
  if(!Array.isArray(result.scenes)||result.scenes.length!==n)return res.status(502).json({error:`Groq menghasilkan ${result.scenes?.length||0} scene, seharusnya ${n}. Coba generate lagi.`});
  return res.status(200).json(result);
 }catch(err){console.error(err);return res.status(500).json({error:err?.message||"Generator gagal."})}
}
