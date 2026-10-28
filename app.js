(() => {
  // ---------- Formatação (centavos) ----------
  const NB = ' ';
  const mil = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const brl = c => { const a = Math.abs(Math.round(c)); return (c < 0 ? '-' : '') + 'R$' + NB + mil(Math.floor(a / 100)) + ',' + String(a % 100).padStart(2, '0'); };
  const brl0 = c => { const r = Math.round(c / 100); return 'R$ ' + (r < 0 ? '-' : '') + mil(Math.abs(r)); };
  const OCULTO = 'R$ ••••';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const parseValor = t => Math.round((parseFloat(String(t).replace(/\./g, '').replace(',', '.')) || 0) * 100);

  // ---------- Datas ----------
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoje = () => iso(new Date());
  const ontem = () => { const d = new Date(); d.setDate(d.getDate() - 1); return iso(d); };
  const mesAtual = () => hoje().slice(0, 7);
  const tituloMes = m => { const [y, mm] = m.split('-').map(Number); const n = MESES[mm - 1]; return n[0].toUpperCase() + n.slice(1) + ' de ' + y; };
  const somaMes = (m, k) => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm - 1 + k, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const diasRestantes = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1; };
  const dataCurta = s => { if (s === hoje()) return 'Hoje'; if (s === ontem()) return 'Ontem'; const [y, m, d] = s.split('-').map(Number); return `${d} ${ABREV[m - 1]}` + (y === new Date().getFullYear() ? '' : ` ${y}`); };
  const dataLonga = s => { if (s === hoje()) return 'Hoje'; if (s === ontem()) return 'Ontem'; const [y, m, d] = s.split('-').map(Number); return `${d} de ${MESES[m - 1]}` + (y === new Date().getFullYear() ? '' : ` de ${y}`); };

  // ---------- Cores ----------
  const C = h => `oklch(0.62 0.12 ${h})`;
  const T = h => `oklch(0.94 0.035 ${h})`;
  const RECEITA_HUE = 150;

  // ---------- Estado ----------
  const S = {
    db: null, estado: 'carregando', // carregando | pronto | sem-acesso | vazio
    prontos: new Set(),
    cats: [], orc: {}, hist: {}, lanc: [], metas: [], aportes: [], config: {},
    aba: 'home', mes: mesAtual(), ocultar: false, catAberta: null, filtro: 'all', txAberta: null,
    folha: false, r: null, tentou: false, metaForm: false, ocupado: false,
    imp: null,
  };
  const COLECOES = ['categorias', 'orcamentos', 'historico', 'lancamentos', 'metas', 'aportes', 'config'];

  // ---------- Cálculos (regras do handoff) ----------
  function itensDoMes(m) {
    const h = (S.hist[m]?.itens || []).map((x, i) => ({ ...x, fonte: 'hist', ord: -i }));
    const a = S.lanc.filter(l => !l.oculto && (l.data || '').startsWith(m)).map(l => ({ ...l, fonte: 'app', ord: l.criadoEm || 0 }));
    return [...h, ...a].sort((x, y) => (x.data < y.data ? 1 : x.data > y.data ? -1 : y.ord - x.ord));
  }
  function calc(m) {
    const doc = S.orc[m] || {};
    const lim = doc.limites || {};
    const itens = itensDoMes(m);
    const gastoPor = {}; let gasto = 0, receitas = 0;
    for (const t of itens) {
      if (t.tipo === 'receita') receitas += t.valor;
      else { gasto += t.valor; gastoPor[t.categoria] = (gastoPor[t.categoria] || 0) + t.valor; }
    }
    const limiar = S.config.limiarAlerta || 0.8;
    const cats = S.cats.map(c => {
      const l = lim[c.slug] || 0, g = gastoPor[c.slug] || 0;
      const p = l > 0 ? g / l : (g > 0 ? Infinity : 0);
      return { ...c, l, g, p, semLimite: l === 0, passou: l > 0 && p > 1 };
    });
    const orcamento = cats.reduce((a, c) => a + c.l, 0);
    const renda = receitas > 0 ? receitas : (doc.rendaPlanejada || 0);
    return {
      itens, cats, orcamento, gasto, receitas, renda, restante: orcamento - gasto,
      sobra: renda - orcamento, limiar,
      alertas: cats.filter(c => !c.semLimite && c.p >= limiar).sort((a, b) => b.p - a.p),
    };
  }
  const pctTxt = p => (isFinite(p) ? Math.round(p * 100) : '—') + '%';
  const catPorSlug = s => S.cats.find(c => c.slug === s);

  // ---------- Peças ----------
  const m0 = v => (S.ocultar ? OCULTO : brl0(v));
  const mC = v => (S.ocultar ? OCULTO : brl(v));
  const barra = (pct, h, trilho, cor, extra = '') =>
    `<div class="barra" style="height:${h}px;background:${trilho};${extra}"><div style="width:${Math.max(0, Math.min(100, pct * 100))}%;background:${cor}"></div></div>`;
  const seletorMes = () => `
    <div class="mes" role="group" aria-label="Mês">
      <button data-a="mes" data-k="-1" aria-label="Mês anterior">‹</button>
      <span>${tituloMes(S.mes)}</span>
      <button data-a="mes" data-k="1" aria-label="Próximo mês">›</button>
      ${S.mes !== mesAtual() ? '<button class="hoje" data-a="mes-hoje">Voltar para hoje</button>' : ''}
    </div>`;
  function linha(t, comData) {
    const rec = t.tipo === 'receita';
    const cat = rec ? null : catPorSlug(t.categoria);
    const hue = rec ? RECEITA_HUE : (cat?.hue ?? 0);
    const nomeCat = rec ? 'Receita' : (cat?.nome || 'Sem categoria');
    const aberta = S.aba === 'tx' && S.txAberta === t.fonte + ':' + t.id;
    const tag = S.aba === 'tx' ? 'button' : 'div';
    return `
      <${tag} class="lanc" ${S.aba === 'tx' ? `data-a="tx" data-id="${esc(t.fonte + ':' + t.id)}" aria-expanded="${aberta}"` : ''}>
        <span class="av" style="background:${T(hue)};color:${C(hue)}">${esc((t.descricao || '?').charAt(0))}</span>
        <span class="txt"><span class="desc">${esc(t.descricao)}</span><span class="meta">${esc(nomeCat)}${t.conta ? ' · ' + esc(t.conta) : ''}${comData ? ' · ' + dataCurta(t.data) : ''}</span></span>
        <span class="v num" style="color:${rec ? 'var(--verde)' : 'var(--tinta)'}">${rec ? '+ ' : '− '}${mC(t.valor)}</span>
      </${tag}>
      ${aberta ? `<div class="acoes"><button class="btn-sec" data-a="tx-cancelar">Cancelar</button><button class="btn-perigo" data-a="tx-excluir" data-id="${esc(t.fonte + ':' + t.id)}">Excluir lançamento</button></div>` : ''}`;
  }

  // ---------- Telas ----------
  function telaInicio() {
    const r = calc(S.mes);
    const atual = S.mes === mesAtual(), passado = S.mes < mesAtual();
    const rotuloSaldo = atual ? 'Ainda pode gastar este mês'
      : passado ? (r.restante < 0 ? 'Passou do orçamento no mês' : 'Sobrou do orçamento no mês')
      : 'Orçamento livre no mês';
    const dias = diasRestantes();
    const porDia = atual && r.restante > 0;
    const recentes = r.itens.slice(0, 5);
    return `
    <div class="tela" style="gap:28px">
      <div class="cab">
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
          ${seletorMes()}
          <span style="font-size:17px;font-weight:600">Olá, ${esc(S.config.nome || '')}</span>
        </div>
        <button class="pill" data-a="ocultar">${S.ocultar ? 'Mostrar valores' : 'Ocultar valores'}</button>
      </div>
      <div class="home-cols"><div class="home-a">
      <div class="saldo">
        <span style="font-size:13px;color:var(--pessego)">${rotuloSaldo}</span>
        <span class="valor num" style="color:${r.restante < 0 ? 'var(--pessego)' : 'var(--papel)'}">${m0(Math.abs(r.restante))}</span>
        ${porDia ? `<span style="font-size:14px;color:var(--areia);text-wrap:pretty">Cerca de <strong style="color:var(--papel);font-weight:600">${m0(r.restante / dias)} por dia</strong> nos ${dias} dias que faltam.</span>` : ''}
        ${barra(r.orcamento > 0 ? r.gasto / r.orcamento : 0, 8, 'var(--vinho2)', 'var(--pessego)', 'margin-top:8px')}
        <div class="entre num" style="font-size:12px;color:var(--areia)"><span>${m0(r.gasto)} gastos</span><span>Orçamento ${brl0(r.orcamento)}</span></div>
      </div>
      <div class="grid2">
        <div class="mini"><span style="font-size:12px;color:var(--cinza)">Entrou</span><span class="num" style="font-size:18px;font-weight:600">${m0(r.receitas)}</span></div>
        <div class="mini"><span style="font-size:12px;color:var(--cinza)">Sobra prevista</span><span class="num" style="font-size:18px;font-weight:600">${m0(r.sobra)}</span></div>
      </div>
      ${r.alertas.length ? `
      <div style="display:flex;flex-direction:column;gap:10px">
        <span class="rotulo">Atenção</span>
        ${r.alertas.map(c => {
          const msg = c.passou ? `${brl0(c.g - c.l)} acima do limite` : `Restam ${brl0(c.l - c.g)} para o mês`;
          return `<button class="alerta" data-a="aba" data-aba="budget">
            <span class="bola" style="background:${C(c.hue)}"></span>
            <span style="flex:1;display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:15px;font-weight:500">${esc(c.nome)}</span><span style="font-size:13px;color:${c.passou ? 'var(--verm)' : 'var(--ambar)'}">${msg}</span></span>
            <span class="num" style="font-size:15px;font-weight:600">${pctTxt(c.p)}</span>
          </button>`;
        }).join('')}
      </div>` : ''}
      </div><div class="home-b">
      <div style="display:flex;flex-direction:column;gap:4px">
        <div class="entre" style="align-items:baseline"><span class="rotulo">Recentes</span><button class="link" data-a="aba" data-aba="tx">Ver tudo</button></div>
        ${recentes.length ? recentes.map(t => linha(t, true)).join('') : '<span class="vazio">Nenhum lançamento neste mês ainda. Toque em + para lançar.</span>'}
      </div>
      </div></div>
    </div>`;
  }

  function telaOrcamento() {
    const r = calc(S.mes);
    const naoDist = Math.max(0, r.renda - r.orcamento);
    return `
    <div class="tela" style="gap:24px">
      <div style="display:flex;flex-direction:column;gap:6px;padding-top:6px">
        <span class="titulo" style="padding-top:0">Orçamento</span>
        ${seletorMes()}
        <span class="sub">${brl0(r.orcamento)} distribuídos de ${m0(r.renda)} de renda. Toque numa categoria para ajustar o limite.</span>
      </div>
      <div class="dist">
        ${r.cats.filter(c => c.l > 0).map(c => `<div style="background:${C(c.hue)};flex:${c.l}"></div>`).join('')}
        <div style="background:var(--areia);flex:${naoDist}"></div>
      </div>
      <div class="cats-grid">
        ${r.cats.map(c => {
          const cor = C(c.hue);
          const stCor = c.semLimite ? 'var(--cinza)' : c.passou ? 'var(--verm)' : c.p >= r.limiar ? 'var(--ambar)' : 'var(--cinza)';
          const st = c.semLimite ? (c.g > 0 ? `${brl0(c.g)} gastos, sem limite definido` : 'Sem limite neste mês')
            : c.passou ? `Passou ${brl0(c.g - c.l)} do limite` : `Restam ${brl0(c.l - c.g)}`;
          const aberta = S.catAberta === c.slug;
          return `<div class="cat">
            <button class="cat-cab" data-a="cat" data-slug="${esc(c.slug)}" aria-expanded="${aberta}">
              <span class="bola" style="background:${cor}"></span>
              <span class="nome">${esc(c.nome)}</span>
              <span class="num" style="font-size:14px"><strong style="font-weight:600">${m0(c.g)}</strong><span style="color:var(--cinza)"> / ${brl0(c.l)}</span></span>
            </button>
            ${barra(c.p, 6, 'var(--areia)', c.passou ? 'var(--verm-barra)' : cor)}
            <div class="entre" style="font-size:12px;color:${stCor}"><span>${st}</span><span class="num">${c.semLimite ? '' : pctTxt(c.p)}</span></div>
            ${aberta ? `<div class="ajuste">
              <span style="font-size:13px;color:var(--cinza)">Limite mensal</span>
              <div style="display:flex;align-items:center;gap:8px">
                <button class="redondo" data-a="limite" data-slug="${esc(c.slug)}" data-k="-1" aria-label="Diminuir limite de ${esc(c.nome)}">−</button>
                <span class="num" style="min-width:84px;text-align:center;font-size:16px;font-weight:600">${brl0(c.l)}</span>
                <button class="redondo" data-a="limite" data-slug="${esc(c.slug)}" data-k="1" aria-label="Aumentar limite de ${esc(c.nome)}">+</button>
              </div>
            </div>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  function telaTransacoes() {
    const itens = itensDoMes(S.mes).filter(t => S.filtro === 'all' ? true : S.filtro === 'income' ? t.tipo === 'receita' : t.categoria === S.filtro);
    const grupos = new Map();
    for (const t of itens) { if (!grupos.has(t.data)) grupos.set(t.data, []); grupos.get(t.data).push(t); }
    const opcoes = [{ id: 'all', nome: 'Tudo' }, ...S.cats.map(c => ({ id: c.slug, nome: c.nome })), { id: 'income', nome: 'Receitas' }];
    return `
    <div class="tela" style="gap:18px">
      <div style="display:flex;flex-direction:column;gap:6px">
        <span class="titulo">Transações</span>
        ${seletorMes()}
      </div>
      ${painelImportar()}
      <div class="chips" role="tablist">
        ${opcoes.map(f => `<button class="chip ${S.filtro === f.id ? 'on' : ''}" data-a="filtro" data-f="${esc(f.id)}">${esc(f.nome)}</button>`).join('')}
      </div>
      ${[...grupos.entries()].map(([data, lista]) => {
        const liq = lista.reduce((a, t) => a + (t.tipo === 'receita' ? t.valor : -t.valor), 0);
        return `<div style="display:flex;flex-direction:column">
          <div class="grupo-cab rotulo"><span>${dataLonga(data)}</span><span class="num">${liq >= 0 ? '+ ' : '− '}${mC(Math.abs(liq))}</span></div>
          ${lista.map(t => linha(t, false)).join('')}
        </div>`;
      }).join('')}
      ${grupos.size === 0 ? '<span class="vazio">Nenhum lançamento nesta categoria ainda.</span>' : ''}
    </div>`;
  }

  function telaMetas() {
    const guardado = id => S.aportes.filter(a => a.meta === id).reduce((s, a) => s + (a.valor || 0), 0);
    const total = S.metas.reduce((s, g) => s + guardado(g.id), 0);
    return `
    <div class="tela" style="gap:22px">
      <div style="display:flex;flex-direction:column;gap:6px;padding-top:6px">
        <span class="titulo" style="padding-top:0">Metas</span>
        <span class="sub">${m0(total)} guardados no total.</span>
      </div>
      <div class="metas-grid">
      ${S.metas.map(g => {
        const sv = guardado(g.id), p = g.alvo > 0 ? sv / g.alvo : 0;
        return `<div class="meta-card">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
            <div style="display:flex;flex-direction:column;gap:3px;min-width:0"><span style="font-size:16px;font-weight:600">${esc(g.nome)}</span>${g.nota ? `<span style="font-size:13px;color:var(--cinza)">${esc(g.nota)}</span>` : ''}</div>
            <span class="serif" style="font-size:30px;line-height:1">${Math.round(Math.min(1, p) * 100)}%</span>
          </div>
          ${barra(p, 6, 'var(--areia)', 'var(--coral)')}
          <div class="entre" style="align-items:center;gap:10px">
            <span class="num" style="font-size:13px"><strong style="font-weight:600">${m0(sv)}</strong><span style="color:var(--cinza)"> de ${brl0(g.alvo)}</span></span>
            <button class="btn-aporte" data-a="aporte" data-id="${esc(g.id)}">+ R$ 100</button>
          </div>
        </div>`;
      }).join('')}
      </div>
      ${!S.metas.length && !S.metaForm ? '<span class="vazio" style="text-align:left;padding:0">Você ainda não tem metas. Crie uma para acompanhar quanto já guardou para ela.</span>' : ''}
      ${S.metaForm ? `
      <form class="meta-card" id="form-meta" autocomplete="off">
        <span style="font-size:16px;font-weight:600">Nova meta</span>
        <input class="campo" id="meta-nome" placeholder="Nome (ex.: Reserva de emergência)" required>
        <input class="campo" id="meta-nota" placeholder="Nota (opcional)">
        <input class="campo num" id="meta-alvo" placeholder="Valor alvo (ex.: 20.000)" inputmode="decimal" required>
        <span id="meta-erro" style="font-size:13px;color:var(--verm);min-height:18px"></span>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn-sec" data-a="meta-cancelar">Cancelar</button>
          <button type="submit" class="btn-aporte" style="background:var(--coral);color:#fff">Criar meta</button>
        </div>
      </form>` : `<button class="btn-aporte" style="align-self:flex-start" data-a="meta-nova">+ Nova meta</button>`}
      <button class="link" data-a="sair" style="align-self:flex-start;color:var(--cinza);margin-top:12px">Sair da conta${S.usuario?.email ? ' (' + esc(S.usuario.email) + ')' : ''}</button>
    </div>`;
  }

  // ---------- Importar extratos e faturas (OFX / CSV) ----------
  const BANCOS = ['Bradesco', 'Nubank', 'Mercado Pago', 'Unicred', 'Santander', 'BV', 'Banco do Brasil', 'Amex', 'Outro'];
  const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); }
  function numeroBR(v) {
    let t = String(v ?? '').replace(/R\$|\s/g, '');
    if (!t) return NaN;
    const neg = /^\(.*\)$/.test(t) || /-$/.test(t);
    t = t.replace(/[()]/g, '').replace(/-$/, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(t);
    return neg ? -Math.abs(n) : n;
  }
  function dataBR(v) {
    const t = String(v || '').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(t);
    if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(+m[2])}-${pad(+m[1])}`; }
    m = /^(\d{4})(\d{2})(\d{2})/.exec(t); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    return null;
  }
  function adivinharBanco(texto) {
    const t = semAcento(texto);
    if (/nubank|nu pagamentos|nu financeira/.test(t)) return 'Nubank';
    if (/mercado ?pago|mercadopago/.test(t)) return 'Mercado Pago';
    if (/american express|amex/.test(t)) return 'Amex';
    if (/bradesco/.test(t)) return 'Bradesco';
    if (/santander/.test(t)) return 'Santander';
    if (/unicred/.test(t)) return 'Unicred';
    if (/banco do brasil|\bbb\b/.test(t)) return 'Banco do Brasil';
    if (/\bbv\b|votorantim/.test(t)) return 'BV';
    return '';
  }
  function lerOFX(txt) {
    const blocos = txt.split(/<STMTTRN>/i).slice(1);
    const tag = (b, n) => { const m = new RegExp('<' + n + '>([^<\\r\\n]*)', 'i').exec(b); return m ? m[1].trim() : ''; };
    const itens = blocos.map(b => {
      b = b.split(/<\/STMTTRN>/i)[0];
      return { id: tag(b, 'FITID'), data: dataBR(tag(b, 'DTPOSTED')), descricao: tag(b, 'MEMO') || tag(b, 'NAME') || 'Sem descrição', valor: numeroBR(tag(b, 'TRNAMT')) };
    }).filter(x => x.data && isFinite(x.valor) && x.valor !== 0);
    const org = (/<ORG>([^<\r\n]+)/i.exec(txt) || [])[1] || '';
    return { itens, cartao: /<CCSTMTRS>/i.test(txt), banco: adivinharBanco(org) };
  }
  function lerCSV(txt) {
    const linhas = txt.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (linhas.length < 2) return { itens: [] };
    // procura a linha de cabeçalho (alguns bancos põem informações antes)
    let hi = linhas.findIndex(l => /data|date|release_date/i.test(l) && /valor|amount|net_amount|d[eé]bito|cr[eé]dito/i.test(l));
    if (hi < 0) hi = 0;
    const cab = linhas[hi];
    const sep = (cab.match(/;/g) || []).length >= (cab.match(/,/g) || []).length ? ';' : ((cab.match(/\t/g) || []).length > 1 ? '\t' : ',');
    const campos = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
    const h = campos(cab).map(semAcento);
    const acha = re => h.findIndex(x => re.test(x));
    const iData = acha(/^(data|date|data (de )?lancamento|data da transacao|release_date|dt|data mov)/);
    const iDesc = acha(/^(descricao|title|historico|lancamento|estabelecimento|transaction_type|descricao da transacao|detalhe|memo|nome)/);
    const iValor = acha(/^(valor|amount|valor \(r\$\)|valor em r\$|transaction_net_amount|valor r\$)/);
    const iDeb = acha(/^debito/), iCred = acha(/^credito/);
    if (iData < 0 || (iValor < 0 && iDeb < 0 && iCred < 0)) return { itens: [], erro: 'Não reconheci as colunas de data e valor deste CSV.' };
    const itens = linhas.slice(hi + 1).map(l => {
      const c = campos(l);
      let valor = iValor >= 0 ? numeroBR(c[iValor]) : (numeroBR(c[iCred]) || 0) - Math.abs(numeroBR(c[iDeb]) || 0);
      return { data: dataBR(c[iData]), descricao: (iDesc >= 0 ? c[iDesc] : '') || 'Sem descrição', valor };
    }).filter(x => x.data && isFinite(x.valor) && x.valor !== 0);
    // CSV de fatura do Nubank: date,title,amount (compras positivas)
    const cartao = h.includes('title') && h.includes('amount') ? true : undefined;
    return { itens, cartao };
  }
  function categoriaPorTexto(t) {
    const s = semAcento(t);
    if (/luz|energia|enel|eletropaulo|vivo|telefon|internet|condom|aluguel|sabesp|comgas|\bgas\b/.test(s)) return 'casa';
    if (/combust|posto|shell|ipiranga|ipva|seguro auto|veicul|byd|estacion|pedagio|sem parar|uber|\b99\b/.test(s)) return 'carros';
    if (/farmac|drogari|drogasil|raia|saude|hospital|clinic|laborat|care plus|unimed|amil|odonto/.test(s)) return 'saude';
    if (/fies|escola|colegio|curso|faculdade|universidad|educa/.test(s)) return 'educacao';
    if (/emprest|consign|portoseg|juros|iof|financiam/.test(s)) return 'emprestimos';
    return 'outros';
  }
  const ehFatura = t => /pagamento.*fatura|pgto.*fatura|pag(amento|to)? cart|fatura cart|pagamento recebido|pagto cartao|pag fat/.test(semAcento(t));
  const ehTransfPropria = t => /mesma titularidade|entre contas|transf.*propria|resgate|aplicacao|aplic\b|poupanca/.test(semAcento(t));

  function classificar() {
    const imp = S.imp; const ids = new Set(S.lanc.map(l => l.id));
    const vistos = {};
    let sinalCompra = -1;
    if (imp.tipo === 'cartao') {
      const pos = imp.bruto.filter(x => x.valor > 0).length, neg = imp.bruto.length - pos;
      sinalCompra = pos >= neg ? 1 : -1;
    }
    imp.itens = imp.bruto.map(x => {
      const base = `${imp.banco}|${imp.tipo}|${x.data}|${x.valor}|${x.descricao}`;
      vistos[base] = (vistos[base] || 0) + 1;
      const chave = 'ex-' + fnv(x.id ? `${imp.banco}|${x.id}` : `${base}|${vistos[base]}`);
      const it = { chave, data: x.data, descricao: x.descricao, valor: Math.round(Math.abs(x.valor) * 100), status: 'novo', motivo: '' };
      if (imp.tipo === 'cartao') {
        if (Math.sign(x.valor) !== sinalCompra || ehFatura(x.descricao)) { it.status = 'ignorado'; it.motivo = 'pagamento ou estorno da fatura'; }
        it.tipo = 'despesa'; it.categoria = 'cartoes';
      } else {
        it.tipo = x.valor < 0 ? 'despesa' : 'receita';
        it.categoria = it.tipo === 'despesa' ? categoriaPorTexto(x.descricao) : null;
        if (ehFatura(x.descricao)) { it.status = 'ignorado'; it.motivo = 'pagamento de fatura (as compras vêm do cartão)'; }
        else if (ehTransfPropria(x.descricao)) { it.status = 'ignorado'; it.motivo = 'transferência entre contas suas ou investimento'; }
      }
      if (it.status === 'novo' && ids.has(chave)) it.status = 'existe';
      const anterior = imp.escolhas?.[chave];
      if (anterior) Object.assign(it, anterior);
      return it;
    }).sort((a, b) => (a.data < b.data ? 1 : -1));
  }

  async function abrirImportacao(arquivo) {
    try {
      const buf = await arquivo.arrayBuffer();
      let txt = new TextDecoder('utf-8').decode(buf);
      if (txt.includes('�')) txt = new TextDecoder('iso-8859-1').decode(buf);
      const ofx = /<OFX>|OFXHEADER/i.test(txt);
      const r = ofx ? lerOFX(txt) : lerCSV(txt);
      if (r.erro) { aviso(r.erro); return; }
      if (!r.itens.length) { aviso('Não encontrei lançamentos neste arquivo. Use o extrato em OFX ou CSV.'); return; }
      const banco = r.banco || adivinharBanco(arquivo.name) || 'Outro';
      S.imp = { arquivo: arquivo.name, banco, tipo: r.cartao ? 'cartao' : 'conta', bruto: r.itens, itens: [], escolhas: {} };
      classificar();
      renderImportacao();
    } catch (e) { aviso('Não consegui ler o arquivo: ' + e.message); }
  }

  function painelImportar() {
    return `<div class="mini" style="flex-direction:row;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <span style="display:flex;flex-direction:column;gap:2px;min-width:0">
        <span style="font-size:14px;font-weight:600">Importar extrato ou fatura</span>
        <span style="font-size:12px;color:var(--cinza)">Arquivo OFX ou CSV baixado no app do banco. Não duplica nada.</span>
      </span>
      <label class="btn-aporte" style="cursor:pointer;display:inline-flex;align-items:center">Escolher arquivo
        <input type="file" id="imp-extrato" accept=".ofx,.qfx,.csv,.txt,text/csv" hidden>
      </label>
    </div>`;
  }

  const impRoot = document.createElement('div'); document.body.appendChild(impRoot);
  function renderImportacao() {
    const imp = S.imp;
    if (!imp) { impRoot.innerHTML = ''; return; }
    const novos = imp.itens.filter(i => i.status === 'novo');
    const existentes = imp.itens.filter(i => i.status === 'existe').length;
    const ignorados = imp.itens.filter(i => i.status === 'ignorado').length;
    const total = novos.reduce((a, i) => a + (i.tipo === 'despesa' ? i.valor : 0), 0);
    const opcCat = sel => S.cats.map(c => `<option value="${esc(c.slug)}" ${c.slug === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
    impRoot.innerHTML = `
      <div class="overlay" data-a="imp-fechar"></div>
      <div class="folha larga" role="dialog" aria-modal="true" aria-label="Importar extrato">
        <span class="alca"></span>
        <div class="entre" style="align-items:center;gap:12px;flex-wrap:wrap">
          <span style="font-size:17px;font-weight:600">Importar ${esc(imp.arquivo)}</span>
          <div class="seg">
            <button type="button" class="${imp.tipo === 'conta' ? 'on' : ''}" data-a="imp-tipo" data-t="conta">Conta corrente</button>
            <button type="button" class="${imp.tipo === 'cartao' ? 'on' : ''}" data-a="imp-tipo" data-t="cartao">Cartão de crédito</button>
          </div>
        </div>
        <label class="sub" style="font-size:13px;display:flex;align-items:center;gap:10px">Banco
          <select class="campo" id="imp-banco" style="width:auto;padding:10px 12px">${BANCOS.map(b => `<option ${b === imp.banco ? 'selected' : ''}>${b}</option>`).join('')}</select>
        </label>
        <div class="grid2" style="grid-template-columns:repeat(3,1fr)">
          <div class="mini"><span style="font-size:12px;color:var(--cinza)">Novos</span><span class="num" style="font-size:18px;font-weight:600">${novos.length}</span></div>
          <div class="mini"><span style="font-size:12px;color:var(--cinza)">Já importados</span><span class="num" style="font-size:18px;font-weight:600">${existentes}</span></div>
          <div class="mini"><span style="font-size:12px;color:var(--cinza)">Ignorados</span><span class="num" style="font-size:18px;font-weight:600">${ignorados}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;max-height:42vh;overflow:auto;border-top:1px solid var(--linha)">
          ${imp.itens.map(i => `
            <div class="lanc" style="opacity:${i.status === 'novo' ? 1 : .5}">
              <span class="txt">
                <span class="desc">${esc(i.descricao)}</span>
                <span class="meta">${dataCurta(i.data)}${i.status === 'existe' ? ' · já importado' : i.status === 'ignorado' ? ' · ignorado: ' + esc(i.motivo) : ''}</span>
              </span>
              ${i.status === 'novo' && i.tipo === 'despesa' ? `<select class="campo" data-imp-cat="${i.chave}" style="width:auto;padding:6px 8px;font-size:13px">${opcCat(i.categoria)}</select>` : ''}
              <span class="v num" style="color:${i.tipo === 'receita' ? 'var(--verde)' : 'var(--tinta)'}">${i.tipo === 'receita' ? '+ ' : '− '}${brl(i.valor)}</span>
            </div>`).join('')}
        </div>
        <span class="sub" style="font-size:13px">${novos.length ? `Vão entrar ${novos.length} lançamento${novos.length > 1 ? 's' : ''}${total ? `, ${brl(total)} em despesas` : ''}.` : 'Nada novo para importar neste arquivo.'}</span>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn-sec" data-a="imp-fechar">Cancelar</button>
          <button class="salvar ${novos.length ? 'ok' : ''}" style="padding:12px 18px;font-size:15px" data-a="imp-confirmar" ${novos.length ? '' : 'disabled'}>Importar ${novos.length || ''}</button>
        </div>
      </div>`;
    impRoot.querySelector('#imp-banco').addEventListener('change', e => { imp.banco = e.target.value; classificar(); renderImportacao(); });
    impRoot.querySelectorAll('[data-imp-cat]').forEach(el => el.addEventListener('change', e => {
      const ch = el.dataset.impCat; imp.escolhas[ch] = { categoria: e.target.value };
      const it = imp.itens.find(x => x.chave === ch); if (it) it.categoria = e.target.value;
    }));
  }

  async function confirmarImportacao() {
    const imp = S.imp; if (!imp || S.ocupado) return;
    const novos = imp.itens.filter(i => i.status === 'novo');
    if (!novos.length) return;
    S.ocupado = true;
    try {
      const agora = Date.now();
      const linhas = novos.map(i => ({
        user_id: S.usuario.id, colecao: 'lancamentos', doc_id: i.chave,
        dados: { data: i.data, descricao: i.descricao, valor: i.valor, tipo: i.tipo, categoria: i.categoria, origem: 'extrato', conta: imp.banco, criadoEm: agora },
      }));
      for (let k = 0; k < linhas.length; k += 200) {
        const { error } = await SB.from('docs').upsert(linhas.slice(k, k + 200), { onConflict: 'user_id,colecao,doc_id', ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      await S.db.carregarTudo();
      const meses = novos.map(i => i.data.slice(0, 7)).sort();
      S.mes = meses[meses.length - 1];
      S.imp = null; renderImportacao(); render();
      aviso(`${novos.length} lançamento${novos.length > 1 ? 's' : ''} importado${novos.length > 1 ? 's' : ''} de ${imp.banco}.`);
    } catch (e) { aviso('Não consegui importar: ' + e.message); }
    finally { S.ocupado = false; }
  }

  // ---------- Tab bar ----------
  const ICONES = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    budget: '<path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z"/><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/>',
    tx: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
    goals: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  };
  const ROT = { home: 'Início', budget: 'Orçamento', tx: 'Transações', goals: 'Metas' };
  function renderTabbar() {
    const tab = k => `<button class="tab ${S.aba === k ? 'on' : ''}" data-a="aba" data-aba="${k}" ${S.aba === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[k]}</svg>${ROT[k]}</button>`;
    document.getElementById('tabbar').innerHTML = '<span class="marca">Orçamento 2026</span>' + tab('home') + tab('budget') +
      `<button class="mais" data-a="novo" aria-label="Novo lançamento" ${S.estado === 'pronto' ? '' : 'disabled'}><span class="mais-icone">+</span><span class="mais-txt">Novo lançamento</span></button>` + tab('tx') + tab('goals');
  }

  // ---------- Render ----------
  const main = document.getElementById('main');
  function render() {
    renderTabbar();
    if (S.estado === 'sem-acesso') {
      main.innerHTML = `<div class="centro"><span class="titulo" style="font-size:32px">Orçamento 2026</span><span class="sub" style="max-width:300px">Seus dados ficam guardados na sua conta do Claude. Abra este link no claude.ai, com a sua conta, para ver e lançar.</span></div>`;
      return;
    }
    if (S.estado === 'carregando') return;
    if (S.estado === 'vazio') {
      main.innerHTML = `<div class="centro"><span class="titulo" style="font-size:32px">Orçamento 2026</span><span class="sub" style="max-width:300px">Ainda não há categorias e limites carregados. Eles vêm da sua planilha ORC.2026; peça ao Claude para importar.</span></div>`;
      return;
    }
    main.innerHTML = S.aba === 'home' ? telaInicio() : S.aba === 'budget' ? telaOrcamento() : S.aba === 'tx' ? telaTransacoes() : telaMetas();
    if (S.metaForm) document.getElementById('form-meta')?.addEventListener('submit', criarMeta);
    document.getElementById('imp-extrato')?.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) abrirImportacao(f); });
  }

  // ---------- Folha "Novo lançamento" ----------
  const folhaRoot = document.getElementById('folha-root');
  function abrirFolha() {
    const padrao = (catPorSlug('outros') || S.cats[0])?.slug || null;
    S.r = { valor: '', descricao: '', categoria: padrao, tipo: 'despesa' };
    S.tentou = false; S.folha = true;
    renderFolha();
    setTimeout(() => document.getElementById('f-valor')?.focus(), 50);
  }
  function fecharFolha() { S.folha = false; folhaRoot.innerHTML = ''; }
  function dica() {
    const v = parseValor(S.r.valor);
    const valido = v > 0 && S.r.descricao.trim().length > 0;
    let txt = '', verm = false;
    if (S.r.tipo === 'despesa' && v > 0) {
      const r = calc(mesAtual()); const c = r.cats.find(x => x.slug === S.r.categoria);
      if (c) {
        if (c.semLimite) txt = `${c.nome} não tem limite definido em ${MESES[Number(mesAtual().slice(5)) - 1]}.`;
        else { const sobra = c.l - c.g - v; if (sobra >= 0) txt = `Depois disso, sobram ${brl0(sobra)} em ${c.nome}.`; else { txt = `Isso passa ${brl0(-sobra)} do limite de ${c.nome}.`; verm = true; } }
      }
    }
    if (S.tentou && !valido) { txt = 'Preencha valor e descrição.'; verm = true; }
    return { txt, verm, valido, v };
  }
  function atualizarDica() {
    const d = dica();
    const el = document.getElementById('f-dica'); if (el) { el.textContent = d.txt; el.style.color = d.verm ? 'var(--verm)' : 'var(--cinza)'; }
    document.getElementById('f-salvar')?.classList.toggle('ok', d.valido);
  }
  function renderFolha() {
    if (!S.folha) { folhaRoot.innerHTML = ''; return; }
    const r = S.r;
    folhaRoot.innerHTML = `
      <div class="overlay" data-a="fechar"></div>
      <form class="folha" id="f-form" role="dialog" aria-modal="true" aria-label="Novo lançamento" autocomplete="off">
        <span class="alca"></span>
        <div class="entre" style="align-items:center">
          <span style="font-size:17px;font-weight:600">Novo lançamento</span>
          <div class="seg">
            <button type="button" class="${r.tipo === 'despesa' ? 'on' : ''}" data-a="tipo" data-t="despesa">Despesa</button>
            <button type="button" class="${r.tipo === 'receita' ? 'on' : ''}" data-a="tipo" data-t="receita">Receita</button>
          </div>
        </div>
        <div class="valor-linha">
          <span class="serif" style="font-size:32px;color:var(--cinza)">R$</span>
          <input id="f-valor" inputmode="decimal" placeholder="0,00" value="${esc(r.valor)}" aria-label="Valor">
        </div>
        <input class="campo" id="f-desc" placeholder="Descrição (ex.: Feira de sábado)" value="${esc(r.descricao)}" aria-label="Descrição">
        ${r.tipo === 'despesa' ? `<div style="display:flex;flex-wrap:wrap;gap:8px">
          ${S.cats.map(c => { const sel = r.categoria === c.slug; return `<button type="button" class="cat-pick" data-a="fcat" data-slug="${esc(c.slug)}" style="background:${sel ? T(c.hue) : 'var(--papel)'};border-color:${sel ? C(c.hue) : 'var(--linha)'}"><span style="width:8px;height:8px;border-radius:4px;background:${C(c.hue)}"></span>${esc(c.nome)}</button>`; }).join('')}
        </div>` : ''}
        <span id="f-dica" style="font-size:13px;min-height:18px"></span>
        <button type="submit" class="salvar" id="f-salvar">Salvar</button>
      </form>`;
    atualizarDica();
    document.getElementById('f-valor').addEventListener('input', e => { const limpo = e.target.value.replace(/[^\d,.]/g, ''); if (limpo !== e.target.value) e.target.value = limpo; S.r.valor = limpo; atualizarDica(); });
    document.getElementById('f-desc').addEventListener('input', e => { S.r.descricao = e.target.value; atualizarDica(); });
    document.getElementById('f-form').addEventListener('submit', e => { e.preventDefault(); salvarLancamento(); });
  }
  async function salvarLancamento() {
    const d = dica();
    if (!d.valido) { S.tentou = true; atualizarDica(); return; }
    if (S.ocupado) return; S.ocupado = true;
    try {
      await S.db.collection('lancamentos').add({
        data: hoje(), descricao: S.r.descricao.trim(), valor: d.v, tipo: S.r.tipo,
        categoria: S.r.tipo === 'despesa' ? S.r.categoria : null, criadoEm: Date.now(),
      });
      fecharFolha();
      S.mes = mesAtual();
      if (S.aba !== 'goals' && S.aba !== 'budget') S.aba = 'home';
      render(); window.scrollTo(0, 0);
    } catch (e) { aviso(msgErro(e)); }
    finally { S.ocupado = false; }
  }

  // ---------- Escritas ----------
  function msgErro(e) {
    if (e?.code === 'quota_exceeded') return 'O espaço de dados deste app acabou. Peça ao Claude para arquivar meses antigos.';
    if (e?.code === 'invalid_argument') return 'Só a dona deste app pode alterar os dados.';
    return 'Não deu para salvar agora. Confira a conexão e tente de novo.';
  }
  let avisoTimer;
  function aviso(txt) {
    const el = document.getElementById('aviso-root');
    el.innerHTML = `<div class="aviso" role="status">${esc(txt)}</div>`;
    clearTimeout(avisoTimer); avisoTimer = setTimeout(() => { el.innerHTML = ''; }, 4500);
  }
  async function ajustarLimite(slug, k) {
    if (S.ocupado) return; S.ocupado = true;
    try {
      const doc = S.orc[S.mes];
      const atual = doc?.limites?.[slug] || 0;
      const novo = Math.max(5000, atual + k * 5000);
      const ref = S.db.doc('orcamentos/' + S.mes);
      if (doc) await ref.update({ limites: { [slug]: novo } });
      else await ref.set({ mes: S.mes, limites: { [slug]: novo } });
    } catch (e) { aviso(msgErro(e)); }
    finally { S.ocupado = false; }
  }
  async function excluir(chave) {
    if (S.ocupado) return; S.ocupado = true;
    const [fonte, id] = [chave.slice(0, chave.indexOf(':')), chave.slice(chave.indexOf(':') + 1)];
    try {
      if (fonte === 'app') {
        const l = S.lanc.find(x => x.id === id);
        // Lançamento que veio do banco: esconde em vez de apagar, para a próxima sincronização não trazê-lo de volta
        if (l?.origem === 'banco') await S.db.doc('lancamentos/' + id).update({ oculto: true });
        else await S.db.doc('lancamentos/' + id).delete();
      }
      else {
        const doc = S.hist[S.mes];
        if (doc) await S.db.doc('historico/' + S.mes).update({ itens: doc.itens.filter(x => x.id !== id) });
      }
      S.txAberta = null; render();
    } catch (e) { aviso(msgErro(e)); }
    finally { S.ocupado = false; }
  }
  async function aportar(id) {
    if (S.ocupado) return; S.ocupado = true;
    try { await S.db.collection('aportes').add({ meta: id, data: hoje(), valor: 10000, criadoEm: Date.now() }); }
    catch (e) { aviso(msgErro(e)); }
    finally { S.ocupado = false; }
  }
  async function criarMeta(e) {
    e.preventDefault();
    const nome = document.getElementById('meta-nome').value.trim();
    const nota = document.getElementById('meta-nota').value.trim();
    const alvo = parseValor(document.getElementById('meta-alvo').value);
    if (!nome || alvo <= 0) { document.getElementById('meta-erro').textContent = 'Preencha nome e valor alvo.'; return; }
    if (S.ocupado) return; S.ocupado = true;
    try { await S.db.collection('metas').add({ nome, nota, alvo, criadoEm: Date.now() }); S.metaForm = false; render(); }
    catch (err) { aviso(msgErro(err)); }
    finally { S.ocupado = false; }
  }

  // ---------- Eventos ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-a]'); if (!el) return;
    const a = el.dataset.a;
    if (a === 'aba') { S.aba = el.dataset.aba; S.txAberta = null; render(); window.scrollTo(0, 0); }
    else if (a === 'mes') { S.mes = somaMes(S.mes, Number(el.dataset.k)); S.txAberta = null; render(); }
    else if (a === 'mes-hoje') { S.mes = mesAtual(); render(); }
    else if (a === 'ocultar') { S.ocultar = !S.ocultar; render(); }
    else if (a === 'cat') { S.catAberta = S.catAberta === el.dataset.slug ? null : el.dataset.slug; render(); }
    else if (a === 'limite') ajustarLimite(el.dataset.slug, Number(el.dataset.k));
    else if (a === 'filtro') { S.filtro = el.dataset.f; S.txAberta = null; render(); }
    else if (a === 'tx') { S.txAberta = S.txAberta === el.dataset.id ? null : el.dataset.id; render(); }
    else if (a === 'tx-cancelar') { S.txAberta = null; render(); }
    else if (a === 'tx-excluir') excluir(el.dataset.id);
    else if (a === 'aporte') aportar(el.dataset.id);
    else if (a === 'meta-nova') { S.metaForm = true; render(); setTimeout(() => document.getElementById('meta-nome')?.focus(), 30); }
    else if (a === 'meta-cancelar') { S.metaForm = false; render(); }
    else if (a === 'imp-fechar') { S.imp = null; renderImportacao(); }
    else if (a === 'imp-tipo') { S.imp.tipo = el.dataset.t; S.imp.escolhas = {}; classificar(); renderImportacao(); }
    else if (a === 'imp-confirmar') confirmarImportacao();
    else if (a === 'novo') abrirFolha();
    else if (a === 'fechar') fecharFolha();
    else if (a === 'tipo') { S.r.tipo = el.dataset.t; renderFolha(); }
    else if (a === 'fcat') { S.r.categoria = el.dataset.slug; renderFolha(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.folha) fecharFolha(); });


  // ============================================================
  //  Dados no Supabase (cada linha da tabela "docs" é um documento)
  // ============================================================
  const CHAVE_CONFIG = 'orcamento-config';
  function lerConfig() {
    const fixo = window.ORCAMENTO_CONFIG || {};
    if (fixo.supabaseUrl && fixo.supabaseAnonKey) return fixo;
    try { return JSON.parse(localStorage.getItem(CHAVE_CONFIG) || '{}'); } catch { return {}; }
  }

  function criarBanco(sb, uid) {
    const store = new Map(); // "colecao/doc_id" -> dados
    const ouvintes = new Set();
    const avisar = () => ouvintes.forEach(f => { try { f(); } catch (e) { console.error(e); } });
    const clone = o => JSON.parse(JSON.stringify(o));
    const mesclar = (a, b) => { for (const k in b) { const v = b[k]; if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) mesclar(a[k], v); else a[k] = v; } return a; };
    const novoId = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 16) : Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
    const snapDoc = (id, dados) => ({ id, exists: dados !== undefined, data: () => dados, metadata: {} });
    const erro = (code, message) => Object.assign(new Error(message), { code });

    async function carregarTudo() {
      const passo = 1000; let de = 0; const novo = new Map();
      for (;;) {
        const { data, error } = await sb.from('docs').select('colecao,doc_id,dados').order('colecao').order('doc_id').range(de, de + passo - 1);
        if (error) throw erro('unavailable', error.message);
        data.forEach(r => novo.set(r.colecao + '/' + r.doc_id, r.dados));
        if (data.length < passo) break;
        de += passo;
      }
      store.clear(); novo.forEach((v, k) => store.set(k, v)); avisar();
    }
    async function gravar(col, id, dados) {
      store.set(col + '/' + id, dados); avisar();
      const { error } = await sb.from('docs').upsert({ user_id: uid, colecao: col, doc_id: id, dados, atualizado_em: new Date().toISOString() });
      if (error) { await carregarTudo().catch(() => {}); throw erro(/quota|limit/i.test(error.message) ? 'quota_exceeded' : 'unavailable', error.message); }
    }
    function docRef(col, id) {
      return {
        id,
        async set(d) { await gravar(col, id, clone(d)); },
        async update(d) {
          const atual = store.get(col + '/' + id);
          if (!atual) throw erro('invalid_argument', 'documento não existe');
          await gravar(col, id, mesclar(clone(atual), clone(d)));
        },
        async delete() {
          store.delete(col + '/' + id); avisar();
          const { error } = await sb.from('docs').delete().eq('colecao', col).eq('doc_id', id);
          if (error) { await carregarTudo().catch(() => {}); throw erro('unavailable', error.message); }
        },
        onSnapshot(next) { const f = () => next(snapDoc(id, store.get(col + '/' + id))); ouvintes.add(f); f(); return () => ouvintes.delete(f); },
      };
    }
    function colRef(col) {
      const q = {
        limit() { return q; },
        doc(id) { return docRef(col, id || novoId()); },
        async add(d) { const r = docRef(col, novoId()); await r.set(d); return r; },
        onSnapshot(next) {
          const f = () => {
            const docs = [...store.entries()].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => snapDoc(k.slice(col.length + 1), v));
            next({ docs, size: docs.length, empty: !docs.length, metadata: {} });
          };
          ouvintes.add(f); f(); return () => ouvintes.delete(f);
        },
      };
      return q;
    }
    function doc(path) { const i = path.indexOf('/'); return docRef(path.slice(0, i), path.slice(i + 1)); }

    // Mudanças feitas em outro aparelho chegam ao vivo
    sb.channel('docs-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'user_id=eq.' + uid }, p => {
        if (p.eventType === 'DELETE') { if (p.old?.colecao) store.delete(p.old.colecao + '/' + p.old.doc_id); }
        else if (p.new?.colecao) store.set(p.new.colecao + '/' + p.new.doc_id, p.new.dados);
        avisar();
      })
      .subscribe();
    // Ao voltar para a aba/app, confere se algo mudou
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') carregarTudo().catch(() => {}); });

    return { collection: colRef, doc, carregarTudo, vazio: () => ![...store.keys()].some(k => k.startsWith('categorias/')) };
  }

  // ---------- Telas de acesso ----------
  const telaCentro = conteudo => `<div class="centro" style="align-items:stretch;text-align:left;max-width:360px;margin:0 auto;gap:14px">
      <span class="titulo" style="font-size:40px">Orçamento 2026</span>${conteudo}</div>`;

  function telaConfig() {
    return telaCentro(`
      <span class="sub">Primeira vez neste aparelho: cole os dois dados do seu projeto Supabase (Project Settings › API).</span>
      <form id="form-config" style="display:flex;flex-direction:column;gap:10px" autocomplete="off">
        <input class="campo" id="cfg-url" placeholder="Project URL (https://….supabase.co)" required>
        <input class="campo" id="cfg-key" placeholder="anon public key" required>
        <span id="cfg-erro" style="font-size:13px;color:var(--verm);min-height:18px"></span>
        <button class="salvar ok" type="submit">Continuar</button>
      </form>`);
  }
  function telaLogin(msg = '', erroMsg = '') {
    return telaCentro(`
      <span class="sub">Entre com seu e-mail e senha. Seus dados ficam só na sua conta.</span>
      <form id="form-login" style="display:flex;flex-direction:column;gap:10px">
        <input class="campo" id="lg-email" type="email" placeholder="E-mail" autocomplete="email" required>
        <input class="campo" id="lg-senha" type="password" placeholder="Senha (mín. 6 caracteres)" autocomplete="current-password" minlength="6" required>
        <span id="lg-msg" style="font-size:13px;min-height:18px;color:${erroMsg ? 'var(--verm)' : 'var(--cinza)'}">${esc(erroMsg || msg)}</span>
        <button class="salvar ok" type="submit" data-modo="entrar">Entrar</button>
        <button class="btn-sec" type="button" id="lg-criar" style="padding:14px">Criar minha conta</button>
      </form>`);
  }
  function telaImportar(msg = '') {
    return telaCentro(`
      <span class="sub">Sua conta está pronta. Falta carregar seus dados: escolha o arquivo <strong>dados-orcamento.json</strong> que o Claude enviou. Isso é feito uma vez só.</span>
      <label class="salvar ok" style="text-align:center;cursor:pointer">Escolher arquivo
        <input type="file" id="imp-arquivo" accept=".json,application/json" hidden>
      </label>
      <span id="imp-msg" style="font-size:13px;min-height:18px;color:var(--cinza)">${esc(msg)}</span>
      <button class="link" id="sair" style="align-self:flex-start">Sair da conta</button>`);
  }

  const traduzir = m => /Invalid login/i.test(m) ? 'E-mail ou senha incorretos.'
    : /not confirmed/i.test(m) ? 'Confirme seu e-mail (veja a caixa de entrada) antes de entrar.'
    : /already registered/i.test(m) ? 'Este e-mail já tem conta. Use "Entrar".'
    : /Password should be/i.test(m) ? 'A senha precisa ter pelo menos 6 caracteres.'
    : /rate limit/i.test(m) ? 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
    : 'Não deu certo: ' + m;

  let SB = null;
  function mostrarAcesso(html) {
    document.getElementById('tabbar').hidden = true;
    main.innerHTML = html;
  }

  async function iniciar() {
    const cfg = lerConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      mostrarAcesso(telaConfig());
      document.getElementById('form-config').addEventListener('submit', e => {
        e.preventDefault();
        const url = document.getElementById('cfg-url').value.trim().replace(/\/+$/, '');
        const key = document.getElementById('cfg-key').value.trim();
        if (!/^https:\/\/.+\.supabase\.co$/.test(url)) { document.getElementById('cfg-erro').textContent = 'O Project URL termina em .supabase.co'; return; }
        try { localStorage.setItem(CHAVE_CONFIG, JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key })); } catch {}
        location.reload();
      });
      return;
    }
    SB = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true } });
    const { data: { session } } = await SB.auth.getSession();
    if (!session) return pedirLogin();
    await entrarNoApp(session.user);
  }

  function pedirLogin(msg = '', erroMsg = '') {
    mostrarAcesso(telaLogin(msg, erroMsg));
    const email = () => document.getElementById('lg-email').value.trim();
    const senha = () => document.getElementById('lg-senha').value;
    const setMsg = (t, verm) => { const el = document.getElementById('lg-msg'); el.textContent = t; el.style.color = verm ? 'var(--verm)' : 'var(--cinza)'; };
    document.getElementById('form-login').addEventListener('submit', async e => {
      e.preventDefault(); setMsg('Entrando…');
      const { data, error } = await SB.auth.signInWithPassword({ email: email(), password: senha() });
      if (error) return setMsg(traduzir(error.message), true);
      entrarNoApp(data.user);
    });
    document.getElementById('lg-criar').addEventListener('click', async () => {
      if (!email() || senha().length < 6) return setMsg('Digite e-mail e uma senha de pelo menos 6 caracteres.', true);
      setMsg('Criando conta…');
      const { data, error } = await SB.auth.signUp({ email: email(), password: senha(), options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) return setMsg(traduzir(error.message), true);
      if (data.session) return entrarNoApp(data.user);
      setMsg('Conta criada. Abra o e-mail de confirmação que chegou para ' + email() + ' e depois entre aqui.');
    });
  }

  async function entrarNoApp(user) {
    S.usuario = user;
    S.db = criarBanco(SB, user.id);
    try { await S.db.carregarTudo(); }
    catch (e) { mostrarAcesso(telaCentro(`<span class="sub">Não consegui ler seus dados: ${esc(e.message)}. Confira se o arquivo supabase/schema.sql foi rodado no SQL Editor.</span>`)); return; }
    if (S.db.vazio()) return pedirImportacao();
    ligarColecoes();
  }

  function pedirImportacao(msg) {
    mostrarAcesso(telaImportar(msg));
    document.getElementById('sair').addEventListener('click', sair);
    document.getElementById('imp-arquivo').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      const out = document.getElementById('imp-msg');
      try {
        const json = JSON.parse(await f.text());
        const docs = json.docs || [];
        if (!docs.length) throw new Error('arquivo sem dados');
        out.textContent = `Importando ${docs.length} registros…`;
        for (let i = 0; i < docs.length; i += 50) {
          const lote = docs.slice(i, i + 50).map(d => ({ user_id: S.usuario.id, colecao: d.colecao, doc_id: d.doc_id, dados: d.dados }));
          const { error } = await SB.from('docs').upsert(lote);
          if (error) throw new Error(error.message);
        }
        await S.db.carregarTudo();
        ligarColecoes();
      } catch (err) { out.style.color = 'var(--verm)'; out.textContent = 'Não consegui importar: ' + err.message; }
    });
  }

  async function sair() { await SB.auth.signOut(); location.reload(); }

  function ligarColecoes() {
    document.getElementById('tabbar').hidden = false;
    const db = S.db;
    const pronto = nome => {
      S.prontos.add(nome);
      if (S.prontos.size >= COLECOES.length) S.estado = 'pronto';
      if (S.estado === 'pronto') { render(); if (S.folha) atualizarDica(); }
    };
    const lista = s => s.docs.filter(d => d.exists).map(d => ({ id: d.id, ...d.data() }));
    db.collection('categorias').onSnapshot(s => { S.cats = lista(s).map(c => ({ ...c, slug: c.id })).sort((a, b) => (a.ordem || 0) - (b.ordem || 0)); pronto('categorias'); });
    db.collection('orcamentos').onSnapshot(s => { S.orc = Object.fromEntries(lista(s).map(d => [d.id, d])); pronto('orcamentos'); });
    db.collection('historico').onSnapshot(s => { S.hist = Object.fromEntries(lista(s).map(d => [d.id, d])); pronto('historico'); });
    db.collection('lancamentos').onSnapshot(s => { S.lanc = lista(s); pronto('lancamentos'); });
    db.collection('metas').onSnapshot(s => { S.metas = lista(s).sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0)); pronto('metas'); });
    db.collection('aportes').onSnapshot(s => { S.aportes = lista(s); pronto('aportes'); });
    db.doc('config/geral').onSnapshot(s => { S.config = s.exists ? s.data() : {}; pronto('config'); });
  }
  document.addEventListener('click', e => { if (e.target.closest('[data-a="sair"]')) sair(); });
  // Arrastar um extrato para qualquer lugar da página também importa
  document.addEventListener('dragover', e => { if (S.estado === 'pronto') e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (S.estado !== 'pronto') return;
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0]; if (f) abrirImportacao(f);
  });

  renderTabbar();
  document.getElementById('tabbar').hidden = true;
  iniciar().catch(e => mostrarAcesso(telaCentro(`<span class="sub">Algo deu errado ao abrir o app: ${esc(e.message)}</span>`)));
})();
