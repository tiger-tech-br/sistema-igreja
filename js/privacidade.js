const result=document.getElementById('resultado');
async function load() {
    const config=await fetch('/api/privacidade/config').then(r=>r.json());
    document.getElementById('responsavel').textContent=config.configured ? `Controlador: ${config.controller}. Contato: ${config.contact}. Aviso ${config.version}.` : 'O responsável ainda precisa configurar PRIVACY_CONTROLLER e PRIVACY_EMAIL.';
    const response=await fetch('/api/privacidade/solicitacoes');
    const box=document.getElementById('solicitacoes'); box.replaceChildren();
    if(response.status===401){box.textContent='Entre na sua conta para baixar dados ou registrar e acompanhar solicitações.';return;}
    const data=await response.json();
    for(const item of data.data||[]){const p=document.createElement('p');p.textContent=`${item.criado_em} — ${item.tipo} — ${item.status}${item.resposta?' — '+item.resposta:''} — protocolo ${item.id}`;box.appendChild(p);}
}
document.getElementById('formSolicitacao').addEventListener('submit',async event=>{event.preventDefault();const response=await fetch('/api/privacidade/solicitacoes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tipo:document.getElementById('tipo').value,mensagem:document.getElementById('mensagem').value})});const data=await response.json();result.textContent=data.message+(data.protocolo?' Protocolo: '+data.protocolo:'');if(response.ok)load();});
load().catch(()=>{result.textContent='Não foi possível carregar a área de privacidade.';});
