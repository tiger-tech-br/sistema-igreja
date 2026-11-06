import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PresenceObserver } from '../src/presence-observer.js';
import { SavedSession } from '../../mobile-shared/session.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const script = fs.readFileSync(new URL('../src/main.js', import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'');
const renderer = fs.readFileSync(new URL('../../js/credencial-view.js', import.meta.url),'utf8').replace(/^export /gm,'');
const settle = async () => { for(let step=0;step<150;step++)await Promise.resolve(); };
const pending = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}; };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const refreshToken = 'rs1.' + 'r'.repeat(43);
const origin = 'https://igreja.example';

function keptRecord({ native = true, expiresAt = Date.now() + 30 * 86400000 } = {}) {
  return JSON.stringify({ version: 1, app: 'membro', serverUrl: origin,
    refreshExpiresAt: new Date(expiresAt).toISOString(), ...(native ? { refreshToken } : {}) });
}

function fixture(options={}) {
  const elements=new Map(), docHandlers=new Map(), windowHandlers=new Map(), nativeHandlers=new Map(), timers=new Map();
  const calls={login:0,qr:0,presence:[],credential:0,clear:0,minimize:0,refresh:[],logout:[],loginRequests:[],loads:0,saves:[],removes:0};
  const storage = options.storage || { raw: null };
  let sequence=0, revision=0, clock=Date.now();
  const member={id:'42',nome:'Ana de teste',cargo:'Membro',ministerio:'Louvor',matricula:'TEST-42',validade:'31/12/2027'};
  const schedule=(callback,delay)=>{const id=++sequence;timers.set(id,{callback,delay});return id;};
  const unschedule=id=>timers.delete(id);
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const handlers=new Map(), attributes=new Map();
    for(const item of match[2].matchAll(/([\w-]+)="([^"]*)"/g))attributes.set(item[1],item[2]);
    elements.set(match[3],{
      dataset:{},hidden:/\bhidden(?:\s|>|$)/.test(match[2]),textContent:'',value:'',disabled:false,
      checked:/\bchecked(?:\s|>|$)/.test(match[2]),
      type:attributes.get('type') || (match[1]==='button'?'submit':''),
      addEventListener:(name,callback)=>handlers.set(name,callback),
      setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name),
      removeAttribute(name){attributes.delete(name);if(name==='src')this.src='';},
      querySelector(selector){assert.equal(selector,'span');return this.label ||= {textContent:''};},
      async fire(name,event={}){return handlers.get(name)?.({preventDefault(){},...event});}
    });
  }
  const document={hidden:false,getElementById(id){assert.ok(elements.has(id),`Elemento existente: ${id}`);return elements.get(id);},addEventListener:(name,callback)=>docHandlers.set(name,callback)};
  class FakeApi {
    constructor(){this.token=null;}
    async login(email, senha, rememberMe){
      calls.login++; calls.loginRequests.push({email,senha,rememberMe});
      if(options.login) return options.login(email,senha,rememberMe,clock);
      return{token:'member-fixture',expiresAt:new Date(clock+7200000).toISOString(),membro:{id:member.id,nome:member.nome},
        ...(rememberMe?{refreshExpiresAt:new Date(clock+30*86400000).toISOString(),...(options.native?{refreshToken}:{})}:{})};
    }
    async refresh(token){
      calls.refresh.push(token);
      if(options.refresh)return options.refresh(token,clock,member);
      return{token:'restored-member-fixture',expiresAt:new Date(clock+7200000).toISOString(),
        membro:{id:member.id,nome:member.nome},refreshExpiresAt:JSON.parse(storage.raw)?.refreshExpiresAt};
    }
    async logout(token){calls.logout.push(token);return{loggedOut:true};}
    async qrCode(){calls.qr++;return options.qr?options.qr():{membro:{...member},qrDataUrl:png,cursor:String(revision)};}
    async presence(cursor){calls.presence.push(cursor);return options.presence?options.presence(cursor):{cursor:String(revision),confirmed:BigInt(revision)>BigInt(cursor),...(revision>Number(cursor)?{attendance:{periodo:'noite',data:'05/11/2026',horario:'19:42:00',alreadyRecorded:false}}:{})};}
    async credential(){calls.credential++;return options.credential?options.credential():{...member};}
    clear(){calls.clear++;this.token=null;}
  }
  const secure={
    async get(){if(options.loadGate)await options.loadGate.promise;return{value:storage.raw};},
    async set({value}){if(options.saveGate)await options.saveGate.promise;if(options.saveError)throw options.saveError;storage.raw=value;},
    async remove(){calls.removes++;storage.raw=null;}
  };
  const webStorage={
    getItem(){return storage.raw;},
    setItem(key,value){if(options.saveError)throw options.saveError;storage.raw=value;},
    removeItem(){calls.removes++;storage.raw=null;}
  };
  class FixtureSavedSession extends SavedSession {
    constructor(config){super({...config,secure,storage:webStorage,now:()=>clock});}
    load(){calls.loads++;return super.load();}
    save(access){calls.saves.push(access);return super.save(access);}
  }
  class FixtureObserver extends PresenceObserver {constructor(config){super({...config,schedule,unschedule});}}
  class ClockDate extends Date {constructor(...values){super(...(values.length?values:[clock]));}static now(){return clock;}}
  const context=vm.createContext({
    document,window:{addEventListener:(name,callback)=>windowHandlers.set(name,callback),matchMedia:()=>({matches:Boolean(options.reducedMotion)})},
    navigator:{onLine:true},Capacitor:{isNativePlatform:()=>Boolean(options.native)},
    registerPlugin:name=>{assert.equal(name,'SecureSession');return secure;},SavedSession:FixtureSavedSession,
    App:{async addListener(name,callback){nativeHandlers.set(name,callback);return{remove(){}};},async minimizeApp(){calls.minimize++;}},
    SERVER_URL:'https://igreja.example',MemberApi:FakeApi,PresenceObserver:FixtureObserver,
    setTimeout:schedule,clearTimeout:unschedule,Date:ClockDate,URL,console
  });
  vm.runInContext(renderer,context,{filename:'credencial-view.js'});
  vm.runInContext(script,context,{filename:'main.js'});
  return{
    elements,calls,timers,nativeHandlers,context,storage,
    confirm(){revision++;},advance(ms){clock+=ms;},
    async ready(){await settle();},
    async login(){await settle();elements.get('email').value='fixture@example.test';elements.get('senha').value='fixture-only';await elements.get('loginForm').fire('submit');await settle();},
    async loadImage(){elements.get('qrImage').onload?.();await settle();},
    async click(id){await elements.get(id).fire('click');await settle();},
    async tick(delay){const entry=[...timers.entries()].find(([,task])=>task.delay===delay);assert.ok(entry,`Timer de ${delay}ms agendado`);timers.delete(entry[0]);entry[1].callback();await settle();},
    async visibility(hidden){document.hidden=hidden;docHandlers.get('visibilitychange')?.();await settle();},
    async event(name,event={}){windowHandlers.get(name)?.(event);await settle();}
  };
}

test('QR próprio -> nova leitura real -> tela verde animada -> credencial compartilhada',async()=>{
  const screen=fixture();
  await screen.login();
  assert.equal(screen.elements.get('memberScreen').hidden,false);
  assert.equal(screen.elements.get('qrImage').hidden,true);
  assert.equal(screen.calls.credential,0);
  await screen.loadImage();
  assert.equal(screen.elements.get('qrImage').hidden,false);
  await screen.tick(0);
  assert.equal(screen.elements.get('confirmationScreen').hidden,true);
  screen.confirm();
  await screen.tick(2000);
  assert.equal(screen.elements.get('confirmationScreen').hidden,false);
  assert.equal(screen.elements.get('credentialScreen').hidden,true);
  assert.equal(screen.calls.credential,0);
  await screen.tick(1300);
  assert.equal(screen.elements.get('confirmationScreen').hidden,true);
  assert.equal(screen.elements.get('credentialScreen').hidden,false);
  assert.equal(screen.elements.get('credentialCard').hidden,false);
  assert.equal(screen.elements.get('credentialName').textContent,'Ana de teste');
  assert.equal(screen.elements.get('credentialValidity').textContent,'31/12/2027');
  assert.equal(screen.calls.credential,1);
  await screen.click('backQrButton');
  await screen.loadImage();
  await screen.tick(0);
  assert.deepEqual(screen.calls.presence,['0','0','1']);
  assert.equal(screen.elements.get('qrScreen').hidden,false);
  assert.equal(screen.elements.get('confirmationScreen').hidden,true);
});

test('background interrompe consultas e retoma o mesmo cursor sem nova apresentação',async()=>{
  const screen=fixture();
  await screen.login();await screen.loadImage();await screen.tick(0);
  await screen.visibility(true);
  assert.equal(screen.timers.size,1,'somente expiração da sessão continua agendada');
  screen.confirm();
  await screen.event('pagehide');
  await screen.visibility(false);
  await screen.tick(0);
  assert.equal(screen.calls.qr,1);
  assert.deepEqual(screen.calls.presence,['0','0']);
  assert.equal(screen.elements.get('confirmationScreen').hidden,false);
});

test('falha de conexão não confirma nem reinicia o cursor ao tentar novamente',async()=>{
  let fail=true;
  const screen=fixture({presence:async cursor=>{if(fail)throw new Error('Rede indisponível');return{cursor,confirmed:false};}});
  await screen.login();await screen.loadImage();await screen.tick(0);
  assert.equal(screen.elements.get('confirmationScreen').hidden,true);
  assert.equal(screen.elements.get('qrMessage').hidden,false);
  fail=false;
  await screen.click('retryQrButton');await screen.tick(0);
  assert.equal(screen.calls.qr,1);
  assert.deepEqual(screen.calls.presence,['0','0']);
  assert.equal(screen.elements.get('qrMessage').hidden,true);
});

test('cursor recusado prepara outra apresentação em vez de repetir a observação inválida',async()=>{
  let invalid=true;
  const screen=fixture({presence:async cursor=>{
    if(invalid){const error=new Error('Prepare novamente seu QR Code.');error.status=400;throw error;}
    return{cursor,confirmed:false};
  }});
  await screen.login();await screen.loadImage();await screen.tick(0);
  assert.equal(screen.elements.get('qrImage').hidden,true);
  assert.equal(screen.elements.get('retryQrButton').hidden,false);
  assert.equal(screen.timers.size,1,'observação inválida não fica repetindo consultas');
  invalid=false;screen.confirm();
  await screen.click('retryQrButton');await screen.loadImage();await screen.tick(0);
  assert.equal(screen.calls.qr,2);
  assert.deepEqual(screen.calls.presence,['0','1']);
  assert.equal(screen.elements.get('qrImage').hidden,false);
  assert.equal(screen.elements.get('confirmationScreen').hidden,true);
});

test('Sair ignora presença pendente, limpa QR e impede credencial de sessão anterior',async()=>{
  const gate=pending();
  const screen=fixture({presence:()=>gate.promise});
  await screen.login();await screen.loadImage();await screen.tick(0);
  const clearsBeforeLogout=screen.calls.clear;
  await screen.click('logoutButton');
  gate.resolve({cursor:'1',confirmed:true,attendance:{}});await settle();
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('confirmationScreen').hidden,true);
  assert.equal(screen.elements.get('qrImage').src,'');
  assert.equal(screen.elements.get('memberName').textContent,'');
  assert.equal(screen.calls.credential,0);
  assert.equal(screen.timers.size,0);
  assert.equal(screen.calls.clear,clearsBeforeLogout+1);
});

test('credencial recusada não recebe selo válida e permite voltar ao QR',async()=>{
  const screen=fixture({credential:async()=>{const error=new Error('Credencial expirada.');error.status=403;throw error;}});
  await screen.login();await screen.loadImage();screen.confirm();await screen.tick(0);await screen.tick(1300);
  assert.equal(screen.elements.get('credentialCard').hidden,true);
  assert.equal(screen.elements.get('credentialMessage').hidden,false);
  assert.equal(screen.elements.get('credentialMessage').textContent,'Credencial expirada.');
  await screen.click('backQrButton');await screen.loadImage();
  assert.equal(screen.elements.get('qrScreen').hidden,false);
});

test('Sair na confirmação cancela o efeito e a abertura da credencial',async()=>{
  const screen=fixture();await screen.login();await screen.loadImage();screen.confirm();await screen.tick(0);
  await screen.click('confirmationLogoutButton');
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.timers.size,0);
  assert.equal(screen.calls.credential,0);
});

test('acesso expirado no retorno do segundo plano elimina QR e exige login',async()=>{
  const screen=fixture();await screen.login();await screen.loadImage();await screen.visibility(true);
  screen.advance(7200000);await screen.visibility(false);
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('qrImage').src,'');
  assert.match(screen.elements.get('loginMessage').textContent,/expirou/);
});

test('redução de movimento usa efeito breve e Voltar do Android retorna ao QR',async()=>{
  const screen=fixture({reducedMotion:true,native:true});await screen.login();await screen.loadImage();screen.confirm();await screen.tick(0);
  await screen.tick(700);
  assert.equal(screen.elements.get('credentialScreen').hidden,false);
  await screen.nativeHandlers.get('backButton')();await settle();await screen.loadImage();
  assert.equal(screen.elements.get('qrScreen').hidden,false);
  assert.equal(screen.calls.login,1);
  await screen.nativeHandlers.get('backButton')();await settle();
  assert.equal(screen.calls.minimize,1);
});

test('renderer compartilhado evita HTML vindo dos dados e esconde cargo ausente',async()=>{
  const screen=fixture();
  const fields=Object.fromEntries(['name','role','roleArea','registration','validity'].map(key=>[key,{textContent:'',hidden:false}]));
  screen.context.renderCredential({nome:'<img src=x onerror=alert(1)>',cargo:null,matricula:'TEST',validade:'2027-12-31'},fields);
  assert.equal(fields.name.textContent,'<img src=x onerror=alert(1)>');
  assert.equal(fields.roleArea.hidden,true);
  assert.equal(fields.validity.textContent,'31/12/2027');
});

test('consulta pública continua usando o endpoint existente somente para ler a credencial',async()=>{
  const source=fs.readFileSync(new URL('../../admin/js/validar/validar.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'');
  const fields=Object.fromEntries(['nome','cargo','areaCargo','matricula','validade'].map(key=>[key,{textContent:'',hidden:false}]));
  const calls=[],alerts=[];
  let ready;
  const context=vm.createContext({
    document:{getElementById:id=>fields[id],addEventListener:(name,callback)=>{if(name==='DOMContentLoaded')ready=callback;}},
    window:{location:{search:'?id=42'}},URLSearchParams,console,alert:message=>alerts.push(message),
    fetch:async(url,options)=>{calls.push({url,options});return{json:async()=>({success:true,data:{id:'42',nome:'Ana',cargo:null,matricula:'TEST',validade:'31/12/2027'}})};}
  });
  vm.runInContext(renderer,context);
  vm.runInContext(source,context);
  ready();await settle();
  assert.deepEqual(calls,[{url:'/api/membros/validar/42',options:undefined}]);
  assert.equal(fields.nome.textContent,'Ana');
  assert.equal(fields.areaCargo.hidden,true);
  assert.equal(alerts.length,0);
});

test('Mantenha-me conectado starts unchecked and a normal login leaves no record for the next launch',async()=>{
  const screen=fixture({native:true});
  await screen.ready();
  assert.equal(screen.elements.get('rememberMe').checked,false);
  await screen.login();
  assert.equal(screen.calls.loginRequests[0].rememberMe,false);
  assert.equal(screen.calls.saves.length,0);
  assert.equal(screen.storage.raw,null);
  const reopened=fixture({native:true,storage:screen.storage});
  await reopened.ready();
  assert.equal(reopened.calls.refresh.length,0);
  assert.equal(reopened.elements.get('loginScreen').hidden,false);
});

test('a new Android launch restores the saved login without resending email or password',async()=>{
  const screen=fixture({native:true});
  screen.elements.get('rememberMe').checked=true;
  await screen.login();
  assert.equal(screen.calls.loginRequests[0].rememberMe,true);
  assert.equal(screen.calls.saves.length,1);
  assert.equal(JSON.parse(screen.storage.raw).refreshToken,refreshToken);
  for(const forbidden of ['fixture@example.test','fixture-only','member-fixture','senha','email']) {
    assert.equal(screen.storage.raw.includes(forbidden),false,forbidden);
  }
  const reopened=fixture({native:true,storage:screen.storage});
  await reopened.ready();
  assert.deepEqual(reopened.calls.refresh,[refreshToken]);
  assert.equal(reopened.calls.login,0);
  assert.equal(reopened.elements.get('email').value,'');
  assert.equal(reopened.elements.get('senha').value,'');
  assert.equal(reopened.elements.get('rememberMe').checked,true);
  assert.equal(reopened.elements.get('qrScreen').hidden,false);
  await reopened.loadImage();
  assert.equal(reopened.elements.get('qrImage').hidden,false);
  assert.equal(reopened.elements.get('confirmationScreen').hidden,true);
});

test('browser restart restores using a cookie marker without persisting the refresh secret',async()=>{
  const screen=fixture();
  screen.elements.get('rememberMe').checked=true;
  await screen.login();
  assert.equal('refreshToken' in JSON.parse(screen.storage.raw),false);
  const reopened=fixture({storage:screen.storage});
  await reopened.ready();
  assert.deepEqual(reopened.calls.refresh,[undefined]);
  assert.equal(reopened.calls.login,0);
  assert.equal(reopened.elements.get('qrScreen').hidden,false);
});

test('Sair deletes the remembered record, revokes its refresh token and prevents automatic login later',async()=>{
  const screen=fixture({native:true});
  screen.elements.get('rememberMe').checked=true;
  await screen.login();await screen.loadImage();
  await screen.click('logoutButton');
  assert.equal(screen.storage.raw,null);
  assert.deepEqual(screen.calls.logout,[refreshToken]);
  assert.equal(screen.elements.get('rememberMe').checked,false);
  const reopened=fixture({native:true,storage:screen.storage});
  await reopened.ready();
  assert.equal(reopened.calls.refresh.length,0);
  assert.equal(reopened.elements.get('loginScreen').hidden,false);
});

test('a remembered member renews the two-hour access on foreground return and keeps the saved login',async()=>{
  const screen=fixture({native:true});
  screen.elements.get('rememberMe').checked=true;
  await screen.login();await screen.loadImage();await screen.tick(0);
  const saved=screen.storage.raw;
  await screen.visibility(true);
  screen.advance(7200000);
  await screen.nativeHandlers.get('appStateChange')({isActive:true});await settle();
  assert.deepEqual(screen.calls.refresh,[refreshToken]);
  assert.equal(screen.calls.login,1);
  assert.equal(screen.calls.qr,2);
  assert.equal(screen.storage.raw,saved);
  assert.equal(screen.elements.get('loginScreen').hidden,true);
  await screen.loadImage();
  assert.equal(screen.elements.get('qrImage').hidden,false);
  assert.equal(screen.elements.get('confirmationScreen').hidden,true);
});

test('revoked or expired remembered access is discarded instead of repeatedly attempting login',async()=>{
  for(const status of [401,403]) {
    const storage={raw:keptRecord()};
    const screen=fixture({native:true,storage,refresh:async()=>{const error=new Error('Acesso revogado');error.status=status;throw error;}});
    await screen.ready();
    assert.equal(storage.raw,null);
    assert.equal(screen.calls.refresh.length,1);
    assert.equal(screen.calls.qr,0);
    assert.equal(screen.elements.get('loginScreen').hidden,false);
    assert.equal(screen.elements.get('rememberMe').checked,false);
  }
  const storage={raw:keptRecord({expiresAt:Date.now()-1})};
  const expired=fixture({native:true,storage});
  await expired.ready();
  assert.equal(expired.calls.refresh.length,0);
  assert.equal(storage.raw,null);
});

test('temporary connection failure preserves saved login and a network recovery retries without a password',async()=>{
  let offline=true;
  const storage={raw:keptRecord()};
  const screen=fixture({native:true,storage,refresh:async(token,clock,member)=>{
    if(offline)throw new Error('Rede temporariamente indisponível');
    return{token:'restored-after-network',expiresAt:new Date(clock+7200000).toISOString(),membro:member};
  }});
  await screen.ready();
  assert.notEqual(storage.raw,null);
  assert.equal(screen.calls.logout.length,0);
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  offline=false;
  await screen.event('online');
  assert.deepEqual(screen.calls.refresh,[refreshToken,refreshToken]);
  assert.equal(screen.calls.login,0);
  assert.equal(screen.elements.get('qrScreen').hidden,false);
});

test('returning to the Android foreground also retries a saved login after a temporary network error',async()=>{
  let offline=true;
  const screen=fixture({native:true,storage:{raw:keptRecord()},refresh:async(token,clock,member)=>{
    if(offline)throw new Error('Rede temporariamente indisponível');
    return{token:'restored-on-foreground',expiresAt:new Date(clock+7200000).toISOString(),membro:member};
  }});
  await screen.ready();
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  await screen.nativeHandlers.get('appStateChange')({isActive:false});await settle();
  offline=false;
  await screen.nativeHandlers.get('appStateChange')({isActive:true});await settle();
  assert.deepEqual(screen.calls.refresh,[refreshToken,refreshToken]);
  assert.equal(screen.calls.login,0);
  assert.equal(screen.elements.get('qrScreen').hidden,false);
});

test('unchecking remember after an offline restore clears and revokes the previous saved access',async()=>{
  const screen=fixture({native:true,storage:{raw:keptRecord()},refresh:async()=>{throw new Error('Rede indisponível');}});
  await screen.ready();
  assert.equal(screen.elements.get('rememberMe').checked,true);
  screen.elements.get('rememberMe').checked=false;
  await screen.login();
  assert.equal(screen.storage.raw,null);
  assert.equal(screen.calls.saves.length,0);
  assert.deepEqual(screen.calls.logout,[refreshToken]);
  assert.equal(screen.elements.get('qrScreen').hidden,false);
});

test('Sair during renewal ignores its late response and cannot reopen the member QR',async()=>{
  const gate=pending();
  const screen=fixture({native:true,refresh:()=>gate.promise});
  screen.elements.get('rememberMe').checked=true;
  await screen.login();await screen.loadImage();
  await screen.visibility(true);screen.advance(7200000);await screen.visibility(false);
  assert.equal(screen.calls.refresh.length,1);
  await screen.click('logoutButton');
  gate.resolve({token:'late-renewal',expiresAt:new Date(Date.now()+7200000*2).toISOString(),membro:{id:'42',nome:'Old session'}});
  await settle();
  assert.equal(screen.storage.raw,null);
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('qrImage').src,'');
  assert.equal(screen.calls.qr,1);
  assert.deepEqual(screen.calls.logout,[refreshToken]);
});

test('a pending save followed by Sair cannot restore a session or leave the issued refresh token active',async()=>{
  const gate=pending();
  const screen=fixture({native:true,saveGate:gate});
  screen.elements.get('rememberMe').checked=true;
  const logging=screen.login();
  await settle();await settle();
  assert.equal(screen.calls.saves.length,1);
  await screen.click('logoutButton');
  gate.resolve();
  await logging;await settle();
  assert.equal(screen.storage.raw,null);
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.calls.qr,0);
  assert.ok(screen.calls.logout.includes(refreshToken),'the newly issued persistent credential must also be revoked');
});

test('storage failure keeps the login visible and revokes the credential that could not be saved',async()=>{
  const screen=fixture({native:true,saveError:new Error('Disk write failed')});
  screen.elements.get('rememberMe').checked=true;
  await screen.login();
  assert.equal(screen.storage.raw,null);
  assert.equal(screen.calls.qr,0);
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.match(screen.elements.get('loginMessage').textContent,/Não foi possível salvar/);
  assert.deepEqual(screen.calls.logout,[refreshToken]);
});

test('a QR request rejected immediately after restore cannot deadlock or renew in a loop',async()=>{
  const screen=fixture({native:true,storage:{raw:keptRecord()},qr:async()=>{
    const error=new Error('Acesso revogado após renovação');error.status=401;throw error;
  }});
  await screen.ready();
  assert.ok(screen.calls.refresh.length<=1,'one rejected renewal must not recursively refresh again');
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('loginButton').disabled,false);
  assert.equal(screen.storage.raw,null);
});
