import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Home, FileText, Clock, DollarSign, Wrench, ClipboardList, Users,
  MessageCircle, Camera, MapPin, Send, X, Check, ChevronLeft, Plus,
  Trash2, Snowflake, Zap, Receipt, BarChart3, Eraser, Loader2, RefreshCw, Menu,
  CheckCircle2, Beer, TrendingUp, TrendingDown, Search, Calculator, Sparkles, PackageSearch,
  ClipboardCheck, History, BookOpen, Navigation, LineChart, FileCheck2,
  CalendarClock, Ruler, MessageSquareText, Bot
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  browserLocalPersistence,
  setPersistence,
} from "firebase/auth";

/* ---------------- Configuração do Firebase ----------------
   Projeto: app-allaservice */
const firebaseConfig = {
  apiKey: "AIzaSyCQX6wft52fVSDJqDfPh9hRFxo237Qzefk",
  authDomain: "app-allaservice.firebaseapp.com",
  projectId: "app-allaservice",
  storageBucket: "app-allaservice.firebasestorage.app",
  messagingSenderId: "569944797024",
  appId: "1:569944797024:web:faffac7f2784f1736fb805",
  measurementId: "G-TV30WGXYB0",
};

// Mapeia o prefixo de chave que cada tela já usa (ex: "ordens-servico:")
// para o nome real da coleção no Firestore (ex: "ordens_servico").
// Nenhuma tela precisa mudar — elas continuam chamando window.storage
// exatamente como sempre chamaram.
const FIRESTORE_COLLECTION_MAP = {
  orcamentos: "orcamentos",
  recibos: "recibos",
  "ordens-servico": "ordens_servico",
  "os-frio": "os_frio",
  relatorios: "relatorios",
  "cervejeiras-produtos": "cervejeiras_produtos",
  "cervejeiras-vendas": "cervejeiras_vendas",
  "fin-receitas": "fin_receitas",
  "fin-despesas": "fin_despesas",
  funcionarios: "funcionarios",
  pmocs: "pmocs",
  assinaturas: "assinaturas",
  rastreios: "rastreios",
  checklists: "checklists",
};

function _fsCollectionFor(prefixKey) {
  // prefixKey chega como "orcamentos" (sem os dois-pontos) ou já normalizado
  return FIRESTORE_COLLECTION_MAP[prefixKey] || prefixKey.replace(/-/g, "_") || "sistema";
}

/* ---------------- Aviso visível de falha no banco ----------------
   Garante que NENHUMA gravação falhe silenciosamente: se o Firestore
   recusar/errar, o usuário vê um aviso em vez de "nada acontecer".
   Não altera o design das telas — é uma faixa temporária de erro. */
/* Traduz o erro do Firestore para a CAUSA real, em vez de uma mensagem genérica.
   O código técnico completo vai para o console; o usuário vê só a orientação. */
/* O Firestore recusa valores `undefined` e aborta a gravação inteira.
   Converte para null e remove chaves vazias, preservando os dados. */
function _fsLimparIndefinidos(valor) {
  if (valor === undefined) return null;
  if (valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) return valor.map(_fsLimparIndefinidos);
  const limpo = {};
  for (const k of Object.keys(valor)) {
    if (valor[k] === undefined) continue;
    limpo[k] = _fsLimparIndefinidos(valor[k]);
  }
  return limpo;
}

function diagnosticarErroFirestore(e, operacao) {
  const codigo = (e && (e.code || e.message)) || "desconhecido";
  console.error(
    `[ALLA CHECK] Falha de persistência\n` +
      `  operação : ${operacao}\n` +
      `  projeto  : ${firebaseConfig.projectId}\n` +
      `  código   : ${e && e.code ? e.code : "(sem código)"}\n` +
      `  mensagem : ${e && e.message ? e.message : e}`,
    e
  );

  const c = String(codigo);
  if (c.includes("permission-denied") || c.includes("insufficient permissions")) {
    return "Banco de dados bloqueado: as regras de segurança do Firestore estão negando a gravação. É preciso liberar as regras no Console do Firebase.";
  }
  if (c.includes("unavailable") || c.includes("network") || c.includes("offline")) {
    return "Sem conexão com o banco de dados. Verifique a internet e tente novamente.";
  }
  if (c.includes("not-found") || c.includes("NOT_FOUND")) {
    return "Banco de dados não encontrado neste projeto do Firebase. Confirme se o Cloud Firestore foi criado.";
  }
  if (c.includes("unauthenticated")) {
    return "O banco exige login para gravar. Ajuste as regras do Firestore ou ative a autenticação.";
  }
  if (c.includes("resource-exhausted") || c.includes("quota")) {
    return "Cota do banco de dados esgotada. Verifique o uso no Console do Firebase.";
  }
  if (c.includes("failed-precondition")) {
    return "O Cloud Firestore não está habilitado/configurado corretamente neste projeto.";
  }
  return "Não foi possível salvar. Veja o console para o erro técnico completo.";
}

function notificarErroBanco(mensagem, opcoes) {
  try {
    const especifico = !!(opcoes && opcoes.especifico);
    // O adaptador do Firestore já informa a CAUSA exata. Uma mensagem genérica
    // vinda do formulário não pode apagar esse diagnóstico.
    if (!especifico && window.__allaErroEspecificoAte && Date.now() < window.__allaErroEspecificoAte) {
      return;
    }
    if (especifico) window.__allaErroEspecificoAte = Date.now() + 8000;
    console.error("ALLA CHECK:", mensagem);
    if (typeof document === "undefined") return;
    let box = document.getElementById("alla-erro-banco");
    if (!box) {
      box = document.createElement("div");
      box.id = "alla-erro-banco";
      box.style.cssText =
        "position:fixed;left:16px;right:16px;bottom:20px;z-index:9999;" +
        "background:#1C1010;border:1px solid rgba(240,96,90,0.5);border-radius:12px;" +
        "padding:14px 16px;color:#F0605A;font-family:'Roboto',sans-serif;font-size:13px;" +
        "line-height:1.45;box-shadow:0 8px 30px rgba(0,0,0,0.6);max-width:560px;margin:0 auto;";
      document.body.appendChild(box);
    }
    box.textContent = mensagem;
    box.style.display = "block";
    clearTimeout(box._t);
    box._t = setTimeout(() => {
      box.style.display = "none";
    }, 7000);
  } catch (e) {
    console.error("ALLA CHECK: falha ao exibir aviso de erro", e);
  }
}

function _fsParseKey(key) {
  const idx = key.indexOf(":");
  if (idx === -1) return { collectionName: "sistema", docId: key };
  const prefix = key.slice(0, idx);
  const docId = key.slice(idx + 1);
  return { collectionName: _fsCollectionFor(prefix), docId, prefix };
}

/* ---------------- Armazenamento (Firestore) ----------------
   Implementa a MESMA assinatura (get/set/delete/list) que o app inteiro
   já usa via window.storage — mas agora cada tipo de dado vira uma
   coleção própria no Firestore (orcamentos, recibos, ordens_servico...),
   com os campos do registro gravados nativamente (não como texto).
   Nenhuma das chamadas já existentes no restante do arquivo precisa mudar. */
if (typeof window !== "undefined" && (!window.storage || typeof window.storage.get !== "function")) {
  let _fsReady = false;
  let _db = null;
  try {
    const _app = initializeApp(firebaseConfig);
    _db = getFirestore(_app);
    // a autenticação usa a MESMA instância do Firebase, sem conexão extra
    window.__allaFirebaseApp = _app;
    try {
      // O Firebase cuida do hash da senha e da sessão: nenhuma senha
      // passa pelo nosso banco nem fica guardada no aparelho.
      window.__allaAuth = getAuth(_app);
      setPersistence(window.__allaAuth, browserLocalPersistence).catch(() => {});
    } catch (e) {
      console.error("ALLA CHECK: falha ao iniciar a autenticação.", e);
    }
    _fsReady = true;
  } catch (e) {
    console.error("ALLA CHECK: falha ao iniciar o Firebase — confira o firebaseConfig.", e);
  }

  // reserva em memória: só entra em ação se o Firebase não estiver acessível
  // (ex: sem internet), pra o app não travar completamente.
  const _mem = new Map();

  window.storage = {
    async get(key) {
      if (!_fsReady) {
        if (!_mem.has(key)) return null;
        return { key, value: _mem.get(key) };
      }
      try {
        const { collectionName, docId } = _fsParseKey(key);
        const snap = await getDoc(doc(_db, collectionName, docId));
        if (!snap.exists()) return null;
        const data = { ...snap.data() };
        delete data._fsCreatedAt;
        delete data._fsUpdatedAt;
        return { key, value: JSON.stringify(data) };
      } catch (e) {
        notificarErroBanco(diagnosticarErroFirestore(e, `ler "${key}"`));
        throw e;
      }
    },
    async set(key, value) {
      if (!_fsReady) {
        _mem.set(key, value);
        return { key, value };
      }
      try {
        const { collectionName, docId } = _fsParseKey(key);
        const obj = _fsLimparIndefinidos(JSON.parse(value));
        const ref = doc(_db, collectionName, docId);
        // Grava direto com merge: não faz leitura prévia, para que a gravação
        // não dependa de permissão de LEITURA nas regras do Firestore.
        const payload = { ...obj, _fsUpdatedAt: serverTimestamp() };
        await setDoc(ref, payload, { merge: true });
        return { key, value };
      } catch (e) {
        notificarErroBanco(diagnosticarErroFirestore(e, `gravar "${key}"`));
        throw e;
      }
    },
    async delete(key) {
      if (!_fsReady) {
        const existed = _mem.has(key);
        _mem.delete(key);
        return { key, deleted: existed };
      }
      try {
        const { collectionName, docId } = _fsParseKey(key);
        await deleteDoc(doc(_db, collectionName, docId));
        return { key, deleted: true };
      } catch (e) {
        notificarErroBanco(diagnosticarErroFirestore(e, `excluir "${key}"`));
        throw e;
      }
    },
    async list(prefix) {
      if (!_fsReady) {
        const keys = [..._mem.keys()].filter((k) => !prefix || k.startsWith(prefix));
        return { keys };
      }
      try {
        const cleanPrefix = (prefix || "").replace(/:$/, "");
        const collectionName = cleanPrefix ? _fsCollectionFor(cleanPrefix) : null;
        if (!collectionName) return { keys: [] };
        const snaps = await getDocs(collection(_db, collectionName));
        const keys = [];
        snaps.forEach((d) => keys.push(`${cleanPrefix}:${d.id}`));
        return { keys };
      } catch (e) {
        notificarErroBanco(diagnosticarErroFirestore(e, `listar "${prefix}"`), { especifico: true });
        throw e;
      }
    },
  };

  if (!_fsReady) {
    console.warn("ALLA CHECK: Firebase indisponível — usando armazenamento temporário em memória.");
  } else {
    console.info("ALLA CHECK: conectado ao Firestore (projeto app-allaservice).");
  }
}

const LEGACY_IMPORT_DATA = {"relatorios": [{"id": "69df982994701368beb816ce", "createdAt": "2026-04-15T13:52:41.043000", "cliente": "Tiago lima", "endereco": "R. Prof. Antônio Rodrigues Claro Sobrinho, 230  Jardim São Carlos Sorocaba - SP 18046-340", "telefone": "'+55 15 99792-4288", "equipamento": "Split Lg Inverter", "tipoServico": "Manutenção Preventiva", "descricao": "Placa: Ok; Compressor: Ok; Sensores: Ok; Tensão: 220V; Corrente: 7.5A; Pressão baixa: 118; Pressão alta: 208; Filtro limpo; Evaporadora limpa; Condensadora limpa; Gás OK; Disjuntor OK; Fiação OK; Higienização completa realizada; Status final: Parte elétrica ok comunicação ok compressor ok amperagem ok pressão ok. Aparelho em perfeito funcionamento, aconselho a lipeza periódica 4 a 5 meses para evitar defeitos e garantir o pleno funcionamento ", "pecas": "", "fotos": [{"id": "legacy-69df982994701368beb816ce-0", "src": "https://base44.app/api/apps/69c55aee49457fa89d7046a7/files/mp/public/69c55aee49457fa89d7046a7/30814ba34_1000346138.jpg"}], "localizacao": null, "assinatura": null}, {"id": "69c55d9892d9fb8e4cf20301", "createdAt": "2026-03-26T16:23:52.260000", "cliente": "Carlos Eduardo Silva", "endereco": "Rua das Palmeiras, 450 - Centro", "telefone": "21999887766", "equipamento": "Split Samsung AR12TSHZ", "tipoServico": "Manutenção Preventiva", "descricao": "Placa: OK; Compressor: OK; Ventilador: OK; Sensores: OK; Tensão: 220V; Corrente: 5.8A; Pressão baixa: 65; Pressão alta: 250; Filtro limpo; Evaporadora limpa; Condensadora limpa; Gás OK; Disjuntor OK; Fiação OK; Higienização completa realizada; Status final: Equipamento OK. Equipamento em perfeitas condições. Manutenção preventiva realizada.", "pecas": "", "fotos": [], "localizacao": null, "assinatura": null}, {"id": "69c55d9892d9fb8e4cf20303", "createdAt": "2026-03-26T16:23:52.260000", "cliente": "João Pedro Santos", "endereco": "Rua Conde de Bonfim, 87", "telefone": "21977665544", "equipamento": "Janela Springer 42MACA09S5", "tipoServico": "Manutenção Preventiva", "descricao": "Placa: OK; Compressor: OK; Ventilador: OK; Sensores: OK; Tensão: 127V; Corrente: 7.5A; Pressão baixa: 60; Pressão alta: 230; Filtro limpo; Evaporadora limpa; Gás OK; Disjuntor OK; Fiação OK; Status final: Necessita manutenção. Condensadora necessita limpeza externa. Recomendada higienização completa na próxima visita.", "pecas": "", "fotos": [], "localizacao": null, "assinatura": null}, {"id": "69c55d9892d9fb8e4cf20302", "createdAt": "2026-03-26T16:23:52.260000", "cliente": "Maria Fernanda Oliveira", "endereco": "Av. Brasil, 1200 - Apt 301", "telefone": "21988776655", "equipamento": "Split LG S4-Q12JA3WA", "tipoServico": "Manutenção Preventiva", "descricao": "Placa: Defeito; Compressor: OK; Ventilador: OK; Sensores: OK; Tensão: 220V; Corrente: 4.2A; Pressão baixa: 55; Pressão alta: 200; Filtro limpo; Evaporadora limpa; Condensadora limpa; Disjuntor OK; Possível vazamento identificado; Status final: Necessita reparo. Placa eletrônica apresentando falha intermitente. Fiação precisa ser substituída. Possível vazamento de gás no condensador.", "pecas": "", "fotos": [], "localizacao": null, "assinatura": null}], "recibos": [{"id": "6a72194c58587ff36e46065d", "numero": "REC-2026-8464", "clienteNome": "Ivan Dias Souza", "documento": "25.110.536.0001-90", "telefone": "11-980582455", "descricao": "Remoção e reistalacar condensadora ", "data": "2026-08-04", "formaPagamento": "PIX", "valor": "250.0", "observacoes": "", "osVinculada": "", "createdAt": "2026-08-04T16:54:36.928000"}, {"id": "6a0627a782b836e11a8fe4e2", "numero": "REC-2026-7864", "clienteNome": "Mater serviço ", "documento": "", "telefone": "'+55 38 9108-7256", "descricao": "Filmagem quadro de dijuntor espaço laser barão de tatui ", "data": "2026-05-14", "formaPagamento": "PIX", "valor": "80.0", "observacoes": "", "osVinculada": "", "createdAt": "2026-05-14T19:51:03.077000"}, {"id": "6a06273f3d7c723a0da4568f", "numero": "REC-2026-9687", "clienteNome": "Master serviços", "documento": "", "telefone": "'+55 38 9108-7256", "descricao": "Medição piso ", "data": "2026-05-14", "formaPagamento": "PIX", "valor": "100.0", "observacoes": "", "osVinculada": "", "createdAt": "2026-05-14T19:49:19.684000"}, {"id": "6a0626fa8b11574584af848f", "numero": "REC-2026-1816", "clienteNome": "Master serviços", "documento": "", "telefone": "'+55 38 9108-7256", "descricao": "Limpeza nas calhas ar condicionado philco Espaço laser ", "data": "2026-05-05", "formaPagamento": "PIX", "valor": "150.0", "observacoes": "", "osVinculada": "", "createdAt": "2026-05-14T19:48:10.688000"}, {"id": "69fa2a114976e575cb53efe9", "numero": "REC-2026-5491", "clienteNome": "Espaço laser ", "documento": "", "telefone": " 38 9108-7256", "descricao": "Visita técnica, limpeza e desobstrução da calha aparelho philco 12btus ", "data": "2026-05-05", "formaPagamento": "PIX", "valor": "150.0", "observacoes": "", "osVinculada": "", "createdAt": "2026-05-05T17:34:09.205000"}, {"id": "69f5fd9310cb0c2315b68e55", "numero": "REC-2026-4269", "clienteNome": "Paktualseg", "documento": "", "telefone": "'+55 15 97402-6206", "descricao": "Manutenção preventiva \nSansung 18.000 btus \nPhilco 12.000 btus \nLimpeza evaporadora", "data": "2026-05-07", "formaPagamento": "PIX", "valor": "500.0", "observacoes": "", "osVinculada": "", "createdAt": "2026-05-02T13:35:15.839000"}, {"id": "69f4f8c137892729b03e2c45", "numero": "REC-2026-4268", "clienteNome": "GABITEC", "documento": "", "telefone": "'+55 15 99665-1075", "descricao": "4 envelope \n1 pintura interna \n", "data": "2026-05-01", "formaPagamento": "PIX", "valor": "250.0", "observacoes": "", "osVinculada": "", "createdAt": "2026-05-01T19:02:25.685000"}, {"id": "69f3f557797519e9e0d1b8b5", "numero": "REC-2026-6916", "clienteNome": "GABITEC", "documento": "", "telefone": "'+55 15 99665-1075", "descricao": "2 comando \n1 filtro carga gás e ventoinha \nAdesivo cervejeira Simpson \n", "data": "2026-05-01", "formaPagamento": "PIX", "valor": "500.0", "observacoes": "", "osVinculada": "", "createdAt": "2026-05-01T00:35:35.019000"}], "ordensServico": [{"id": "6a1103bd7a3ac967743079df", "numero": "OS-2026-0015", "clienteNome": "Edvar de Willi Vassaitis", "clienteTelefone": "15-988011914", "clienteDocumento": "", "clienteEndereco": "Rua Manuel Martines Tudella, 430", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-06", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 820.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079d1", "numero": "OS-2026-0001", "clienteNome": "Leandro Gazzaniga", "clienteTelefone": "11986903033", "clienteDocumento": "", "clienteEndereco": "Rua José Firmino de Moraes 708", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-03-03", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 990.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079dd", "numero": "OS-2026-0013", "clienteNome": "Eric Ferreira", "clienteTelefone": "15998326132", "clienteDocumento": "", "clienteEndereco": "Rua Paschoal lacava 26", "eqTipo": "Split", "eqMarca": "", "eqModelo": "", "eqBtus": "9.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-14", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 700.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079da", "numero": "OS-2026-0010", "clienteNome": "Guilherme dos Santos Augusto", "clienteTelefone": "15998272798", "clienteDocumento": "", "clienteEndereco": "Alameda família verlangiere casa 2", "eqTipo": "Split", "eqMarca": "Philco", "eqModelo": "", "eqBtus": "9.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-19", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 780.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079d4", "numero": "OS-2026-0004", "clienteNome": "Eduardo Barão", "clienteTelefone": "15 98154-9272", "clienteDocumento": "", "clienteEndereco": "R. Francisco Ferreira Leão, 367", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "", "eqBtus": "9.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-02-02", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 880.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079d5", "numero": "OS-2026-0005", "clienteNome": "Daniel Borsero", "clienteTelefone": "'+55 11 94897-5818", "clienteDocumento": "", "clienteEndereco": "Jorge pirerz de almeira filho 105", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "", "eqBtus": "9.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-28", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 760.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079d6", "numero": "OS-2026-0006", "clienteNome": "Nilton Francisco de Araújo", "clienteTelefone": "15996877924", "clienteDocumento": "", "clienteEndereco": "", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-20", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 930.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079db", "numero": "OS-2026-0011", "clienteNome": "Márcio Rogério de Almeida", "clienteTelefone": "15 996320504", "clienteDocumento": "", "clienteEndereco": "Al.Guaruja, 779 Nova Sorocaba", "eqTipo": "Split", "eqMarca": "Hisense", "eqModelo": "", "eqBtus": "9.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-20", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 600.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079e0", "numero": "OS-2025-0001", "clienteNome": "Danyele", "clienteTelefone": "'+55 15 99134-1939", "clienteDocumento": "", "clienteEndereco": "R. João Cocorulo Júnior, 48 - Éden, Sorocaba - SP", "eqTipo": "Split", "eqMarca": "Elgin", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2025-12-27", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 980.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079d3", "numero": "OS-2026-0003", "clienteNome": "Clovis Iwassaki", "clienteTelefone": "'+55 15 99119-2110", "clienteDocumento": "", "clienteEndereco": "Quadra D2 lote 35, Ibiti Reserva", "eqTipo": "Split", "eqMarca": "Hissense", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-02-09", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 1500.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079de", "numero": "OS-2026-0014", "clienteNome": "Alisson Luiz de Barros Junior", "clienteTelefone": "15981195324", "clienteDocumento": "", "clienteEndereco": "Rua Idalina Maria de Jesus Silva, 200, Jardim Abatiá", "eqTipo": "Split", "eqMarca": "Samsung", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-11", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 880.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079d9", "numero": "OS-2026-0009", "clienteNome": "Luiz Henrique Lara Campos", "clienteTelefone": "15991704632", "clienteDocumento": "", "clienteEndereco": "Av Washington Luiz 2059", "eqTipo": "Split", "eqMarca": "Carrier", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Manutenção Corretiva", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-19", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 940.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079d8", "numero": "OS-2026-0008", "clienteNome": "Marcos Roberto", "clienteTelefone": "15 99745-7947", "clienteDocumento": "", "clienteEndereco": "Benedita Ramos dos Santos 475", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-18", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 890.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079e1", "numero": "OS-2025-0002", "clienteNome": "Alexandre Lucido", "clienteTelefone": "15 997166475", "clienteDocumento": "", "clienteEndereco": "Rua Joaquim Antunes de Souza n 38", "eqTipo": "Split", "eqMarca": "Midea", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2025-12-03", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 780.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079dc", "numero": "OS-2026-0012", "clienteNome": "EDUARDO BARÃO", "clienteTelefone": "15 98154-9272", "clienteDocumento": "", "clienteEndereco": "Rua Francisco Ferreira Leão 367 Vila Leão", "eqTipo": "Split", "eqMarca": "Samsung", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-15", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 850.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079d2", "numero": "OS-2026-0002", "clienteNome": "CLAUDIA M MINAMI", "clienteTelefone": "13 997777783", "clienteDocumento": "", "clienteEndereco": "RUA ARI JACINTO 35", "eqTipo": "Split", "eqMarca": "Carrier", "eqModelo": "", "eqBtus": "18.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-02-10", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 890.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a1103bd7a3ac967743079d7", "numero": "OS-2026-0007", "clienteNome": "Luiz Henrique Lara Campos", "clienteTelefone": "15991704632", "clienteDocumento": "", "clienteEndereco": "", "eqTipo": "Split", "eqMarca": "Springer Midea", "eqModelo": "", "eqBtus": "12.000", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-01-21", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 680.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:32:45.538000", "finalizedAt": "2026-05-23T01:32:45.538000", "receitaGerada": true}, {"id": "6a11056d7f1a1043f1421984", "numero": "OS-0018", "clienteNome": "Priscila ", "clienteTelefone": "", "clienteDocumento": "", "clienteEndereco": "Rua Eugênio Marte 26", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "Inverter ", "eqBtus": "12.000 ", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-05-22", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "1400.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 1400.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:39:57.123000", "finalizedAt": "2026-05-23T01:44:56.973000", "receitaGerada": true}, {"id": "6a11069025bc5b12e02cb0a5", "numero": "OS-0019", "clienteNome": "Paktual ", "clienteTelefone": "'+55 15 97402-6206", "clienteDocumento": "", "clienteEndereco": "Roberto Simonsem, 536", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "Inverter ", "eqBtus": "18.000 ", "eqSerie": "", "tipoServico": "Manutenção Corretiva", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "Limpeza Higienização", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-04-29", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "500.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 500.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:44:48.524000", "finalizedAt": "2026-05-23T01:44:48.524000", "receitaGerada": true}, {"id": "6a11096520af22af77b3b950", "numero": "OS-0020", "clienteNome": "Master serviços ", "clienteTelefone": "'+55 38 9108-7256", "clienteDocumento": "", "clienteEndereco": "", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "", "eqBtus": "", "eqSerie": "", "tipoServico": "Manutenção Corretiva", "problemaRelatado": "Vazamento", "diagnostico": "Limpeza calha ", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-05-12", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "250.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 250.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-23T01:56:53.421000", "finalizedAt": "2026-05-23T01:56:53.421000", "receitaGerada": true}, {"id": "6a1889f8f1837f8da919080a", "numero": "OS-0021", "clienteNome": "Pakrual ", "clienteTelefone": " 15 97402-6206", "clienteDocumento": "", "clienteEndereco": "Roberto Simonsem, 536", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "Inverter ", "eqBtus": "18.000 ", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "Troca das canaletas e drenos", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-06-01", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "250.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "ABERTA", "valorTotal": 250.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-28T18:31:20.768000", "finalizedAt": null, "receitaGerada": false}, {"id": "6a188a53d71474b275cf7b2d", "numero": "OS-0022", "clienteNome": "Paktual", "clienteTelefone": "'+15 97402-6206", "clienteDocumento": "", "clienteEndereco": "", "eqTipo": "Split", "eqMarca": "Philco", "eqModelo": "", "eqBtus": "9.000 ", "eqSerie": "", "tipoServico": "Manutenção Corretiva", "problemaRelatado": "Higienização Evap", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-06-01", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "250.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "ABERTA", "valorTotal": 250.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-05-28T18:32:51.291000", "finalizedAt": null, "receitaGerada": false}, {"id": "6a22c2ce32609e875e733139", "numero": "OS-0023", "clienteNome": "Imperador Eventos ", "clienteTelefone": " 15 99123-1604", "clienteDocumento": "", "clienteEndereco": "Lusa Imperador - R. Saliba Mota, 220 - Além Ponte, Sorocaba - SP, 18013-310", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "", "eqBtus": "", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-06-05", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "680.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 680.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-06-05T12:36:30.242000", "finalizedAt": "2026-07-09T16:33:02.721000", "receitaGerada": true}, {"id": "6a4e4af1e9f5ef1d13d6a167", "numero": "OS-0024", "clienteNome": "Adriana Aparecida Silvano", "clienteTelefone": "15 997210074", "clienteDocumento": "", "clienteEndereco": " Rua Paulino Ayres de Aguirre, 42  Bairro Vila Progresso", "eqTipo": "Split", "eqMarca": "Sansung ", "eqModelo": "", "eqBtus": "9.000 ", "eqSerie": "", "tipoServico": "Manutenção Corretiva", "problemaRelatado": "Limpeza ", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-07-08", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "400.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 400.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-07-08T13:04:49.498000", "finalizedAt": "2026-07-09T16:32:24.671000", "receitaGerada": true}, {"id": "6a4fcdc0149d905b653fc78e", "numero": "OS-0025", "clienteNome": "Kimberly Alexia de Souza", "clienteTelefone": "15996277431", "clienteDocumento": "", "clienteEndereco": "Rua Anita Ferreira de Oliveira 82 Santa Marina", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "", "eqBtus": "", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "Intalacao eletrica instalação mecânica ", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-07-10", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "750.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "ABERTA", "valorTotal": 750.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-07-09T16:35:12.633000", "finalizedAt": null, "receitaGerada": false}, {"id": "6a5ac59adff3a6dc5ef7ccb4", "numero": "OS-0026", "clienteNome": "Déric Alexandre da Silva", "clienteTelefone": "15 991105768", "clienteDocumento": "", "clienteEndereco": "Rua : Castanho Taques 305 Bairro : Jd.Ana Maria", "eqTipo": "Split", "eqMarca": "TLC", "eqModelo": "Inverter ", "eqBtus": "12.000 ", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-07-20", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "680.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "ABERTA", "valorTotal": 680.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-07-18T00:15:22.695000", "finalizedAt": null, "receitaGerada": false}, {"id": "6a6771b330acf0f1780872b4", "numero": "OS-0027", "clienteNome": "Ana Letícia Paes Ijano dos Santos", "clienteTelefone": "15 991418633", "clienteDocumento": "", "clienteEndereco": "R. Rev. Henrique de Oliveira Camargo, 425 - Jardim Santa Rosália, Sorocaba - SP, 18090-170", "eqTipo": "Split", "eqMarca": "Agratto ", "eqModelo": "Convencional ", "eqBtus": "12.000 ", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-07-27", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "730.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "ABERTA", "valorTotal": 730.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-07-27T14:56:51.513000", "finalizedAt": null, "receitaGerada": false}, {"id": "6a6f57b8da3dddb4c1fbb037", "numero": "OS-0028", "clienteNome": " Bruno Castilho Barrichelo", "clienteTelefone": "(11) 99983-2106", "clienteDocumento": "", "clienteEndereco": "Rua João Dias de Souza, 207, Ap 203 ✔ Bairro: Parque Campolim", "eqTipo": "Multi Split", "eqMarca": "Fujtisu", "eqModelo": "", "eqBtus": "24", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "Desinstalação mult split 3 evap e remoção das tubulação alta e baixa cabaletas suporta etc.", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-08-03", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "1200.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 1200.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-08-02T14:44:08.883000", "finalizedAt": "2026-08-06T22:56:23.516000", "receitaGerada": true}, {"id": "6a7510b9e3c0cf5642767b14", "numero": "OS-0029", "clienteNome": "Maurício de Almeida Henárias, ", "clienteTelefone": "15-99726-8357", "clienteDocumento": "", "clienteEndereco": "Rua Marquês de Monte Alegre, 203 - Vila Hortência- Sorocaba, CEP 18.025.085", "eqTipo": "", "eqMarca": "", "eqModelo": "", "eqBtus": "", "eqSerie": "", "tipoServico": "Manutenção Corretiva", "problemaRelatado": "Realocacao da unidade condensadora ", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-08-07", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "350.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "ABERTA", "valorTotal": 350.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-08-06T22:54:49.960000", "finalizedAt": null, "receitaGerada": false}, {"id": "6a7511d462365ceb3347e268", "numero": "OS-0030", "clienteNome": "Eva Rosmari Alves Consales", "clienteTelefone": "'+55 14 99651-1920", "clienteDocumento": "", "clienteEndereco": "Rua Valmir Vitorio segura,100 bloco 08 apto 34 wanel 1", "eqTipo": "Split", "eqMarca": "Lg", "eqModelo": "Inverter ", "eqBtus": "12.000 ", "eqSerie": "", "tipoServico": "Instalação", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-08-07", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "980.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "ABERTA", "valorTotal": 980.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-08-06T22:59:32.762000", "finalizedAt": null, "receitaGerada": false}, {"id": "6a7512f8fbb1d59c1078fb05", "numero": "OS-0031", "clienteNome": "Ivan Dias Souza", "clienteTelefone": "11-980582455", "clienteDocumento": "", "clienteEndereco": "Rua Voluntários da Pátria 822", "eqTipo": "", "eqMarca": "", "eqModelo": "", "eqBtus": "", "eqSerie": "", "tipoServico": "Manutenção Corretiva", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-08-03", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "250.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "FINALIZADA", "valorTotal": 250.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-08-06T23:04:24.587000", "finalizedAt": "2026-08-07T21:50:28.200000", "receitaGerada": true}, {"id": "6a75138c8dd451b90c30af3b", "numero": "OS-0032", "clienteNome": "Roberto paktual", "clienteTelefone": "'+55 15 97402-6206", "clienteDocumento": "", "clienteEndereco": "Condomínio vila Verona: D8", "eqTipo": "", "eqMarca": "", "eqModelo": "", "eqBtus": "", "eqSerie": "", "tipoServico": "Manutenção Corretiva", "problemaRelatado": "", "diagnostico": "", "procedimentosRealizados": "", "materiaisUtilizados": "", "pecasUtilizadas": "", "observacoes": "", "tecnico": "Alvaro Serpa", "data": "2026-08-10", "horaEntrada": "", "horaSaida": "", "maoDeObra": "0", "materiais": "700.0", "pecas": "0", "deslocamento": "0", "desconto": "0.0", "status": "ABERTA", "valorTotal": 700.0, "fotosAntes": [], "fotosDepois": [], "assinatura": null, "createdAt": "2026-08-06T23:06:52.659000", "finalizedAt": null, "receitaGerada": false}], "osFrio": [{"id": "6a1107b9bb4a6184d4c37ff0", "numero": "OSF-2026-0001", "clienteNome": "Gabitec ", "clienteTelefone": "'+55 15 99665-1075", "clienteDocumento": "", "clienteEndereco": "", "eqTipo": "Cervejeira", "eqMarca": "", "eqModelo": "", "eqSerie": "", "capacidade": "", "tensao": "", "problemaRelatado": "", "diagnostico": "", "materiaisUtilizados": "Manutenção", "pecasUtilizadas": "", "observacoes": "", "maoDeObra": "0", "pecas": "0", "material": "500.0", "deslocamento": "0", "desconto": "0.0", "status": "Finalizada", "valorTotal": 500.0, "testes": {"Tensão": false, "Corrente": false, "Temperatura": false, "Pressão": false, "Vazamento": false, "Compressor": false, "Ventilador": false, "Condensador": false, "Evaporador": false, "Controlador": false, "Sensores": false, "Dreno": false}, "fotosAntes": [], "fotosDurante": [], "fotosDepois": [], "createdAt": "2026-05-23T01:49:45.114000", "finalizedAt": "2026-05-23T01:49:45.114000", "receitaGerada": true}, {"id": "6a11082dc8938a842239eae1", "numero": "OSF-0002", "clienteNome": "Gabitec", "clienteTelefone": "'+55 15 99665-1075", "clienteDocumento": "", "clienteEndereco": "", "eqTipo": "Cervejeira", "eqMarca": "", "eqModelo": "", "eqSerie": "", "capacidade": "", "tensao": "", "problemaRelatado": "", "diagnostico": "", "materiaisUtilizados": "Adesivos", "pecasUtilizadas": "", "observacoes": "", "maoDeObra": "0", "pecas": "0", "material": "250.0", "deslocamento": "0", "desconto": "0.0", "status": "Finalizada", "valorTotal": 250.0, "testes": {"Tensão": false, "Corrente": false, "Temperatura": false, "Pressão": false, "Vazamento": true, "Compressor": false, "Ventilador": false, "Condensador": false, "Evaporador": false, "Controlador": false, "Sensores": false, "Dreno": false}, "fotosAntes": [], "fotosDurante": [], "fotosDepois": [], "createdAt": "2026-05-23T01:51:41.844000", "finalizedAt": "2026-05-23T01:51:41.844000", "receitaGerada": true}], "orcamentos": [{"id": "6a723261034ab8da79b4028c", "numero": "ALLA-0004", "nome": "IVAN DIAS SOUZA", "telefone": "11-980582455", "endereco": "Voluntários da Pátria 822 vila carvalho", "equipTipo": "", "equipMarca": "", "equipModelo": "", "equipBtus": "", "equipQtd": "1", "servico": "Manutenção preventiva", "materiais": [{"id": "1785868738605", "nome": "Manutenção preventiva ", "qtd": 1, "valorUnit": 250}], "maoDeObra": "0", "deslocamento": "0", "desconto": "0.0", "observacoes": "", "materiaisTotal": 250, "subtotal": 250.0, "valorFinal": 250.0, "descricao": "Realização de manutenção preventiva na unidade evaporadora, incluindo desmontagem para inspeção, limpeza dos filtros de ar, serpentina, turbina (ventilador), bandeja de condensado e dreno, higienização com produtos adequados, verificação do isolamento térmico, reaperto das conexões elétricas, inspeção dos componentes eletrônicos, teste dos sensores e avaliação geral do funcionamento. Após a montagem, é realizado teste operacional para garantir o correto desempenho, melhor qualidade do ar, maior eficiência do equipamento e prevenção de falhas.", "createdAt": "2026-08-04T18:41:37.379000"}, {"id": "6a4fcec7e13f89e2d792054c", "numero": "ALLA-0003", "nome": "Rodolfo", "telefone": "'+55 15 97402-8932", "endereco": "Sandro Antônio mendes 1252 aples de sorocaba ", "equipTipo": "", "equipMarca": "", "equipModelo": "", "equipBtus": "", "equipQtd": "1", "servico": "Reforma Cervejeira expositora", "materiais": [{"id": "1783615024409", "nome": "Reforma Cervejeira expositora", "qtd": 1, "valorUnit": 1500}], "maoDeObra": "0", "deslocamento": "0", "desconto": "0.0", "observacoes": "", "materiaisTotal": 1500, "subtotal": 1500.0, "valorFinal": 1500.0, "descricao": "Adesivo lateral pintura interna instalação elétrica controlador Tc900 led interno", "createdAt": "2026-07-09T16:39:35.951000"}, {"id": "69dfce27a00f33301fbf114a", "numero": "ALLA-0002", "nome": "Evelin Bueno", "telefone": "'+55 15 99700-9283", "endereco": "Atanazio Soares 3755 - Casa 21 - Condominio Moradas de São Guilherme", "equipTipo": "", "equipMarca": "", "equipModelo": "", "equipBtus": "", "equipQtd": "1", "servico": "Troca do capacitor", "materiais": [{"id": "1776274889098", "nome": "Troca do capacitor ", "qtd": 1, "valorUnit": 250}], "maoDeObra": "0", "deslocamento": "0", "desconto": "0.0", "observacoes": "Orçamento válido por 3 dias ", "materiaisTotal": 250, "subtotal": 250.0, "valorFinal": 250.0, "descricao": "Troca do capacitor", "createdAt": "2026-04-15T17:43:03.665000"}, {"id": "69dfcc75b791fa64d1b27b9c", "numero": "ALLA-0001", "nome": "Ademam Damaceno", "telefone": "'+55 11 99459-4739", "endereco": "Rua Professora Ossis Salvestrini Mendes, 650. Jardim Santa Rosália - Sorocaba", "equipTipo": "", "equipMarca": "", "equipModelo": "", "equipBtus": "", "equipQtd": "1", "servico": "Troca de 2 capacitores", "materiais": [{"id": "1776274351934", "nome": "Troca de 2 capacitores", "qtd": 2, "valorUnit": 250}, {"id": "1776274445226", "nome": "Troca do isolamento térmico ", "qtd": 2, "valorUnit": 140}], "maoDeObra": "0", "deslocamento": "0", "desconto": "0.0", "observacoes": "CNPJ 13.198.7040001,-62", "materiaisTotal": 780, "subtotal": 780.0, "valorFinal": 780.0, "descricao": "Troca de 2 capacitores Troca do isolamento térmico", "createdAt": "2026-04-15T17:35:49.181000"}], "cervejeiraProdutos": [{"id": "prod-6a3e6a332a46db682c143236", "nome": "VCFC/VCFM 284 V.", "marca": "Frico ", "modelo": "VCFC/VCFM 284 V. ", "capacidade": "284", "voltagem": "220V", "estado": "Usada", "numeroSerie": "", "custo": "0.0", "precoVenda": "3000.0", "estoque": "0", "descricao": "Motor novo capilar novo adesivada e pintura automotivo ", "fotos": [], "createdAt": "2026-06-26T12:01:55.985000"}], "cervejeiraVendas": [{"id": "6a3e6a332a46db682c143236", "produtoId": "prod-6a3e6a332a46db682c143236", "produtoNome": "VCFC/VCFM 284 V.", "quantidade": 1, "precoUnit": 3000.0, "custoUnit": 0.0, "desconto": 0, "total": 3000.0, "lucro": 3000.0, "cliente": {"nome": "Vitor Pereira Delanhoio", "telefone": " 15 99117-4731", "documento": "352.630.388-60", "endereco": "Rua  Benedita rosa de oliveira  n 94   Casa  02  Quadra : 06  Lote :  27  Condominio  jardim São Lucas  KM 117"}, "pagamento": "PIX", "createdAt": "2026-06-26"}], "cervejeiraReceitas": [{"id": "fin-6a3e6a332a46db682c143236", "servico": "Venda — VCFC/VCFM 284 V.", "cliente": "Vitor Pereira Delanhoio", "osId": null, "osNumero": null, "data": "2026-06-26", "valor": 3000.0, "formaPagamento": "PIX", "status": "pendente", "createdAt": "2026-06-26T12:01:55.985000"}], "osReceitasExtra": [{"id": "fin-os-6a1103bd7a3ac967743079df", "servico": "Instalação", "cliente": "Edvar de Willi Vassaitis", "osId": "6a1103bd7a3ac967743079df", "osNumero": "OS-2026-0015", "data": "2026-01-06", "valor": 820.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079d1", "servico": "Instalação", "cliente": "Leandro Gazzaniga", "osId": "6a1103bd7a3ac967743079d1", "osNumero": "OS-2026-0001", "data": "2026-03-03", "valor": 990.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079dd", "servico": "Instalação", "cliente": "Eric Ferreira", "osId": "6a1103bd7a3ac967743079dd", "osNumero": "OS-2026-0013", "data": "2026-01-14", "valor": 700.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079da", "servico": "Instalação", "cliente": "Guilherme dos Santos Augusto", "osId": "6a1103bd7a3ac967743079da", "osNumero": "OS-2026-0010", "data": "2026-01-19", "valor": 780.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079d4", "servico": "Instalação", "cliente": "Eduardo Barão", "osId": "6a1103bd7a3ac967743079d4", "osNumero": "OS-2026-0004", "data": "2026-02-02", "valor": 880.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079d5", "servico": "Instalação", "cliente": "Daniel Borsero", "osId": "6a1103bd7a3ac967743079d5", "osNumero": "OS-2026-0005", "data": "2026-01-28", "valor": 760.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079d6", "servico": "Instalação", "cliente": "Nilton Francisco de Araújo", "osId": "6a1103bd7a3ac967743079d6", "osNumero": "OS-2026-0006", "data": "2026-01-20", "valor": 930.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079db", "servico": "Instalação", "cliente": "Márcio Rogério de Almeida", "osId": "6a1103bd7a3ac967743079db", "osNumero": "OS-2026-0011", "data": "2026-01-20", "valor": 600.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079e0", "servico": "Instalação", "cliente": "Danyele", "osId": "6a1103bd7a3ac967743079e0", "osNumero": "OS-2025-0001", "data": "2025-12-27", "valor": 980.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079d3", "servico": "Instalação", "cliente": "Clovis Iwassaki", "osId": "6a1103bd7a3ac967743079d3", "osNumero": "OS-2026-0003", "data": "2026-02-09", "valor": 1500.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079de", "servico": "Instalação", "cliente": "Alisson Luiz de Barros Junior", "osId": "6a1103bd7a3ac967743079de", "osNumero": "OS-2026-0014", "data": "2026-01-11", "valor": 880.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079d9", "servico": "Manutenção Corretiva", "cliente": "Luiz Henrique Lara Campos", "osId": "6a1103bd7a3ac967743079d9", "osNumero": "OS-2026-0009", "data": "2026-01-19", "valor": 940.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079d8", "servico": "Instalação", "cliente": "Marcos Roberto", "osId": "6a1103bd7a3ac967743079d8", "osNumero": "OS-2026-0008", "data": "2026-01-18", "valor": 890.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079e1", "servico": "Instalação", "cliente": "Alexandre Lucido", "osId": "6a1103bd7a3ac967743079e1", "osNumero": "OS-2025-0002", "data": "2025-12-03", "valor": 780.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079dc", "servico": "Instalação", "cliente": "EDUARDO BARÃO", "osId": "6a1103bd7a3ac967743079dc", "osNumero": "OS-2026-0012", "data": "2026-01-15", "valor": 850.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079d2", "servico": "Instalação", "cliente": "CLAUDIA M MINAMI", "osId": "6a1103bd7a3ac967743079d2", "osNumero": "OS-2026-0002", "data": "2026-02-10", "valor": 890.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a1103bd7a3ac967743079d7", "servico": "Instalação", "cliente": "Luiz Henrique Lara Campos", "osId": "6a1103bd7a3ac967743079d7", "osNumero": "OS-2026-0007", "data": "2026-01-21", "valor": 680.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:32:45.538000"}, {"id": "fin-os-6a11056d7f1a1043f1421984", "servico": "Instalação", "cliente": "Priscila ", "osId": "6a11056d7f1a1043f1421984", "osNumero": "OS-0018", "data": "2026-05-22", "valor": 1400.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:44:56.973000"}, {"id": "fin-os-6a11069025bc5b12e02cb0a5", "servico": "Manutenção Corretiva", "cliente": "Paktual ", "osId": "6a11069025bc5b12e02cb0a5", "osNumero": "OS-0019", "data": "2026-04-29", "valor": 500.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:44:48.524000"}, {"id": "fin-os-6a11096520af22af77b3b950", "servico": "Manutenção Corretiva", "cliente": "Master serviços ", "osId": "6a11096520af22af77b3b950", "osNumero": "OS-0020", "data": "2026-05-12", "valor": 250.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:56:53.421000"}, {"id": "fin-os-6a22c2ce32609e875e733139", "servico": "Instalação", "cliente": "Imperador Eventos ", "osId": "6a22c2ce32609e875e733139", "osNumero": "OS-0023", "data": "2026-06-05", "valor": 680.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-07-09T16:33:02.721000"}, {"id": "fin-os-6a4e4af1e9f5ef1d13d6a167", "servico": "Manutenção Corretiva", "cliente": "Adriana Aparecida Silvano", "osId": "6a4e4af1e9f5ef1d13d6a167", "osNumero": "OS-0024", "data": "2026-07-08", "valor": 400.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-07-09T16:32:24.671000"}, {"id": "fin-os-6a6f57b8da3dddb4c1fbb037", "servico": "Instalação", "cliente": " Bruno Castilho Barrichelo", "osId": "6a6f57b8da3dddb4c1fbb037", "osNumero": "OS-0028", "data": "2026-08-03", "valor": 1200.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-08-06T22:56:23.516000"}, {"id": "fin-os-6a7512f8fbb1d59c1078fb05", "servico": "Manutenção Corretiva", "cliente": "Ivan Dias Souza", "osId": "6a7512f8fbb1d59c1078fb05", "osNumero": "OS-0031", "data": "2026-08-03", "valor": 250.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-08-07T21:50:28.200000"}, {"id": "fin-frio-6a1107b9bb4a6184d4c37ff0", "servico": "OS Frio — Cervejeira", "cliente": "Gabitec ", "osId": "6a1107b9bb4a6184d4c37ff0", "osNumero": "OSF-2026-0001", "data": "2026-05-23", "valor": 500.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:49:45.114000"}, {"id": "fin-frio-6a11082dc8938a842239eae1", "servico": "OS Frio — Cervejeira", "cliente": "Gabitec", "osId": "6a11082dc8938a842239eae1", "osNumero": "OSF-0002", "data": "2026-05-23", "valor": 250.0, "formaPagamento": "A definir", "status": "pago", "createdAt": "2026-05-23T01:51:41.844000"}], "funcionarios": [{"id": "6a14ec6be97601ccd65a6e7d", "nome": "ALVARO SERPA NETO", "cpf": "330005218-10 ", "telefone": "1599622797", "email": "alvaroneto.serpa@gmail.com", "cargo": "Proprietário", "dataEntrada": "2025-12-01", "status": "Disponível", "observacoes": "Especialidades: Ar-condicionado, Geladeiras, Cervejeiras, Freezers, Automotivo, Câmara fria, Expositores, Elétrica.", "foto": "https://base44.app/api/apps/69c55aee49457fa89d7046a7/files/mp/public/69c55aee49457fa89d7046a7/e2a409d76_b39ecd2b-187e-4b5c-80fa-62de42f046e4-1_all_6.jpg", "permissoes": ["OS", "Serviços", "Clientes", "Orçamentos", "Vendas", "Financeiro", "Documentos"], "createdAt": "2026-05-26T00:42:19.209000"}]};

/* ---------- design tokens ----------
  bg base:   #0A0A0B (AMOLED black)
  surface:   #141416
  surface-2: #1C1C1F
  gold:      #C9A24B
  gold-brt:  #E9C878
  silver:    #C7C9CE
  white:     #F3F3F1
  line:      #2A2A2E
  ok:        #4ADE80
  danger:    #F0605A
  display font: 'Roboto' (APROVADA pelo usuario - nao trocar)
  data font:    'JetBrains Mono' (readouts / ids / numbers)
  body font:    Roboto / JetBrains Mono (APROVADA - nao trocar)
------------------------------------- */

const LOGO_DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANwAAADxCAMAAACXtilbAAAB/lBMVEXq1S0pHhVqYB1nZVbn11piXxUzLQw0LhyimlFKSkqunySfn5/EuWD//waiqqrAwL5FLwDCoiXf398kJCBnZ2GCaQ+/v8A+QEE+PkBhKwnAv79/gH+aZGSAekjAv8D//38/P1U/P0E/fz8+QD4kSEg+QEAA/wBCOw5IJEh/f59tkZF///+qqgDMzMwAAAAEBAOnp6e2t7bGx8aWl5eHiIjX19bn5+Z4eHgXFxcDAwMnJycCAgIFBQUDAgI1NTYDAwIGBgVXV1dnaGj////29vVHR0gVFRI8PDyyiAHTpgP+93DFmQH86UwWFhMVFRMUFBPxxhPluAlFRUb41yr++5CeoKD+9VP84zQUFRR+fn65kwY2Njb9/KxUVVVNNwIpKCgxJwdURgttVwlnSQGOdgyqqqrg4N4eHiAoKCh+gIC/wMD9/sh+f4CMaAVHR0e+wL4lJCRHSEeenqDLty0mGgM3NzdmZmb61BwWFA4YFxSlewDbsgslJSWUgxaRhiu1qDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC1mYlyAAAAgHRSTlP9Ffjv/Aftnfyq/f39AQf+7/79XxD9/vjzC/3+B//8AgykBMcHngGwBwgHAgMFAPv+/f3+/v39/f0s/ZBQr/3Ob/v7Af37Tgb+/v3+/hMvcf7+tP79/v3+hQP+rv0G/hL5/P3+/gP+/rD+/v3+/g79KtL+/f7L0v6uz//+kv78/T+JIFIAABoFSURBVHja7Z2Hfxs3loApWe5O7PRsbm/3er/BANN7oUiqmKJkWVazuiLbiuXu2Inbv77voQyHEr22RdPe0w02v4ScAuADHvAKHrU17QSXWgVXwVVwFVwFV8FVcBVcBVfBVXAVXAVXwVVwFVwFV8FVcBVcBVfBVXAVXAVXwVVw/3/gTsP/Tu7Mpd+cVLgRremOnNiZ87bPDk8uPy/cF9roq/SEbiintX+f3/ROJtyIFoxdSE6qKghfT22mJxTO27p+joycSLgvtDNXb25FJ9JCGdGej9289KRzMs2v9M3N69+R1omEC3ev3xxbH6pUfjY4b/TG9ak3pHkC4WAzWZy6emN7qHvlZ4KDzaR2Y36x9mS4UvmZZi5duVGbXXw9ZKn8PHDhNrDNzm8NWSo/D9yZq7XJubnHm0snLsxw+p+e18amJ6fnXpPwxMFpwZup6enpicdbyekTBxfuTn01sTKx8uZJoJ00OG9r6vHExMTvk6Nk5oTBoSswNoFwX51Jlk8W3GkteizYVl4P1yH4HDMXvJqaEBO35XonDC4chc0E2SYubP6mnSw4b+vGYzFxK6OfQCo/JdwXI7iZrAi49U3tbwpuJiiX3n28XbrzFrtjpA6byVecbWLiu82+geY06inpp4NLctMpSk6CjdK9JskNkxcjJl/2d3OCC2CZCLjJrSt9HIJ25PqyFlGV+8ngPN+i3WJlbtnACInOxA2Wk423WSaTAMfpVjb7SOW9xPVzS+8WloWfCi7NmdEt1PDdHjiD8g49ohlpvyWuUAM4Tjc9eqWPVHokdqHebtGN6BPB1ROdGrz/CxcfGRd1Gvth/SicDnBeP8vkyuLY5KSkm1xf7yOVqRv7+7phXLxoPHq0sKDrxmX3E8F5LitJjG6wzI16Zo7plL4N7g/a2drU3Jykm3715EqfFiLfbzCjt43S+A0TLm1YPQ1T0yW9cHLN9Z259M3U/CynA74XW7BXHnHC28S/5bCF8gjSAeXyveEis2fmoGXfDd8XDjaTsfn5WcB7gXibV/o4BCEsOZ32NsHcTwNHGOVyR1X7rHErKMNZlF2+3x/OG526OXV1Eehw9mZ3QSq/OGp2un6sxo9iW/AvqxF+CrgwlopAN+V/meMmPXAMSx+4/wHL5Jeb15EO8WafnVnvI5X1xEdFICo3lMIxo08BFzkCjhm+kj/d7Rr2AGczjmcdnbno8c1fbgLdDY737M2THe+odcIVgarax0/3L99nrL9e+bhwI4TyrlPLIZR9zyfJit20pMRtC0sfuPTV9V9+walDusX52vb6qNZfETBZKHGEHDA7DocPF/q2aM1qEFM1nHflEuDGra+Rzj4MB9r7Fw7H6a7eqG0eRB4voSozLaEIVBsmiWGUcKhsMxg+XJCP84mxmes2xBxZtt5VBghnQ9mz7FM9XugX2ub81M1fUCwBDuhuvDl4NTo6egrL38M/o6PnRkkTFYHrqIoz4jJbtjfIIdf7wX2ZiL5b4wZ0wrL3kMMuyaWCs+3xU+X8hJE/R49vTF2/qeCmbvAyNXVdFrg0th2t8SUHki3q8F1iquoGkcv3g/NcW7bVILeIoRrOCyOlDPfE64krwGQB3U0BAmBXoYzhFXHt+qWtBCyYAJacRBunxCUNVd0gcvl+cEEm29pzXZeoL+NduSzDlcUy3K4BC58oPm9XRUG4X4SsXtrCNYqKoKjWJNCKJb6NDyKX7wVXT+RkjeswqERNo20VRgrC7YmLZThvE7bHxasohlNTSLWI3xcXgVfSXdrhQXWuCMYL6XD9rnj43nDhPGLJ9Z0TN0kJLVa+MlJQzxW7gerN6fZvtcXJWUEHbPNYnj3Dfy8C3XWct22+bOup2/CZvbfHN1wX4bJxkNK9PWvcCYYLlzbGpRLziRvVSS73bNvwfztkofToueDC4sT0XG0eFMANZZ+gifIM6VBYLx3ImHoU/9CArZYXHYbPdX1LDhZN6kOFS0xbaVeXpKCSLKVuG1JohG3JtXwXLt2tHeyuwNRxgZyvgWGJpcCbuvTdZiQ9gizmioCxy5YTfYtTp6vROr5cvg9cm2Cv0SyCpQ5d78YULCcO3uoVeFs3DrZ3JybnOBzM29wLKIJuFuhqY9vr8qDHczNfwEAFMQwfwOXSWLXydIhw9VQazeAIwJL7o3aP5ExY7czIfqsXnrh6RsJtLr7aOTgAuZznEzcrvLnJSYVX295K/iDnOM4aTIVniFdPQZsqS53pyTBnLnKYcLQYbJUB95mZck3y2OsNM9xviNOb08njifWd7YPfp+cWUW8vIhz44RJvbra2vVMIcNLIuEeAVZoJ7mC+74rBglaPLZfvAbdBCscYpBI37pQUgQAzSyWcbhgLC+ChS7jg1eOd3d3dVxMXvnpz7ty5C69Hd18gnMB7MTe7vd7deUjekINj0Cyoaz8nru/mTLZxbLl8D7jQl2EvmhOfoBR+S3KqgmD5b104HrIScKm7fWZ9a2v9zOa6LE/IVy+mpxXe7O5699Q49POY6sZFXqOPrwcglygevEY9Gh5ckFFT9BukkvBQMHF1FeJz4h44U8DNkKNla2xyWpXJlfWuv6RFjUy1YRgkgQYSfMHEKk3TpMeVy3fDfZkYMgysl6PBprhIQS7rCIdXunDgYrbbvfF28uaZDO2trExPbpViuqcTUAQKTi8FLkUTDs3SYcF5Lr0rgUqxG8no6GYWaRJOjECj73HwF8mZRRHbA7aJx2U2rggkCJdCUR7JS3cd47hBsNp7SKXumOYdNWPdEcV2HUPPfK3ehbtj9IfrkAvP5jA8hMcFL0ZJVIoQpX7Dpz31d9vgBxP6MQ8qa+9hnhgOUNwtN91t16ENPyzNnNMf7s+JOz+J6g0mb+LFa5KUZTaK/QZ1DsMZRRu5zkV/CHAeoXfu3O1l4w3flQ3naDwrOOctcE3yXQ1slTmkmzvn9rBppEEc/SgcVvh3vBHzmHL5Tri0GFTR8MIj1fId2bDrHpq5B33sAFKbmFgB9V2bnb30pCfK8m+hGxPddFQTMubcM4S6Oxy46K6u0HRdWUjYtlhisKWgU9fdUBZi0F/QefyHF+1bTfsDGa3t7P4+MQ2G5tgmsG14+IDG/x24vl9IZbcNbESM153j7pfvgmsTdaikHypqxdMMTLK0UEpG7vcWkszA7Qu7O98d7E6sTI+NAnyTxA1ZyEzkuxk9tFWquSuUUDQEuHoYM+OR0D+9KlmpcWjYTXDmCrW+z0rFuk9gopLN2voOGJoHB8CWAluGVjEPf5IQzB718sKhRjI1stQdxsyh0czLfo4RhlKBDi0sCIPJRThuG/Ir5ZMa5pAEYF6vXNkBup1Lp2Cam6Rhq05nSRMsLaqOjvKe8SM+XeAKz2DHOjR4B1yLqAXAYrBlZTQVFtIDkrHiRMRNAa7nEIiqwwzmA03k1na2tnZ21s+dI2e1ERLbBbublg9AWBxsQOXYwEziYiRFYrNjBcFq7zKalVdF/dgnafmokBUnIuR5E+BonwK+O/FOk9HHIJU7V16fg2kcIVCn8JeoZZLTie86TC98ua7xgG6Po2o91qFB7V2R5iLE7cdxeQtP0R3fv39/HwBct0NMHmbYx0OsbsGjhQQeHdvd3t5eHwW29ghxLdHj+3gUEMxgNJbRyzgQlpl8WTo4ghYLF9b6IfzYcP+bFJGM3G/EZZf4QREmYtaP7vPiBKG3WD7sjcnW2HcH3+0cXHKTEY+4eM4l71IyAlouVk/bWVBeEQDnU1nt18eRy9o7jGZLlUYj89Pe8zRbBahM2GpUaK+3gFRuNMmbrw52D3Zrm2SknahTACzjeQLiHWfFFTfsOY1sNGJ1fmCxpPWR4VDuZQFN22u+lu/h1ub3Ky6JtGjz6sTE77/XzpCmlvQ+R9I6wTBe8fRGzzmy63bv+cT7yHAzfyVbqR0dKknf4o2Q17WJ6YnaOrCthWlPjlW6oYVR92sU9rqAPdUH7Y9vfg1Q6lhghjEBZX5r2L+Q+MRwws0mo4uTc4vbJNX+tuCWQRLWBmwgJOeezS2Okvfb7Opr7XZ7behwrTRIMEyTJFGqlrJ3tGwcujiiFNWM+D4DZuVsbZdEIlv79Ix6sK0+FJvgWhhEsskgHHlri97AcC3YC3NDR81qODFJmtzh7FeCQ9+xZy2cMLHXEdhOahfI87raYo+USEzUA7jVcAydfQ9N5jGJMMwU9W9yMDhwSXTQtTKNh7GcRC3QO/SIkkZDVy9fgLFoQPP3Ujfn2skl88BGkkA6UK547CdXnQWY5B4ugJQQh7e4wJu0wJFKubY52iZNBoLrkLsWVeY92Pm6rZPkHwKXHfbpaA4qTlr0jxZkhJ2hJxCRmPGTk9Ha4yc43G1hszUsGbuWcV3d4SenCWkw1nUbQWYsnUQJwB1pU6e/DQIHVrDV65salkGCJZceamaB5r6AWwBnZ0G5mDpOGDh8+3gq8njxDPhlKsZOhAfFMuWrARwo7gTmWe91VR8xrARmDkiNjwd3D9ytQiCZPLyxQdiOwMHMgVWhH7lsQMdcPAq6TDZr24TE4znpcJMNbGT0hfZdDofPOuTeSOLn1qOSFyi8DRhQgDs6cQPBBYRJdyUHs1yeuzHzjEsOOzQ66wMnOqZDx2ABkpVXBDNmTBLxJSf8JKajl83nkJoE45ZifcNAoiyr5q0Y4WiXV5YB4JZJZvM2qPC8pbmvgztXeGmF0e8gHCtflNg409Q65cJmwl1CkvCge8PaZ+w+OEIcTpxnbpDYkRltjGa+Hzuqdkx6KXKnu2UAuKY83oZx48XHTCVm6WC6yhZit1twzTHKUxFjKJmpOgaTY9q3ts9IF4fbxIF0k6wY9BkPowBckrq+LrPmdNFkzDda9Ih8mexmOa5ftDnAbpkSJhKvXDwAhy2af/maAlzho/UU4XKpq/5P4m14PWMYdqHIBiM1g3uicIwYCSKAE05wEvnKa4N3AmjQJ+eko+PecuVI5x9HzwWCxrJA4pYwnCr0mIFw8gaJmqp4EcLh1RivprCn845hjlOcoRb8Gt/ewx2lDQNlWzzHqglwthQ9DBCJKnQ0QMEDv5WV4GwUHDsn3xRttgaC41WPO3yMUjVewCrg7Lg8dpHMSpFX7xFiyaQtN+ZCLd4BVYLdFrcy8i3CyRsIJz6bOL14ZKySiW4hnEyAufcxbEuAk+lC4GBH4VpTOmqgUpnMOyMqCtYWcAJGIEfydYBDQcXO2fAPhe0SVPg4FtuNQEI5gGUvcDj+edzEw1aE8zNRcM3hra9Bl4TKtqxrg2woRRqXZcLgB02whZfra0CtkurK4g9wEoYsCTietTU+7pPnsGLdXFRmEQK3HA7HwAGXcJhwBQRyPDicVl7PEs4eL625dAC4B0XGHHaROT4Yhni0US/grCK5h7jtQ3BfEl++7aKMkTOxSuEiDxJ4FAtK31+Bm5lRSaZRKSOsaNSJBvEKsLsWTwzlG4MNNiwJRrTloMgAU+iwG3p8zaHogVi2PeiPygfm5iTuhJiZacE66xA5qQ3yrZbgprG3Z9lH4corBOGsvVKb1ofkKPaBG1F5qkpl2bgRp2obFdcsEZnjcGqbwSXW0G2VyhvhUYPrm7bI50X9Nb5nf21bmKWZ+GJD2dN7NpTDcD/4Rrkr3G4YaObQFzOgPsr2lUVig7WSBuSI80GIUAUysQma/lpGqC0ZniYx12fS4sIMdtgfwTuMXKnnpCqQAzBzCK7hCz13vxvDdoLBnFVwS2ODsdJJGepX0mtboinI4crmF1VGL+gRGXWPL8t4OOFRacx8e8BnTpiZAk6Fp8MjcCpMX5iug8JpG+AW+w402f3pDo48lRlMvTN31CvQsctiUwvdWBxmsFgMjs58NDMjXx6kmBxOTko/OPXrru9VgH5QOFh4QQLTZ9J9dQwHnZMuD427gVIOp7w7dWAIo0uIWhnEF14pbEvS8eT6EDYUcHkWDAEnxocehks5nMhLUral7w4Ox6MaCXEznYrzTXC85HkjLem56D8QTrnQ6qAeJilSIdTIbWD+DL6fMeGdYkAmgZrFwxxOl44rwi0XoaCA/OibOn/7h26bM4PAhRj7jaIg6DwAE5Dk6kwc7ESeOqTHpHtOB4pDnO0aTu4siAdh3tLl4mhW/Q7VII4uknDu8bhCpotMJA7HMS86Mm1OBJcwV9x3xVm70SDNrlV0fDhwr3Is4JCBb9FMCPQWsxagFwZPtUG4slYUKRUG7DiOyBu575NS6BEu8wou8gfNiyJdH+AW+CG/w80QNSoAV4+ASi5rMJxFnf1zJD4cbkYcZ/IdBIOySdyF4303DsOJqyCsvi6zN3ofyIzccXKjYYhqUgknqnVwmkQV8NnjEuuKhKK7OmAKODM7zp/06Wdbmg7OHE7FDE+p433DXvA+5ACXFD/DgQ3FVHCJnCOHNkoHA+AL8Aocng9k5GLNRH3gHL7XtOF7g2LSkgNwUhrMBhjO2NwHhWX72Za8Fzn9EeTym29T+MoHPitmLivccH54JZKYABk8UDl1ein/qa3e44/pcfJfYuYaCi5SBI6ekSiFiVMrwSC3FFxeOvpywwHWXC6qhvHHklPRsI+dNM07d8xutIYHZUVeFMClDwhPgjOxl6VsSlmh48CS1aUvCHC6XHNgc+LnO3cch+X8qM/EJu+AGIBTLuFKEaL3t1GOwtUTkYN4x2DUBET5BW3DIuFS7fk6+tpit9Rj7v/ItBhYsBtduYy7L5pSYBFOXpgBi0Gl7IB5BmqeihxB0Dkwc+Xf/Iu6B4CDrdihKlmJylYNMC4T0pPoyVXeKQ7HlRTCgbvEdS4Mfddb3yBFFhKq8paczobQbSbxPDAXpDa9a6qsIagDxOIW6o/DjQ4Ct5YQ9UN7NUlglZAoUHAYP11YWDAWRFKMgaF0g3JPPFDpwPu3uso2khlCmN7tR+paA4OyCBeiZuv++QCz+BsC6KwCnLrxyOBB7cHgtJkEU2ZKf0bge9wKWwE5bEQKOF3ZjgEeNUoba7+kDppFQg7V1VqMVFDWQN0WYACalgVDxzhuB5U4NQ43OhAc0jX4D351EU3MuDkFzurhdAweXYU1wv70kyViKB0if41sddXBPVL8iLdwakDPKa+gKbwssCIZVeFlBoZM1AoR7kgKiGUOBKd9idHDTGRk52ApJsIs8uPDhQelpanEJ2U56tpOS13rvps3tqHyMNRTIkuhjc9kDh4Jwgxim2ld87Cq+Gij6YCG81oo0t/xODFoSj+oX2kW+Qlpq/epTpENNHP0L8G0O8VrUiNudIoWQVBSHslrLvVtc2Zwr0BrzWA5Rrzw2OkPIzw25M388f9INoMYppb2OUr1/zQxYFnWnj9d+tuFaxVy1eKlj8y1Wt1bPQ+0/kWLKIsxCt7qfahVrrZ4vF6vt/q1/Aln7kN+xDBjWqsfWO3yp5u5sNPptOUOvoQl7bpU9TRYauKmze90ljB9pNNJiylpdjq/NeKg01nDZzr4WCfotPgLnU4gVNbMUiD/IE/48trD1aWieg+qag8Tru45YKqLXngmHiXuU3NVDjLe1J9r2qrMEKVnQdvrzCmSjpzv0RDZZ5mmNSw8gsXDyNzTTomK9CzU1rRViveh3DYwwE2dJTmPGWNGOkS4lraER1cPOY130QaT8HvowCoXnTXtpTV+B0jOW5YITryEWbxvG8XQGzY/+/6pAXA8usswCcLTfrXxkB9qzqDi85Z9SqvXtafMtsCYtmz2UsO5T/F47GGrPkSxzGzdGDdC2VcjDTsPmZ3Lsc1tdhs4r1nWbRF3APuS2mYBZ+ILWEDk0jSA94M0Df8T4VbD9LZu63DnrGX/CnUBC32ahulDPW/WsfKH9mV93BzmT6lD3c59nKqfBZyHgmdLwQsAJNTuARx7GjabTbSMeuH2jBSuh2KLCMX7UADuPEqtjQK/inCadsqyHopa1cvjeYyzuDYkOBg+i51tUttBufQMsMm/eZlRKxOLLgMobRlnji8664eNOsBZJTh+QmKJ4W+FhmWEfLP5FV7svHxIrXMerlgL4RwLSIv9Y027zaxrMFL58GbOMy0z9TKLLmkbACeyR5gpjwIANsSd+xqj+EtP4ykwd3SAqxdwPJSbe+p5Id8AR3memH5b+xbe7sKVVEIOIu3llt4ZEhwMH6UY34EtDpr0TMzFYvrDUHThKWOIw+Fuq3hwBzzNdnfmYGiKcFxoMAUHowE+I/5MuqWdZwzX3CnGfixvZOD/5Tm0/FCrD2nm8Nf8/GwKR5X39bnBctHD0BQ7NcBRyhW1J+CcUALhC6VIXFh8/RXmDP82YUdrrWnn6T7CAc3F27iks1WvjqwyV8oMhySWKbj1t1dXbzcofYh9pbB6zlAKOztsMKv4oY5w/0plyPIswlGDh+1O4Y5BMSTrmJmEUz09RfWz2nMcBtiOzlLKVQE0ojt5boI81Pmzq9CyQ+nt420p74RrgLwJSBQoMRFhxuhTaM/LqREIawnE8jKPAVzjcFQEIZTWx89etxYOx3CqY9DeYHWu7gsl7j2UqYKoCv75T9AIKnbatQk+Mtzq+Wvh8kbr5zZ8aGre6jWQGC29dv4ptPePcuKgfHP+mijfQBflx2svR+B9+VlYl97q+VXR0Zf80RBug/HWgWeFwbb0MM/zDGWzfRsarLday1Ddqjc0Jf42JXHvTBx//B8LfFCK9oBwa/V6+cN/17k2rtcP2e3L4Kn8jOU0v8s/82fgtZ/hW10uGrhcvMC/i/8cqm+t9ASvrvLEK7gKroKr4Cq4Cq6Cq+AquAqugqvgKrgKroKr4Cq4Cq6Cq+AquAqugqvgKrgKroKr4Cq4Cq6Cq+AquAqugqvgKrgKroKr4Cq4Cq6Cq+AquAqugqvgKrgKroKr4Cq4Cq6Cq+AquAqugqvgKrgKroKr4Cq4Dyh/AcY1IpWYql6cAAAAAElFTkSuQmCC";
const BG_PHOTO_DATA_URI = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA4KCw0LCQ4NDA0QDw4RFiQXFhQUFiwgIRokNC43NjMuMjI6QVNGOj1OPjIySGJJTlZYXV5dOEVmbWVabFNbXVn/2wBDAQ8QEBYTFioXFypZOzI7WVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVlZWVn/wAARCAGkARgDASIAAhEBAxEB/8QAGwABAAIDAQEAAAAAAAAAAAAAAAIDAQQFBgf/xAA9EAACAQMCBAMGBAQFBAMBAAAAAQIDBBESIQUxQVETImEGMnGBkaEUQlKxI8HR4QcVYnKSJDOC8VNj8LL/xAAYAQEBAQEBAAAAAAAAAAAAAAAAAQIDBP/EACMRAQEAAgICAwEAAwEAAAAAAAABAhEhMQMSMkFREwQiQnH/2gAMAwEAAhEDEQA/APmwAAAAAAAAAAAAAAAAAAAAAAAAJRpynyW3ct/D4WZS+iAoBY6fZ/Ui4SXNPAEQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASpwlUlpiv7G3Tt4x3fmfdllpS00U3zluXaG2oxWW+SXUolGyuKlBXCozdHWqfiY8up9Mm7acCurviVWxlFwdBvx5Lfw0ufxfY60K9x/l9Ph1OyapaYUk51FByqalPKi+uWt+2CMqt5Rvqt7QhJVrieUo3GYTlLViUsY2Wmf0MZ+3rfXtcdb5edfDLq7q3c7e0nTp261ShJYcY9OfN4Wfqc3LXJnrLe54lbKD8KFWVSr4spSqrXVlKKWYrKziM0sevxPMXlCdtcTpzjpw9llPb4ptGp0lVNKfPn3KWsPDLBOLcdXbYCsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACdFaq0F3kgOxCOIRXZYJUpyo16dWLalCSktLw9vXoYi8oxOUYLVOSivUo69PiNXTFuVtQipxqRa3ery7tJpN+VPdGnUvajjV13k5yq0/Bm0t5QS2y31ztnng5c72iuSlIrd5CWzhLAHUlet1o6bmhV8OalCdalhwxjl2zpX9jk3tzK6ryrTWJy5+Zv9zPi0Zd4kZUFPenJP0AoRbTjqpziQ0OLxJYZfbrZ+rA0gZmsTkuzMEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAttVm6pf7kVHY9n+ET4rOtGnc06FSK0wU1vNvOy+SJbJzVxxuV1FNzd+H5KaTn1fRHPnOU5Zk233Z7C79n0uFUHoUa0U4Sx3TZw3w1Q1JRdRx5vkv7mZnK3fHY5tKn4ksbm/Dh2HHU9pPGTYtKdSMorwYpy5Lqdq8tYw4WqqTU1uZyydMcJrbzNzbwotp5yaedLzFtM61hbz4jX/iNJZ5vkiNeg9bhChDGcLC3ZqVjKbatDxK0d6UpxXNxWSWFSab2TeEdfgtejb1vCg3ia3zzUjd9qqbnQpaY5bSS75ya9mfR46e9SWeeWRN65t6NO3kvP+Ig05PPlafT9tzREu2bLOwAFQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD1fsFoqcRqUppNpKqk/TKf/wDR5Q7HsrdfhPaKzm3iMp+G/wDyWP3aM5Tcb8eXrlK+kUFG4hKOMpyljPxZVX4ZTSw4tS6YRmxbjO5p766daa37Zz/M6lFqcVq3a7nmnb3fTz9PgcFU8WUcdkY45b44XJQW+Mbdjs317StqNWpPKo0t5ySz8jz3HeOW34CKprDqRTWqLTx8GXVtNyTl5fh68OvKGNzpVbHx0pJuLXqc2nd287mFWkpRlN4lF/ujqVa+ik0s7m8t7csNWNa2sF+MhTpvzZy2b/tZLwaFvCnjVBNv0T2NfhEpf5gnJ4b5fAhxqrC+4hiU3GjqjBtdjU6c724N3KP4WEkt5xUfpn+iOebfEJfxIU1ypxxjtnf+hqHTHpyzu6AArAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEqVSVKrCpB4nBqUX2aIgD33BuOu5u53VaCi678yT2TxhnqHd0YUXV8RKOOZ8v4TXSozpS55yjqVLiUuHJSm4yhLDWeZwyw5erDyaj0PEfaCKt3Qs4e8sN8+fU8xVqVLmpWt6zcqdOnmmmnhep1+H8FnK0jXvLt0XPfTCKe3xI3dHhkoeFC+u9MeaXJv4llk6W43Lm3TylvPwKz8qkded5GpGCksPH1Ofc2sPGxRqya/1czV81OajKWd9kb1K5buPDqxvX4rjT2klszWvLypQcJRS1STzlZX0I2q0zdRS5M1+KSk7rElhqKePjuXTFt7acpOUnKTbbeW31MAGmAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAATpT8OafM69lWW8amZTnjHqcU9RbcJ/wAw4DRr2qSu6OqE/wDUk9vmS2TtrGW9Onw6dzXm6dVOVu/JF9PiUXfCbZV506VeplJ5W2MldPjUKVtCniUatNaXHk84/sc2lxCMbuUpS30tas5xuZ9eeG5nxqsXFlKlOWhttdcmhdOM3GUXlx2Zu3F7CpUXSMdk+v8A+6nNrSjN5hybe3c1Jpi3bc4ZHxbmEZ506s79Rx+nnjlxCK5KOP8Aiim2ufw/8THmXIrjUnWrTr1G5Tm8tsTml4mmoC+4gs648upQVkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABlJyeEsmxToJYct32AhRjiLqPpsview9iKuq1uaP6ail9V/Y8tWflwuh3vYyeipdb8nF/uY8nxdvD8nZ4twqjdSl4lPD/XHZnkOI8NVrVUY1NR9KrxTjqzjY8ze2UZV3NtZfqjljnY7Z+OV4/wJ6uTbHgyXNHqv8ujCk5yxvusI4fEZRpvwoe8+fojcy253CYzdcybzLHYsjNRjsUvnsMM6x56shNLUnupcyCpuS8vPsGsInFPO3QopaaeHsDZzGfvIhOg0sw80fuiCkAAAAAAAAAAAAAAAAAAAAAAAAAJNvC5gCyFFy3eyLadFR3e8i9R6sohCCitlgxWqeHHC95/YnKWlZ5YNfwp1HqawgJQkqkFv5kt0+p2vZe4p0eIOnVkoxrLTl8s9DkU6MYyRiKxKdKfPlkzljuaaxy9bt9Qqao27TWXF4Zy420qtbVKOIc8vkjyNvxniNGl4NO8qKEdtMvMvuQvuMX9e2dvWu5zpy5wSSX2Rx/lXo/vj+O1x3jlCmvw9nJVHHZzXL5d/wBjyc60pzcm28889SvmTUGztjjMenDPO5XllYktiSQVLryM5lH3ln1RphGX5fiWwiVtqVSCRsPCQFOMNozCbjyLHDrgg4gSlTp1lt5Kn7mrOnKm8SRdnBYpqS0zWqP3A0wX1KGMum9S7dUUEAAAAAAAAAAAAAAAAAAADbtaOY63zeyNWKcpJLm3g6lNJRwvy7FghCO+WSexn1MSWebwUV6kmTypcjHhRa2Y8Nx5MgOONzFZbxqpb8pfAsxsRm1GnKT5JZA1qr8GWpPOVt6mviVSWebZfCnGs8ym84zjT68jYhTjDswKqdDSsvmT0IuINAR0kJIsb2IaZS5bARws8lksivMk92FFRXqZpLM2wLZpYSNeXPC5mzNqMHJ8kalJ6k6j5t7AQ08wkobtZfYuaSyn+Xdmum5zy+QFqy3s3n90a9aGHlLBdGWMehe6ar08L3luv6Ac4BpptPmgQAAAAAAAAAAAAAAAAXWyXjZfKKbN+DzF4NG196T9C+NZxoSa5osGa9bQ/Dp7zJ06LSzUeX2IWdPCdWSzKXI2G9wCwlsgAUGa9d646Y8s7ssnJ+7Eg47xRBZGKVNIw4LO3Msa2IsDCPQ+z/s+uIWta9usxtYZSedOp9Xnsjj2FpO8u40oqWnnNroj1PG724uuC0uF2cadnbw2lFZblFclleu7A5fGfZ2ra8Ut7SzpVJu4hmCbzunvv25FtzwGvRg7Ozgq1aKX4qtnCi+agv3fyPV8G4rScPFupzqXKgoyqyW0V2XZbZffm+hzuG8S4Vc177hcOKzoW1RS01amFOpUk8uUamF9+fwPPM/fyev46evrjv8AXk6/AL+lHPhxqbZxB7/RnLppxqOMk4yWzTWGj2d9wPjPAYTubDiKvLZRbak9TS76XnOPQ8VLX4niOTm28tt5b9T0OaV5LFDHd4IUsRpR9NyN5LMI/HIpPKiui3YC5k4U4xfvS3ZWlpjFdWYrS8S49EZXnnnoBh7MuoTxJFFR+bbkISwwJXlPRWyuUt0a5u3XntoyX5WaRAAAAA3eEcNrcX4nQsqGFOrLGp8orm2/ggNIH2jh3sTwWxpRTtY3NVLzVK/my++OSN//ACHh6llcPtGsbLwY7fYD4QD7nV4BwmrHTV4Xav18JJ/bBybr2D4HcJ+HTrW0n1p1H+0sgfIgfQ7r/DNvLs+JJrpGtT/mv6HEu/YLjlu3opUbnH/xVVn6PDA8uDdu+E8Qsm1c2VxSx1lTaX1NIDZtl5H6vBiSbylyZK3T8JrlndE1HXOLXKT39CjZi8RUUsKKwZyzLaS22IxkpLK3RRnfsRnJrHq8GW+hVOWqtCPZNkFiiluY/MYk2uQjGU5aY4zFb5aXyAsbMdCKfcasMDdseIX3DlKVo4wVXm5UlLVj1Zpwg69b+LNKc5ap1Z/ds6EeISq0FbToRlHToh4flaTcXjrn3V9WbF3SxG7zZVVVrzzCcnF6HlNRXpz3+AFtPjdlTpu1drWnZRhogtS1VH1lNPn8DLueCcSoQjcxlaVopRbqJ427SXT4muoWE6Dc4RVSMVFaoSitW2W31eOnrs+irnZ2Feo3a3DjBOK3lly1NpYT3zlLPbLZnHGYzUW23te76jw2Hh2l6q9OKemEZOXP15JHmJRnHeMjr1eEyzVjCvFqnHVJzg0mnjGHvnn+5yNLz5fszSK5SclvzJReYqPdkZtZafNGI7KT7LYgym5VHhc2Tb/JF/FkE9McL3nzNihSUFrmUVVkouKXLBFczNR+JUcnsiPTYDZoS1QqUJc2tjTNlZajWh70OZVWS8RuPuy3QFYAIB7z/C6y18QvL6S2o01Ti/WT3+y+54M+w/4fWf4T2XozaxO5nKs/hyX2X3A9QZTZHIyUT1MYi+aImckGHShJYIu3f5akl8Xn9yZnIFWmrFY2kvoaN1wnh95n8Xw63qPu6cW/rzOpqYznmUeTu/YzgdX3aVW2l+Xw6rS+kso5Vb/DvS3O04js/wAtWnn7r+h9B0xfQrdvTfJYfpsB8vufYrjVJN06dGuunh1Fn6PBxrnhfELGH/VWdxSwt5SpvH1Wx9o8KUfdqP57jNWOzSa9MoD4RKtFe69UnySMU46ZOUnmTW59qu+H2F43+L4fRqf6nSTf1W5x7j2N4DcyfhwqW8n0p1WvtLIHy2rU0rC5slSzFuaeGe4vP8OMvVacR5b6a9L+a/ocu59iuNW+8KFO4j3pVFn6PAHnE93tjBBScpbdDbvOH31lLTdWleiu86bS+vI0YpJt8/gBfGTfLbBa7ithLxJ4XLLz6Gq1BvLXzMPC5SkvmBuTvq36ltnksZzjPL4CV9CclKvbxnl5ko4Wr7Gjql3TXqit1FnzL6AW/iq1ODjCrNRa06c5WPgV01JLU2RThKW8vqKtVPaPLuBS3ltk08U/mQM/lx6kF1GOPM1mXRGw/JBzqbvouiIQWyzJJdupG7e8Yoo18ucico6Y5exOnGMI596RXNynLLAzRq+HLunzRbdUVGnGUd1n7Mo0m1SzOhOlLfby/HmBpAAgzCLnOMIrMpPCXqffrK3jZ2NvbR2jRpxpr5LB8X9lLVXntNw+k1mPiqb+EfN/I+25AlkZI5MplEjJHJnIEsgjkzkgkZIZM5AkDGRkCWRkxkAZeHzMShGSw1lAyBUreK9xuPwbQVKpFvMnKPZ4/dFuSSl3Ao2SxJPHqaN3wThV9n8TYW1ST/No0y+q3OsYcIvmkB4+79geEVsuhK5tn/pnrX0ef3OFef4cXay7PiFGr2jVi4P6rJ9LdJdG0VVl4dNym8xXMo+OXnshx2zzqsZVYrrRkp/Zb/Y4NejVt56K9KdKf6ZxcX9z7fdX9GjnOMnJueLW1bMK8IVIdYyipfuB8hMH0C+4HwTiGXQzZ1X+n3fpy/Y81xP2ZvrCEqqUa9CKy503yXdog4gAA26PhprU92V1PPcNdCMXvElSz4kpYyUWyjohsigvrS/hruULPUDDZfbT86xzRRpbZZCHhyjLO+QKq0dFWceibBO53rOX6kmCD1X+Gtv4ntBVrPlRoSa+LaX82fUsny3/AA3qOHGLrDw3bv4e9E+kK4mvegn/ALXj9yjayZya8bmk+bcP9ywWqSaymmu6AsyZyV5MpgTyZyQyZyBPIyQyZyBPJnJXkzkgnkzkhkzkCWTOSGRkCYyQyZyBNSwTTzyKchSw9gLjke0147XhMlH/ALlWShH92dVSyjxvtdd+JxGFGL8tvDL/ANz/APyA4NetUq1Hmba5IrSMLYkBlFqup29Go3N+HpbknumsFSNDjdbwuHTinvUah/X9gPK4y9g8INpbIiBKL3LIVHFbFSWzfYsjRbSctkwM+NvvuWKrCe3J+pFqnTeJLfsY8SO+mln4oouWlbrBVPVJ8tuhT513LqVy4R0Tjqh90BXVeVHutgWXEVoUovKb5gg6/sZdq09oaWp4jWjKk/nuvukfRLyrOdOn4VeVF60nKCT556Pbng+PU5yp1Izg9MotNNdGe7seOQvbTd4m15l+l/8Aso9D4t/SS3trpfOlL+a/YLiUKW9xb3Nq1+bRqj/yhlfU5lLikG9MpxU+sc7m3C/S3zgb0slt1HWtb+NxHNtdU669GpftubSupL36ef8Aa8/ZnmncWF5Vn4tCnUnD8zWGv/Jbk6FRVKkqVlf3FOcd/DqNVY4+Et/uZmUrd8eUm69NG6ot4c9L7SWC5PKynld0eb/E8QpZU6Nvcr/65unL6SyvuP8AM7ek814V7J96kHFf8o5j9zTm9LkZOVb3kqsNVC4hXh32kvqjYjeP89L5wefswN5Mzk1Y3VGTxrUX2l5f3L0+vQCzI1EMjIFmRkryZyBZkZK8mcgTyMkMjIE9elOTeEt2fOL64lc3VavLnWm5fLoe243cfhuE3E08SlHQvi9jwMn5sdtiDKMkUw2BNM8/7R181aNFP3Vqfxf/AKO8meQ4hW/EX1ap0csL4LZAaxlbLISDeQJ0t24vlJGdLc2nmTRGEc49C+K/1xWdyiMYTXVLPRLIa7tv4sn5orfL+G5GU01vh+q6AVt6W0sbohzfLD7Em889yD2+BBJSzFxfLmviBLdKXXqAIE6VWdGanTk4yXVEAB3OF8TVe8p0r2NF03lapROzKcKNGc6OdGdsSf2yeKOtZ8SSsfwtSGpptxlnnkxlK6+PKS8utw25krW5rzzplPSnjsv7l3Br501dXSjFzTUI57czQs7ik+GSpzlocZSb9cizxHh9d6mtVR4aXZI5u8ruWPHPGrzo1ZJVE8rfmjrU7z1weM4NcO3q3lWMYSqKKUXKOccydC//AOqmql1UpuW6WlSiu67o645fThnj/wBPXSt7KtPxJ0KaqP8APDyS+scMnClcU3m34hWS/RXiqq+u0vucSldV84h4ddf/AFzw/wDizYjxSMJKNTVTl2qR0m3J2fxd7TyqtrTuI/qoVMP/AIyx+5mnxWzhUUZ1J2dSXKNaLpZ+uz+ppQvE0mnsXxuIyg4tpxfNPdP5Admnc1HFSjUjUi+rX80XK7S9+El6x3R52NpaJuVGDt5v81vJ0/stvsWr8bTX8K7hXX6binh/8o/0A9FCvSntGcW+2cP6FmTzkb6rFP8AF2VRJfmotVo/Reb7GxacRtq70211HV+jVhr/AMXv9gO3kZNKNxUT82mS+jLY3UH7ylD4rK+qA2cmclUZxmsxkpL0ZJMDge11fFG3t0/ek5v4Lb+bPK5zv3On7TV5V+LTjDLVPFPbp3b9NzmJEGUYbJKLfIOm0F01b2v4FpVqLmo7fF7I8kei45Tru2jGFKo4uWZNRe2DzuHnALNGSUY6n6GY02y2MMBCHkWUvL1eck4PDbWPg+TIy8ucPZbmG8ebo9mijMnGMsYaT+xXJ/8AsxN7r0I5Wd+QDn8SUcSTi1iXT1MRWXgzKMlJNEEV7kgZqyUp5Sx3x3AEAAAHIADo29eFd+HjROXLs2XQrVadGdJY0J53OQtnlFquaqedbfx3M3F0mf66FtVjTdfVu5xWDUrQ1STIq6km3ojv6EZXEm9kkSSlylml1O5rUPcqPC6S3RvW/H6sVprQ1R9N19GceU5T5siajFr1FDidhU5ZozfWDcPtyOhCvNpOjcQqLtNaX9VseHJwqTpvNOcov0eCo95G+nS3q06kF+rGqP1RtUeIwn7s1L4M8Pb8Yu6Dzr1L12/Y3ocatq8k7q3Sl+uOz+qwB7WF0n1M1vAu1puKdOsl+uKlj+h5q3vKNRf9NeNP9NRav7m1C6uI7ul4kf1UpavtzKO3CiqcNNtXr0OyU9cV/wCMs/yLo176lFbULnHNxbpSfyeV90cOlxOm3jXiXZ7P7m/TvVhbgdS3vFcVvClb16NbGrFSGMpdpLZ8+5vxnUa0xqyi/gm19ThRuYqvQmn+Zx+q/qkdOnWztnYDzHElGN9WjHLWrm3lmrGUdcIZScpYTNnivl4hVS2XQ5VwpOKcXhrdMzWse+XWrqjbx1a1NrZxNWpf0raePLv15s4Ne4rQblOXxNONSvcTxTjqk38Wc9X7ej3x+nplxWlUktUm49uxqcStaNxGVWCSqL8y6/Eqhw9W9JSuJapte6iq7qyWIwenOMok46MuZy5cpYWOxB1PkYryzXm11eSs7beWpOec/Qm/+yvXBSSlNySitooDOYtYb+ZHDzhmC6koT2m9LXJ9wK08cuZlzeMZMTaTajy79yIAAAAAAAAAAAAAAAAAyuxglBJ5z0Aw0YJPdszJcgIGzRvrmjjTVlhdHua+DGAO1S465JRuqKqr1Wf3/qb1C/sKu1OrUt5PtLb6P+p5jBgD28HWaXhXFCt1jl6JZ+ex0qV7Ug8VIuMuqZ5Pg/Erajbq3rU0t3u1tLJ6OHFKVONOhKlCVBLCklt/ZmLnY7Y+OZTe1fFaqqXNOols1hmjXlGEMs7M6FpcRbhVlBPps0jUq2dpQqeJWquqlyTxjJPeNfxsec/CV+J19NCL0p4lLoju2nD6PD6CS81TrLBi44xQoR/gqKx0RoVOKeLGTltFraK5t+pm21vHHHH/ANU8Ru9dZqD+Zz6k3LmW1Z628LmaVeolmK3fUsjnll9qJPMmwA89djq4MABsDOyXqYAAAAAAAAAAAAAAAAAAAADKWSVPm+xGK2e5On1+gGdSXQjiT35kpLHTJHCfJ4YD4ow0SUG4yk3hLYwop/mAzFOTSSy3tgvp2fi3DpxmlCHvVH/JdfRFdFqnXpy7ST+5Ze6qd1VgqmrLbbWVnPxAsrVbWnPTSppqOyyk/q+pKlfQhDHmj0awsM5+DBNbWWzp3qVROh41CrhJ7xyzWubqpcKMd1FdGznUo1ZZVNSffSJ06tNZmpL1M+rp/ThspPqyaiuryaKqTXKT+pl1JzWG2y+qe8XV7jLcaf1RrBprmX2sIS1SqR1Rj0TwXqMyXK6StUlVjrjz5ZRi73k/ScidfanQSlqWJJem72I1PNbZ7NMrNmmsAAAAAAAAAAAAAAAAAAAAAAGY889gJPZY7cycVpUfUjTjq598ssnuUY9e3QbSMZ7vD6PuG/1R+aAkorRj1yRcPkzMW8ZXmRhSk98fQgi1Jf1Nqc6NzBeJTlGsuc4ST1fGL/kzWcpP/wBGGtnkDM6en83yawytkoJylpWMy2N274erWLVSvCU8bRhuS5SdumHizzluM4jdpzpWvDqUIQSm/NOcntk0K95GSePO33WxZOUq9vRoUqcp1JxTSis8v/RW7KFPapNyn1UMYXzDDRNqyipKtsnJQyiitFRqyUc49TY4W1+NhB8qicPqjOfxta8fyiqsnpWXsmTs1qlVX+hv6GbiOIzXzMcP3ulF8pRlH7Et/wBW7NeRit7kPST/AJGaT1R0Pk0SrrFPH+pP7MpouTnGMU289DePTPlx1lpU1htPoC+tCGZuM1qi910fwKCuYAAAAAAAAAAAAAAAAAABlczAAuptKJJrKxyaK4J6W0icZp8+ZQW+U1v1Rhxa91/InKOrfqRUvNiWz7gR2e/uv0GcLknjqyxxzv8AcioqUm5Pyx6AVx36Nk3FpZaiviZWqW+VFdENEFvKWQILCaw+XZHQq/xbeM+rW5pOpBbLc6Nuo3MU6mUvD2SljLWxy8nHL1/4mXNw/V0Zxp2NvQoaop09VV5fnbfL4Lb7mtPTDGp4y8I2bKNSu5UNNNRoxbjKWrOG+W3MouYyVSpGTUlCMZ5jHGNzc55ebLG42yubdLFxMW0/DuaU/wBM0/uW3FN1Lnmk5JPcwreEakFOeU2s6US2a0SXt0OJ2tRVqrhSm4ZluovBo8Ni/wDMKHrI7nG+JVFcqjRShCklFYOHGSo8Ri1yU8nn8WWWXj5/Hq8/zmTq3dtY06roSnOUpLCknjTLpt2OLCro6L4I3qizxJZ3zUOZL3n8Tp4utWufn72ut6UKuvxKsaeFlN9SgvtYSlUeKetKLbT5JFU8atlhPfHY7POiAAAAAAAAAAAAAAAAAAAAAtgnoQks81hmVjQk3jYkpbYlhlEITcdnyLJJTiYcFJbFfmpsCyDaemRmTSj3MalJJvmNWlZzkDPnl0SZB0m+byPNu2vuM1AMqnjkJKXlUcuWenMjqn2JQqSptS07p9SDZ4bWnG8X8acXKLjnLx8/QtqXFSVR2lWT0Nvn39e5W8Tl4sWo1Vty5/H+pXerlLlNbNZ5PqRqzjZdNwdKfJpYNepJvq3n1NviEcqio7tx1yS6Z7mp4bTzKUV88/sEdTiOakbev/8ALSi/nyZzrza6l8v2O3T/AAsuE0adeb1Qy4NJ8nucW7cZVXUWd3jkefw96109Pmu8Y3vDbnSr5WFhv4o5lSDhVlGXNG1GTqU1hyxnBq3E3OtJtYecfTY6YSxz8mW9NujNyppJvGHlLrszQe7Ny1eNOeSksmpOOmcovo8G8ftjLnTAANMAAAAAAAAAAAAAAAAAAW7QF3T4GNMZdMP0MvuZ1L82CiGZQ+BNVIyWJGU4vqYlTT5bARccPMXlGG+RiUXHZmFz7EE1KWfyk/FXVFSSS3JqnB8mUS8aJGc9UH9TPg9mYcJKL32wBapuLUovfmbNS5nVpa91vjG0v3NOL8sX6F1vUhTm/EUHHHKabRmz7axuuGvWrTntOcpejZBye2yJV5RcsR04z0RjCis5ESt7h8pV4zpVJSajHypJM07mLjNZezRClKUZZi2n6EZNuTy8skx1drctzS6lWUKMoOOcvOSqo06kmlhN5wYXJmcZ+mS6Ta+ivI8dSu6WLibXXzfXcvtnmlNdYy/cpuVvB94r7bGZ3Wr8YpABtgAAAAAAAAAAAAAAAAJQWZoiSht8XsBP54It+iZJmNk8tIojjPJYM4muWSfixXQx43oBHXLGH9yKeHkm6jfREG2yDOz6mdD6MiscmT80d1ugMYnHuSUpN4fUyq36kSUot5yUYpPyY7MS5EYvE5olnJBVPmT06kmRnyMxb089gMvEMLqQn7zMSe5mXQDCMrl8jESWP4eQMRnKOdLayZk3KGW84ZGHvIuqxSpZSSw1+39iL9KAAVAAAAAAAAAAAAAAAAAl2Iko8gMtjZvdhh8tgM4gjGYLkskcGVFsA5Z5JIiS0pc2Yb7AYJxk1uvmiBmL3AswnvH6EXjtgz8OYTz8ezKMcprG+xN7Mwo5e6wo5bIuSaW7TRAl1MR3jgc+phNLIB4ySxmK+hFvssBSlFNJtJ8/UDMXplnCeO5mTzlpYT6diKRYktLXoBUtnk2Z70peiT+/9zWNqO9N+sX+2f5Ga1GqADTIAAAAAAAAAAAAAAAAZXIACRhgASRFyYAEQuYAB8wgAJ/yMveKl1AKMZfIiuYBAaMAADIABcyb2eAAIPmbNDeMV8v3AJk1j21QAVkAAAAAf//Z";
const FONT_LINK_ID = "alla-check-fonts";
function useFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
    document.head.appendChild(link);
  }, []);
}

const MODULES = [
  { key: "novo-relatorio", desc: "Iniciar atendimento técnico", label: "Novo Relatório", icon: FileText, active: true },
  { key: "historico", desc: "Atendimentos realizados", label: "Histórico", icon: Clock, active: true },
  { key: "ferramentas", desc: "Calculadoras e assistentes", label: "Ferramentas", icon: Sparkles, active: true },
  { key: "documentos", desc: "Propostas e comprovantes", label: "Recibos & Orçamentos", icon: FileCheck2, active: true },
  { key: "pmocs", desc: "Verificações obrigatórias", label: "PMOCs", icon: ClipboardList, active: true },
  { key: "os", desc: "OS abertas e concluídas", label: "Ordens de Serviço", icon: Wrench, active: true },
  { key: "financeiro", desc: "Receitas, despesas e lucro", label: "Financeiro", icon: BarChart3, active: true },
  { key: "os-frio", desc: "Refrigeração comercial", label: "OS Frio", icon: Snowflake, active: true },
  { key: "central-whatsapp", desc: "Mensagens para clientes", label: "Central WhatsApp", icon: MessageCircle, active: true },
  { key: "gestao-inteligente", desc: "Indicadores do negócio", label: "Gestão Inteligente", icon: BarChart3, active: true },
  { key: "vendas-cervejeira", desc: "Gestão de vendas", label: "Vendas Cervejeira", icon: Snowflake, active: true },
  { key: "funcionarios", desc: "Equipe e permissões", label: "Funcionários", icon: Users, active: true },
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function resizeImage(file, maxDim = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDim) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else if (height > maxDim) {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------- Premium card press interaction (depth only) ---------------- */
function useCardFX() {
  const [pressed, setPressed] = useState(false);

  const handlers = {
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
  };

  return { pressed, handlers };
}

/* ---------------- Sub-page Header (Novo Relatório, Histórico, módulos) ---------------- */
function Header({ title, onBack, onMenu }) {
  return (
    <div
      style={{
        height: 72,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 16px",
        background: "#000000",
        borderBottom: "1px solid #1C1C1C",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      <button
        onClick={onBack || onMenu}
        aria-label={onBack ? "Voltar" : "Menu"}
        style={{
          background: "#0B0B0A",
          border: "1px solid rgba(201,162,75,0.35)",
          borderRadius: 10,
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#C9A24B",
          flexShrink: 0,
        }}
      >
        {onBack ? <ChevronLeft size={20} /> : <Menu size={18} />}
      </button>
      <div style={{ lineHeight: 1.1 }}>
        <div
          style={{
            fontFamily: "'Roboto',sans-serif",
            fontWeight: 600,
            letterSpacing: 0.5,
            fontSize: 17,
            color: "#F3F3F1",
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10,
            color: "#7A7A7A",
            letterSpacing: 1,
          }}
        >
          ALLA CHECK
        </div>
      </div>
    </div>
  );
}

/* ---------------- Menu Drawer (hamburger) ---------------- */
function MenuDrawer({ open, onClose, onNavigate, usuario, onSair }) {
  const { podeInstalar, instalar } = useInstalacao();
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        pointerEvents: open ? "auto" : "none",
      }}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          opacity: open ? 1 : 0,
          transition: "opacity 0.25s ease",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: "78%",
          maxWidth: 300,
          background: "#000000",
          borderRight: "1px solid #1C1C1C",
          transform: open ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.28s cubic-bezier(.4,0,.2,1)",
          padding: "22px 16px",
          overflowY: "auto",
        }}
      >
        <img
          src={LOGO_DATA_URI}
          alt="ALLA SERVICE"
          style={{ width: 62, display: "block", marginBottom: 20, paddingLeft: 4, opacity: 0.95 }}
        />
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10.5,
            color: "#7A7A7A",
            letterSpacing: 1.5,
            textTransform: "uppercase",
            marginBottom: 18,
            paddingLeft: 4,
          }}
        >
          Navegação
        </div>
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              onClick={() => m.active && (onNavigate(m.key), onClose())}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "transparent",
                border: "none",
                borderBottom: "1px solid #161616",
                padding: "15px 4px",
                textAlign: "left",
                cursor: m.active ? "pointer" : "default",
                opacity: m.active ? 1 : 0.5,
              }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  borderRadius: 10,
                  background: m.active ? "rgba(201,162,75,0.10)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${m.active ? "rgba(201,162,75,0.45)" : "#262626"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={14} color={m.active ? "#C9A24B" : "#5A5A5A"} strokeWidth={1.6} />
              </span>
              <span
                style={{
                  fontFamily: "'Roboto',sans-serif",
                  fontSize: 15,
                  color: m.active ? "#F3F3F1" : "#7A7A7A",
                  letterSpacing: 0.3,
                }}
              >
                {m.label}
                {m.desc && (
                  <div style={{ fontSize: 12, color: "#7A7A7A", fontWeight: 400, marginTop: 2 }}>
                    {m.desc}
                  </div>
                )}
              </span>
              {!m.active && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 8,
                    fontFamily: "'JetBrains Mono',monospace",
                    color: "#5A5A5A",
                    border: "1px solid #262626",
                    borderRadius: 4,
                    padding: "2px 5px",
                  }}
                >
                  EM BREVE
                </span>
              )}
            </button>
          );
        })}

        {/* conta do usuário e saída */}
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid #161616" }}>
          {usuario && (
            <div style={{ fontSize: 12, color: "#7A7A7A", marginBottom: 12, paddingLeft: 4, wordBreak: "break-word" }}>
              {usuario.displayName || usuario.email}
            </div>
          )}
          {podeInstalar && (
            <button
              onClick={instalar}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "rgba(201,162,75,0.08)",
                border: "1px solid rgba(201,162,75,0.40)",
                borderRadius: 12,
                padding: "11px 12px",
                color: "#E9C878",
                fontFamily: "'Roboto',sans-serif",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              <Plus size={15} color="#C9A24B" /> Instalar app
            </button>
          )}
          <button
            onClick={onSair}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "transparent",
              border: "1px solid #2A2A2E",
              borderRadius: 12,
              padding: "11px 12px",
              color: "#C7C9CE",
              fontFamily: "'Roboto',sans-serif",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <X size={15} color="#8A8A90" /> Sair da conta
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Stat card (2x2 grid) ---------------- */
/* ---------------- Stat card (fixed-canvas, absolutely positioned) ---------------- */
function StatCard({ icon: Icon, glow, value, label, arrow, onClick, left, top, width = 286, height = 365 }) {
  const { pressed, handlers } = useCardFX();
  return (
    <button
      onClick={onClick}
      {...handlers}
      className={`premium-card${pressed ? " is-pressed" : ""}`}
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        background: "#111110",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 36,
        boxSizing: "border-box",
        padding: "0 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 18px rgba(0,0,0,0.45)",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
          // halo mais forte ao redor do ícone (só brilho, nada de tamanho)
          background: `radial-gradient(circle, ${glow}45, ${glow}12 55%, transparent 74%)`,
          border: `1px solid ${glow}88`,
          boxShadow: `0 0 20px -6px ${glow}, inset 0 0 14px -8px ${glow}`,
          flexShrink: 0,
        }}
      >
        <Icon size={32} color={glow} strokeWidth={1.9} />
      </div>
      {value !== undefined ? (
        <div
          style={{
            fontFamily: "'Roboto',sans-serif",
            fontWeight: 700,
            fontSize: 70,
            color: "#ffffff",
            lineHeight: 1,
          }}
        >
          {value}
        </div>
      ) : (
        <div style={{ color: "#C9A24B", fontSize: 34, marginBottom: 2, lineHeight: 1 }}>{arrow}</div>
      )}
      <div
        style={{
          fontFamily: "'Roboto',sans-serif",
          fontSize: 18,
          color: "#666666",
          marginTop: 12,
          textAlign: "center",
          lineHeight: 1.25,
        }}
      >
        {label}
      </div>
    </button>
  );
}

/* ---------------- Home — fixed 748x1536 canvas, scaled as one composition ---------------- */
const CANVAS_W = 748;
const CANVAS_H = 1491;

function HomeScreen({ onNavigate, onMenu, reportCount, orcamentosCount, vendasCount, importProgress, importDone }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth;
      if (!w) return;
      // uniform scale driven by width only — the canvas height then
      // follows exactly (scale is always equal for X and Y), and the
      // wrapper height below is set to match so no dead space is
      // reserved by the transform (transform:scale doesn't shrink the
      // element's layout box on its own).
      setScale(w / CANVAS_W);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: CANVAS_H * scale,
        background: "#000000",
      }}
    >
      <div
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          position: "relative",
          background: "#000000",
          overflow: "hidden",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {/* fundo — foto do profissional, opacidade baixa, atrás de todo o conteúdo */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${BG_PHOTO_DATA_URI})`,
            backgroundSize: "cover",
            backgroundPosition: "top center",
            opacity: 0.16,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.9) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* menu — 33,21, 84x85 */}
        <button
          onClick={onMenu}
          aria-label="Menu"
          style={{
            position: "absolute",
            left: 33,
            top: 21,
            width: 84,
            height: 85,
            borderRadius: 24,
            background: "#10100f",
            border: "1px solid rgba(190,150,30,0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <Menu size={30} color="#C9A24B" strokeWidth={1.6} />
        </button>

        {/* logo — box X287-461, Y99-236 (174x137), object-fit contain preserves real proportion */}
        <div
          style={{
            position: "absolute",
            left: 218,
            top: 45,
            width: 314,
            height: 247,
          }}
        >
          <img
            src={LOGO_DATA_URI}
            alt="ALLA SERVICE"
            style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
          />
        </div>

        {/* owner badge — 267,350, 214x42 */}
        <div
          style={{
            position: "absolute",
            left: 267,
            top: 305,
            width: 214,
            height: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: "#0A0A09",
            border: "1px solid #232320",
            borderRadius: 20,
            boxSizing: "border-box",
          }}
        >
          <span style={{ color: "#8A7A4A", fontSize: 8 }}>●</span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              color: "#8A8A8A",
              letterSpacing: 1.8,
              whiteSpace: "nowrap",
            }}
          >
            PROPRIETÁRIO
          </span>
        </div>

        {/* institutional title — text Y411-430, left line X52-149, right line X599-696 */}
        <div style={{ position: "absolute", left: 52, top: 374, width: 97, height: 1, background: "rgba(190,150,30,0.22)" }} />
        <div style={{ position: "absolute", left: 599, top: 374, width: 97, height: 1, background: "rgba(190,150,30,0.22)" }} />
        <div
          style={{
            position: "absolute",
            left: 149,
            top: 366,
            width: 450,
            height: 19,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: "'Roboto',sans-serif",
              fontSize: 17,
              fontWeight: 600,
              color: "#c49a27",
              letterSpacing: 4,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Gestão Técnica Profissional
          </div>
        </div>

        {/* divider — Y459, full width */}
        <div style={{ position: "absolute", left: 0, top: 414, width: CANVAS_W, height: 1, background: "rgba(190,150,30,0.22)" }} />

        {/* panel title — 24,486 */}
        <div
          style={{
            position: "absolute",
            left: 24,
            top: 441,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 16,
            fontWeight: 600,
            color: "#77601c",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          Painel de Gestão
        </div>

        {/* visão geral — 24,523 */}
        <div
          style={{
            position: "absolute",
            left: 24,
            top: 478,
            fontFamily: "'Roboto',sans-serif",
            fontWeight: 700,
            fontSize: 32,
            color: "#ffffff",
          }}
        >
          Visão Geral
        </div>

        {/* cards — exact coordinates */}
        <StatCard
          icon={CheckCircle2}
          glow="#4681DF"
          value={reportCount}
          label="Ordens Concluídas"
          onClick={() => onNavigate("historico")}
          left={78}
          top={531}
          width={286}
          height={364}
        />
        <StatCard
          icon={FileText}
          glow="#E07A30"
          value={orcamentosCount}
          label="Orçamentos Emitidos"
          onClick={() => onNavigate("orcamentos")}
          left={384}
          top={530}
          width={286}
          height={365}
        />
        <StatCard
          icon={Beer}
          glow="#3FBCD1"
          value={vendasCount}
          label="Cervejeiras Vendidas"
          onClick={() => onNavigate("vendas-cervejeira")}
          left={78}
          top={915}
          width={286}
          height={365}
        />
        <StatCard
          icon={TrendingUp}
          glow="#C9A24B"
          arrow="→"
          label="Gestão Inteligente"
          onClick={() => onNavigate("gestao-inteligente")}
          left={384}
          top={915}
          width={286}
          height={365}
        />

        {/* bottom line — X231-517, Y1439 */}
        <div style={{ position: "absolute", left: 231, top: 1394, width: 286, height: 1, background: "rgba(190,150,30,0.18)" }} />

        {/* footer — Y1470, centered */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 1425,
            width: CANVAS_W,
            textAlign: "center",
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 11,
            color: "#C9A24B",
            letterSpacing: 3,
            fontWeight: 600,
          }}
        >
          ALLA SERVICE © 2026 · AR / REFRIGERAÇÃO COMERCIAL
        </div>

        {importProgress && !importDone && (
          <div
            style={{
              position: "absolute",
              right: 24,
              top: 40,
              display: "flex",
              alignItems: "center",
              gap: 7,
              background: "#0A0A09",
              border: "1px solid rgba(190,150,30,0.3)",
              borderRadius: 20,
              padding: "8px 14px",
            }}
          >
            <Loader2 size={13} color="#C9A24B" className="spin" />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#C9A24B" }}>
              Importando dados {importProgress.done}/{importProgress.total}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Signature pad ---------------- */
function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#F3F3F1";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
      img.src = value;
    }
  }, []);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = getPos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    last.current = pos;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  };

  return (
    <div>
      <div
        style={{
          background: "#0F0F10",
          border: "1px dashed #3A3A3E",
          borderRadius: 12,
          height: 150,
          position: "relative",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", touchAction: "none", borderRadius: 12 }}
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!value && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#5A5A5F",
              fontSize: 12.5,
              pointerEvents: "none",
              fontFamily: "'JetBrains Mono',monospace",
            }}
          >
            assine aqui
          </div>
        )}
      </div>
      <button
        onClick={clear}
        style={{
          marginTop: 8,
          background: "none",
          border: "none",
          color: "#8A8A90",
          fontSize: 12.5,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
        }}
      >
        <Eraser size={13} /> limpar assinatura
      </button>
    </div>
  );
}

/* ---------------- Field ---------------- */
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10.5,
          color: "#8A8A90",
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "#141416",
  border: "1px solid #2A2A2E",
  borderRadius: 10,
  padding: "11px 12px",
  color: "#F3F3F1",
  fontSize: 14.5,
  fontFamily: "'Roboto',sans-serif",
  outline: "none",
  boxSizing: "border-box",
};

/* ---------------- Ferramentas — catálogo ---------------- */
const TOOLS = [
  { key: "assinaturas", label: "Assinaturas", desc: "Contratos recorrentes, vencimentos e cobrança", icon: CalendarClock, active: true },
  { key: "btu", label: "Calculadora de BTU", desc: "Dimensionamento de ar-condicionado por ambiente", icon: Calculator, active: true },
  { key: "conversor", label: "Conversor Técnico", desc: "BTU, pressão, temperatura, potência e medidas", icon: Ruler, active: true },
  { key: "orcamento-ia", label: "Orçamento Inteligente IA", desc: "Monta orçamentos profissionais automaticamente", icon: Sparkles, active: true },
  { key: "pecas-ia", label: "Assistente de Peças IA", desc: "Identifica e sugere peças por sintoma", icon: PackageSearch, active: true },
  { key: "checklist-ia", label: "Checklist do Equipamento IA", desc: "Checklist técnico com diagnóstico automático", icon: ClipboardCheck, active: true },
  { key: "historico-equipamento", label: "Histórico do Equipamento", desc: "Ficha e linha do tempo por equipamento", icon: History, active: true },
  { key: "manuais", label: "Manuais", desc: "Biblioteca de manuais técnicos em PDF", icon: BookOpen, active: false },
  { key: "rastreio-tecnico", label: "Rastreio do Técnico", desc: "Acompanhamento do técnico em campo", icon: Navigation, active: true },
  { key: "relatorios-financeiros", label: "Relatórios Financeiros", desc: "Faturamento, custos e lucro por período", icon: LineChart, active: true },
  { key: "gerador-os", label: "Gerador de Ordem de Serviço", desc: "OS profissional em PDF com assinatura", icon: FileText, active: false },
  { key: "laudo-tecnico", label: "Gerador de Laudo Técnico", desc: "Laudo profissional a partir do diagnóstico", icon: FileCheck2, active: true },
  { key: "pmoc-tool", label: "PMOC", desc: "Plano de manutenção com alertas de vencimento", icon: CalendarClock, active: true },
  { key: "mensagens-whatsapp", label: "Mensagens WhatsApp", desc: "Mensagens prontas para cada etapa do serviço", icon: MessageSquareText, active: false },
  { key: "assistente-ia", label: "Assistente Técnico IA", desc: "Tira dúvidas técnicas de climatização e elétrica", icon: Bot, active: false },
];

function ToolCard({ tool, onClick }) {
  const Icon = tool.icon;
  const { pressed, handlers } = useCardFX();
  const cor = corDaFerramenta(tool);
  const ativo = tool.active;

  return (
    <button
      onClick={onClick}
      {...handlers}
      className={`premium-card${pressed ? " is-pressed" : ""}`}
      style={{
        background: "#0C0C0D",
        // borda quase imperceptível; acende discretamente na cor da ferramenta ao tocar
        border: `1px solid ${pressed && ativo ? `${cor}55` : "rgba(255,255,255,0.06)"}`,
        borderRadius: 18,
        padding: "15px 13px 13px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 11,
        minWidth: 0,
        minHeight: 148,
        opacity: ativo ? 1 : 0.62,
        boxShadow: pressed && ativo ? `0 0 22px -12px ${cor}` : "none",
        transition: "border-color 200ms, box-shadow 200ms, transform 190ms cubic-bezier(.4,0,.2,1)",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 13,
          flexShrink: 0,
          background: ativo ? `${cor}16` : "rgba(255,255,255,0.03)",
          border: `1px solid ${ativo ? `${cor}3A` : "rgba(255,255,255,0.07)"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={21} color={ativo ? cor : "#5A5A5F"} strokeWidth={1.7} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Roboto',sans-serif",
            fontSize: 14,
            fontWeight: 600,
            color: ativo ? "#F3F3F1" : "#8A8A90",
            lineHeight: 1.25,
            marginBottom: 5,
            wordBreak: "break-word",
          }}
        >
          {tool.label}
        </div>
        <div style={{ fontSize: 11.5, color: "#77777C", lineHeight: 1.4 }}>{tool.desc}</div>
      </div>

      {!ativo && (
        <span
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 8.5,
            letterSpacing: 1,
            color: "#6E6E73",
            textTransform: "uppercase",
          }}
        >
          Em breve
        </span>
      )}
    </button>
  );
}

/* Agrupamento visual das ferramentas. Nenhuma ferramenta é removida:
   o que não estiver listado aqui cai automaticamente em "Utilidades". */
const TOOL_CATEGORIAS = [
  { titulo: "Gestão", chaves: ["assinaturas", "pmoc-tool"] },
  { titulo: "Operação", chaves: ["rastreio-tecnico", "gerador-os", "laudo-tecnico"] },
  { titulo: "Equipamentos", chaves: ["historico-equipamento", "manuais"] },
  { titulo: "Financeiro", chaves: ["relatorios-financeiros"] },
  { titulo: "Inteligência Artificial", chaves: ["orcamento-ia", "pecas-ia", "checklist-ia", "assistente-ia"] },
  { titulo: "Comunicação", chaves: ["mensagens-whatsapp"] },
  { titulo: "Utilidades", chaves: ["btu", "conversor"] },
];

/* Cor característica de cada ferramenta, para os ícones não ficarem todos iguais. */
const TOOL_CORES = {
  assinaturas: "#C9A24B",
  "pmoc-tool": "#9B8AFB",
  "rastreio-tecnico": "#4681DF",
  "gerador-os": "#4681DF",
  "laudo-tecnico": "#3FBCD1",
  "historico-equipamento": "#E07A30",
  manuais: "#8A8A90",
  "relatorios-financeiros": "#4ADE80",
  "orcamento-ia": "#E9C878",
  "pecas-ia": "#9B8AFB",
  "checklist-ia": "#3FBCD1",
  "assistente-ia": "#9B8AFB",
  "mensagens-whatsapp": "#4ADE80",
  btu: "#4681DF",
  conversor: "#E07A30",
};
const corDaFerramenta = (t) => TOOL_CORES[t.key] || "#C9A24B";

const TOOL_ROUTE_OVERRIDES = { "pmoc-tool": "pmocs" };

function FerramentasScreen({ onNavigate }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return TOOLS;
    return TOOLS.filter(
      (t) => t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
    );
  }, [search]);

  /* Monta os grupos a partir do que sobrou do filtro.
     Qualquer ferramenta não mapeada entra em "Utilidades", então
     nenhuma deixa de aparecer. */
  const grupos = useMemo(() => {
    const visiveis = new Set(filtered.map((t) => t.key));
    const usadas = new Set();
    const saida = [];

    TOOL_CATEGORIAS.forEach(({ titulo, chaves }) => {
      const itens = [];
      chaves.forEach((k) => {
        const t = TOOLS.find((x) => x.key === k);
        if (t && visiveis.has(k)) itens.push(t);
        if (t) usadas.add(k);
      });
      if (itens.length) saida.push({ titulo, itens });
    });

    const restantes = filtered.filter((t) => !usadas.has(t.key));
    if (restantes.length) {
      const utils = saida.find((g) => g.titulo === "Utilidades");
      if (utils) utils.itens.push(...restantes);
      else saida.push({ titulo: "Utilidades", itens: restantes });
    }
    return saida;
  }, [filtered]);

  return (
    <div style={{ padding: "16px 14px 40px" }}>
      <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 22, color: "#F3F3F1" }}>
        Ferramentas
      </div>
      <div style={{ fontSize: 12.5, color: "#8A8A90", marginTop: 4, marginBottom: 16 }}>
        Ferramentas inteligentes para facilitar seu trabalho
      </div>

      <div style={{ position: "relative", marginBottom: 8 }}>
        <Search size={16} color="#6E6E73" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ferramenta..."
          style={{ ...inputStyle, paddingLeft: 36 }}
        />
      </div>

      {grupos.map(({ titulo, itens }) => (
        <div key={titulo}>
          {/* título da categoria: discreto, com um traço fino ocupando o resto da linha */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "26px 0 12px" }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 9.5,
                color: "#8A8A90",
                letterSpacing: 2,
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              {titulo}
            </span>
            <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#4A4A4F" }}>
              {itens.length}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 11 }}>
            {itens.map((tool) => (
              <ToolCard
                key={tool.key}
                tool={tool}
                onClick={() => onNavigate(TOOL_ROUTE_OVERRIDES[tool.key] || `tool-${tool.key}`)}
              />
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73", fontSize: 13 }}>
          Nenhuma ferramenta encontrada para "{search}".
        </div>
      )}
    </div>
  );
}

/* ---------------- Ferramenta: Calculadora de BTU ---------------- */
const BTU_CAPACITIES = [7000, 9000, 12000, 18000, 21000, 24000, 30000, 36000, 48000, 60000];

function BtuCalculator() {
  const emptyForm = {
    tipoAmbiente: "Quarto",
    comprimento: "",
    largura: "",
    altura: "2.7",
    pessoas: "1",
    eletronicos: "0",
    incidenciaSolar: "Média",
    telefone: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [tentouCalcular, setTentouCalcular] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const parsedComprimento = parseFloat(String(form.comprimento).replace(",", "."));
  const parsedLargura = parseFloat(String(form.largura).replace(",", "."));
  const parsedAltura = parseFloat(String(form.altura).replace(",", "."));

  const camposValidos =
    parsedComprimento > 0 && parsedLargura > 0 && parsedAltura > 0;

  const result = useMemo(() => {
    if (!camposValidos) return null;

    const area = parsedComprimento * parsedLargura;
    const volume = area * parsedAltura;
    let btu = area * 600;

    const pessoas = Math.max(0, parseInt(form.pessoas) || 0);
    if (pessoas > 2) btu += (pessoas - 2) * 600;

    const eletronicos = Math.max(0, parseInt(form.eletronicos) || 0);
    btu += eletronicos * 600;

    const solarMult = { Baixa: 1, Média: 1.1, Alta: 1.2 }[form.incidenciaSolar] || 1;
    btu *= solarMult;

    const tipoMult =
      {
        Quarto: 1,
        Sala: 1,
        Escritório: 1.1,
        Loja: 1.2,
        Comércio: 1.2,
        "Sala Comercial": 1.15,
        Outro: 1,
      }[form.tipoAmbiente] || 1;
    btu *= tipoMult;

    const recomendado = BTU_CAPACITIES.find((cap) => cap >= btu) || BTU_CAPACITIES[BTU_CAPACITIES.length - 1];
    const tr = (recomendado / 12000).toFixed(1);

    const observacoes = [];
    if (form.incidenciaSolar === "Alta") observacoes.push("ambiente com alta incidência solar — considere película ou cortina térmica");
    if (pessoas > 4) observacoes.push("ocupação elevada — reavalie a carga em horários de pico");
    if (eletronicos >= 3) observacoes.push("carga eletrônica relevante — equipamentos geram calor adicional");
    if (!observacoes.length) observacoes.push("condições padrão, sem fatores de carga adicionais relevantes");

    return { area, volume, btuEstimado: Math.round(btu), recomendado, tr, observacoes };
  }, [camposValidos, parsedComprimento, parsedLargura, parsedAltura, form.pessoas, form.eletronicos, form.incidenciaSolar, form.tipoAmbiente]);

  const mensagemBtu = () => {
    const sep = "━━━━━━━━━━━━━━━━━━";
    return [
      "⚡ *ALLA SERVICE*",
      "*DIMENSIONAMENTO DE AR-CONDICIONADO*",
      "",
      sep,
      "",
      "📋 *Resultado do cálculo*",
      "",
      `🏢 Ambiente: ${form.tipoAmbiente}`,
      `📐 Dimensões: ${form.comprimento} × ${form.largura} × ${form.altura} m`,
      `📏 Área: ${result.area.toFixed(1)} m²`,
      `📦 Volume: ${result.volume.toFixed(1)} m³`,
      `👥 Pessoas: ${form.pessoas}`,
      `💻 Eletrônicos: ${form.eletronicos}`,
      `☀️ Incidência solar: ${form.incidenciaSolar}`,
      "",
      sep,
      "",
      "🔥 *Carga térmica estimada*",
      `*${result.btuEstimado.toLocaleString("pt-BR")} BTUs*`,
      "",
      "❄️ *CAPACIDADE RECOMENDADA*",
      `*${result.recomendado.toLocaleString("pt-BR")} BTUs* (${result.tr} TR)`,
      "",
      "✓ Dimensionamento adequado para as condições informadas.",
      ...(result.observacoes.length ? ["", `_${result.observacoes.join(" · ")}_`] : []),
      "",
      sep,
      "",
      "*ALLA SERVICE*",
      "AR / ELÉTRICA",
      "",
      "📲 Atendimento e orçamento:",
      "(15) 99198-9866",
    ].join("\n");
  };

  const enviarWhatsapp = () => {
    if (!result) return;
    const texto = encodeURIComponent(mensagemBtu());
    const telefone = (form.telefone || "").replace(/\D/g, "");
    const url = telefone ? `https://wa.me/55${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, "_blank");
  };

  const compartilharBtu = () => {
    if (!result) return;
    compartilhar({
      titulo: "Dimensionamento de ar-condicionado — ALLA SERVICE",
      texto: mensagemBtu(),
      telefone: form.telefone,
    });
  };

  const novoCalculo = () => {
    setForm(emptyForm);
    setTentouCalcular(false);
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <Field label="Tipo de ambiente">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.tipoAmbiente} onChange={set("tipoAmbiente")}>
          <option>Quarto</option>
          <option>Sala</option>
          <option>Escritório</option>
          <option>Loja</option>
          <option>Comércio</option>
          <option>Sala Comercial</option>
          <option>Outro</option>
        </select>
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Comprimento (m) *">
            <input style={inputStyle} value={form.comprimento} onChange={set("comprimento")} placeholder="Ex: 4" inputMode="decimal" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Largura (m) *">
            <input style={inputStyle} value={form.largura} onChange={set("largura")} placeholder="Ex: 3" inputMode="decimal" />
          </Field>
        </div>
      </div>
      <Field label="Altura do pé-direito (m) *">
        <input style={inputStyle} value={form.altura} onChange={set("altura")} inputMode="decimal" />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Pessoas no ambiente">
            <input style={inputStyle} value={form.pessoas} onChange={set("pessoas")} inputMode="numeric" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Eletrônicos">
            <input style={inputStyle} value={form.eletronicos} onChange={set("eletronicos")} inputMode="numeric" />
          </Field>
        </div>
      </div>
      <Field label="Incidência solar">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.incidenciaSolar} onChange={set("incidenciaSolar")}>
          <option>Baixa</option>
          <option>Média</option>
          <option>Alta</option>
        </select>
      </Field>
      <Field label="WhatsApp para envio (opcional)">
        <input style={inputStyle} value={form.telefone} onChange={set("telefone")} placeholder="15999999999" inputMode="numeric" />
      </Field>

      {!camposValidos && (
        <button
          onClick={() => setTentouCalcular(true)}
          style={{
            width: "100%",
            marginTop: 6,
            background: "#141416",
            border: "1px solid #2A2A2E",
            borderRadius: 12,
            padding: "12px 0",
            color: "#8A8A90",
            fontFamily: "'Roboto',sans-serif",
            fontWeight: 600,
            fontSize: 13.5,
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Calcular
        </button>
      )}

      {tentouCalcular && !camposValidos && (
        <div style={{ color: "#F0605A", fontSize: 12, marginTop: 10, textAlign: "center" }}>
          Preencha comprimento, largura e altura com valores maiores que zero.
        </div>
      )}

      {result && (
        <div
          style={{
            background: "linear-gradient(135deg,#151517,#1C1C1F)",
            border: "1px solid rgba(201,162,75,0.35)",
            borderRadius: 16,
            padding: 18,
            marginTop: 18,
          }}
        >
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10.5,
              color: "#C9A24B",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Resultado do cálculo
          </div>

          {/* Número principal em destaque: é a informação que o técnico procura */}
          <div
            style={{
              textAlign: "center",
              padding: "22px 12px 18px",
              background: "radial-gradient(circle at 50% 0%, rgba(201,162,75,0.10), transparent 70%)",
              border: "1px solid rgba(201,162,75,0.30)",
              borderRadius: 16,
              marginBottom: 14,
            }}
          >
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#8A8A90", letterSpacing: 2, textTransform: "uppercase" }}>
              Capacidade indicada
            </div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: "clamp(38px, 13vw, 56px)", color: "#E9C878", lineHeight: 1.05, marginTop: 6 }}>
              {result.recomendado.toLocaleString("pt-BR")}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: "#C9A24B", letterSpacing: 3, marginTop: 2 }}>
              BTUs
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, background: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 20, padding: "5px 12px" }}>
              <Check size={12} color="#4ADE80" />
              <span style={{ fontSize: 11.5, color: "#4ADE80" }}>Dimensionamento adequado</span>
            </div>
            <div style={{ fontSize: 11, color: "#6E6E73", marginTop: 8 }}>{result.tr} TR</div>
          </div>

          {/* Detalhes do cálculo em cards */}
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 12 }}>
            {[
              ["Área", `${result.area.toFixed(1)} m²`],
              ["Volume", `${result.volume.toFixed(1)} m³`],
              ["Carga térmica", `${result.btuEstimado.toLocaleString("pt-BR")} BTUs`],
              ["Ambiente", form.tipoAmbiente],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "11px 13px" }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#8A8A8A", letterSpacing: 1.4, textTransform: "uppercase" }}>
                  {rotulo}
                </div>
                <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: "clamp(14px, 4.6vw, 17px)", color: "#F5F5F5", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {valor}
                </div>
              </div>
            ))}
          </div>

          {/* Recomendação técnica */}
          <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "13px 14px", marginBottom: 4 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>
              Recomendação ALLA SERVICE
            </div>
            <div style={{ fontSize: 12.5, color: "#C7C9CE", lineHeight: 1.5 }}>
              Para as condições informadas, recomenda-se um equipamento de aproximadamente{" "}
              <b style={{ color: "#E9C878" }}>{result.recomendado.toLocaleString("pt-BR")} BTUs</b>.
            </div>
            {result.observacoes.length > 0 && (
              <div style={{ fontSize: 11.5, color: "#8A8A90", marginTop: 8, lineHeight: 1.45 }}>
                {result.observacoes.join(" · ")}
              </div>
            )}
          </div>

          <button
            onClick={enviarWhatsapp}
            style={{
              width: "100%",
              marginTop: 16,
              background: "linear-gradient(135deg,#C9A24B,#E9C878)",
              border: "none",
              borderRadius: 12,
              padding: "12px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              fontFamily: "'Roboto',sans-serif",
              fontWeight: 600,
              fontSize: 13.5,
              color: "#0A0A0B",
              textTransform: "uppercase",
            }}
          >
            <Send size={15} /> Enviar pelo WhatsApp
          </button>
          <button
            onClick={compartilharBtu}
            style={{
              width: "100%",
              marginTop: 10,
              background: "#1C1C1F",
              border: "1px solid #2A2A2E",
              borderRadius: 12,
              padding: "12px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              fontFamily: "'Roboto',sans-serif",
              fontWeight: 600,
              fontSize: 13,
              color: "#C7C9CE",
              textTransform: "uppercase",
            }}
          >
            <Send size={15} /> Compartilhar resultado
          </button>
          <button
            onClick={novoCalculo}
            style={{
              width: "100%",
              marginTop: 10,
              background: "transparent",
              border: "1px solid #2A2A2E",
              borderRadius: 12,
              padding: "11px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              cursor: "pointer",
              fontFamily: "'Roboto',sans-serif",
              fontWeight: 600,
              fontSize: 13,
              color: "#C7C9CE",
              textTransform: "uppercase",
            }}
          >
            <RefreshCw size={14} /> Novo Cálculo
          </button>
        </div>
      )}
    </div>
  );
}


/* ---------------- Ferramenta: Conversor / Central de Calculadoras Técnicas ---------------- */
const UNIT_CATEGORIES = {
  Potência: { icon: Zap, base: "W", units: { W: 1, kW: 1000, HP: 745.7, CV: 735.5 } },
  Temperatura: { icon: Ruler, special: "temperatura" },
  Pressão: { icon: Ruler, base: "psi", units: { PSI: 1, bar: 14.5038, kPa: 0.145038, "kgf/cm²": 14.2233 } },
  Comprimento: { icon: Ruler, base: "m", units: { mm: 0.001, cm: 0.01, m: 1, polegada: 0.0254, pé: 0.3048 } },
  Área: { icon: Ruler, base: "m²", units: { "m²": 1, "cm²": 0.0001 } },
  Volume: { icon: Ruler, base: "L", units: { "m³": 1000, litros: 1 } },
  Vazão: { icon: Ruler, base: "L/min", units: { "m³/h": 16.6667, "L/min": 1 } },
};

function convertGeneric(category, value, from, to) {
  const v = parseFloat(String(value).replace(",", "."));
  if (isNaN(v)) return null;
  const { units } = UNIT_CATEGORIES[category];
  const base = v * units[from];
  return base / units[to];
}

function GenericConverter({ category }) {
  const cfg = UNIT_CATEGORIES[category];
  const unitKeys = Object.keys(cfg.units);
  const [value, setValue] = useState("");
  const [from, setFrom] = useState(unitKeys[0]);
  const [to, setTo] = useState(unitKeys[1] || unitKeys[0]);

  const result = convertGeneric(category, value, from, to);

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <Field label="Valor">
        <input style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="Digite o valor" />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="De">
            <select style={{ ...inputStyle, appearance: "none" }} value={from} onChange={(e) => setFrom(e.target.value)}>
              {unitKeys.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Para">
            <select style={{ ...inputStyle, appearance: "none" }} value={to} onChange={(e) => setTo(e.target.value)}>
              {unitKeys.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div
        style={{
          background: value.trim() && result !== null ? "linear-gradient(135deg,#151517,#1C1C1F)" : "#141416",
          border: `1px solid ${value.trim() && result !== null ? "rgba(201,162,75,0.35)" : "#2A2A2E"}`,
          borderRadius: 14,
          padding: 18,
          marginTop: 16,
          textAlign: "center",
        }}
      >
        {value.trim() === "" ? (
          <div style={{ color: "#6E6E73", fontSize: 12.5 }}>Digite um valor para converter.</div>
        ) : result === null ? (
          <div style={{ color: "#F0605A", fontSize: 12.5 }}>Valor inválido.</div>
        ) : (
          <>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#8A8A90", letterSpacing: 1, textTransform: "uppercase" }}>
              Resultado
            </div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 30, color: "#E9C878", marginTop: 6 }}>
              {result.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {to}
            </div>
          </>
        )}
      </div>

      <button
        onClick={() => setValue("")}
        style={{
          width: "100%",
          marginTop: 14,
          background: "transparent",
          border: "1px solid #2A2A2E",
          borderRadius: 12,
          padding: "11px 0",
          color: "#C7C9CE",
          fontFamily: "'Roboto',sans-serif",
          fontWeight: 600,
          fontSize: 13,
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Limpar
      </button>
    </div>
  );
}

function TemperaturaConverter() {
  const [value, setValue] = useState("");
  const [from, setFrom] = useState("Celsius");

  const v = parseFloat(String(value).replace(",", "."));
  const valid = !isNaN(v);

  let celsius = null;
  if (valid) {
    if (from === "Celsius") celsius = v;
    else if (from === "Fahrenheit") celsius = ((v - 32) * 5) / 9;
    else celsius = v - 273.15;
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <Field label="Valor">
        <input style={inputStyle} value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="Digite o valor" />
      </Field>
      <Field label="Unidade de origem">
        <select style={{ ...inputStyle, appearance: "none" }} value={from} onChange={(e) => setFrom(e.target.value)}>
          <option>Celsius</option>
          <option>Fahrenheit</option>
          <option>Kelvin</option>
        </select>
      </Field>

      <div
        style={{
          background: valid ? "linear-gradient(135deg,#151517,#1C1C1F)" : "#141416",
          border: `1px solid ${valid ? "rgba(201,162,75,0.35)" : "#2A2A2E"}`,
          borderRadius: 14,
          padding: 18,
          marginTop: 16,
        }}
      >
        {!valid ? (
          <div style={{ color: "#6E6E73", fontSize: 12.5, textAlign: "center" }}>Digite um valor para converter.</div>
        ) : (
          [
            ["Celsius", celsius, "°C"],
            ["Fahrenheit", (celsius * 9) / 5 + 32, "°F"],
            ["Kelvin", celsius + 273.15, "K"],
          ].map(([label, val, unit]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "#8A8A90", fontSize: 13 }}>{label}</span>
              <span style={{ color: "#E9C878", fontSize: 15, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }}>
                {val.toFixed(1)} {unit}
              </span>
            </div>
          ))
        )}
      </div>

      <button
        onClick={() => setValue("")}
        style={{ width: "100%", marginTop: 14, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "11px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, textTransform: "uppercase", cursor: "pointer" }}
      >
        Limpar
      </button>
    </div>
  );
}

function CorrenteCalculator() {
  const [potencia, setPotencia] = useState("");
  const [tensao, setTensao] = useState("");
  const [corrente, setCorrente] = useState("");

  const p = parseFloat(String(potencia).replace(",", "."));
  const v = parseFloat(String(tensao).replace(",", "."));
  const i = parseFloat(String(corrente).replace(",", "."));

  let calculado = null;
  if (!isNaN(p) && !isNaN(v) && isNaN(i)) calculado = { campo: "Corrente", valor: p / v, unidade: "A" };
  else if (!isNaN(p) && !isNaN(i) && isNaN(v)) calculado = { campo: "Tensão", valor: p / i, unidade: "V" };
  else if (!isNaN(v) && !isNaN(i) && isNaN(p)) calculado = { campo: "Potência", valor: v * i, unidade: "W" };

  const limpar = () => {
    setPotencia("");
    setTensao("");
    setCorrente("");
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontSize: 12, color: "#8A8A90", marginBottom: 14 }}>
        Preencha quaisquer dois campos — o terceiro é calculado automaticamente (P = V × I).
      </div>
      <Field label="Potência (W)">
        <input style={inputStyle} value={potencia} onChange={(e) => setPotencia(e.target.value)} inputMode="decimal" />
      </Field>
      <Field label="Tensão (V)">
        <input style={inputStyle} value={tensao} onChange={(e) => setTensao(e.target.value)} inputMode="decimal" />
      </Field>
      <Field label="Corrente (A)">
        <input style={inputStyle} value={corrente} onChange={(e) => setCorrente(e.target.value)} inputMode="decimal" />
      </Field>

      <div
        style={{
          background: calculado ? "linear-gradient(135deg,#151517,#1C1C1F)" : "#141416",
          border: `1px solid ${calculado ? "rgba(201,162,75,0.35)" : "#2A2A2E"}`,
          borderRadius: 14,
          padding: 18,
          marginTop: 16,
          textAlign: "center",
        }}
      >
        {!calculado ? (
          <div style={{ color: "#6E6E73", fontSize: 12.5 }}>Preencha dois campos para calcular o terceiro.</div>
        ) : (
          <>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#8A8A90", letterSpacing: 1, textTransform: "uppercase" }}>
              {calculado.campo} calculada
            </div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 30, color: "#E9C878", marginTop: 6 }}>
              {calculado.valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {calculado.unidade}
            </div>
          </>
        )}
      </div>

      <button
        onClick={limpar}
        style={{ width: "100%", marginTop: 14, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "11px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, textTransform: "uppercase", cursor: "pointer" }}
      >
        Limpar
      </button>
    </div>
  );
}

const CALC_CARDS = [
  { key: "btu", label: "BTU", desc: "Dimensionamento por ambiente", icon: Calculator },
  { key: "potencia", label: "Potência", desc: "W · kW · HP · CV", icon: Zap },
  { key: "corrente", label: "Corrente", desc: "Potência, tensão e corrente", icon: Zap },
  { key: "temperatura", label: "Temperatura", desc: "Celsius · Fahrenheit · Kelvin", icon: Ruler },
  { key: "pressao", label: "Pressão", desc: "PSI · bar · kPa · kgf/cm²", icon: Ruler },
  { key: "comprimento", label: "Comprimento", desc: "mm · cm · m · pol · pé", icon: Ruler },
  { key: "area", label: "Área", desc: "m² · cm²", icon: Ruler },
  { key: "volume", label: "Volume", desc: "m³ · litros", icon: Ruler },
  { key: "vazao", label: "Vazão", desc: "m³/h · L/min", icon: Ruler },
];

function TechConverter({ onNavigate }) {
  const [active, setActive] = useState(null);

  if (active === "btu") {
    onNavigate && onNavigate("tool-btu");
    return null;
  }

  if (active) {
    const card = CALC_CARDS.find((c) => c.key === active);
    return (
      <div>
        <div style={{ padding: "16px 16px 0" }}>
          <button
            onClick={() => setActive(null)}
            style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
          >
            <ChevronLeft size={15} /> {card.label}
          </button>
        </div>
        {active === "temperatura" && <TemperaturaConverter />}
        {active === "corrente" && <CorrenteCalculator />}
        {active === "potencia" && <GenericConverter category="Potência" />}
        {active === "pressao" && <GenericConverter category="Pressão" />}
        {active === "comprimento" && <GenericConverter category="Comprimento" />}
        {active === "area" && <GenericConverter category="Área" />}
        {active === "volume" && <GenericConverter category="Volume" />}
        {active === "vazao" && <GenericConverter category="Vazão" />}
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontSize: 12.5, color: "#8A8A90", marginBottom: 16 }}>
        Escolha uma calculadora para uso rápido em campo.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {CALC_CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => setActive(c.key)}
              style={{
                background: "#111110",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 18,
                padding: "16px 14px",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: "rgba(201,162,75,0.12)",
                  border: "1px solid rgba(201,162,75,0.35)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={18} color="#E9C878" strokeWidth={1.7} />
              </div>
              <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14, fontWeight: 500, color: "#F3F3F1" }}>{c.label}</div>
              <div style={{ fontSize: 11, color: "#7A7A7A" }}>{c.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Novo Relatorio ---------------- */
/* ---------------- Ferramenta: Assistente de Peças IA ---------------- */
/* Base de conhecimento local (regras determinísticas por sintoma) — não inventa código
   de peça: quando não há como confirmar, isso fica explícito no resultado. */
const PARTS_KB = [
  {
    match: ["não gela", "nao gela", "não resfria", "gelando pouco", "pouco gelado"],
    nome: "Capacitor do compressor / placa eletrônica",
    funcao: "Fornece a partida e regula o funcionamento do compressor ou controla os ciclos do sistema",
    sintomas: "Ar liga mas não gela, compressor não parte ou desarma sozinho",
    causas: "Capacitor estufado/queimado, placa com componente em curto, baixa carga de gás",
    testes: "Medir capacitância do capacitor, verificar pressão do gás, testar placa em bancada",
  },
  {
    match: ["vazamento", "vazando água", "vazando agua", "pingando", "gotejando"],
    nome: "Bomba de dreno / mangueira de dreno",
    funcao: "Escoa a água condensada da evaporadora para fora do ambiente",
    sintomas: "Água pingando pela unidade interna ou externa",
    causas: "Dreno entupido, mangueira desconectada ou com inclinação incorreta, bandeja trincada",
    testes: "Verificar obstrução do dreno com ar comprimido, checar nível/inclinação da tubulação",
  },
  {
    match: ["barulho", "ruído", "ruido", "vibração", "vibracao", "batendo"],
    nome: "Motor ventilador / suporte de fixação",
    funcao: "Move o ar através da serpentina (interna) ou dissipa calor no condensador (externa)",
    sintomas: "Ruído anormal, vibração excessiva, batida intermitente",
    causas: "Rolamento do motor desgastado, hélice desbalanceada, suporte solto",
    testes: "Girar a hélice manualmente sentindo atrito, checar fixação dos parafusos do gabinete",
  },
  {
    match: ["não liga", "nao liga", "sem energia", "não dá partida", "nao da partida"],
    nome: "Placa eletrônica / fonte de alimentação",
    funcao: "Controla toda a lógica de funcionamento e distribui energia aos componentes",
    sintomas: "Equipamento totalmente sem resposta ao ligar",
    causas: "Fusível queimado, fonte interna danificada, problema na instalação elétrica",
    testes: "Medir tensão de entrada, testar fusível/fonte com multímetro, checar disjuntor dedicado",
  },
  {
    match: ["gás", "gas", "baixa pressão", "baixa pressao", "geada", "gelo na tubulação", "gelo na tubulacao"],
    nome: "Válvula/tubulação — possível vazamento de gás refrigerante",
    funcao: "Circuito de gás responsável pela troca térmica do sistema",
    sintomas: "Formação de gelo na tubulação, baixa capacidade de refrigeração, pressão fora do padrão",
    causas: "Vazamento em conexão flare, solda malfeita, corrosão na tubulação",
    testes: "Teste de estanqueidade com nitrogênio, detector de vazamento eletrônico, análise de pressão",
  },
  {
    match: ["cheiro", "mofo", "fungo", "mau cheiro"],
    nome: "Filtro de ar / bandeja de condensado",
    funcao: "Filtra o ar recirculado e retém partículas antes da troca térmica",
    sintomas: "Odor desagradável ao ligar o equipamento",
    causas: "Acúmulo de sujeira/mofo no filtro ou bandeja, higienização vencida",
    testes: "Inspeção visual do filtro e bandeja, verificar última higienização registrada",
  },
];

function buscarPeca(problema) {
  const q = (problema || "").toLowerCase();
  if (!q.trim()) return null;
  return PARTS_KB.find((item) => item.match.some((m) => q.includes(m))) || null;
}

function PartsAssistant() {
  const [form, setForm] = useState({
    marca: "",
    modelo: "",
    tipoEquipamento: "Split",
    btus: "",
    problema: "",
  });
  const [resultado, setResultado] = useState(null);
  const [buscou, setBuscou] = useState(false);
  const [manual, setManual] = useState({ nome: "", funcao: "" });
  const [savedMsg, setSavedMsg] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const consultar = async () => {
    setBuscou(true);
    const achado = buscarPeca(form.problema);
    setResultado(achado);
    try {
      await window.storage.set(`consultas-pecas:${uid()}`, JSON.stringify({
        ...form,
        encontrou: !!achado,
        pecaSugerida: achado ? achado.nome : null,
        createdAt: new Date().toISOString(),
      }));
    } catch {
      /* histórico é best-effort */
    }
  };

  const adicionarAoOrcamento = async (nomePeca) => {
    try {
      const item = { id: uid(), nome: nomePeca, qtd: 1, valorUnit: 0 };
      const existing = await window.storage.get("orcamento-rascunho-materiais").catch(() => null);
      const lista = existing ? JSON.parse(existing.value) : [];
      lista.push(item);
      await window.storage.set("orcamento-rascunho-materiais", JSON.stringify(lista));
      setSavedMsg(`"${nomePeca}" adicionada ao rascunho de orçamento — abra Orçamento Inteligente IA para revisar.`);
    } catch {
      setSavedMsg("Não foi possível adicionar agora — tente novamente.");
    }
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <Field label="Marca">
        <input style={inputStyle} value={form.marca} onChange={set("marca")} placeholder="Ex: Springer, LG, Samsung" />
      </Field>
      <Field label="Modelo">
        <input style={inputStyle} value={form.modelo} onChange={set("modelo")} placeholder="Ex: 12000 Inverter" />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Tipo de equipamento">
            <select style={{ ...inputStyle, appearance: "none" }} value={form.tipoEquipamento} onChange={set("tipoEquipamento")}>
              <option>Split</option>
              <option>Janela</option>
              <option>Cassete</option>
              <option>Piso Teto</option>
              <option>VRF</option>
              <option>Cervejeira</option>
              <option>Outro</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="BTUs">
            <input style={inputStyle} value={form.btus} onChange={set("btus")} placeholder="Ex: 12000" inputMode="numeric" />
          </Field>
        </div>
      </div>
      <Field label="Problema apresentado">
        <textarea
          style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "'Roboto',sans-serif" }}
          value={form.problema}
          onChange={set("problema")}
          placeholder="Descreva o que o cliente relatou ou o que foi observado..."
        />
      </Field>

      <button
        onClick={consultar}
        style={{
          width: "100%",
          background: "linear-gradient(135deg,#C9A24B,#E9C878)",
          border: "none",
          borderRadius: 12,
          padding: "13px 0",
          fontFamily: "'Roboto',sans-serif",
          fontWeight: 600,
          fontSize: 13.5,
          color: "#0A0A0B",
          textTransform: "uppercase",
          cursor: "pointer",
          marginTop: 4,
        }}
      >
        Consultar peça possível
      </button>

      {buscou && (
        <div style={{ marginTop: 18 }}>
          {resultado ? (
            <div
              style={{
                background: "linear-gradient(135deg,#151517,#1C1C1F)",
                border: "1px solid rgba(201,162,75,0.35)",
                borderRadius: 16,
                padding: 18,
              }}
            >
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 10.5,
                  color: "#C9A24B",
                  letterSpacing: 1.5,
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                Peça possível
              </div>
              <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 18, fontWeight: 600, color: "#F3F3F1", marginBottom: 10 }}>
                {resultado.nome}
              </div>
              {[
                ["Função", resultado.funcao],
                ["Sintomas relacionados", resultado.sintomas],
                ["Possíveis causas", resultado.causas],
                ["Recomendações de teste", resultado.testes],
              ].map(([label, val]) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#8A8A90", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
                    {label}
                  </div>
                  <div style={{ color: "#C7C9CE", fontSize: 13, lineHeight: 1.4 }}>{val}</div>
                </div>
              ))}
              <div
                style={{
                  background: "rgba(240,96,90,0.08)",
                  border: "1px solid rgba(240,96,90,0.3)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 11.5,
                  color: "#E8A5A2",
                  marginTop: 4,
                  marginBottom: 14,
                }}
              >
                Código de peça não informado — confirme sempre pelo modelo exato ou manual do fabricante antes de comprar.
              </div>
              <button
                onClick={() => adicionarAoOrcamento(resultado.nome)}
                style={{
                  width: "100%",
                  background: "#1C1C1F",
                  border: "1px solid #C9A24B",
                  borderRadius: 12,
                  padding: "12px 0",
                  color: "#E9C878",
                  fontFamily: "'Roboto',sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Adicionar ao orçamento
              </button>
            </div>
          ) : (
            <div
              style={{
                background: "#141416",
                border: "1px solid #2A2A2E",
                borderRadius: 14,
                padding: 16,
              }}
            >
              <div style={{ color: "#C7C9CE", fontSize: 13, marginBottom: 12 }}>
                Não encontrei uma correspondência na base para essa descrição. Adicione a peça manualmente:
              </div>
              <Field label="Nome da peça">
                <input style={inputStyle} value={manual.nome} onChange={(e) => setManual((m) => ({ ...m, nome: e.target.value }))} />
              </Field>
              <Field label="Função (opcional)">
                <input style={inputStyle} value={manual.funcao} onChange={(e) => setManual((m) => ({ ...m, funcao: e.target.value }))} />
              </Field>
              <button
                onClick={() => manual.nome.trim() && adicionarAoOrcamento(manual.nome.trim())}
                disabled={!manual.nome.trim()}
                style={{
                  width: "100%",
                  background: manual.nome.trim() ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px 0",
                  color: manual.nome.trim() ? "#0A0A0B" : "#6E6E73",
                  fontFamily: "'Roboto',sans-serif",
                  fontWeight: 600,
                  fontSize: 13,
                  textTransform: "uppercase",
                  cursor: manual.nome.trim() ? "pointer" : "default",
                }}
              >
                Adicionar ao orçamento
              </button>
            </div>
          )}
        </div>
      )}

      {savedMsg && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#4ADE80", textAlign: "center" }}>{savedMsg}</div>
      )}
    </div>
  );
}

/* ---------------- Ferramenta: Orçamento Inteligente IA ---------------- */
/* ============================================================
   MÓDULO ORÇAMENTOS — completo (cliente, equipamento, itens,
   mão de obra, deslocamento, desconto/acréscimo, pagamento,
   validade, garantia, escopo, status, histórico, PDF, WhatsApp,
   duplicar, nova versão, converter em OS).
   ============================================================ */

const ORC_STATUS = ["RASCUNHO", "ENVIADO", "VISUALIZADO", "EM NEGOCIAÇÃO", "APROVADO", "RECUSADO", "EXPIRADO", "CONVERTIDO EM OS"];
const ORC_STATUS_COLOR = {
  RASCUNHO: "#8A8A90",
  ENVIADO: "#4681DF",
  VISUALIZADO: "#9B8AFB",
  "EM NEGOCIAÇÃO": "#E9C878",
  APROVADO: "#4ADE80",
  RECUSADO: "#F0605A",
  EXPIRADO: "#6E6E73",
  "CONVERTIDO EM OS": "#3FBCD1",
};
const ORC_EQUIP_TIPOS = ["Split", "Multi Split", "Cassete", "Piso-Teto", "VRF", "Janela", "Cervejeira", "Freezer", "Bebedouro", "Refrigerador", "Outro"];
const ORC_SERVICOS_RAPIDOS = ["Instalação", "Manutenção", "Higienização", "Infraestrutura", "Recarga de Fluido", "Correção de Vazamento", "Troca de Componente", "Reforma de Cervejeira", "Manutenção de Freezer", "Manutenção de Bebedouro", "Elétrica", "PMOC", "Outros"];
const ORC_ITEM_CATEGORIAS = ["Material", "Peça", "Mão de obra", "Deslocamento", "Serviço", "Outros"];
const ORC_FORMAS_PAGAMENTO = ["PIX", "Dinheiro", "Cartão", "Cartão Parcelado", "Boleto", "Transferência", "Outro"];
const ORC_CONDICOES_PAGAMENTO = ["À vista", "Entrada + restante", "Parcelado"];
const ORC_VALIDADE_OPCOES = [3, 5, 7, 10, 15, 30];
const ORC_MAO_DE_OBRA_TIPOS = ["Instalação", "Manutenção", "Higienização", "Infraestrutura", "Diagnóstico", "Reparo", "Outro"];

function orcCalcularTotais(o) {
  const materiaisTotal = (o.itens || []).reduce((acc, it) => acc + (Number(it.qtd) || 0) * (Number(it.valorUnit) || 0), 0);
  const maoDeObraValor = Number(o.maoDeObra && o.maoDeObra.valor) || 0;
  const deslocamentoValor = Number(o.deslocamento && o.deslocamento.valor) || 0;
  const subtotal = materiaisTotal + maoDeObraValor + deslocamentoValor;

  const desc = o.desconto || { tipo: "R$", valor: 0 };
  const descontoValor = desc.tipo === "%" ? subtotal * ((Number(desc.valor) || 0) / 100) : Number(desc.valor) || 0;

  const acr = o.acrescimo || { tipo: "R$", valor: 0 };
  const acrescimoValor = acr.tipo === "%" ? subtotal * ((Number(acr.valor) || 0) / 100) : Number(acr.valor) || 0;

  const total = Math.max(0, subtotal - descontoValor + acrescimoValor);
  return { materiaisTotal, subtotal, descontoValor, acrescimoValor, total };
}

function orcStatusEfetivo(o) {
  // um orçamento enviado/visualizado/em negociação vence automaticamente pela validade
  if (["APROVADO", "RECUSADO", "CONVERTIDO EM OS", "RASCUNHO"].includes(o.status)) return o.status;
  const dataExp = o.validade && o.validade.dataExpiracao;
  if (dataExp && new Date(dataExp) < new Date()) return "EXPIRADO";
  return o.status;
}

function orcAdicionarHistorico(o, acao, detalhe) {
  const historico = [...(o.historico || []), { data: new Date().toISOString(), acao, detalhe: detalhe || "" }];
  return { ...o, historico };
}

function orcNormalizar(o) {
  const jaNovo = o.equipamento && Array.isArray(o.itens) && typeof o.status === "string" && ORC_STATUS.includes(o.status);
  if (jaNovo) return o;

  const statusBruto = (o.status || "").toString().toUpperCase();
  const statusValido = ORC_STATUS.includes(statusBruto) ? statusBruto : "RASCUNHO";

  const itensLegado =
    Array.isArray(o.itens) && o.itens.length && "categoria" in (o.itens[0] || {})
      ? o.itens
      : (o.materiais || []).map((m) => ({
          id: m.id || uid(),
          descricao: m.nome || "",
          categoria: "Material",
          qtd: m.qtd || 1,
          unidade: "un",
          valorUnit: m.valorUnit || 0,
        }));

  return {
    ...o,
    equipamento:
      o.equipamento || {
        tipo: o.equipTipo || "",
        marca: o.equipMarca || "",
        modelo: o.equipModelo || "",
        btus: o.equipBtus || "",
      },
    servico:
      o.servico && typeof o.servico === "object"
        ? o.servico
        : { tipo: o.servico || "Outro", descricaoPersonalizada: o.descricao || "" },
    itens: itensLegado,
    maoDeObra: o.maoDeObra && typeof o.maoDeObra === "object" ? o.maoDeObra : { tipo: "Instalação", valor: o.maoDeObra || 0 },
    deslocamento:
      o.deslocamento && typeof o.deslocamento === "object"
        ? o.deslocamento
        : { modo: Number(o.deslocamento) > 0 ? "Valor fixo" : "Sem cobrança", valor: o.deslocamento || 0 },
    desconto: o.desconto && typeof o.desconto === "object" ? o.desconto : { tipo: "R$", valor: o.desconto || 0 },
    acrescimo: o.acrescimo && typeof o.acrescimo === "object" ? o.acrescimo : { tipo: "R$", valor: 0, motivo: "" },
    pagamento: o.pagamento || { forma: "PIX", condicao: "À vista", detalhes: "" },
    validade: o.validade || { dias: 7, dataExpiracao: null },
    status: statusValido,
    historico: o.historico || [],
    versao: o.versao || 1,
    valorFinal: o.valorFinal ?? o.total ?? 0,
    subtotal: o.subtotal ?? 0,
    materiaisTotal: o.materiaisTotal ?? 0,
    descontoValor: o.descontoValor ?? (typeof o.desconto === "number" ? o.desconto : 0),
    acrescimoValor: o.acrescimoValor ?? 0,
  };
}

function OrcItensEditor({ itens, setItens }) {
  const addItem = () =>
    setItens((its) => [...its, { id: uid(), descricao: "", categoria: "Material", qtd: 1, unidade: "un", valorUnit: 0 }]);
  const updateItem = (id, field, val) => setItens((its) => its.map((it) => (it.id === id ? { ...it, [field]: val } : it)));
  const removeItem = (id) => setItens((its) => its.filter((it) => it.id !== id));

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 10px" }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase" }}>
          Itens do orçamento
        </div>
        <button
          onClick={addItem}
          style={{ background: "none", border: "1px solid #2A2A2E", borderRadius: 8, color: "#E9C878", fontSize: 11.5, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
        >
          <Plus size={12} /> Item
        </button>
      </div>
      {itens.length === 0 && (
        <div style={{ fontSize: 12, color: "#6E6E73", marginBottom: 10 }}>Nenhum item adicionado ainda.</div>
      )}
      {itens.map((it) => (
        <div key={it.id} style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: 10, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              style={{ ...inputStyle, flex: 2 }}
              placeholder="Descrição (ex: Cobre 1/4)"
              value={it.descricao}
              onChange={(e) => updateItem(it.id, "descricao", e.target.value)}
            />
            <button onClick={() => removeItem(it.id)} style={{ background: "none", border: "none", color: "#F0605A", cursor: "pointer", padding: 4 }}>
              <Trash2 size={16} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <select
              style={{ ...inputStyle, flex: 1.4, appearance: "none", fontSize: 12.5 }}
              value={it.categoria}
              onChange={(e) => updateItem(it.id, "categoria", e.target.value)}
            >
              {ORC_ITEM_CATEGORIAS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input
              style={{ ...inputStyle, flex: 0.7 }}
              placeholder="Qtd"
              value={it.qtd}
              onChange={(e) => updateItem(it.id, "qtd", e.target.value)}
              inputMode="decimal"
            />
            <input
              style={{ ...inputStyle, flex: 0.8 }}
              placeholder="Un."
              value={it.unidade}
              onChange={(e) => updateItem(it.id, "unidade", e.target.value)}
            />
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Valor unitário"
              value={it.valorUnit}
              onChange={(e) => updateItem(it.id, "valorUnit", e.target.value)}
              inputMode="decimal"
            />
            <div style={{ flex: 1, textAlign: "right", fontSize: 13, color: "#E9C878", fontWeight: 600 }}>
              R$ {((Number(it.qtd) || 0) * (Number(it.valorUnit) || 0)).toFixed(2)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OrcamentoForm({ editing, onDone, onCancel }) {
  const isVersaoNova = editing && editing._novaVersaoDe;
  const [clientesExistentes, setClientesExistentes] = useState(null);
  const [nome, setNome] = useState(editing?.nome || "");
  const [documento, setDocumento] = useState(editing?.documento || "");
  const [telefone, setTelefone] = useState(editing?.telefone || "");
  const [whatsapp, setWhatsapp] = useState(editing?.whatsapp || "");
  const [email, setEmail] = useState(editing?.email || "");
  const [endereco, setEndereco] = useState(editing?.endereco || "");

  const [equipTipo, setEquipTipo] = useState(editing?.equipamento?.tipo || "Split");
  const [equipMarca, setEquipMarca] = useState(editing?.equipamento?.marca || "");
  const [equipModelo, setEquipModelo] = useState(editing?.equipamento?.modelo || "");
  const [equipCapacidade, setEquipCapacidade] = useState(editing?.equipamento?.capacidade || "");
  const [equipBtus, setEquipBtus] = useState(editing?.equipamento?.btus || "");
  const [equipGas, setEquipGas] = useState(editing?.equipamento?.gas || "");
  const [equipSerie, setEquipSerie] = useState(editing?.equipamento?.numeroSerie || "");
  const [equipLocal, setEquipLocal] = useState(editing?.equipamento?.local || "");
  const [equipObs, setEquipObs] = useState(editing?.equipamento?.observacoes || "");

  const [servicoTipo, setServicoTipo] = useState(editing?.servico?.tipo || "Instalação");
  const [servicoDescricao, setServicoDescricao] = useState(editing?.servico?.descricaoPersonalizada || "");

  const [itens, setItens] = useState(editing?.itens || []);

  const [maoDeObraTipo, setMaoDeObraTipo] = useState(editing?.maoDeObra?.tipo || "Instalação");
  const [maoDeObraValor, setMaoDeObraValor] = useState(editing?.maoDeObra?.valor ?? "0");

  const [deslocModo, setDeslocModo] = useState(editing?.deslocamento?.modo || "Sem cobrança");
  const [deslocValor, setDeslocValor] = useState(editing?.deslocamento?.valor ?? "0");
  const [deslocKm, setDeslocKm] = useState(editing?.deslocamento?.km || "");

  const [descontoTipo, setDescontoTipo] = useState(editing?.desconto?.tipo || "R$");
  const [descontoValor, setDescontoValor] = useState(editing?.desconto?.valor ?? "0");

  const [acrescimoTipo, setAcrescimoTipo] = useState(editing?.acrescimo?.tipo || "R$");
  const [acrescimoValor, setAcrescimoValor] = useState(editing?.acrescimo?.valor ?? "0");
  const [acrescimoMotivo, setAcrescimoMotivo] = useState(editing?.acrescimo?.motivo || "");

  const [pagamentoForma, setPagamentoForma] = useState(editing?.pagamento?.forma || "PIX");
  const [pagamentoCondicao, setPagamentoCondicao] = useState(editing?.pagamento?.condicao || "À vista");
  const [pagamentoDetalhes, setPagamentoDetalhes] = useState(editing?.pagamento?.detalhes || "");

  const [validadeDias, setValidadeDias] = useState(editing?.validade?.dias || 7);

  const [obsCliente, setObsCliente] = useState(editing?.observacoesCliente || "");
  const [obsInternas, setObsInternas] = useState(editing?.observacoesInternas || "");

  const [garantiaServico, setGarantiaServico] = useState(editing?.garantia?.servico || "90 dias sobre mão de obra");
  const [garantiaPecas, setGarantiaPecas] = useState(editing?.garantia?.pecas || "conforme fabricante");
  const [garantiaObs, setGarantiaObs] = useState(editing?.garantia?.observacoes || "");

  const [escopoServico, setEscopoServico] = useState(editing?.escopoServico || "");
  const [naoIncluso, setNaoIncluso] = useState(editing?.naoIncluso || "");

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    buscarClientesReais().then(setClientesExistentes);
  }, []);

  const selecionarClienteExistente = (nomeSelecionado) => {
    const c = (clientesExistentes || []).find((x) => x.nome === nomeSelecionado);
    if (c) {
      setNome(c.nome);
      setTelefone(c.telefone || "");
    }
  };

  const dadosParaCalculo = {
    itens,
    maoDeObra: { valor: maoDeObraValor },
    deslocamento: { valor: deslocModo === "Sem cobrança" ? 0 : deslocValor },
    desconto: { tipo: descontoTipo, valor: descontoValor },
    acrescimo: { tipo: acrescimoTipo, valor: acrescimoValor },
  };
  const totais = orcCalcularTotais(dadosParaCalculo);

  const montarObjeto = async (statusOverride) => {
    const id = editing && !isVersaoNova ? editing.id : uid();
    const numero = editing && !isVersaoNova ? editing.numero : await proximoNumero("ORC", "orcamentos:");
    const dataExpiracao = new Date(Date.now() + Number(validadeDias) * 86400000).toISOString();

    let base = {
      id,
      numero,
      versao: isVersaoNova ? (editing.versao || 1) + 1 : editing?.versao || 1,
      origemOrcamentoId: isVersaoNova ? editing.id : editing?.origemOrcamentoId || null,
      nome,
      documento,
      telefone,
      whatsapp,
      email,
      endereco,
      equipamento: { tipo: equipTipo, marca: equipMarca, modelo: equipModelo, capacidade: equipCapacidade, btus: equipBtus, gas: equipGas, numeroSerie: equipSerie, local: equipLocal, observacoes: equipObs },
      servico: { tipo: servicoTipo, descricaoPersonalizada: servicoDescricao },
      itens,
      maoDeObra: { tipo: maoDeObraTipo, valor: maoDeObraValor },
      deslocamento: { modo: deslocModo, valor: deslocModo === "Sem cobrança" ? 0 : deslocValor, km: deslocKm },
      desconto: { tipo: descontoTipo, valor: descontoValor },
      acrescimo: { tipo: acrescimoTipo, valor: acrescimoValor, motivo: acrescimoMotivo },
      pagamento: { forma: pagamentoForma, condicao: pagamentoCondicao, detalhes: pagamentoDetalhes },
      validade: { dias: validadeDias, dataExpiracao },
      observacoesCliente: obsCliente,
      observacoesInternas: obsInternas,
      garantia: { servico: garantiaServico, pecas: garantiaPecas, observacoes: garantiaObs },
      escopoServico,
      naoIncluso,
      status: statusOverride || editing?.status || "RASCUNHO",
      historico: isVersaoNova ? [] : editing?.historico || [],
      osVinculadaId: isVersaoNova ? null : editing?.osVinculadaId || null,
      osVinculadaNumero: isVersaoNova ? null : editing?.osVinculadaNumero || null,
      createdAt: editing && !isVersaoNova ? editing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      servicoLabel: servicoDescricao ? `${servicoTipo} — ${servicoDescricao.slice(0, 40)}` : servicoTipo,
      ...totais,
      valorFinal: totais.total,
    };

    base = orcAdicionarHistorico(base, isVersaoNova ? "Nova versão criada" : editing ? "Editado" : "Criado");
    return base;
  };

  const salvar = async (statusOverride) => {
    setSaving(true);
    try {
      const obj = await montarObjeto(statusOverride);
      await window.storage.set(`orcamentos:${obj.id}`, JSON.stringify(obj));
      onDone(obj);
    } catch (err) {
      console.error("Erro ao salvar orçamento", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        Cliente
      </div>
      {clientesExistentes && clientesExistentes.length > 0 && (
        <Field label="Cliente existente (opcional)">
          <select style={{ ...inputStyle, appearance: "none" }} defaultValue="" onChange={(e) => e.target.value && selecionarClienteExistente(e.target.value)}>
            <option value="">Selecionar cliente cadastrado...</option>
            {clientesExistentes.map((c) => (
              <option key={c.nome} value={c.nome}>{c.nome}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Nome"><input style={inputStyle} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="CPF/CNPJ"><input style={inputStyle} value={documento} onChange={(e) => setDocumento(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Telefone"><input style={inputStyle} value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="numeric" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="WhatsApp"><input style={inputStyle} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="15999999999" inputMode="numeric" /></Field></div>
        <div style={{ flex: 1 }}><Field label="E-mail"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} /></Field></div>
      </div>
      <Field label="Endereço"><input style={inputStyle} value={endereco} onChange={(e) => setEndereco(e.target.value)} /></Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Equipamento
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Tipo">
            <select style={{ ...inputStyle, appearance: "none" }} value={equipTipo} onChange={(e) => setEquipTipo(e.target.value)}>
              {ORC_EQUIP_TIPOS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="BTUs"><input style={inputStyle} value={equipBtus} onChange={(e) => setEquipBtus(e.target.value)} inputMode="numeric" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Marca"><input style={inputStyle} value={equipMarca} onChange={(e) => setEquipMarca(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Modelo"><input style={inputStyle} value={equipModelo} onChange={(e) => setEquipModelo(e.target.value)} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Capacidade"><input style={inputStyle} value={equipCapacidade} onChange={(e) => setEquipCapacidade(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Gás refrigerante"><input style={inputStyle} value={equipGas} onChange={(e) => setEquipGas(e.target.value)} placeholder="Ex: R410A" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Número de série"><input style={inputStyle} value={equipSerie} onChange={(e) => setEquipSerie(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Local de instalação"><input style={inputStyle} value={equipLocal} onChange={(e) => setEquipLocal(e.target.value)} /></Field></div>
      </div>
      <Field label="Observações do equipamento">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={equipObs} onChange={(e) => setEquipObs(e.target.value)} />
      </Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Serviço
      </div>
      <Field label="Tipo de serviço">
        <select style={{ ...inputStyle, appearance: "none" }} value={servicoTipo} onChange={(e) => setServicoTipo(e.target.value)}>
          {ORC_SERVICOS_RAPIDOS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Descrição personalizada (opcional)">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={servicoDescricao} onChange={(e) => setServicoDescricao(e.target.value)} />
      </Field>

      <OrcItensEditor itens={itens} setItens={setItens} />

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Mão de obra
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Tipo">
            <select style={{ ...inputStyle, appearance: "none" }} value={maoDeObraTipo} onChange={(e) => setMaoDeObraTipo(e.target.value)}>
              {ORC_MAO_DE_OBRA_TIPOS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="Valor (R$)"><input style={inputStyle} value={maoDeObraValor} onChange={(e) => setMaoDeObraValor(e.target.value)} inputMode="decimal" /></Field></div>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Deslocamento
      </div>
      <Field label="Modo">
        <select style={{ ...inputStyle, appearance: "none" }} value={deslocModo} onChange={(e) => setDeslocModo(e.target.value)}>
          <option>Sem cobrança</option>
          <option>Valor fixo</option>
          <option>Valor por KM</option>
        </select>
      </Field>
      {deslocModo !== "Sem cobrança" && (
        <div style={{ display: "flex", gap: 10 }}>
          {deslocModo === "Valor por KM" && (
            <div style={{ flex: 1 }}><Field label="Distância (km)"><input style={inputStyle} value={deslocKm} onChange={(e) => setDeslocKm(e.target.value)} inputMode="decimal" /></Field></div>
          )}
          <div style={{ flex: 1 }}><Field label="Valor (R$)"><input style={inputStyle} value={deslocValor} onChange={(e) => setDeslocValor(e.target.value)} inputMode="decimal" /></Field></div>
        </div>
      )}

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Desconto e acréscimo
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 0.7 }}>
          <Field label="Desconto em">
            <select style={{ ...inputStyle, appearance: "none" }} value={descontoTipo} onChange={(e) => setDescontoTipo(e.target.value)}>
              <option>R$</option>
              <option>%</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="Valor do desconto"><input style={inputStyle} value={descontoValor} onChange={(e) => setDescontoValor(e.target.value)} inputMode="decimal" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 0.7 }}>
          <Field label="Acréscimo em">
            <select style={{ ...inputStyle, appearance: "none" }} value={acrescimoTipo} onChange={(e) => setAcrescimoTipo(e.target.value)}>
              <option>R$</option>
              <option>%</option>
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="Valor do acréscimo"><input style={inputStyle} value={acrescimoValor} onChange={(e) => setAcrescimoValor(e.target.value)} inputMode="decimal" /></Field></div>
      </div>
      <Field label="Motivo do acréscimo (opcional)">
        <input style={inputStyle} value={acrescimoMotivo} onChange={(e) => setAcrescimoMotivo(e.target.value)} placeholder="Ex: Urgência, horário especial..." />
      </Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Condições de pagamento
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Forma">
            <select style={{ ...inputStyle, appearance: "none" }} value={pagamentoForma} onChange={(e) => setPagamentoForma(e.target.value)}>
              {ORC_FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Condição">
            <select style={{ ...inputStyle, appearance: "none" }} value={pagamentoCondicao} onChange={(e) => setPagamentoCondicao(e.target.value)}>
              {ORC_CONDICOES_PAGAMENTO.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
        </div>
      </div>
      {pagamentoCondicao !== "À vista" && (
        <Field label="Detalhes (ex: 50% entrada, 50% na conclusão)">
          <input style={inputStyle} value={pagamentoDetalhes} onChange={(e) => setPagamentoDetalhes(e.target.value)} />
        </Field>
      )}

      <Field label="Validade do orçamento">
        <select style={{ ...inputStyle, appearance: "none" }} value={validadeDias} onChange={(e) => setValidadeDias(e.target.value)}>
          {ORC_VALIDADE_OPCOES.map((d) => <option key={d} value={d}>{d} dias</option>)}
        </select>
      </Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Escopo do serviço
      </div>
      <Field label="O que será executado">
        <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={escopoServico} onChange={(e) => setEscopoServico(e.target.value)} placeholder="Ex: Instalação da evaporadora; instalação da condensadora; linha frigorígena; teste de estanqueidade..." />
      </Field>
      <Field label="Não incluso">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={naoIncluso} onChange={(e) => setNaoIncluso(e.target.value)} placeholder="Ex: Obras civis, pintura, materiais adicionais não descritos..." />
      </Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Garantia
      </div>
      <Field label="Garantia do serviço"><input style={inputStyle} value={garantiaServico} onChange={(e) => setGarantiaServico(e.target.value)} /></Field>
      <Field label="Garantia das peças"><input style={inputStyle} value={garantiaPecas} onChange={(e) => setGarantiaPecas(e.target.value)} /></Field>
      <Field label="Observações sobre garantia">
        <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={garantiaObs} onChange={(e) => setGarantiaObs(e.target.value)} />
      </Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Observações
      </div>
      <Field label="Observações para o cliente (aparece no PDF)">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={obsCliente} onChange={(e) => setObsCliente(e.target.value)} />
      </Field>
      <Field label="Observações internas (NUNCA aparece no PDF do cliente)">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={obsInternas} onChange={(e) => setObsInternas(e.target.value)} />
      </Field>

      {/* resumo final */}
      <div style={{ background: "linear-gradient(135deg,#151517,#1C1C1F)", border: "1px solid rgba(201,162,75,0.35)", borderRadius: 16, padding: 18, margin: "18px 0" }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
          Resumo
        </div>
        {[
          ["Materiais", totais.materiaisTotal],
          ["Mão de obra", Number(maoDeObraValor) || 0],
          ["Deslocamento", deslocModo === "Sem cobrança" ? 0 : Number(deslocValor) || 0],
          ["Subtotal", totais.subtotal],
          ["Desconto", -totais.descontoValor],
          ["Acréscimo", totais.acrescimoValor],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "#8A8A90", fontSize: 12.5 }}>{label}</span>
            <span style={{ color: val < 0 ? "#F0605A" : "#F3F3F1", fontSize: 12.5 }}>
              {val < 0 ? "- " : ""}R$ {Math.abs(val).toFixed(2)}
            </span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#F3F3F1", fontSize: 14, fontWeight: 600 }}>Total</span>
          <span style={{ color: "#E9C878", fontSize: 18, fontWeight: 700 }}>R$ {totais.total.toFixed(2)}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, textTransform: "uppercase", cursor: "pointer" }}>
          Cancelar
        </button>
        <button
          onClick={() => salvar()}
          disabled={saving || !nome.trim()}
          style={{ flex: 1.4, background: nome.trim() ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "13px 0", color: nome.trim() ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, textTransform: "uppercase", cursor: "pointer" }}
        >
          {saving ? "Salvando..." : isVersaoNova ? "Salvar nova versão" : "Salvar orçamento"}
        </button>
      </div>
    </div>
  );
}

function pdfCabecalhoRodape(logoSrc) {
  const header = `
    <div class="pdf-header">
      <img src="${logoSrc}" class="pdf-logo" />
      <div class="pdf-header-text">
        <div class="pdf-brand">ALLA SERVICE</div>
        <div class="pdf-tagline">CLIMATIZAÇÃO • ELÉTRICA • MANUTENÇÃO</div>
      </div>
    </div>`;
  const footer = `
    <div class="pdf-footer">
      <div class="pdf-footer-brand">ALLA SERVICE</div>
      <div class="pdf-footer-line">Climatização • Elétrica • Manutenção</div>
      <div class="pdf-footer-line">(15) 99198-9866 · Sorocaba/SP e região</div>
      <div class="pdf-footer-motto">Soluções profissionais em climatização e manutenção.</div>
    </div>`;
  return { header, footer };
}

const PDF_ESTILO_PREMIUM = `
  /* impede que um card ou linha de tabela seja partido ao meio entre páginas */
  .pdf-card { break-inside: avoid; page-break-inside: avoid; }
  .pdf-table tr { break-inside: avoid; page-break-inside: avoid; }
  .pdf-table thead { display: table-header-group; }
  .pdf-sig { break-inside: avoid; page-break-inside: avoid; }
  /* duas assinaturas lado a lado (cliente e técnico) */
  .pdf-sig-row { display: flex; gap: 32px; margin-top: 46px; break-inside: avoid; page-break-inside: avoid; }
  .pdf-sig-row .pdf-sig { flex: 1; margin-top: 0; }

  @media print { @page { margin: 0; } body{ -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { box-sizing: border-box; }
  body{ font-family:'Segoe UI',Arial,sans-serif; background:#000; color:#EDEDED; margin:0; padding:0; }
  .pdf-page{ max-width:760px; margin:0 auto; background:#000; }
  .pdf-header{ display:flex; align-items:center; gap:18px; padding:30px 34px 22px; border-bottom:1px solid rgba(201,162,75,0.35); }
  .pdf-logo{ width:76px; height:auto; object-fit:contain; flex-shrink:0; }
  .pdf-brand{ font-size:22px; font-weight:800; letter-spacing:1px; color:#F3F3F1; }
  .pdf-tagline{ font-size:10.5px; letter-spacing:2px; color:#C9A24B; margin-top:3px; text-transform:uppercase; }
  .pdf-meta{ display:flex; justify-content:space-between; padding:16px 34px 0; font-size:11.5px; color:#9A9A9A; }
  .pdf-meta b{ color:#E9C878; }
  .pdf-doctitle{ padding:18px 34px 0; font-size:18px; font-weight:700; color:#E9C878; letter-spacing:1px; text-transform:uppercase; }
  .pdf-body{ padding:10px 34px 4px; }
  .pdf-card{ background:#111110; border:1px solid rgba(255,255,255,0.08); border-left:3px solid #C9A24B; border-radius:10px; padding:16px 18px; margin-top:16px; }
  .pdf-card h4{ margin:0 0 8px; font-size:10.5px; letter-spacing:1.5px; text-transform:uppercase; color:#C9A24B; font-weight:700; }
  .pdf-card p, .pdf-card div{ margin:0; font-size:13px; line-height:1.7; color:#D6D6D6; }
  table.pdf-table{ width:100%; border-collapse:collapse; margin-top:8px; }
  table.pdf-table th{ background:#1A1A18; color:#C9A24B; font-size:10.5px; letter-spacing:0.5px; text-transform:uppercase; text-align:left; padding:9px 8px; border-bottom:1px solid rgba(201,162,75,0.35); }
  table.pdf-table td{ padding:9px 8px; font-size:12.5px; color:#D6D6D6; border-bottom:1px solid rgba(255,255,255,0.06); }
  .pdf-total-box{ margin:22px 34px 0; background:linear-gradient(135deg,#1A1408,#0E0C06); border:1px solid #C9A24B; border-radius:12px; padding:20px 22px; display:flex; justify-content:space-between; align-items:center; }
  .pdf-total-label{ font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#C9A24B; }
  .pdf-total-value{ font-size:30px; font-weight:800; color:#F3E3B8; }
  .pdf-valor-recebido{ margin:22px 34px 0; background:linear-gradient(135deg,#1A1408,#0E0C06); border:1px solid #C9A24B; border-radius:12px; padding:26px; text-align:center; }
  .pdf-valor-recebido .lbl{ font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:#C9A24B; margin-bottom:6px; }
  .pdf-valor-recebido .val{ font-size:34px; font-weight:800; color:#F3E3B8; }
  .pdf-frase{ padding:18px 34px 0; font-size:13px; line-height:1.7; color:#D6D6D6; font-style:italic; }
  .pdf-sig{ margin:50px 34px 0; border-top:1px solid rgba(255,255,255,0.25); width:280px; text-align:center; padding-top:8px; font-size:11.5px; color:#9A9A9A; }
  .pdf-footer{ margin-top:40px; padding:20px 34px 28px; border-top:1px solid rgba(201,162,75,0.35); text-align:center; }
  .pdf-footer-brand{ font-size:13px; font-weight:700; letter-spacing:1px; color:#E9C878; }
  .pdf-footer-line{ font-size:10.5px; color:#9A9A9A; margin-top:3px; }
  .pdf-footer-motto{ font-size:10px; color:#6E6E73; margin-top:8px; font-style:italic; }
`;

/* ---------------- Compartilhamento ----------------
   Usa o menu nativo de compartilhamento do aparelho (WhatsApp, e-mail, etc.).
   Onde não houver suporte, cai no WhatsApp. */
async function compartilhar({ titulo, texto, telefone }) {
  try {
    if (navigator.share) {
      await navigator.share({ title: titulo, text: texto });
      return true;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return false; // usuário cancelou
    console.error("Falha ao compartilhar", e);
  }
  const tel = (telefone || "").replace(/\D/g, "");
  const msg = encodeURIComponent(texto);
  window.open(tel ? `https://wa.me/55${tel}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank");
  return true;
}

function orcPDF(o) {
  const win = window.open("", "_blank");
  if (!win) return;
  const linhasItens = (o.itens || [])
    .map((it) => `<tr><td>${it.descricao || "-"}</td><td>${it.categoria}</td><td style="text-align:center">${it.qtd} ${it.unidade || ""}</td><td style="text-align:right">R$ ${(Number(it.valorUnit) || 0).toFixed(2)}</td><td style="text-align:right">R$ ${((Number(it.qtd) || 0) * (Number(it.valorUnit) || 0)).toFixed(2)}</td></tr>`)
    .join("");
  const { header, footer } = pdfCabecalhoRodape(LOGO_DATA_URI);
  win.document.write(`
    <html><head><title>Orçamento ${o.numero} — ALLA SERVICE</title>
    <style>${PDF_ESTILO_PREMIUM}</style></head><body>
      <div class="pdf-page">
        ${header}
        <div class="pdf-meta">
          <div><b>Orçamento nº</b> ${o.numero}${o.versao > 1 ? ` (v${o.versao})` : ""}</div>
          <div><b>Data</b> ${new Date(o.createdAt).toLocaleDateString("pt-BR")}</div>
          <div><b>Validade</b> ${o.validade?.dataExpiracao ? new Date(o.validade.dataExpiracao).toLocaleDateString("pt-BR") : "-"}</div>
          <div><b>Status</b> ${orcStatusEfetivo(o)}</div>
        </div>
        <div class="pdf-doctitle">Orçamento de Serviço</div>
        <div class="pdf-body">
          <div class="pdf-card">
            <h4>Dados do cliente</h4>
            <div>${o.nome || "-"}${o.documento ? ` · ${o.documento}` : ""}</div>
            <div>${o.telefone || "-"}${o.email ? ` · ${o.email}` : ""}</div>
            <div>${o.endereco || "-"}</div>
          </div>
          <div class="pdf-card">
            <h4>Equipamento</h4>
            <div>${o.equipamento?.tipo || "-"} ${o.equipamento?.marca || ""} ${o.equipamento?.modelo || ""} ${o.equipamento?.btus ? `· ${o.equipamento.btus} BTUs` : ""}</div>
          </div>
          <div class="pdf-card">
            <h4>Descrição dos serviços</h4>
            <div>${o.servico?.tipo || "-"}${o.servico?.descricaoPersonalizada ? `<br/>${o.servico.descricaoPersonalizada}` : ""}</div>
            ${o.escopoServico ? `<div style="margin-top:8px">${o.escopoServico.replace(/\n/g, "<br/>")}</div>` : ""}
          </div>
          ${(o.itens || []).length ? `<div class="pdf-card"><h4>Itens e valores</h4><table class="pdf-table"><tr><th>Descrição</th><th>Categoria</th><th>Qtd</th><th>Valor Unit.</th><th>Total</th></tr>${linhasItens}</table></div>` : ""}
          <div class="pdf-card">
            <h4>Resumo financeiro</h4>
            <div>Mão de obra: R$ ${(Number(o.maoDeObra?.valor) || 0).toFixed(2)}</div>
            <div>Deslocamento: R$ ${(Number(o.deslocamento?.valor) || 0).toFixed(2)}</div>
            <div>Subtotal: R$ ${o.subtotal.toFixed(2)}</div>
            ${o.descontoValor > 0 ? `<div>Desconto: - R$ ${o.descontoValor.toFixed(2)}</div>` : ""}
            ${o.acrescimoValor > 0 ? `<div>Acréscimo: + R$ ${o.acrescimoValor.toFixed(2)}${o.acrescimo?.motivo ? ` (${o.acrescimo.motivo})` : ""}</div>` : ""}
          </div>
          <div class="pdf-card">
            <h4>Condições comerciais</h4>
            <div>Pagamento: ${o.pagamento?.forma || "-"} · ${o.pagamento?.condicao || "-"}${o.pagamento?.detalhes ? ` (${o.pagamento.detalhes})` : ""}</div>
            ${o.garantia?.servico ? `<div>Garantia do serviço: ${o.garantia.servico}</div>` : ""}
            ${o.garantia?.pecas ? `<div>Garantia das peças: ${o.garantia.pecas}</div>` : ""}
          </div>
          ${o.naoIncluso ? `<div class="pdf-card"><h4>Não incluso</h4><div>${o.naoIncluso.replace(/\n/g, "<br/>")}</div></div>` : ""}
          ${o.observacoesCliente ? `<div class="pdf-card"><h4>Observações técnicas</h4><div>${o.observacoesCliente.replace(/\n/g, "<br/>")}</div></div>` : ""}
        </div>
        <div class="pdf-total-box">
          <span class="pdf-total-label">Valor total</span>
          <span class="pdf-total-value">R$ ${o.valorFinal.toFixed(2)}</span>
        </div>
        <div class="pdf-sig">Assinatura / aceite do cliente</div>
        ${footer}
      </div>
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function orcWhatsappMsg(o) {
  const linhas = [
    `Olá, ${o.nome || "cliente"}.`,
    "",
    `Preparamos seu orçamento nº ${o.numero}.`,
    "",
    `Serviço: ${o.servico?.tipo || "-"}`,
    `Valor: R$ ${o.valorFinal.toFixed(2)}`,
    `Validade: ${o.validade?.dataExpiracao ? new Date(o.validade.dataExpiracao).toLocaleDateString("pt-BR") : "-"}`,
    "",
    "Segue o orçamento completo para sua avaliação.",
    "",
    "Atenciosamente,",
    "ALLA SERVICE",
  ];
  return linhas.join("\n");
}

function OrcamentoDetail({ orcamento, onBack, onChanged, onEditar, onNovaVersao, onConverterOS }) {
  const [o, setO] = useState(orcamento);
  const [msgWhats, setMsgWhats] = useState(orcWhatsappMsg(orcamento));
  const [editandoMsg, setEditandoMsg] = useState(false);

  useEffect(() => {
    setO(orcamento);
  }, [orcamento]);

  const status = orcStatusEfetivo(o);
  const cor = ORC_STATUS_COLOR[status] || "#8A8A90";
  const podeEditar = ["RASCUNHO", "EM NEGOCIAÇÃO"].includes(status);

  const atualizar = async (novo) => {
    try {
      await window.storage.set(`orcamentos:${novo.id}`, JSON.stringify(novo));
      setO(novo);
      onChanged && onChanged(novo);
    } catch (err) {
      console.error("Erro em atualizar", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  const mudarStatus = async (novoStatus, detalhe) => {
    try {
      let atualizado = { ...o, status: novoStatus, updatedAt: new Date().toISOString() };
      atualizado = orcAdicionarHistorico(atualizado, `Status alterado para ${novoStatus}`, detalhe);
      await atualizar(atualizado);
    } catch (err) {
      console.error("Erro em mudarStatus", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  const enviarWhatsapp = () => {
    const texto = encodeURIComponent(msgWhats);
    const telefone = (o.whatsapp || o.telefone || "").replace(/\D/g, "");
    const url = telefone ? `https://wa.me/55${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, "_blank");
    if (status === "RASCUNHO") mudarStatus("ENVIADO", "Enviado via WhatsApp");
  };

  const excluir = async () => {
    try {
      await window.storage.delete(`orcamentos:${o.id}`).catch(() => {});
      onBack(true);
    } catch (err) {
      console.error("Erro em excluir", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button onClick={() => onBack(false)} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <ChevronLeft size={15} /> voltar à lista
      </button>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#C9A24B" }}>
        {o.numero}{o.versao > 1 ? ` · v${o.versao}` : ""}
      </div>
      <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 19, fontWeight: 600, color: "#F3F3F1", marginBottom: 8 }}>
        {o.nome || "Cliente não informado"}
      </div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#141416", border: `1px solid ${cor}55`, borderRadius: 20, padding: "5px 12px", marginBottom: 16 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: cor }} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: cor, letterSpacing: 1 }}>{status}</span>
      </div>

      <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 14, padding: 16, marginBottom: 16 }}>
        {[
          ["Serviço", o.servico?.tipo],
          ["Equipamento", `${o.equipamento?.tipo || "-"} ${o.equipamento?.marca || ""} ${o.equipamento?.modelo || ""}`],
          ["Pagamento", `${o.pagamento?.forma || "-"} · ${o.pagamento?.condicao || "-"}`],
          ["Validade", o.validade?.dataExpiracao ? new Date(o.validade.dataExpiracao).toLocaleDateString("pt-BR") : "-"],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#8A8A90", fontSize: 12.5 }}>{label}</span>
            <span style={{ color: "#F3F3F1", fontSize: 12.5, textAlign: "right" }}>{val}</span>
          </div>
        ))}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#F3F3F1", fontSize: 14, fontWeight: 600 }}>Valor total</span>
          <span style={{ color: "#E9C878", fontSize: 18, fontWeight: 700 }}>R$ {o.valorFinal.toFixed(2)}</span>
        </div>
      </div>

      {o.osVinculadaNumero && (
        <div style={{ background: "rgba(63,188,209,0.1)", border: "1px solid rgba(63,188,209,0.35)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#3FBCD1", marginBottom: 16 }}>
          Convertido na OS {o.osVinculadaNumero}
        </div>
      )}

      {/* ações de status */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {status === "ENVIADO" && (
          <button onClick={() => mudarStatus("VISUALIZADO")} style={{ ...btnGhost }}>Marcar como visualizado</button>
        )}
        {["ENVIADO", "VISUALIZADO"].includes(status) && (
          <button onClick={() => mudarStatus("EM NEGOCIAÇÃO")} style={{ ...btnGhost }}>Em negociação</button>
        )}
        {["ENVIADO", "VISUALIZADO", "EM NEGOCIAÇÃO"].includes(status) && (
          <>
            <button onClick={() => mudarStatus("APROVADO", "Aprovado pelo cliente (registrado pelo técnico)")} style={{ ...btnGhost, borderColor: "#4ADE80", color: "#4ADE80" }}>
              Marcar como aprovado
            </button>
            <button
              onClick={() => {
                const motivo = window.prompt ? window.prompt("Motivo da recusa (opcional):") || "" : "";
                mudarStatus("RECUSADO", motivo);
              }}
              style={{ ...btnGhost, borderColor: "#F0605A", color: "#F0605A" }}
            >
              Marcar como recusado
            </button>
          </>
        )}
        {status === "APROVADO" && !o.osVinculadaId && (
          <button onClick={() => onConverterOS(o)} style={{ ...btnGhost, borderColor: "#3FBCD1", color: "#3FBCD1" }}>
            Converter em OS
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <button onClick={() => setEditandoMsg((v) => !v)} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
          Editar mensagem
        </button>
        <button onClick={enviarWhatsapp} style={{ flex: 1, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
          <Send size={14} /> WhatsApp
        </button>
      </div>
      {editandoMsg && (
        <textarea
          value={msgWhats}
          onChange={(e) => setMsgWhats(e.target.value)}
          style={{ ...inputStyle, minHeight: 130, fontFamily: "'Roboto',sans-serif", marginBottom: 10 }}
        />
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <button
          onClick={() =>
            compartilhar({
              titulo: `Orçamento ${o.numero}`,
              texto: orcWhatsappMsg(o),
              telefone: o.whatsapp || o.telefone,
            })
          }
          style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}
        >
          <Send size={13} /> Enviar
        </button>
        <button onClick={() => orcPDF(o)} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
          <FileText size={14} /> Gerar PDF
        </button>
        <button onClick={() => onNovaVersao(o)} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
          Duplicar
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button
          onClick={() => podeEditar && onEditar(o)}
          disabled={!podeEditar}
          style={{ flex: 1, background: "#1C1C1F", border: `1px solid ${podeEditar ? "#C9A24B" : "#2A2A2E"}`, borderRadius: 12, padding: "12px 0", color: podeEditar ? "#E9C878" : "#5A5A5A", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: podeEditar ? "pointer" : "default" }}
        >
          {podeEditar ? "Editar" : "Bloqueado (criar nova versão)"}
        </button>
        <button onClick={excluir} style={{ flex: 0.6, background: "rgba(240,96,90,0.1)", border: "1px solid rgba(240,96,90,0.4)", borderRadius: 12, padding: "12px 0", color: "#F0605A", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
          Excluir
        </button>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#8A8A90", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        Histórico
      </div>
      {(o.historico || []).length === 0 ? (
        <div style={{ color: "#6E6E73", fontSize: 12.5 }}>Sem registros ainda.</div>
      ) : (
        [...o.historico].reverse().map((h, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1C1C1F" }}>
            <div>
              <div style={{ fontSize: 12.5, color: "#C7C9CE" }}>{h.acao}</div>
              {h.detalhe && <div style={{ fontSize: 11, color: "#6E6E73" }}>{h.detalhe}</div>}
            </div>
            <div style={{ fontSize: 10.5, color: "#6E6E73", whiteSpace: "nowrap" }}>{new Date(h.data).toLocaleString("pt-BR")}</div>
          </div>
        ))
      )}
    </div>
  );
}

const btnGhost = {
  fontSize: 11.5,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #2A2A2E",
  background: "transparent",
  color: "#C7C9CE",
  cursor: "pointer",
};

const ORC_FILTROS_STATUS = ["Todos", "Rascunhos", "Enviados", "Visualizados", "Em negociação", "Aprovados", "Recusados", "Expirados"];
const ORC_FILTRO_STATUS_MAP = {
  Rascunhos: "RASCUNHO",
  Enviados: "ENVIADO",
  Visualizados: "VISUALIZADO",
  "Em negociação": "EM NEGOCIAÇÃO",
  Aprovados: "APROVADO",
  Recusados: "RECUSADO",
  Expirados: "EXPIRADO",
};

function OrcamentosModule({ onRefreshApp }) {
  const [modo, setModo] = useState("lista"); // lista | novo | detalhe
  const [orcamentos, setOrcamentos] = useState(null);
  const [selecionado, setSelecionado] = useState(null);
  const [editando, setEditando] = useState(null);
  const [filtroStatus, setFiltroStatus] = useState("Todos");
  const [filtroPeriodo, setFiltroPeriodo] = useState("Este mês");
  const [busca, setBusca] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await window.storage.list("orcamentos:");
      if (!list || !list.keys || !list.keys.length) return setOrcamentos([]);
      const items = [];
      for (const key of list.keys) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) items.push(orcNormalizar(JSON.parse(r.value)));
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setOrcamentos(items);
    } catch {
      setOrcamentos([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const abrirNovo = () => {
    setEditando(null);
    setModo("novo");
  };
  const abrirEditar = (o) => {
    setEditando(o);
    setModo("novo");
  };
  const abrirNovaVersao = (o) => {
    setEditando({ ...o, _novaVersaoDe: true });
    setModo("novo");
  };
  const abrirDetalhe = (o) => {
    setSelecionado(o);
    setModo("detalhe");
  };

  const converterEmOS = async (o) => {
    try {
      const idOS = uid();
      const numeroOS = await proximoNumero("OS", "ordens-servico:");
      const os = {
        id: idOS,
        numero: numeroOS,
        clienteNome: o.nome,
        clienteTelefone: o.telefone,
        clienteDocumento: o.documento,
        clienteEndereco: o.endereco,
        eqTipo: o.equipamento?.tipo || "",
        eqMarca: o.equipamento?.marca || "",
        eqModelo: o.equipamento?.modelo || "",
        eqBtus: o.equipamento?.btus || "",
        eqSerie: o.equipamento?.numeroSerie || "",
        tipoServico: o.servico?.tipo || "",
        problemaRelatado: "",
        diagnostico: "",
        procedimentosRealizados: o.escopoServico || "",
        materiaisUtilizados: (o.itens || []).map((it) => it.descricao).filter(Boolean).join("; "),
        pecasUtilizadas: "",
        observacoes: `Origem: Orçamento ${o.numero}. ${o.observacoesCliente || ""}`.trim(),
        tecnico: "",
        data: new Date().toISOString().slice(0, 10),
        horaEntrada: "",
        horaSaida: "",
        maoDeObra: String(o.maoDeObra?.valor || 0),
        materiais: String(o.materiaisTotal || 0),
        pecas: "0",
        deslocamento: String(o.deslocamento?.valor || 0),
        desconto: String(o.descontoValor || 0),
        status: "ABERTA",
        valorTotal: o.valorFinal,
        fotosAntes: [],
        fotosDepois: [],
        assinatura: null,
        createdAt: new Date().toISOString(),
        finalizedAt: null,
        receitaGerada: false,
        origemOrcamentoId: o.id,
        origemOrcamentoNumero: o.numero,
      };
      await window.storage.set(`ordens-servico:${idOS}`, JSON.stringify(os));

      let orcAtualizado = { ...o, status: "CONVERTIDO EM OS", osVinculadaId: idOS, osVinculadaNumero: numeroOS, updatedAt: new Date().toISOString() };
      orcAtualizado = orcAdicionarHistorico(orcAtualizado, "Convertido em Ordem de Serviço", `OS ${numeroOS}`);
      await window.storage.set(`orcamentos:${o.id}`, JSON.stringify(orcAtualizado));

      setSelecionado(orcAtualizado);
      load();
      onRefreshApp && onRefreshApp();
    } catch (err) {
      console.error("Erro em converterEmOS", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  const listaComStatusEfetivo = useMemo(() => (orcamentos || []).map((o) => ({ ...o, _statusEfetivo: orcStatusEfetivo(o) })), [orcamentos]);

  const filtrados = useMemo(() => {
    let lst = listaComStatusEfetivo;
    if (filtroStatus !== "Todos") {
      const alvo = ORC_FILTRO_STATUS_MAP[filtroStatus];
      lst = lst.filter((o) => o._statusEfetivo === alvo);
    }
    if (busca.trim()) {
      const q = busca.trim().toLowerCase();
      lst = lst.filter(
        (o) =>
          (o.nome || "").toLowerCase().includes(q) ||
          (o.numero || "").toLowerCase().includes(q) ||
          (o.telefone || "").includes(q) ||
          (o.equipamento?.tipo || "").toLowerCase().includes(q) ||
          (o.servico?.tipo || "").toLowerCase().includes(q) ||
          (o.servico?.descricaoPersonalizada || "").toLowerCase().includes(q)
      );
    }
    return lst;
  }, [listaComStatusEfetivo, filtroStatus, busca]);

  // dashboard
  const totalOrc = listaComStatusEfetivo.length;
  const emAnalise = listaComStatusEfetivo.filter((o) => ["ENVIADO", "VISUALIZADO", "EM NEGOCIAÇÃO"].includes(o._statusEfetivo)).length;
  const enviados = listaComStatusEfetivo.filter((o) => o._statusEfetivo !== "RASCUNHO").length;
  const aprovados = listaComStatusEfetivo.filter((o) => ["APROVADO", "CONVERTIDO EM OS"].includes(o._statusEfetivo));
  const recusados = listaComStatusEfetivo.filter((o) => o._statusEfetivo === "RECUSADO").length;
  const valorNegociacao = listaComStatusEfetivo
    .filter((o) => ["ENVIADO", "VISUALIZADO", "EM NEGOCIAÇÃO"].includes(o._statusEfetivo))
    .reduce((acc, o) => acc + (o.valorFinal || 0), 0);
  const valorAprovado = aprovados.reduce((acc, o) => acc + (o.valorFinal || 0), 0);
  const taxaAprovacao = enviados > 0 ? ((aprovados.length / enviados) * 100).toFixed(0) : 0;

  if (modo === "novo") {
    return (
      <OrcamentoForm
        editing={editando}
        onCancel={() => setModo(editando && !editando._novaVersaoDe ? "detalhe" : "lista")}
        onDone={(obj) => {
          setSelecionado(obj);
          setModo("detalhe");
          load();
          onRefreshApp && onRefreshApp();
        }}
      />
    );
  }

  if (modo === "detalhe" && selecionado) {
    return (
      <OrcamentoDetail
        orcamento={selecionado}
        onBack={(excluido) => {
          setModo("lista");
          load();
          if (excluido) onRefreshApp && onRefreshApp();
        }}
        onChanged={(novo) => {
          setSelecionado(novo);
          load();
        }}
        onEditar={abrirEditar}
        onNovaVersao={abrirNovaVersao}
        onConverterOS={converterEmOS}
      />
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button
        onClick={abrirNovo}
        style={{ width: "100%", background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer", marginBottom: 18 }}
      >
        <Plus size={16} /> Novo orçamento
      </button>

      {/* dashboard */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        {[
          ["Total de orçamentos", totalOrc],
          ["Em análise", emAnalise],
          ["Aprovados", aprovados.length],
          ["Recusados", recusados],
          ["Valor em negociação", `R$ ${valorNegociacao.toFixed(2)}`],
          ["Valor aprovado", `R$ ${valorAprovado.toFixed(2)}`],
        ].map(([label, val]) => (
          <div key={label} className="premium-card" style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "13px 14px" }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#8A8A8A", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 18, color: "#F5F5F5" }}>{val}</div>
          </div>
        ))}
      </div>
      <div className="premium-card" style={{ background: "#0D0D0D", border: "1px solid rgba(201,162,75,0.3)", borderRadius: 14, padding: "13px 14px", marginBottom: 18, textAlign: "center" }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#8A8A8A", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Taxa de aprovação</div>
        <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 24, color: "#C9A24B" }}>{taxaAprovacao}%</div>
      </div>

      {/* busca */}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} color="#6E6E73" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente, número, telefone, equipamento..."
          style={{ ...inputStyle, paddingLeft: 34 }}
        />
      </div>

      {/* filtros de status */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16 }}>
        {ORC_FILTROS_STATUS.map((f) => (
          <button
            key={f}
            onClick={() => setFiltroStatus(f)}
            style={{
              flexShrink: 0,
              fontSize: 11.5,
              padding: "7px 12px",
              borderRadius: 20,
              border: `1px solid ${filtroStatus === f ? "#C9A24B" : "#2A2A2E"}`,
              background: filtroStatus === f ? "rgba(201,162,75,0.15)" : "transparent",
              color: filtroStatus === f ? "#E9C878" : "#8A8A90",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {orcamentos === null ? (
        <div style={{ textAlign: "center", padding: 30 }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73" }}>
          <DollarSign size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>{orcamentos.length === 0 ? "Nenhum orçamento criado ainda." : "Nenhum resultado para esse filtro."}</div>
        </div>
      ) : (
        filtrados.map((o) => {
          const cor = ORC_STATUS_COLOR[o._statusEfetivo] || "#8A8A90";
          return (
            <button
              key={o.id}
              onClick={() => abrirDetalhe(o)}
              style={{ width: "100%", textAlign: "left", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", marginBottom: 10, cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#8A8A90" }}>{o.numero}</div>
                  <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1", marginTop: 2 }}>{o.nome || "Cliente não informado"}</div>
                  <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>{o.servico?.tipo || "-"}</div>
                </div>
                <span style={{ color: "#E9C878", fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap" }}>R$ {(o.valorFinal || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: cor }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: cor }}>{o._statusEfetivo}</span>
                <span style={{ fontSize: 10.5, color: "#6E6E73", marginLeft: "auto" }}>{new Date(o.createdAt).toLocaleDateString("pt-BR")}</span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

function gerarLaudoTexto(d) {
  const linhas = [];
  linhas.push("1. IDENTIFICAÇÃO DO EQUIPAMENTO");
  linhas.push(
    `${d.eqTipo || "Equipamento"}${d.eqMarca ? `, marca ${d.eqMarca}` : ""}${d.eqModelo ? `, modelo ${d.eqModelo}` : ""}${d.eqBtus ? `, ${d.eqBtus} BTUs` : ""}${d.eqSerie ? `, nº de série ${d.eqSerie}` : ""}.`
  );
  linhas.push("");
  linhas.push("2. RELATO DO PROBLEMA");
  linhas.push(d.problemaRelatado || "Não informado.");
  linhas.push("");
  linhas.push("3. INSPEÇÃO TÉCNICA");
  linhas.push(d.inspecaoRealizada || "Não informado.");
  if (d.testesRealizados) {
    linhas.push(`Testes realizados: ${d.testesRealizados}`);
  }
  linhas.push("");
  linhas.push("4. DIAGNÓSTICO");
  linhas.push(d.resultadosEncontrados || "Não informado.");
  if (d.pecasVerificadas) linhas.push(`Peças verificadas: ${d.pecasVerificadas}`);
  if (d.pecasDanificadas) linhas.push(`Peças danificadas identificadas: ${d.pecasDanificadas}`);
  linhas.push("");
  linhas.push("5. PROCEDIMENTOS REALIZADOS");
  linhas.push(d.procedimentosRealizados || "Não informado.");
  linhas.push("");
  linhas.push("6. CONCLUSÃO");
  linhas.push(
    d.pecasDanificadas
      ? "Foram identificadas irregularidades conforme descrito no diagnóstico, com procedimentos executados conforme relatado acima."
      : "Inspeção e procedimentos concluídos conforme relatado acima."
  );
  linhas.push("");
  linhas.push("7. RECOMENDAÇÃO");
  linhas.push(d.recomendacaoTecnica || "Nenhuma recomendação adicional registrada.");
  return linhas.join("\n");
}

function LaudoTecnico() {
  const emptyForm = {
    nome: "",
    telefone: "",
    endereco: "",
    eqMarca: "",
    eqModelo: "",
    eqTipo: "",
    eqBtus: "",
    eqSerie: "",
    problemaRelatado: "",
    inspecaoRealizada: "",
    testesRealizados: "",
    resultadosEncontrados: "",
    pecasVerificadas: "",
    pecasDanificadas: "",
    procedimentosRealizados: "",
    recomendacaoTecnica: "",
    osVinculada: "",
    equipamentoVinculado: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [fotos, setFotos] = useState([]);
  const [mode, setMode] = useState("form"); // form | gerado | lista
  const [laudoTexto, setLaudoTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [lista, setLista] = useState(null);
  const fileInputRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addFotos = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const dataUrl = await resizeImage(file);
        setFotos((f) => [...f, { id: uid(), src: dataUrl }]);
      } catch {
        /* skip */
      }
    }
    e.target.value = "";
  };

  const gerar = () => {
    setLaudoTexto(gerarLaudoTexto(form));
    setMode("gerado");
  };

  const salvar = async () => {
    setSaving(true);
    try {
      const id = savedId || uid();
      const laudo = { id, createdAt: new Date().toISOString(), ...form, fotos, texto: laudoTexto };
      const result = await window.storage.set(`laudos:${id}`, JSON.stringify(laudo));
      if (result) setSavedId(id);
    } catch (err) {
      console.error("Erro ao salvar laudo", err);
    } finally {
      setSaving(false);
    }
  };

  const enviarWhatsapp = () => {
    const texto = encodeURIComponent(`*ALLA SERVICE — Laudo Técnico*\n\nCliente: ${form.nome || "-"}\n\n${laudoTexto}`);
    const telefone = (form.telefone || "").replace(/\D/g, "");
    const url = telefone ? `https://wa.me/55${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, "_blank");
  };

  const gerarPDF = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const fotosHtml = fotos.length
      ? `<div class="section"><b>Fotos:</b><br/>${fotos.map((f) => `<img src="${f.src}" style="width:150px;margin:4px;border-radius:6px" />`).join("")}</div>`
      : "";
    win.document.write(`
      <html><head><title>Laudo Técnico — ALLA SERVICE</title>
      <style>
        body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:700px;margin:0 auto}
        h1{font-size:20px;border-bottom:3px solid #C9A24B;padding-bottom:10px}
        .muted{color:#666;font-size:12px}
        .section{margin-top:16px;white-space:pre-wrap;font-size:13px;line-height:1.6}
      </style></head><body>
        <h1>ALLA SERVICE — Laudo Técnico</h1>
        <div class="muted">Emitido em ${new Date().toLocaleString("pt-BR")}</div>
        <div class="section"><b>Cliente:</b> ${form.nome || "-"} — ${form.telefone || "-"}<br/><b>Endereço:</b> ${form.endereco || "-"}</div>
        <div class="section">${laudoTexto.replace(/\n/g, "<br/>")}</div>
        ${form.osVinculada ? `<div class="section muted">OS vinculada: ${form.osVinculada}</div>` : ""}
        ${form.equipamentoVinculado ? `<div class="section muted">Equipamento vinculado: ${form.equipamentoVinculado}</div>` : ""}
        ${fotosHtml}
      </body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  const carregarLista = useCallback(async () => {
    try {
      const list = await window.storage.list("laudos:");
      if (!list || !list.keys || !list.keys.length) return setLista([]);
      const items = [];
      for (const key of list.keys) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) items.push(JSON.parse(r.value));
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setLista(items);
    } catch {
      setLista([]);
    }
  }, []);

  if (mode === "lista") {
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button
          onClick={() => setMode("form")}
          style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
        >
          <ChevronLeft size={15} /> novo laudo
        </button>
        {lista === null ? (
          <div style={{ textAlign: "center", padding: 30 }}>
            <Loader2 size={20} className="spin" />
          </div>
        ) : lista.length === 0 ? (
          <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73", fontSize: 13 }}>Nenhum laudo salvo ainda.</div>
        ) : (
          lista.map((l) => (
            <div key={l.id} style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1" }}>{l.nome || "Cliente não informado"}</div>
              <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>{new Date(l.createdAt).toLocaleDateString("pt-BR")} · {l.eqTipo || "Equipamento"}</div>
            </div>
          ))
        )}
      </div>
    );
  }

  if (mode === "gerado") {
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <div style={{ background: "linear-gradient(135deg,#151517,#1C1C1F)", border: "1px solid rgba(201,162,75,0.35)", borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
            Laudo técnico
          </div>
          <textarea
            value={laudoTexto}
            onChange={(e) => setLaudoTexto(e.target.value)}
            style={{ ...inputStyle, minHeight: 320, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, lineHeight: 1.6, resize: "vertical" }}
          />
        </div>

        {savedId && <div style={{ textAlign: "center", color: "#4ADE80", fontSize: 12, marginBottom: 12 }}>Laudo salvo ✓</div>}

        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button onClick={() => setMode("form")} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
            Editar dados
          </button>
          <button onClick={salvar} disabled={saving} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #C9A24B", borderRadius: 12, padding: "12px 0", color: "#E9C878", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={enviarWhatsapp} style={{ flex: 1, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
            <Send size={14} /> WhatsApp
          </button>
          <button onClick={gerarPDF} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button
        onClick={() => {
          setMode("lista");
          carregarLista();
        }}
        style={{ background: "none", border: "1px solid #2A2A2E", borderRadius: 8, color: "#8A8A90", fontSize: 11.5, padding: "6px 12px", cursor: "pointer", marginBottom: 16 }}
      >
        Ver laudos salvos
      </button>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Cliente</div>
      <Field label="Nome">
        <input style={inputStyle} value={form.nome} onChange={set("nome")} />
      </Field>
      <Field label="Telefone">
        <input style={inputStyle} value={form.telefone} onChange={set("telefone")} inputMode="numeric" placeholder="15999999999" />
      </Field>
      <Field label="Endereço">
        <input style={inputStyle} value={form.endereco} onChange={set("endereco")} />
      </Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Equipamento</div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Marca">
            <input style={inputStyle} value={form.eqMarca} onChange={set("eqMarca")} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Modelo">
            <input style={inputStyle} value={form.eqModelo} onChange={set("eqModelo")} />
          </Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Tipo">
            <input style={inputStyle} value={form.eqTipo} onChange={set("eqTipo")} placeholder="Ex: Split" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="BTUs">
            <input style={inputStyle} value={form.eqBtus} onChange={set("eqBtus")} inputMode="numeric" />
          </Field>
        </div>
      </div>
      <Field label="Número de série">
        <input style={inputStyle} value={form.eqSerie} onChange={set("eqSerie")} />
      </Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Diagnóstico</div>
      {[
        ["problemaRelatado", "Problema relatado"],
        ["inspecaoRealizada", "Inspeção realizada"],
        ["testesRealizados", "Testes realizados"],
        ["resultadosEncontrados", "Resultados encontrados"],
        ["pecasVerificadas", "Peças verificadas"],
        ["pecasDanificadas", "Peças danificadas"],
        ["procedimentosRealizados", "Procedimentos realizados"],
        ["recomendacaoTecnica", "Recomendação técnica"],
      ].map(([k, label]) => (
        <Field key={k} label={label}>
          <textarea style={{ ...inputStyle, minHeight: 64, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form[k]} onChange={set(k)} />
        </Field>
      ))}

      <Field label={`Fotos (${fotos.length})`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {fotos.map((f) => (
            <div key={f.id} style={{ position: "relative", width: 64, height: 64 }}>
              <img src={f.src} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, border: "1px solid #2A2A2E" }} />
              <button
                onClick={() => setFotos((fs) => fs.filter((x) => x.id !== f.id))}
                style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#F0605A", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
          <button
            onClick={() => fileInputRef.current.click()}
            style={{ width: 64, height: 64, borderRadius: 8, border: "1px dashed #3A3A3E", background: "#141416", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8A90", cursor: "pointer" }}
          >
            <Camera size={18} />
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }} onChange={addFotos} />
      </Field>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Vincular à OS (nº, opcional)">
            <input style={inputStyle} value={form.osVinculada} onChange={set("osVinculada")} />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Vincular equipamento (opcional)">
            <input style={inputStyle} value={form.equipamentoVinculado} onChange={set("equipamentoVinculado")} />
          </Field>
        </div>
      </div>

      <button
        onClick={gerar}
        style={{ width: "100%", marginTop: 6, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13.5, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer" }}
      >
        Gerar laudo com IA
      </button>
    </div>
  );
}

/* ---------------- Ferramenta: PMOC ---------------- */
const PMOC_FREQ_MESES = { Mensal: 1, Bimestral: 2, Trimestral: 3, Semestral: 6, Anual: 12 };

function pmocStatus(proximaManutencao) {
  if (!proximaManutencao) return { label: "SEM DATA", color: "#6E6E73" };
  const hoje = new Date();
  const prox = new Date(proximaManutencao);
  const diffDias = Math.ceil((prox - hoje) / (1000 * 60 * 60 * 24));
  if (diffDias < 0) return { label: "ATRASADO", color: "#F0605A" };
  if (diffDias <= 30) return { label: "PRÓXIMO DO VENCIMENTO", color: "#E9C878" };
  return { label: "EM DIA", color: "#4ADE80" };
}

function addMeses(dataStr, meses) {
  const d = dataStr ? new Date(dataStr) : new Date();
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
}

function PmocChecklistForm({ onSubmit, onCancel }) {
  const itens = ["Limpeza", "Filtros", "Serpentina", "Dreno", "Ventilador", "Componentes elétricos"];
  const [status, setStatus] = useState(Object.fromEntries(itens.map((i) => [i, "OK"])));
  const [medicoes, setMedicoes] = useState({ temperatura: "", corrente: "", pressao: "" });
  const [observacoes, setObservacoes] = useState("");
  const [fotos, setFotos] = useState([]);
  const fileInputRef = useRef(null);

  const addFotos = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const dataUrl = await resizeImage(file);
        setFotos((f) => [...f, { id: uid(), src: dataUrl }]);
      } catch {
        /* skip */
      }
    }
    e.target.value = "";
  };

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        Checklist de manutenção
      </div>
      {itens.map((item) => (
        <div key={item} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ color: "#C7C9CE", fontSize: 13.5 }}>{item}</span>
          <div style={{ display: "flex", gap: 6 }}>
            {["OK", "Atenção", "Problema"].map((opt) => (
              <button
                key={opt}
                onClick={() => setStatus((s) => ({ ...s, [item]: opt }))}
                style={{
                  fontSize: 10.5,
                  padding: "5px 9px",
                  borderRadius: 7,
                  border: `1px solid ${status[item] === opt ? "#C9A24B" : "#2A2A2E"}`,
                  background: status[item] === opt ? "rgba(201,162,75,0.15)" : "transparent",
                  color: status[item] === opt ? "#E9C878" : "#8A8A90",
                  cursor: "pointer",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <div style={{ flex: 1 }}>
          <Field label="Temperatura (°C)">
            <input style={inputStyle} value={medicoes.temperatura} onChange={(e) => setMedicoes((m) => ({ ...m, temperatura: e.target.value }))} inputMode="decimal" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Corrente (A)">
            <input style={inputStyle} value={medicoes.corrente} onChange={(e) => setMedicoes((m) => ({ ...m, corrente: e.target.value }))} inputMode="decimal" />
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Pressão (PSI)">
            <input style={inputStyle} value={medicoes.pressao} onChange={(e) => setMedicoes((m) => ({ ...m, pressao: e.target.value }))} inputMode="decimal" />
          </Field>
        </div>
      </div>

      <Field label="Observações">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </Field>

      <Field label={`Fotos (${fotos.length})`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {fotos.map((f) => (
            <img key={f.id} src={f.src} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #2A2A2E" }} />
          ))}
          <button onClick={() => fileInputRef.current.click()} style={{ width: 56, height: 56, borderRadius: 8, border: "1px dashed #3A3A3E", background: "#141416", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8A90", cursor: "pointer" }}>
            <Camera size={16} />
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }} onChange={addFotos} />
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Cancelar
        </button>
        <button
          onClick={() => onSubmit({ status, medicoes, observacoes, fotos, data: new Date().toISOString() })}
          style={{ flex: 1.4, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "12px 0", color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}
        >
          Concluir manutenção
        </button>
      </div>
    </div>
  );
}

function PmocDetail({ pmoc, onBack, onUpdated }) {
  const [checklistMode, setChecklistMode] = useState(false);
  const [current, setCurrent] = useState(pmoc);
  const st = pmocStatus(current.proximaManutencao);

  const registrarManutencao = async (registro) => {
    try {
      const historico = [...(current.historico || []), registro];
      const meses = PMOC_FREQ_MESES[current.frequencia] || 3;
      const proximaManutencao = addMeses(registro.data.slice(0, 10), meses);
      const atualizado = { ...current, historico, proximaManutencao, ultimaManutencao: registro.data };
      await window.storage.set(`pmocs:${current.id}`, JSON.stringify(atualizado));
      setCurrent(atualizado);
      setChecklistMode(false);
      onUpdated && onUpdated();
    } catch (err) {
      console.error("Erro em registrarManutencao", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  const gerarRelatorioTexto = () => {
    const linhas = [
      `Relatório PMOC — ${current.clienteNome}`,
      `Empresa: ${current.empresa || "-"} · CNPJ: ${current.cnpj || "-"}`,
      `Equipamento: ${current.eqTipo} ${current.eqMarca} ${current.eqModelo} · ${current.eqBtus || "-"} BTUs`,
      `Frequência: ${current.frequencia} · Responsável: ${current.responsavel || "-"}`,
      `Próxima manutenção: ${current.proximaManutencao || "-"} (${pmocStatus(current.proximaManutencao).label})`,
      "",
      `Histórico de manutenções (${(current.historico || []).length}):`,
      ...(current.historico || []).map(
        (h, idx) =>
          `${idx + 1}. ${new Date(h.data).toLocaleDateString("pt-BR")} — ${Object.entries(h.status).map(([k, v]) => `${k}: ${v}`).join(", ")}${h.observacoes ? ` · Obs: ${h.observacoes}` : ""}`
      ),
    ];
    return linhas.join("\n");
  };

  const enviarWhatsapp = () => {
    const texto = encodeURIComponent(`*ALLA SERVICE — PMOC*\n\n${gerarRelatorioTexto()}`);
    const telefone = (current.telefone || "").replace(/\D/g, "");
    const url = telefone ? `https://wa.me/55${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, "_blank");
  };

  const gerarPDF = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>PMOC — ALLA SERVICE</title>
      <style>body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:700px;margin:0 auto}
      h1{font-size:20px;border-bottom:3px solid #C9A24B;padding-bottom:10px}
      pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:13px;line-height:1.6}</style></head>
      <body><h1>ALLA SERVICE — Relatório PMOC</h1><pre>${gerarRelatorioTexto()}</pre></body></html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  if (checklistMode) {
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setChecklistMode(false)} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar
        </button>
        <PmocChecklistForm onSubmit={registrarManutencao} onCancel={() => setChecklistMode(false)} />
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <ChevronLeft size={15} /> voltar à lista
      </button>

      <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 19, fontWeight: 600, color: "#F3F3F1" }}>{current.clienteNome}</div>
      <div style={{ fontSize: 12.5, color: "#8A8A90", marginBottom: 12 }}>{current.empresa}</div>

      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#141416", border: `1px solid ${st.color}55`, borderRadius: 20, padding: "5px 12px", marginBottom: 16 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color }} />
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: st.color, letterSpacing: 1 }}>{st.label}</span>
      </div>

      <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 14, padding: 16, marginBottom: 16 }}>
        {[
          ["Equipamento", `${current.eqTipo || "-"} ${current.eqMarca || ""} ${current.eqModelo || ""}`],
          ["BTUs", current.eqBtus || "-"],
          ["Local instalado", current.localInstalado || "-"],
          ["Frequência", current.frequencia],
          ["Responsável", current.responsavel || "-"],
          ["Próxima manutenção", current.proximaManutencao || "-"],
        ].map(([label, val]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#8A8A90", fontSize: 12.5 }}>{label}</span>
            <span style={{ color: "#F3F3F1", fontSize: 12.5 }}>{val}</span>
          </div>
        ))}
      </div>

      <button
        onClick={() => setChecklistMode(true)}
        style={{ width: "100%", background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer", marginBottom: 16 }}
      >
        Registrar manutenção
      </button>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#8A8A90", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        Histórico ({(current.historico || []).length})
      </div>
      {(current.historico || []).length === 0 ? (
        <div style={{ color: "#6E6E73", fontSize: 12.5, marginBottom: 16 }}>Nenhuma manutenção registrada ainda.</div>
      ) : (
        [...current.historico].reverse().map((h, idx) => (
          <div key={idx} style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: "#C7C9CE" }}>{new Date(h.data).toLocaleString("pt-BR")}</div>
            {h.observacoes && <div style={{ fontSize: 11.5, color: "#8A8A90", marginTop: 3 }}>{h.observacoes}</div>}
          </div>
        ))
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button onClick={enviarWhatsapp} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
          <Send size={13} /> WhatsApp
        </button>
        <button onClick={gerarPDF} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
          <FileText size={13} /> PDF
        </button>
      </div>
    </div>
  );
}

function PmocCadastroForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({
    clienteNome: "",
    empresa: "",
    cnpj: "",
    endereco: "",
    telefone: "",
    email: "",
    eqTipo: "",
    eqMarca: "",
    eqModelo: "",
    eqBtus: "",
    eqSerie: "",
    localInstalado: "",
    frequencia: "Trimestral",
    atividades: "",
    responsavel: "",
    dataInicio: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const salvar = async () => {
    setSaving(true);
    try {
      const id = uid();
      const meses = PMOC_FREQ_MESES[form.frequencia] || 3;
      const proximaManutencao = addMeses(form.dataInicio, meses);
      const pmoc = { id, createdAt: new Date().toISOString(), ...form, proximaManutencao, historico: [] };
      await window.storage.set(`pmocs:${id}`, JSON.stringify(pmoc));
      onSaved && onSaved();
    } catch (err) {
      console.error("Erro ao salvar PMOC", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Cliente</div>
      <Field label="Nome"><input style={inputStyle} value={form.clienteNome} onChange={set("clienteNome")} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Empresa"><input style={inputStyle} value={form.empresa} onChange={set("empresa")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="CNPJ"><input style={inputStyle} value={form.cnpj} onChange={set("cnpj")} /></Field></div>
      </div>
      <Field label="Endereço"><input style={inputStyle} value={form.endereco} onChange={set("endereco")} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Telefone"><input style={inputStyle} value={form.telefone} onChange={set("telefone")} inputMode="numeric" /></Field></div>
        <div style={{ flex: 1 }}><Field label="E-mail"><input style={inputStyle} value={form.email} onChange={set("email")} /></Field></div>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Equipamento</div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Tipo"><input style={inputStyle} value={form.eqTipo} onChange={set("eqTipo")} placeholder="Ex: Split" /></Field></div>
        <div style={{ flex: 1 }}><Field label="BTUs"><input style={inputStyle} value={form.eqBtus} onChange={set("eqBtus")} inputMode="numeric" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Marca"><input style={inputStyle} value={form.eqMarca} onChange={set("eqMarca")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Modelo"><input style={inputStyle} value={form.eqModelo} onChange={set("eqModelo")} /></Field></div>
      </div>
      <Field label="Número de série"><input style={inputStyle} value={form.eqSerie} onChange={set("eqSerie")} /></Field>
      <Field label="Local instalado"><input style={inputStyle} value={form.localInstalado} onChange={set("localInstalado")} placeholder="Ex: Recepção, Sala 2..." /></Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Plano de manutenção</div>
      <Field label="Frequência">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.frequencia} onChange={set("frequencia")}>
          {Object.keys(PMOC_FREQ_MESES).map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </Field>
      <Field label="Atividades previstas">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form.atividades} onChange={set("atividades")} />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Responsável"><input style={inputStyle} value={form.responsavel} onChange={set("responsavel")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Data de início"><input type="date" style={inputStyle} value={form.dataInicio} onChange={set("dataInicio")} /></Field></div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Cancelar
        </button>
        <button onClick={salvar} disabled={saving || !form.clienteNome.trim()} style={{ flex: 1.4, background: form.clienteNome.trim() ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "12px 0", color: form.clienteNome.trim() ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          {saving ? "Salvando..." : "Salvar plano PMOC"}
        </button>
      </div>
    </div>
  );
}

function PmocTool() {
  const [lista, setLista] = useState(null);
  const [selected, setSelected] = useState(null);
  const [novo, setNovo] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await window.storage.list("pmocs:");
      if (!list || !list.keys || !list.keys.length) return setLista([]);
      const items = [];
      for (const key of list.keys) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) items.push(JSON.parse(r.value));
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setLista(items);
    } catch {
      setLista([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (selected) {
    return (
      <PmocDetail
        pmoc={selected}
        onBack={() => {
          setSelected(null);
          load();
        }}
        onUpdated={load}
      />
    );
  }

  if (novo) {
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setNovo(false)} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar
        </button>
        <PmocCadastroForm
          onSaved={() => {
            setNovo(false);
            load();
          }}
          onCancel={() => setNovo(false)}
        />
      </div>
    );
  }

  const atrasados = (lista || []).filter((p) => pmocStatus(p.proximaManutencao).label === "ATRASADO").length;
  const proximos = (lista || []).filter((p) => pmocStatus(p.proximaManutencao).label === "PRÓXIMO DO VENCIMENTO").length;

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button
        onClick={() => setNovo(true)}
        style={{ width: "100%", background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer", marginBottom: 16 }}
      >
        <Plus size={16} /> Novo plano PMOC
      </button>

      {(atrasados > 0 || proximos > 0) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {atrasados > 0 && (
            <div style={{ flex: 1, background: "rgba(240,96,90,0.1)", border: "1px solid rgba(240,96,90,0.35)", borderRadius: 10, padding: "8px 10px", fontSize: 11, color: "#F0605A" }}>
              {atrasados} atrasado{atrasados > 1 ? "s" : ""}
            </div>
          )}
          {proximos > 0 && (
            <div style={{ flex: 1, background: "rgba(233,200,120,0.1)", border: "1px solid rgba(233,200,120,0.35)", borderRadius: 10, padding: "8px 10px", fontSize: 11, color: "#E9C878" }}>
              {proximos} próximo{proximos > 1 ? "s" : ""} do vencimento
            </div>
          )}
        </div>
      )}

      {lista === null ? (
        <div style={{ textAlign: "center", padding: 30 }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73" }}>
          <CalendarClock size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>Nenhum plano PMOC cadastrado ainda.</div>
        </div>
      ) : (
        lista.map((p) => {
          const st = pmocStatus(p.proximaManutencao);
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              style={{ width: "100%", textAlign: "left", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", marginBottom: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            >
              <div>
                <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1" }}>{p.clienteNome}</div>
                <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>{p.eqTipo || "Equipamento"} · {p.frequencia}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.color }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: st.color }}>{st.label}</span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

/* ---------------- Módulo: Recibos ---------------- */
const FORMAS_PAGAMENTO = ["PIX", "Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Transferência", "Outro"];

async function proximoNumero(prefix, storagePrefix) {
  try {
    const list = await window.storage.list(storagePrefix);
    const n = (list && list.keys ? list.keys.length : 0) + 1;
    return `${prefix}-${String(n).padStart(4, "0")}`;
  } catch {
    return `${prefix}-${String(Date.now()).slice(-4)}`;
  }
}

function ReciboForm({ editingRecibo, onDone }) {
  const [form, setForm] = useState(
    editingRecibo || {
      clienteNome: "",
      documento: "",
      telefone: "",
      descricao: "",
      data: new Date().toISOString().slice(0, 10),
      formaPagamento: "PIX",
      valor: "",
      observacoes: "",
      osVinculada: "",
    }
  );
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const salvar = async () => {
    setSaving(true);
    try {
      const id = form.id || uid();
      const numero = form.numero || (await proximoNumero("REC", "recibos:"));
      const recibo = { ...form, id, numero, createdAt: form.createdAt || new Date().toISOString() };
      await window.storage.set(`recibos:${id}`, JSON.stringify(recibo));
      onDone(recibo);
    } catch (err) {
      console.error("Erro ao salvar recibo", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Cliente</div>
      <Field label="Nome"><input style={inputStyle} value={form.clienteNome} onChange={set("clienteNome")} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="CPF/CNPJ"><input style={inputStyle} value={form.documento} onChange={set("documento")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Telefone"><input style={inputStyle} value={form.telefone} onChange={set("telefone")} inputMode="numeric" placeholder="15999999999" /></Field></div>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Serviço</div>
      <Field label="Descrição">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form.descricao} onChange={set("descricao")} />
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Data"><input type="date" style={inputStyle} value={form.data} onChange={set("data")} /></Field></div>
        <div style={{ flex: 1 }}>
          <Field label="Forma de pagamento">
            <select style={{ ...inputStyle, appearance: "none" }} value={form.formaPagamento} onChange={set("formaPagamento")}>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>
      <Field label="Valor recebido (R$)">
        <input style={inputStyle} value={form.valor} onChange={set("valor")} inputMode="decimal" />
      </Field>
      <Field label="Observações">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form.observacoes} onChange={set("observacoes")} />
      </Field>
      <Field label="Vincular à OS (nº, opcional)">
        <input style={inputStyle} value={form.osVinculada} onChange={set("osVinculada")} />
      </Field>

      <button
        onClick={salvar}
        disabled={saving || !form.clienteNome.trim() || !form.valor}
        style={{
          width: "100%",
          marginTop: 6,
          background: form.clienteNome.trim() && form.valor ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E",
          border: "none",
          borderRadius: 12,
          padding: "13px 0",
          fontFamily: "'Roboto',sans-serif",
          fontWeight: 600,
          fontSize: 13.5,
          color: form.clienteNome.trim() && form.valor ? "#0A0A0B" : "#6E6E73",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        {saving ? "Salvando..." : "Salvar recibo"}
      </button>
    </div>
  );
}

function reciboPDF(r) {
  const win = window.open("", "_blank");
  if (!win) return;
  const { header, footer } = pdfCabecalhoRodape(LOGO_DATA_URI);
  win.document.write(`
    <html><head><title>Recibo ${r.numero} — ALLA SERVICE</title>
    <style>${PDF_ESTILO_PREMIUM}</style></head><body>
      <div class="pdf-page">
        ${header}
        <div class="pdf-meta">
          <div><b>Recibo nº</b> ${r.numero}</div>
          <div><b>Data</b> ${new Date(r.createdAt).toLocaleDateString("pt-BR")}</div>
        </div>
        <div class="pdf-doctitle">Recibo</div>
        <div class="pdf-body">
          <div class="pdf-card">
            <h4>Dados do cliente</h4>
            <div>${r.clienteNome || "-"}${r.documento ? ` · ${r.documento}` : ""}</div>
            ${r.telefone ? `<div>${r.telefone}</div>` : ""}
          </div>
          <div class="pdf-card">
            <h4>Referente a</h4>
            <div>${r.descricao || "-"}</div>
            <div>Data do serviço: ${new Date(r.data).toLocaleDateString("pt-BR")}</div>
            <div>Forma de pagamento: ${r.formaPagamento}</div>
            ${r.observacoes ? `<div>Observações: ${r.observacoes}</div>` : ""}
          </div>
        </div>
        <div class="pdf-frase">
          Recebemos de <b>${r.clienteNome || "-"}</b> a importância de <b>R$ ${Number(r.valor || 0).toFixed(2)}</b>, referente aos serviços descritos neste documento.
        </div>
        <div class="pdf-valor-recebido">
          <div class="lbl">Valor recebido</div>
          <div class="val">R$ ${Number(r.valor || 0).toFixed(2)}</div>
        </div>
        <div class="pdf-sig">Responsável ALLA SERVICE — Assinatura e data</div>
        ${footer}
      </div>
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function reciboWhatsapp(r) {
  const linhas = [
    `*ALLA SERVICE — Recibo ${r.numero}*`,
    `Cliente: ${r.clienteNome}`,
    `Referente a: ${r.descricao || "-"}`,
    `Data: ${new Date(r.data).toLocaleDateString("pt-BR")}`,
    `Forma de pagamento: ${r.formaPagamento}`,
    `*Valor: R$ ${Number(r.valor || 0).toFixed(2)}*`,
    r.observacoes ? `Obs: ${r.observacoes}` : null,
  ].filter(Boolean);
  const texto = encodeURIComponent(linhas.join("\n"));
  const telefone = (r.telefone || "").replace(/\D/g, "");
  const url = telefone ? `https://wa.me/55${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`;
  window.open(url, "_blank");
}

/* ---------------- Hub: Recibos & Orçamentos ---------------- */
function RecibosEOrcamentosHub({ onNavigate }) {
  const [contagens, setContagens] = useState({ orcamentos: null, recibos: null, valorOrcamentos: 0, valorRecibos: 0 });

  useEffect(() => {
    (async () => {
      try {
        const listO = await window.storage.list("orcamentos:");
        let valorO = 0;
        for (const key of listO.keys || []) {
          const r = await window.storage.get(key).catch(() => null);
          if (r) valorO += Number(JSON.parse(r.value).valorFinal) || 0;
        }
        const listR = await window.storage.list("recibos:");
        let valorR = 0;
        for (const key of listR.keys || []) {
          const r = await window.storage.get(key).catch(() => null);
          if (r) valorR += Number(JSON.parse(r.value).valor) || 0;
        }
        setContagens({
          orcamentos: (listO.keys || []).length,
          recibos: (listR.keys || []).length,
          valorOrcamentos: valorO,
          valorRecibos: valorR,
        });
      } catch {
        setContagens({ orcamentos: 0, recibos: 0, valorOrcamentos: 0, valorRecibos: 0 });
      }
    })();
  }, []);

  const HubCard = ({ titulo, subtitulo, icone: Icone, contagem, valor, onClick, corIcone }) => (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: "linear-gradient(135deg,#151517,#1C1C1F)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 18,
        padding: "22px 20px",
        marginBottom: 14,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: `${corIcone}18`,
          border: `1px solid ${corIcone}40`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icone size={24} color={corIcone} strokeWidth={1.7} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 17, fontWeight: 600, color: "#F3F3F1" }}>{titulo}</div>
        <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 2 }}>{subtitulo}</div>
        <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#C7C9CE" }}>
            {contagem === null ? "…" : contagem} {contagem === 1 ? "documento" : "documentos"}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#E9C878" }}>
            R$ {valor.toFixed(2)}
          </span>
        </div>
      </div>
      <ChevronLeft size={16} color="#5A5A5A" style={{ transform: "rotate(180deg)", flexShrink: 0 }} />
    </button>
  );

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#8A8A90", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16 }}>
        Escolha o tipo de documento
      </div>
      <HubCard
        titulo="Orçamento"
        subtitulo="Criar novo orçamento profissional para o cliente"
        icone={DollarSign}
        corIcone="#C9A24B"
        contagem={contagens.orcamentos}
        valor={contagens.valorOrcamentos}
        onClick={() => onNavigate("orcamentos")}
      />
      <HubCard
        titulo="Recibo"
        subtitulo="Gerar recibo profissional de pagamento/serviço realizado"
        icone={Receipt}
        corIcone="#4ADE80"
        contagem={contagens.recibos}
        valor={contagens.valorRecibos}
        onClick={() => onNavigate("recibos")}
      />
    </div>
  );
}

function RecibosModule() {
  const [mode, setMode] = useState("lista"); // lista | novo | detalhe
  const [recibos, setRecibos] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await window.storage.list("recibos:");
      if (!list || !list.keys || !list.keys.length) return setRecibos([]);
      const items = [];
      for (const key of list.keys) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) items.push(JSON.parse(r.value));
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setRecibos(items);
    } catch {
      setRecibos([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id) => {
    try {
      await window.storage.delete(`recibos:${id}`).catch(() => {});
      setSelected(null);
      setMode("lista");
      load();
    } catch (err) {
      console.error("Erro em remove", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  const filtrados = useMemo(() => {
    if (!recibos) return [];
    const q = search.trim().toLowerCase();
    if (!q) return recibos;
    return recibos.filter(
      (r) =>
        r.clienteNome.toLowerCase().includes(q) ||
        r.numero.toLowerCase().includes(q) ||
        r.data.includes(q) ||
        String(r.valor).includes(q)
    );
  }, [recibos, search]);

  if (mode === "novo") {
    return (
      <div>
        <div style={{ padding: "16px 16px 0" }}>
          <button onClick={() => setMode("lista")} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <ChevronLeft size={15} /> cancelar
          </button>
        </div>
        <ReciboForm
          onDone={() => {
            setMode("lista");
            load();
          }}
        />
      </div>
    );
  }

  if (mode === "detalhe" && selected) {
    const r = selected;
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setMode("lista")} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar à lista
        </button>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#C9A24B", marginBottom: 4 }}>{r.numero}</div>
        <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 19, fontWeight: 600, color: "#F3F3F1", marginBottom: 12 }}>{r.clienteNome}</div>
        <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          {[
            ["Descrição", r.descricao || "-"],
            ["Data", new Date(r.data).toLocaleDateString("pt-BR")],
            ["Forma de pagamento", r.formaPagamento],
            ["Observações", r.observacoes || "-"],
          ].map(([label, val]) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: "#8A8A90", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 13, color: "#F3F3F1" }}>{val}</div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#F3F3F1", fontSize: 14, fontWeight: 600 }}>Valor</span>
            <span style={{ color: "#E9C878", fontSize: 18, fontWeight: 700 }}>R$ {Number(r.valor || 0).toFixed(2)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button onClick={() => reciboWhatsapp(r)} style={{ flex: 1, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            <Send size={13} /> WhatsApp
          </button>
          <button onClick={() => reciboPDF(r)} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            <FileText size={13} /> PDF / Imprimir
          </button>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => {
              setMode("novo");
            }}
            style={{ flex: 1, background: "#1C1C1F", border: "1px solid #C9A24B", borderRadius: 12, padding: "12px 0", color: "#E9C878", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}
          >
            Editar
          </button>
          <button onClick={() => remove(r.id)} style={{ flex: 1, background: "rgba(240,96,90,0.1)", border: "1px solid rgba(240,96,90,0.4)", borderRadius: 12, padding: "12px 0", color: "#F0605A", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            Excluir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button
        onClick={() => setMode("novo")}
        style={{ width: "100%", background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer", marginBottom: 16 }}
      >
        <Plus size={16} /> Novo recibo
      </button>

      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={15} color="#6E6E73" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por cliente, número, data ou valor..."
          style={{ ...inputStyle, paddingLeft: 34 }}
        />
      </div>

      {recibos === null ? (
        <div style={{ textAlign: "center", padding: 30 }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73" }}>
          <Receipt size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>{recibos.length === 0 ? "Nenhum recibo emitido ainda." : "Nenhum resultado para essa busca."}</div>
        </div>
      ) : (
        filtrados.map((r) => (
          <button
            key={r.id}
            onClick={() => {
              setSelected(r);
              setMode("detalhe");
            }}
            style={{ width: "100%", textAlign: "left", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", marginBottom: 10, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1" }}>{r.clienteNome}</div>
              <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>{r.numero} · {new Date(r.data).toLocaleDateString("pt-BR")}</div>
            </div>
            <span style={{ color: "#E9C878", fontSize: 14, fontWeight: 700 }}>R$ {Number(r.valor || 0).toFixed(2)}</span>
          </button>
        ))
      )}
    </div>
  );
}

/* ---------------- Módulo: Ordens de Serviço ---------------- */
const OS_STATUS = ["ABERTA", "AGENDADA", "EM ANDAMENTO", "AGUARDANDO PEÇA", "FINALIZADA", "CANCELADA"];
const OS_STATUS_COLOR = {
  ABERTA: "#8A8A90",
  AGENDADA: "#4681DF",
  "EM ANDAMENTO": "#E9C878",
  "AGUARDANDO PEÇA": "#E07A30",
  FINALIZADA: "#4ADE80",
  CANCELADA: "#F0605A",
};

function osValorTotal(v) {
  const soma =
    (Number(v.maoDeObra) || 0) + (Number(v.materiais) || 0) + (Number(v.pecas) || 0) + (Number(v.deslocamento) || 0);
  return Math.max(0, soma - (Number(v.desconto) || 0));
}

function OSFotos({ fotos, setFotos, label }) {
  const fileInputRef = useRef(null);
  const addFotos = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const dataUrl = await resizeImage(file);
        setFotos((f) => [...f, { id: uid(), src: dataUrl }]);
      } catch {
        /* skip */
      }
    }
    e.target.value = "";
  };
  return (
    <Field label={`${label} (${fotos.length})`}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {fotos.map((f) => (
          <div key={f.id} style={{ position: "relative", width: 60, height: 60 }}>
            <img src={f.src} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, border: "1px solid #2A2A2E" }} />
            <button
              onClick={() => setFotos((fs) => fs.filter((x) => x.id !== f.id))}
              style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#F0605A", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            >
              <X size={10} />
            </button>
          </div>
        ))}
        <button onClick={() => fileInputRef.current.click()} style={{ width: 60, height: 60, borderRadius: 8, border: "1px dashed #3A3A3E", background: "#141416", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8A90", cursor: "pointer" }}>
          <Camera size={16} />
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" style={{ display: "none" }} onChange={addFotos} />
    </Field>
  );
}

function OSForm({ editingOS, onDone, onCancel }) {
  const [form, setForm] = useState(
    editingOS || {
      clienteNome: "",
      clienteTelefone: "",
      clienteDocumento: "",
      clienteEndereco: "",
      eqTipo: "",
      eqMarca: "",
      eqModelo: "",
      eqBtus: "",
      eqSerie: "",
      tipoServico: "Manutenção",
      problemaRelatado: "",
      diagnostico: "",
      procedimentosRealizados: "",
      materiaisUtilizados: "",
      pecasUtilizadas: "",
      observacoes: "",
      tecnico: "",
      data: new Date().toISOString().slice(0, 10),
      horaEntrada: "",
      horaSaida: "",
      maoDeObra: "0",
      materiais: "0",
      pecas: "0",
      deslocamento: "0",
      desconto: "0",
      status: "ABERTA",
    }
  );
  const [fotosAntes, setFotosAntes] = useState(editingOS?.fotosAntes || []);
  const [fotosDepois, setFotosDepois] = useState(editingOS?.fotosDepois || []);
  const [assinatura, setAssinatura] = useState(editingOS?.assinatura || null);
  const [saving, setSaving] = useState(false);

  const [tecnicos, setTecnicos] = useState([]);

  // técnicos já cadastrados em Funcionários, para escolher em vez de digitar
  useEffect(() => {
    (async () => {
      try {
        const lista = await window.storage.list("funcionarios:");
        const nomes = [];
        for (const chave of (lista && lista.keys) || []) {
          const doc = await window.storage.get(chave).catch(() => null);
          if (!doc) continue;
          try {
            const f = JSON.parse(doc.value);
            if (f.nome && f.status !== "Inativo") nomes.push(f.nome);
          } catch {
            /* registro ilegível: ignora */
          }
        }
        setTecnicos(nomes.sort((a, b) => a.localeCompare(b)));
      } catch {
        setTecnicos([]); // sem lista: o campo continua aceitando digitação
      }
    })();
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valorTotal = osValorTotal(form);

  const salvar = async (statusOverride) => {
    setSaving(true);
    try {
      const id = form.id || uid();
      const numero = form.numero || (await proximoNumero("OS", "ordens-servico:"));
      const status = statusOverride || form.status;
      const os = {
        ...form,
        id,
        numero,
        status,
        valorTotal,
        fotosAntes,
        fotosDepois,
        assinatura,
        createdAt: form.createdAt || new Date().toISOString(),
        finalizedAt: status === "FINALIZADA" ? new Date().toISOString() : form.finalizedAt || null,
      };
      await window.storage.set(`ordens-servico:${id}`, JSON.stringify(os));

      if (status === "FINALIZADA" && valorTotal > 0 && !form.receitaGerada) {
        const recId = uid();
        await window.storage.set(
          `fin-receitas:${recId}`,
          JSON.stringify({
            id: recId,
            servico: form.tipoServico,
            cliente: form.clienteNome,
            osId: id,
            osNumero: numero,
            data: form.data,
            valor: valorTotal,
            formaPagamento: "A definir",
            status: "pendente",
            createdAt: new Date().toISOString(),
          })
        );
        os.receitaGerada = true;
        await window.storage.set(`ordens-servico:${id}`, JSON.stringify(os));
      }

      onDone(os);
    } catch (err) {
      console.error("Erro ao salvar OS", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Cliente</div>
      <Field label="Nome"><input style={inputStyle} value={form.clienteNome} onChange={set("clienteNome")} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Telefone"><input style={inputStyle} value={form.clienteTelefone} onChange={set("clienteTelefone")} inputMode="numeric" /></Field></div>
        <div style={{ flex: 1 }}><Field label="CPF/CNPJ"><input style={inputStyle} value={form.clienteDocumento} onChange={set("clienteDocumento")} /></Field></div>
      </div>
      <Field label="Endereço"><input style={inputStyle} value={form.clienteEndereco} onChange={set("clienteEndereco")} /></Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Equipamento</div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Tipo"><input style={inputStyle} value={form.eqTipo} onChange={set("eqTipo")} placeholder="Ex: Split" /></Field></div>
        <div style={{ flex: 1 }}><Field label="BTUs"><input style={inputStyle} value={form.eqBtus} onChange={set("eqBtus")} inputMode="numeric" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Marca"><input style={inputStyle} value={form.eqMarca} onChange={set("eqMarca")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Modelo"><input style={inputStyle} value={form.eqModelo} onChange={set("eqModelo")} /></Field></div>
      </div>
      <Field label="Número de série"><input style={inputStyle} value={form.eqSerie} onChange={set("eqSerie")} /></Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Serviço</div>
      <Field label="Tipo de serviço">
        <input style={inputStyle} value={form.tipoServico} onChange={set("tipoServico")} placeholder="Ex: Manutenção, Instalação..." />
      </Field>
      {[
        ["problemaRelatado", "Problema relatado"],
        ["diagnostico", "Diagnóstico"],
        ["procedimentosRealizados", "Procedimentos realizados"],
        ["materiaisUtilizados", "Materiais utilizados"],
        ["pecasUtilizadas", "Peças utilizadas"],
        ["observacoes", "Observações"],
      ].map(([k, label]) => (
        <Field key={k} label={label}>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form[k]} onChange={set(k)} />
        </Field>
      ))}

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Atendimento</div>
      <Field label="Técnico">
        {tecnicos.length > 0 ? (
          <>
            <select
              style={{ ...inputStyle, appearance: "none" }}
              value={tecnicos.includes(form.tecnico) ? form.tecnico : "__outro__"}
              onChange={(e) => setForm((f) => ({ ...f, tecnico: e.target.value === "__outro__" ? "" : e.target.value }))}
            >
              <option value="">Selecionar técnico...</option>
              {tecnicos.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="__outro__">Outro (digitar)</option>
            </select>
            {!tecnicos.includes(form.tecnico) && (
              <input
                style={{ ...inputStyle, marginTop: 8 }}
                value={form.tecnico}
                onChange={set("tecnico")}
                placeholder="Nome do técnico"
              />
            )}
          </>
        ) : (
          <input style={inputStyle} value={form.tecnico} onChange={set("tecnico")} placeholder="Nome do técnico" />
        )}
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Data"><input type="date" style={inputStyle} value={form.data} onChange={set("data")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Entrada"><input type="time" style={inputStyle} value={form.horaEntrada} onChange={set("horaEntrada")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Saída"><input type="time" style={inputStyle} value={form.horaSaida} onChange={set("horaSaida")} /></Field></div>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Valores (R$)</div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Mão de obra"><input style={inputStyle} value={form.maoDeObra} onChange={set("maoDeObra")} inputMode="decimal" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Materiais"><input style={inputStyle} value={form.materiais} onChange={set("materiais")} inputMode="decimal" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Peças"><input style={inputStyle} value={form.pecas} onChange={set("pecas")} inputMode="decimal" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Deslocamento"><input style={inputStyle} value={form.deslocamento} onChange={set("deslocamento")} inputMode="decimal" /></Field></div>
      </div>
      <Field label="Desconto"><input style={inputStyle} value={form.desconto} onChange={set("desconto")} inputMode="decimal" /></Field>

      <div style={{ display: "flex", justifyContent: "space-between", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", margin: "14px 0" }}>
        <span style={{ color: "#8A8A90", fontSize: 13 }}>Valor total</span>
        <span style={{ color: "#E9C878", fontSize: 16, fontWeight: 700 }}>R$ {valorTotal.toFixed(2)}</span>
      </div>

      <OSFotos fotos={fotosAntes} setFotos={setFotosAntes} label="Fotos antes" />
      <OSFotos fotos={fotosDepois} setFotos={setFotosDepois} label="Fotos depois" />

      <Field label="Assinatura do cliente">
        <SignaturePad value={assinatura} onChange={setAssinatura} />
      </Field>

      <Field label="Status">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.status} onChange={set("status")}>
          {OS_STATUS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Cancelar
        </button>
        <button
          onClick={() => salvar()}
          disabled={saving || !form.clienteNome.trim()}
          style={{ flex: 1, background: form.clienteNome.trim() ? "#1C1C1F" : "#2A2A2E", border: "1px solid #C9A24B", borderRadius: 12, padding: "12px 0", color: "#E9C878", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}
        >
          Salvar
        </button>
      </div>
      <button
        onClick={() => salvar("FINALIZADA")}
        disabled={saving || !form.clienteNome.trim()}
        style={{ width: "100%", marginTop: 10, background: form.clienteNome.trim() ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "13px 0", color: form.clienteNome.trim() ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, textTransform: "uppercase", cursor: "pointer" }}
      >
        {saving ? "Salvando..." : "Finalizar OS"}
      </button>
    </div>
  );
}

function osPDF(os) {
  const win = window.open("", "_blank");
  if (!win) return;
  const { header, footer } = pdfCabecalhoRodape(LOGO_DATA_URI);
  const valor = (v) => `R$ ${(Number(v) || 0).toFixed(2)}`;
  const card = (titulo, conteudo) =>
    conteudo ? `<div class="pdf-card"><h4>${titulo}</h4>${conteudo}</div>` : "";

  win.document.write(`
    <html><head><title>OS ${os.numero} — ALLA SERVICE</title>
    <style>${PDF_ESTILO_PREMIUM}</style></head><body>
      <div class="pdf-page">
        ${header}
        <div class="pdf-meta">
          <div><b>OS nº</b> ${os.numero}</div>
          <div><b>Abertura</b> ${new Date(os.createdAt).toLocaleDateString("pt-BR")}</div>
          <div><b>Conclusão</b> ${os.finalizedAt ? new Date(os.finalizedAt).toLocaleDateString("pt-BR") : "-"}</div>
          <div><b>Status</b> ${os.status || "-"}</div>
        </div>
        <div class="pdf-doctitle">Ordem de Serviço</div>
        <div class="pdf-body">
          ${card("Dados do cliente", `
            <div>${os.clienteNome || "-"}${os.clienteDocumento ? ` · ${os.clienteDocumento}` : ""}</div>
            <div>${os.clienteTelefone || "-"}</div>
            <div>${os.clienteEndereco || "-"}</div>`)}

          ${[os.eqTipo, os.eqMarca, os.eqModelo, os.eqBtus, os.eqSerie].some(Boolean)
            ? card("Equipamento", `
                <div>${[os.eqTipo, os.eqMarca, os.eqModelo].filter(Boolean).join(" ") || "-"}</div>
                ${os.eqBtus ? `<div>Capacidade: ${os.eqBtus} BTUs</div>` : ""}
                ${os.eqSerie ? `<div>Nº de série: ${os.eqSerie}</div>` : ""}`)
            : ""}

          ${card("Atendimento", `
            <div><b>Tipo de serviço:</b> ${os.tipoServico || "-"}</div>
            <div><b>Técnico responsável:</b> ${os.tecnico || "-"}</div>
            <div><b>Data:</b> ${os.data ? new Date(os.data).toLocaleDateString("pt-BR") : "-"}${os.horaEntrada ? ` · Início ${os.horaEntrada}` : ""}${os.horaSaida ? ` · Término ${os.horaSaida}` : ""}</div>`)}

          ${[os.problemaRelatado, os.diagnostico, os.procedimentosRealizados].some(Boolean)
            ? card("Diagnóstico técnico", `
                ${os.problemaRelatado ? `<div><b>Problema relatado:</b> ${os.problemaRelatado}</div>` : ""}
                ${os.diagnostico ? `<div style="margin-top:6px"><b>Diagnóstico:</b> ${os.diagnostico}</div>` : ""}
                ${os.procedimentosRealizados ? `<div style="margin-top:6px"><b>Serviços executados:</b> ${String(os.procedimentosRealizados).replace(/\n/g, "<br/>")}</div>` : ""}`)
            : ""}

          ${os.materiaisUtilizados || os.pecasUtilizadas
            ? card("Materiais e peças", `
                ${os.materiaisUtilizados ? `<div><b>Materiais:</b> ${os.materiaisUtilizados}</div>` : ""}
                ${os.pecasUtilizadas ? `<div><b>Peças:</b> ${os.pecasUtilizadas}</div>` : ""}`)
            : ""}

          ${card("Resumo financeiro", `
            <div>Mão de obra: ${valor(os.maoDeObra)}</div>
            <div>Materiais: ${valor(os.materiais)}</div>
            <div>Peças: ${valor(os.pecas)}</div>
            <div>Deslocamento: ${valor(os.deslocamento)}</div>
            ${Number(os.desconto) ? `<div>Desconto: - ${valor(os.desconto)}</div>` : ""}`)}

          <div class="pdf-total">
            <span>Valor total</span>
            <b>${valor(os.valorTotal)}</b>
          </div>

          ${os.observacoes ? card("Observações técnicas", String(os.observacoes).replace(/\n/g, "<br/>")) : ""}

          <div class="pdf-sig-row">
            <div class="pdf-sig">
              ${os.assinatura ? `<img src="${os.assinatura}" style="max-height:52px;display:block;margin:0 auto 4px" />` : ""}
              Assinatura do cliente
            </div>
            <div class="pdf-sig">Assinatura do técnico${os.tecnico ? `<br/><span style="font-size:10px">${os.tecnico}</span>` : ""}</div>
          </div>
        </div>
        ${footer}
      </div>
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function osWhatsapp(os) {
  const linhas = [
    `*ALLA SERVICE — OS ${os.numero}*`,
    `Cliente: ${os.clienteNome}`,
    `Serviço: ${os.tipoServico}`,
    `Status: ${os.status}`,
    `Técnico: ${os.tecnico || "-"} · Data: ${new Date(os.data).toLocaleDateString("pt-BR")}`,
    `*Valor total: R$ ${Number(os.valorTotal || 0).toFixed(2)}*`,
  ];
  const texto = encodeURIComponent(linhas.join("\n"));
  const telefone = (os.clienteTelefone || "").replace(/\D/g, "");
  const url = telefone ? `https://wa.me/55${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`;
  window.open(url, "_blank");
}

function OrdensServicoModule() {
  const [mode, setMode] = useState("lista"); // lista | novo | detalhe
  const [lista, setLista] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await window.storage.list("ordens-servico:");
      if (!list || !list.keys || !list.keys.length) return setLista([]);
      const items = [];
      for (const key of list.keys) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) items.push(JSON.parse(r.value));
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setLista(items);
    } catch {
      setLista([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id) => {
    try {
      await window.storage.delete(`ordens-servico:${id}`).catch(() => {});
      setSelected(null);
      setMode("lista");
      load();
    } catch (err) {
      console.error("Erro em remove", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  const duplicar = async (os) => {
    try {
      const { id, numero, createdAt, finalizedAt, receitaGerada, ...rest } = os;
      const newId = uid();
      const newNumero = await proximoNumero("OS", "ordens-servico:");
      const novaOS = { ...rest, id: newId, numero: newNumero, status: "ABERTA", createdAt: new Date().toISOString(), finalizedAt: null, receitaGerada: false };
      await window.storage.set(`ordens-servico:${newId}`, JSON.stringify(novaOS));
      load();
    } catch (err) {
      console.error("Erro em duplicar", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  if (mode === "novo") {
    return (
      <OSForm
        editingOS={selected && selected.editing ? selected : null}
        onCancel={() => {
          setSelected(null);
          setMode("lista");
        }}
        onDone={() => {
          setSelected(null);
          setMode("lista");
          load();
        }}
      />
    );
  }

  if (mode === "detalhe" && selected) {
    const os = selected;
    const cor = OS_STATUS_COLOR[os.status] || "#8A8A90";
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setMode("lista")} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar à lista
        </button>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#C9A24B" }}>{os.numero}</div>
        <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 19, fontWeight: 600, color: "#F3F3F1", marginBottom: 8 }}>{os.clienteNome}</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#141416", border: `1px solid ${cor}55`, borderRadius: 20, padding: "5px 12px", marginBottom: 16 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: cor }} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: cor, letterSpacing: 1 }}>{os.status}</span>
        </div>

        <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          {[
            ["Equipamento", `${os.eqTipo || "-"} ${os.eqMarca || ""} ${os.eqModelo || ""}`],
            ["Serviço", os.tipoServico],
            ["Técnico", os.tecnico || "-"],
            ["Data", new Date(os.data).toLocaleDateString("pt-BR")],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "#8A8A90", fontSize: 12.5 }}>{label}</span>
              <span style={{ color: "#F3F3F1", fontSize: 12.5 }}>{val}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#F3F3F1", fontSize: 14, fontWeight: 600 }}>Valor total</span>
            <span style={{ color: "#E9C878", fontSize: 18, fontWeight: 700 }}>R$ {Number(os.valorTotal || 0).toFixed(2)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button onClick={() => osWhatsapp(os)} style={{ flex: 1, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            <Send size={13} /> WhatsApp
          </button>
          <button onClick={() => osPDF(os)} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            <FileText size={13} /> PDF
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button
            onClick={() => {
              setSelected({ ...os, editing: true });
              setMode("novo");
            }}
            style={{ flex: 1, background: "#1C1C1F", border: "1px solid #C9A24B", borderRadius: 12, padding: "12px 0", color: "#E9C878", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}
          >
            Editar
          </button>
          <button onClick={() => duplicar(os)} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            Duplicar
          </button>
        </div>
        <button onClick={() => remove(os.id)} style={{ width: "100%", background: "rgba(240,96,90,0.1)", border: "1px solid rgba(240,96,90,0.4)", borderRadius: 12, padding: "12px 0", color: "#F0605A", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Excluir OS
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button
        onClick={() => {
          setSelected(null);
          setMode("novo");
        }}
        style={{ width: "100%", background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer", marginBottom: 16 }}
      >
        <Plus size={16} /> Nova Ordem de Serviço
      </button>

      {lista === null ? (
        <div style={{ textAlign: "center", padding: 30 }}>
          <Loader2 size={20} className="spin" />
        </div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73" }}>
          <Wrench size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>Nenhuma OS cadastrada ainda.</div>
        </div>
      ) : (
        lista.map((os) => {
          const cor = OS_STATUS_COLOR[os.status] || "#8A8A90";
          return (
            <button
              key={os.id}
              onClick={() => {
                setSelected(os);
                setMode("detalhe");
              }}
              style={{ width: "100%", textAlign: "left", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", marginBottom: 10, cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1" }}>{os.clienteNome}</div>
                  <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>
                    {os.numero} · {os.eqTipo || "Equipamento"} · {os.tipoServico}
                  </div>
                </div>
                <span style={{ color: "#E9C878", fontSize: 13.5, fontWeight: 700 }}>R$ {Number(os.valorTotal || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: cor }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: cor }}>{os.status}</span>
                <span style={{ fontSize: 10.5, color: "#6E6E73", marginLeft: "auto" }}>{new Date(os.data).toLocaleDateString("pt-BR")}</span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

/* ---------------- Módulo: Financeiro ---------------- */
const DESPESA_CATEGORIAS = ["Material", "Peças", "Combustível", "Ferramentas", "Aluguel", "Energia", "Internet", "Funcionários", "Outros"];
const FIN_FILTROS = ["Hoje", "Esta semana", "Este mês", "Mês anterior", "Este ano", "Personalizado"];

function dentroDoFiltro(dataStr, filtro, custom) {
  const d = new Date(dataStr);
  const hoje = new Date();
  const startOfDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  if (filtro === "Hoje") {
    return startOfDay(d).getTime() === startOfDay(hoje).getTime();
  }
  if (filtro === "Esta semana") {
    const start = new Date(hoje);
    start.setDate(hoje.getDate() - hoje.getDay());
    return d >= startOfDay(start) && d <= hoje;
  }
  if (filtro === "Este mês") {
    return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
  }
  if (filtro === "Mês anterior") {
    const m = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
  }
  if (filtro === "Este ano") {
    return d.getFullYear() === hoje.getFullYear();
  }
  if (filtro === "Personalizado" && custom && custom.inicio && custom.fim) {
    return d >= new Date(custom.inicio) && d <= new Date(custom.fim + "T23:59:59");
  }
  return true;
}

/* ---------------- Financeiro — helpers de período e comparação ---------------- */
function getPeriodBounds(filtro, custom) {
  const hoje = new Date();
  const startOfDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const endOfDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 23, 59, 59, 999);
  if (filtro === "Hoje") return { start: startOfDay(hoje), end: endOfDay(hoje) };
  if (filtro === "Esta semana") {
    const start = new Date(hoje);
    start.setDate(hoje.getDate() - hoje.getDay());
    return { start: startOfDay(start), end: endOfDay(hoje) };
  }
  if (filtro === "Este mês") {
    return { start: new Date(hoje.getFullYear(), hoje.getMonth(), 1), end: endOfDay(hoje) };
  }
  if (filtro === "Mês anterior") {
    const start = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const end = new Date(hoje.getFullYear(), hoje.getMonth(), 0, 23, 59, 59, 999);
    return { start, end };
  }
  if (filtro === "Este ano") {
    return { start: new Date(hoje.getFullYear(), 0, 1), end: endOfDay(hoje) };
  }
  if (filtro === "Personalizado" && custom && custom.inicio && custom.fim) {
    return { start: new Date(custom.inicio), end: new Date(custom.fim + "T23:59:59") };
  }
  return { start: new Date(2000, 0, 1), end: endOfDay(hoje) };
}

function getPreviousPeriodBounds(filtro, custom) {
  const { start, end } = getPeriodBounds(filtro, custom);
  const diffMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - diffMs);
  return { start: prevStart, end: prevEnd };
}

function dentroDoIntervalo(dataStr, bounds) {
  const d = new Date(dataStr);
  return d >= bounds.start && d <= bounds.end;
}

function variacaoPercentual(atual, anterior) {
  if (!anterior) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

function agruparSerieTemporal(receitas, despesas, bounds) {
  const diffDias = Math.max(1, Math.ceil((bounds.end - bounds.start) / (1000 * 60 * 60 * 24)));
  const porMes = diffDias > 45;
  const chave = (dataStr) => {
    const d = new Date(dataStr);
    return porMes
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const rotulo = (chaveStr) => {
    if (porMes) {
      const [y, m] = chaveStr.split("-");
      return `${["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"][Number(m) - 1]}`;
    }
    const [, m, d] = chaveStr.split("-");
    return `${d}/${m}`;
  };

  const buckets = {};
  const addBucket = (k) => {
    if (!buckets[k]) buckets[k] = { chave: k, receitas: 0, despesas: 0 };
    return buckets[k];
  };
  receitas.forEach((r) => {
    const k = chave(r.data);
    addBucket(k).receitas += Number(r.valor) || 0;
  });
  despesas.forEach((d) => {
    const k = chave(d.data);
    addBucket(k).despesas += Number(d.valor) || 0;
  });

  return Object.values(buckets)
    .sort((a, b) => (a.chave < b.chave ? -1 : 1))
    .map((b) => ({ ...b, label: rotulo(b.chave), lucro: b.receitas - b.despesas }));
}

/* ---------------- Financeiro — gráfico de linha/área (SVG, sem libs externas) ---------------- */
function LineAreaChart({ serie }) {
  const [ativo, setAtivo] = useState(null);
  const W = 300;
  const H = 130;
  const padL = 4;
  const padR = 4;
  const padT = 10;
  const padB = 20;

  if (!serie.length) return null;

  const maxVal = Math.max(1, ...serie.map((s) => Math.max(s.receitas, s.despesas, Math.abs(s.lucro))));
  const n = serie.length;
  const stepX = n > 1 ? (W - padL - padR) / (n - 1) : 0;
  const x = (i) => (n === 1 ? W / 2 : padL + i * stepX);
  const y = (v) => padT + (1 - v / maxVal) * (H - padT - padB);

  const pathFor = (key) =>
    n === 1
      ? ""
      : serie.map((s, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s[key]).toFixed(1)}`).join(" ");

  const areaReceitas =
    n === 1
      ? ""
      : pathFor("receitas") + ` L ${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const idxLabels = n <= 7 ? serie.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 150, overflow: "visible" }}>
        <defs>
          <linearGradient id="finAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ADE80" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#4ADE80" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaReceitas} fill="url(#finAreaGrad)" stroke="none" />
        {n === 1 && (
          <line
            x1={padL}
            x2={W - padR}
            y1={y(serie[0].receitas)}
            y2={y(serie[0].receitas)}
            stroke="#4ADE80"
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.35"
          />
        )}
        <path d={pathFor("despesas")} fill="none" stroke="#F0605A" strokeWidth="1.6" opacity="0.85" />
        <path d={pathFor("receitas")} fill="none" stroke="#4ADE80" strokeWidth="1.8" />
        <path d={pathFor("lucro")} fill="none" stroke="#E9C878" strokeWidth="1.6" strokeDasharray="3 2" opacity="0.9" />
        {serie.map((s, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(s.receitas)}
            r={ativo === i ? 3.4 : 2.2}
            fill="#4ADE80"
            style={{ cursor: "pointer" }}
            onClick={() => setAtivo(ativo === i ? null : i)}
          />
        ))}
        {idxLabels.map((i) => (
          <text key={i} x={x(i)} y={H - 4} fontSize="7" fill="#6E6E73" textAnchor="middle">
            {serie[i].label}
          </text>
        ))}
      </svg>
      {ativo !== null && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            background: "#1C1C1F",
            border: "1px solid rgba(201,162,75,0.35)",
            borderRadius: 10,
            padding: "8px 11px",
            fontSize: 11,
            color: "#D0D0CE",
            lineHeight: 1.6,
            pointerEvents: "none",
          }}
        >
          <div style={{ color: "#8A8A90", fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {serie[ativo].label}
          </div>
          <div style={{ color: "#4ADE80" }}>Receitas: R$ {serie[ativo].receitas.toFixed(2)}</div>
          <div style={{ color: "#F0605A" }}>Despesas: R$ {serie[ativo].despesas.toFixed(2)}</div>
          <div style={{ color: "#E9C878" }}>Lucro: R$ {serie[ativo].lucro.toFixed(2)}</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 14, marginTop: 6, fontSize: 9.5, color: "#8A8A90" }}>
        <span><span style={{ color: "#4ADE80" }}>●</span> Receitas</span>
        <span><span style={{ color: "#F0605A" }}>●</span> Despesas</span>
        <span><span style={{ color: "#E9C878" }}>●</span> Lucro</span>
      </div>
    </div>
  );
}

/* ---------------- Financeiro — donut de despesas por categoria (SVG) ---------------- */
const DONUT_CORES = ["#C9A24B", "#4681DF", "#E07A30", "#4ADE80", "#F0605A", "#9B8AFB", "#3FBCD1"];

function DonutChart({ dados }) {
  const total = dados.reduce((a, d) => a + d.valor, 0);
  if (total <= 0) return null;
  const R = 40;
  const CX = 50;
  const CY = 50;
  const circunf = 2 * Math.PI * R;
  let acumulado = 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <svg viewBox="0 0 100 100" style={{ width: 110, height: 110, flexShrink: 0 }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#1C1C1E" strokeWidth="14" />
        {dados.map((d, i) => {
          const frac = d.valor / total;
          const dash = frac * circunf;
          const offset = circunf - acumulado * circunf;
          acumulado += frac;
          return (
            <circle
              key={d.categoria}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={DONUT_CORES[i % DONUT_CORES.length]}
              strokeWidth="14"
              strokeDasharray={`${dash} ${circunf - dash}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${CX} ${CY})`}
            />
          );
        })}
        <text x={CX} y={CY - 2} textAnchor="middle" fontSize="11" fill="#F3F3F1" fontWeight="700">
          R$ {total.toFixed(0)}
        </text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="6.5" fill="#8A8A90">
          total
        </text>
      </svg>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
        {dados.map((d, i) => (
          <div key={d.categoria} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: DONUT_CORES[i % DONUT_CORES.length],
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11.5, color: "#C7C9CE", flex: 1 }}>{d.categoria}</span>
            <span style={{ fontSize: 11, color: "#8A8A90" }}>{((d.valor / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniBarChart({ data, colorPos = "#4ADE80", colorNeg = "#F0605A" }) {
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90, marginTop: 8 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: "100%",
              height: Math.max(3, (Math.abs(d.value) / max) * 70),
              background: d.value < 0 ? colorNeg : colorPos,
              borderRadius: 3,
              opacity: 0.85,
            }}
          />
          <span style={{ fontSize: 8.5, color: "#6E6E73" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function ReceitaForm({ onDone, onCancel }) {
  const [form, setForm] = useState({
    servico: "",
    cliente: "",
    data: new Date().toISOString().slice(0, 10),
    valor: "",
    formaPagamento: "PIX",
    status: "pago",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (saving) return; // impede duplo clique / registro duplicado
    setSaving(true);
    try {
      const id = uid();
      await window.storage.set(`fin-receitas:${id}`, JSON.stringify({ id, ...form, createdAt: new Date().toISOString() }));
      onDone();
    } catch (err) {
      console.error("Erro ao salvar receita", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "salvar"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <Field label="Serviço"><input style={inputStyle} value={form.servico} onChange={set("servico")} /></Field>
      <Field label="Cliente"><input style={inputStyle} value={form.cliente} onChange={set("cliente")} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Data"><input type="date" style={inputStyle} value={form.data} onChange={set("data")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Valor (R$)"><input style={inputStyle} value={form.valor} onChange={set("valor")} inputMode="decimal" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Forma de pagamento">
            <select style={{ ...inputStyle, appearance: "none" }} value={form.formaPagamento} onChange={set("formaPagamento")}>
              {FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Status">
            <select style={{ ...inputStyle, appearance: "none" }} value={form.status} onChange={set("status")}>
              <option value="pago">Recebido</option>
              <option value="pendente">A receber</option>
            </select>
          </Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>Cancelar</button>
        <button onClick={salvar} disabled={saving || !form.valor} style={{ flex: 1.4, background: form.valor && !saving ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "12px 0", color: form.valor && !saving ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: saving ? "default" : "pointer" }}>
          {saving ? "Salvando..." : "Adicionar receita"}
        </button>
      </div>
    </div>
  );
}

function DespesaForm({ onDone, onCancel }) {
  const [form, setForm] = useState({
    categoria: "Material",
    descricao: "",
    fornecedor: "",
    data: new Date().toISOString().slice(0, 10),
    valor: "",
    formaPagamento: "PIX",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (saving) return; // impede duplo clique / registro duplicado
    setSaving(true);
    try {
      const id = uid();
      await window.storage.set(`fin-despesas:${id}`, JSON.stringify({ id, ...form, createdAt: new Date().toISOString() }));
      onDone();
    } catch (err) {
      console.error("Erro ao salvar despesa", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "salvar"));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div>
      <Field label="Categoria">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.categoria} onChange={set("categoria")}>
          {DESPESA_CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Descrição"><input style={inputStyle} value={form.descricao} onChange={set("descricao")} /></Field>
      <Field label="Fornecedor"><input style={inputStyle} value={form.fornecedor} onChange={set("fornecedor")} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Data"><input type="date" style={inputStyle} value={form.data} onChange={set("data")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Valor (R$)"><input style={inputStyle} value={form.valor} onChange={set("valor")} inputMode="decimal" /></Field></div>
      </div>
      <Field label="Forma de pagamento">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.formaPagamento} onChange={set("formaPagamento")}>
          {FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>Cancelar</button>
        <button onClick={salvar} disabled={saving || !form.valor} style={{ flex: 1.4, background: form.valor && !saving ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "12px 0", color: form.valor && !saving ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: saving ? "default" : "pointer" }}>
          {saving ? "Salvando..." : "Adicionar despesa"}
        </button>
      </div>
    </div>
  );
}

function FinanceiroModule({ onBack }) {
  const [receitas, setReceitas] = useState(null);
  const [despesas, setDespesas] = useState(null);
  const [filtro, setFiltro] = useState("Este mês");
  const [custom, setCustom] = useState({ inicio: "", fim: "" });
  const [addMode, setAddMode] = useState(null); // null | 'receita' | 'despesa'
  const [verTodas, setVerTodas] = useState(false);

  const load = useCallback(async () => {
    try {
      const listR = await window.storage.list("fin-receitas:");
      const itemsR = [];
      for (const key of listR.keys || []) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) itemsR.push(JSON.parse(r.value));
      }
      setReceitas(itemsR);

      const listD = await window.storage.list("fin-despesas:");
      const itemsD = [];
      for (const key of listD.keys || []) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) itemsD.push(JSON.parse(r.value));
      }
      setDespesas(itemsD);
    } catch {
      setReceitas([]);
      setDespesas([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const marcarStatus = async (r, status) => {
    try {
      const atualizado = { ...r, status };
      await window.storage.set(`fin-receitas:${r.id}`, JSON.stringify(atualizado));
      load();
    } catch (err) {
      console.error("Erro em marcarStatus", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  const excluirReceita = async (id) => {
    await window.storage.delete(`fin-receitas:${id}`).catch(() => {});
    load();
  };
  const excluirDespesa = async (id) => {
    await window.storage.delete(`fin-despesas:${id}`).catch(() => {});
    load();
  };

  if (receitas === null || despesas === null) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
  }

  const bounds = getPeriodBounds(filtro, custom);
  const boundsAnterior = getPreviousPeriodBounds(filtro, custom);

  const receitasFiltradas = receitas.filter((r) => dentroDoIntervalo(r.data, bounds));
  const despesasFiltradas = despesas.filter((d) => dentroDoIntervalo(d.data, bounds));
  const receitasAnteriores = receitas.filter((r) => dentroDoIntervalo(r.data, boundsAnterior));
  const despesasAnteriores = despesas.filter((d) => dentroDoIntervalo(d.data, boundsAnterior));

  const faturamento = receitasFiltradas.reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const recebido = receitasFiltradas.filter((r) => r.status === "pago").reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const aReceber = receitasFiltradas.filter((r) => r.status === "pendente").reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const totalDespesas = despesasFiltradas.reduce((a, d) => a + (Number(d.valor) || 0), 0);
  const lucro = recebido - totalDespesas;
  const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;
  const ticketMedio = receitasFiltradas.length > 0 ? faturamento / receitasFiltradas.length : 0;

  const faturamentoAnterior = receitasAnteriores.reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const recebidoAnterior = receitasAnteriores.filter((r) => r.status === "pago").reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const despesasAnteriorTotal = despesasAnteriores.reduce((a, d) => a + (Number(d.valor) || 0), 0);
  const lucroAnterior = recebidoAnterior - despesasAnteriorTotal;
  const ticketMedioAnterior = receitasAnteriores.length > 0 ? faturamentoAnterior / receitasAnteriores.length : 0;

  const temDadosAnteriores = receitasAnteriores.length > 0 || despesasAnteriores.length > 0;

  const serieTempo = agruparSerieTemporal(receitasFiltradas, despesasFiltradas, bounds);

  const porCategoria = {};
  despesasFiltradas.forEach((d) => {
    const cat = d.categoria || "Outros";
    porCategoria[cat] = (porCategoria[cat] || 0) + (Number(d.valor) || 0);
  });
  const dadosCategoria = Object.entries(porCategoria)
    .map(([categoria, valor]) => ({ categoria, valor }))
    .sort((a, b) => b.valor - a.valor);

  const movimentacoes = [
    ...receitasFiltradas.map((r) => ({ ...r, tipo: "receita" })),
    ...despesasFiltradas.map((d) => ({ ...d, tipo: "despesa" })),
  ].sort((a, b) => (a.data < b.data ? 1 : -1));
  const movimentacoesVisiveis = verTodas ? movimentacoes : movimentacoes.slice(0, 6);

  const cards = [
    { label: "Faturamento", valor: faturamento, color: "#E9C878", icon: TrendingUp },
    { label: "Recebido", valor: recebido, color: "#4ADE80", icon: CheckCircle2 },
    { label: "A Receber", valor: aReceber, color: "#4681DF", icon: Clock },
    { label: "Despesas", valor: totalDespesas, color: "#F0605A", icon: TrendingDown },
  ];

  const comparativos = [
    { label: "Faturamento", atual: faturamento, anterior: faturamentoAnterior },
    { label: "Despesas", atual: totalDespesas, anterior: despesasAnteriorTotal },
    { label: "Lucro", atual: lucro, anterior: lucroAnterior },
    { label: "Ticket médio", atual: ticketMedio, anterior: ticketMedioAnterior },
  ];

  if (addMode) {
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setAddMode(null)} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar
        </button>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
          {addMode === "receita" ? "Nova receita" : "Nova despesa"}
        </div>
        {addMode === "receita" ? (
          <ReceitaForm onCancel={() => setAddMode(null)} onDone={() => { setAddMode(null); load(); }} />
        ) : (
          <DespesaForm onCancel={() => setAddMode(null)} onDone={() => { setAddMode(null); load(); }} />
        )}
      </div>
    );
  }

  return (
    <div>
      {/* cabeçalho compacto proprio desta tela */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px" }}>
        <button
          onClick={onBack}
          aria-label="Voltar"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: "#111111",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#C9A24B",
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={17} />
        </button>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 21, color: "#F5F5F3", letterSpacing: 0.3 }}>
            Financeiro
          </div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#7A7A7A", letterSpacing: 2, textTransform: "uppercase", marginTop: 1 }}>
            Alla Check
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      <div style={{ padding: "24px 20px 40px" }}>
        {/* filtros */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 24 }}>
          {FIN_FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                flexShrink: 0,
                fontSize: 11.5,
                padding: "7px 12px",
                borderRadius: 20,
                border: `1px solid ${filtro === f ? "#C9A24B" : "#2A2A2E"}`,
                background: filtro === f ? "rgba(201,162,75,0.15)" : "transparent",
                color: filtro === f ? "#E9C878" : "#8A8A90",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {filtro === "Personalizado" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            <div style={{ flex: 1 }}><Field label="De"><input type="date" style={inputStyle} value={custom.inicio} onChange={(e) => setCustom((c) => ({ ...c, inicio: e.target.value }))} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Até"><input type="date" style={inputStyle} value={custom.fim} onChange={(e) => setCustom((c) => ({ ...c, fim: e.target.value }))} /></Field></div>
          </div>
        )}

        {/* cards financeiros */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 13, marginBottom: 16 }}>
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                style={{
                  background: "#111111",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 16,
                  padding: "16px 16px 15px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.02)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#87878C", letterSpacing: 1, textTransform: "uppercase" }}>
                    {c.label}
                  </span>
                  <Icon size={13} color={c.color} strokeWidth={2} style={{ opacity: 0.85 }} />
                </div>
                <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 25, lineHeight: 1.05, color: c.color, whiteSpace: "nowrap" }}>
                  R$ {c.valor.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>

        {/* lucro liquido + margem — bloco de destaque */}
        <div
          style={{
            background: lucro >= 0 ? "linear-gradient(135deg,#151c15,#0d130d)" : "linear-gradient(135deg,#1c1515,#130d0d)",
            border: `1px solid ${lucro >= 0 ? "rgba(74,222,128,0.25)" : "rgba(240,96,90,0.25)"}`,
            borderRadius: 16,
            padding: "18px 18px",
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#87878C", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Lucro líquido
            </div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 28, color: lucro >= 0 ? "#4ADE80" : "#F0605A" }}>
              R$ {lucro.toFixed(2)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#87878C", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>
              Margem
            </div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 22, color: lucro >= 0 ? "#4ADE80" : "#F0605A" }}>
              {margem.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* desempenho financeiro — grafico principal */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: "#F0F0EE", letterSpacing: 1.5, textTransform: "uppercase" }}>
            Desempenho financeiro
          </div>
          <div style={{ fontSize: 12, color: "#7A7A7A", marginTop: 3 }}>Receitas x despesas no período</div>
        </div>
        <div style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, marginBottom: 24 }}>
          {serieTempo.length > 0 ? (
            <LineAreaChart serie={serieTempo} />
          ) : (
            <div style={{ textAlign: "center", padding: "18px 10px" }}>
              <div style={{ height: 60, borderBottom: "1px dashed rgba(255,255,255,0.15)", marginBottom: 14 }} />
              <div style={{ fontSize: 12.5, color: "#7A7A7A", marginBottom: 14, lineHeight: 1.5 }}>
                Ainda não existem movimentações suficientes para gerar seu gráfico financeiro.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button
                  onClick={() => setAddMode("receita")}
                  style={{ fontSize: 11.5, padding: "9px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#C9A24B,#E9C878)", color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, cursor: "pointer" }}
                >
                  + Registrar receita
                </button>
                <button
                  onClick={() => setAddMode("despesa")}
                  style={{ fontSize: 11.5, padding: "9px 14px", borderRadius: 10, border: "1px solid #2A2A2E", background: "#1C1C1F", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, cursor: "pointer" }}
                >
                  + Registrar despesa
                </button>
              </div>
            </div>
          )}
        </div>

        {/* receitas x despesas — barras */}
        {(receitasFiltradas.length > 0 || despesasFiltradas.length > 0) && (
          <>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: "#F0F0EE", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
              Receitas x despesas
            </div>
            <div style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, marginBottom: 24 }}>
              <MiniBarChart data={[{ label: "Receitas", value: faturamento }, { label: "Despesas", value: -totalDespesas }]} />
            </div>
          </>
        )}

        {/* despesas por categoria — donut */}
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: "#F0F0EE", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
          Despesas por categoria
        </div>
        <div style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, marginBottom: 24 }}>
          {dadosCategoria.length > 0 ? (
            <DonutChart dados={dadosCategoria} />
          ) : (
            <div style={{ textAlign: "center", padding: "14px 10px", fontSize: 12.5, color: "#7A7A7A" }}>
              Nenhuma despesa registrada neste período.
            </div>
          )}
        </div>

        {/* comparativo com periodo anterior */}
        {temDadosAnteriores && (
          <>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: "#F0F0EE", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
              Comparativo com período anterior
            </div>
            <div style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, marginBottom: 24 }}>
              {comparativos.map((c, idx) => {
                const variacao = variacaoPercentual(c.atual, c.anterior);
                const positivo = variacao !== null && variacao >= 0;
                return (
                  <div
                    key={c.label}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: idx === 0 ? 0 : 10,
                      marginTop: idx === 0 ? 0 : 10,
                      borderTop: idx === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: "#C7C9CE" }}>{c.label}</span>
                    {variacao === null ? (
                      <span style={{ fontSize: 11.5, color: "#6E6E73" }}>Sem dados anteriores</span>
                    ) : (
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: positivo ? "#4ADE80" : "#F0605A", display: "flex", alignItems: "center", gap: 4 }}>
                        {positivo ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                        {Math.abs(variacao).toFixed(1)}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* botoes */}
        <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
          <button onClick={() => setAddMode("receita")} style={{ flex: 1, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
            <Plus size={15} /> Receita
          </button>
          <button onClick={() => setAddMode("despesa")} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
            <Plus size={15} /> Despesa
          </button>
        </div>

        {/* movimentacoes recentes */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: "#F0F0EE", letterSpacing: 1.5, textTransform: "uppercase" }}>
            Movimentações recentes
          </div>
          {movimentacoes.length > 6 && (
            <button onClick={() => setVerTodas((v) => !v)} style={{ background: "none", border: "none", color: "#C9A24B", fontSize: 11, cursor: "pointer" }}>
              {verTodas ? "ver menos" : "ver todas"}
            </button>
          )}
        </div>
        {movimentacoesVisiveis.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#6E6E73", fontSize: 13 }}>Nenhuma movimentação no período.</div>
        ) : (
          movimentacoesVisiveis.map((m) => {
            const Icon = m.tipo === "receita" ? TrendingUp : TrendingDown;
            const cor = m.tipo === "receita" ? "#4ADE80" : "#F0605A";
            return (
              <div key={`${m.tipo}-${m.id}`} style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "13px 14px", marginBottom: 8, display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${cor}18`, border: `1px solid ${cor}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={15} color={cor} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 13.5, color: "#F3F3F1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.tipo === "receita" ? m.servico || "Receita" : m.descricao || m.categoria}
                    </span>
                    <span style={{ color: cor, fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {m.tipo === "receita" ? "+" : "-"} R$ {Number(m.valor || 0).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#8A8A90", marginTop: 2 }}>
                    {m.tipo === "receita" ? m.cliente : m.categoria} · {new Date(m.data).toLocaleDateString("pt-BR")}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    {m.tipo === "receita" ? (
                      <button
                        onClick={() => marcarStatus(m, m.status === "pago" ? "pendente" : "pago")}
                        style={{
                          fontSize: 10,
                          padding: "4px 9px",
                          borderRadius: 6,
                          border: `1px solid ${m.status === "pago" ? "#4ADE80" : "#E9C878"}55`,
                          background: "transparent",
                          color: m.status === "pago" ? "#4ADE80" : "#E9C878",
                          cursor: "pointer",
                        }}
                      >
                        {m.status === "pago" ? "Recebido" : "Marcar como pago"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 10, color: "#6E6E73" }}>{m.formaPagamento}</span>
                    )}
                    <button
                      onClick={() => (m.tipo === "receita" ? excluirReceita(m.id) : excluirDespesa(m.id))}
                      style={{ background: "none", border: "none", color: "#F0605A", cursor: "pointer", padding: 2 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------------- Módulo: OS Frio ---------------- */
const OSFRIO_TIPOS = ["Cervejeira", "Freezer", "Câmara Fria", "Balcão Refrigerado", "Expositor Refrigerado", "Geladeira Comercial", "Ilha Congelada", "Máquina de Gelo", "Outro"];
const OSFRIO_TESTES = ["Tensão", "Corrente", "Temperatura", "Pressão", "Vazamento", "Compressor", "Ventilador", "Condensador", "Evaporador", "Controlador", "Sensores", "Dreno"];

function osFrioValorTotal(v) {
  const soma = (Number(v.maoDeObra) || 0) + (Number(v.pecas) || 0) + (Number(v.material) || 0) + (Number(v.deslocamento) || 0);
  return Math.max(0, soma - (Number(v.desconto) || 0));
}

function OSFrioForm({ editingOS, onDone, onCancel }) {
  const [form, setForm] = useState(
    editingOS || {
      clienteNome: "",
      clienteTelefone: "",
      clienteDocumento: "",
      clienteEndereco: "",
      eqTipo: "Cervejeira",
      eqMarca: "",
      eqModelo: "",
      eqSerie: "",
      capacidade: "",
      tensao: "",
      problemaRelatado: "",
      diagnostico: "",
      materiaisUtilizados: "",
      pecasUtilizadas: "",
      observacoes: "",
      maoDeObra: "0",
      pecas: "0",
      material: "0",
      deslocamento: "0",
      desconto: "0",
      status: "Aberta",
    }
  );
  const [testes, setTestes] = useState(editingOS?.testes || Object.fromEntries(OSFRIO_TESTES.map((t) => [t, false])));
  const [fotosAntes, setFotosAntes] = useState(editingOS?.fotosAntes || []);
  const [fotosDurante, setFotosDurante] = useState(editingOS?.fotosDurante || []);
  const [fotosDepois, setFotosDepois] = useState(editingOS?.fotosDepois || []);
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valorTotal = osFrioValorTotal(form);

  const salvar = async (statusOverride) => {
    setSaving(true);
    try {
      const id = form.id || uid();
      const numero = form.numero || (await proximoNumero("FRIO", "os-frio:"));
      const status = statusOverride || form.status;
      const os = {
        ...form,
        id,
        numero,
        status,
        valorTotal,
        testes,
        fotosAntes,
        fotosDurante,
        fotosDepois,
        createdAt: form.createdAt || new Date().toISOString(),
        finalizedAt: status === "Finalizada" ? new Date().toISOString() : form.finalizedAt || null,
      };
      await window.storage.set(`os-frio:${id}`, JSON.stringify(os));

      if (status === "Finalizada" && valorTotal > 0 && !form.receitaGerada) {
        const recId = uid();
        await window.storage.set(
          `fin-receitas:${recId}`,
          JSON.stringify({
            id: recId,
            servico: `OS Frio — ${form.eqTipo}`,
            cliente: form.clienteNome,
            osId: id,
            osNumero: numero,
            data: new Date().toISOString().slice(0, 10),
            valor: valorTotal,
            formaPagamento: "A definir",
            status: "pendente",
            createdAt: new Date().toISOString(),
          })
        );
        os.receitaGerada = true;
        await window.storage.set(`os-frio:${id}`, JSON.stringify(os));
      }

      onDone(os);
    } catch (err) {
      console.error("Erro ao salvar OS Frio", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Cliente</div>
      <Field label="Nome"><input style={inputStyle} value={form.clienteNome} onChange={set("clienteNome")} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Telefone"><input style={inputStyle} value={form.clienteTelefone} onChange={set("clienteTelefone")} inputMode="numeric" /></Field></div>
        <div style={{ flex: 1 }}><Field label="CPF/CNPJ"><input style={inputStyle} value={form.clienteDocumento} onChange={set("clienteDocumento")} /></Field></div>
      </div>
      <Field label="Endereço"><input style={inputStyle} value={form.clienteEndereco} onChange={set("clienteEndereco")} /></Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Equipamento</div>
      <Field label="Tipo de equipamento">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.eqTipo} onChange={set("eqTipo")}>
          {OSFRIO_TIPOS.map((t) => <option key={t}>{t}</option>)}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Marca"><input style={inputStyle} value={form.eqMarca} onChange={set("eqMarca")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Modelo"><input style={inputStyle} value={form.eqModelo} onChange={set("eqModelo")} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Número de série"><input style={inputStyle} value={form.eqSerie} onChange={set("eqSerie")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Capacidade"><input style={inputStyle} value={form.capacidade} onChange={set("capacidade")} placeholder="Ex: 300L" /></Field></div>
      </div>
      <Field label="Tensão"><input style={inputStyle} value={form.tensao} onChange={set("tensao")} placeholder="Ex: 220V" /></Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Diagnóstico</div>
      <Field label="Problema relatado">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form.problemaRelatado} onChange={set("problemaRelatado")} />
      </Field>
      <Field label="Diagnóstico">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form.diagnostico} onChange={set("diagnostico")} />
      </Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Testes realizados</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {OSFRIO_TESTES.map((t) => (
          <button
            key={t}
            onClick={() => setTestes((s) => ({ ...s, [t]: !s[t] }))}
            style={{
              fontSize: 11,
              padding: "6px 11px",
              borderRadius: 8,
              border: `1px solid ${testes[t] ? "#C9A24B" : "#2A2A2E"}`,
              background: testes[t] ? "rgba(201,162,75,0.15)" : "transparent",
              color: testes[t] ? "#E9C878" : "#8A8A90",
              cursor: "pointer",
            }}
          >
            {testes[t] ? "✓ " : ""}{t}
          </button>
        ))}
      </div>

      <Field label="Materiais utilizados">
        <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form.materiaisUtilizados} onChange={set("materiaisUtilizados")} />
      </Field>
      <Field label="Peças utilizadas">
        <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form.pecasUtilizadas} onChange={set("pecasUtilizadas")} />
      </Field>
      <Field label="Observações">
        <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form.observacoes} onChange={set("observacoes")} />
      </Field>

      <OSFotos fotos={fotosAntes} setFotos={setFotosAntes} label="Fotos antes" />
      <OSFotos fotos={fotosDurante} setFotos={setFotosDurante} label="Fotos durante" />
      <OSFotos fotos={fotosDepois} setFotos={setFotosDepois} label="Fotos depois" />

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>Valores (R$)</div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Mão de obra"><input style={inputStyle} value={form.maoDeObra} onChange={set("maoDeObra")} inputMode="decimal" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Peças"><input style={inputStyle} value={form.pecas} onChange={set("pecas")} inputMode="decimal" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Material"><input style={inputStyle} value={form.material} onChange={set("material")} inputMode="decimal" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Deslocamento"><input style={inputStyle} value={form.deslocamento} onChange={set("deslocamento")} inputMode="decimal" /></Field></div>
      </div>
      <Field label="Desconto"><input style={inputStyle} value={form.desconto} onChange={set("desconto")} inputMode="decimal" /></Field>

      <div style={{ display: "flex", justifyContent: "space-between", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", margin: "14px 0" }}>
        <span style={{ color: "#8A8A90", fontSize: 13 }}>Valor total</span>
        <span style={{ color: "#E9C878", fontSize: 16, fontWeight: 700 }}>R$ {valorTotal.toFixed(2)}</span>
      </div>

      <Field label="Status">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.status} onChange={set("status")}>
          {["Aberta", "Agendada", "Em Atendimento", "Aguardando Peça", "Finalizada", "Cancelada"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Cancelar
        </button>
        <button onClick={() => salvar()} disabled={saving || !form.clienteNome.trim()} style={{ flex: 1, background: form.clienteNome.trim() ? "#1C1C1F" : "#2A2A2E", border: "1px solid #C9A24B", borderRadius: 12, padding: "12px 0", color: "#E9C878", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Salvar
        </button>
      </div>
      <button
        onClick={() => salvar("Finalizada")}
        disabled={saving || !form.clienteNome.trim()}
        style={{ width: "100%", marginTop: 10, background: form.clienteNome.trim() ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "13px 0", color: form.clienteNome.trim() ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, textTransform: "uppercase", cursor: "pointer" }}
      >
        {saving ? "Salvando..." : "Finalizar OS Frio"}
      </button>
    </div>
  );
}

function osFrioPDF(os) {
  const win = window.open("", "_blank");
  if (!win) return;
  const testesOk = Object.entries(os.testes || {}).filter(([, v]) => v).map(([k]) => k);
  win.document.write(`
    <html><head><title>OS Frio ${os.numero} — ALLA SERVICE</title>
    <style>
      body{font-family:Arial,sans-serif;color:#111;padding:32px;max-width:700px;margin:0 auto}
      h1{font-size:20px;border-bottom:3px solid #C9A24B;padding-bottom:10px}
      .muted{color:#666;font-size:12px}
      .section{margin-top:14px;font-size:13px;line-height:1.6}
      .total{font-size:18px;font-weight:bold;text-align:right;margin-top:14px}
    </style></head><body>
      <h1>ALLA SERVICE — OS Frio ${os.numero}</h1>
      <div class="muted">Status: ${os.status} · Emitida em ${new Date(os.createdAt).toLocaleString("pt-BR")}</div>
      <div class="section"><b>Cliente:</b> ${os.clienteNome} — ${os.clienteTelefone || "-"}<br/><b>Endereço:</b> ${os.clienteEndereco || "-"}</div>
      <div class="section"><b>Equipamento:</b> ${os.eqTipo} ${os.eqMarca || ""} ${os.eqModelo || ""} · ${os.capacidade || "-"} · ${os.tensao || "-"}</div>
      <div class="section"><b>Problema:</b> ${os.problemaRelatado || "-"}<br/><b>Diagnóstico:</b> ${os.diagnostico || "-"}</div>
      <div class="section"><b>Testes realizados:</b> ${testesOk.length ? testesOk.join(", ") : "-"}</div>
      <div class="total">Valor total: R$ ${Number(os.valorTotal || 0).toFixed(2)}</div>
    </body></html>
  `);
  win.document.close();
  win.focus();
  win.print();
}

function osFrioWhatsapp(os) {
  const texto = encodeURIComponent(
    `*ALLA SERVICE — OS Frio ${os.numero}*\nCliente: ${os.clienteNome}\nEquipamento: ${os.eqTipo}\nStatus: ${os.status}\n*Valor total: R$ ${Number(os.valorTotal || 0).toFixed(2)}*`
  );
  const telefone = (os.clienteTelefone || "").replace(/\D/g, "");
  window.open(telefone ? `https://wa.me/55${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`, "_blank");
}

const OSFRIO_STATUS_COLOR = {
  Aberta: "#8A8A90",
  Agendada: "#4681DF",
  "Em Atendimento": "#E9C878",
  "Aguardando Peça": "#E07A30",
  Finalizada: "#4ADE80",
  Cancelada: "#F0605A",
};

function OSFrioModule() {
  const [mode, setMode] = useState("lista");
  const [lista, setLista] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await window.storage.list("os-frio:");
      if (!list || !list.keys || !list.keys.length) return setLista([]);
      const items = [];
      for (const key of list.keys) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) items.push(JSON.parse(r.value));
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setLista(items);
    } catch {
      setLista([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id) => {
    try {
      await window.storage.delete(`os-frio:${id}`).catch(() => {});
      setSelected(null);
      setMode("lista");
      load();
    } catch (err) {
      console.error("Erro em remove", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  const duplicar = async (os) => {
    try {
      const { id, numero, createdAt, finalizedAt, receitaGerada, ...rest } = os;
      const newId = uid();
      const newNumero = await proximoNumero("FRIO", "os-frio:");
      await window.storage.set(`os-frio:${newId}`, JSON.stringify({ ...rest, id: newId, numero: newNumero, status: "Aberta", createdAt: new Date().toISOString(), finalizedAt: null, receitaGerada: false }));
      load();
    } catch (err) {
      console.error("Erro em duplicar", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "operação"));
    }
  };

  if (mode === "novo") {
    return (
      <OSFrioForm
        editingOS={selected?.editing ? selected : null}
        onCancel={() => { setSelected(null); setMode("lista"); }}
        onDone={() => { setSelected(null); setMode("lista"); load(); }}
      />
    );
  }

  if (mode === "detalhe" && selected) {
    const os = selected;
    const cor = OSFRIO_STATUS_COLOR[os.status] || "#8A8A90";
    const testesOk = Object.entries(os.testes || {}).filter(([, v]) => v).map(([k]) => k);
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setMode("lista")} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar à lista
        </button>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#C9A24B" }}>{os.numero}</div>
        <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 19, fontWeight: 600, color: "#F3F3F1", marginBottom: 8 }}>{os.clienteNome}</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#141416", border: `1px solid ${cor}55`, borderRadius: 20, padding: "5px 12px", marginBottom: 16 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: cor }} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: cor, letterSpacing: 1 }}>{os.status}</span>
        </div>
        <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          {[
            ["Equipamento", `${os.eqTipo} ${os.eqMarca || ""} ${os.eqModelo || ""}`],
            ["Capacidade / Tensão", `${os.capacidade || "-"} / ${os.tensao || "-"}`],
            ["Testes realizados", testesOk.length ? testesOk.join(", ") : "-"],
          ].map(([label, val]) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: "#8A8A90", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: 12.5, color: "#F3F3F1" }}>{val}</div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#F3F3F1", fontSize: 14, fontWeight: 600 }}>Valor total</span>
            <span style={{ color: "#E9C878", fontSize: 18, fontWeight: 700 }}>R$ {Number(os.valorTotal || 0).toFixed(2)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button onClick={() => osFrioWhatsapp(os)} style={{ flex: 1, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            <Send size={13} /> WhatsApp
          </button>
          <button onClick={() => osFrioPDF(os)} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            <FileText size={13} /> PDF
          </button>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button onClick={() => { setSelected({ ...os, editing: true }); setMode("novo"); }} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #C9A24B", borderRadius: 12, padding: "12px 0", color: "#E9C878", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            Editar
          </button>
          <button onClick={() => duplicar(os)} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
            Duplicar
          </button>
        </div>
        <button onClick={() => remove(os.id)} style={{ width: "100%", background: "rgba(240,96,90,0.1)", border: "1px solid rgba(240,96,90,0.4)", borderRadius: 12, padding: "12px 0", color: "#F0605A", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Excluir
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button
        onClick={() => { setSelected(null); setMode("novo"); }}
        style={{ width: "100%", background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer", marginBottom: 16 }}
      >
        <Plus size={16} /> Nova OS Frio
      </button>
      {lista === null ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={20} className="spin" /></div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73" }}>
          <Snowflake size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>Nenhuma OS Frio cadastrada ainda.</div>
        </div>
      ) : (
        lista.map((os) => {
          const cor = OSFRIO_STATUS_COLOR[os.status] || "#8A8A90";
          return (
            <button
              key={os.id}
              onClick={() => { setSelected(os); setMode("detalhe"); }}
              style={{ width: "100%", textAlign: "left", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", marginBottom: 10, cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1" }}>{os.clienteNome}</div>
                  <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>{os.numero} · {os.eqTipo}</div>
                </div>
                <span style={{ color: "#E9C878", fontSize: 13.5, fontWeight: 700 }}>R$ {Number(os.valorTotal || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: cor }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: cor }}>{os.status}</span>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

/* ---------------- Módulo: Central WhatsApp ---------------- */
const WHATSAPP_MODELOS = [
  { key: "agendamento", nome: "Agendamento", texto: "Olá, {cliente}! Seu atendimento da ALLA SERVICE está agendado para {data} às {horario}." },
  { key: "confirmacao", nome: "Confirmação", texto: "Olá, {cliente}! Gostaríamos de confirmar seu atendimento marcado para {data} às {horario}." },
  { key: "orcamento", nome: "Orçamento", texto: "Olá, {cliente}! Seu orçamento está pronto, no valor de R$ {valor}. Referente à OS {os}." },
  { key: "concluido", nome: "Serviço Concluído", texto: "Olá, {cliente}! Seu serviço foi concluído com sucesso. Qualquer dúvida, estamos à disposição." },
  { key: "pos-venda", nome: "Pós-venda", texto: "Olá, {cliente}! Gostaríamos de saber como foi seu atendimento com a ALLA SERVICE." },
  { key: "avaliacao", nome: "Avaliação", texto: "Olá, {cliente}! Se puder, deixe sua avaliação sobre o serviço realizado. Isso nos ajuda muito!" },
  { key: "cobranca", nome: "Cobrança", texto: "Olá, {cliente}! Estamos entrando em contato referente ao pagamento pendente no valor de R$ {valor}." },
];

function preencherModelo(texto, vars) {
  return texto
    .replace(/\{cliente\}/g, vars.cliente || "[cliente]")
    .replace(/\{data\}/g, vars.data ? new Date(vars.data).toLocaleDateString("pt-BR") : "[data]")
    .replace(/\{horario\}/g, vars.horario || "[horário]")
    .replace(/\{valor\}/g, vars.valor ? Number(vars.valor).toFixed(2) : "[valor]")
    .replace(/\{os\}/g, vars.os || "[nº OS]")
    .replace(/\{servico\}/g, vars.servico || "[serviço]");
}

/* Agrega clientes reais já cadastrados em outros módulos do sistema — não inventa nomes. */
async function buscarClientesReais() {
  const fontes = [
    { prefix: "ordens-servico:", nomeKey: "clienteNome", telKey: "clienteTelefone" },
    { prefix: "os-frio:", nomeKey: "clienteNome", telKey: "clienteTelefone" },
    { prefix: "orcamentos:", nomeKey: "nome", telKey: "telefone" },
    { prefix: "recibos:", nomeKey: "clienteNome", telKey: "telefone" },
    { prefix: "pmocs:", nomeKey: "clienteNome", telKey: "telefone" },
  ];
  const mapa = new Map();
  for (const fonte of fontes) {
    try {
      const list = await window.storage.list(fonte.prefix);
      for (const key of list.keys || []) {
        const r = await window.storage.get(key).catch(() => null);
        if (!r) continue;
        const obj = JSON.parse(r.value);
        const nome = obj[fonte.nomeKey];
        if (nome && nome.trim() && !mapa.has(nome)) {
          mapa.set(nome, { nome, telefone: obj[fonte.telKey] || "" });
        }
      }
    } catch {
      /* fonte indisponível, segue */
    }
  }
  return [...mapa.values()];
}

function CentralWhatsApp() {
  const [aba, setAba] = useState("modelos"); // modelos | enviar
  const [modeloSelecionado, setModeloSelecionado] = useState(null);
  const [clientes, setClientes] = useState(null);
  const [vars, setVars] = useState({ cliente: "", telefone: "", data: "", horario: "", valor: "", os: "", servico: "" });
  const [textoFinal, setTextoFinal] = useState("");

  useEffect(() => {
    buscarClientesReais().then(setClientes);
  }, []);

  const abrirModelo = (modelo) => {
    setModeloSelecionado(modelo);
    setTextoFinal(preencherModelo(modelo.texto, vars));
    setAba("enviar");
  };

  useEffect(() => {
    if (modeloSelecionado) setTextoFinal(preencherModelo(modeloSelecionado.texto, vars));
    // eslint-disable-next-line
  }, [vars]);

  const selecionarCliente = (c) => {
    setVars((v) => ({ ...v, cliente: c.nome, telefone: c.telefone }));
  };

  const enviarWhatsapp = () => {
    const texto = encodeURIComponent(textoFinal);
    const telefone = (vars.telefone || "").replace(/\D/g, "");
    const url = telefone ? `https://wa.me/55${telefone}?text=${texto}` : `https://wa.me/?text=${texto}`;
    window.open(url, "_blank");
    // Importante: isto apenas ABRE o WhatsApp com a mensagem pronta — não há
    // integração com WhatsApp Business API configurada, então não marcamos
    // a mensagem como "enviada" automaticamente.
  };

  if (aba === "enviar" && modeloSelecionado) {
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setAba("modelos")} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> modelos
        </button>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
          {modeloSelecionado.nome}
        </div>

        {clientes && clientes.length > 0 && (
          <Field label="Selecionar cliente cadastrado (opcional)">
            <select
              style={{ ...inputStyle, appearance: "none" }}
              value=""
              onChange={(e) => {
                const c = clientes.find((x) => x.nome === e.target.value);
                if (c) selecionarCliente(c);
              }}
            >
              <option value="">Escolher...</option>
              {clientes.map((c) => (
                <option key={c.nome} value={c.nome}>{c.nome}</option>
              ))}
            </select>
          </Field>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="Cliente"><input style={inputStyle} value={vars.cliente} onChange={(e) => setVars((v) => ({ ...v, cliente: e.target.value }))} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Telefone (WhatsApp)"><input style={inputStyle} value={vars.telefone} onChange={(e) => setVars((v) => ({ ...v, telefone: e.target.value }))} inputMode="numeric" placeholder="15999999999" /></Field></div>
        </div>
        {modeloSelecionado.texto.includes("{data}") && (
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Data"><input type="date" style={inputStyle} value={vars.data} onChange={(e) => setVars((v) => ({ ...v, data: e.target.value }))} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Horário"><input type="time" style={inputStyle} value={vars.horario} onChange={(e) => setVars((v) => ({ ...v, horario: e.target.value }))} /></Field></div>
          </div>
        )}
        {modeloSelecionado.texto.includes("{valor}") && (
          <Field label="Valor (R$)"><input style={inputStyle} value={vars.valor} onChange={(e) => setVars((v) => ({ ...v, valor: e.target.value }))} inputMode="decimal" /></Field>
        )}
        {modeloSelecionado.texto.includes("{os}") && (
          <Field label="Nº da OS"><input style={inputStyle} value={vars.os} onChange={(e) => setVars((v) => ({ ...v, os: e.target.value }))} /></Field>
        )}

        <Field label="Mensagem (editável)">
          <textarea style={{ ...inputStyle, minHeight: 110, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={textoFinal} onChange={(e) => setTextoFinal(e.target.value)} />
        </Field>

        <button
          onClick={enviarWhatsapp}
          style={{ width: "100%", background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer" }}
        >
          <Send size={15} /> Abrir no WhatsApp
        </button>
        <div style={{ textAlign: "center", fontSize: 10.5, color: "#6E6E73", marginTop: 8 }}>
          Isso abre o WhatsApp do aparelho com a mensagem pronta — não há envio automático configurado.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontSize: 12.5, color: "#8A8A90", marginBottom: 16 }}>
        Escolha um modelo de mensagem. Os dados são preenchidos com informações reais do sistema.
      </div>
      {WHATSAPP_MODELOS.map((m) => (
        <button
          key={m.key}
          onClick={() => abrirModelo(m)}
          style={{ width: "100%", textAlign: "left", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "14px 15px", marginBottom: 10, cursor: "pointer" }}
        >
          <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1", marginBottom: 4 }}>{m.nome}</div>
          <div style={{ fontSize: 11.5, color: "#7A7A7A", lineHeight: 1.4 }}>{m.texto}</div>
        </button>
      ))}
    </div>
  );
}

/* ---------------- Módulo: Gestão Inteligente ---------------- */
async function carregarTudoStorage(prefix) {
  try {
    const list = await window.storage.list(prefix);
    const items = [];
    for (const key of list.keys || []) {
      const r = await window.storage.get(key).catch(() => null);
      if (r) items.push(JSON.parse(r.value));
    }
    return items;
  } catch {
    return [];
  }
}

function diasDesde(dataStr) {
  if (!dataStr) return Infinity;
  return Math.floor((new Date() - new Date(dataStr)) / (1000 * 60 * 60 * 24));
}

function GestaoInteligente({ onBack }) {
  const [dados, setDados] = useState(null);
  const [filtro, setFiltro] = useState("Este mês");
  const [custom, setCustom] = useState({ inicio: "", fim: "" });

  const load = useCallback(async () => {
    const [orcamentos, ordensServico, osFrio, receitas, despesas, pmocs] = await Promise.all([
      carregarTudoStorage("orcamentos:"),
      carregarTudoStorage("ordens-servico:"),
      carregarTudoStorage("os-frio:"),
      carregarTudoStorage("fin-receitas:"),
      carregarTudoStorage("fin-despesas:"),
      carregarTudoStorage("pmocs:"),
    ]);
    setDados({ orcamentos, ordensServico, osFrio, receitas, despesas, pmocs });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!dados) {
    return (
      <div style={{ textAlign: "center", padding: 40 }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
  }

  const { orcamentos, ordensServico, osFrio, receitas, despesas, pmocs } = dados;
  const todasOS = [...ordensServico, ...osFrio];

  const receitasPeriodo = receitas.filter((r) => dentroDoFiltro(r.data, filtro, custom));
  const despesasPeriodo = despesas.filter((d) => dentroDoFiltro(d.data, filtro, custom));
  const faturamento = receitasPeriodo.reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const totalDespesas = despesasPeriodo.reduce((a, d) => a + (Number(d.valor) || 0), 0);
  const recebido = receitasPeriodo.filter((r) => r.status === "pago").reduce((a, r) => a + (Number(r.valor) || 0), 0);
  const lucro = recebido - totalDespesas;

  const osAbertas = todasOS.filter((o) => o.status !== "FINALIZADA" && o.status !== "Finalizada" && o.status !== "CANCELADA" && o.status !== "Cancelada").length;
  const osFinalizadas = todasOS.filter((o) => o.status === "FINALIZADA" || o.status === "Finalizada").length;
  const osAtrasadas = todasOS.filter((o) => {
    const emAberto = !["FINALIZADA", "Finalizada", "CANCELADA", "Cancelada"].includes(o.status);
    return emAberto && diasDesde(o.data || o.createdAt) > 7;
  });

  const clientesSet = new Set();
  [...orcamentos.map((o) => o.nome), ...todasOS.map((o) => o.clienteNome)].forEach((n) => n && clientesSet.add(n));
  const clientesAtivos = clientesSet.size;

  const orcamentosPendentesAntigos = orcamentos.filter((o) => diasDesde(o.createdAt) > 3);

  const pmocsProximos = pmocs.filter((p) => {
    const st = pmocStatus(p.proximaManutencao);
    return st.label === "PRÓXIMO DO VENCIMENTO" || st.label === "ATRASADO";
  });

  // serviços mais realizados (por tipoServico das OS)
  const contagemServicos = {};
  todasOS.forEach((o) => {
    const s = o.tipoServico || o.eqTipo || "Outro";
    contagemServicos[s] = (contagemServicos[s] || 0) + 1;
  });
  const servicoMaisRealizado = Object.entries(contagemServicos).sort((a, b) => b[1] - a[1])[0];

  const insights = [];
  if (orcamentosPendentesAntigos.length > 0) {
    insights.push(`Existem ${orcamentosPendentesAntigos.length} orçamento${orcamentosPendentesAntigos.length > 1 ? "s" : ""} pendente${orcamentosPendentesAntigos.length > 1 ? "s" : ""} há mais de 3 dias.`);
  }
  if (pmocsProximos.length > 0) {
    insights.push(`${pmocsProximos.length} equipamento${pmocsProximos.length > 1 ? "s" : ""} com PMOC próximo do vencimento ou atrasado.`);
  }
  if (osAtrasadas.length > 0) {
    insights.push(`${osAtrasadas.length} OS em aberto há mais de 7 dias sem finalização.`);
  }
  if (servicoMaisRealizado) {
    insights.push(`Serviço mais realizado no total: ${servicoMaisRealizado[0]} (${servicoMaisRealizado[1]} ${servicoMaisRealizado[1] === 1 ? "vez" : "vezes"}).`);
  }
  if (orcamentos.length > 0 && osFinalizadas > 0) {
    const taxa = ((osFinalizadas / (orcamentos.length + todasOS.length || 1)) * 100).toFixed(0);
    insights.push(`Taxa de conversão aproximada (OS finalizadas sobre total de orçamentos + OS): ${taxa}%.`);
  }

  const cards = [
    { label: "Faturamento", valor: `R$ ${faturamento.toFixed(2)}`, destaque: true, icon: TrendingUp },
    { label: "Lucro", valor: `R$ ${lucro.toFixed(2)}`, destaque: false, icon: Check },
    { label: "Despesas", valor: `R$ ${totalDespesas.toFixed(2)}`, destaque: false, icon: TrendingDown },
    { label: "OS Abertas", valor: osAbertas, destaque: false, icon: Clock },
    { label: "OS Finalizadas", valor: osFinalizadas, destaque: false, icon: CheckCircle2 },
    { label: "Orçamentos", valor: orcamentos.length, destaque: false, icon: FileText },
  ];

  return (
    <div>
      {/* cabeçalho compacto proprio desta tela */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px",
        }}
      >
        <button
          onClick={onBack}
          aria-label="Voltar"
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: "#111111",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#C9A24B",
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={17} />
        </button>
        <div style={{ lineHeight: 1.2 }}>
          <div
            style={{
              fontFamily: "'Roboto',sans-serif",
              fontWeight: 600,
              fontSize: 21,
              color: "#F5F5F3",
              letterSpacing: 0.3,
            }}
          >
            Gestão Inteligente
          </div>
          <div
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 9.5,
              color: "#7A7A7A",
              letterSpacing: 2,
              textTransform: "uppercase",
              marginTop: 1,
            }}
          >
            Alla Check
          </div>
        </div>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      <div style={{ padding: "24px 20px 40px", maxWidth: "100%", overflowX: "hidden" }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 24, maxWidth: "100%" }}>
          {FIN_FILTROS.map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                flexShrink: 0,
                fontSize: 11.5,
                padding: "7px 12px",
                borderRadius: 20,
                border: `1px solid ${filtro === f ? "#C9A24B" : "#2A2A2E"}`,
                background: filtro === f ? "rgba(201,162,75,0.15)" : "transparent",
                color: filtro === f ? "#E9C878" : "#8A8A90",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {f}
            </button>
          ))}
        </div>
        {filtro === "Personalizado" && (
          <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
            <div style={{ flex: 1 }}><Field label="De"><input type="date" style={inputStyle} value={custom.inicio} onChange={(e) => setCustom((c) => ({ ...c, inicio: e.target.value }))} /></Field></div>
            <div style={{ flex: 1 }}><Field label="Até"><input type="date" style={inputStyle} value={custom.fim} onChange={(e) => setCustom((c) => ({ ...c, fim: e.target.value }))} /></Field></div>
          </div>
        )}

        {/* RESUMO DO NEGOCIO */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 11,
              fontWeight: 600,
              color: "#F5F5F5",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              whiteSpace: "nowrap",
            }}
          >
            Resumo do negócio
          </span>
          <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(201,162,75,0.35), transparent)" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, marginBottom: 12 }}>
          {cards.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                className="premium-card"
                style={{
                  background: "#0D0D0D",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 18,
                  padding: "18px 18px 17px",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), 0 8px 30px rgba(0,0,0,0.3)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 9,
                      color: "#8A8A8A",
                      letterSpacing: 2,
                      textTransform: "uppercase",
                    }}
                  >
                    {c.label}
                  </span>
                  <Icon size={13} color="#5F5F5F" strokeWidth={1.8} />
                </div>
                <div
                  style={{
                    fontFamily: "'Roboto',sans-serif",
                    fontWeight: 600,
                    // clamp: diminui sozinho em telas estreitas para o valor
                    // nunca vazar para fora do card (ex: "R$ 1450.00")
                    fontSize: "clamp(17px, 6.2vw, 26px)",
                    lineHeight: 1.05,
                    color: c.destaque ? "#C9A24B" : "#F5F5F5",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {c.valor}
                </div>
              </div>
            );
          })}
        </div>

        {/* clientes ativos - mesma linguagem, largura total, intencional */}
        <div
          className="premium-card"
          style={{
            background: "#0D0D0D",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 18,
            padding: "17px 18px",
            marginBottom: 32,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.035), 0 8px 30px rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 9,
                color: "#8A8A8A",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 9,
              }}
            >
              Clientes ativos
            </div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 26, color: "#F5F5F5", lineHeight: 1 }}>
              {clientesAtivos}
            </div>
          </div>
          <Users size={15} color="#5F5F5F" strokeWidth={1.8} />
        </div>

        {/* INSIGHTS */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <Sparkles size={13} color="#C9A24B" />
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 11,
                fontWeight: 600,
                color: "#F0F0EE",
                letterSpacing: 1.5,
                textTransform: "uppercase",
              }}
            >
              Insights
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#7A7A7A", marginTop: 4 }}>
            Inteligência sobre o desempenho da operação
          </div>
        </div>

        {insights.length === 0 ? (
          <div
            style={{
              background: "#0D0D0D",
              border: "1px dashed rgba(255,255,255,0.1)",
              borderRadius: 16,
              padding: "32px 24px",
              textAlign: "center",
            }}
          >
            <div style={{ color: "#C9A24B", fontSize: 20, marginBottom: 10 }}>✦</div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#D9D9D6", marginBottom: 6 }}>
              Ainda não há dados suficientes
            </div>
            <div style={{ fontSize: 12.5, color: "#7A7A7A", lineHeight: 1.5 }}>
              Registre OS, orçamentos e movimentações para que o ALLA CHECK gere insights sobre sua operação.
            </div>
          </div>
        ) : (
          insights.map((ins, idx) => (
            <div
              key={idx}
              style={{
                background: "#111111",
                border: "1px solid rgba(201,162,75,0.18)",
                borderRadius: 14,
                padding: "13px 15px",
                marginBottom: 9,
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
              }}
            >
              <span style={{ color: "#C9A24B", fontSize: 13, lineHeight: 1.4, marginTop: 1 }}>✦</span>
              <span style={{ fontSize: 13, color: "#D0D0CE", lineHeight: 1.5 }}>{ins}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------- Módulo: Vendas Cervejeira ---------------- */
const CERVEJEIRA_ESTADOS = ["Nova", "Usada", "Reformada", "Revisada"];

function ProdutoForm({ onDone, onCancel }) {
  const [form, setForm] = useState({
    nome: "",
    marca: "",
    modelo: "",
    capacidade: "",
    voltagem: "",
    estado: "Nova",
    numeroSerie: "",
    custo: "",
    precoVenda: "",
    estoque: "1",
    descricao: "",
  });
  const [fotos, setFotos] = useState([]);
  const fileInputRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addFotos = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const dataUrl = await resizeImage(file);
        setFotos((f) => [...f, { id: uid(), src: dataUrl }]);
      } catch {
        /* skip */
      }
    }
    e.target.value = "";
  };

  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (saving) return; // impede duplo clique / registro duplicado
    setSaving(true);
    try {
      const id = uid();
      await window.storage.set(`cervejeiras-produtos:${id}`, JSON.stringify({ id, ...form, fotos, createdAt: new Date().toISOString() }));
      onDone();
    } catch (err) {
      console.error("Erro ao salvar produto", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "salvar"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Field label="Nome"><input style={inputStyle} value={form.nome} onChange={set("nome")} placeholder="Ex: Cervejeira 300L" /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Marca"><input style={inputStyle} value={form.marca} onChange={set("marca")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Modelo"><input style={inputStyle} value={form.modelo} onChange={set("modelo")} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Capacidade"><input style={inputStyle} value={form.capacidade} onChange={set("capacidade")} placeholder="Ex: 300L" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Voltagem"><input style={inputStyle} value={form.voltagem} onChange={set("voltagem")} placeholder="Ex: 220V" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Estado">
            <select style={{ ...inputStyle, appearance: "none" }} value={form.estado} onChange={set("estado")}>
              {CERVEJEIRA_ESTADOS.map((e) => <option key={e}>{e}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: 1 }}><Field label="Número de série"><input style={inputStyle} value={form.numeroSerie} onChange={set("numeroSerie")} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Custo (R$)"><input style={inputStyle} value={form.custo} onChange={set("custo")} inputMode="decimal" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Preço de venda (R$)"><input style={inputStyle} value={form.precoVenda} onChange={set("precoVenda")} inputMode="decimal" /></Field></div>
      </div>
      <Field label="Estoque (unidades)"><input style={inputStyle} value={form.estoque} onChange={set("estoque")} inputMode="numeric" /></Field>
      <Field label="Descrição">
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", fontFamily: "'Roboto',sans-serif" }} value={form.descricao} onChange={set("descricao")} />
      </Field>
      <Field label={`Fotos (${fotos.length})`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {fotos.map((f) => (
            <img key={f.id} src={f.src} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: "1px solid #2A2A2E" }} />
          ))}
          <button onClick={() => fileInputRef.current.click()} style={{ width: 56, height: 56, borderRadius: 8, border: "1px dashed #3A3A3E", background: "#141416", display: "flex", alignItems: "center", justifyContent: "center", color: "#8A8A90", cursor: "pointer" }}>
            <Camera size={16} />
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={addFotos} />
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>Cancelar</button>
        <button onClick={salvar} disabled={saving || !form.nome.trim()} style={{ flex: 1.4, background: form.nome.trim() && !saving ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "12px 0", color: form.nome.trim() && !saving ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: saving ? "default" : "pointer" }}>
          {saving ? "Salvando..." : "Salvar produto"}
        </button>
      </div>
    </div>
  );
}

function VendaForm({ produtos, onDone, onCancel }) {
  const [produtoId, setProdutoId] = useState(produtos[0]?.id || "");
  const [quantidade, setQuantidade] = useState("1");
  const [desconto, setDesconto] = useState("0");
  const [cliente, setCliente] = useState({ nome: "", telefone: "", documento: "", endereco: "" });
  const [pagamento, setPagamento] = useState("PIX");
  const [saving, setSaving] = useState(false);

  const produto = produtos.find((p) => p.id === produtoId);
  const qtd = Math.max(1, Number(quantidade) || 1);
  const valorVenda = produto ? Number(produto.precoVenda || 0) * qtd : 0;
  const total = Math.max(0, valorVenda - (Number(desconto) || 0));
  const custoTotal = produto ? Number(produto.custo || 0) * qtd : 0;
  const lucro = total - custoTotal;

  const finalizarVenda = async () => {
    if (!produto || !cliente.nome.trim()) return;
    setSaving(true);
    try {
      const id = uid();
      const venda = {
        id,
        produtoId: produto.id,
        produtoNome: produto.nome,
        quantidade: qtd,
        precoUnit: Number(produto.precoVenda || 0),
        custoUnit: Number(produto.custo || 0),
        desconto: Number(desconto) || 0,
        total,
        lucro,
        cliente,
        pagamento,
        createdAt: new Date().toISOString(),
      };
      await window.storage.set(`cervejeiras-vendas:${id}`, JSON.stringify(venda));

      const novoEstoque = Math.max(0, (Number(produto.estoque) || 0) - qtd);
      await window.storage.set(`cervejeiras-produtos:${produto.id}`, JSON.stringify({ ...produto, estoque: novoEstoque }));

      const recId = uid();
      await window.storage.set(
        `fin-receitas:${recId}`,
        JSON.stringify({
          id: recId,
          servico: `Venda — ${produto.nome}`,
          cliente: cliente.nome,
          osId: null,
          osNumero: null,
          data: new Date().toISOString().slice(0, 10),
          valor: total,
          formaPagamento: pagamento,
          status: "pago",
          createdAt: new Date().toISOString(),
        })
      );

      onDone(venda);
    } catch (err) {
      console.error("Erro ao registrar venda", err);
    } finally {
      setSaving(false);
    }
  };

  if (produtos.length === 0) {
    return <div style={{ color: "#6E6E73", fontSize: 13, textAlign: "center", padding: 30 }}>Cadastre um produto no estoque antes de registrar uma venda.</div>;
  }

  return (
    <div>
      <Field label="Produto">
        <select style={{ ...inputStyle, appearance: "none" }} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>{p.nome} — estoque: {p.estoque}</option>
          ))}
        </select>
      </Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Quantidade"><input style={inputStyle} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} inputMode="numeric" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Desconto (R$)"><input style={inputStyle} value={desconto} onChange={(e) => setDesconto(e.target.value)} inputMode="decimal" /></Field></div>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "16px 0 10px" }}>Cliente</div>
      <Field label="Nome"><input style={inputStyle} value={cliente.nome} onChange={(e) => setCliente((c) => ({ ...c, nome: e.target.value }))} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Telefone"><input style={inputStyle} value={cliente.telefone} onChange={(e) => setCliente((c) => ({ ...c, telefone: e.target.value }))} inputMode="numeric" /></Field></div>
        <div style={{ flex: 1 }}><Field label="CPF/CNPJ"><input style={inputStyle} value={cliente.documento} onChange={(e) => setCliente((c) => ({ ...c, documento: e.target.value }))} /></Field></div>
      </div>
      <Field label="Endereço"><input style={inputStyle} value={cliente.endereco} onChange={(e) => setCliente((c) => ({ ...c, endereco: e.target.value }))} /></Field>

      <Field label="Forma de pagamento">
        <select style={{ ...inputStyle, appearance: "none" }} value={pagamento} onChange={(e) => setPagamento(e.target.value)}>
          {FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}
        </select>
      </Field>

      <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", margin: "14px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ color: "#8A8A90", fontSize: 12.5 }}>Valor da venda</span>
          <span style={{ color: "#F3F3F1", fontSize: 12.5 }}>R$ {valorVenda.toFixed(2)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#F3F3F1", fontSize: 14, fontWeight: 600 }}>Total</span>
          <span style={{ color: "#E9C878", fontSize: 16, fontWeight: 700 }}>R$ {total.toFixed(2)}</span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>Cancelar</button>
        <button
          onClick={finalizarVenda}
          disabled={saving || !cliente.nome.trim()}
          style={{ flex: 1.4, background: cliente.nome.trim() ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "12px 0", color: cliente.nome.trim() ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}
        >
          {saving ? "Registrando..." : "Finalizar venda"}
        </button>
      </div>
    </div>
  );
}

function VendasCervejeiraModule() {
  const [mode, setMode] = useState("dashboard"); // dashboard | novo-produto | nova-venda
  const [produtos, setProdutos] = useState(null);
  const [vendas, setVendas] = useState(null);

  const load = useCallback(async () => {
    setProdutos(await carregarTudoStorage("cervejeiras-produtos:"));
    setVendas(await carregarTudoStorage("cervejeiras-vendas:"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (mode === "novo-produto") {
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setMode("dashboard")} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar
        </button>
        <ProdutoForm onCancel={() => setMode("dashboard")} onDone={() => { setMode("dashboard"); load(); }} />
      </div>
    );
  }

  if (mode === "nova-venda") {
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setMode("dashboard")} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar
        </button>
        <VendaForm produtos={(produtos || []).filter((p) => Number(p.estoque) > 0)} onCancel={() => setMode("dashboard")} onDone={() => { setMode("dashboard"); load(); }} />
      </div>
    );
  }

  if (produtos === null || vendas === null) {
    return <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={20} className="spin" /></div>;
  }

  const estoqueTotal = produtos.reduce((a, p) => a + (Number(p.estoque) || 0), 0);
  const totalVendido = vendas.reduce((a, v) => a + v.quantidade, 0);
  const faturamento = vendas.reduce((a, v) => a + v.total, 0);
  const lucroTotal = vendas.reduce((a, v) => a + v.lucro, 0);

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Em Estoque", valor: estoqueTotal, color: "#4681DF" },
          { label: "Total Vendido", valor: totalVendido, color: "#4ADE80" },
          { label: "Faturamento", valor: `R$ ${faturamento.toFixed(2)}`, color: "#E9C878" },
          { label: "Lucro", valor: `R$ ${lucroTotal.toFixed(2)}`, color: lucroTotal >= 0 ? "#4ADE80" : "#F0605A" },
        ].map((c) => (
          <div key={c.label} style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 14, padding: 14 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#8A8A90", letterSpacing: 1, textTransform: "uppercase" }}>{c.label}</div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 19, color: c.color, marginTop: 4 }}>{c.valor}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={() => setMode("novo-produto")} style={{ flex: 1, background: "#1C1C1F", border: "1px solid #C9A24B", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#E9C878", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
          <Plus size={14} /> Produto
        </button>
        <button onClick={() => setMode("nova-venda")} style={{ flex: 1, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", cursor: "pointer" }}>
          <Plus size={14} /> Venda
        </button>
      </div>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#8A8A90", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        Estoque ({produtos.length})
      </div>
      {produtos.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 20px", color: "#6E6E73", fontSize: 13, marginBottom: 16 }}>Nenhum produto cadastrado ainda.</div>
      ) : (
        produtos.map((p) => (
          <div key={p.id} style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 13.5, color: "#F3F3F1" }}>{p.nome}</div>
              <div style={{ fontSize: 11, color: "#8A8A90", marginTop: 2 }}>{p.estado} · R$ {Number(p.precoVenda || 0).toFixed(2)}</div>
            </div>
            <span style={{ fontSize: 12, color: Number(p.estoque) > 0 ? "#4ADE80" : "#F0605A", fontWeight: 700 }}>{p.estoque} un.</span>
          </div>
        ))
      )}

      {vendas.length > 0 && (
        <>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#8A8A90", letterSpacing: 1.5, textTransform: "uppercase", margin: "20px 0 10px" }}>
            Vendas recentes ({vendas.length})
          </div>
          {[...vendas].reverse().slice(0, 10).map((v) => (
            <div key={v.id} style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 13, color: "#F3F3F1" }}>{v.produtoNome}</div>
                <div style={{ fontSize: 11, color: "#8A8A90", marginTop: 2 }}>{v.cliente.nome} · {new Date(v.createdAt).toLocaleDateString("pt-BR")}</div>
              </div>
              <span style={{ color: "#E9C878", fontSize: 13.5, fontWeight: 700 }}>R$ {v.total.toFixed(2)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------------- Módulo: Funcionários ---------------- */
const CARGOS = ["Técnico", "Auxiliar", "Administrativo", "Vendedor", "Gestor", "Outro"];
const STATUS_FUNCIONARIO = ["Ativo", "Férias", "Afastado", "Inativo"];
const PERMISSOES_POR_CARGO = {
  Gestor: ["OS", "Serviços", "Clientes", "Orçamentos", "Vendas", "Financeiro", "Documentos"],
  Técnico: ["OS", "Serviços"],
  Vendedor: ["Clientes", "Orçamentos", "Vendas"],
  Administrativo: ["Clientes", "Financeiro", "Documentos"],
  Auxiliar: ["OS"],
  Outro: [],
};
const TODAS_PERMISSOES = ["OS", "Serviços", "Clientes", "Orçamentos", "Vendas", "Financeiro", "Documentos"];

/* --- peças reutilizáveis da interface de equipe --- */
const btnPrincipal = {
  flex: 1,
  background: "linear-gradient(135deg,#C9A24B,#E9C878)",
  border: "none",
  borderRadius: 12,
  padding: "12px 0",
  color: "#0A0A0B",
  fontFamily: "'Roboto',sans-serif",
  fontWeight: 600,
  fontSize: 12.5,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  cursor: "pointer",
};
const btnSecundario = {
  flex: 1,
  background: "#141416",
  border: "1px solid #2A2A2E",
  borderRadius: 12,
  padding: "12px 0",
  color: "#C7C9CE",
  fontFamily: "'Roboto',sans-serif",
  fontWeight: 600,
  fontSize: 12.5,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  cursor: "pointer",
};

function SecaoTitulo({ children }) {
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: 10,
        color: "#C9A24B",
        letterSpacing: 1.8,
        textTransform: "uppercase",
        margin: "20px 0 10px",
      }}
    >
      {children}
    </div>
  );
}

/* duas colunas que encolhem de verdade em telas estreitas */
function LinhaDupla({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10 }}>
      {children}
    </div>
  );
}

function Etiqueta({ texto, cor }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 10.5,
        padding: "4px 9px",
        borderRadius: 20,
        color: cor,
        background: `${cor}14`,
        border: `1px solid ${cor}44`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: cor, flexShrink: 0 }} />
      {texto}
    </span>
  );
}

/* barra de progresso com animação de entrada */
function BarraProgresso({ pct, cor = "#C9A24B", altura = 7 }) {
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setLargura(Math.max(0, Math.min(100, pct))), 60);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div style={{ height: altura, background: "#1A1A1D", borderRadius: altura, overflow: "hidden" }}>
      <div
        style={{
          width: `${largura}%`,
          height: "100%",
          borderRadius: altura,
          background: `linear-gradient(90deg, ${cor}AA, ${cor})`,
          transition: "width 700ms cubic-bezier(.4,0,.2,1)",
        }}
      />
    </div>
  );
}

function MiniIndicador({ icone: Icone, valor, rotulo, cor }) {
  return (
    <div
      style={{
        background: "#0D0D0D",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 14,
        padding: "12px 12px 11px",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: "#8A8A8A", letterSpacing: 1.2, textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {rotulo}
        </span>
        <Icone size={13} color={cor} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      </div>
      <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: "clamp(19px, 6.4vw, 25px)", color: "#F5F5F5", lineHeight: 1 }}>
        {valor}
      </div>
    </div>
  );
}

function EstadoVazio({ icone: Icone, titulo, texto }) {
  return (
    <div style={{ textAlign: "center", padding: "38px 22px", color: "#6E6E73" }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          margin: "0 auto 14px",
          background: "rgba(201,162,75,0.06)",
          border: "1px solid rgba(201,162,75,0.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icone size={20} color="#C9A24B" strokeWidth={1.6} />
      </div>
      <div style={{ fontSize: 14, color: "#C7C9CE", marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 300, margin: "0 auto" }}>{texto}</div>
    </div>
  );
}

/* ---------------- Autenticação (Firebase Auth) ----------------
   Login real: a senha é enviada direto ao Firebase e NUNCA passa
   pelo nosso código nem é gravada no Firestore. A sessão fica
   guardada no próprio aparelho e sobrevive a recarregamentos. */
function obterAuth() {
  try {
    if (!window.__allaFirebaseApp) return null;
    if (!window.__allaAuth) {
      window.__allaAuth = getAuth(window.__allaFirebaseApp);
      setPersistence(window.__allaAuth, browserLocalPersistence).catch(() => {});
    }
    return window.__allaAuth;
  } catch (e) {
    console.error("ALLA CHECK: falha ao iniciar a autenticação", e);
    return null;
  }
}

/* Traduz os códigos do Firebase para mensagens que o usuário entende. */
function mensagemErroAuth(e) {
  const codigo = (e && e.code) || "";
  const mapa = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-disabled": "Esta conta está desativada.",
    "auth/user-not-found": "Não encontramos uma conta com este e-mail.",
    "auth/wrong-password": "E-mail ou senha incorretos.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Já existe uma conta com este e-mail.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
    "auth/network-request-failed": "Sem conexão. Verifique a internet e tente novamente.",
    "auth/operation-not-allowed":
      "Login por e-mail e senha ainda não está habilitado no Firebase (Authentication → Sign-in method).",
    "auth/missing-password": "Informe a senha.",
  };
  return mapa[codigo] || "Não foi possível concluir. Tente novamente.";
}

const campoAuth = {
  width: "100%",
  background: "#0D0D0D",
  border: "1px solid #24242A",
  borderRadius: 12,
  padding: "13px 14px 13px 42px",
  color: "#F3F3F1",
  fontSize: 14.5,
  fontFamily: "'Roboto',sans-serif",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 200ms, box-shadow 200ms",
};

function CampoAuth({ icone: Icone, tipo = "text", valor, onChange, placeholder, onEnter, children }) {
  const [focado, setFocado] = useState(false);
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <Icone
        size={16}
        color={focado ? "#C9A24B" : "#5A5A5F"}
        style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", transition: "color 200ms", pointerEvents: "none" }}
      />
      <input
        type={tipo}
        value={valor}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setFocado(true)}
        onBlur={() => setFocado(false)}
        onKeyDown={(e) => e.key === "Enter" && onEnter && onEnter()}
        style={{
          ...campoAuth,
          paddingRight: children ? 44 : 14,
          borderColor: focado ? "rgba(201,162,75,0.55)" : "#24242A",
          boxShadow: focado ? "0 0 0 3px rgba(201,162,75,0.08)" : "none",
        }}
      />
      {children}
    </div>
  );
}

/* Botão "Instalar app": só aparece quando o navegador realmente permite
   instalar. Se o app já estiver instalado, nada é mostrado. */
function useInstalacao() {
  const [evento, setEvento] = useState(null);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    const jaInstalado =
      window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
    if (jaInstalado || window.navigator.standalone) setInstalado(true);

    const aoPoderInstalar = (e) => {
      e.preventDefault();
      setEvento(e);
    };
    const aoInstalar = () => {
      setInstalado(true);
      setEvento(null);
    };
    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  const instalar = async () => {
    if (!evento) return;
    evento.prompt();
    try {
      await evento.userChoice;
    } catch {
      /* usuário fechou o diálogo */
    }
    setEvento(null);
  };

  return { podeInstalar: !!evento && !instalado, instalar, instalado };
}

function TelaAutenticacao() {
  const [modo, setModo] = useState("login"); // login | cadastro | recuperar
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const limpar = () => { setErro(""); setAviso(""); };
  const trocarModo = (m) => { limpar(); setSenha(""); setModo(m); };

  const executar = async () => {
    if (carregando) return;
    limpar();
    const auth = obterAuth();
    if (!auth) {
      setErro("Serviço de autenticação indisponível. Verifique a conexão.");
      return;
    }
    if (!email.trim()) return setErro("Informe o e-mail.");
    if (modo !== "recuperar" && !senha) return setErro("Informe a senha.");
    if (modo === "cadastro" && !nome.trim()) return setErro("Informe seu nome.");

    setCarregando(true);
    try {
      if (modo === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), senha);
      } else if (modo === "cadastro") {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
        if (cred.user && nome.trim()) {
          await updateProfile(cred.user, { displayName: nome.trim() }).catch(() => {});
        }
      } else {
        await sendPasswordResetEmail(auth, email.trim());
        setAviso("Enviamos um link de redefinição para o seu e-mail.");
      }
    } catch (e) {
      setErro(mensagemErroAuth(e));
    } finally {
      setCarregando(false);
    }
  };

  const titulos = {
    login: ["Bem-vindo de volta", "Acesse sua conta para continuar"],
    cadastro: ["Criar conta", "Preencha os dados para começar"],
    recuperar: ["Recuperar senha", "Enviaremos um link para o seu e-mail"],
  }[modo];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#000000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "28px 18px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }} key={modo} className="alla-tela">
        <img
          src={LOGO_DATA_URI}
          alt="ALLA SERVICE"
          style={{ width: 150, display: "block", margin: "0 auto 26px" }}
        />

        <div
          style={{
            background: "#0A0A0B",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 20,
            padding: "26px 20px 22px",
          }}
        >
          <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 21, fontWeight: 700, color: "#F3F3F1", textAlign: "center" }}>
            {titulos[0]}
          </div>
          <div style={{ fontSize: 13, color: "#8A8A90", textAlign: "center", margin: "6px 0 22px", lineHeight: 1.45 }}>
            {titulos[1]}
          </div>

          {modo === "cadastro" && (
            <CampoAuth icone={Users} valor={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" onEnter={executar} />
          )}

          <CampoAuth icone={Send} tipo="email" valor={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" onEnter={executar} />

          {modo !== "recuperar" && (
            <CampoAuth
              icone={Check}
              tipo={verSenha ? "text" : "password"}
              valor={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={modo === "cadastro" ? "Senha (mínimo 6 caracteres)" : "Senha"}
              onEnter={executar}
            >
              <button
                onClick={() => setVerSenha((v) => !v)}
                aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                style={{
                  position: "absolute",
                  right: 6,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#6E6E73",
                  fontSize: 11,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontFamily: "'JetBrains Mono',monospace",
                  letterSpacing: 0.5,
                }}
              >
                {verSenha ? "ocultar" : "mostrar"}
              </button>
            </CampoAuth>
          )}

          {modo === "login" && (
            <div style={{ textAlign: "right", marginBottom: 16 }}>
              <button
                onClick={() => trocarModo("recuperar")}
                style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 12.5, cursor: "pointer", padding: "4px 0" }}
              >
                Esqueceu sua senha?
              </button>
            </div>
          )}

          {erro && (
            <div style={{ background: "rgba(240,96,90,0.07)", border: "1px solid rgba(240,96,90,0.35)", borderRadius: 10, padding: "10px 12px", color: "#F0605A", fontSize: 12.5, lineHeight: 1.45, marginBottom: 14 }}>
              {erro}
            </div>
          )}
          {aviso && (
            <div style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 10, padding: "10px 12px", color: "#4ADE80", fontSize: 12.5, lineHeight: 1.45, marginBottom: 14 }}>
              {aviso}
            </div>
          )}

          <button
            onClick={executar}
            disabled={carregando}
            className="premium-card"
            style={{
              width: "100%",
              background: carregando ? "#2A2A2E" : "linear-gradient(135deg,#C9A24B,#E9C878)",
              border: "none",
              borderRadius: 12,
              padding: "14px 0",
              color: carregando ? "#8A8A90" : "#0A0A0B",
              fontFamily: "'Roboto',sans-serif",
              fontWeight: 700,
              fontSize: 13.5,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              cursor: carregando ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 9,
            }}
          >
            {carregando && <Loader2 size={15} className="spin" />}
            {carregando
              ? "Aguarde..."
              : modo === "login"
              ? "Entrar"
              : modo === "cadastro"
              ? "Criar conta"
              : "Enviar link"}
          </button>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "#8A8A90" }}>
          {modo === "login" ? (
            <>
              Não possui uma conta?{" "}
              <button onClick={() => trocarModo("cadastro")} style={{ background: "none", border: "none", color: "#E9C878", fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 600 }}>
                Criar conta
              </button>
            </>
          ) : (
            <button onClick={() => trocarModo("login")} style={{ background: "none", border: "none", color: "#E9C878", fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 600 }}>
              Voltar para o login
            </button>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 26, fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#3A3A3E", letterSpacing: 2 }}>
          ALLA SERVICE · GESTÃO TÉCNICA
        </div>
      </div>
    </div>
  );
}

/* ---------------- Funcionários Técnicos ----------------
   Regras de nível e status operacional derivadas de dados REAIS
   (OS finalizadas, OS em andamento e rastreios de atendimento). */
const NIVEIS_TECNICO = [
  { nome: "Bronze", medalha: "🥉", min: 0, cor: "#B87333" },
  { nome: "Prata", medalha: "🥈", min: 15, cor: "#A8B2BD" },
  { nome: "Ouro", medalha: "🥇", min: 40, cor: "#C9A24B" },
  { nome: "Platina", medalha: "🏆", min: 80, cor: "#6FD3E8" },
];
const COMISSAO_PADRAO = 10; // % sobre serviços executados

function nivelPorConcluidas(qtd) {
  let atual = NIVEIS_TECNICO[0];
  for (const n of NIVEIS_TECNICO) if (qtd >= n.min) atual = n;
  const proximo = NIVEIS_TECNICO[NIVEIS_TECNICO.indexOf(atual) + 1] || null;
  const base = atual.min;
  const alvo = proximo ? proximo.min : atual.min;
  const progresso = proximo ? Math.min(100, ((qtd - base) / (alvo - base)) * 100) : 100;
  return { atual, proximo, progresso, faltam: proximo ? Math.max(0, alvo - qtd) : 0 };
}

const STATUS_OPERACIONAL = {
  Disponível: "#4ADE80",
  "Em atendimento": "#E9C878",
  "Em deslocamento": "#4681DF",
  Indisponível: "#6E6E73",
};

/* Deriva a situação do técnico agora, a partir do que está registrado no sistema. */
function statusOperacional(func, ordens, rastreios) {
  if (["Inativo", "Afastado", "Férias"].includes(func.status)) return "Indisponível";
  const meus = (rastreios || []).filter((r) => r.tecnico === func.nome);
  if (meus.some((r) => r.status === "A CAMINHO")) return "Em deslocamento";
  if (meus.some((r) => r.status === "EM ATENDIMENTO")) return "Em atendimento";
  const emOS = (ordens || []).some(
    (o) => o.tecnico === func.nome && ["EM ANDAMENTO", "Em Atendimento", "AGENDADA"].includes(o.status)
  );
  return emOS ? "Em atendimento" : "Disponível";
}

function FuncionarioForm({ editing, onDone, onCancel }) {
  const [form, setForm] = useState(
    editing || {
      nome: "",
      cpf: "",
      rg: "",
      telefone: "",
      email: "",
      endereco: "",
      regiao: "",
      cargo: "Técnico",
      dataEntrada: new Date().toISOString().slice(0, 10),
      status: "Ativo",
      metaMensal: "",
      comissaoPercent: String(COMISSAO_PADRAO),
      observacoes: "",
    }
  );
  const [foto, setFoto] = useState(editing?.foto || null);
  const [permissoes, setPermissoes] = useState(editing?.permissoes || PERMISSOES_POR_CARGO[form.cargo] || []);
  const fileInputRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const trocarCargo = (e) => {
    const cargo = e.target.value;
    setForm((f) => ({ ...f, cargo }));
    setPermissoes(PERMISSOES_POR_CARGO[cargo] || []);
  };

  const escolherFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file, 400, 0.8);
      setFoto(dataUrl);
    } catch {
      notificarErroBanco("Não foi possível carregar a foto.");
    }
  };

  const togglePermissao = (p) =>
    setPermissoes((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));

  const [saving, setSaving] = useState(false);

  const salvar = async () => {
    if (saving) return;
    if (!form.nome.trim()) {
      notificarErroBanco("Informe o nome do funcionário antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const id = editing?.id || uid();
      const func = { ...form, id, foto, permissoes, createdAt: editing?.createdAt || new Date().toISOString() };
      await window.storage.set(`funcionarios:${id}`, JSON.stringify(func));
      onDone(func);
    } catch (err) {
      console.error("Erro ao salvar funcionário", err);
      notificarErroBanco(diagnosticarErroFirestore(err, "salvar funcionário"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: 92,
            height: 92,
            borderRadius: "50%",
            overflow: "hidden",
            background: "#0D0D0D",
            border: "1px dashed #2F2F35",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {foto ? (
            <img src={foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <Camera size={22} color="#6E6E73" />
          )}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={escolherFoto} style={{ display: "none" }} />
      </div>

      <SecaoTitulo>Dados pessoais</SecaoTitulo>
      <Field label="Nome"><input style={inputStyle} value={form.nome} onChange={set("nome")} /></Field>
      <LinhaDupla>
        <Field label="CPF"><input style={inputStyle} value={form.cpf} onChange={set("cpf")} inputMode="numeric" /></Field>
        <Field label="RG"><input style={inputStyle} value={form.rg || ""} onChange={set("rg")} /></Field>
      </LinhaDupla>
      <LinhaDupla>
        <Field label="Telefone"><input style={inputStyle} value={form.telefone} onChange={set("telefone")} inputMode="numeric" /></Field>
        <Field label="Data de contratação"><input type="date" style={inputStyle} value={form.dataEntrada} onChange={set("dataEntrada")} /></Field>
      </LinhaDupla>
      <Field label="E-mail"><input style={inputStyle} value={form.email} onChange={set("email")} /></Field>
      <Field label="Endereço"><input style={inputStyle} value={form.endereco || ""} onChange={set("endereco")} /></Field>

      <SecaoTitulo>Atuação</SecaoTitulo>
      <LinhaDupla>
        <Field label="Cargo">
          <select style={{ ...inputStyle, appearance: "none" }} value={form.cargo} onChange={trocarCargo}>
            {CARGOS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Situação">
          <select style={{ ...inputStyle, appearance: "none" }} value={form.status} onChange={set("status")}>
            {STATUS_FUNCIONARIO.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </LinhaDupla>
      <Field label="Região de atendimento"><input style={inputStyle} value={form.regiao || ""} onChange={set("regiao")} placeholder="Ex: Sorocaba e região" /></Field>
      <LinhaDupla>
        <Field label="Meta mensal (R$)"><input style={inputStyle} value={form.metaMensal || ""} onChange={set("metaMensal")} inputMode="decimal" placeholder="opcional" /></Field>
        <Field label="Comissão (%)"><input style={inputStyle} value={form.comissaoPercent ?? ""} onChange={set("comissaoPercent")} inputMode="decimal" /></Field>
      </LinhaDupla>

      <SecaoTitulo>Permissões</SecaoTitulo>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {TODAS_PERMISSOES.map((p) => {
          const on = permissoes.includes(p);
          return (
            <button
              key={p}
              onClick={() => togglePermissao(p)}
              style={{
                fontSize: 12,
                padding: "7px 12px",
                borderRadius: 9,
                border: `1px solid ${on ? "#C9A24B" : "#2A2A2E"}`,
                background: on ? "rgba(201,162,75,0.12)" : "transparent",
                color: on ? "#E9C878" : "#8A8A90",
                cursor: "pointer",
              }}
            >
              {on ? "✓ " : ""}{p}
            </button>
          );
        })}
      </div>

      <Field label="Observações">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.observacoes} onChange={set("observacoes")} />
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={btnSecundario}>Cancelar</button>
        <button
          onClick={salvar}
          disabled={saving || !form.nome.trim()}
          style={{ ...btnPrincipal, flex: 1.4, opacity: saving || !form.nome.trim() ? 0.5 : 1 }}
        >
          {saving ? "Salvando..." : "Salvar funcionário"}
        </button>
      </div>
    </div>
  );
}

function FuncionarioPerfil({ func, onBack, onEdit, onDeleted, abaInicial = "perfil" }) {
  const [aba, setAba] = useState(abaInicial);
  const [stats, setStats] = useState(null);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [ordensServico, osFrio] = await Promise.all([
          carregarTudoStorage("ordens-servico:"),
          carregarTudoStorage("os-frio:"),
        ]);
        const todasOS = [...ordensServico, ...osFrio].filter((o) => o.tecnico === func.nome);
        const finalizadas = todasOS.filter((o) => ["FINALIZADA", "Finalizada"].includes(o.status));
        const emAndamento = todasOS.filter((o) => !["FINALIZADA", "Finalizada", "CANCELADA", "Cancelada"].includes(o.status));
        const clientes = new Set(todasOS.map((o) => o.clienteNome).filter(Boolean));
        const faturamento = finalizadas.reduce((a, o) => a + (Number(o.valorTotal) || 0), 0);

        // OS finalizadas por mês (últimos 6 meses), a partir de datas reais
        const agora = new Date();
        const meses = [];
        for (let i = 5; i >= 0; i--) {
          const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
          meses.push({ chave: `${d.getFullYear()}-${d.getMonth()}`, rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""), qtd: 0, valor: 0 });
        }
        finalizadas.forEach((o) => {
          const d = new Date(o.finalizedAt || o.data || o.createdAt);
          if (isNaN(d)) return;
          const m = meses.find((x) => x.chave === `${d.getFullYear()}-${d.getMonth()}`);
          if (m) { m.qtd++; m.valor += Number(o.valorTotal) || 0; }
        });
        const mesAtual = meses[meses.length - 1];
        setStats({ total: todasOS.length, finalizadas: finalizadas.length, emAndamento: emAndamento.length, clientes: clientes.size, faturamento, meses, mesAtual });
      } catch (err) {
        notificarErroBanco(diagnosticarErroFirestore(err, "carregar desempenho"));
        setStats({ total: 0, finalizadas: 0, emAndamento: 0, clientes: 0, faturamento: 0, meses: [], mesAtual: null });
      }
    })();
  }, [func.nome]);

  const remover = async () => {
    try {
      await window.storage.delete(`funcionarios:${func.id}`);
      onDeleted();
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "excluir funcionário"));
    }
  };

  const nivel = nivelPorConcluidas(stats?.finalizadas || 0);
  const pctComissao = Number(func.comissaoPercent) || COMISSAO_PADRAO;
  const comissao = (stats?.faturamento || 0) * (pctComissao / 100);
  const meta = Number(func.metaMensal) || 0;
  const realizadoMes = stats?.mesAtual?.valor || 0;
  const pctMeta = meta > 0 ? (realizadoMes / meta) * 100 : 0;

  const ABAS = [
    ["perfil", "Perfil"],
    ["performance", "Performance"],
    ["comissao", "Comissão"],
  ];

  const linha = (rotulo, valor) => (
    <div key={rotulo} style={{ minWidth: 0 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8.5, color: "#8A8A8A", letterSpacing: 1.2, textTransform: "uppercase" }}>{rotulo}</div>
      <div style={{ fontSize: 13.5, color: valor && valor !== "—" ? "#F3F3F1" : "#5A5A5F", marginTop: 3, wordBreak: "break-word" }}>{valor || "—"}</div>
    </div>
  );

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: 0 }}>
        <ChevronLeft size={15} /> voltar à equipe
      </button>

      {/* cabeçalho do técnico */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, minWidth: 0 }}>
        <div style={{ width: 66, height: 66, borderRadius: "50%", overflow: "hidden", background: "#0D0D0D", border: "1px solid rgba(201,162,75,0.35)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {func.foto ? <img src={func.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Users size={24} color="#6E6E73" />}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 18, fontWeight: 700, color: "#F3F3F1", lineHeight: 1.2, wordBreak: "break-word" }}>{func.nome}</div>
          <div style={{ fontSize: 12.5, color: "#8A8A90", marginTop: 2 }}>{func.cargo}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Etiqueta texto={func.status} cor={func.status === "Ativo" ? "#4ADE80" : func.status === "Inativo" ? "#F0605A" : "#E9C878"} />
            <span style={{ fontSize: 11, color: nivel.atual.cor, border: `1px solid ${nivel.atual.cor}44`, background: `${nivel.atual.cor}14`, borderRadius: 20, padding: "4px 9px", whiteSpace: "nowrap" }}>
              {nivel.atual.medalha} {nivel.atual.nome}
            </span>
          </div>
        </div>
      </div>

      {/* abas */}
      <div style={{ display: "flex", borderBottom: "1px solid #1C1C1F", marginBottom: 18 }}>
        {ABAS.map(([id, nome]) => {
          const on = aba === id;
          return (
            <button
              key={id}
              onClick={() => setAba(id)}
              style={{
                flex: 1,
                background: "none",
                border: "none",
                borderBottom: `2px solid ${on ? "#C9A24B" : "transparent"}`,
                color: on ? "#E9C878" : "#7A7A7A",
                fontFamily: "'Roboto',sans-serif",
                fontWeight: on ? 600 : 400,
                fontSize: 12.5,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                padding: "11px 4px",
                cursor: "pointer",
                transition: "color 200ms, border-color 200ms",
              }}
            >
              {nome}
            </button>
          );
        })}
      </div>

      <div key={aba} className="alla-tela">
        {aba === "perfil" && (
          <>
            <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "14px 12px" }}>
                {linha("CPF", func.cpf)}
                {linha("RG", func.rg)}
                {linha("Telefone", func.telefone)}
                {linha("Contratação", func.dataEntrada ? new Date(func.dataEntrada).toLocaleDateString("pt-BR") : "")}
              </div>
              <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
                {linha("E-mail", func.email)}
                {linha("Endereço", func.endereco)}
                {linha("Região de atendimento", func.regiao)}
              </div>
            </div>

            {(func.permissoes || []).length > 0 && (
              <>
                <SecaoTitulo>Permissões</SecaoTitulo>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {func.permissoes.map((p) => (
                    <span key={p} style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 8, color: "#E9C878", background: "rgba(201,162,75,0.10)", border: "1px solid rgba(201,162,75,0.30)" }}>{p}</span>
                  ))}
                </div>
              </>
            )}

            {func.observacoes && (
              <>
                <SecaoTitulo>Observações</SecaoTitulo>
                <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 14, fontSize: 13, color: "#C7C9CE", lineHeight: 1.5 }}>
                  {func.observacoes}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button onClick={() => onEdit(func)} style={btnPrincipal}>Editar</button>
              <button onClick={() => setConfirmar(true)} style={{ ...btnSecundario, color: "#F0605A", borderColor: "rgba(240,96,90,0.4)" }}>Excluir</button>
            </div>

            {confirmar && (
              <div style={{ marginTop: 12, background: "rgba(240,96,90,0.06)", border: "1px solid rgba(240,96,90,0.35)", borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13, color: "#F3F3F1", marginBottom: 10 }}>Excluir {func.nome} da equipe?</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setConfirmar(false)} style={btnSecundario}>Cancelar</button>
                  <button onClick={remover} style={{ ...btnPrincipal, background: "#F0605A", color: "#fff" }}>Confirmar</button>
                </div>
              </div>
            )}
          </>
        )}

        {aba === "performance" && (
          !stats ? (
            <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={20} className="spin" /></div>
          ) : stats.total === 0 ? (
            <EstadoVazio
              icone={TrendingUp}
              titulo="Sem dados de performance"
              texto="Os indicadores aparecerão após a conclusão das primeiras OS deste técnico."
            />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 16 }}>
                <MiniIndicador icone={CheckCircle2} valor={String(stats.finalizadas)} rotulo="OS concluídas" cor="#4ADE80" />
                <MiniIndicador icone={Clock} valor={String(stats.emAndamento)} rotulo="Em andamento" cor="#E9C878" />
                <MiniIndicador icone={Users} valor={String(stats.clientes)} rotulo="Clientes atendidos" cor="#4681DF" />
                <MiniIndicador icone={DollarSign} valor={`R$ ${stats.faturamento.toFixed(0)}`} rotulo="Faturamento" cor="#C9A24B" />
              </div>

              <SecaoTitulo>Meta do mês</SecaoTitulo>
              {meta > 0 ? (
                <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 10 }}>
                    <span style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 24, color: pctMeta >= 100 ? "#4ADE80" : "#E9C878" }}>
                      {pctMeta.toFixed(0)}%
                    </span>
                    <span style={{ fontSize: 12.5, color: "#8A8A90", textAlign: "right" }}>
                      R$ {realizadoMes.toFixed(2)} / R$ {meta.toFixed(2)}
                    </span>
                  </div>
                  <BarraProgresso pct={pctMeta} cor={pctMeta >= 100 ? "#4ADE80" : "#C9A24B"} />
                </div>
              ) : (
                <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 14, marginBottom: 16, fontSize: 12.5, color: "#8A8A90", lineHeight: 1.5 }}>
                  Nenhuma meta mensal definida. Informe a meta no cadastro do técnico para acompanhar o percentual aqui.
                </div>
              )}

              <SecaoTitulo>OS concluídas por mês</SecaoTitulo>
              <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "18px 14px 12px" }}>
                {(() => {
                  const max = Math.max(1, ...stats.meses.map((m) => m.qtd));
                  return (
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 110 }}>
                      {stats.meses.map((m) => (
                        <div key={m.chave} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                          <div style={{ fontSize: 11, color: m.qtd ? "#E9C878" : "#4A4A4F" }}>{m.qtd}</div>
                          <div style={{ width: "100%", height: `${Math.max(3, (m.qtd / max) * 74)}px`, borderRadius: 5, background: m.qtd ? "linear-gradient(180deg,#E9C878,#C9A24B)" : "#1A1A1D", transition: "height 600ms cubic-bezier(.4,0,.2,1)" }} />
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#7A7A7A", textTransform: "uppercase" }}>{m.rotulo}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <SecaoTitulo>Nível do técnico</SecaoTitulo>
              <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
                  {NIVEIS_TECNICO.map((n) => {
                    const on = n.nome === nivel.atual.nome;
                    return (
                      <div key={n.nome} style={{ flex: 1, minWidth: 0, textAlign: "center", opacity: on ? 1 : 0.38 }}>
                        <div style={{ fontSize: 21, lineHeight: 1 }}>{n.medalha}</div>
                        <div style={{ fontSize: 10.5, color: on ? n.cor : "#7A7A7A", marginTop: 5 }}>{n.nome}</div>
                      </div>
                    );
                  })}
                </div>
                <BarraProgresso pct={nivel.progresso} cor={nivel.atual.cor} />
                <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 10, textAlign: "center" }}>
                  {nivel.proximo
                    ? `Faltam ${nivel.faltam} OS concluídas para ${nivel.proximo.medalha} ${nivel.proximo.nome}`
                    : "Nível máximo alcançado"}
                </div>
              </div>
            </>
          )
        )}

        {aba === "comissao" && (
          !stats ? (
            <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={20} className="spin" /></div>
          ) : (
            <>
              <div style={{ background: "linear-gradient(160deg,#151310,#0D0D0D)", border: "1px solid rgba(201,162,75,0.30)", borderRadius: 18, padding: "22px 16px", textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#8A8A90", letterSpacing: 2, textTransform: "uppercase" }}>
                  Comissão acumulada
                </div>
                <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: "clamp(30px, 10vw, 42px)", color: "#E9C878", lineHeight: 1.1, marginTop: 8 }}>
                  R$ {comissao.toFixed(2)}
                </div>
                <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 8 }}>
                  {pctComissao}% sobre serviços executados
                </div>
              </div>

              <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 16 }}>
                {[
                  ["Faturamento total", `R$ ${(stats.faturamento || 0).toFixed(2)}`],
                  ["Comissão calculada", `R$ ${comissao.toFixed(2)}`],
                  ["Percentual de comissão", `${pctComissao}%`],
                  ["Meta mensal", meta > 0 ? `R$ ${meta.toFixed(2)}` : "não definida"],
                ].map(([r, v], i, arr) => (
                  <div key={r} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #17171A" : "none" }}>
                    <span style={{ fontSize: 12.5, color: "#8A8A90" }}>{r}</span>
                    <span style={{ fontSize: 13, color: v === "não definida" ? "#5A5A5F" : "#F3F3F1", textAlign: "right" }}>{v}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, fontSize: 11.5, color: "#6E6E73", lineHeight: 1.5 }}>
                Cálculo feito sobre as OS finalizadas registradas para este técnico. Ajuste o percentual no cadastro se necessário.
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
}

function FuncionariosModule() {
  const [lista, setLista] = useState(null);
  const [ordens, setOrdens] = useState([]);
  const [rastreios, setRastreios] = useState([]);
  const [statsPorTecnico, setStatsPorTecnico] = useState({});
  const [mode, setMode] = useState("lista");
  const [selected, setSelected] = useState(null);
  const [abaPerfil, setAbaPerfil] = useState("perfil");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("Todos");

  const load = useCallback(async () => {
    try {
      const funcionarios = await carregarTudoStorage("funcionarios:");
      const [os, osFrio, rast] = await Promise.all([
        carregarTudoStorage("ordens-servico:"),
        carregarTudoStorage("os-frio:"),
        carregarTudoStorage("rastreios:").catch(() => []),
      ]);
      const todasOS = [...os, ...osFrio];
      setOrdens(todasOS);
      setRastreios(rast || []);

      // números reais por técnico, para exibir no card
      const mapa = {};
      funcionarios.forEach((f) => {
        const minhas = todasOS.filter((o) => o.tecnico === f.nome);
        const finalizadas = minhas.filter((o) => ["FINALIZADA", "Finalizada"].includes(o.status));
        mapa[f.nome] = {
          concluidas: finalizadas.length,
          faturamento: finalizadas.reduce((a, o) => a + (Number(o.valorTotal) || 0), 0),
        };
      });
      setStatsPorTecnico(mapa);
      funcionarios.sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));
      setLista(funcionarios);
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "carregar equipe"));
      setLista([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const comStatus = useMemo(
    () => (lista || []).map((f) => ({ ...f, _op: statusOperacional(f, ordens, rastreios) })),
    [lista, ordens, rastreios]
  );

  const indicadores = useMemo(() => {
    const c = (s) => comStatus.filter((f) => f._op === s).length;
    return {
      total: comStatus.length,
      disponiveis: c("Disponível"),
      atendimento: c("Em atendimento"),
      deslocamento: c("Em deslocamento"),
    };
  }, [comStatus]);

  const filtrados = useMemo(() => {
    let l = comStatus;
    if (filtro !== "Todos") l = l.filter((f) => f._op === filtro);
    const q = busca.trim().toLowerCase();
    if (q) l = l.filter((f) => [f.nome, f.cargo, f.regiao, f.telefone].filter(Boolean).join(" ").toLowerCase().includes(q));
    return l;
  }, [comStatus, filtro, busca]);

  if (mode === "novo") {
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => { setSelected(null); setMode("lista"); }} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: 0 }}>
          <ChevronLeft size={15} /> voltar
        </button>
        <FuncionarioForm
          editing={selected?.editing ? selected : null}
          onCancel={() => { setSelected(null); setMode("lista"); }}
          onDone={() => { setSelected(null); setMode("lista"); load(); }}
        />
      </div>
    );
  }

  if (mode === "perfil" && selected) {
    return (
      <FuncionarioPerfil
        func={selected}
        abaInicial={abaPerfil}
        onBack={() => { setSelected(null); setAbaPerfil("perfil"); setMode("lista"); }}
        onEdit={(f) => { setSelected({ ...f, editing: true }); setMode("novo"); }}
        onDeleted={() => { setSelected(null); setMode("lista"); load(); }}
      />
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: "#8A8A90", letterSpacing: 2, textTransform: "uppercase" }}>
        Gestão de equipe · ALLA SERVICE
      </div>
      <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 22, fontWeight: 700, color: "#F3F3F1", margin: "4px 0 16px" }}>
        Equipe Técnica
      </div>

      {/* indicadores em tempo real */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, marginBottom: 16 }}>
        <MiniIndicador icone={Users} valor={String(indicadores.total)} rotulo="Total" cor="#C9A24B" />
        <MiniIndicador icone={CheckCircle2} valor={String(indicadores.disponiveis)} rotulo="Disponíveis" cor="#4ADE80" />
        <MiniIndicador icone={Wrench} valor={String(indicadores.atendimento)} rotulo="Em atendimento" cor="#E9C878" />
        <MiniIndicador icone={Navigation} valor={String(indicadores.deslocamento)} rotulo="Em deslocamento" cor="#4681DF" />
      </div>

      <button
        onClick={() => { setSelected(null); setMode("novo"); }}
        style={{ ...btnPrincipal, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 0", marginBottom: 14 }}
      >
        <Plus size={16} /> Novo técnico
      </button>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={15} color="#6E6E73" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar técnico..." style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>

      {/* filtros: única área com rolagem horizontal permitida */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16, WebkitOverflowScrolling: "touch" }}>
        {["Todos", "Disponível", "Em atendimento", "Em deslocamento", "Indisponível"].map((f) => {
          const on = filtro === f;
          return (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                flexShrink: 0,
                fontSize: 11.5,
                padding: "7px 13px",
                borderRadius: 20,
                border: `1px solid ${on ? "#C9A24B" : "#2A2A2E"}`,
                background: on ? "rgba(201,162,75,0.12)" : "transparent",
                color: on ? "#E9C878" : "#8A8A90",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "color 180ms, border-color 180ms, background 180ms",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>

      {lista === null ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={20} className="spin" /></div>
      ) : filtrados.length === 0 ? (
        <EstadoVazio
          icone={Users}
          titulo={comStatus.length === 0 ? "Nenhum técnico cadastrado" : "Nenhum técnico encontrado"}
          texto={comStatus.length === 0 ? "Cadastre o primeiro integrante da equipe para acompanhar desempenho e comissões." : "Ajuste a busca ou o filtro para ver outros integrantes."}
        />
      ) : (
        filtrados.map((f) => {
          const st = statsPorTecnico[f.nome] || { concluidas: 0, faturamento: 0 };
          const nivel = nivelPorConcluidas(st.concluidas);
          const pct = Number(f.comissaoPercent) || COMISSAO_PADRAO;
          const cor = STATUS_OPERACIONAL[f._op];
          return (
            <div
              key={f.id}
              className="alla-tela"
              style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 18, padding: 15, marginBottom: 12 }}
            >
              <div style={{ display: "flex", gap: 13, minWidth: 0 }}>
                <div style={{ width: 54, height: 54, borderRadius: 15, overflow: "hidden", background: "#141416", border: "1px solid #24242A", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {f.foto ? <img src={f.foto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Users size={20} color="#6E6E73" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 15.5, fontWeight: 600, color: "#F3F3F1", lineHeight: 1.25, wordBreak: "break-word" }}>{f.nome}</div>
                      <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 2 }}>{f.cargo}</div>
                    </div>
                    <span style={{ fontSize: 15, flexShrink: 0 }} title={nivel.atual.nome}>{nivel.atual.medalha}</span>
                  </div>
                  <div style={{ marginTop: 8 }}><Etiqueta texto={f._op} cor={cor} /></div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, margin: "14px 0 12px" }}>
                {[
                  ["OS concl.", String(st.concluidas)],
                  ["Comissão", `R$ ${(st.faturamento * (pct / 100)).toFixed(0)}`],
                  ["Avaliação", "—"],
                ].map(([r, v]) => (
                  <div key={r} style={{ background: "#111114", borderRadius: 10, padding: "9px 8px", minWidth: 0, textAlign: "center" }}>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#8A8A8A", letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: v === "—" ? "#4A4A4F" : "#F3F3F1", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</div>
                  </div>
                ))}
              </div>

              {f.regiao && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A8A90", marginBottom: 12 }}>
                  <MapPin size={12} color="#6E6E73" style={{ flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.regiao}</span>
                </div>
              )}

              <div style={{ display: "flex", gap: 9 }}>
                <button onClick={() => { setSelected(f); setAbaPerfil("perfil"); setMode("perfil"); }} style={{ ...btnPrincipal, padding: "10px 0", fontSize: 12 }}>
                  Ver perfil
                </button>
                <button onClick={() => { setSelected(f); setAbaPerfil("performance"); setMode("perfil"); }} style={{ ...btnSecundario, padding: "10px 0", fontSize: 12 }}>
                  Agenda
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function NovoRelatorio({ onSaved }) {
  const [form, setForm] = useState({
    cliente: "",
    endereco: "",
    telefone: "",
    equipamento: "",
    tipoServico: "Manutenção Preventiva",
    descricao: "",
    pecas: "",
  });
  const [fotos, setFotos] = useState([]);
  const [localizacao, setLocalizacao] = useState(null);
  const [locStatus, setLocStatus] = useState("idle"); // idle | loading | error | ok
  const [assinatura, setAssinatura] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const fileInputRef = useRef(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addFotos = async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const dataUrl = await resizeImage(file);
        setFotos((f) => [...f, { id: uid(), src: dataUrl }]);
      } catch {
        /* skip unreadable file */
      }
    }
    e.target.value = "";
  };

  const removeFoto = (id) => setFotos((f) => f.filter((x) => x.id !== id));

  const capturarLocalizacao = () => {
    if (!navigator.geolocation) {
      setLocStatus("error");
      return;
    }
    setLocStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocalizacao({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocStatus("ok");
      },
      () => setLocStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const buildReport = () => ({
    id: uid(),
    createdAt: new Date().toISOString(),
    ...form,
    fotos,
    localizacao,
    assinatura,
  });

  const salvar = async () => {
    setSaving(true);
    try {
      const report = buildReport();
      const result = await window.storage.set(`relatorios:${report.id}`, JSON.stringify(report));
      if (result) {
        setSaved(report);
        onSaved && onSaved();
      }
    } catch (err) {
      console.error("Erro ao salvar relatório", err);
    } finally {
      setSaving(false);
    }
  };

  const enviarWhatsapp = async () => {
    let report = saved;
    if (!report) {
      setSaving(true);
      try {
        report = buildReport();
        await window.storage.set(`relatorios:${report.id}`, JSON.stringify(report));
        setSaved(report);
        onSaved && onSaved();
      } catch (err) {
        console.error("Erro ao salvar relatório", err);
      } finally {
        setSaving(false);
      }
    }
    const linhas = [
      `*ALLA CHECK — Relatório Técnico*`,
      `Cliente: ${form.cliente || "-"}`,
      `Endereço: ${form.endereco || "-"}`,
      `Equipamento: ${form.equipamento || "-"}`,
      `Tipo de serviço: ${form.tipoServico}`,
      form.descricao ? `Descrição: ${form.descricao}` : null,
      form.pecas ? `Peças utilizadas: ${form.pecas}` : null,
      localizacao
        ? `Localização: https://maps.google.com/?q=${localizacao.lat},${localizacao.lng}`
        : null,
    ].filter(Boolean);
    const texto = encodeURIComponent(linhas.join("\n"));
    const telefone = (form.telefone || "").replace(/\D/g, "");
    const url = telefone
      ? `https://wa.me/55${telefone}?text=${texto}`
      : `https://wa.me/?text=${texto}`;
    window.open(url, "_blank");
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <Field label="Cliente">
        <input style={inputStyle} value={form.cliente} onChange={set("cliente")} placeholder="Nome do cliente" />
      </Field>
      <Field label="Endereço">
        <input style={inputStyle} value={form.endereco} onChange={set("endereco")} placeholder="Endereço do atendimento" />
      </Field>
      <Field label="Telefone (WhatsApp)">
        <input style={inputStyle} value={form.telefone} onChange={set("telefone")} placeholder="15999999999" inputMode="numeric" />
      </Field>
      <Field label="Equipamento">
        <input style={inputStyle} value={form.equipamento} onChange={set("equipamento")} placeholder="Ex: Split 12000 BTU" />
      </Field>
      <Field label="Tipo de serviço">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.tipoServico} onChange={set("tipoServico")}>
          <option>Manutenção Preventiva</option>
          <option>Manutenção Corretiva</option>
          <option>Instalação</option>
          <option>Higienização</option>
          <option>Vistoria / Orçamento</option>
          <option>Serviço Elétrico</option>
        </select>
      </Field>
      <Field label="Descrição do serviço">
        <textarea
          style={{ ...inputStyle, minHeight: 90, resize: "vertical", fontFamily: "'Roboto',sans-serif" }}
          value={form.descricao}
          onChange={set("descricao")}
          placeholder="Descreva o serviço realizado, diagnóstico, observações..."
        />
      </Field>
      <Field label="Peças / materiais utilizados">
        <input style={inputStyle} value={form.pecas} onChange={set("pecas")} placeholder="Ex: Gás R410A, capacitor 40uF" />
      </Field>

      <Field label={`Fotos (${fotos.length})`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {fotos.map((f) => (
            <div key={f.id} style={{ position: "relative", width: 72, height: 72 }}>
              <img
                src={f.src}
                alt=""
                style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #2A2A2E" }}
              />
              <button
                onClick={() => removeFoto(f.id)}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: "#F0605A",
                  border: "none",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            onClick={() => fileInputRef.current.click()}
            style={{
              width: 72,
              height: 72,
              borderRadius: 8,
              border: "1px dashed #3A3A3E",
              background: "#141416",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#8A8A90",
              cursor: "pointer",
            }}
          >
            <Camera size={20} />
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          style={{ display: "none" }}
          onChange={addFotos}
        />
      </Field>

      <Field label="Localização">
        <button
          onClick={capturarLocalizacao}
          style={{
            width: "100%",
            background: "#141416",
            border: "1px solid #2A2A2E",
            borderRadius: 10,
            padding: "11px 12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            color: locStatus === "ok" ? "#4ADE80" : "#C7C9CE",
            fontSize: 13.5,
            cursor: "pointer",
          }}
        >
          {locStatus === "loading" ? (
            <Loader2 size={16} className="spin" />
          ) : locStatus === "ok" ? (
            <Check size={16} />
          ) : (
            <MapPin size={16} />
          )}
          {locStatus === "ok" && localizacao
            ? `${localizacao.lat.toFixed(5)}, ${localizacao.lng.toFixed(5)}`
            : locStatus === "loading"
            ? "Obtendo localização..."
            : locStatus === "error"
            ? "Não foi possível obter — tocar para tentar de novo"
            : "Capturar localização atual"}
        </button>
      </Field>

      <Field label="Assinatura do cliente">
        <SignaturePad value={assinatura} onChange={setAssinatura} />
      </Field>

      {saved && (
        <div
          style={{
            background: "rgba(74,222,128,0.1)",
            border: "1px solid rgba(74,222,128,0.35)",
            borderRadius: 10,
            padding: "10px 12px",
            color: "#4ADE80",
            fontSize: 12.5,
            marginBottom: 14,
            fontFamily: "'JetBrains Mono',monospace",
          }}
        >
          Relatório salvo ✓
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button
          onClick={salvar}
          disabled={saving}
          style={{
            flex: 1,
            background: "#1C1C1F",
            border: "1px solid #C9A24B",
            borderRadius: 12,
            padding: "13px 0",
            color: "#E9C878",
            fontFamily: "'Roboto',sans-serif",
            fontWeight: 600,
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            cursor: "pointer",
          }}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button
          onClick={enviarWhatsapp}
          style={{
            flex: 1.3,
            background: "linear-gradient(135deg,#C9A24B,#E9C878)",
            border: "none",
            borderRadius: 12,
            padding: "13px 0",
            color: "#0A0A0B",
            fontFamily: "'Roboto',sans-serif",
            fontWeight: 600,
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <Send size={15} /> Enviar WhatsApp
        </button>
      </div>
    </div>
  );
}

/* ---------------- Historico ---------------- */
function Historico({ refreshKey }) {
  const [reports, setReports] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const list = await window.storage.list("relatorios:");
      if (!list || !list.keys || list.keys.length === 0) {
        setReports([]);
        return;
      }
      const items = [];
      for (const key of list.keys) {
        try {
          const r = await window.storage.get(key);
          if (r) items.push(JSON.parse(r.value));
        } catch {
          /* skip */
        }
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setReports(items);
    } catch {
      setReports([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const remove = async (id) => {
    try {
      await window.storage.delete(`relatorios:${id}`);
      setSelected(null);
      load();
    } catch {
      /* ignore */
    }
  };

  if (reports === null) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#8A8A90" }}>
        <Loader2 size={20} className="spin" />
      </div>
    );
  }

  if (selected) {
    const r = selected;
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button
          onClick={() => setSelected(null)}
          style={{
            background: "none",
            border: "none",
            color: "#8A8A90",
            fontSize: 13,
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <ChevronLeft size={15} /> voltar à lista
        </button>
        <div
          style={{
            fontFamily: "'Roboto',sans-serif",
            fontSize: 19,
            fontWeight: 600,
            color: "#F3F3F1",
            marginBottom: 2,
          }}
        >
          {r.cliente || "Cliente não informado"}
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 11,
            color: "#8A8A90",
            marginBottom: 16,
          }}
        >
          {new Date(r.createdAt).toLocaleString("pt-BR")}
        </div>

        {[
          ["Endereço", r.endereco],
          ["Telefone", r.telefone],
          ["Equipamento", r.equipamento],
          ["Tipo de serviço", r.tipoServico],
          ["Descrição", r.descricao],
          ["Peças utilizadas", r.pecas],
        ].map(([label, val]) =>
          val ? (
            <div key={label} style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 10.5,
                  color: "#8A8A90",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: 3,
                }}
              >
                {label}
              </div>
              <div style={{ color: "#C7C9CE", fontSize: 14 }}>{val}</div>
            </div>
          ) : null
        )}

        {r.localizacao && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10.5,
                color: "#8A8A90",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 3,
              }}
            >
              Localização
            </div>
            <a
              href={`https://maps.google.com/?q=${r.localizacao.lat},${r.localizacao.lng}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#E9C878", fontSize: 13.5 }}
            >
              {r.localizacao.lat.toFixed(5)}, {r.localizacao.lng.toFixed(5)}
            </a>
          </div>
        )}

        {r.fotos && r.fotos.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10.5,
                color: "#8A8A90",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Fotos
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {r.fotos.map((f) => (
                <img
                  key={f.id}
                  src={f.src}
                  alt=""
                  style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #2A2A2E" }}
                />
              ))}
            </div>
          </div>
        )}

        {r.assinatura && (
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10.5,
                color: "#8A8A90",
                letterSpacing: 1,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Assinatura
            </div>
            <div style={{ background: "#0F0F10", borderRadius: 10, padding: 8, border: "1px solid #2A2A2E" }}>
              <img src={r.assinatura} alt="assinatura" style={{ width: "100%", maxHeight: 100, objectFit: "contain" }} />
            </div>
          </div>
        )}

        <button
          onClick={() => remove(r.id)}
          style={{
            width: "100%",
            background: "rgba(240,96,90,0.1)",
            border: "1px solid rgba(240,96,90,0.4)",
            borderRadius: 12,
            padding: "12px 0",
            color: "#F0605A",
            fontFamily: "'Roboto',sans-serif",
            fontWeight: 600,
            fontSize: 13.5,
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            cursor: "pointer",
          }}
        >
          <Trash2 size={15} /> Excluir relatório
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      {reports.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#6E6E73" }}>
          <Clock size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>Nenhum relatório salvo ainda.</div>
        </div>
      ) : (
        reports.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r)}
            style={{
              width: "100%",
              textAlign: "left",
              background: "#141416",
              border: "1px solid #2A2A2E",
              borderRadius: 12,
              padding: "13px 14px",
              marginBottom: 10,
              cursor: "pointer",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1", fontWeight: 500 }}>
                {r.cliente || "Cliente não informado"}
              </div>
              <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>
                {r.tipoServico} · {new Date(r.createdAt).toLocaleDateString("pt-BR")}
              </div>
            </div>
            {r.fotos && r.fotos.length > 0 && (
              <img
                src={r.fotos[0].src}
                alt=""
                style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 8, border: "1px solid #2A2A2E" }}
              />
            )}
          </button>
        ))
      )}
    </div>
  );
}

/* ---------------- Placeholder ---------------- */
function EmBreve({ label }) {
  return (
    <div style={{ padding: "70px 24px", textAlign: "center", color: "#6E6E73" }}>
      <Wrench size={30} style={{ marginBottom: 12, opacity: 0.6 }} />
      <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 16, color: "#C7C9CE", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 13 }}>Este módulo será construído na próxima etapa.</div>
    </div>
  );
}

/* ---------------- App ---------------- */

/* ---------------- Importação de dados legados (execução única) ---------------- */
async function runLegacyImportOnce(onProgress) {
  try {
    const flag = await window.storage.get("system:legacy-import-v1").catch(() => null);
    if (flag) return { skipped: true };

    const d = LEGACY_IMPORT_DATA;
    const batches = [
      ["relatorios", "relatorios"],
      ["recibos", "recibos"],
      ["ordensServico", "ordens-servico"],
      ["osFrio", "os-frio"],
      ["orcamentos", "orcamentos"],
      ["cervejeiraProdutos", "cervejeiras-produtos"],
      ["cervejeiraVendas", "cervejeiras-vendas"],
      ["cervejeiraReceitas", "fin-receitas"],
      ["osReceitasExtra", "fin-receitas"],
      ["funcionarios", "funcionarios"],
    ];

    const total = batches.reduce((acc, [key]) => acc + ((d[key] && d[key].length) || 0), 0);
    let done = 0;
    let failed = 0;

    for (const [key, prefix] of batches) {
      const list = d[key] || [];
      for (const r of list) {
        try {
          await window.storage.set(`${prefix}:${r.id}`, JSON.stringify(r));
        } catch (itemErr) {
          failed++;
          console.error(`Erro ao importar ${prefix}:${r.id}`, itemErr);
        }
        done++;
        onProgress && onProgress({ done, total, failed });
      }
    }

    // só marca como concluído se não houve falhas — caso contrário,
    // a próxima carga tenta de novo (gravações são idempotentes, não duplicam)
    if (failed === 0) {
      await window.storage.set("system:legacy-import-v1", JSON.stringify({ importedAt: new Date().toISOString(), total }));
    }
    return { done, total, failed };
  } catch (err) {
    console.error("Erro ao importar dados legados", err);
    return { error: true };
  }
}

/* ---------------- Ferramenta: Assinaturas (contratos recorrentes) ---------------- */
const ASSINATURA_STATUS = ["ATIVA", "PENDENTE", "VENCIDA", "CANCELADA"];
const ASSINATURA_STATUS_COLOR = {
  ATIVA: "#4ADE80",
  PENDENTE: "#E9C878",
  VENCIDA: "#F0605A",
  CANCELADA: "#6E6E73",
};
const ASSINATURA_PERIODICIDADE = { Mensal: 1, Bimestral: 2, Trimestral: 3, Semestral: 6, Anual: 12 };

function assinaturaValorMensal(a) {
  const meses = ASSINATURA_PERIODICIDADE[a.periodicidade] || 1;
  return (Number(a.valor) || 0) / meses;
}

function assinaturaStatusEfetivo(a) {
  if (a.status === "CANCELADA") return "CANCELADA";
  if (!a.vencimento) return a.status || "PENDENTE";
  const hoje = new Date();
  const venc = new Date(a.vencimento);
  if (venc < new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) return "VENCIDA";
  return a.status === "PENDENTE" ? "PENDENTE" : "ATIVA";
}

function assinaturaDiasParaVencer(a) {
  if (!a.vencimento) return null;
  const hoje = new Date();
  return Math.ceil((new Date(a.vencimento) - hoje) / 86400000);
}

function AssinaturaForm({ editing, onDone, onCancel }) {
  const [clientes, setClientes] = useState(null);
  const [form, setForm] = useState(
    editing || {
      cliente: "",
      telefone: "",
      servico: "Manutenção Preventiva",
      valor: "",
      periodicidade: "Mensal",
      dataInicio: new Date().toISOString().slice(0, 10),
      vencimento: "",
      status: "ATIVA",
      observacoes: "",
    }
  );
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    buscarClientesReais().then(setClientes).catch(() => setClientes([]));
  }, []);

  // vencimento sugerido a partir do início + periodicidade (usuário pode alterar)
  useEffect(() => {
    if (form.vencimento) return;
    const meses = ASSINATURA_PERIODICIDADE[form.periodicidade] || 1;
    const d = new Date(form.dataInicio || Date.now());
    d.setMonth(d.getMonth() + meses);
    setForm((f) => (f.vencimento ? f : { ...f, vencimento: d.toISOString().slice(0, 10) }));
  }, [form.dataInicio, form.periodicidade, form.vencimento]);

  const salvar = async () => {
    if (saving) return;
    if (!form.cliente.trim()) {
      notificarErroBanco("Informe o cliente antes de salvar.");
      return;
    }
    if (!form.valor) {
      notificarErroBanco("Informe o valor da assinatura antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const id = editing?.id || uid();
      const numero = editing?.numero || (await proximoNumero("ASS", "assinaturas:"));
      const registro = {
        ...form,
        id,
        numero,
        createdAt: editing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        historico: [
          ...(editing?.historico || []),
          { data: new Date().toISOString(), acao: editing ? "Editada" : "Criada" },
        ],
      };
      await window.storage.set(`assinaturas:${id}`, JSON.stringify(registro));
      onDone(registro);
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "salvar assinatura"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        Cliente
      </div>
      {clientes && clientes.length > 0 && (
        <Field label="Cliente cadastrado (opcional)">
          <select
            style={{ ...inputStyle, appearance: "none" }}
            defaultValue=""
            onChange={(e) => {
              const c = clientes.find((x) => x.nome === e.target.value);
              if (c) setForm((f) => ({ ...f, cliente: c.nome, telefone: c.telefone || f.telefone }));
            }}
          >
            <option value="">Selecionar cliente já cadastrado...</option>
            {clientes.map((c) => (
              <option key={c.nome} value={c.nome}>{c.nome}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Cliente"><input style={inputStyle} value={form.cliente} onChange={set("cliente")} /></Field>
      <Field label="Telefone (WhatsApp)"><input style={inputStyle} value={form.telefone} onChange={set("telefone")} inputMode="numeric" placeholder="15999999999" /></Field>

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Contrato
      </div>
      <Field label="Serviço"><input style={inputStyle} value={form.servico} onChange={set("servico")} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Valor (R$)"><input style={inputStyle} value={form.valor} onChange={set("valor")} inputMode="decimal" /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Periodicidade">
            <select style={{ ...inputStyle, appearance: "none" }} value={form.periodicidade} onChange={set("periodicidade")}>
              {Object.keys(ASSINATURA_PERIODICIDADE).map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Data de início"><input type="date" style={inputStyle} value={form.dataInicio} onChange={set("dataInicio")} /></Field>
        </div>
        <div style={{ flex: 1 }}>
          <Field label="Vencimento"><input type="date" style={inputStyle} value={form.vencimento} onChange={set("vencimento")} /></Field>
        </div>
      </div>
      <Field label="Status">
        <select style={{ ...inputStyle, appearance: "none" }} value={form.status} onChange={set("status")}>
          {ASSINATURA_STATUS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Observações">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.observacoes} onChange={set("observacoes")} />
      </Field>

      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid #2A2A2E", borderRadius: 12, padding: "12px 0", color: "#C7C9CE", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Cancelar
        </button>
        <button
          onClick={salvar}
          disabled={saving || !form.cliente.trim() || !form.valor}
          style={{ flex: 1.4, background: !saving && form.cliente.trim() && form.valor ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "12px 0", color: !saving && form.cliente.trim() && form.valor ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: saving ? "default" : "pointer" }}
        >
          {saving ? "Salvando..." : "Salvar assinatura"}
        </button>
      </div>
    </div>
  );
}

function AssinaturasModule() {
  const [lista, setLista] = useState(null);
  const [mode, setMode] = useState("lista");
  const [selected, setSelected] = useState(null);
  const [filtro, setFiltro] = useState("Todas");

  const load = useCallback(async () => {
    try {
      const list = await window.storage.list("assinaturas:");
      if (!list || !list.keys || !list.keys.length) return setLista([]);
      const items = [];
      for (const key of list.keys) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) items.push(JSON.parse(r.value));
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setLista(items);
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "carregar assinaturas"));
      setLista([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const excluir = async (id) => {
    try {
      await window.storage.delete(`assinaturas:${id}`);
      setSelected(null);
      setMode("lista");
      load();
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "excluir assinatura"));
    }
  };

  const resumo = useMemo(() => {
    const l = (lista || []).map((a) => ({ ...a, _st: assinaturaStatusEfetivo(a) }));
    const ativas = l.filter((a) => a._st === "ATIVA");
    const vencidas = l.filter((a) => a._st === "VENCIDA");
    const proximas = l.filter((a) => {
      const d = assinaturaDiasParaVencer(a);
      return a._st === "ATIVA" && d !== null && d >= 0 && d <= 15;
    });
    const mensal = ativas.reduce((acc, a) => acc + assinaturaValorMensal(a), 0);
    return { ativas: ativas.length, vencidas: vencidas.length, proximas: proximas.length, mensal };
  }, [lista]);

  const filtradas = useMemo(() => {
    const l = (lista || []).map((a) => ({ ...a, _st: assinaturaStatusEfetivo(a) }));
    if (filtro === "Todas") return l;
    return l.filter((a) => a._st === filtro.toUpperCase());
  }, [lista, filtro]);

  if (mode === "form") {
    return (
      <AssinaturaForm
        editing={selected}
        onCancel={() => { setSelected(null); setMode("lista"); }}
        onDone={() => { setSelected(null); setMode("lista"); load(); }}
      />
    );
  }

  if (mode === "detalhe" && selected) {
    const a = selected;
    const st = assinaturaStatusEfetivo(a);
    const cor = ASSINATURA_STATUS_COLOR[st];
    const dias = assinaturaDiasParaVencer(a);
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => { setSelected(null); setMode("lista"); }} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar à lista
        </button>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#C9A24B" }}>{a.numero}</div>
        <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 19, fontWeight: 600, color: "#F3F3F1", marginBottom: 8 }}>{a.cliente}</div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#141416", border: `1px solid ${cor}55`, borderRadius: 20, padding: "5px 12px", marginBottom: 16 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: cor }} />
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: cor, letterSpacing: 1 }}>{st}</span>
        </div>

        <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          {[
            ["Serviço", a.servico],
            ["Periodicidade", a.periodicidade],
            ["Início", a.dataInicio ? new Date(a.dataInicio).toLocaleDateString("pt-BR") : "-"],
            ["Vencimento", a.vencimento ? new Date(a.vencimento).toLocaleDateString("pt-BR") : "-"],
            ["Dias p/ vencer", dias === null ? "-" : `${dias} dia(s)`],
            ["Equivalente mensal", `R$ ${assinaturaValorMensal(a).toFixed(2)}`],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "#8A8A90", fontSize: 12.5 }}>{l}</span>
              <span style={{ color: "#F3F3F1", fontSize: 12.5 }}>{v}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 10, paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#F3F3F1", fontSize: 14, fontWeight: 600 }}>Valor</span>
            <span style={{ color: "#E9C878", fontSize: 18, fontWeight: 700 }}>R$ {(Number(a.valor) || 0).toFixed(2)}</span>
          </div>
        </div>

        {a.observacoes && (
          <div style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: 14, marginBottom: 16, color: "#C7C9CE", fontSize: 13 }}>
            {a.observacoes}
          </div>
        )}

        <button
          onClick={() => {
            const texto = encodeURIComponent(
              `*ALLA SERVICE — Assinatura ${a.numero}*\nCliente: ${a.cliente}\nServiço: ${a.servico}\nValor: R$ ${(Number(a.valor) || 0).toFixed(2)} (${a.periodicidade})\nVencimento: ${a.vencimento ? new Date(a.vencimento).toLocaleDateString("pt-BR") : "-"}`
            );
            const tel = (a.telefone || "").replace(/\D/g, "");
            window.open(tel ? `https://wa.me/55${tel}?text=${texto}` : `https://wa.me/?text=${texto}`, "_blank");
          }}
          style={{ width: "100%", marginBottom: 10, background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "12px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#0A0A0B", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}
        >
          <Send size={14} /> Cobrar pelo WhatsApp
        </button>
        <button onClick={() => setMode("form")} style={{ width: "100%", marginBottom: 10, background: "#1C1C1F", border: "1px solid #C9A24B", borderRadius: 12, padding: "12px 0", color: "#E9C878", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Editar
        </button>
        <button onClick={() => excluir(a.id)} style={{ width: "100%", background: "rgba(240,96,90,0.1)", border: "1px solid rgba(240,96,90,0.4)", borderRadius: 12, padding: "12px 0", color: "#F0605A", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 12.5, textTransform: "uppercase", cursor: "pointer" }}>
          Excluir
        </button>

        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#8A8A90", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
          Histórico
        </div>
        {(a.historico || []).length === 0 ? (
          <div style={{ color: "#6E6E73", fontSize: 12.5 }}>Sem histórico.</div>
        ) : (
          [...a.historico].reverse().map((h, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1C1C1F" }}>
              <span style={{ fontSize: 12, color: "#C7C9CE" }}>{h.acao}</span>
              <span style={{ fontSize: 10.5, color: "#6E6E73", fontFamily: "'JetBrains Mono',monospace" }}>{new Date(h.data).toLocaleString("pt-BR")}</span>
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button
        onClick={() => { setSelected(null); setMode("form"); }}
        style={{ width: "100%", background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer", marginBottom: 18 }}
      >
        <Plus size={16} /> Nova assinatura
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        {[
          ["Ativas", String(resumo.ativas), "#F5F5F5"],
          ["Valor mensal", `R$ ${resumo.mensal.toFixed(2)}`, "#E9C878"],
          ["Vencem em 15d", String(resumo.proximas), "#F5F5F5"],
          ["Vencidas", String(resumo.vencidas), resumo.vencidas > 0 ? "#F0605A" : "#F5F5F5"],
        ].map(([label, val, cor]) => (
          <div key={label} style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#8A8A8A", letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 20, color: cor, marginTop: 3 }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16 }}>
        {["Todas", ...ASSINATURA_STATUS.map((s) => s.charAt(0) + s.slice(1).toLowerCase())].map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{ flexShrink: 0, fontSize: 11, padding: "7px 12px", borderRadius: 20, border: `1px solid ${filtro === f ? "#C9A24B" : "#2A2A2E"}`, background: filtro === f ? "rgba(201,162,75,0.15)" : "transparent", color: filtro === f ? "#E9C878" : "#8A8A90", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            {f}
          </button>
        ))}
      </div>

      {lista === null ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={20} className="spin" /></div>
      ) : filtradas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73" }}>
          <CalendarClock size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>{(lista || []).length === 0 ? "Nenhuma assinatura cadastrada ainda." : "Nenhuma assinatura neste filtro."}</div>
        </div>
      ) : (
        filtradas.map((a) => {
          const cor = ASSINATURA_STATUS_COLOR[a._st];
          const dias = assinaturaDiasParaVencer(a);
          return (
            <button
              key={a.id}
              onClick={() => { setSelected(a); setMode("detalhe"); }}
              style={{ width: "100%", textAlign: "left", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", marginBottom: 10, cursor: "pointer" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1" }}>{a.cliente}</div>
                  <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>{a.numero} · {a.servico} · {a.periodicidade}</div>
                </div>
                <span style={{ color: "#E9C878", fontSize: 13.5, fontWeight: 700 }}>R$ {(Number(a.valor) || 0).toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: cor }} />
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: cor }}>{a._st}</span>
                {dias !== null && a._st !== "CANCELADA" && (
                  <span style={{ fontSize: 10.5, color: "#6E6E73", marginLeft: "auto" }}>
                    {dias < 0 ? `${Math.abs(dias)}d em atraso` : `vence em ${dias}d`}
                  </span>
                )}
              </div>
            </button>
          );
        })
      )}
    </div>
  );
}

/* ---------------- Ferramenta: Rastreio do Técnico ---------------- */
const RASTREIO_STATUS = ["AGUARDANDO", "A CAMINHO", "EM ATENDIMENTO", "CONCLUÍDO", "CANCELADO"];
const RASTREIO_STATUS_COLOR = {
  AGUARDANDO: "#8A8A90",
  "A CAMINHO": "#4681DF",
  "EM ATENDIMENTO": "#E9C878",
  "CONCLUÍDO": "#4ADE80",
  CANCELADO: "#F0605A",
};

function RastreioTecnico() {
  const [lista, setLista] = useState(null);
  const [ordens, setOrdens] = useState([]);
  const [funcionarios, setFuncionarios] = useState([]);
  const [mode, setMode] = useState("lista");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await window.storage.list("rastreios:");
      const items = [];
      for (const key of (list && list.keys) || []) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) items.push(JSON.parse(r.value));
      }
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setLista(items);
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "carregar rastreios"));
      setLista([]);
    }
    // OS e técnicos reais já cadastrados no sistema
    try {
      const l = await window.storage.list("ordens-servico:");
      const os = [];
      for (const key of (l && l.keys) || []) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) os.push(JSON.parse(r.value));
      }
      os.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setOrdens(os);
    } catch { /* lista de OS é opcional */ }
    try {
      const l = await window.storage.list("funcionarios:");
      const fs = [];
      for (const key of (l && l.keys) || []) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) fs.push(JSON.parse(r.value));
      }
      setFuncionarios(fs);
    } catch { /* lista de técnicos é opcional */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const novo = () =>
    setForm({
      tecnico: "",
      osNumero: "",
      cliente: "",
      endereco: "",
      status: "AGUARDANDO",
      horaSaida: "",
      horaChegada: "",
      horaConclusao: "",
      localizacao: null,
      observacoes: "",
    });

  const capturarLocalizacao = () => {
    if (!navigator.geolocation) {
      notificarErroBanco("Este aparelho não oferece localização.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setForm((f) => ({
          ...f,
          localizacao: { lat: pos.coords.latitude, lng: pos.coords.longitude, em: new Date().toISOString() },
        })),
      () => notificarErroBanco("Não foi possível obter a localização. Verifique a permissão do aparelho."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const salvar = async () => {
    if (saving) return;
    if (!form.tecnico.trim()) {
      notificarErroBanco("Informe o técnico antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const id = form.id || uid();
      const reg = { ...form, id, createdAt: form.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
      await window.storage.set(`rastreios:${id}`, JSON.stringify(reg));
      setForm(null);
      setMode("lista");
      load();
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "salvar rastreio"));
    } finally {
      setSaving(false);
    }
  };

  const marcarEtapa = async (reg, campo, novoStatus) => {
    try {
      const atualizado = {
        ...reg,
        [campo]: new Date().toTimeString().slice(0, 5),
        status: novoStatus,
        updatedAt: new Date().toISOString(),
      };
      await window.storage.set(`rastreios:${reg.id}`, JSON.stringify(atualizado));
      load();
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "atualizar rastreio"));
    }
  };

  const excluir = async (id) => {
    try {
      await window.storage.delete(`rastreios:${id}`);
      load();
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "excluir rastreio"));
    }
  };

  if (form) {
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setForm(null)} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> cancelar
        </button>

        <Field label="Técnico">
          {funcionarios.length > 0 ? (
            <select style={{ ...inputStyle, appearance: "none" }} value={form.tecnico} onChange={set("tecnico")}>
              <option value="">Selecionar técnico...</option>
              {funcionarios.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
            </select>
          ) : (
            <input style={inputStyle} value={form.tecnico} onChange={set("tecnico")} placeholder="Nome do técnico" />
          )}
        </Field>

        <Field label="Ordem de Serviço (opcional)">
          {ordens.length > 0 ? (
            <select
              style={{ ...inputStyle, appearance: "none" }}
              value={form.osNumero}
              onChange={(e) => {
                const os = ordens.find((o) => o.numero === e.target.value);
                setForm((f) => ({
                  ...f,
                  osNumero: e.target.value,
                  cliente: os ? os.clienteNome || f.cliente : f.cliente,
                  endereco: os ? os.clienteEndereco || f.endereco : f.endereco,
                }));
              }}
            >
              <option value="">Sem OS vinculada</option>
              {ordens.map((o) => <option key={o.id} value={o.numero}>{o.numero} — {o.clienteNome}</option>)}
            </select>
          ) : (
            <input style={inputStyle} value={form.osNumero} onChange={set("osNumero")} />
          )}
        </Field>

        <Field label="Cliente"><input style={inputStyle} value={form.cliente} onChange={set("cliente")} /></Field>
        <Field label="Endereço"><input style={inputStyle} value={form.endereco} onChange={set("endereco")} /></Field>
        <Field label="Status">
          <select style={{ ...inputStyle, appearance: "none" }} value={form.status} onChange={set("status")}>
            {RASTREIO_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="Localização">
          <button
            onClick={capturarLocalizacao}
            style={{ width: "100%", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 10, padding: "11px 0", color: "#C7C9CE", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          >
            <MapPin size={15} /> {form.localizacao ? "Atualizar localização" : "Capturar localização atual"}
          </button>
          {form.localizacao && (
            <a
              href={`https://www.google.com/maps?q=${form.localizacao.lat},${form.localizacao.lng}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: "block", marginTop: 8, fontSize: 12, color: "#E9C878", fontFamily: "'JetBrains Mono',monospace" }}
            >
              {form.localizacao.lat.toFixed(5)}, {form.localizacao.lng.toFixed(5)} — abrir no mapa
            </a>
          )}
        </Field>

        <Field label="Observações">
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={form.observacoes} onChange={set("observacoes")} />
        </Field>

        <button
          onClick={salvar}
          disabled={saving || !form.tecnico.trim()}
          style={{ width: "100%", background: !saving && form.tecnico.trim() ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "13px 0", color: !saving && form.tecnico.trim() ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, textTransform: "uppercase", cursor: saving ? "default" : "pointer" }}
        >
          {saving ? "Salvando..." : "Salvar atendimento"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <button
        onClick={novo}
        style={{ width: "100%", background: "linear-gradient(135deg,#C9A24B,#E9C878)", border: "none", borderRadius: 12, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, color: "#0A0A0B", textTransform: "uppercase", cursor: "pointer", marginBottom: 18 }}
      >
        <Plus size={16} /> Novo atendimento
      </button>

      {lista === null ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={20} className="spin" /></div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73" }}>
          <Navigation size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>Nenhum atendimento em rastreio.</div>
        </div>
      ) : (
        lista.map((r) => {
          const cor = RASTREIO_STATUS_COLOR[r.status] || "#8A8A90";
          return (
            <div key={r.id} style={{ background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1" }}>{r.tecnico}</div>
                  <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>
                    {r.osNumero ? `${r.osNumero} · ` : ""}{r.cliente || "Cliente não informado"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: cor }} />
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: cor }}>{r.status}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 10, fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#8A8A90" }}>
                <span>Saída: {r.horaSaida || "--:--"}</span>
                <span>Chegada: {r.horaChegada || "--:--"}</span>
                <span>Fim: {r.horaConclusao || "--:--"}</span>
              </div>

              {r.localizacao && (
                <a
                  href={`https://www.google.com/maps?q=${r.localizacao.lat},${r.localizacao.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 8, fontSize: 11.5, color: "#E9C878" }}
                >
                  <MapPin size={12} /> ver no mapa
                </a>
              )}

              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {!r.horaSaida && (
                  <button onClick={() => marcarEtapa(r, "horaSaida", "A CAMINHO")} style={miniBtn}>Registrar saída</button>
                )}
                {r.horaSaida && !r.horaChegada && (
                  <button onClick={() => marcarEtapa(r, "horaChegada", "EM ATENDIMENTO")} style={miniBtn}>Registrar chegada</button>
                )}
                {r.horaChegada && !r.horaConclusao && (
                  <button onClick={() => marcarEtapa(r, "horaConclusao", "CONCLUÍDO")} style={miniBtn}>Concluir</button>
                )}
                <button onClick={() => setForm(r)} style={miniBtn}>Editar</button>
                <button onClick={() => excluir(r.id)} style={{ ...miniBtn, borderColor: "rgba(240,96,90,0.4)", color: "#F0605A" }}>Excluir</button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

const miniBtn = {
  background: "transparent",
  border: "1px solid #2A2A2E",
  borderRadius: 8,
  color: "#C7C9CE",
  fontSize: 11,
  padding: "6px 10px",
  cursor: "pointer",
};

/* ---------------- Ferramenta: Histórico Completo do Equipamento ----------------
   Não cria cadastro novo: agrega o que já existe em OS, OS Frio, Orçamentos,
   Relatórios, PMOCs e Checklists, agrupando por equipamento de cada cliente. */
function chaveEquipamento(cliente, tipo, marca, modelo, serie) {
  const s = (serie || "").trim();
  if (s) return `${(cliente || "").trim().toLowerCase()}|serie:${s.toLowerCase()}`;
  return `${(cliente || "").trim().toLowerCase()}|${(tipo || "").trim().toLowerCase()}|${(marca || "").trim().toLowerCase()}|${(modelo || "").trim().toLowerCase()}`;
}

async function montarHistoricoEquipamentos() {
  const mapa = new Map();

  const registrar = (dados, evento) => {
    const chave = chaveEquipamento(dados.cliente, dados.tipo, dados.marca, dados.modelo, dados.serie);
    if (!chave.replace(/\|/g, "").trim()) return;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        chave,
        cliente: dados.cliente || "Cliente não informado",
        tipo: dados.tipo || "",
        marca: dados.marca || "",
        modelo: dados.modelo || "",
        btus: dados.btus || "",
        gas: dados.gas || "",
        serie: dados.serie || "",
        eventos: [],
      });
    }
    const eq = mapa.get(chave);
    // completa campos que estavam vazios com o que aparecer depois
    for (const c of ["tipo", "marca", "modelo", "btus", "gas", "serie"]) {
      if (!eq[c] && dados[c]) eq[c] = dados[c];
    }
    eq.eventos.push(evento);
  };

  const ler = async (prefixo) => {
    try {
      const list = await window.storage.list(prefixo);
      const out = [];
      for (const key of (list && list.keys) || []) {
        const r = await window.storage.get(key).catch(() => null);
        if (r) out.push(JSON.parse(r.value));
      }
      return out;
    } catch {
      return [];
    }
  };

  // Ordens de Serviço
  for (const os of await ler("ordens-servico:")) {
    registrar(
      { cliente: os.clienteNome, tipo: os.eqTipo, marca: os.eqMarca, modelo: os.eqModelo, btus: os.eqBtus, serie: os.eqSerie },
      {
        data: os.data || os.createdAt,
        categoria: os.tipoServico || "Serviço",
        titulo: `OS ${os.numero || ""} — ${os.tipoServico || "Serviço"}`,
        detalhe: [os.diagnostico, os.procedimentosRealizados, os.materiaisUtilizados && `Materiais: ${os.materiaisUtilizados}`, os.pecasUtilizadas && `Peças: ${os.pecasUtilizadas}`].filter(Boolean).join(" · "),
        valor: os.valorTotal,
        status: os.status,
        origem: "OS",
      }
    );
  }

  // OS Frio
  for (const os of await ler("os-frio:")) {
    registrar(
      { cliente: os.clienteNome, tipo: os.eqTipo, marca: os.eqMarca, modelo: os.eqModelo, serie: os.eqSerie },
      {
        data: os.data || os.createdAt,
        categoria: "Refrigeração",
        titulo: `OS Frio ${os.numero || ""}`,
        detalhe: [os.diagnostico, os.pecasUtilizadas && `Peças: ${os.pecasUtilizadas}`].filter(Boolean).join(" · "),
        valor: os.valorTotal,
        status: os.status,
        origem: "OS Frio",
      }
    );
  }

  // Orçamentos
  for (const o of await ler("orcamentos:")) {
    const eq = o.equipamento || {};
    registrar(
      { cliente: o.nome, tipo: eq.tipo, marca: eq.marca, modelo: eq.modelo, btus: eq.btus, gas: eq.gas, serie: eq.numeroSerie },
      {
        data: o.createdAt,
        categoria: "Orçamento",
        titulo: `Orçamento ${o.numero || ""} — ${o.servico?.tipo || ""}`,
        detalhe: o.servico?.descricaoPersonalizada || o.escopoServico || "",
        valor: o.valorFinal,
        status: o.status,
        origem: "Orçamento",
      }
    );
  }

  // Relatórios técnicos
  for (const r of await ler("relatorios:")) {
    registrar(
      { cliente: r.cliente, tipo: r.equipamento },
      {
        data: r.createdAt,
        categoria: r.tipoServico || "Relatório",
        titulo: r.tipoServico || "Relatório técnico",
        detalhe: r.descricao || "",
        valor: null,
        status: null,
        origem: "Relatório",
      }
    );
  }

  // PMOC (planos e manutenções executadas)
  for (const p of await ler("pmocs:")) {
    registrar(
      { cliente: p.clienteNome, tipo: p.eqTipo, marca: p.eqMarca, modelo: p.eqModelo, btus: p.eqBtus, serie: p.eqSerie },
      {
        data: p.createdAt,
        categoria: "PMOC",
        titulo: `Plano PMOC — ${p.frequencia || ""}`,
        detalhe: p.atividades || "",
        valor: null,
        status: null,
        origem: "PMOC",
      }
    );
    for (const h of p.historico || []) {
      registrar(
        { cliente: p.clienteNome, tipo: p.eqTipo, marca: p.eqMarca, modelo: p.eqModelo, serie: p.eqSerie },
        {
          data: h.data,
          categoria: "Manutenção",
          titulo: "Manutenção preventiva (PMOC)",
          detalhe: h.observacoes || "",
          valor: null,
          status: null,
          origem: "PMOC",
        }
      );
    }
  }

  // Checklists
  for (const c of await ler("checklists:")) {
    registrar(
      { cliente: c.cliente, tipo: c.equipamento, marca: c.marca, modelo: c.modelo, btus: c.btus, serie: c.serie },
      {
        data: c.createdAt,
        categoria: "Checklist",
        titulo: `Checklist — ${c.conclusao?.nivel || ""}`,
        detalhe: c.conclusao?.texto || "",
        valor: null,
        status: null,
        origem: "Checklist",
      }
    );
  }

  const lista = [...mapa.values()];
  lista.forEach((eq) => eq.eventos.sort((a, b) => (String(a.data) < String(b.data) ? 1 : -1)));
  lista.sort((a, b) => {
    const da = a.eventos[0]?.data || "";
    const db = b.eventos[0]?.data || "";
    return da < db ? 1 : -1;
  });
  return lista;
}

const HIST_CATEGORIA_COR = {
  Instalação: "#4681DF",
  Manutenção: "#4ADE80",
  "Manutenção Preventiva": "#4ADE80",
  "Manutenção Corretiva": "#E9C878",
  Higienização: "#3FBCD1",
  Orçamento: "#C9A24B",
  PMOC: "#9B8AFB",
  Checklist: "#E07A30",
  Refrigeração: "#3FBCD1",
  Relatório: "#8A8A90",
};

function HistoricoEquipamento() {
  const [equipamentos, setEquipamentos] = useState(null);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState(null);

  useEffect(() => {
    montarHistoricoEquipamentos()
      .then(setEquipamentos)
      .catch((err) => {
        notificarErroBanco(diagnosticarErroFirestore(err, "carregar histórico"));
        setEquipamentos([]);
      });
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return equipamentos || [];
    return (equipamentos || []).filter((e) =>
      [e.cliente, e.tipo, e.marca, e.modelo, e.serie, e.btus].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [equipamentos, busca]);

  if (selecionado) {
    const eq = selecionado;
    return (
      <div style={{ padding: 16, paddingBottom: 40 }}>
        <button onClick={() => setSelecionado(null)} style={{ background: "none", border: "none", color: "#8A8A90", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <ChevronLeft size={15} /> voltar
        </button>

        <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 19, fontWeight: 600, color: "#F3F3F1" }}>
          {[eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(" ") || "Equipamento"}
        </div>
        <div style={{ fontSize: 12.5, color: "#8A8A90", marginBottom: 14 }}>{eq.cliente}</div>

        <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 16, marginBottom: 18 }}>
          {[
            ["Cliente", eq.cliente],
            ["Tipo", eq.tipo || "-"],
            ["Marca", eq.marca || "-"],
            ["Modelo", eq.modelo || "-"],
            ["Capacidade/BTU", eq.btus || "-"],
            ["Gás", eq.gas || "-"],
            ["Nº de série", eq.serie || "-"],
            ["Registros", `${eq.eventos.length}`],
          ].map(([l, v]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ color: "#8A8A90", fontSize: 12.5 }}>{l}</span>
              <span style={{ color: "#F3F3F1", fontSize: 12.5, textAlign: "right", maxWidth: "60%" }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>
          Linha do tempo
        </div>

        <div style={{ position: "relative", paddingLeft: 18 }}>
          <div style={{ position: "absolute", left: 5, top: 4, bottom: 4, width: 1, background: "rgba(201,162,75,0.25)" }} />
          {eq.eventos.map((ev, i) => {
            const cor = HIST_CATEGORIA_COR[ev.categoria] || "#C9A24B";
            return (
              <div key={i} style={{ position: "relative", marginBottom: 16 }}>
                <div style={{ position: "absolute", left: -17, top: 4, width: 9, height: 9, borderRadius: "50%", background: cor, border: "2px solid #000" }} />
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#6E6E73", marginBottom: 3 }}>
                  {ev.data ? new Date(ev.data).toLocaleDateString("pt-BR") : "sem data"} · {ev.origem}
                </div>
                <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14, color: "#F3F3F1" }}>{ev.titulo}</div>
                {ev.detalhe && <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3, lineHeight: 1.4 }}>{ev.detalhe}</div>}
                <div style={{ display: "flex", gap: 10, marginTop: 5 }}>
                  {ev.status && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, color: cor }}>{ev.status}</span>}
                  {ev.valor ? <span style={{ fontSize: 11.5, color: "#E9C878", fontWeight: 600 }}>R$ {Number(ev.valor).toFixed(2)}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search size={15} color="#6E6E73" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, marca, modelo, série..." style={{ ...inputStyle, paddingLeft: 34 }} />
      </div>

      {equipamentos === null ? (
        <div style={{ textAlign: "center", padding: 30 }}><Loader2 size={20} className="spin" /></div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73" }}>
          <History size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>
            {(equipamentos || []).length === 0
              ? "Nenhum equipamento no histórico ainda. Ele é montado a partir das OS, orçamentos, PMOCs e checklists já registrados."
              : "Nenhum equipamento encontrado para essa busca."}
          </div>
        </div>
      ) : (
        filtrados.map((eq) => (
          <button
            key={eq.chave}
            onClick={() => setSelecionado(eq)}
            style={{ width: "100%", textAlign: "left", background: "#141416", border: "1px solid #2A2A2E", borderRadius: 12, padding: "13px 14px", marginBottom: 10, cursor: "pointer" }}
          >
            <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14.5, color: "#F3F3F1" }}>
              {[eq.tipo, eq.marca, eq.modelo].filter(Boolean).join(" ") || "Equipamento"}
            </div>
            <div style={{ fontSize: 12, color: "#8A8A90", marginTop: 3 }}>
              {eq.cliente}{eq.btus ? ` · ${eq.btus} BTUs` : ""}{eq.serie ? ` · série ${eq.serie}` : ""}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#C9A24B", marginTop: 6 }}>
              {eq.eventos.length} registro(s) · último em {eq.eventos[0]?.data ? new Date(eq.eventos[0].data).toLocaleDateString("pt-BR") : "-"}
            </div>
          </button>
        ))
      )}
    </div>
  );
}

/* ---------------- Ferramenta: Checklist do Equipamento com IA ---------------- */
const CHECKLIST_CATEGORIAS = [
  { cat: "Identificação", itens: ["Placa de identificação legível", "Modelo/série conferidos", "Equipamento compatível com o ambiente"] },
  { cat: "Elétrica", itens: ["Tensão de alimentação", "Disjuntor dedicado", "Aterramento", "Cabos e conexões", "Corrente de operação"] },
  { cat: "Evaporadora", itens: ["Fixação da unidade", "Serpentina limpa", "Filtros de ar", "Turbina/rotor", "Bandeja de condensado"] },
  { cat: "Condensadora", itens: ["Fixação e nivelamento", "Serpentina limpa", "Hélice do ventilador", "Compressor (ruído/vibração)", "Ventilação livre"] },
  { cat: "Tubulação", itens: ["Isolamento térmico", "Conexões flare", "Sem amassados/dobras", "Fixação da linha"] },
  { cat: "Drenagem", itens: ["Escoamento livre", "Caimento correto", "Sem vazamentos", "Sifão quando aplicável"] },
  { cat: "Ventilação", itens: ["Vazão de ar adequada", "Distribuição do ar", "Sem obstruções"] },
  { cat: "Pressão", itens: ["Pressão de sucção", "Pressão de descarga", "Carga de gás adequada", "Teste de estanqueidade"] },
  { cat: "Temperatura", itens: ["Temperatura de insuflamento", "Temperatura de retorno", "Delta T dentro do esperado"] },
  { cat: "Limpeza", itens: ["Higienização realizada", "Uso de produto adequado", "Ambiente protegido durante o serviço"] },
  { cat: "Funcionamento", itens: ["Controle remoto/comandos", "Modos de operação", "Ciclo de degelo (quando aplicável)", "Operação estável após o serviço"] },
];
const CHECK_OPCOES = ["OK", "ATENÇÃO", "NÃO CONFORME", "N/A"];
const CHECK_CORES = { OK: "#4ADE80", "ATENÇÃO": "#E9C878", "NÃO CONFORME": "#F0605A", "N/A": "#6E6E73" };

/* Conclusão técnica gerada por regras determinísticas sobre o que FOI marcado.
   Não inventa medições nem diagnósticos que o técnico não registrou. */
function gerarConclusaoChecklist(respostas, medicoes) {
  const marcados = Object.entries(respostas).filter(([, v]) => v && v !== "N/A");
  if (marcados.length === 0) {
    return {
      nivel: "SEM DADOS",
      cor: "#6E6E73",
      texto: "Nenhum item foi avaliado ainda. Preencha o checklist para gerar a conclusão técnica.",
      pendencias: [],
    };
  }
  const naoConformes = marcados.filter(([, v]) => v === "NÃO CONFORME").map(([k]) => k);
  const atencoes = marcados.filter(([, v]) => v === "ATENÇÃO").map(([k]) => k);
  const oks = marcados.filter(([, v]) => v === "OK").length;

  const partes = [];
  partes.push(`Foram avaliados ${marcados.length} itens: ${oks} conformes, ${atencoes.length} em atenção e ${naoConformes.length} não conformes.`);

  if (medicoes.deltaT) {
    const dt = parseFloat(String(medicoes.deltaT).replace(",", "."));
    if (!isNaN(dt)) {
      if (dt < 8) partes.push(`Delta T informado de ${dt}°C está abaixo da faixa usual (8–12°C), o que costuma indicar baixa troca térmica — verificar carga de gás, sujeira na serpentina ou vazão de ar.`);
      else if (dt > 14) partes.push(`Delta T informado de ${dt}°C está acima da faixa usual (8–12°C), o que costuma indicar baixa vazão de ar — verificar filtros, turbina e obstruções.`);
      else partes.push(`Delta T informado de ${dt}°C está dentro da faixa usual (8–12°C).`);
    }
  }

  let nivel, cor;
  if (naoConformes.length > 0) {
    nivel = "REPROVADO";
    cor = "#F0605A";
    partes.push("Equipamento apresenta não conformidades que exigem correção antes da liberação.");
  } else if (atencoes.length > 0) {
    nivel = "APROVADO COM RESSALVAS";
    cor = "#E9C878";
    partes.push("Equipamento em condição de uso, porém com pontos que devem ser acompanhados na próxima manutenção.");
  } else {
    nivel = "APROVADO";
    cor = "#4ADE80";
    partes.push("Equipamento aprovado em todos os itens avaliados.");
  }

  return {
    nivel,
    cor,
    texto: partes.join(" "),
    pendencias: [...naoConformes.map((i) => ({ item: i, tipo: "NÃO CONFORME" })), ...atencoes.map((i) => ({ item: i, tipo: "ATENÇÃO" }))],
  };
}

function ChecklistEquipamento() {
  const [cabecalho, setCabecalho] = useState({ cliente: "", equipamento: "", marca: "", modelo: "", btus: "", serie: "", tecnico: "" });
  const [respostas, setRespostas] = useState({});
  const [medicoes, setMedicoes] = useState({ tensao: "", corrente: "", pressaoSuccao: "", pressaoDescarga: "", tempInsuflamento: "", tempRetorno: "", deltaT: "" });
  const [observacoes, setObservacoes] = useState("");
  const [aberta, setAberta] = useState("Identificação");
  const [saving, setSaving] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const conclusao = useMemo(() => gerarConclusaoChecklist(respostas, medicoes), [respostas, medicoes]);
  const totalItens = CHECKLIST_CATEGORIAS.reduce((a, c) => a + c.itens.length, 0);
  const preenchidos = Object.values(respostas).filter(Boolean).length;

  // Delta T calculado automaticamente quando as duas temperaturas existirem
  useEffect(() => {
    const r = parseFloat(String(medicoes.tempRetorno).replace(",", "."));
    const i = parseFloat(String(medicoes.tempInsuflamento).replace(",", "."));
    if (!isNaN(r) && !isNaN(i)) {
      const dt = (r - i).toFixed(1);
      setMedicoes((m) => (m.deltaT === dt ? m : { ...m, deltaT: dt }));
    }
  }, [medicoes.tempRetorno, medicoes.tempInsuflamento]);

  const salvar = async () => {
    if (saving) return;
    if (!cabecalho.cliente.trim()) {
      notificarErroBanco("Informe o cliente antes de salvar o checklist.");
      return;
    }
    setSaving(true);
    try {
      const id = uid();
      const reg = {
        id,
        ...cabecalho,
        respostas,
        medicoes,
        observacoes,
        conclusao: { nivel: conclusao.nivel, texto: conclusao.texto, pendencias: conclusao.pendencias },
        createdAt: new Date().toISOString(),
      };
      await window.storage.set(`checklists:${id}`, JSON.stringify(reg));
      setSalvo(true);
      setTimeout(() => setSalvo(false), 4000);
    } catch (err) {
      notificarErroBanco(diagnosticarErroFirestore(err, "salvar checklist"));
    } finally {
      setSaving(false);
    }
  };

  const setCab = (k) => (e) => setCabecalho((c) => ({ ...c, [k]: e.target.value }));
  const setMed = (k) => (e) => setMedicoes((m) => ({ ...m, [k]: e.target.value }));

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
        Identificação
      </div>
      <Field label="Cliente"><input style={inputStyle} value={cabecalho.cliente} onChange={setCab("cliente")} /></Field>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Equipamento"><input style={inputStyle} value={cabecalho.equipamento} onChange={setCab("equipamento")} placeholder="Ex: Split" /></Field></div>
        <div style={{ flex: 1 }}><Field label="BTUs"><input style={inputStyle} value={cabecalho.btus} onChange={setCab("btus")} inputMode="numeric" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Marca"><input style={inputStyle} value={cabecalho.marca} onChange={setCab("marca")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Modelo"><input style={inputStyle} value={cabecalho.modelo} onChange={setCab("modelo")} /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Nº de série"><input style={inputStyle} value={cabecalho.serie} onChange={setCab("serie")} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Técnico"><input style={inputStyle} value={cabecalho.tecnico} onChange={setCab("tecnico")} /></Field></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 10px" }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase" }}>Checklist</div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#8A8A90" }}>{preenchidos}/{totalItens}</div>
      </div>

      {CHECKLIST_CATEGORIAS.map(({ cat, itens }) => {
        const abertaAgora = aberta === cat;
        const respondidos = itens.filter((i) => respostas[`${cat} — ${i}`]).length;
        return (
          <div key={cat} style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, marginBottom: 10, overflow: "hidden" }}>
            <button
              onClick={() => setAberta(abertaAgora ? "" : cat)}
              style={{ width: "100%", background: "transparent", border: "none", padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            >
              <span style={{ fontFamily: "'Roboto',sans-serif", fontSize: 14, color: "#F3F3F1" }}>{cat}</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: respondidos === itens.length ? "#4ADE80" : "#8A8A90" }}>
                {respondidos}/{itens.length}
              </span>
            </button>
            {abertaAgora && (
              <div style={{ padding: "0 14px 14px" }}>
                {itens.map((item) => {
                  const chave = `${cat} — ${item}`;
                  return (
                    <div key={item} style={{ marginBottom: 12 }}>
                      <div style={{ color: "#C7C9CE", fontSize: 12.5, marginBottom: 6 }}>{item}</div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {CHECK_OPCOES.map((op) => {
                          const ativo = respostas[chave] === op;
                          return (
                            <button
                              key={op}
                              onClick={() => setRespostas((r) => ({ ...r, [chave]: ativo ? undefined : op }))}
                              style={{
                                fontSize: 10.5,
                                padding: "5px 9px",
                                borderRadius: 7,
                                border: `1px solid ${ativo ? CHECK_CORES[op] : "#2A2A2E"}`,
                                background: ativo ? `${CHECK_CORES[op]}22` : "transparent",
                                color: ativo ? CHECK_CORES[op] : "#8A8A90",
                                cursor: "pointer",
                              }}
                            >
                              {op}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", margin: "18px 0 10px" }}>
        Medições
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Tensão (V)"><input style={inputStyle} value={medicoes.tensao} onChange={setMed("tensao")} inputMode="decimal" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Corrente (A)"><input style={inputStyle} value={medicoes.corrente} onChange={setMed("corrente")} inputMode="decimal" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Pressão sucção"><input style={inputStyle} value={medicoes.pressaoSuccao} onChange={setMed("pressaoSuccao")} inputMode="decimal" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Pressão descarga"><input style={inputStyle} value={medicoes.pressaoDescarga} onChange={setMed("pressaoDescarga")} inputMode="decimal" /></Field></div>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Temp. insuflamento (°C)"><input style={inputStyle} value={medicoes.tempInsuflamento} onChange={setMed("tempInsuflamento")} inputMode="decimal" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Temp. retorno (°C)"><input style={inputStyle} value={medicoes.tempRetorno} onChange={setMed("tempRetorno")} inputMode="decimal" /></Field></div>
      </div>
      <Field label="Delta T (°C) — calculado"><input style={{ ...inputStyle, color: "#E9C878" }} value={medicoes.deltaT} onChange={setMed("deltaT")} inputMode="decimal" /></Field>

      <Field label="Observações">
        <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
      </Field>

      <div style={{ background: "linear-gradient(135deg,#151517,#1C1C1F)", border: `1px solid ${conclusao.cor}55`, borderRadius: 16, padding: 18, margin: "18px 0" }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
          Conclusão técnica
        </div>
        <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 18, fontWeight: 700, color: conclusao.cor, marginBottom: 8 }}>{conclusao.nivel}</div>
        <div style={{ color: "#C7C9CE", fontSize: 13, lineHeight: 1.5 }}>{conclusao.texto}</div>
        {conclusao.pendencias.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#8A8A90", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Pendências</div>
            {conclusao.pendencias.map((p, i) => (
              <div key={i} style={{ fontSize: 12, color: CHECK_CORES[p.tipo], marginBottom: 4 }}>• {p.item}</div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 11, color: "#6E6E73", lineHeight: 1.4 }}>
          Conclusão gerada a partir dos itens que você marcou e das medições informadas. Nenhum valor é presumido — confirme sempre com o manual do fabricante.
        </div>
      </div>

      {salvo && <div style={{ textAlign: "center", color: "#4ADE80", fontSize: 12.5, marginBottom: 10 }}>Checklist salvo com sucesso.</div>}

      <button
        onClick={salvar}
        disabled={saving || !cabecalho.cliente.trim()}
        style={{ width: "100%", background: !saving && cabecalho.cliente.trim() ? "linear-gradient(135deg,#C9A24B,#E9C878)" : "#2A2A2E", border: "none", borderRadius: 12, padding: "13px 0", color: !saving && cabecalho.cliente.trim() ? "#0A0A0B" : "#6E6E73", fontFamily: "'Roboto',sans-serif", fontWeight: 600, fontSize: 13, textTransform: "uppercase", cursor: saving ? "default" : "pointer" }}
      >
        {saving ? "Salvando..." : "Salvar checklist"}
      </button>
    </div>
  );
}

/* ---------------- Ferramenta: Relatórios Financeiros ----------------
   Agrega dados reais já existentes (receitas, despesas, OS, orçamentos)
   com filtros de período e os mesmos gráficos premium do Financeiro. */
const REL_FILTROS = ["Hoje", "Semana", "Mês", "Trimestre", "Ano", "Personalizado"];

function relBounds(filtro, custom) {
  const hoje = new Date();
  const ini = new Date(hoje);
  if (filtro === "Hoje") ini.setHours(0, 0, 0, 0);
  else if (filtro === "Semana") { ini.setDate(hoje.getDate() - hoje.getDay()); ini.setHours(0, 0, 0, 0); }
  else if (filtro === "Mês") { ini.setDate(1); ini.setHours(0, 0, 0, 0); }
  else if (filtro === "Trimestre") { ini.setMonth(hoje.getMonth() - 2, 1); ini.setHours(0, 0, 0, 0); }
  else if (filtro === "Ano") { ini.setMonth(0, 1); ini.setHours(0, 0, 0, 0); }
  else if (filtro === "Personalizado" && custom?.inicio && custom?.fim) {
    return { inicio: new Date(custom.inicio), fim: new Date(custom.fim + "T23:59:59") };
  }
  return { inicio: ini, fim: hoje };
}

function relDentro(dataStr, bounds) {
  if (!dataStr) return false;
  const d = new Date(dataStr);
  return d >= bounds.inicio && d <= bounds.fim;
}

function RelatoriosFinanceiros() {
  const [dados, setDados] = useState(null);
  const [filtro, setFiltro] = useState("Mês");
  const [custom, setCustom] = useState({ inicio: "", fim: "" });

  useEffect(() => {
    (async () => {
      const ler = async (prefixo) => {
        try {
          const list = await window.storage.list(prefixo);
          const out = [];
          for (const key of (list && list.keys) || []) {
            const r = await window.storage.get(key).catch(() => null);
            if (r) out.push(JSON.parse(r.value));
          }
          return out;
        } catch {
          return [];
        }
      };
      try {
        const [receitas, despesas, ordens, orcamentos] = await Promise.all([
          ler("fin-receitas:"),
          ler("fin-despesas:"),
          ler("ordens-servico:"),
          ler("orcamentos:"),
        ]);
        setDados({ receitas, despesas, ordens, orcamentos });
      } catch (err) {
        notificarErroBanco(diagnosticarErroFirestore(err, "carregar relatórios"));
        setDados({ receitas: [], despesas: [], ordens: [], orcamentos: [] });
      }
    })();
  }, []);

  const r = useMemo(() => {
    if (!dados) return null;
    const b = relBounds(filtro, custom);
    const receitas = dados.receitas.filter((x) => relDentro(x.data || x.createdAt, b));
    const despesas = dados.despesas.filter((x) => relDentro(x.data || x.createdAt, b));
    const ordens = dados.ordens.filter((x) => relDentro(x.data || x.createdAt, b));
    const orcamentos = dados.orcamentos.filter((x) => relDentro(x.createdAt, b));

    const faturamento = receitas.reduce((a, x) => a + (Number(x.valor) || 0), 0);
    const recebido = receitas.filter((x) => x.status === "pago").reduce((a, x) => a + (Number(x.valor) || 0), 0);
    const pendente = receitas.filter((x) => x.status !== "pago").reduce((a, x) => a + (Number(x.valor) || 0), 0);
    const totalDespesas = despesas.reduce((a, x) => a + (Number(x.valor) || 0), 0);
    const lucro = recebido - totalDespesas;
    const osConcluidas = ordens.filter((o) => o.status === "FINALIZADA").length;

    // serviços mais realizados (dados reais das OS)
    const porServico = {};
    ordens.forEach((o) => {
      const s = o.tipoServico || "Outros";
      porServico[s] = (porServico[s] || 0) + 1;
    });
    const servicos = Object.entries(porServico).sort((a, b) => b[1] - a[1]).slice(0, 6);

    // despesas por categoria (donut)
    const porCategoria = {};
    despesas.forEach((d) => {
      const c = d.categoria || "Outros";
      porCategoria[c] = (porCategoria[c] || 0) + (Number(d.valor) || 0);
    });
    const categorias = Object.entries(porCategoria).map(([nome, valor]) => ({ nome, valor }));

    return {
      faturamento, recebido, pendente, totalDespesas, lucro,
      osConcluidas, totalOS: ordens.length, totalOrcamentos: orcamentos.length,
      servicos, categorias, receitasCount: receitas.length,
      temDados: receitas.length + despesas.length + ordens.length + orcamentos.length > 0,
    };
  }, [dados, filtro, custom]);

  if (!dados || !r) {
    return <div style={{ textAlign: "center", padding: 40 }}><Loader2 size={20} className="spin" /></div>;
  }

  const cards = [
    ["Faturamento", `R$ ${r.faturamento.toFixed(2)}`, "#E9C878"],
    ["Recebido", `R$ ${r.recebido.toFixed(2)}`, "#4ADE80"],
    ["A receber", `R$ ${r.pendente.toFixed(2)}`, "#4681DF"],
    ["Despesas", `R$ ${r.totalDespesas.toFixed(2)}`, "#F0605A"],
    ["Lucro", `R$ ${r.lucro.toFixed(2)}`, r.lucro >= 0 ? "#4ADE80" : "#F0605A"],
    ["OS concluídas", String(r.osConcluidas), "#F5F5F5"],
    ["OS no período", String(r.totalOS), "#F5F5F5"],
    ["Orçamentos", String(r.totalOrcamentos), "#F5F5F5"],
  ];

  return (
    <div style={{ padding: 16, paddingBottom: 40 }}>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 16 }}>
        {REL_FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            style={{ flexShrink: 0, fontSize: 11.5, padding: "7px 12px", borderRadius: 20, border: `1px solid ${filtro === f ? "#C9A24B" : "#2A2A2E"}`, background: filtro === f ? "rgba(201,162,75,0.15)" : "transparent", color: filtro === f ? "#E9C878" : "#8A8A90", cursor: "pointer", whiteSpace: "nowrap" }}
          >
            {f}
          </button>
        ))}
      </div>

      {filtro === "Personalizado" && (
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1 }}><Field label="De"><input type="date" style={inputStyle} value={custom.inicio} onChange={(e) => setCustom((c) => ({ ...c, inicio: e.target.value }))} /></Field></div>
          <div style={{ flex: 1 }}><Field label="Até"><input type="date" style={inputStyle} value={custom.fim} onChange={(e) => setCustom((c) => ({ ...c, fim: e.target.value }))} /></Field></div>
        </div>
      )}

      {!r.temDados ? (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "#6E6E73" }}>
          <LineChart size={28} style={{ marginBottom: 10, opacity: 0.6 }} />
          <div style={{ fontSize: 13.5 }}>Nenhum movimento registrado neste período.</div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
            {cards.map(([label, valor, cor]) => (
              <div key={label} style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "12px 14px" }}>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#8A8A8A", letterSpacing: 1.4, textTransform: "uppercase" }}>{label}</div>
                <div style={{ fontFamily: "'Roboto',sans-serif", fontWeight: 700, fontSize: 19, color: cor, marginTop: 3 }}>{valor}</div>
              </div>
            ))}
          </div>

          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
            Receitas x Despesas
          </div>
          <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 16, marginBottom: 18 }}>
            <MiniBarChart data={[{ label: "Receitas", value: r.faturamento }, { label: "Despesas", value: -r.totalDespesas }]} />
          </div>

          {r.categorias.length > 0 && (
            <>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
                Despesas por categoria
              </div>
              <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 16, marginBottom: 18 }}>
                <DonutChart dados={r.categorias} />
              </div>
            </>
          )}

          {r.servicos.length > 0 && (
            <>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: "#C9A24B", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>
                Serviços mais realizados
              </div>
              <div style={{ background: "#0D0D0D", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 16, marginBottom: 18 }}>
                {r.servicos.map(([nome, qtd]) => {
                  const max = r.servicos[0][1] || 1;
                  return (
                    <div key={nome} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, color: "#C7C9CE" }}>{nome}</span>
                        <span style={{ fontSize: 12, color: "#E9C878", fontFamily: "'JetBrains Mono',monospace" }}>{qtd}</span>
                      </div>
                      <div style={{ height: 6, background: "#1C1C1F", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${(qtd / max) * 100}%`, height: "100%", background: "linear-gradient(90deg,#C9A24B,#E9C878)", borderRadius: 3 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- Proteção contra tela branca ----------------
   Se qualquer módulo quebrar, o app mostra uma tela de erro dentro da
   identidade AMOLED (em vez de ficar totalmente branco) e permite voltar
   ao início sem perder o acesso ao restante do sistema. */
class LimiteDeErro extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error("[ALLA CHECK] Falha na tela:", this.props.tela || "(desconhecida)", erro, info);
  }

  componentDidUpdate(prevProps) {
    // ao trocar de tela, limpa o erro para não travar o app na tela quebrada
    if (this.state.erro && prevProps.tela !== this.props.tela) {
      this.setState({ erro: null });
    }
  }

  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <div style={{ padding: 28, textAlign: "center", color: "#C7C9CE" }}>
        <div
          style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            margin: "10px auto 16px",
            background: "rgba(240,96,90,0.10)",
            border: "1px solid rgba(240,96,90,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={24} color="#F0605A" />
        </div>
        <div style={{ fontFamily: "'Roboto',sans-serif", fontSize: 17, fontWeight: 600, color: "#F3F3F1", marginBottom: 8 }}>
          Esta tela apresentou um erro
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
          O restante do aplicativo continua funcionando normalmente. Seus dados salvos não foram afetados.
        </div>
        <div
          style={{
            background: "#141416",
            border: "1px solid #2A2A2E",
            borderRadius: 10,
            padding: "10px 12px",
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: 10.5,
            color: "#8A8A90",
            textAlign: "left",
            marginBottom: 18,
            wordBreak: "break-word",
          }}
        >
          {String((this.state.erro && this.state.erro.message) || this.state.erro).slice(0, 220)}
        </div>
        <button
          onClick={() => {
            this.setState({ erro: null });
            this.props.onVoltar && this.props.onVoltar();
          }}
          style={{
            background: "linear-gradient(135deg,#C9A24B,#E9C878)",
            border: "none",
            borderRadius: 12,
            padding: "12px 22px",
            color: "#0A0A0B",
            fontFamily: "'Roboto',sans-serif",
            fontWeight: 600,
            fontSize: 13,
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Voltar ao início
        </button>
      </div>
    );
  }
}

/* Porta de entrada: enquanto não houver sessão válida, o app não é montado.
   Assim nenhuma tela interna fica acessível sem autenticação. */
/* Protege o aplicativo: sem sessão válida, só a tela de login é exibida. */
/* Porta de entrada: sem sessão válida o app interno nem chega a ser montado,
   então nenhuma tela protegida fica acessível sem login. */
export default function AllaCheckApp() {
  const [usuario, setUsuario] = useState(undefined); // undefined = ainda verificando
  const [semAuth, setSemAuth] = useState(false);

  useEffect(() => {
    const auth = obterAuth();
    if (!auth) {
      setSemAuth(true);
      setUsuario(null);
      return;
    }
    const parar = onAuthStateChanged(
      auth,
      (u) => setUsuario(u || null),
      (e) => {
        console.error("ALLA CHECK: falha ao verificar a sessão", e);
        setUsuario(null);
      }
    );
    return () => parar();
  }, []);

  if (usuario === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={22} className="spin" color="#C9A24B" />
      </div>
    );
  }

  if (semAuth) {
    return (
      <div style={{ minHeight: "100vh", background: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 340, textAlign: "center", color: "#8A8A90", fontSize: 13.5, lineHeight: 1.6 }}>
          <img src={LOGO_DATA_URI} alt="" style={{ width: 130, display: "block", margin: "0 auto 20px" }} />
          Não foi possível iniciar a autenticação. Verifique a conexão e recarregue a página.
        </div>
      </div>
    );
  }

  // LOGIN DESATIVADO POR ORA:
  // a tela de login já está pronta logo abaixo. Para ativá-la, basta
  // habilitar E-mail/senha no Firebase e trocar esta linha por:
  //   if (!usuario) return <TelaAutenticacao />;
  return <AllaCheckAppInterno usuario={usuario} />;
}


function AllaCheckAppInterno({ usuario }) {
  const [view, setView] = useState("home");
  const [reportCount, setReportCount] = useState(0);
  const [orcamentosCount, setOrcamentosCount] = useState(0);
  const [vendasCount, setVendasCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [importProgress, setImportProgress] = useState(null);
  const [importDone, setImportDone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshCount = useCallback(async () => {
    // "Ordens Concluídas" deve contar as OS finalizadas (comuns + OS Frio),
    // e não a coleção de relatórios técnicos.
    try {
      let concluidas = 0;
      for (const prefixo of ["ordens-servico:", "os-frio:"]) {
        const lista = await window.storage.list(prefixo).catch(() => null);
        for (const chave of (lista && lista.keys) || []) {
          const doc = await window.storage.get(chave).catch(() => null);
          if (!doc) continue;
          try {
            const st = String(JSON.parse(doc.value).status || "").toUpperCase();
            if (st === "FINALIZADA") concluidas++;
          } catch {
            /* registro ilegível: não conta */
          }
        }
      }
      setReportCount(concluidas);
    } catch {
      setReportCount(0);
    }
    try {
      const listO = await window.storage.list("orcamentos:");
      setOrcamentosCount(listO && listO.keys ? listO.keys.length : 0);
    } catch {
      setOrcamentosCount(0);
    }
    try {
      const listV = await window.storage.list("cervejeiras-vendas:");
      setVendasCount(listV && listV.keys ? listV.keys.length : 0);
    } catch {
      setVendasCount(0);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const result = await runLegacyImportOnce((p) => setImportProgress(p));
      setImportDone(true);
      if (result && result.failed) {
        console.warn(`Importação de dados legados: ${result.failed} de ${result.total} registros falharam — serão tentados novamente na próxima abertura do app.`);
      }
      setRefreshKey((k) => k + 1);
    })();
  }, []);

  useEffect(() => {
    refreshCount();
  }, [refreshCount, refreshKey]);

  const toolTitles = Object.fromEntries(TOOLS.map((t) => [`tool-${t.key}`, t.label]));

  const titles = {
    home: "Home Técnico",
    "novo-relatorio": "Novo Relatório",
    historico: "Histórico",
    ferramentas: "Ferramentas",
    ...toolTitles,
    documentos: "Recibos & Orçamentos",
    orcamentos: "Orçamentos",
    recibos: "Recibos",
    pmocs: "PMOCs",
    os: "Ordens de Serviço",
    financeiro: "Financeiro",
    "os-frio": "OS Frio",
    "central-whatsapp": "Central WhatsApp",
    "gestao-inteligente": "Gestão Inteligente",
    "vendas-cervejeira": "Vendas Cervejeira",
    funcionarios: "Funcionários",
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 460,
        margin: "0 auto",
        minHeight: "100vh",
        background: "#000000",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Roboto',sans-serif",
        position: "relative",
      }}
    >
      <style>{`
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        select option { background: #141416; }
        ::placeholder { color: #5A5A5F; }

        /* ---- premium card interaction — depth only ---- */
        .premium-card {
          position: relative;
          -webkit-tap-highlight-color: transparent;
          transition: transform 190ms cubic-bezier(.4,0,.2,1), box-shadow 200ms cubic-bezier(.4,0,.2,1);
          will-change: transform;
        }
        @media (hover: hover) and (pointer: fine) {
          .premium-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 12px 26px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,162,75,0.16);
          }
        }
        .premium-card.is-pressed {
          transform: scale(0.97) !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.5) !important;
          transition: transform 100ms cubic-bezier(.4,0,.2,1), box-shadow 100ms cubic-bezier(.4,0,.2,1);
        }
      `}</style>

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={setView}
        usuario={usuario}
        onSair={async () => {
          try {
            const auth = obterAuth();
            if (auth) await signOut(auth);
          } catch (e) {
            console.error("Erro ao sair", e);
            notificarErroBanco("Não foi possível sair. Tente novamente.");
          }
        }}
      />

      {view !== "home" && view !== "gestao-inteligente" && view !== "financeiro" && (
        <Header
          title={titles[view]}
          onBack={() => setView("home")}
          onMenu={() => setMenuOpen(true)}
        />
      )}

      <div style={{ flex: view === "home" ? "0 0 auto" : 1 }}>
        <LimiteDeErro tela={view} onVoltar={() => setView("home")}>
        {/* key={view}: faz o React remontar ao trocar de tela, disparando
            a animação de entrada a cada navegação (ida e volta). */}
        <div key={view} className="alla-tela">
        {view === "home" && (
          <HomeScreen
            onNavigate={setView}
            onMenu={() => setMenuOpen(true)}
            reportCount={reportCount}
            orcamentosCount={orcamentosCount}
            vendasCount={vendasCount}
            importProgress={importProgress}
            importDone={importDone}
          />
        )}
        {view === "novo-relatorio" && (
          <NovoRelatorio onSaved={() => setRefreshKey((k) => k + 1)} />
        )}
        {view === "historico" && <Historico refreshKey={refreshKey} />}
        {view === "ferramentas" && <FerramentasScreen onNavigate={setView} />}
        {view === "tool-btu" && <BtuCalculator />}
        {view === "tool-conversor" && <TechConverter onNavigate={setView} />}
        {view === "tool-orcamento-ia" && (
          <OrcamentosModule onRefreshApp={() => setRefreshKey((k) => k + 1)} />
        )}
        {view === "tool-pecas-ia" && <PartsAssistant />}
        {view === "tool-laudo-tecnico" && <LaudoTecnico />}
        {view === "tool-assinaturas" && <AssinaturasModule />}
        {view === "tool-rastreio-tecnico" && <RastreioTecnico />}
        {view === "tool-historico-equipamento" && <HistoricoEquipamento />}
        {view === "tool-checklist-ia" && <ChecklistEquipamento />}
        {view === "tool-relatorios-financeiros" && <RelatoriosFinanceiros />}
        {view === "pmocs" && <PmocTool />}
        {view === "documentos" && <RecibosEOrcamentosHub onNavigate={setView} />}
        {view === "orcamentos" && <OrcamentosModule onRefreshApp={() => setRefreshKey((k) => k + 1)} />}
        {view === "recibos" && <RecibosModule />}
        {view === "os" && <OrdensServicoModule />}
        {view === "financeiro" && <FinanceiroModule onBack={() => setView("home")} />}
        {view === "os-frio" && <OSFrioModule />}
        {view === "central-whatsapp" && <CentralWhatsApp />}
        {view === "gestao-inteligente" && <GestaoInteligente onBack={() => setView("home")} />}
        {view === "vendas-cervejeira" && <VendasCervejeiraModule />}
        {view === "funcionarios" && <FuncionariosModule />}
        {TOOLS.filter((t) => !t.active).some((t) => `tool-${t.key}` === view) && (
          <EmBreve label={titles[view]} />
        )}
        </div>
        </LimiteDeErro>
      </div>
    </div>
  );
}
