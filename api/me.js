import { auth } from "./_auth.js";
export default function handler(req,res){
  const u=auth(req);
  if(!u) return res.status(401).json({error:"Unauthorized"});
  return res.status(200).json({email:u.email,name:u.name,plan:u.plan});
}
