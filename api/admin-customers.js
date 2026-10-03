import {auth} from "../lib/_auth.js";
import {db,q} from "../lib/_db.js";
function isAdmin(u){return String(u?.plan||"").toUpperCase()==="ADMIN"||String(process.env.ADMIN_EMAILS||"").toLowerCase().split(",").map(x=>x.trim()).includes(String(u?.email||"").toLowerCase())}
export default async function handler(req,res){
 try{
  const u=await auth(req,{touch:req.method!=="POST"});
  if(!u)return res.status(401).json({error:"Unauthorized"});
  if(!isAdmin(u))return res.status(403).json({error:"Admin only"});
  if(req.method==="GET"){
   const users=await db("customers?select=id,email,name,plan,status,max_devices,created_at&order=created_at.desc");
   const sessions=await db(`customer_sessions?expires_at=gt.${q(new Date().toISOString())}&select=customer_id`);
   const counts={};for(const s of sessions||[])counts[s.customer_id]=(counts[s.customer_id]||0)+1;
   return res.status(200).json({customers:(users||[]).map(x=>({...x,active_sessions:counts[x.id]||0}))});
  }
  if(req.method==="POST"){
   const id=String(req.body?.customer_id||"");const action=String(req.body?.action||"");
   if(!id)return res.status(400).json({error:"Customer tidak valid"});
   if(action==="status"){
    const value=req.body?.value==="active"?"active":"blocked";
    await db(`customers?id=eq.${q(id)}`,{method:"PATCH",body:{status:value,updated_at:new Date().toISOString()},headers:{Prefer:"return=minimal"}});
    if(value!=="active")await db(`customer_sessions?customer_id=eq.${q(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
   }else if(action==="max_devices"){
    const n=Math.max(1,Math.min(10,Number(req.body?.value)||1));
    await db(`customers?id=eq.${q(id)}`,{method:"PATCH",body:{max_devices:n,updated_at:new Date().toISOString()},headers:{Prefer:"return=minimal"}});
   }else if(action==="revoke_all"){
    await db(`customer_sessions?customer_id=eq.${q(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
   }else if(action==="delete"){
    if(String(id)===String(u.id))return res.status(400).json({error:"Akun admin yang sedang dipakai tidak bisa dihapus."});
    await db(`customer_sessions?customer_id=eq.${q(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
    await db(`customers?id=eq.${q(id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
   }else return res.status(400).json({error:"Action tidak dikenal"});
   return res.status(200).json({ok:true});
  }
  return res.status(405).json({error:"Method not allowed"});
 }catch(e){return res.status(500).json({error:e.message})}
}
