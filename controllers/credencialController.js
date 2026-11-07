const model=require('../models/membroModel');
const service=require('../services/credencialService');
const {memberHasAccess}=require('../services/memberAccessService');
exports.gerar=async (req,res,next) => {
    try {
        if(!/^[1-9]\d{0,9}$/.test(req.params.id)) return res.sendStatus(400);
        const m=await model.buscarPorId(req.params.id);
        if(!memberHasAccess(m) || !m.consent_at || m.consent_revoked_at) return res.status(404).json({success:false,message:'Credencial indisponível.'});
        await service.gerarCredencial(m,res);
    } catch(error) {next(error);}
};
