const ideaItem={type:"object",additionalProperties:false,properties:{
 title:{type:"string"},hook:{type:"string"},visual_hook:{type:"string"},payoff:{type:"string"}
},required:["title","hook","visual_hook","payoff"]};
const ideaSchema={type:"object",additionalProperties:false,properties:{
 ideas:{type:"array",items:ideaItem}
},required:["ideas"]};

export default async function handler(req,res){
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.GROQ_API_KEY)return res.status(500).json({error:"GROQ_API_KEY belum terpasang di Vercel."});
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
  const rr=await fetch("https://api.groq.com/openai/v1/chat/completions",{
   method:"POST",
   headers:{"Authorization":`Bearer ${process.env.GROQ_API_KEY}`,"Content-Type":"application/json"},
   body:JSON.stringify({
    model:process.env.GROQ_MODEL||"openai/gpt-oss-20b",
    messages:[{role:"system",content:system},{role:"user",content:user}],
    response_format:{type:"json_schema",json_schema:{name:"vizex_varied_ideas",strict:true,schema:ideaSchema}},
    max_completion_tokens:8000,
    reasoning_effort:"low"
   })
  });
  const d=await rr.json();
  if(!rr.ok)return res.status(rr.status).json({error:d?.error?.message||"Groq API error."});
  const raw=d?.choices?.[0]?.message?.content?.trim();
  if(!raw)return res.status(502).json({error:"Groq tidak mengembalikan ide."});
  const result=JSON.parse(raw);
  if(!Array.isArray(result.ideas)||!result.ideas.length)return res.status(502).json({error:"Format ide Groq tidak valid."});
  return res.status(200).json({ideas:result.ideas.slice(0,n)});
 }catch(err){
  console.error(err);
  return res.status(500).json({error:err?.message||"Generator ide gagal."});
 }
}
