import { parseCustomers, sign } from "./_auth.js";

export default function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const email=String(req.body?.email||"").trim().toLowerCase();
  const code=String(req.body?.code||"").trim();

  const customers=parseCustomers();
  const user=customers.find(x=>
    String(x.email||"").toLowerCase()===email &&
    String(x.code||"")===code &&
    String(x.status||"active")==="active"
  );

  if(!user) return res.status(401).json({error:"Email / kode akses salah atau akun diblokir."});

  const token=sign({
    email:user.email,
    name:user.name||user.email,
    plan:user.plan||"PRO",
    exp:Date.now()+7*24*60*60*1000
  });

  res.setHeader("Set-Cookie",`vizex_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7*24*60*60}; Secure`);
  return res.status(200).json({ok:true});
}
