const result=document.getElementById('resultado');
let privacyVersion;
async function load() {
    document.getElementById('areaConsentimento').hidden=true;
    const config=await fetch('/api/privacidade/config').then(r=>r.json());
    privacyVersion=config.version;
    document.getElementById('textoAviso').textContent=config.noticeText;
    document.getElementById('textoConsentimento').textContent=config.consentText;
    document.getElementById('responsavel').textContent=config.configured ? `Controlador: ${config.controller}. Contato: ${config.contact}. Aviso ${config.version}.` : 'O responsável ainda precisa configurar PRIVACY_CONTROLLER e PRIVACY_EMAIL.';
    const response=await fetch('/api/privacidade/solicitacoes');
    const box=document.getElementById('solicitacoes'); box.replaceChildren();
    if(response.status===401){box.textContent='Entre na sua conta para baixar dados ou registrar e acompanhar solicitações.';return;}
    const profileResponse=await fetch('/api/membros/perfil');
    if(profileResponse.ok){
        const profile=await profileResponse.json();
        document.getElementById('areaConsentimento').hidden=!config.configured || !profile.data || Boolean(profile.data.consent_at && !profile.data.consent_revoked_at);
    }
    const data=await response.json();
    for(const item of data.data||[]){const p=document.createElement('p');p.textContent=`${item.criado_em} — ${item.tipo} — ${item.status}${item.resposta?' — '+item.resposta:''} — protocolo ${item.id}`;box.appendChild(p);}
}
document.getElementById('formSolicitacao').addEventListener('submit',async event=>{event.preventDefault();const response=await fetch('/api/privacidade/solicitacoes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:document.getElementById('tipo').value,mensagem:document.getElementById('mensagem').value})});const data=await response.json();result.textContent=data.message+(data.protocolo?' Protocolo: '+data.protocolo:'');if(response.ok)load();});
document.getElementById('formConsentimento').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    const button=form.querySelector('button');
    button.disabled=true;
    try {
        const response=await fetch('/api/privacidade/consentimento',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cienciaPrivacidade:document.getElementById('cienciaPrivacidade').checked,consentimento:document.getElementById('consentimento').checked,privacyVersion})});
        const data=await response.json();
        result.textContent=data.message;
        if(response.ok){form.reset();await load();}
    } catch(error){result.textContent='Não foi possível registrar o consentimento. Tente novamente.';}
    finally {button.disabled=false;}
});
load().catch(()=>{result.textContent='Não foi possível carregar a área de privacidade.';});
