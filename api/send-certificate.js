const {parseJson}=require("./_auth");
module.exports=async(req,res)=>{
const b=await parseJson(req);
await fetch(process.env.DISCORD_WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:`Certificat: ${b.name}`})});
res.json({ok:true});
}