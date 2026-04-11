const { supabaseRequest } = require("./_auth");

module.exports = async (req,res)=>{
  const id = req.query.id;

  const r = await supabaseRequest(`certificates?id=eq.${id}`,{method:"GET"});
  const data = await r.json();

  if(data.length){
    res.json({valid:true,name:data[0].name});
  }else{
    res.json({valid:false});
  }
};