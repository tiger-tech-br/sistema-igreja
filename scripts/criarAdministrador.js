require('dotenv').config({quiet:true});
const bcrypt=require('bcrypt');
const pool=require('../database/connection');
const {passwordValid}=require('../utils/security');
async function main() {
    const nome=process.env.ADMIN_NAME, email=process.env.ADMIN_EMAIL?.trim().toLowerCase(), senha=process.env.ADMIN_PASSWORD;
    if (!nome || !/^[A-Za-zÀ-ÿ\s]{3,100}$/.test(nome) || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !passwordValid(senha)) {
        throw new Error('Configure ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD (12 caracteres a 72 bytes) no ambiente seguro.');
    }
    const hash=await bcrypt.hash(senha,12);
    if(process.argv.includes('--rotate')) {
        const result=await pool.query('UPDATE administradores SET senha=$1,auth_version=auth_version+1 WHERE LOWER(email)=$2 RETURNING id',[hash,email]);
        if(!result.rowCount) throw new Error('Administrador não encontrado.');
    } else {
        await pool.query('INSERT INTO administradores(nome,email,senha) VALUES($1,$2,$3)',[nome,email,hash]);
    }
    console.log('Administrador configurado. Remova ADMIN_PASSWORD do ambiente após o uso.');
}
main().catch(() => {console.error('Não foi possível configurar o administrador. Confira as variáveis e se a conta já existe; --rotate altera a senha de uma conta existente.');process.exitCode=1;}).finally(()=>pool.end());
