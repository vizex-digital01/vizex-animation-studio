import {auth} from "../lib/_auth.js";
const schema={type:"object",properties:{ideas:{type:"array",items:{type:"object",properties:{title:{type:"string"},hook:{type:"string"},visual_hook:{type:"string"},payoff:{type:"string"}},required:["title","hook","visual_hook","payoff"]}}},required:["ideas"]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export default async function handler(req,res){
  // V6_AUTH_GUARD
  const sessionUser=await auth(req); if(!sessionUser) return res.status(401).json({error:"Unauthorized"});
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.GEMINI_API_KEY)return res.status(500).json({error:"GEMINI_API_KEY belum terpasang di Vercel."});
 try{
  const {topic,audience,count,history}=req.body||{},niche=String(topic||"").trim(),target=String(audience||"").trim(),n=Math.max(1,Math.min(30,Number(count)||10));
  if(!niche)return res.status(400).json({error:"TOPIK / NICHE kosong."});
  const old=Array.isArray(history)?history.slice(-100).map(String):[];
  const prompt=`You are Vizex Studio's premium short-form content idea director.
NICHE/WORLD: ${niche}
TARGET AUDIENCE: ${target||"general audience"}
EXACT IDEA COUNT: ${n}
Treat the niche as a WORLD/CONTEXT to explore, NOT a topic to explain. Explore different places, routines, activities, people, objects, times, problems, emotions, interactions, failures, successes, awkward moments, surprises, and specific lived experiences.
Return EXACTLY ${n} DISTINCT ideas in natural Indonesian. Each idea contains ONLY: title, hook, visual_hook, payoff.
title = specific clickable natural story title, not generic advice/listicle.
hook = one short curiosity/emotion hook.
visual_hook = concrete 0–3 second opening visual showing a specific action/situation.
payoff = direct story consequence/reveal, no CTA.
No scripts, narration, captions, hashtags, CTA, explanations, reasoning, or extra fields.
Ideas must be meaningfully different, concrete, and genuinely inside "${niche}".
Do not repeat or closely imitate previous titles: ${old.length?old.join(" | "):"(none)"}.
If target audience exists, make situations recognizable to them without repeating the audience label in every title.`;
  const models=[process.env.GEMINI_MODEL||"gemini-3.8-flash","gemini-3.7-flash","gemini-3.5-flash-lite"].filter((x,i,a)=>a.indexOf(x)===i);
  let data=null,lastStatus=502,lastError="Semua model Gemini sedang tidak tersedia.";
  for(const model of models){
   for(let attempt=0;attempt<3;attempt++){
    const rr=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":process.env.GEMINI_API_KEY},body:JSON.stringify({contents:[{role:"user",parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",responseSchema:schema,temperature:1,maxOutputTokens:8192}})});
    data=await rr.json().catch(()=>({}));if(rr.ok)break;lastStatus=rr.status;lastError=data?.error?.message||`Gemini API error (${rr.status}).`;
    if((rr.status===429||rr.status>=500)&&attempt<2){await sleep(700*(2**attempt));continue}break;
   }
   if(data?.candidates?.[0]?.content?.parts?.some(p=>p?.text))break;
  }
  const raw=data?.candidates?.[0]?.content?.parts?.map(p=>p?.text||"").join("").trim();
  if(!raw)return res.status(lastStatus).json({error:`${lastError} Vizex sudah mencoba model cadangan otomatis.`});
  const parsed=JSON.parse(raw),ideas=Array.isArray(parsed.ideas)?parsed.ideas:[];
  if(ideas.length!==n)return res.status(502).json({error:`AI menghasilkan ${ideas.length} ide, seharusnya ${n}. Coba generate lagi.`});
  return res.status(200).json({ideas});
 }catch(err){console.error(err);return res.status(500).json({error:err?.message||"Generator ide AI gagal."})}
}