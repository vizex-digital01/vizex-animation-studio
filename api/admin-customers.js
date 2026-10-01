import {auth,hashPassword} from "../lib/_auth.js";
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
   const action=String(req.body?.action||"");
   if(action==="create"){
    const name=String(req.body?.name||"").trim().slice(0,120);
    const email=String(req.body?.email||"").trim().toLowerCase().slice(0,180);
    const password=String(req.body?.password||"");
    const plan=String(req.body?.plan||"PRO").trim().toUpperCase().slice(0,40)||"PRO";
    const max_devices=Math.max(1,Math.min(10,Number(req.body?.max_devices)||1));
    if(!name)return res.status(400).json({error:"Nama customer wajib diisi"});
    if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:"Email customer tidak valid"});
    if(password.length<8)return res.status(400).json({error:"Password minimal 8 karakter"});
    const exists=await db(`customers?email=eq.${q(email)}&select=id&limit=1`);
    if(exists?.length)return res.status(409).json({error:"Email sudah terdaftar"});
    const inserted=await db("customers",{method:"POST",body:{email,name,password_hash:hashPassword(password),plan,status:"active",max_devices},headers:{Prefer:"return=representation"}});
    const customer=inserted?.[0];
    if(!customer)return res.status(500).json({error:"Customer gagal dibuat"});
    return res.status(201).json({ok:true,customer:{id:customer.id,email:customer.email,name:customer.name,plan:customer.plan,status:customer.status,max_devices:customer.max_devices}});
   }
   const id=String(req.body?.customer_id||"");
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
   }else return res.status(400).json({error:"Action tidak dikenal"});
   return res.status(200).json({ok:true});
  }
  return res.status(405).json({error:"Method not allowed"});
 }catch(e){return res.status(500).json({error:e.message})}
}
