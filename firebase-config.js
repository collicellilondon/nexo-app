// Configuração pública do Firebase Web App do Nexo.
// Projeto: KidSafe ColliDev Security.
// Phone Authentication está ativado no Firebase.
// Domínios autorizados incluem localhost e collicellilondon.github.io.
// Não coloque service account, chave privada, senha ou segredo neste arquivo.

window.NEXO_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB4CFSnW634akMIpBuohgrWaFS3lC5lmnc",
  authDomain: "kidsafe-collidev-securit-74307.firebaseapp.com",
  projectId: "kidsafe-collidev-securit-74307",
  appId: "1:1006389451626:web:a1cf6db127910c207b2313",
  messagingSenderId: "1006389451626",
  storageBucket: "kidsafe-collidev-securit-74307.firebasestorage.app"
};

// Opcional: URL do backend Nexo OTP quando ele estiver publicado.
// Em Vercel, deixe vazio para usar o mesmo domínio: /api/request-code e /api/verify-code.
// Em GitHub Pages, preencha com a URL do backend Vercel, por exemplo:
// window.NEXO_AUTH_API_BASE = "https://nexo-app.vercel.app";
window.NEXO_AUTH_API_BASE = "";
