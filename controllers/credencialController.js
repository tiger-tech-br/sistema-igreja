const model=require('../models/membroModel');
const service=require('../services/credencialService');
exports.gerar=async (req,res,next) => {
    try {
        if(!/^[1-9]\d{0,9}$/.test(req.params.id)) return res.sendStatus(400);
        const m=await model.buscarPorId(req.params.id);
        if(!m || !m.email_verificado || !m.consent_at || m.consent_revoked_at) return res.status(404).json({success:false,message:'Credencial indisponível.'});
        await service.gerarCredencial(m,res);
    } catch(error) {next(error);}
};
