const conversations = [
  { id: 1, name: 'Lia Martins', initials: 'L', color: '#c8738b', preview: 'Perfeito! Te encontro às 19h ✨', time: '14:32', unread: 0, status: 'online agora', type: 'all' },
  { id: 2, name: 'Família', initials: 'F', color: '#4d92a4', preview: 'Mãe: Não esqueçam do almoço...', time: '13:48', unread: 3, status: '5 participantes', type: 'groups' },
  { id: 3, name: 'Rafael Lima', initials: 'R', color: '#dc9d57', preview: '🎤 Áudio · 0:18', time: '11:20', unread: 1, status: 'visto há 12 min', type: 'all' },
  { id: 4, name: 'Equipe Nexo', initials: 'N', color: '#6c5ce7', preview: 'Joana: O protótipo ficou incrível!', time: 'Ontem', unread: 0, status: '8 participantes', type: 'groups' },
  { id: 5, name: 'Camila Reis', initials: 'C', color: '#4aa880', preview: 'Obrigada! 💜', time: 'Ontem', unread: 0, status: 'visto ontem', type: 'all' }
];

const histories = {
  1: [
    { mine:false, text:'Oi! Como foi seu dia?', time:'14:20' },
    { mine:true, text:'Foi ótimo! Finalmente terminei aquele projeto que te contei 😄', time:'14:23' },
    { mine:false, text:'Aaaah, que notícia boa! Temos que comemorar.', time:'14:25' },
    { mine:true, text:'Que tal aquele café novo hoje à noite?', time:'14:28' },
    { mine:false, text:'Perfeito! Te encontro às 19h ✨', time:'14:32' }
  ],
  2: [{mine:false,text:'Almoço de domingo confirmado! 🍝',time:'13:40'},{mine:true,text:'Eu levo a sobremesa.',time:'13:43'}],
  3: [{mine:false,text:'Tenho uma ideia para o fim de semana.',time:'11:18'},{mine:false,audio:true,duration:'0:18',time:'11:20'}],
  4: [{mine:false,text:'O novo fluxo de mensagens está pronto para revisão.',time:'09:15'},{mine:true,text:'Ficou muito fluido. Excelente trabalho, equipe!',time:'09:22'}],
  5: [{mine:true,text:'Enviei o documento no seu e-mail.',time:'Ontem'},{mine:false,text:'Obrigada! 💜',time:'Ontem'}]
};

let activeId = 1, filter = 'all', recordingSeconds = 0, recordInterval, mediaRecorder, audioChunks = [], activeStream;
const list = document.querySelector('#conversationList');
const messages = document.querySelector('#messages');
const input = document.querySelector('#messageInput');

function renderConversations() {
  const term = document.querySelector('#searchInput').value.toLowerCase();
  list.innerHTML = conversations.filter(c => {
    const matchesFilter = filter === 'all' || (filter === 'unread' ? c.unread > 0 : c.type === 'groups');
    return matchesFilter && c.name.toLowerCase().includes(term);
  }).map(c => `<article class="conversation ${c.id===activeId?'active':''}" data-id="${c.id}">
    <div class="avatar" style="background:${c.color}">${c.initials}${c.status.includes('online')?'<span class="online-dot"></span>':''}</div>
    <div class="conversation-info"><div class="conversation-top"><strong>${c.name}</strong><time>${c.time}</time></div><p>${c.preview}</p></div>
    ${c.unread?`<span class="unread-badge">${c.unread}</span>`:''}</article>`).join('');
  list.querySelectorAll('.conversation').forEach(el => el.onclick = () => selectChat(+el.dataset.id));
}

function renderMessages() {
  const h = histories[activeId] || [];
  messages.innerHTML = '<div class="date-pill">HOJE</div>' + h.map(m => {
    if (m.audio) return `<div class="message-row ${m.mine?'mine':''}"><div class="bubble audio-bubble">${m.url?`<audio src="${m.url}" controls preload="metadata"></audio>`:'<button class="audio-play">▶</button><div class="audio-wave"></div>'}<span class="audio-time">${m.duration}</span><div class="bubble-meta">${m.time}${m.mine?'<span class="checks">✓✓</span>':''}</div></div></div>`;
    if (m.media) return `<div class="message-row ${m.mine?'mine':''}"><div class="bubble image-message">${m.kind==='video'?`<video src="${m.media}" controls></video>`:`<img src="${m.media}" alt="Imagem anexada">`}<div class="bubble-meta">${m.time}<span class="checks">✓✓</span></div></div></div>`;
    return `<div class="message-row ${m.mine?'mine':''}"><div class="bubble">${escapeHtml(m.text)}<div class="bubble-meta">${m.time}${m.mine?'<span class="checks">✓✓</span>':''}</div></div></div>`;
  }).join('');
  messages.scrollTop = messages.scrollHeight;
}

function selectChat(id) {
  activeId=id; const c=conversations.find(x=>x.id===id); c.unread=0;
  document.querySelector('#chatName').textContent=c.name; document.querySelector('#chatStatus').textContent=c.status;
  renderConversations(); renderMessages(); document.querySelector('.app-shell').classList.add('chat-open');
}

function sendText() {
  const text=input.value.trim(); if(!text) return;
  histories[activeId].push({mine:true,text,time:now()}); input.value=''; resizeInput(); updateSendState(); renderMessages();
  const c=conversations.find(x=>x.id===activeId); c.preview=text; c.time=now(); renderConversations();
}
function updateSendState(){const has=input.value.trim();document.querySelector('#sendButton').style.display=has?'block':'none';document.querySelector('#voiceButton').style.display=has?'none':'block'}
function resizeInput(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,110)+'px'}
function now(){return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(text){const t=document.querySelector('#toast');t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1900)}

document.querySelector('#searchInput').addEventListener('input',renderConversations);
document.querySelectorAll('.filter').forEach(btn=>btn.onclick=()=>{document.querySelector('.filter.active').classList.remove('active');btn.classList.add('active');filter=btn.dataset.filter;renderConversations()});
input.addEventListener('input',()=>{resizeInput();updateSendState()});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText()}});
document.querySelector('#sendButton').onclick=sendText;
document.querySelector('#mobileBack').onclick=()=>document.querySelector('.app-shell').classList.remove('chat-open');
document.querySelector('#attachButton').onclick=e=>{e.stopPropagation();const m=document.querySelector('#attachmentMenu');m.hidden=!m.hidden;e.currentTarget.setAttribute('aria-expanded',!m.hidden)};
document.querySelectorAll('#attachmentMenu button').forEach(btn=>btn.onclick=()=>{if(btn.dataset.type==='contact'){histories[activeId].push({mine:true,text:'👤 Contato compartilhado: Marina Costa',time:now()});renderMessages();toast('Contato compartilhado');document.querySelector('#attachmentMenu').hidden=true}else{const fi=document.querySelector('#fileInput');fi.accept=btn.dataset.type==='image'?'image/*':btn.dataset.type==='video'?'video/*':'.pdf,.doc,.docx';fi.dataset.kind=btn.dataset.type;fi.click()}});
document.querySelector('#fileInput').onchange=e=>{const file=e.target.files[0];if(!file)return;const kind=e.target.dataset.kind;if(kind==='image'||kind==='video'){const url=URL.createObjectURL(file);histories[activeId].push({mine:true,media:url,kind,time:now()})}else histories[activeId].push({mine:true,text:`📄 ${file.name}`,time:now()});document.querySelector('#attachmentMenu').hidden=true;renderMessages();toast('Anexo adicionado');e.target.value=''};
document.body.addEventListener('click',e=>{if(!e.target.closest('.attachment-menu')&&!e.target.closest('#attachButton'))document.querySelector('#attachmentMenu').hidden=true});
document.querySelector('#emojiButton').onclick=()=>{input.value+=' 😊';input.focus();updateSendState();resizeInput()};
document.querySelector('#voiceButton').onclick=async()=>{
  try {
    activeStream=await navigator.mediaDevices.getUserMedia({audio:true}); audioChunks=[];
    mediaRecorder=new MediaRecorder(activeStream); mediaRecorder.ondataavailable=e=>{if(e.data.size)audioChunks.push(e.data)}; mediaRecorder.start();
    document.querySelector('#composer').hidden=true;document.querySelector('#recorder').hidden=false;recordingSeconds=0;document.querySelector('#recordTime').textContent='0:00';
    recordInterval=setInterval(()=>{recordingSeconds++;document.querySelector('#recordTime').textContent=`${Math.floor(recordingSeconds/60)}:${String(recordingSeconds%60).padStart(2,'0')}`},1000);
  } catch(e) { toast('Permita o acesso ao microfone para gravar'); }
};
function finishRecording(cancel=false){clearInterval(recordInterval);if(mediaRecorder&&mediaRecorder.state!=='inactive'){mediaRecorder.onstop=()=>{if(!cancel&&audioChunks.length){const url=URL.createObjectURL(new Blob(audioChunks,{type:mediaRecorder.mimeType||'audio/webm'}));const seconds=Math.max(recordingSeconds,1);histories[activeId].push({mine:true,audio:true,url,duration:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,time:now()});renderMessages();toast('Áudio enviado')}else if(cancel)toast('Gravação cancelada')};mediaRecorder.stop()}activeStream?.getTracks().forEach(t=>t.stop());document.querySelector('#recorder').hidden=true;document.querySelector('#composer').hidden=false}
document.querySelector('#cancelRecord').onclick=()=>finishRecording(true);
document.querySelector('#sendRecord').onclick=()=>finishRecording(false);
document.querySelectorAll('.toggle').forEach(t=>t.onclick=()=>t.classList.toggle('on'));
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.querySelector('#searchInput').focus()}});

renderConversations(); renderMessages();

// Configurações, temas e áreas extras do Nexo
const settingsPanel = document.querySelector('#settingsPanel');
const settingDetail = document.querySelector('#settingDetail');
const backdrop = document.querySelector('#panelBackdrop');
const savedTheme = localStorage.getItem('nexo-theme') || 'light';
const savedWall = localStorage.getItem('nexo-wall') || 'dots';
applyTheme(savedTheme); applyWallpaper(savedWall);

function openSettings() {
  settingsPanel.hidden = false; backdrop.hidden = false;
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.section==='settings'));
}
function closePanels() {
  settingsPanel.hidden = true; settingDetail.hidden = true; backdrop.hidden = true;
  document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.section==='chats'));
}
function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark',dark); localStorage.setItem('nexo-theme',theme);
}
function applyWallpaper(wall) {
  document.body.classList.remove('wall-blue','wall-mint','wall-plain');
  if(wall!=='dots') document.body.classList.add(`wall-${wall}`);
  localStorage.setItem('nexo-wall',wall);
}
function row(icon,title,sub,toggle=false,on=true) {
  return `<div class="setting-row"><span>${icon}</span><div><strong>${title}</strong><small>${sub}</small></div>${toggle?`<button class="switch ${on?'on':''}" aria-label="${title}"></button>`:'<em>›</em>'}</div>`;
}
function showSetting(type) {
  const titles={profile:'Perfil',account:'Conta',privacy:'Privacidade',avatar:'Avatar',favorites:'Favoritos',chats:'Conversas',notifications:'Notificações',storage:'Armazenamento e dados',accessibility:'Acessibilidade',help:'Ajuda'};
  document.querySelector('#detailTitle').textContent=titles[type]||'Configurações';
  const body=document.querySelector('#settingDetailBody');
  if(type==='chats') body.innerHTML=`<div class="setting-group"><h3>Tema</h3><div class="theme-cards"><button class="theme-card" data-theme="light"><div class="theme-preview"></div><span>Claro</span></button><button class="theme-card" data-theme="dark"><div class="theme-preview"></div><span>Escuro</span></button><button class="theme-card" data-theme="system"><div class="theme-preview"></div><span>Sistema</span></button></div><h3>Papel de parede</h3><div class="wallpapers"><button class="wallpaper" data-wall="dots" aria-label="Padrão"></button><button class="wallpaper" data-wall="blue" aria-label="Azul"></button><button class="wallpaper" data-wall="mint" aria-label="Verde"></button><button class="wallpaper" data-wall="plain" aria-label="Liso"></button></div></div><div class="setting-group"><h3>Conversas</h3>${row('↵','Enter para enviar','A tecla Enter envia sua mensagem',true,false)}${row('▤','Manter conversas arquivadas','Conversas permanecem arquivadas',true,true)}${row('⇩','Backup de conversas','Último backup: hoje, 14:02')}${row('⌁','Transferir conversas','Mover para outro dispositivo')}${row('♲','Histórico de conversas','Exportar, limpar ou apagar')}</div>`;
  else if(type==='privacy') body.innerHTML=`<div class="setting-group"><h3>Quem pode ver meus dados</h3>${row('◉','Visto por último e online','Meus contatos')}${row('▣','Foto do perfil','Todos')}${row('ⓘ','Recado','Meus contatos')}${row('◌','Status','Meus contatos, exceto 2')}${row('✓','Confirmações de leitura','Ativadas',true,true)}</div><div class="setting-group"><h3>Mensagens</h3>${row('⌛','Duração padrão','Desativada')}${row('⊘','Contatos bloqueados','2 contatos')}${row('♢','Proteção avançada','Desativada')}</div>`;
  else if(type==='notifications') body.innerHTML=`<div class="setting-group"><h3>Mensagens</h3>${row('♧','Sons de conversa','Reproduzir sons recebidos e enviados',true,true)}${row('▣','Notificações na área de trabalho','Mostrar prévias de mensagens',true,true)}${row('◌','Reações','Avisar sobre reações',true,true)}</div><div class="setting-group"><h3>Chamadas</h3>${row('♧','Toque','Nexo')}${row('◔','Silenciar desconhecidos','Chamadas ficam na lista',true,false)}</div>`;
  else if(type==='storage') body.innerHTML=`<div class="setting-group"><h3>Uso</h3>${row('▤','Gerenciar armazenamento','1,2 GB de 128 GB usados')}${row('⇅','Uso de rede','Enviados: 184 MB · Recebidos: 510 MB')}</div><div class="setting-group"><h3>Download automático</h3>${row('▧','Fotos','Wi-Fi e dados móveis')}${row('▶','Vídeos','Apenas Wi-Fi')}${row('▤','Documentos','Apenas Wi-Fi')}${row('♧','Áudios','Wi-Fi e dados móveis')}</div>`;
  else if(type==='favorites') body.innerHTML=`<div class="feature-item"><div class="avatar avatar-lia">L</div><div><strong>Lia Martins</strong><small>Vamos naquele café novo?</small></div><time>14:28</time></div><div class="feature-item"><div class="avatar" style="background:#6c5ce7">N</div><div><strong>Equipe Nexo</strong><small>O protótipo ficou incrível!</small></div><time>Ontem</time></div>`;
  else if(type==='profile') body.innerHTML=`<div class="feature-empty"><img src="nexo-logo.jpeg" alt="Nexo" style="width:120px;height:120px;border-radius:36px;object-fit:cover"><h3>Colli</h3><p>Olá! Estou usando o Nexo.</p></div><div class="setting-group">${row('✎','Nome','Colli')}${row('ⓘ','Recado','Olá! Estou usando o Nexo.')}${row('@','Nome de usuário','@colli')}</div>`;
  else body.innerHTML=`<div class="setting-group"><h3>${titles[type]}</h3>${row('♢','Segurança e controle','Ajuste suas preferências')}${row('◉','Informações pessoais','Gerencie seus dados')}${row('▤','Opções adicionais','Mais recursos do Nexo')}</div>`;
  settingDetail.hidden=false;
  body.querySelectorAll('.switch').forEach(s=>s.onclick=()=>s.classList.toggle('on'));
  body.querySelectorAll('.theme-card').forEach(c=>{c.classList.toggle('active',c.dataset.theme===localStorage.getItem('nexo-theme'));c.onclick=()=>{applyTheme(c.dataset.theme);body.querySelectorAll('.theme-card').forEach(x=>x.classList.toggle('active',x===c));toast(`Tema ${c.textContent.trim()} aplicado`)}});
  body.querySelectorAll('.wallpaper').forEach(c=>{c.classList.toggle('active',c.dataset.wall===localStorage.getItem('nexo-wall'));c.onclick=()=>{applyWallpaper(c.dataset.wall);body.querySelectorAll('.wallpaper').forEach(x=>x.classList.toggle('active',x===c));toast('Papel de parede atualizado')}});
}
function openFeature(type) {
  const view=document.querySelector('#featureView'), title=document.querySelector('#featureTitle'), content=document.querySelector('#featureContent');
  view.hidden=false; backdrop.hidden=false;
  if(type==='updates'){title.textContent='Atualizações';content.innerHTML='<h3>Status</h3><div class="feature-item"><div class="avatar avatar-me">C</div><div><strong>Meu status</strong><small>Toque para adicionar uma atualização</small></div><em>＋</em></div><h3>Canais</h3><div class="feature-empty"><div class="big-icon">◌</div><strong>Acompanhe o que importa</strong><p>Encontre canais e receba novidades.</p></div>'}
  else {title.textContent='Chamadas';content.innerHTML='<h3>Recentes</h3><div class="feature-item"><div class="avatar avatar-lia">L</div><div><strong>Lia Martins</strong><small>↗ Hoje, 12:42</small></div><em>♧</em></div><div class="feature-item"><div class="avatar" style="background:#dc9d57">R</div><div><strong>Rafael Lima</strong><small>↙ Ontem, 18:10</small></div><em>▣</em></div>'}
}

document.querySelector('#settingsButton').onclick=openSettings;
document.querySelector('#settingsBack').onclick=closePanels;
document.querySelector('#detailBack').onclick=()=>settingDetail.hidden=true;
document.querySelector('#featureBack').onclick=()=>{document.querySelector('#featureView').hidden=true;backdrop.hidden=true};
backdrop.onclick=closePanels;
document.querySelectorAll('[data-setting]').forEach(b=>b.onclick=()=>showSetting(b.dataset.setting));
document.querySelectorAll('.bottom-nav [data-section]').forEach(b=>{if(['updates','calls'].includes(b.dataset.section))b.onclick=()=>openFeature(b.dataset.section)});

// Cadastro por telefone (pronto para substituir pelo provedor de SMS em produção)
const authScreen=document.querySelector('#authScreen'),phoneStep=document.querySelector('#phoneStep'),codeStep=document.querySelector('#codeStep');
let pendingPhone='';
if(!localStorage.getItem('nexo-phone')) authScreen.hidden=false;
document.querySelector('#phoneInput').addEventListener('input',e=>{const n=e.target.value.replace(/\D/g,'').slice(0,11);e.target.value=n.length>10?n.replace(/(\d{2})(\d{5})(\d{0,4})/,'($1) $2-$3'):n.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3')});
document.querySelector('#requestCode').onclick=()=>{const digits=document.querySelector('#phoneInput').value.replace(/\D/g,'');if(digits.length<8){document.querySelector('#phoneError').textContent='Digite um número de telefone válido.';return}pendingPhone=document.querySelector('#countryCode').value+digits;document.querySelector('#phonePreview').textContent=pendingPhone;phoneStep.hidden=true;codeStep.hidden=false;document.querySelector('#otpFields input').focus()};
const otpInputs=[...document.querySelectorAll('#otpFields input')];otpInputs.forEach((el,i)=>{el.oninput=()=>{el.value=el.value.replace(/\D/g,'').slice(-1);if(el.value&&otpInputs[i+1])otpInputs[i+1].focus()};el.onkeydown=e=>{if(e.key==='Backspace'&&!el.value&&otpInputs[i-1])otpInputs[i-1].focus()};el.onpaste=e=>{e.preventDefault();const code=e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);code.split('').forEach((v,j)=>{if(otpInputs[j])otpInputs[j].value=v});otpInputs[Math.min(code.length,5)].focus()}});
document.querySelector('#editPhone').onclick=()=>{codeStep.hidden=true;phoneStep.hidden=false};
document.querySelector('#verifyCode').onclick=()=>{const code=otpInputs.map(i=>i.value).join('');if(code!=='123456'){document.querySelector('#codeError').textContent='Código incorreto. No teste, use 123456.';return}localStorage.setItem('nexo-phone',pendingPhone);authScreen.hidden=true;toast('Número confirmado. Bem-vindo ao Nexo!')};

if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
