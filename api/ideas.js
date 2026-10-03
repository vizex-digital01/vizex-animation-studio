import {auth} from "../lib/_auth.js";
const sceneIdeaSchema={type:"object",additionalProperties:false,properties:{
 scene_number:{type:"integer"},location:{type:"string"},characters:{type:"string"},action:{type:"string"},main_object:{type:"string"},event:{type:"string"}
},required:["scene_number","location","characters","action","main_object","event"]};
const ideaItem={type:"object",additionalProperties:false,properties:{
 id:{type:"integer"},title:{type:"string"},hook:{type:"string"},scene_count:{type:"integer"},
 scenes:{type:"array",items:sceneIdeaSchema},payoff:{type:"string"},content_angle:{type:"string"},visual_hook:{type:"string"}
},required:["id","title","hook","scene_count","scenes","payoff","content_angle","visual_hook"]};
const ideaSchema={type:"object",additionalProperties:false,properties:{
 request:{type:"object",additionalProperties:false,properties:{
  topic:{type:"string"},niche:{type:"string"},target_audience:{type:"string"},number_of_ideas:{type:"integer"}
 },required:["topic","niche","target_audience","number_of_ideas"]},
 ideas:{type:"array",items:ideaItem}
},required:["request","ideas"]};

const cleanSchema=x=>{if(Array.isArray(x))return x.map(cleanSchema);if(!x||typeof x!=="object")return x;const o={};for(const [k,v] of Object.entries(x))if(k!=="additionalProperties")o[k]=cleanSchema(v);return o};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function parseJson(raw){
 const c=String(raw||"").trim().replace(/^```json\s*/i,"").replace(/```$/,"").trim();
 try{return JSON.parse(c)}catch{}
 const a=c.indexOf("{"),b=c.lastIndexOf("}");
 if(a>=0&&b>a){try{return JSON.parse(c.slice(a,b+1))}catch{}}
 return null;
}

export default async function handler(req,res){
 const account=await auth(req).catch(()=>null);
 if(!account)return res.status(401).json({error:"Sesi login tidak valid."});
 if(String(account.plan||"PRO").toUpperCase()==="FREE")return res.status(403).json({error:"Generator Ide tersedia untuk akun PRO."});
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 if(!process.env.GEMINI_API_KEY)return res.status(500).json({error:"GEMINI_API_KEY belum terpasang di Vercel."});
 try{
  const {topic,niche,audience,count,reference,theme,history}=req.body||{};
  const topicText=String(topic||niche||"").trim();
  const nicheText=String(niche||topic||"").trim();
  const target=String(audience||"").trim();
  const themeText=String(theme||"").trim();
  const refText=String(reference||"").trim();
  const n=Math.max(1,Math.min(10,Number(count)||10));
  if(!nicheText)return res.status(400).json({error:"Topik / niche kosong."});
  const old=Array.isArray(history)?history.slice(-120).map(String):[];

  const system=`Kamu adalah AI Content Idea Generator yang bertugas menghasilkan ide konten storytelling pendek yang menarik, relatable, memiliki alur kejadian yang jelas, dan mudah divisualisasikan.

TUJUAN:
Buat ide storytelling berdasarkan niche, target audience, tema, referensi, dan riwayat ide user.

ATURAN REFERENSI:
Jangan terpaku pada contoh/referensi. Referensi hanya untuk memahami POLA, GAYA, JENIS KEJADIAN, tingkat humor, relatability, jumlah scene, dan jenis ending. Jangan menyalin judul, karakter, kejadian, konflik, atau ending.

PEMAHAMAN NICHE & AUDIENCE:
Sebelum membuat ide, pahami niche sebagai dunia nyata: orang/role, lokasi, rutinitas, benda, kebiasaan, aturan sosial, masalah kecil, humor, nostalgia, awkward moment, konflik, dan detail yang dikenali orang dalam niche tersebut.
Target audience adalah sudut pandang. Pilih situasi, stakes, humor, bahasa, emosi, konflik, dan payoff yang membuat mereka merasa "gue banget", "pernah ngalamin", ingin komentar, share, atau mengingat pengalaman sendiri.
Jangan hanya menempel nama niche/target pada ide generik.

FORMAT KONTEN:
Semua ide adalah STORYTELLING dengan 1-5 SCENE.
- Ada kejadian jelas, awal, perkembangan, dan akhir.
- Setiap scene terhubung; scene berikutnya melanjutkan scene sebelumnya.
- Harus ada konflik kecil, masalah, kejadian lucu, kejutan ringan, kesalahpahaman, kebiasaan unik, atau situasi relatable.
- Bukan kumpulan aktivitas biasa.
- Cocok untuk video pendek, mudah divisualisasikan, sedikit lokasi/karakter, dan terasa mungkin terjadi di dunia nyata.
Gunakan jumlah scene sesuai kebutuhan:
1 = kejadian sangat sederhana.
2 = setup -> payoff.
3 = setup -> masalah -> payoff.
4 = setup -> masalah -> perkembangan -> payoff.
5 = setup -> masalah -> perkembangan -> titik utama -> payoff.
Jangan memaksakan 5 scene.

JENIS IDE:
Utamakan kejadian sehari-hari yang relatable, lucu, tidak terduga, konflik kecil, kebiasaan unik, salah paham, penasaran, nostalgia jika relevan, dan ending memuaskan.
Pola seperti kehilangan barang, salah ambil, lupa, gagal mencoba, keisengan, berebut, menunggu, terlambat, salah tempat/waktu, menemukan sesuatu, menyembunyikan sesuatu, pura-pura tidak tahu, terganggu, atau kejadian biasa menjadi kacau BOLEH dipakai tetapi jangan dibatasi pola tersebut. Cari pola baru yang native dengan niche.

HOOK:
Setiap ide wajib punya hook singkat, natural, menarik sejak awal, dan tidak clickbait berlebihan.
Hindari "Hari ini saya akan...", "Pada video kali ini...", "Jadi guys...", "Ini adalah cerita tentang...".
Variasikan konstruksi. Contoh gaya hanya sebagai pola: "Awalnya gue cuma mau...", "Kirain bakal biasa aja...", "Gue baru sadar setelah...", "Niatnya cuma sebentar...", "Masalahnya dimulai dari...". Jangan mengulang template hook yang sama.

JUDUL:
Spesifik, menarik, mudah dipahami, menggambarkan kejadian utama, tidak terlalu panjang, tidak clickbait. Hindari judul generik seperti "Kehidupan Sehari-hari" atau "Keseruan di...".

VISUAL STORYTELLING:
Setiap scene harus menjelaskan location, characters, action, main_object, dan event agar langsung berguna sebagai dasar ilustrasi/video AI.
Jaga karakter, pakaian, objek penting, waktu, dan lokasi tetap masuk akal. Jangan pindah lokasi tanpa alasan atau memasukkan objek yang tidak berhubungan.

KREATIVITAS:
- Jangan generik, jangan mengulang ide lama, dan jangan cuma mengganti kata.
- Utamakan situasi spesifik dan kejadian kecil yang relatable.
- Variasikan humor, nostalgia, konflik ringan, absurd yang masih masuk akal, kejadian tak terduga, wholesome, awkward.
- Tidak semua ending berupa moral; tidak semua sedih.
- Ending wajib punya payoff.
- Jangan membesarkan konflik jika tema kehidupan sehari-hari.
- Jangan terasa seperti iklan.
- Jangan masukkan AI, bisnis, atau produk jika tidak relevan.
- Gunakan detail khas lingkungan niche secara masuk akal.
- Riwayat judul adalah HARD ANTI-REPEAT: premise lama tidak boleh dibuat ulang dengan wording baru.

PERSONAL BRANDING:
Jika konteksnya personal branding, prioritaskan cerita yang menunjukkan karakter, pengalaman, sudut pandang, kehidupan nyata, dan kedekatan dengan audience tanpa terasa menjual.

QUALITY CHECK:
Sebelum mengembalikan setiap ide, cek: niche-native, relevan untuk audience, spesifik, berbeda dari ide lain/riwayat, visualizable, scene berkesinambungan, dan payoff berasal dari cerita yang sama.

OUTPUT:
Return ONLY valid JSON matching the response schema. No markdown, no code fence, no explanation.
visual_hook harus berupa visual konkret 0-3 detik pertama dan konsisten dengan Scene 1.
scene_count harus sama dengan jumlah object dalam scenes.`;

  const user=`INPUT USER
Topik: ${topicText}
Niche: ${nicheText}
Target audience: ${target||"Tidak ditentukan"}
Tema: ${themeText||"Bebas, tetap relevan dengan niche"}
Jumlah ide: ${n}
Referensi: ${refText||"Tidak ada"}

RIWAYAT JUDUL YANG WAJIB DIHINDARI:
${old.length?old.map((x,i)=>`${i+1}. ${x}`).join("\n"):"Belum ada."}

Buat tepat ${n} ide storytelling baru berdasarkan semua aturan di atas.`;

  const models=[process.env.GEMINI_IDEAS_MODEL,"gemini-3.8-flash","gemini-3.7-flash","gemini-3.6-flash","gemini-3.5-flash-lite"].filter((v,i,a)=>v&&a.indexOf(v)===i);
  let last="Gemini sedang sibuk.";
  for(const model of models){
   const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
   const payload={systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts:[{text:user}]}],generationConfig:{maxOutputTokens:8192,responseMimeType:"application/json",responseSchema:cleanSchema(ideaSchema),thinkingConfig:{thinkingLevel:"low"}}};
   const rr=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   const d=await rr.json();
   if(rr.ok){
    const raw=d?.candidates?.[0]?.content?.parts?.map(x=>x?.text||"").join("").trim();
    let result=parseJson(raw);
    if(!result){
     const repair={systemInstruction:{parts:[{text:"Repair the supplied content into ONLY valid JSON matching the response schema. Do not add explanation."}]},contents:[{role:"user",parts:[{text:"Repair this JSON:\\n"+raw}]}],generationConfig:{maxOutputTokens:8192,responseMimeType:"application/json",responseSchema:cleanSchema(ideaSchema),thinkingConfig:{thinkingLevel:"low"}}};
     const r2=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(repair)});
     const d2=await r2.json();
     if(r2.ok)result=parseJson(d2?.candidates?.[0]?.content?.parts?.map(x=>x?.text||"").join(""));
    }
    if(result&&Array.isArray(result.ideas)&&result.ideas.length){
     result.ideas=result.ideas.slice(0,n).map((x,i)=>({...x,id:i+1,scene_count:Array.isArray(x.scenes)?x.scenes.length:Number(x.scene_count)||1}));
     return res.status(200).json(result);
    }
    last=`Output ${model} belum menjadi JSON valid setelah repair.`;
    await sleep(500); continue;
   }
   last=d?.error?.message||last;
   if([429,500,502,503,504,400,403,404].includes(rr.status)){await sleep(700);continue}
   break;
  }
  return res.status(503).json({error:last+" Semua model Gemini cadangan sudah dicoba."});
 }catch(err){console.error(err);return res.status(500).json({error:err?.message||"Generator ide gagal."})}
}
