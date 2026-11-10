import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { PresenceObserver } from '../src/presence-observer.js';
import { PullToRefresh } from '../../mobile-shared/pull-to-refresh.js';
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
  const calls={login:0,qr:0,presence:[],credential:0,clear:0,minimize:0,refresh:[],logout:[],loginRequests:[],loads:0,saves:[],removes:0,registrationConfig:[],register:[],deleteAccount:[],profile:[]};
  const storage = options.storage || { raw: null };
  let sequence=0, revision=0, clock=Date.now();
  const member={id:'42',nome:'Ana de teste',cargo:'Membro',ministerio:'Louvor',matricula:'TEST-42',validade:'31/12/2027'};
  const schedule=(callback,delay)=>{const id=++sequence;timers.set(id,{callback,delay});return id;};
  const unschedule=id=>timers.delete(id);
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const handlers=new Map(), attributes=new Map();
    for(const item of match[2].matchAll(/([\w-]+)="([^"]*)"/g))attributes.set(item[1],item[2]);
    elements.set(match[3],{
      dataset:{},style:{setProperty(){}},hidden:/\bhidden(?:\s|>|$)/.test(match[2]),textContent:'',value:'',disabled:false,
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
    async registrationConfig(config){calls.registrationConfig.push(config);return options.registrationConfig?options.registrationConfig(config):{version:'test-v1',configured:true,noticeText:'Li o aviso de privacidade.',consentText:'Autorizo o uso específico do vínculo religioso.',controller:'Igreja de demonstração',contact:'privacidade@example.invalid'};}
    async registerMember(data,config){calls.register.push({data:{...data},config});return options.register?options.register(data,config):{registered:true,email:data.email};}
    async deleteAccount(senha,config){calls.deleteAccount.push({senha,config});return options.deleteAccount?options.deleteAccount(senha,config):{deleted:true};}
    async profile(config){calls.profile.push(config);return options.profile?options.profile(config):{id:member.id,nome:member.nome,email:'ana@example.test',data_nascimento:'01/01/1990',telefone:null,celular:null,endereco:null,sexo:null,estado_civil:null,cargo:member.cargo,ministerio:member.ministerio,matricula:'12345678',validade:member.validade};}
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
    document,window:{scrollY:0,addEventListener:(name,callback)=>windowHandlers.set(name,callback),matchMedia:()=>({matches:Boolean(options.reducedMotion)})},
    navigator:{onLine:true},Capacitor:{isNativePlatform:()=>Boolean(options.native)},
    registerPlugin:name=>{assert.equal(name,'SecureSession');return secure;},SavedSession:FixtureSavedSession,
    App:{async addListener(name,callback){nativeHandlers.set(name,callback);return{remove(){}};},async minimizeApp(){calls.minimize++;}},
    SERVER_URL:'https://igreja.example',MemberApi:FakeApi,PresenceObserver:FixtureObserver,PullToRefresh,
    setTimeout:schedule,clearTimeout:unschedule,Date:ClockDate,URL,console,AbortController,TextEncoder
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

async function startPull(screen, distance=95, target=null) {
  const surface=screen.elements.get('memberScreen');
  const touch=(x,y)=>({identifier:1,clientX:x,clientY:y});
  await surface.fire('touchstart',{target,touches:[touch(20,30)]});
  await surface.fire('touchmove',{touches:[touch(20,30+distance)],cancelable:true});
}

async function pull(screen, distance=95) {
  await startPull(screen,distance);
  await screen.elements.get('memberScreen').fire('touchend');
  await settle();
}

const personalProfile = overrides => ({id:'42',nome:'Ana de teste',email:'ana@example.test',data_nascimento:'01/01/1990',telefone:'1133334444',celular:'11999998888',endereco:'Rua da Esperança, 25',sexo:'Feminino',estado_civil:'Casado(a)',cargo:'Membro',ministerio:'Louvor',matricula:'12345678',validade:'31/12/2027',...overrides});
const personalFields = ['accountName','accountBirth','accountEmail','accountRegistration','accountSex','accountCivilStatus','accountCellphone','accountTelephone','accountAddress','accountRole','accountMinistry','accountValidity'];

test('Minha conta busca dados próprios, mostra cartões legíveis e deixa exclusão depois de todos os dados',async()=>{
  const screen=fixture({profile:async()=>personalProfile()});
  await screen.login();await screen.loadImage();await screen.click('qrAccountButton');
  assert.equal(screen.calls.profile.length,1);
  assert.equal(screen.elements.get('accountScreen').hidden,false);
  assert.equal(screen.elements.get('accountProfileCards').hidden,false);
  assert.equal(screen.elements.get('accountProfileLoading').hidden,true);
  const expected={accountName:'Ana de teste',accountBirth:'01/01/1990',accountEmail:'ana@example.test',accountRegistration:'12345678',accountSex:'Feminino',accountCivilStatus:'Casado(a)',accountCellphone:'11999998888',accountTelephone:'1133334444',accountAddress:'Rua da Esperança, 25',accountRole:'Membro',accountMinistry:'Louvor',accountValidity:'31/12/2027'};
  for(const [id,value] of Object.entries(expected))assert.equal(screen.elements.get(id).textContent,value,id);
  for(const id of ['accountSexRow','accountCivilStatusRow','accountCellphoneRow','accountTelephoneRow','accountAddressRow','accountRoleRow','accountMinistryRow','accountValidityRow'])assert.equal(screen.elements.get(id).hidden,false,id);
  assert.ok(html.indexOf('id="accountDeletion"')>html.indexOf('id="accountProfileCards"'));
  assert.ok(html.indexOf('id="accountDeletion"')>html.indexOf('id="accountValidity"'));
  assert.ok(html.indexOf('id="deleteAccountForm"')>html.indexOf('id="accountDeletion"'));
  assert.equal(screen.calls.deleteAccount.length,0);
});

test('perfil não interpreta HTML, ignora senha e oculta somente opcionais vazios',async()=>{
  const screen=fixture({profile:async()=>personalProfile({nome:'<img src=x onerror=alert(1)>',email:'<b>nome@example.test</b>',telefone:null,celular:'',endereco:'   ',sexo:null,estado_civil:null,cargo:null,ministerio:null,validade:null,senha:'secret-password-hash'})});
  await screen.login();await screen.click('qrAccountButton');
  assert.equal(screen.elements.get('accountName').textContent,'<img src=x onerror=alert(1)>');
  assert.equal(screen.elements.get('accountEmail').textContent,'<b>nome@example.test</b>');
  assert.equal(screen.elements.get('accountBirth').textContent,'01/01/1990');
  assert.equal(screen.elements.get('accountRegistration').textContent,'12345678');
  for(const id of ['accountSexRow','accountCivilStatusRow','accountCellphoneRow','accountTelephoneRow','accountAddressRow','accountRoleRow','accountMinistryRow','accountValidityRow'])assert.equal(screen.elements.get(id).hidden,true,id);
  for(const element of screen.elements.values())assert.equal(element.textContent.includes('secret-password-hash'),false);
  assert.equal(screen.elements.get('deletePassword').value,'');
});

test('falha ao atualizar preserva os últimos dados, mostra aviso e retry substitui campos que ficaram vazios',async()=>{
  let fail=false;
  const screen=fixture({profile:async()=>{if(fail)throw new Error('Rede indisponível.');return personalProfile({nome:screen.calls.profile.length===1?'Nome anterior':'Nome atualizado',celular:screen.calls.profile.length===1?'11999998888':null});}});
  await screen.login();await screen.click('qrAccountButton');
  fail=true;await pull(screen);
  assert.equal(screen.elements.get('accountName').textContent,'Nome anterior');
  assert.equal(screen.elements.get('accountProfileCards').hidden,false);
  assert.match(screen.elements.get('accountProfileMessage').textContent,/Rede indisponível/);
  assert.match(screen.elements.get('accountProfileMessage').textContent,/última consulta/);
  assert.equal(screen.elements.get('retryAccountProfileButton').hidden,false);
  fail=false;await screen.click('retryAccountProfileButton');
  assert.equal(screen.elements.get('accountName').textContent,'Nome atualizado');
  assert.equal(screen.elements.get('accountCellphoneRow').hidden,true);
  assert.equal(screen.elements.get('accountCellphone').textContent,'');
  assert.equal(screen.elements.get('accountProfileMessage').hidden,true);
  assert.equal(screen.elements.get('retryAccountProfileButton').hidden,true);
  await screen.click('accountBackButton');fail=true;await screen.click('qrAccountButton');
  assert.equal(screen.elements.get('accountName').textContent,'Nome atualizado','reabrir sempre consulta sem perder dados anteriores na falha');
  assert.equal(screen.calls.profile.length,4);
});

test('primeira falha de perfil não mostra dados fictícios e identidade incompatível nunca é renderizada',async()=>{
  for(const profile of [async()=>{throw new Error('Sem conexão.');},async()=>personalProfile({id:'99',nome:'Outra pessoa'})]){
    const screen=fixture({profile});await screen.login();await screen.click('qrAccountButton');
    assert.equal(screen.elements.get('accountProfileCards').hidden,true);
    assert.equal(screen.elements.get('accountProfileMessage').hidden,false);
    assert.equal(screen.elements.get('retryAccountProfileButton').hidden,false);
    for(const id of personalFields)assert.equal(screen.elements.get(id).textContent,'',id);
    assert.equal(screen.calls.deleteAccount.length,0);
  }
});

test('perfil 401 renova acesso lembrado uma vez; nova recusa encerra e limpa tudo sem loop',async()=>{
  for(const repeated of [false,true]){
    let requests=0;
    const screen=fixture({native:true,profile:async()=>{if(++requests===1||repeated)throw Object.assign(new Error('Acesso expirado.'),{status:401});return personalProfile();}});
    screen.elements.get('rememberMe').checked=true;await screen.login();
    const saved=screen.storage.raw;
    await screen.click('qrAccountButton');
    assert.equal(screen.calls.refresh.length,1);
    assert.equal(screen.calls.profile.length,2);
    if(repeated){
      assert.equal(screen.elements.get('loginScreen').hidden,false);
      assert.equal(screen.storage.raw,null);
      for(const id of personalFields)assert.equal(screen.elements.get(id).textContent,'',id);
    }else{
      assert.equal(screen.elements.get('accountScreen').hidden,false);
      assert.equal(screen.elements.get('accountName').textContent,'Ana de teste');
      assert.equal(screen.storage.raw,saved);
      assert.equal(screen.calls.login,1);
    }
  }
});

test('Voltar cancela perfil pendente e resposta antiga não substitui a consulta de uma nova abertura',async()=>{
  const gate=pending();let reads=0;
  const screen=fixture({profile:config=>++reads===1?gate.promise:Promise.resolve(personalProfile({nome:'Consulta mais recente'}))});
  await screen.login();
  const opening=screen.elements.get('qrAccountButton').fire('click');await settle();
  assert.equal(screen.elements.get('accountProfileLoading').hidden,false);
  await screen.click('accountBackButton');
  assert.equal(screen.calls.profile[0].signal.aborted,true);
  await screen.click('qrAccountButton');
  assert.equal(screen.elements.get('accountName').textContent,'Consulta mais recente');
  gate.resolve(personalProfile({nome:'Resposta atrasada'}));await opening;await settle();
  assert.equal(screen.elements.get('accountName').textContent,'Consulta mais recente');
  assert.equal(screen.elements.get('accountProfileLoading').hidden,true);
});

test('perfil por gesto é serializado e mantém login, senha e confirmação de exclusão',async()=>{
  const gate=pending();let reads=0;
  const screen=fixture({native:true,profile:async()=>++reads===1?personalProfile():gate.promise});
  screen.elements.get('rememberMe').checked=true;await screen.login();await screen.click('qrAccountButton');
  const saved=screen.storage.raw;
  const token=vm.runInContext('api.token',screen.context);
  screen.elements.get('deletePassword').value='senha-pessoal';screen.elements.get('deleteConfirmation').checked=true;
  await startPull(screen);
  const refreshing=screen.elements.get('memberScreen').fire('touchend');await settle();
  await pull(screen);await screen.click('retryAccountProfileButton');
  assert.equal(screen.calls.profile.length,2);
  assert.equal(screen.elements.get('deletePassword').value,'senha-pessoal');
  assert.equal(screen.elements.get('deleteConfirmation').checked,true);
  gate.resolve(personalProfile({endereco:'Endereço atualizado'}));await refreshing;await settle();
  assert.equal(screen.elements.get('accountAddress').textContent,'Endereço atualizado');
  assert.equal(screen.elements.get('deletePassword').value,'senha-pessoal');
  assert.equal(screen.elements.get('deleteConfirmation').checked,true);
  assert.equal(screen.calls.deleteAccount.length,0);
  assert.equal(screen.calls.login,1);
  assert.equal(screen.storage.raw,saved);
  assert.equal(vm.runInContext('api.token',screen.context),token);
  assert.equal(screen.elements.get('pullRefreshIndicator').hidden,true);
});

test('Sair limpa dados pessoais e ignora perfil pendente mesmo após nova conta entrar',async()=>{
  const gate=pending();let reads=0;
  const screen=fixture({profile:async()=>++reads===2?gate.promise:personalProfile({nome:reads===1?'Primeiro nome':'Novo login'})});
  await screen.login();await screen.click('qrAccountButton');
  await startPull(screen);const refreshing=screen.elements.get('memberScreen').fire('touchend');await settle();
  await screen.click('logoutButton');
  assert.equal(screen.calls.profile[1].signal.aborted,true);
  assert.equal(screen.elements.get('accountProfileCards').hidden,true);
  for(const id of personalFields)assert.equal(screen.elements.get(id).textContent,'',id);
  await screen.login();await screen.click('qrAccountButton');
  gate.resolve(personalProfile({nome:'Dados da sessão antiga'}));await refreshing;await settle();
  assert.equal(screen.elements.get('accountName').textContent,'Novo login');
});

test('excluir durante leitura do perfil aborta GET e apaga dados sem resposta tardia reabrir a conta',async()=>{
  const gate=pending();let reads=0;
  const screen=fixture({native:true,profile:async()=>++reads===1?personalProfile():gate.promise});
  screen.elements.get('rememberMe').checked=true;await screen.login();await screen.click('qrAccountButton');
  await startPull(screen);const refreshing=screen.elements.get('memberScreen').fire('touchend');await settle();
  screen.elements.get('deletePassword').value='senha-pessoal';screen.elements.get('deleteConfirmation').checked=true;
  await screen.elements.get('deleteAccountForm').fire('submit');await settle();
  assert.equal(screen.calls.profile[1].signal.aborted,true);
  assert.equal(screen.storage.raw,null);
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('accountProfileCards').hidden,true);
  for(const id of personalFields)assert.equal(screen.elements.get(id).textContent,'',id);
  gate.resolve(personalProfile({nome:'Conta excluída'}));await refreshing;await settle();
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('accountName').textContent,'');
  assert.equal(screen.calls.deleteAccount.length,1);
});

test('puxar no QR atualiza matrícula e cursor sem refazer login nem apagar acesso salvo',async()=>{
  let qrCalls=0;
  const screen=fixture({native:true,qr:async()=>({membro:{id:'42',nome:'Ana de teste',cargo:'Membro',matricula:++qrCalls===1?'AD-ANTIGA':'AD-00001'},qrDataUrl:png,cursor:qrCalls===1?'0':'12'})});
  screen.elements.get('rememberMe').checked=true;await screen.login();await screen.loadImage();
  const saved=screen.storage.raw;
  const token=vm.runInContext('api.token',screen.context);
  await startPull(screen,40);
  assert.equal(screen.elements.get('pullRefreshText').textContent,'Puxe para atualizar');
  await screen.elements.get('memberScreen').fire('touchcancel');
  await pull(screen);
  assert.equal(screen.calls.qr,2);
  assert.equal(screen.elements.get('memberRegistration').textContent,'Matrícula AD-00001');
  assert.equal(screen.elements.get('pullRefreshIndicator').hidden,true);
  assert.equal(screen.calls.login,1);
  assert.equal(screen.calls.refresh.length,0);
  assert.equal(screen.calls.logout.length,0);
  assert.equal(screen.storage.raw,saved);
  assert.equal(vm.runInContext('api.token',screen.context),token);
  assert.equal(screen.calls.credential,0);
  await screen.loadImage();
  assert.equal(vm.runInContext('observer.cursor',screen.context),'12');
  assert.equal(screen.elements.get('confirmationScreen').hidden,true);
});

test('puxar na credencial busca os dados novamente e permanece na mesma tela',async()=>{
  let reads=0;
  const screen=fixture({credential:async()=>({id:'42',nome:++reads===1?'Nome anterior':'Nome atualizado',matricula:reads===1?'AD-ANTIGA':'AD-00001',validade:'31/12/2027'})});
  await screen.login();await screen.loadImage();screen.confirm();await screen.tick(0);await screen.tick(1300);
  assert.equal(screen.calls.credential,1);
  await pull(screen);
  assert.equal(screen.calls.credential,2);
  assert.equal(screen.elements.get('credentialScreen').hidden,false);
  assert.equal(screen.elements.get('credentialCard').hidden,false);
  assert.equal(screen.elements.get('credentialName').textContent,'Nome atualizado');
  assert.equal(screen.elements.get('credentialRegistration').textContent,'AD-00001');
  assert.equal(screen.calls.qr,1);
  assert.equal(screen.calls.login,1);
  assert.equal(screen.elements.get('pullRefreshIndicator').hidden,true);
});

test('atualização por gesto não sobrepõe solicitações e falha mantém aviso sem falso sucesso',async()=>{
  const gate=pending();let requests=0;
  const screen=fixture({native:true,qr:async()=>{if(++requests===2)return gate.promise;return{membro:{id:'42',nome:'Ana'},qrDataUrl:png,cursor:'0'};}});
  screen.elements.get('rememberMe').checked=true;await screen.login();await screen.loadImage();
  const saved=screen.storage.raw;
  await startPull(screen);
  assert.equal(screen.elements.get('pullRefreshText').textContent,'Solte para atualizar');
  const refreshing=screen.elements.get('memberScreen').fire('touchend');await settle();
  assert.equal(screen.elements.get('pullRefreshText').textContent,'Atualizando…');
  await pull(screen);
  assert.equal(screen.calls.qr,2);
  gate.reject(new Error('Rede indisponível agora.'));await refreshing;await settle();
  assert.equal(screen.elements.get('pullRefreshIndicator').hidden,true);
  assert.equal(screen.elements.get('qrMessage').hidden,false);
  assert.match(screen.elements.get('qrMessage').textContent,/Rede indisponível/);
  assert.equal(screen.elements.get('confirmationScreen').hidden,true);
  assert.equal(screen.storage.raw,saved);
  await pull(screen);await screen.loadImage();
  assert.equal(screen.calls.qr,3,'novo gesto permite tentar depois da falha');
  assert.equal(screen.elements.get('qrMessage').hidden,true);
});

test('fora do topo ou sobre botões gesto não atualiza; na Minha conta atualiza dados preservando formulário',async()=>{
  const screen=fixture();await screen.login();await screen.loadImage();
  screen.context.window.scrollY=50;await pull(screen);
  assert.equal(screen.calls.qr,1);
  screen.context.window.scrollY=0;
  await startPull(screen,100,{closest:()=>({tagName:'BUTTON'})});
  await screen.elements.get('memberScreen').fire('touchend');await settle();
  assert.equal(screen.calls.qr,1);
  await screen.click('qrAccountButton');
  screen.elements.get('deletePassword').value='senha-pessoal';
  screen.elements.get('deleteConfirmation').checked=true;
  await pull(screen);
  assert.equal(screen.calls.qr,1);
  assert.equal(screen.calls.deleteAccount.length,0);
  assert.equal(screen.elements.get('deletePassword').value,'senha-pessoal');
  assert.equal(screen.elements.get('deleteConfirmation').checked,true);
  assert.equal(screen.calls.profile.length,2);
  assert.equal(screen.elements.get('pullRefreshIndicator').hidden,true);
});

test('navegação, background e Sair limpam o gesto e resultado atrasado não reabre QR',async()=>{
  const gate=pending();let reads=0;
  const screen=fixture({native:true,qr:async()=>++reads===1?{membro:{id:'42',nome:'Ana'},qrDataUrl:png,cursor:'0'}:gate.promise});
  screen.elements.get('rememberMe').checked=true;await screen.login();await screen.loadImage();
  await startPull(screen);await screen.click('qrAccountButton');
  assert.equal(screen.elements.get('pullRefreshIndicator').hidden,true);
  await screen.elements.get('memberScreen').fire('touchend');await settle();
  assert.equal(screen.calls.qr,1);
  // Return without loading a new QR so this test can keep its next request gated.
  vm.runInContext("showView('qr')",screen.context);
  await startPull(screen);await screen.visibility(true);
  assert.equal(screen.elements.get('pullRefreshIndicator').hidden,true);
  await screen.elements.get('memberScreen').fire('touchend');await settle();
  assert.equal(screen.calls.qr,1);
  await screen.visibility(false);
  await startPull(screen);
  const refreshing=screen.elements.get('memberScreen').fire('touchend');await settle();
  assert.equal(screen.calls.qr,2);
  await screen.click('logoutButton');
  gate.resolve({membro:{id:'42',nome:'Resposta antiga'},qrDataUrl:png,cursor:'2'});await refreshing;await settle();
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('pullRefreshIndicator').hidden,true);
  assert.equal(screen.elements.get('memberName').textContent,'');
  assert.equal(screen.elements.get('qrImage').src,'');
  assert.equal(screen.storage.raw,null);
});

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

function fillRegistration(screen, overrides={}) {
  const values={registrationName:'Maria de teste',registrationBirth:'01/01/1990',registrationEmail:'  MARIA@example.test  ',registrationPassword:'senha-exclusiva-teste',registrationConfirmPassword:'senha-exclusiva-teste',...overrides};
  for(const [id,value] of Object.entries(values))screen.elements.get(id).value=value;
  screen.elements.get('registrationNotice').checked=true;
  screen.elements.get('registrationConsent').checked=true;
}

test('nascimento usa digitação numérica DD/MM/AAAA sem calendário e máscara aceita apagar, corrigir e colar',async()=>{
  const screen=fixture();await screen.ready();await screen.click('openRegistrationButton');
  const birth=screen.elements.get('registrationBirth');
  assert.equal(birth.type,'text');
  assert.equal(birth.getAttribute('inputmode'),'numeric');
  assert.equal(birth.getAttribute('maxlength'),'10');
  assert.equal(birth.getAttribute('placeholder'),'DD/MM/AAAA');
  birth.selectionStart=0;birth.selectionEnd=0;
  birth.setSelectionRange=function(start,end){this.selectionStart=start;this.selectionEnd=end;};
  const edit=async(value,cursor,inputType='insertText')=>{birth.value=value;birth.selectionStart=cursor;birth.selectionEnd=cursor;await birth.fire('input',{inputType});};
  for(const digit of '01021992'){
    const cursor=birth.selectionStart;
    await edit(birth.value.slice(0,cursor)+digit+birth.value.slice(birth.selectionEnd),cursor+1);
  }
  assert.equal(birth.value,'01/02/1992');
  assert.equal(birth.selectionStart,10);
  await edit(birth.value.slice(0,-1),9,'deleteContentBackward');
  assert.equal(birth.value,'01/02/199');
  await edit(birth.value+'2',10);
  assert.equal(birth.value,'01/02/1992');
  await edit('29'+birth.value.slice(2),2,'insertReplacementText');
  assert.equal(birth.value,'29/02/1992');
  assert.equal(birth.selectionStart,2,'corrigir o dia não joga o cursor para o fim');
  await edit('2902/1992',2,'deleteContentBackward');
  assert.equal(birth.selectionStart,2,'Backspace na barra reposiciona antes dela para poder continuar apagando');
  await edit('2'+birth.value.slice(2),1,'deleteContentBackward');
  assert.equal(birth.value.replace(/\D/g,'').length,7);
  await edit('',0,'deleteContentBackward');
  assert.equal(birth.value,'');
  await edit(' 29-02.2000abc123456',20,'insertFromPaste');
  assert.equal(birth.value,'29/02/2000');
  assert.equal(birth.selectionStart,10);
  await edit('15/06/1990',10,'insertFromPaste');
  assert.equal(birth.value,'15/06/1990');
});

test('nascimento digitado valida calendário real e bissexto e envia DD/MM/AAAA sem conversão de fuso',async()=>{
  const screen=fixture();await screen.ready();await screen.click('openRegistrationButton');
  for(const invalid of ['31/04/1990','29/02/1900','29/02/1991','00/12/1990','01/13/1990','01/01/1899','1990-01-01','1/1/1990']){
    fillRegistration(screen,{registrationBirth:invalid});
    await screen.elements.get('registrationForm').fire('submit');await settle();
    assert.equal(screen.calls.register.length,0,invalid);
    assert.equal(screen.elements.get('registrationMessage').hidden,false,invalid);
  }
  fillRegistration(screen,{registrationBirth:'29/02/2000'});
  await screen.elements.get('registrationForm').fire('submit');await settle();
  assert.equal(screen.calls.register.length,1);
  assert.equal(screen.calls.register[0].data.dataNascimento,'29/02/2000');
  assert.equal(screen.elements.get('loginScreen').hidden,false);
});

test('limite de 18 anos para data digitada segue o dia atual de São Paulo',async()=>{
  const screen=fixture();await screen.ready();await screen.click('openRegistrationButton');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date()).map(part=>[part.type,part.value]));
  const year=Number(parts.year)-18;
  const month=Number(parts.month),day=Number(parts.day);
  const tomorrow=new Date(Date.UTC(year,month-1,day+1));
  const format=date=>`${String(date.getUTCDate()).padStart(2,'0')}/${String(date.getUTCMonth()+1).padStart(2,'0')}/${date.getUTCFullYear()}`;
  fillRegistration(screen,{registrationBirth:format(tomorrow)});
  await screen.elements.get('registrationForm').fire('submit');await settle();
  assert.equal(screen.calls.register.length,0);
  assert.match(screen.elements.get('registrationMessage').textContent,/18 anos/);
  fillRegistration(screen,{registrationBirth:`${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`});
  await screen.elements.get('registrationForm').fire('submit');await settle();
  assert.equal(screen.calls.register.length,1);
});

test('cadastro usa somente os dados mínimos e retorna ao login sem autenticar nem abrir credencial',async()=>{
  const screen=fixture({native:true});
  await screen.ready();await screen.click('openRegistrationButton');
  assert.equal(screen.elements.get('registrationScreen').hidden,false);
  assert.equal(screen.elements.get('registrationSubmitButton').disabled,false);
  assert.equal(screen.elements.get('registrationPrivacyLink').getAttribute('href'),origin+'/privacidade');
  assert.equal(screen.elements.get('registrationRecoveryLink').getAttribute('href'),origin+'/esqueci-senha');
  fillRegistration(screen);
  await screen.elements.get('registrationForm').fire('submit');await settle();
  assert.deepEqual(screen.calls.register[0].data,{nome:'Maria de teste',email:'maria@example.test',senha:'senha-exclusiva-teste',dataNascimento:'01/01/1990',cienciaPrivacidade:true,consentimento:true,privacyVersion:'test-v1'});
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('email').value,'maria@example.test');
  assert.match(screen.elements.get('loginMessage').textContent,/Cadastro realizado/);
  assert.equal(screen.elements.get('loginMessage').dataset.state,'success');
  assert.equal(screen.calls.login,0);
  assert.equal(screen.calls.qr,0);
  assert.equal(screen.calls.credential,0);
  assert.equal(screen.storage.raw,null);
  for(const id of ['senha','registrationPassword','registrationConfirmPassword','registrationName','registrationBirth','registrationEmail'])assert.equal(screen.elements.get(id).value,'',id);
  assert.equal(screen.elements.get('rememberMe').checked,false);
});

test('cadastro valida idade, datas inexistentes, senha em bytes, confirmação e as duas autorizações antes de enviar',async()=>{
  const screen=fixture();await screen.ready();await screen.click('openRegistrationButton');
  const cases=[
    [{registrationBirth:'01/01/2020'},/18 anos/],
    [{registrationBirth:'31/02/1990'},/data de nascimento/],
    [{registrationName:'12'},/nome completo/],
    [{registrationEmail:'email-inválido'},/e-mail válido/],
    [{registrationPassword:'curta',registrationConfirmPassword:'curta'},/12 caracteres/],
    [{registrationPassword:'á'.repeat(37),registrationConfirmPassword:'á'.repeat(37)},/72 bytes/],
    [{registrationConfirmPassword:'outra-senha-longa'},/não são iguais/]
  ];
  for(const [override,message] of cases){
    fillRegistration(screen,override);
    await screen.elements.get('registrationForm').fire('submit');await settle();
    assert.match(screen.elements.get('registrationMessage').textContent,message);
  }
  for(const id of ['registrationNotice','registrationConsent']){
    fillRegistration(screen);screen.elements.get(id).checked=false;
    await screen.elements.get('registrationForm').fire('submit');await settle();
    assert.match(screen.elements.get('registrationMessage').textContent,/duas opções/);
  }
  assert.equal(screen.calls.register.length,0);
});

test('cadastro indisponível mantém o formulário bloqueado e permite recarregar a configuração',async()=>{
  let configured=false;
  const screen=fixture({registrationConfig:async()=>({version:'v2',configured,noticeText:'<b>Aviso oficial</b>',consentText:'Autorização específica',controller:'Igreja',contact:'privacidade@example.invalid'})});
  await screen.ready();await screen.click('openRegistrationButton');
  assert.equal(screen.elements.get('registrationSubmitButton').disabled,true);
  assert.equal(screen.elements.get('registrationNotice').disabled,true);
  assert.equal(screen.elements.get('registrationNoticeText').textContent,'<b>Aviso oficial</b>');
  assert.match(screen.elements.get('registrationConfigStatus').textContent,/temporariamente indisponível/);
  assert.equal(screen.elements.get('retryRegistrationConfigButton').hidden,false);
  configured=true;await screen.click('retryRegistrationConfigButton');
  assert.equal(screen.elements.get('registrationSubmitButton').disabled,false);
  assert.equal(screen.elements.get('registrationNotice').disabled,false);
  assert.equal(screen.elements.get('registrationNotice').checked,false);
  assert.equal(screen.calls.registrationConfig.length,2);
});

test('cadastro duplicado oferece login e recuperação com e-mail preenchido, sem sessão automática',async()=>{
  const screen=fixture({register:async()=>{throw Object.assign(new Error('Já existe um cadastro com este e-mail.'),{status:409});}});
  await screen.ready();await screen.click('openRegistrationButton');fillRegistration(screen);
  await screen.elements.get('registrationForm').fire('submit');await settle();
  assert.equal(screen.elements.get('registrationScreen').hidden,false);
  assert.equal(screen.elements.get('registrationDuplicateActions').hidden,false);
  assert.match(screen.elements.get('registrationMessage').textContent,/Já existe/);
  assert.equal(screen.elements.get('registrationPassword').value,'');
  assert.equal(screen.elements.get('registrationSubmitButton').disabled,false);
  await screen.click('registrationLoginButton');
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('email').value.trim().toLowerCase(),'maria@example.test');
  assert.equal(screen.calls.login,0);
});

test('falha de rede e validação do servidor deixam cadastro na tela e exigem nova senha; 503 bloqueia até recarregar',async()=>{
  let status=400;
  const screen=fixture({register:async()=>{throw Object.assign(new Error('Não foi possível concluir agora.'),{status});}});
  await screen.ready();await screen.click('openRegistrationButton');
  for(const code of [400,0,503]){
    status=code;fillRegistration(screen);
    await screen.elements.get('registrationForm').fire('submit');await settle();
    assert.equal(screen.elements.get('registrationScreen').hidden,false);
    assert.equal(screen.elements.get('registrationPassword').value,'');
    assert.equal(screen.elements.get('registrationConfirmPassword').value,'');
    assert.match(screen.elements.get('registrationMessage').textContent,/Não foi possível/);
  }
  assert.equal(screen.elements.get('registrationSubmitButton').disabled,true);
  assert.equal(screen.elements.get('retryRegistrationConfigButton').hidden,false);
  assert.equal(screen.calls.login,0);
});

test('Voltar aborta configuração e cadastro pendentes, ignora respostas tardias e não conserva senhas',async()=>{
  const configGate=pending();
  const screen=fixture({native:true,registrationConfig:()=>configGate.promise});
  await screen.ready();
  const opening=screen.click('openRegistrationButton');await settle();
  await screen.nativeHandlers.get('backButton')();await settle();
  assert.equal(screen.calls.registrationConfig[0].signal.aborted,true);
  configGate.resolve({version:'v1',configured:true,noticeText:'Aviso',consentText:'Autorização'});await opening;
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('registrationSubmitButton').disabled,true);
  const gate=pending();
  const submitting=fixture({register:()=>gate.promise});
  await submitting.ready();await submitting.click('openRegistrationButton');fillRegistration(submitting);
  const work=submitting.elements.get('registrationForm').fire('submit');await settle();
  await submitting.elements.get('registrationForm').fire('submit');await settle();
  assert.equal(submitting.calls.register.length,1,'submissão serializada');
  await submitting.click('registrationBackButton');
  assert.equal(submitting.calls.register[0].config.signal.aborted,true);
  gate.resolve({registered:true,email:'maria@example.test'});await work;await settle();
  assert.equal(submitting.elements.get('loginScreen').hidden,false);
  assert.equal(submitting.elements.get('loginMessage').textContent,'');
  assert.equal(submitting.elements.get('registrationPassword').value,'');
  assert.equal(submitting.calls.login,0);
});

test('abrir cadastro cancela restauração antiga e uma resposta atrasada não abre o QR nem conserva o acesso salvo',async()=>{
  const gate=pending();
  const screen=fixture({native:true,storage:{raw:keptRecord()},refresh:()=>gate.promise});
  await settle();
  assert.equal(screen.calls.refresh.length,1);
  await screen.click('openRegistrationButton');
  gate.resolve({token:'late-refresh',expiresAt:new Date(Date.now()+7200000).toISOString(),membro:{id:'42'}});await settle();
  await screen.event('online');
  assert.equal(screen.elements.get('registrationScreen').hidden,false);
  assert.equal(screen.storage.raw,null);
  assert.equal(screen.calls.qr,0);
  assert.equal(screen.calls.login,0);
});

test('Minha conta pausa observação e Voltar cancela sem excluir; Android mantém navegação',async()=>{
  const screen=fixture({native:true});await screen.login();await screen.loadImage();await screen.tick(0);
  await screen.click('qrAccountButton');
  assert.equal(screen.elements.get('accountScreen').hidden,false);
  assert.equal(screen.timers.size,1,'só temporizador da sessão permanece');
  assert.equal(screen.calls.deleteAccount.length,0);
  screen.elements.get('deletePassword').value='senha-atual';screen.elements.get('deleteConfirmation').checked=true;
  await screen.nativeHandlers.get('backButton')();await settle();
  assert.equal(screen.elements.get('qrScreen').hidden,false);
  assert.equal(screen.elements.get('deletePassword').value,'');
  assert.equal(screen.elements.get('deleteConfirmation').checked,false);
  assert.equal(screen.calls.deleteAccount.length,0);
});

test('exclusão exige senha e confirmação, é serializada e bloqueia voltar enquanto servidor decide',async()=>{
  const gate=pending();
  const screen=fixture({native:true,deleteAccount:()=>gate.promise});await screen.login();await screen.loadImage();await screen.click('qrAccountButton');
  await screen.elements.get('deleteAccountForm').fire('submit');await settle();
  assert.match(screen.elements.get('deleteAccountMessage').textContent,/senha atual/);
  screen.elements.get('deletePassword').value='senha-atual';
  await screen.elements.get('deleteAccountForm').fire('submit');await settle();
  assert.match(screen.elements.get('deleteAccountMessage').textContent,/confirmação/);
  assert.equal(screen.calls.deleteAccount.length,0);
  screen.elements.get('deleteConfirmation').checked=true;
  const deleting=screen.elements.get('deleteAccountForm').fire('submit');await settle();
  await screen.elements.get('deleteAccountForm').fire('submit');await screen.click('cancelDeleteAccountButton');
  await screen.nativeHandlers.get('backButton')();await settle();
  assert.equal(screen.calls.deleteAccount.length,1);
  assert.equal(screen.elements.get('accountScreen').hidden,false);
  assert.equal(screen.elements.get('cancelDeleteAccountButton').disabled,true);
  gate.reject(Object.assign(new Error('Senha incorreta. Confira sua senha atual.'),{status:401}));await deleting;await settle();
  assert.equal(screen.elements.get('accountScreen').hidden,false);
  assert.equal(screen.elements.get('deletePassword').value,'');
  assert.equal(screen.elements.get('deleteAccountButton').disabled,false);
  assert.match(screen.elements.get('deleteAccountMessage').textContent,/Senha incorreta/);
  assert.equal(screen.calls.logout.length,0,'senha incorreta não encerra a conta');
});

test('exclusão confirmada apaga dados e credenciais salvas nos modos Android e web e impede restauração',async()=>{
  for(const native of [true,false]){
    const screen=fixture({native});screen.elements.get('rememberMe').checked=true;
    await screen.login();await screen.loadImage();
    assert.notEqual(screen.storage.raw,null);
    await screen.click('qrAccountButton');screen.elements.get('deletePassword').value='senha-atual';screen.elements.get('deleteConfirmation').checked=true;
    await screen.elements.get('deleteAccountForm').fire('submit');await settle();
    assert.equal(screen.calls.deleteAccount[0].senha,'senha-atual');
    assert.equal(screen.storage.raw,null);
    assert.equal(screen.elements.get('loginScreen').hidden,false);
    assert.equal(screen.elements.get('email').value,'');
    assert.equal(screen.elements.get('deletePassword').value,'');
    assert.equal(screen.elements.get('deleteConfirmation').checked,false);
    assert.equal(screen.elements.get('qrImage').src,'');
    assert.equal(screen.elements.get('credentialCard').hidden,true);
    for(const id of ['memberName','memberRole','memberRegistration','credentialName','credentialRegistration','credentialValidity'])assert.equal(screen.elements.get(id).textContent,'',id);
    assert.equal(screen.timers.size,0);
    assert.match(screen.elements.get('loginMessage').textContent,/cadastro foi excluído/);
    const reopened=fixture({native,storage:screen.storage});await reopened.ready();
    assert.equal(reopened.calls.refresh.length,0);
  }
});

test('exclusão não confirmada ou falha de conexão preserva a conta e oferece nova tentativa sem falso sucesso',async()=>{
  for(const failure of ['network','unconfirmed']){
    const screen=fixture({native:true,deleteAccount:async()=>{if(failure==='network')throw new Error('Sem conexão.');return{deleted:false};}});
    screen.elements.get('rememberMe').checked=true;await screen.login();await screen.loadImage();
    const kept=screen.storage.raw;
    await screen.click('qrAccountButton');screen.elements.get('deletePassword').value='senha-atual';screen.elements.get('deleteConfirmation').checked=true;
    await screen.elements.get('deleteAccountForm').fire('submit');await settle();
    assert.equal(screen.elements.get('accountScreen').hidden,false);
    assert.equal(screen.storage.raw,kept);
    assert.equal(screen.elements.get('deleteAccountMessage').hidden,false);
    assert.equal(screen.elements.get('deleteAccountButton').disabled,false);
    assert.equal(screen.calls.logout.length,0);
  }
});

test('Sair durante exclusão ignora resposta atrasada e deixa toda credencial removida',async()=>{
  const gate=pending();const screen=fixture({native:true,deleteAccount:()=>gate.promise});
  screen.elements.get('rememberMe').checked=true;await screen.login();await screen.loadImage();
  await screen.click('qrAccountButton');screen.elements.get('deletePassword').value='senha-atual';screen.elements.get('deleteConfirmation').checked=true;
  const deleting=screen.elements.get('deleteAccountForm').fire('submit');await settle();
  await screen.click('logoutButton');
  assert.equal(screen.calls.deleteAccount[0].config.signal.aborted,true);
  gate.resolve({deleted:true});await deleting;await settle();
  assert.equal(screen.storage.raw,null);
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('qrImage').src,'');
  assert.equal(screen.elements.get('loginMessage').textContent,'');
  assert.equal(screen.timers.size,0);
});

test('renovação do acesso na Minha conta preserva a tela e exclusão interrompe respostas antigas de credencial',async()=>{
  const gate=pending();const screen=fixture({native:true,credential:()=>gate.promise});
  screen.elements.get('rememberMe').checked=true;await screen.login();await screen.loadImage();screen.confirm();await screen.tick(0);await screen.tick(1300);
  assert.equal(screen.elements.get('credentialScreen').hidden,false);
  await screen.click('credentialAccountButton');
  await screen.visibility(true);screen.advance(7200000);await screen.visibility(false);
  assert.equal(screen.calls.refresh.length,1);
  assert.equal(screen.elements.get('accountScreen').hidden,false);
  screen.elements.get('deletePassword').value='senha-atual';screen.elements.get('deleteConfirmation').checked=true;
  await screen.elements.get('deleteAccountForm').fire('submit');await settle();
  gate.resolve({id:'42',nome:'Conta excluída',matricula:'OLD',validade:'31/12/2027'});await settle();
  assert.equal(screen.elements.get('loginScreen').hidden,false);
  assert.equal(screen.elements.get('credentialCard').hidden,true);
  assert.equal(screen.elements.get('credentialName').textContent,'');
  assert.equal(screen.storage.raw,null);
});
