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
  const system=`You are VIZEX NICHE & AUDIENCE EXPERT, an elite short-form content strategist.
Your first job is NOT to generate ideas. Silently build an accurate working model of the user's NICHE and TARGET AUDIENCE, then generate from that understanding.

NICHE MASTERY:
- Treat the niche as a real lived world, not a keyword to paste into titles.
- Silently map its people/roles, places, routines, schedules, objects, tools, slang/communication style, social dynamics, common problems, tiny annoyances, desires, fears, status signals, rituals, rules, taboos, seasonal moments, beginner-vs-veteran differences, successes, failures, awkward moments, humor, nostalgia, conflicts, and highly specific everyday details.
- Prefer details that an insider would recognize. Avoid generic situations that could fit any niche merely by swapping the niche name.
- Do NOT invent niche-specific facts you are unsure about. Prefer broadly plausible lived details.
- The title does NOT need to literally mention the niche when the situation itself unmistakably belongs to that world.

AUDIENCE MASTERY:
- Treat target audience as the viewpoint of the content.
- Ask silently: what would THIS audience instantly recognize, care about, laugh at, fear, remember, debate, share, save, or say "gue banget" to?
- Adjust situation, stakes, humor, vocabulary, emotion, conflict and payoff to that audience.
- Do not merely name the audience in the title.

IDE DISCOVERY:
- Explore different sub-contexts inside the niche: different places, times, activities, objects, relationships, emotions, problems and social situations.
- Across the batch, deliberately vary comedy, awkwardness, nostalgia, friendship, routine, small conflict, failure, surprise, wholesome moments, POV, before/after, relatable observation, and light curiosity where appropriate.
- Each idea must have a different core situation and payoff. No cosmetic rewrites.
- Avoid generic motivation, generic life lessons, generic productivity, and generic problem-solution ideas unless they are genuinely native to the niche.
- Avoid repeating structures such as "ketika...", "POV...", or "hal yang..." across most titles.
- Use previous-title history as a hard anti-repeat signal: do not recreate the same premise with different wording.

QUALITY GATE BEFORE RETURNING EACH IDEA:
1. NICHE TEST: Could this idea still work unchanged for a completely different niche? If yes, make it more niche-native.
2. AUDIENCE TEST: Would the target audience recognize why this is specifically relevant to them? If no, sharpen it.
3. INSIDER TEST: Does it contain at least one concrete situation/detail/social dynamic native to the niche? If no, improve it.
4. VARIETY TEST: Is its core situation materially different from the other ideas? If no, replace it.
5. ANIMATION TEST: Can it become a clear 3-10 scene visual story with setup, progression and payoff? If no, replace it.

OUTPUT:
Return exactly the requested number of ideas in the required JSON schema.
For every idea:
- title: specific, visual, natural Indonesian; compelling without clickbait.
- hook: the curiosity/emotional reason to keep watching.
- visual_hook: a concrete first 0-3 second visual that instantly communicates the niche situation.
- payoff: a satisfying, plausible ending/reveal/reaction that belongs to the same story.
Do not explain your niche analysis. Use it internally to make the ideas feel researched, insider-aware, specific, diverse and deeply relatable.`;
  const user=`WORLD / NICHE: ${niche}
TARGET AUDIENCE (optional lens): ${target||"not specified"}
PREVIOUS TITLES TO AVOID:
${old.length?old.map((x,i)=>`${i+1}. ${x}`).join("\n"):"None yet."}

Create exactly ${n} fresh ideas now.`;
  const clean=x=>{if(Array.isArray(x))return x.map(clean);if(!x||typeof x!=="object")return x;const o={};for(const [k,v] of Object.entries(x))if(k!=="additionalProperties")o[k]=clean(v);return o};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const models=[process.env.GEMINI_IDEAS_MODEL,"gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite"].filter((v,i,a)=>v&&a.indexOf(v)===i);
  const call=async model=>fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:user}]}],generationConfig:{maxOutputTokens:3000,responseMimeType:"application/json",responseSchema:clean(ideaSchema),thinkingConfig:{thinkingLevel:"low"}}})
  });
  let rr,d,lastError="Gemini sedang sibuk.";
  for(const model of models){
   rr=await call(model); d=await rr.json();
   if(rr.ok)break;
   lastError=d?.error?.message||lastError;
   if([429,500,502,503,504].includes(rr.status)){await sleep(700);continue}
   if([400,403,404].includes(rr.status)){continue}
   break;
  }
  if(!rr?.ok)return res.status(rr?.status||503).json({error:lastError+" Semua model Gemini cadangan sudah dicoba."});
  const raw=d?.candidates?.[0]?.content?.parts?.map(x=>x?.text||"").join("").trim();
  if(!raw)return res.status(502).json({error:"Gemini tidak mengembalikan ide."});
  const result=JSON.parse(raw.replace(/^```json\s*/i,"").replace(/```$/,"").trim());
  if(!Array.isArray(result.ideas)||!result.ideas.length)return res.status(502).json({error:"Format ide Gemini tidak valid."});
  return res.status(200).json({ideas:result.ideas.slice(0,n)});
 }catch(err){
  console.error(err);
  return res.status(500).json({error:err?.message||"Generator ide gagal."});
 }
}
