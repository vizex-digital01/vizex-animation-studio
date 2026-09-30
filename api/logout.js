export default function handler(req,res){
  res.setHeader("Set-Cookie","vizex_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure");
  return res.status(200).json({ok:true});
}
