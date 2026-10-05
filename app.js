const defaultConversations = [];
const defaultHistories = {};
const seededDemoNames = new Set(['Mamãe','Família','Papai','Nexo','Vovó','Lia Martins','Rafael Lima','Equipe Nexo','Kidsafe Guard']);

let conversations = loadState('nexo-conversations', defaultConversations);
let histories = loadState('nexo-histories', defaultHistories);
let deviceContacts = loadState('nexo-device-contacts', []);
let userProfile = loadState('nexo-profile', {
  name: 'Colli',
  about: 'Disponível',
  username: '@colli',
  photo: '',
  avatar: 'C',
  avatarColor: '#075e54'
});
removeSeededDemoData();
let activeId = conversations[0]?.id || null, filter = 'all', recordingSeconds = 0, recordInterval, mediaRecorder, audioChunks = [], activeStream;
let callStream, callInterval, callSeconds = 0, currentCallType = 'audio';
let db = null, realtimeReady = false, firestorePersistenceTried = false, activeMessagesUnsubscribe = null;
let currentPhone = localStorage.getItem('nexo-phone') || '';
const list = document.querySelector('#conversationList');
const messages = document.querySelector('#messages');
const input = document.querySelector('#messageInput');

function loadState(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function saveAppState() {
  localStorage.setItem('nexo-conversations', JSON.stringify(conversations));
  localStorage.setItem('nexo-histories', JSON.stringify(histories));
  localStorage.setItem('nexo-device-contacts', JSON.stringify(deviceContacts));
  localStorage.setItem('nexo-profile', JSON.stringify(userProfile));
}
saveAppState();

function removeSeededDemoData() {
  const demoIds = new Set();
  conversations = conversations.filter(c => {
    const isOldSeed = Number(c.id) <= 5 && seededDemoNames.has(c.name);
    if(isOldSeed) demoIds.add(String(c.id));
    return !isOldSeed;
  });
  demoIds.forEach(id => delete histories[id]);
}

function createSafetySnapshot() {
  try {
    if(localStorage.getItem('nexo-safety-snapshot-before-phone-auth')) return;
    const snapshot = {
      createdAt: new Date().toISOString(),
      profile: userProfile,
      conversations,
      histories,
      phone: localStorage.getItem('nexo-phone') || ''
    };
    localStorage.setItem('nexo-safety-snapshot-before-phone-auth', JSON.stringify(snapshot));
  } catch {
    // Se o aparelho estiver sem espaço, o app segue sem apagar dados existentes.
  }
}
createSafetySnapshot();

function fileToDataUrl(file) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function initials(name) {
  return (name || 'N').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase() || 'N';
}

function applyUserProfile() {
  userProfile.avatar = userProfile.avatar || initials(userProfile.name);
  document.querySelector('#profileGreeting').textContent = `Olá, ${userProfile.name || 'Nexo'}`;
  document.querySelector('#profileStatusMini').textContent = userProfile.about || 'Disponível';
  document.querySelector('#settingsProfileName').textContent = userProfile.name || 'Nexo';
  document.querySelector('#settingsProfileAbout').textContent = userProfile.about || 'Disponível';
  const mini = document.querySelector('#profileAvatarMini');
  mini.textContent = userProfile.photo ? '' : (userProfile.avatar || initials(userProfile.name));
  mini.style.background = userProfile.photo ? `center/cover url("${userProfile.photo}")` : userProfile.avatarColor;
  const photo = document.querySelector('#settingsProfilePhoto');
  photo.src = userProfile.photo || 'nexo-logo.jpeg';
}

function renderConversations() {
  const term = document.querySelector('#searchInput').value.toLowerCase();
  const visible = conversations.filter(c => {
    const matchesFilter = filter === 'all' || (filter === 'unread' ? c.unread > 0 : c.type === 'groups');
    return matchesFilter && `${c.name} ${c.phone || ''}`.toLowerCase().includes(term);
  });
  if(!visible.length) {
    list.innerHTML = `<div class="empty-conversations">
      <div class="empty-icon">💬</div>
      <strong>${term ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}</strong>
      <p>${term ? 'Tente buscar por nome ou telefone.' : 'Comece buscando um contato da agenda ou digitando um número.'}</p>
      <button id="emptyNewChat" class="secondary-action">Nova conversa</button>
    </div>`;
    list.querySelector('#emptyNewChat')?.addEventListener('click', openContactDiscovery);
    return;
  }
  list.innerHTML = visible.map(c => `<article class="conversation ${c.id===activeId?'active':''}" data-id="${c.id}">
    <div class="avatar" style="background:${c.color}">${escapeHtml(c.initials)}${c.status.includes('online')?'<span class="online-dot"></span>':''}</div>
    <div class="conversation-info"><div class="conversation-top"><strong>${c.name}</strong><time>${c.time}</time></div><p>${c.preview}</p></div>
    ${c.unread?`<span class="unread-badge">${c.unread}</span>`:''}</article>`).join('');
  list.querySelectorAll('.conversation').forEach(el => el.onclick = () => selectChat(+el.dataset.id));
}

function renderMessages() {
  if(!activeId) {
    messages.innerHTML = `<div class="conversation-empty-panel">
      <img src="nexo-logo.jpeg" alt="Nexo">
      <h2>Comece uma conversa real</h2>
      <p>Use a agenda do celular no Android ou digite o número para iniciar. O Nexo não vem mais com dados fictícios.</p>
      <button id="startRealChat" class="primary-action small">Nova conversa</button>
    </div>`;
    document.querySelector('#startRealChat')?.addEventListener('click', openContactDiscovery);
    updateDetailsPanel();
    return;
  }
  const h = histories[activeId] || [];
  messages.innerHTML = '<div class="date-pill">HOJE</div>' + h.map(m => {
    if (m.audio) return `<div class="message-row ${m.mine?'mine':''}"><div class="bubble audio-bubble">${m.url?`<audio src="${m.url}" controls preload="metadata"></audio>`:'<button class="audio-play">▶</button><div class="audio-wave"></div>'}<span class="audio-time">${m.duration}</span><div class="bubble-meta">${m.time}${m.mine?'<span class="checks">✓✓</span>':''}</div></div></div>`;
    if (m.media) return `<div class="message-row ${m.mine?'mine':''}"><div class="bubble image-message">${m.kind==='video'?`<video src="${m.media}" controls></video>`:`<img src="${m.media}" alt="Imagem anexada">`}<div class="bubble-meta">${m.time}<span class="checks">✓✓</span></div></div></div>`;
    return `<div class="message-row ${m.mine?'mine':''}"><div class="bubble">${escapeHtml(m.text)}<div class="bubble-meta">${m.time}${m.mine?'<span class="checks">✓✓</span>':''}</div></div></div>`;
  }).join('');
  messages.scrollTop = messages.scrollHeight;
}

function selectChat(id) {
  activeId=id; const c=conversations.find(x=>x.id===id);
  if(!c) return;
  c.unread=0;
  document.querySelector('#chatName').textContent=c.name; document.querySelector('#chatStatus').textContent=c.status;
  const chatAvatar = document.querySelector('#chatAvatar');
  chatAvatar.innerHTML = `${escapeHtml(c.initials)}${c.status.includes('online')?'<span class="online-dot"></span>':''}`;
  chatAvatar.style.background = c.color;
  updateDetailsPanel();
  renderConversations(); renderMessages(); document.querySelector('.app-shell').classList.add('chat-open');
  listenActiveConversation();
}

async function sendText() {
  if(!activeId) { openContactDiscovery(); return; }
  const text=input.value.trim(); if(!text) return;
  const c=conversations.find(x=>x.id===activeId);
  const message = {mine:true,text,time:now(),localCreatedAt:new Date().toISOString(),syncing:false};
  histories[activeId].push(message); input.value=''; resizeInput(); updateSendState(); renderMessages();
  c.preview=text; c.time=now(); saveAppState(); renderConversations();
  sendRemoteText(c, message);
}
function updateSendState(){const has=input.value.trim();document.querySelector('#composerActionSlot').classList.toggle('typing',!!has)}
function resizeInput(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,110)+'px'}
function now(){return new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function toast(text){const t=document.querySelector('#toast');t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),1900)}

function phoneDigits(phone) {
  return String(phone || '').replace(/\D/g,'');
}

function phoneDocId(phone) {
  return phoneDigits(phone);
}

function remoteChatIdForPhones(a,b) {
  const ids = [phoneDigits(a), phoneDigits(b)].filter(Boolean).sort();
  return ids.length === 2 ? `chat_${ids.join('_')}` : '';
}

function remoteChatIdForConversation(c) {
  if(!c?.phone || !currentPhone) return '';
  return c.remoteChatId || remoteChatIdForPhones(currentPhone, c.phone);
}

function remoteTimestampToTime(createdAt, fallbackIso) {
  try {
    const date = createdAt?.toDate ? createdAt.toDate() : (fallbackIso ? new Date(fallbackIso) : new Date());
    return date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  } catch {
    return now();
  }
}

function initFirestore() {
  if(!initFirebaseAuth() || !window.firebase?.firestore) return false;
  db = firebase.firestore();
  if(!firestorePersistenceTried) {
    firestorePersistenceTried = true;
    db.enablePersistence?.({ synchronizeTabs: true }).catch(()=>{});
  }
  return true;
}

function initRealtimeSync() {
  if(!initFirestore()) return false;
  currentPhone = firebase.auth().currentUser?.phoneNumber || localStorage.getItem('nexo-phone') || currentPhone;
  if(!currentPhone) return false;
  realtimeReady = true;
  syncMyProfile();
  listenActiveConversation();
  return true;
}

function syncMyProfile() {
  if(!db || !currentPhone) return;
  const docId = phoneDocId(currentPhone);
  if(!docId) return;
  db.collection('users').doc(docId).set({
    phone: currentPhone,
    phoneDigits: docId,
    name: userProfile.name || 'Nexo',
    about: userProfile.about || 'Disponível',
    username: userProfile.username || '',
    avatar: userProfile.avatar || initials(userProfile.name),
    avatarColor: userProfile.avatarColor || '#075e54',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true }).catch(()=>{});
}

async function lookupNexoContactsInFirestore(phones) {
  if(!initRealtimeSync()) return new Set();
  const hits = await Promise.all([...new Set(phones)].map(async phone => {
    const docId = phoneDocId(phone);
    if(!docId) return null;
    try {
      const snap = await db.collection('users').doc(docId).get();
      return snap.exists ? phone : null;
    } catch {
      return null;
    }
  }));
  return new Set(hits.filter(Boolean));
}

async function sendRemoteText(c, message) {
  if(!c?.phone) return;
  if(!initRealtimeSync()) {
    message.syncFailed = true;
    saveAppState();
    renderMessages();
    toast('Mensagem salva neste aparelho. Sincronização ainda não conectada.');
    return;
  }
  const chatId = remoteChatIdForConversation(c);
  if(!chatId) return;
  try {
    const ref = db.collection('chats').doc(chatId).collection('messages').doc();
    message.remoteId = ref.id;
    message.syncing = true;
    c.remoteChatId = chatId;
    saveAppState();
    await db.collection('chats').doc(chatId).set({
      id: chatId,
      participants: [phoneDigits(currentPhone), phoneDigits(c.phone)].sort(),
      phones: [currentPhone, c.phone].sort(),
      lastMessage: message.text,
      lastSenderPhone: currentPhone,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await ref.set({
      id: ref.id,
      type: 'text',
      text: message.text,
      senderPhone: currentPhone,
      recipientPhone: c.phone,
      senderName: userProfile.name || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      clientCreatedAt: message.localCreatedAt || new Date().toISOString()
    });
    message.syncing = false;
    message.synced = true;
    saveAppState();
    renderMessages();
  } catch {
    message.syncing = false;
    message.syncFailed = true;
    saveAppState();
    renderMessages();
    toast('Mensagem salva localmente. Ative o Firestore para entregar no outro celular.');
  }
}

function listenActiveConversation() {
  if(activeMessagesUnsubscribe) {
    activeMessagesUnsubscribe();
    activeMessagesUnsubscribe = null;
  }
  const c = conversations.find(x=>x.id===activeId);
  const chatId = remoteChatIdForConversation(c);
  if(!db || !currentPhone || !c || !chatId) return;
  c.remoteChatId = chatId;
  activeMessagesUnsubscribe = db.collection('chats').doc(chatId).collection('messages')
    .orderBy('createdAt','asc')
    .limit(200)
    .onSnapshot(snapshot => {
      const local = histories[activeId] || [];
      let changed = false;
      snapshot.docs.forEach(doc => {
        const data = doc.data() || {};
        if(data.type !== 'text' || !data.text) return;
        const existing = local.find(m => m.remoteId === doc.id);
        if(existing) {
          existing.synced = true;
          existing.syncing = false;
          return;
        }
        local.push({
          mine: data.senderPhone === currentPhone,
          text: data.text,
          time: remoteTimestampToTime(data.createdAt, data.clientCreatedAt),
          remoteId: doc.id,
          synced: true
        });
        changed = true;
      });
      if(changed) {
        histories[activeId] = local;
        const latest = local[local.length - 1];
        if(latest?.text) {
          c.preview = latest.text;
          c.time = latest.time || now();
        }
        saveAppState();
        renderConversations();
        renderMessages();
      }
    }, () => {
      toast('Sincronização de mensagens indisponível. Confira Firestore/Regras.');
    });
}

document.querySelector('#searchInput').addEventListener('input',renderConversations);
document.querySelectorAll('.filter').forEach(btn=>btn.onclick=()=>{document.querySelector('.filter.active').classList.remove('active');btn.classList.add('active');filter=btn.dataset.filter;renderConversations()});
input.addEventListener('input',()=>{resizeInput();updateSendState()});
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendText()}});
document.querySelector('#sendButton').onclick=sendText;
document.querySelector('#mobileBack').onclick=()=>document.querySelector('.app-shell').classList.remove('chat-open');
document.querySelector('#attachButton').onclick=e=>{e.stopPropagation();const m=document.querySelector('#attachmentMenu');m.hidden=!m.hidden;e.currentTarget.setAttribute('aria-expanded',!m.hidden)};
document.querySelectorAll('#attachmentMenu button').forEach(btn=>btn.onclick=()=>{if(btn.dataset.type==='contact'){openContactDiscovery();document.querySelector('#attachmentMenu').hidden=true}else{if(!activeId){openContactDiscovery();return}const fi=document.querySelector('#fileInput');fi.accept=btn.dataset.type==='image'?'image/*':btn.dataset.type==='video'?'video/*':'.pdf,.doc,.docx';fi.dataset.kind=btn.dataset.type;fi.click()}}); 
document.querySelector('#fileInput').onchange=async e=>{const file=e.target.files[0];if(!file||!activeId)return;const kind=e.target.dataset.kind;if(kind==='image'||kind==='video'){const url=await fileToDataUrl(file);histories[activeId].push({mine:true,media:url,kind,fileName:file.name,time:now()})}else histories[activeId].push({mine:true,text:`📄 ${file.name}`,fileName:file.name,time:now()});document.querySelector('#attachmentMenu').hidden=true;saveAppState();renderMessages();toast('Anexo salvo neste aparelho');e.target.value=''};
document.body.addEventListener('click',e=>{if(!e.target.closest('.attachment-menu')&&!e.target.closest('#attachButton'))document.querySelector('#attachmentMenu').hidden=true});
document.querySelector('#emojiButton').onclick=()=>{input.value+=' 😊';input.focus();updateSendState();resizeInput()};
document.querySelector('#voiceButton').onclick=async()=>{
  if(!activeId) { openContactDiscovery(); return; }
  try {
    activeStream=await navigator.mediaDevices.getUserMedia({audio:true}); audioChunks=[];
    mediaRecorder=new MediaRecorder(activeStream); mediaRecorder.ondataavailable=e=>{if(e.data.size)audioChunks.push(e.data)}; mediaRecorder.start();
    document.querySelector('#composer').hidden=true;document.querySelector('#recorder').hidden=false;recordingSeconds=0;document.querySelector('#recordTime').textContent='0:00';
    recordInterval=setInterval(()=>{recordingSeconds++;document.querySelector('#recordTime').textContent=`${Math.floor(recordingSeconds/60)}:${String(recordingSeconds%60).padStart(2,'0')}`},1000);
  } catch(e) { toast('Permita o acesso ao microfone para gravar'); }
};
function finishRecording(cancel=false){clearInterval(recordInterval);if(mediaRecorder&&mediaRecorder.state!=='inactive'){mediaRecorder.onstop=async()=>{if(!cancel&&audioChunks.length){const url=await blobToDataUrl(new Blob(audioChunks,{type:mediaRecorder.mimeType||'audio/webm'}));const seconds=Math.max(recordingSeconds,1);histories[activeId].push({mine:true,audio:true,url,duration:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`,time:now()});saveAppState();renderMessages();toast('Áudio salvo neste aparelho')}else if(cancel)toast('Gravação cancelada')};mediaRecorder.stop()}activeStream?.getTracks().forEach(t=>t.stop());document.querySelector('#recorder').hidden=true;document.querySelector('#composer').hidden=false}
document.querySelector('#cancelRecord').onclick=()=>finishRecording(true);
document.querySelector('#sendRecord').onclick=()=>finishRecording(false);
document.querySelectorAll('.toggle').forEach(t=>t.onclick=()=>t.classList.toggle('on'));
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.querySelector('#searchInput').focus()}});

async function startCall(type='audio') {
  const c = conversations.find(x=>x.id===activeId);
  if(!c) { openContactDiscovery(); return; }
  currentCallType = type;
  callSeconds = 0;
  document.querySelector('#callName').textContent = c.name;
  document.querySelector('#callAvatar').textContent = c.initials;
  document.querySelector('#callAvatar').style.background = c.color;
  document.querySelector('#callMode').textContent = type === 'video' ? 'Chamada de vídeo' : 'Chamada de áudio';
  document.querySelector('#callTimer').textContent = 'conectando...';
  document.querySelector('#callScreen').hidden = false;
  document.querySelector('#localVideo').hidden = type !== 'video';
  document.querySelector('#cameraCall').hidden = type !== 'video';

  try {
    callStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    const video = document.querySelector('#localVideo');
    if (type === 'video') {
      video.srcObject = callStream;
      await video.play();
    }
    document.querySelector('#callTimer').textContent = '00:00';
    clearInterval(callInterval);
    callInterval = setInterval(()=>{
      callSeconds++;
      document.querySelector('#callTimer').textContent = formatDuration(callSeconds);
    },1000);
    toast(type === 'video' ? 'Câmera e microfone conectados' : 'Microfone conectado');
  } catch {
    document.querySelector('#callScreen').hidden = true;
    toast(type === 'video' ? 'Permita câmera e microfone para a chamada' : 'Permita o microfone para a chamada');
  }
}

function endCall() {
  clearInterval(callInterval);
  callStream?.getTracks().forEach(t=>t.stop());
  callStream = null;
  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#callScreen').hidden = true;
  if (callSeconds > 0) {
    if(!activeId) return;
    const label = currentCallType === 'video' ? 'Chamada de vídeo' : 'Chamada de áudio';
    histories[activeId].push({mine:true,text:`${currentCallType === 'video' ? '🎥' : '📞'} ${label} · ${formatDuration(callSeconds)}`,time:now()});
    const c=conversations.find(x=>x.id===activeId);
    c.preview = `${label} · ${formatDuration(callSeconds)}`;
    c.time = now();
    saveAppState();
    renderConversations();
    renderMessages();
  }
}

function formatDuration(total) {
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

document.querySelector('#audioCallButton').onclick=()=>startCall('audio');
document.querySelector('#videoCallButton').onclick=()=>startCall('video');
document.querySelector('#chatSearchButton').onclick=()=>openConversationSearch();
document.querySelector('#endCall').onclick=endCall;
document.querySelector('#muteCall').onclick=e=>{
  const track = callStream?.getAudioTracks()[0];
  if(!track) return;
  track.enabled = !track.enabled;
  e.currentTarget.classList.toggle('off', !track.enabled);
  toast(track.enabled ? 'Microfone ativado' : 'Microfone mutado');
};
document.querySelector('#cameraCall').onclick=e=>{
  const track = callStream?.getVideoTracks()[0];
  if(!track) return;
  track.enabled = !track.enabled;
  e.currentTarget.classList.toggle('off', !track.enabled);
  toast(track.enabled ? 'Câmera ativada' : 'Câmera desligada');
};

function updateDetailsPanel() {
  const c = conversations.find(x=>x.id===activeId);
  if(!c) {
    document.querySelector('.details-avatar').innerHTML = 'N';
    document.querySelector('.details-avatar').style.background = '#087aff';
    document.querySelector('.details-panel h2').textContent = 'Nexo';
    document.querySelector('.details-panel > p').textContent = 'Nenhuma conversa selecionada';
    return;
  }
  document.querySelector('.details-avatar').innerHTML = `${escapeHtml(c.initials)}${c.status.includes('online')?'<span></span>':''}`;
  document.querySelector('.details-avatar').style.background = c.color;
  document.querySelector('.details-panel h2').textContent = c.name;
  document.querySelector('.details-panel > p').textContent = `${c.name.toLowerCase().replace(/\s+/g,'')} · ${c.status}`;
}

function openProfilePanel() {
  updateDetailsPanel();
  document.querySelector('#detailsPanel').classList.add('open');
  document.querySelector('.app-shell').classList.add('details-open');
}

function closeProfilePanel() {
  document.querySelector('#detailsPanel').classList.remove('open');
  document.querySelector('.app-shell').classList.remove('details-open');
}

function toggleChatMenu(force) {
  const menu = document.querySelector('#chatMenu');
  const button = document.querySelector('#chatMenuButton');
  const open = typeof force === 'boolean' ? force : menu.hidden;
  menu.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}

function openConversationSearch() {
  const c = conversations.find(x=>x.id===activeId);
  if(!c) { openContactDiscovery(); return; }
  const term = prompt(`Pesquisar na conversa com ${c.name}:`);
  if(!term) return;
  const found = (histories[activeId] || []).find(m => (m.text || m.fileName || '').toLowerCase().includes(term.toLowerCase()));
  toast(found ? `Encontrado: ${(found.text || found.fileName).slice(0,42)}` : 'Nada encontrado nesta conversa');
}

function handleChatMenu(action) {
  toggleChatMenu(false);
  const c = conversations.find(x=>x.id===activeId);
  if(!c) { openContactDiscovery(); return; }
  if(action === 'profile') openProfilePanel();
  else if(action === 'media') {
    const total = (histories[activeId] || []).filter(m=>m.media || m.audio || m.fileName).length;
    toast(total ? `${total} item(ns) de mídia e arquivos nesta conversa` : 'Nenhuma mídia nesta conversa');
    openProfilePanel();
  }
  else if(action === 'search') openConversationSearch();
  else if(action === 'mute') {
    c.muted = !c.muted;
    saveAppState();
    toast(c.muted ? 'Conversa silenciada' : 'Notificações reativadas');
  }
  else if(action === 'clear') {
    const ok = confirm(`Limpar todas as mensagens com ${c.name} somente neste aparelho?`);
    if(!ok) return;
    histories[activeId] = [];
    c.preview = 'Conversa limpa neste aparelho';
    c.time = now();
    saveAppState();
    renderConversations();
    renderMessages();
    toast('Conversa limpa localmente');
  }
  else if(action === 'block') {
    c.blocked = !c.blocked;
    c.status = c.blocked ? 'bloqueado neste aparelho' : 'online agora';
    saveAppState();
    selectChat(activeId);
    toast(c.blocked ? 'Contato bloqueado localmente' : 'Contato desbloqueado');
  }
}

function normalizeContactPhone(rawValue, fallbackCountry = '+44') {
  const raw = String(rawValue || '').trim();
  if(!raw) return null;
  if(raw.startsWith('+')) {
    const e164 = `+${raw.replace(/\D/g,'')}`;
    return validateE164(e164).ok ? e164 : null;
  }
  return normalizePhoneNumber(fallbackCountry, raw).ok ? normalizePhoneNumber(fallbackCountry, raw).phone : null;
}

async function lookupNexoContacts(phones) {
  const uniquePhones = [...new Set(phones.filter(Boolean))].slice(0,50);
  if(!uniquePhones.length) return new Set();
  try {
    if(brandedOtpApiBase() !== null) {
      const result = await apiPost('/api/contacts-lookup', { phones: uniquePhones });
      return new Set(result.registeredPhones || []);
    }
  } catch {
    // Se o backend OTP ainda não estiver ativo, tenta a lista autenticada do Firestore.
  }
  return lookupNexoContactsInFirestore(uniquePhones);
}

function nextConversationId() {
  return conversations.reduce((max,c)=>Math.max(max, Number(c.id) || 0), 0) + 1;
}

function upsertDeviceContact(contact) {
  const phone = contact.phone;
  if(!phone) return;
  const existing = deviceContacts.find(c=>c.phone === phone);
  if(existing) Object.assign(existing, contact);
  else deviceContacts.push(contact);
}

function createConversationFromContact(contact) {
  const phone = normalizeContactPhone(contact.phone || contact.tel || contact.number);
  if(!phone) { toast('Número inválido'); return; }
  const name = String(contact.name || contact.displayName || phone).trim() || phone;
  const registered = Boolean(contact.registeredNexo);
  upsertDeviceContact({ name, phone, registeredNexo: registered, checkedAt: new Date().toISOString() });
  let c = conversations.find(item => item.phone === phone);
  if(!c) {
    c = {
      id: nextConversationId(),
      name,
      phone,
      initials: initials(name),
      color: colorForText(phone),
      preview: registered ? 'Contato encontrado no Nexo' : 'Contato adicionado. Aguardando confirmação no Nexo.',
      time: now(),
      unread: 0,
      status: registered ? 'usuário Nexo' : 'não verificado no Nexo',
      type: 'all',
      registeredNexo: registered
    };
    conversations.unshift(c);
    histories[c.id] = [];
  } else {
    c.name = name;
    c.initials = initials(name);
    c.registeredNexo = c.registeredNexo || registered;
    c.status = c.registeredNexo ? 'usuário Nexo' : c.status;
  }
  activeId = c.id;
  saveAppState();
  selectChat(c.id);
  document.querySelector('#featureView').hidden = true;
  document.querySelector('#settingsPanel').hidden = true;
  document.querySelector('#settingDetail').hidden = true;
  document.querySelector('#panelBackdrop').hidden = true;
  toast(registered ? 'Contato Nexo encontrado' : 'Contato salvo localmente');
}

function colorForText(value) {
  const palette = ['#075e54','#128c7e','#087aff','#0e8f9f','#7c6a46','#8b5cf6','#c8738b','#4aa880','#dc9d57'];
  let hash = 0;
  String(value || 'Nexo').split('').forEach(ch=>{hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0});
  return palette[Math.abs(hash) % palette.length];
}

function contactDiscoveryMarkup() {
  const supportsContacts = Boolean(navigator.contacts?.select);
  const saved = deviceContacts.slice(0,20);
  return `<h3>Nova conversa</h3>
    <div class="contact-tools">
      <button class="primary-action small" id="pickDeviceContact">${supportsContacts ? 'Buscar na agenda do celular' : 'Agenda indisponível neste navegador'}</button>
      <p>${supportsContacts ? 'O Android vai abrir a agenda nativa. Você escolhe quais contatos compartilhar com o Nexo.' : 'No iPhone/Safari, o PWA não consegue abrir a agenda. Digite o número abaixo.'}</p>
      <label class="manual-contact-field"><span>Nome</span><input id="manualContactName" autocomplete="name" placeholder="Nome do contato"></label>
      <label class="manual-contact-field"><span>Telefone</span><input id="manualContactPhone" inputmode="tel" autocomplete="tel" placeholder="+44 7123 456789"></label>
      <button class="secondary-action" id="addManualContact">Adicionar conversa</button>
    </div>
    <div class="setting-group">
      <h3>Contatos salvos neste aparelho</h3>
      ${saved.length ? saved.map(c=>`<button class="contact-result" data-phone="${escapeHtml(c.phone)}"><span>${escapeHtml(initials(c.name))}</span><div><strong>${escapeHtml(c.name)}</strong><small>${escapeHtml(c.phone)} · ${c.registeredNexo ? 'tem Nexo' : 'não verificado'}</small></div><em>›</em></button>`).join('') : '<p class="setting-note">Nenhum contato importado ainda.</p>'}
    </div>`;
}

async function pickDeviceContacts() {
  if(!navigator.contacts?.select) {
    toast('Agenda disponível apenas em navegadores compatíveis, como Chrome no Android');
    return;
  }
  try {
    const contacts = await navigator.contacts.select(['name','tel'], { multiple: true });
    const prepared = contacts.flatMap(contact => {
      const name = Array.isArray(contact.name) ? contact.name[0] : contact.name;
      const phones = Array.isArray(contact.tel) ? contact.tel : [contact.tel];
      return phones.map(phone => ({ name: name || phone, phone: normalizeContactPhone(phone) })).filter(c=>c.phone);
    });
    if(!prepared.length) { toast('Nenhum número válido selecionado'); return; }
    const registeredPhones = await lookupNexoContacts(prepared.map(c=>c.phone));
    prepared.forEach(c=>upsertDeviceContact({...c, registeredNexo: registeredPhones.has(c.phone), checkedAt: new Date().toISOString()}));
    saveAppState();
    createConversationFromContact({...prepared[0], registeredNexo: registeredPhones.has(prepared[0].phone)});
  } catch(err) {
    if(err?.name !== 'AbortError') toast('Não consegui ler o contato selecionado');
  }
}

function openContactDiscovery() {
  const view=document.querySelector('#featureView'), title=document.querySelector('#featureTitle'), content=document.querySelector('#featureContent');
  title.textContent='Nova conversa';
  content.innerHTML=contactDiscoveryMarkup();
  view.hidden=false; backdrop.hidden=false;
  content.querySelector('#pickDeviceContact')?.addEventListener('click', pickDeviceContacts);
  content.querySelector('#addManualContact')?.addEventListener('click', async()=>{
    const name = content.querySelector('#manualContactName').value.trim();
    const phone = normalizeContactPhone(content.querySelector('#manualContactPhone').value);
    if(!phone) { toast('Digite um telefone válido com DDI'); return; }
    const registeredPhones = await lookupNexoContacts([phone]);
    createConversationFromContact({ name: name || phone, phone, registeredNexo: registeredPhones.has(phone) });
  });
  content.querySelectorAll('.contact-result').forEach(btn=>btn.addEventListener('click',()=>{
    const contact = deviceContacts.find(c=>c.phone === btn.dataset.phone);
    if(contact) createConversationFromContact(contact);
  }));
}

document.querySelector('#chatAvatar').onclick=openProfilePanel;
document.querySelector('.chat-person').onclick=openProfilePanel;
document.querySelector('#closeDetails').onclick=closeProfilePanel;
document.querySelector('.profile-row').onclick=()=>{openSettings();showSetting('profile')};
document.querySelector('#newChatButton').onclick=openContactDiscovery;
document.querySelector('#addContactButton').onclick=openContactDiscovery;
document.querySelectorAll('[data-quick-theme]').forEach(btn=>btn.addEventListener('click',()=>{
  applyTheme(btn.dataset.quickTheme);
  toast(`Tema ${btn.textContent.trim()} aplicado`);
}));
document.querySelectorAll('.quick-actions button').forEach((btn,i)=>btn.onclick=()=>{if(i===0)startCall('audio');else if(i===1)startCall('video');else if(activeId) toast('Busca no perfil ativada'); else openContactDiscovery()});
document.querySelectorAll('.detail-card button').forEach(btn=>btn.onclick=()=>toast(btn.textContent.trim() || 'Opção aberta'));
document.querySelector('.danger-action').onclick=()=>toast('Bloqueio ficará disponível com contatos reais');
document.querySelector('#chatMenuButton').onclick=e=>{e.stopPropagation();toggleChatMenu()};
document.querySelectorAll('#chatMenu [data-menu-action]').forEach(btn=>btn.onclick=()=>handleChatMenu(btn.dataset.menuAction));
document.addEventListener('click',e=>{if(!e.target.closest('#chatMenu')&&!e.target.closest('#chatMenuButton'))toggleChatMenu(false)});

applyUserProfile();
updateDetailsPanel();
renderConversations(); renderMessages(); updateSendState();

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
  document.querySelectorAll('[data-quick-theme]').forEach(btn=>{
    const quickTheme = dark ? 'dark' : 'light';
    btn.classList.toggle('active', btn.dataset.quickTheme === quickTheme);
  });
}
function applyWallpaper(wall) {
  document.body.classList.remove('wall-blue','wall-mint','wall-plain');
  if(wall!=='dots') document.body.classList.add(`wall-${wall}`);
  localStorage.setItem('nexo-wall',wall);
}
function row(icon,title,sub,toggle=false,on=true) {
  return `<div class="setting-row"><span>${icon}</span><div><strong>${title}</strong><small>${sub}</small></div>${toggle?`<button class="switch ${on?'on':''}" aria-label="${title}"></button>`:'<em>›</em>'}</div>`;
}
function localBackupMarkup() {
  return `<div class="local-backup-card">
    <strong>Backup local deste aparelho</strong>
    <p>Exporta nome, foto/avatar, conversas, áudios, fotos, vídeos e anexos salvos neste navegador. Nada é enviado para nuvem.</p>
    <div class="backup-actions">
      <button class="primary-action small" id="exportBackup">Baixar backup local</button>
      <button class="secondary-action" id="restoreBackup">Restaurar backup</button>
    </div>
  </div>`;
}
function profileEditorMarkup() {
  const photo = userProfile.photo || 'nexo-logo.jpeg';
  return `<div class="profile-editor">
    <button class="profile-photo-edit" id="changeProfilePhoto" title="Trocar foto do usuário">
      <img src="${photo}" alt="Foto do perfil">
      <span>📷 Trocar foto do usuário</span>
    </button>
    <div class="profile-actions">
      <button class="secondary-action" id="changePhotoAction">Escolher foto</button>
      <button class="secondary-action" id="useAvatarAction">Usar avatar</button>
    </div>
    <label>Nome<input id="editProfileName" maxlength="36" value="${escapeHtml(userProfile.name || '')}" placeholder="Seu nome"></label>
    <label>Frase de status / recado<input id="editProfileAbout" maxlength="80" value="${escapeHtml(userProfile.about || '')}" placeholder="Ex: Disponível, na escola, em aula..."></label>
    <label>Nome de usuário<input id="editProfileUsername" maxlength="32" value="${escapeHtml(userProfile.username || '')}" placeholder="@usuario"></label>
    <button class="primary-action" id="saveProfile">Salvar nome, foto e status</button>
    <small class="profile-hint">Essas informações ficam salvas somente neste celular.</small>
  </div>`;
}
function avatarEditorMarkup() {
  const colors = ['#075e54','#128c7e','#34b7f1','#7c6a46','#8b5cf6','#c8738b','#4aa880','#dc9d57'];
  const avatars = ['C','N','😊','⭐','🌙','🚀','🎧','💬'];
  return `<div class="setting-group"><h3>Avatar</h3><p class="setting-note">Escolha um avatar rápido quando não quiser usar foto.</p><div class="avatar-grid">
    ${avatars.map((a,i)=>`<button class="avatar-choice" data-avatar="${a}" data-color="${colors[i]}"><span style="background:${colors[i]}">${a}</span></button>`).join('')}
  </div><button class="secondary-action" id="removeProfilePhoto">Usar avatar em vez da foto</button></div>`;
}
function exportLocalBackup() {
  const payload = {
    app: 'Nexo',
    version: 1,
    createdAt: new Date().toISOString(),
    profile: userProfile,
    conversations,
    histories,
    settings: {
      phone: localStorage.getItem('nexo-phone') || '',
      theme: localStorage.getItem('nexo-theme') || 'light',
      wallpaper: localStorage.getItem('nexo-wall') || 'dots'
    }
  };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nexo-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup local baixado');
}
async function restoreLocalBackup(file) {
  try {
    const data = JSON.parse(await file.text());
    if(data.app !== 'Nexo' || !data.conversations || !data.histories) throw new Error('invalid');
    const ok = confirm('Restaurar este backup vai substituir as conversas e o perfil salvos neste aparelho. Continuar?');
    if(!ok) return;
    userProfile = data.profile || userProfile;
    conversations = data.conversations;
    histories = data.histories;
    if(data.settings?.phone) localStorage.setItem('nexo-phone', data.settings.phone);
    if(data.settings?.theme) applyTheme(data.settings.theme);
    if(data.settings?.wallpaper) applyWallpaper(data.settings.wallpaper);
    saveAppState();
    applyUserProfile();
    updateDetailsPanel();
    renderConversations();
    renderMessages();
    toast('Backup local restaurado');
  } catch {
    toast('Arquivo de backup inválido');
  }
}
function showSetting(type) {
  const titles={profile:'Perfil',contacts:'Contatos',account:'Conta',privacy:'Privacidade',avatar:'Avatar',favorites:'Favoritos',chats:'Conversas',notifications:'Notificações',storage:'Armazenamento e dados',accessibility:'Acessibilidade',help:'Ajuda'};
  document.querySelector('#detailTitle').textContent=titles[type]||'Configurações';
  const body=document.querySelector('#settingDetailBody');
  if(type==='contacts') body.innerHTML=contactDiscoveryMarkup();
  else if(type==='chats') body.innerHTML=`<div class="setting-group"><h3>Tema</h3><div class="theme-cards"><button class="theme-card" data-theme="light"><div class="theme-preview"></div><span>Claro</span></button><button class="theme-card" data-theme="dark"><div class="theme-preview"></div><span>Escuro</span></button><button class="theme-card" data-theme="system"><div class="theme-preview"></div><span>Sistema</span></button></div><h3>Papel de parede</h3><div class="wallpapers"><button class="wallpaper" data-wall="dots" aria-label="Padrão"></button><button class="wallpaper" data-wall="blue" aria-label="Azul"></button><button class="wallpaper" data-wall="mint" aria-label="Verde"></button><button class="wallpaper" data-wall="plain" aria-label="Liso"></button></div></div><div class="setting-group"><h3>Conversas</h3>${row('↵','Enter para enviar','A tecla Enter envia sua mensagem',true,false)}${row('▤','Manter conversas arquivadas','Conversas permanecem arquivadas',true,true)}${row('♲','Histórico local','Mensagens e mídias ficam salvas neste aparelho')}</div>${localBackupMarkup()}`;
  else if(type==='privacy') body.innerHTML=`<div class="setting-group"><h3>Quem pode ver meus dados</h3>${row('◉','Visto por último e online','Meus contatos')}${row('▣','Foto do perfil','Meus contatos')}${row('ⓘ','Recado','Meus contatos')}${row('◌','Status','Meus contatos')}${row('✓','Confirmações de leitura','Ativadas',true,true)}</div><div class="setting-group"><h3>Mensagens</h3>${row('⌛','Duração padrão','Desativada')}${row('⊘','Contatos bloqueados','Nenhum contato')}${row('♢','Proteção avançada','Desativada')}</div>`;
  else if(type==='notifications') body.innerHTML=`<div class="setting-group"><h3>Mensagens</h3>${row('♧','Sons de conversa','Reproduzir sons recebidos e enviados',true,true)}${row('▣','Notificações na área de trabalho','Mostrar prévias de mensagens',true,true)}${row('◌','Reações','Avisar sobre reações',true,true)}</div><div class="setting-group"><h3>Chamadas</h3>${row('♧','Toque','Nexo')}${row('◔','Silenciar desconhecidos','Chamadas ficam na lista',true,false)}</div>`;
  else if(type==='storage') body.innerHTML=`<div class="setting-group"><h3>Uso</h3>${row('▤','Gerenciar armazenamento','Dados salvos somente neste aparelho')}${row('⇅','Uso de rede','Disponível quando a sincronização estiver ativa')}</div><div class="setting-group"><h3>Download automático</h3>${row('▧','Fotos','Perguntar antes de salvar')}${row('▶','Vídeos','Perguntar antes de salvar')}${row('▤','Documentos','Perguntar antes de salvar')}${row('♧','Áudios','Salvar quando enviado ou recebido')}</div>`;
  else if(type==='favorites') body.innerHTML=`<div class="feature-empty"><div class="big-icon">☆</div><strong>Nenhum favorito ainda</strong><p>Mensagens e contatos marcados como favoritos aparecerão aqui.</p></div>`;
  else if(type==='avatar') body.innerHTML=avatarEditorMarkup();
  else if(type==='profile') body.innerHTML=profileEditorMarkup();
  else body.innerHTML=`<div class="setting-group"><h3>${titles[type]}</h3>${row('♢','Segurança e controle','Ajuste suas preferências')}${row('◉','Informações pessoais','Gerencie seus dados')}${row('▤','Opções adicionais','Mais recursos do Nexo')}</div>`;
  settingDetail.hidden=false;
  body.querySelectorAll('.switch').forEach(s=>s.onclick=()=>s.classList.toggle('on'));
  body.querySelectorAll('.theme-card').forEach(c=>{c.classList.toggle('active',c.dataset.theme===localStorage.getItem('nexo-theme'));c.onclick=()=>{applyTheme(c.dataset.theme);body.querySelectorAll('.theme-card').forEach(x=>x.classList.toggle('active',x===c));toast(`Tema ${c.textContent.trim()} aplicado`)}});
  body.querySelectorAll('.wallpaper').forEach(c=>{c.classList.toggle('active',c.dataset.wall===localStorage.getItem('nexo-wall'));c.onclick=()=>{applyWallpaper(c.dataset.wall);body.querySelectorAll('.wallpaper').forEach(x=>x.classList.toggle('active',x===c));toast('Papel de parede atualizado')}});
  body.querySelector('#exportBackup')?.addEventListener('click',exportLocalBackup);
  body.querySelector('#restoreBackup')?.addEventListener('click',()=>document.querySelector('#restoreBackupInput').click());
  body.querySelector('#pickDeviceContact')?.addEventListener('click', pickDeviceContacts);
  body.querySelector('#addManualContact')?.addEventListener('click', async()=>{
    const name = body.querySelector('#manualContactName').value.trim();
    const phone = normalizeContactPhone(body.querySelector('#manualContactPhone').value);
    if(!phone) { toast('Digite um telefone válido com DDI'); return; }
    const registeredPhones = await lookupNexoContacts([phone]);
    createConversationFromContact({ name: name || phone, phone, registeredNexo: registeredPhones.has(phone) });
  });
  body.querySelectorAll('.contact-result').forEach(btn=>btn.addEventListener('click',()=>{
    const contact = deviceContacts.find(c=>c.phone === btn.dataset.phone);
    if(contact) createConversationFromContact(contact);
  }));
  body.querySelector('#changeProfilePhoto')?.addEventListener('click',()=>document.querySelector('#profilePhotoInput').click());
  body.querySelector('#changePhotoAction')?.addEventListener('click',()=>document.querySelector('#profilePhotoInput').click());
  body.querySelector('#useAvatarAction')?.addEventListener('click',()=>showSetting('avatar'));
  body.querySelector('#editProfileAbout')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();body.querySelector('#saveProfile')?.click()}});
  body.querySelector('#saveProfile')?.addEventListener('click',()=>{
    userProfile.name = document.querySelector('#editProfileName').value.trim() || 'Nexo';
    userProfile.about = document.querySelector('#editProfileAbout').value.trim() || 'Disponível';
    userProfile.username = document.querySelector('#editProfileUsername').value.trim() || `@${userProfile.name.toLowerCase().replace(/\W+/g,'')}`;
    userProfile.avatar = initials(userProfile.name);
    saveAppState();
    applyUserProfile();
    syncMyProfile();
    toast('Perfil atualizado');
  });
  body.querySelector('#removeProfilePhoto')?.addEventListener('click',()=>{
    userProfile.photo = '';
    saveAppState();
    applyUserProfile();
    showSetting('avatar');
    toast('Avatar ativado');
  });
  body.querySelectorAll('.avatar-choice').forEach(btn=>btn.onclick=()=>{
    userProfile.photo = '';
    userProfile.avatar = btn.dataset.avatar;
    userProfile.avatarColor = btn.dataset.color;
    saveAppState();
    applyUserProfile();
    toast('Avatar atualizado');
  });
}
function openFeature(type) {
  const view=document.querySelector('#featureView'), title=document.querySelector('#featureTitle'), content=document.querySelector('#featureContent');
  view.hidden=false; backdrop.hidden=false;
  if(type==='updates'){title.textContent='Atualizações';content.innerHTML='<h3>Status</h3><div class="feature-item"><div class="avatar avatar-me">C</div><div><strong>Meu status</strong><small>Toque para adicionar uma atualização</small></div><em>＋</em></div><h3>Canais</h3><div class="feature-empty"><div class="big-icon">◌</div><strong>Nenhuma atualização ainda</strong><p>Quando você ou seus contatos publicarem status, eles aparecerão aqui.</p></div>'}
  else {title.textContent='Chamadas';content.innerHTML='<h3>Recentes</h3><div class="feature-empty"><div class="big-icon">♧</div><strong>Nenhuma chamada ainda</strong><p>Inicie uma conversa real e use os botões de áudio ou vídeo.</p></div>'}
}

document.querySelector('#settingsButton').onclick=openSettings;
document.querySelector('#settingsBack').onclick=closePanels;
document.querySelector('#detailBack').onclick=()=>settingDetail.hidden=true;
document.querySelector('#featureBack').onclick=()=>{document.querySelector('#featureView').hidden=true;backdrop.hidden=true};
backdrop.onclick=closePanels;
document.querySelectorAll('[data-setting]').forEach(b=>b.onclick=()=>showSetting(b.dataset.setting));
document.querySelectorAll('.bottom-nav [data-section]').forEach(b=>{if(['updates','calls'].includes(b.dataset.section))b.onclick=()=>openFeature(b.dataset.section)});
document.querySelector('#profilePhotoInput').onchange=async e=>{
  const file = e.target.files[0];
  if(!file) return;
  userProfile.photo = await fileToDataUrl(file);
  saveAppState();
  applyUserProfile();
  showSetting('profile');
  toast('Foto do perfil salva neste aparelho');
  e.target.value = '';
};
document.querySelector('#restoreBackupInput').onchange=e=>{
  const file = e.target.files[0];
  if(file) restoreLocalBackup(file);
  e.target.value = '';
};

// Cadastro por telefone: Firebase em produção, demo apenas em preview/local.
const authScreen=document.querySelector('#authScreen'),phoneStep=document.querySelector('#phoneStep'),codeStep=document.querySelector('#codeStep');
let pendingPhone='', firebaseConfirmation=null, firebaseRecaptcha=null, authMode='demo';
if(!localStorage.getItem('nexo-phone')) authScreen.hidden=false;

const phoneInput=document.querySelector('#phoneInput'), countryCodeSelect=document.querySelector('#countryCode');
const phonePlaceholders={'+44':'07123 456789','+55':'(11) 99999-9999','+351':'912 345 678'};
countryCodeSelect.addEventListener('change',()=>{
  phoneInput.placeholder=phonePlaceholders[countryCodeSelect.value]||'Número de telefone';
  phoneInput.value='';
  document.querySelector('#phoneError').textContent='';
  document.querySelector('#authModeHint').textContent='Digite seu número e aguarde o SMS de confirmação.';
  phoneInput.focus();
});

function formatPhoneForCountry(rawValue, countryCode) {
  let value=rawValue.replace(/[^\d+]/g,'');
  value=value.replace(/(?!^)\+/g,'');
  if(!value.startsWith('+')) {
    const digits=value.replace(/\D/g,'').slice(0,15);
    if(countryCode==='+44') value=digits.replace(/^(\d{5})(\d{0,6}).*/,'$1 $2').trim();
    else if(countryCode==='+55') value=digits.length>10?digits.replace(/(\d{2})(\d{5})(\d{0,4}).*/,'($1) $2-$3'):digits.replace(/(\d{2})(\d{4})(\d{0,4}).*/,'($1) $2-$3');
    else if(countryCode==='+351') value=digits.replace(/^(\d{3})(\d{0,3})(\d{0,3}).*/,'$1 $2 $3').trim();
    else value=digits;
  }
  return value;
}

phoneInput.addEventListener('input',e=>{
  e.target.value=formatPhoneForCountry(e.target.value, countryCodeSelect.value);
});

function normalizePhoneNumber(countryCode, rawValue) {
  const raw = rawValue.trim();
  let digits = raw.replace(/\D/g,'');
  if(!digits) return { ok:false, error:'Digite um número de telefone válido.' };

  if(raw.startsWith('+')) {
    const e164='+'+digits;
    return validateE164(e164);
  }

  if(raw.startsWith('00')) {
    return validateE164('+'+digits.slice(2));
  }

  const countryDigits=countryCode.replace(/\D/g,'');
  if(digits.startsWith(countryDigits) && digits.length > countryDigits.length + 5) {
    return validateE164('+'+digits);
  }

  if(countryCode==='+44') digits=digits.replace(/^0+/,'');
  const e164=countryCode+digits;
  return validateE164(e164);
}

function validateE164(phone) {
  const digits=phone.replace(/\D/g,'');
  if(!/^\+\d{8,15}$/.test(phone)) return { ok:false, error:'Use o número com DDD/código local. Ex.: +44 7123 456789.' };
  if(phone.startsWith('+44') && !/^\+44[1-9]\d{8,9}$/.test(phone)) return { ok:false, error:'Número do Reino Unido inválido. Use assim: 07123 456789 ou +44 7123 456789.' };
  return { ok:true, phone, digits };
}

function localAuthDemoAllowed() {
  return ['localhost', '127.0.0.1', ''].includes(location.hostname) || location.protocol === 'file:';
}

function firebaseConfigReady() {
  const cfg = window.NEXO_FIREBASE_CONFIG;
  return !!(window.firebase && cfg && cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
}

function initFirebaseAuth() {
  if(!firebaseConfigReady()) return false;
  if(!firebase.apps.length) firebase.initializeApp(window.NEXO_FIREBASE_CONFIG);
  firebase.auth().languageCode = 'pt-BR';
  return true;
}

function brandedOtpApiBase() {
  const configured = (window.NEXO_AUTH_API_BASE || '').replace(/\/+$/,'');
  if(configured) return configured;
  if(location.hostname.endsWith('.vercel.app')) return '';
  return null;
}

async function apiPost(path, body) {
  const base = brandedOtpApiBase();
  if(base === null) throw Object.assign(new Error('Nexo OTP API não configurada.'), { code:'api-not-configured' });
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(()=>({}));
  if(!response.ok || data.ok === false) {
    const err = new Error(data.error || 'Falha na API Nexo OTP.');
    err.code = data.code || `api-${response.status}`;
    throw err;
  }
  return data;
}

function firebasePhoneErrorMessage(err) {
  const code=err?.code || 'erro-desconhecido';
  const messages={
    'auth/invalid-phone-number':'Número inválido para SMS. No Reino Unido use 07123 456789 ou +44 7123 456789.',
    'auth/billing-not-enabled':'O SMS real está bloqueado porque o projeto Firebase ainda não tem faturamento ativo. Ative o plano Blaze/Google Cloud Billing no projeto para liberar envio de SMS.',
    'auth/too-many-requests':'Muitas tentativas. Aguarde alguns minutos antes de pedir outro SMS.',
    'auth/quota-exceeded':'A cota de SMS do Firebase acabou. No plano gratuito, novos projetos podem ter limite diário baixo.',
    'auth/captcha-check-failed':'O reCAPTCHA falhou. Recarregue a página e tente novamente.',
    'auth/unauthorized-domain':'Este domínio não está autorizado no Firebase. Use o link publicado do GitHub Pages ou autorize este domínio.',
    'auth/network-request-failed':'Falha de rede ao falar com o Firebase. Confira a internet e tente novamente.'
  };
  return messages[code] || `Não consegui enviar o SMS pelo Firebase (${code}).`;
}

function brandedOtpErrorMessage(err) {
  const code=err?.code || 'api-error';
  const messages={
    'api-not-configured':'Backend NexoApp SMS ainda não configurado.',
    'missing-env':'Backend NexoApp SMS sem variáveis Twilio/Firebase. Configure os segredos no Vercel.',
    'invalid-phone':'Número inválido para SMS. No Reino Unido use 07123 456789 ou +44 7123 456789.',
    'invalid-code':'Código incorreto ou expirado.',
    'verification-failed':'Não consegui validar o código SMS.',
    'too-many-requests':'Muitas tentativas. Aguarde alguns minutos antes de pedir outro SMS.',
    'origin-not-allowed':'Este domínio não está autorizado na API Nexo OTP.'
  };
  return messages[code] || `Não consegui usar o SMS NexoApp (${code}).`;
}

async function sendPhoneCode(phone) {
  document.querySelector('#phoneError').textContent = '';
  document.querySelector('#codeError').textContent = '';
  firebaseConfirmation = null;
  if(brandedOtpApiBase() !== null && initFirebaseAuth()) {
    authMode = 'branded';
    try {
      await apiPost('/api/request-code', { phone });
      document.querySelector('#authModeHint').textContent = 'SMS NexoApp enviado. Digite o código recebido no telefone.';
      return true;
    } catch(err) {
      if(err.code !== 'api-not-configured') {
        document.querySelector('#phoneError').textContent = brandedOtpErrorMessage(err);
        document.querySelector('#authModeHint').textContent = 'Cadastro por SMS NexoApp ativo. Tente novamente em alguns segundos.';
        return false;
      }
    }
  }
  if(initFirebaseAuth()) {
    authMode = 'firebase';
    try {
      if(firebaseRecaptcha?.clear) firebaseRecaptcha.clear();
      document.querySelector('#recaptchaContainer').innerHTML = '';
      firebaseRecaptcha = new firebase.auth.RecaptchaVerifier('recaptchaContainer', { size: 'invisible' });
      firebaseConfirmation = await firebase.auth().signInWithPhoneNumber(phone, firebaseRecaptcha);
      document.querySelector('#authModeHint').textContent = 'SMS enviado. Digite o código recebido no telefone.';
      return true;
    } catch(err) {
      if(localAuthDemoAllowed()) {
        authMode = 'firebase';
        document.querySelector('#phoneError').textContent = `${firebasePhoneErrorMessage(err)} No preview local, se quiser testar SMS real, prefira http://localhost:4187 em vez de 127.0.0.1.`;
        document.querySelector('#authModeHint').textContent = 'O código só aparece depois do SMS real ser enviado.';
        return false;
      }
      authMode = 'firebase';
      document.querySelector('#phoneError').textContent = firebasePhoneErrorMessage(err);
      document.querySelector('#authModeHint').textContent = 'Cadastro real por SMS ativo. Tente novamente em alguns segundos.';
      return false;
    }
  }
  if(!localAuthDemoAllowed()) {
    authMode = 'firebase';
    document.querySelector('#phoneError').textContent = 'Firebase não carregou. Recarregue a página e tente novamente.';
    document.querySelector('#authModeHint').textContent = 'Cadastro real por SMS ativo.';
    return false;
  }
  authMode = 'demo';
  document.querySelector('#authModeHint').innerHTML = 'Modo de teste local: use o código <strong>123456</strong>';
  return true;
}

async function verifyPhoneCode(code) {
  if(authMode === 'branded') {
    const result = await apiPost('/api/verify-code', { phone: pendingPhone, code });
    if(!result.customToken) return false;
    if(!initFirebaseAuth()) throw new Error('Firebase não carregou.');
    await firebase.auth().signInWithCustomToken(result.customToken);
    return true;
  }
  if(authMode === 'firebase' && firebaseConfirmation) {
    await firebaseConfirmation.confirm(code);
    return true;
  }
  return code === '123456';
}

document.querySelector('#requestCode').onclick=async()=>{const phoneResult=normalizePhoneNumber(countryCodeSelect.value,phoneInput.value);document.querySelector('#phoneError').textContent='';if(!phoneResult.ok){document.querySelector('#phoneError').textContent=phoneResult.error;return}pendingPhone=phoneResult.phone;document.querySelector('#requestCode').disabled=true;document.querySelector('#requestCode').textContent='Enviando...';const ok=await sendPhoneCode(pendingPhone);document.querySelector('#requestCode').disabled=false;document.querySelector('#requestCode').textContent='Continuar';if(!ok)return;document.querySelector('#phonePreview').textContent=pendingPhone;phoneStep.hidden=true;codeStep.hidden=false;document.querySelector('#otpFields input').focus()};
const otpInputs=[...document.querySelectorAll('#otpFields input')];otpInputs.forEach((el,i)=>{el.oninput=()=>{el.value=el.value.replace(/\D/g,'').slice(-1);if(el.value&&otpInputs[i+1])otpInputs[i+1].focus()};el.onkeydown=e=>{if(e.key==='Backspace'&&!el.value&&otpInputs[i-1])otpInputs[i-1].focus()};el.onpaste=e=>{e.preventDefault();const code=e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);code.split('').forEach((v,j)=>{if(otpInputs[j])otpInputs[j].value=v});otpInputs[Math.min(code.length,5)].focus()}});
document.querySelector('#editPhone').onclick=()=>{codeStep.hidden=true;phoneStep.hidden=false};
document.querySelector('#verifyCode').onclick=async()=>{const code=otpInputs.map(i=>i.value).join('');document.querySelector('#codeError').textContent='';document.querySelector('#verifyCode').disabled=true;document.querySelector('#verifyCode').textContent='Verificando...';try{const ok=await verifyPhoneCode(code);if(!ok){document.querySelector('#codeError').textContent=authMode==='demo'?'Código incorreto. No teste, use 123456.':'Código incorreto ou expirado.';return}localStorage.setItem('nexo-phone',pendingPhone);localStorage.setItem('nexo-auth-mode',authMode);currentPhone=pendingPhone;saveAppState();initRealtimeSync();authScreen.hidden=true;toast('Número confirmado. Bem-vindo ao Nexo!')}catch{document.querySelector('#codeError').textContent='Não consegui confirmar o código. Tente novamente.'}finally{document.querySelector('#verifyCode').disabled=false;document.querySelector('#verifyCode').textContent='Verificar e entrar'}};

function bootFirebaseSession() {
  if(!firebaseConfigReady()) return;
  try {
    initFirebaseAuth();
    firebase.auth().onAuthStateChanged(user => {
      if(user?.phoneNumber) {
        currentPhone = user.phoneNumber;
        localStorage.setItem('nexo-phone', currentPhone);
        authScreen.hidden = true;
      } else {
        currentPhone = localStorage.getItem('nexo-phone') || currentPhone;
      }
      initRealtimeSync();
    });
  } catch {
    // O app continua local se Firebase ou Firestore não estiverem disponíveis.
  }
}

bootFirebaseSession();
if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
