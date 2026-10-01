const ideaItem={type:"object",additionalProperties:false,properties:{
 title:{type:"string"},hook:{type:"string"},visual_hook:{type:"string"},payoff:{type:"string"}
},required:["title","hook","visual_hook","payoff"]};
const ideaSchema={type:"object",additionalProperties:false,properties:{
 ideas:{type:"array",items:ideaItem}
},required:["ideas"]};

export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.GEMINI_API_KEY)return res.status(500).json({error:"GEMINI_API_KEY belum terpasang di Vercel."});
 try{
  const {topic,audience,count,history}=req.body||{};
  const niche=String(topic||"").trim();
  const target=String(audience||"").trim();
  const n=Math.max(5,Math.min(30,Number(count)||10));
  if(!niche)return res.status(400).json({error:"Topik / niche kosong."});
  const old=Array.isArray(history)?history.slice(-120).map(String):[];
  const system=`You are Vizex Studio's creative idea director. Generate highly varied short-form visual story ideas in natural Indonesian.
CORE PRINCIPLE:
- NICHE/TOPIC is only the WORLD or context where stories happen. Do NOT force every title to explain, mention, teach, or literally name the niche.
- TARGET AUDIENCE is only a relatability lens. Do NOT put the audience label into every title or hook.
DIVERSITY RULES:
- Return exactly ${n} ideas.
- Every idea in this batch must feel materially different in situation, location, activity, object, social interaction, emotion, conflict, and payoff.
- Deliberately spread ideas across comedy, nostalgia, awkward moments, friendship, light mystery, daily routine, surprise, failure, lucky accident, small conflict, wholesome moments, POV situations, unexpected objects/events, before-after, and relatable observations when appropriate.
- Do not make all ideas educational, motivational, nostalgic, or problem-solution.
- Avoid formulaic repeated title structures such as "hal yang...", "momen yang...", "ketika...", or repeatedly naming the niche.
- Titles must be concrete, visual, specific, and suitable to become a 3-10 scene animation.
- Avoid near-duplicates of PREVIOUS TITLES. Change the underlying event, not merely wording.
- Hook must create curiosity without spoiling payoff.
- visual_hook must describe an instantly readable first 0-3 seconds.
- payoff must give a satisfying consequence/reveal/emotional turn that belongs to the same story.
- No hashtags. No production jargon.`;
  const user=`WORLD / NICHE: ${niche}
TARGET AUDIENCE (optional lens): ${target||"not specified"}
PREVIOUS TITLES TO AVOID:
${old.length?old.map((x,i)=>`${i+1}. ${x}`).join("\n"):"None yet."}

Create exactly ${n} fresh ideas now.`;
  const clean=x=>{if(Array.isArray(x))return x.map(clean);if(!x||typeof x!=="object")return x;const o={};for(const [k,v] of Object.entries(x))if(k!=="additionalProperties")o[k]=clean(v);return o};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const call=async model=>fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:user}]}],generationConfig:{maxOutputTokens:3000,responseMimeType:"application/json",responseSchema:clean(ideaSchema),thinkingConfig:{thinkingLevel:"low"}}})
  });
  let model=process.env.GEMINI_IDEAS_MODEL||process.env.GEMINI_MODEL||"gemini-3.8-flash";
  let rr=await call(model),d=await rr.json();
  if(rr.status===429||rr.status===503){await sleep(1200);rr=await call(model);d=await rr.json()}
  if((rr.status===429||rr.status===503)&&model!=="gemini-3.7-flash"){
   model="gemini-3.7-flash"; await sleep(900); rr=await call(model); d=await rr.json();
  }
  if(!rr.ok)return res.status(rr.status).json({error:d?.error?.message||"Gemini sedang sibuk. Coba lagi sebentar."});
  const raw=d?.candidates?.[0]?.content?.parts?.map(x=>x?.text||"").join("").trim();
  if(!raw)return res.status(502).json({error:"Gemini tidak mengembalikan ide."});
  const result=JSON.parse(raw.replace(/^```json\\s*/i,"").replace(/```$/,"").trim());
  if(!Array.isArray(result.ideas)||!result.ideas.length)return res.status(502).json({error:"Format ide Gemini tidak valid."});
  return res.status(200).json({ideas:result.ideas.slice(0,n)});
 }catch(err){
  console.error(err);
  return res.status(500).json({error:err?.message||"Generator ide gagal."});
 }
}
