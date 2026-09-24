const router=require('express').Router();
const c=require('../controllers/adminController');
const admin=require('../middlewares/auth');
const limit=require('../middlewares/accountLimiter');
router.post('/admin/login',limit('admin-login',5),c.login);
router.post('/admin',admin,limit('admin-create',5),c.cadastrarAdministrador);
module.exports=router;
