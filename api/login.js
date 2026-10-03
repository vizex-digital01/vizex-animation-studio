import {db,q} from "../lib/_db.js";
import {parseCustomers,hashPassword,verifyPassword,newToken,tokenHash,setSessionCookie} from "../lib/_auth.js";
export default async function handler(req,res){
 try{
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const email=String(req.body?.email||"").trim().toLowerCase();const password=String(req.body?.code||req.body?.password||"");const deviceId=String(req.body?.device_id||"").trim().slice(0,120);const deviceName=String(req.body?.device_name||"Perangkat").trim().slice(0,120);
  const action=String(req.body?.action||"login");
  if(action==="register_free"){
    const name=String(req.body?.name||"").trim().slice(0,80);
    if(!email||!password||!deviceId||!name)return res.status(400).json({error:"Nama, email, kode akses, dan perangkat wajib diisi."});
    if(password.length<8)return res.status(400).json({error:"Kode akses minimal 8 karakter."});
    const exists=await db(`customers?email=eq.${q(email)}&select=id&limit=1`);
    if(exists?.length)return res.status(409).json({error:"Email sudah terdaftar. Pilih PRO/Login untuk masuk."});
    const rows=await db("customers",{method:"POST",body:{email,name,password_hash:hashPassword(password),plan:"FREE",status:"active",max_devices:1},headers:{Prefer:"return=representation"}});
    const u=rows?.[0];if(!u)return res.status(500).json({error:"Gagal membuat akun FREE."});
    const token=newToken(),now=new Date(),nowIso=now.toISOString(),expires=new Date(now.getTime()+7*24*60*60*1000).toISOString();
    await db("customer_sessions",{method:"POST",body:{customer_id:u.id,device_id:deviceId,device_name:deviceName,session_token_hash:tokenHash(token),last_active:nowIso,expires_at:expires},headers:{Prefer:"return=minimal"}});
    setSessionCookie(res,token);return res.status(200).json({ok:true,plan:"FREE"});
  }
  if(!email||!password||!deviceId)return res.status(400).json({error:"Email, password, dan identitas perangkat wajib ada."});
  let users=await db(`customers?email=eq.${q(email)}&select=*&limit=1`);let user=users?.[0];
  if(!user){
    const legacy=parseCustomers().find(x=>String(x.email||"").toLowerCase()===email&&String(x.code||"")===password&&String(x.status||"active")==="active");
    if(!legacy)return res.status(401).json({error:"Email / password salah atau akun diblokir."});
    const inserted=await db("customers",{method:"POST",body:{email,name:legacy.name||legacy.email,password_hash:hashPassword(password),plan:legacy.plan||"PRO",status:"active",max_devices:Number(legacy.max_devices)||1},headers:{Prefer:"return=representation"}});user=inserted?.[0];
  }else if(user.status!=="active"||!verifyPassword(password,user.password_hash)) return res.status(401).json({error:"Email / password salah atau akun diblokir."});
  const now=new Date();const nowIso=now.toISOString();
  await db(`customer_sessions?expires_at=lt.${q(nowIso)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}}).catch(()=>{});
  const same=await db(`customer_sessions?customer_id=eq.${q(user.id)}&device_id=eq.${q(deviceId)}&select=id&limit=1`);
  const active=await db(`customer_sessions?customer_id=eq.${q(user.id)}&expires_at=gt.${q(nowIso)}&select=id,device_id`);
  if(!same?.length&&active.length>=Math.max(1,Number(user.max_devices)||1))return res.status(409).json({error:`Batas ${user.max_devices||1} perangkat aktif tercapai. Keluarkan perangkat lama dari Profil Customer.`});
  if(same?.length)await db(`customer_sessions?id=eq.${q(same[0].id)}`,{method:"DELETE",headers:{Prefer:"return=minimal"}});
  const token=newToken();const expires=new Date(now.getTime()+7*24*60*60*1000).toISOString();
  await db("customer_sessions",{method:"POST",body:{customer_id:user.id,device_id:deviceId,device_name:deviceName,session_token_hash:tokenHash(token),last_active:nowIso,expires_at:expires},headers:{Prefer:"return=minimal"}});
  setSessionCookie(res,token);return res.status(200).json({ok:true});
 }catch(e){console.error(e);return res.status(500).json({error:"Login server error: "+e.message})}
}
