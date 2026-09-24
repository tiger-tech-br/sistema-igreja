const bcrypt=require('bcrypt');
const model=require('../models/adminModel');
const {passwordValid}=require('../utils/security');
const validEmail=value => typeof value==='string' && value.length<=150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
exports.login=async (req,res,next) => {
    try {
        const email=typeof req.body?.email==='string' ? req.body.email.trim().toLowerCase() : '';
        const senha=req.body?.senha;
        if (!validEmail(email) || typeof senha!=='string' || !senha.length || Buffer.byteLength(senha)>72) return res.status(401).json({success:false,message:'E-mail ou senha inválidos.'});
        const a=await model.buscarPorEmail(email);
        if (!a || !await bcrypt.compare(senha,a.senha)) return res.status(401).json({success:false,message:'E-mail ou senha inválidos.'});
        req.session.regenerate(error => {
            if(error) return next(error);
            req.session.admin={id:a.id,nome:a.nome,authVersion:a.auth_version};
            req.session.save(error => error ? next(error) : res.json({success:true,message:'Login realizado com sucesso.'}));
        });
    } catch(error) {next(error);}
};
exports.cadastrarAdministrador=async (req,res,next) => {
    try {
        const {nome,email,senha}=req.body || {};
        if(typeof nome!=='string' || !/^[A-Za-zÀ-ÿ\s]{3,100}$/.test(nome) || !validEmail(email) || !passwordValid(senha)) return res.status(400).json({success:false,message:'Nome/e-mail inválido ou senha fora do limite de 12 caracteres a 72 bytes.'});
        await model.criarAdministrador(nome.trim(),email.trim().toLowerCase(),await bcrypt.hash(senha,12));
        res.status(201).json({success:true,message:'Administrador criado.'});
    } catch(error) { if(error.code==='23505') return res.status(409).json({success:false,message:'Não foi possível cadastrar este e-mail.'}); next(error);}
};
