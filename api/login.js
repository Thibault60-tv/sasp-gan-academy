const {parseJson,sign}=require("./_auth");
module.exports=async(req,res)=>{
const b=await parseJson(req);
if(b.username===process.env.ADMIN_USERNAME && b.password===process.env.ADMIN_PASSWORD){
const t=sign({role:"admin"},process.env.ADMIN_TOKEN_SECRET);
res.setHeader("Set-Cookie",`token=${t}; HttpOnly; Path=/`);
res.status(200).json({ok:true});
}else{res.status(401).json({ok:false});}
}