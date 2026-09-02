// 明耀之星 Companion - 主应用逻辑 v2
(function(){
'use strict';

// ===== 状态 =====
let allCards = [];
let collection = {};          // {card_code: true}
let enemySlots = [null, null, null];  // 选中的3个敌方宝可梦
let activeSlot = 0;           // 当前正在选择的槽位
let specialUsed = {};         // {极巨化: false, Mega进化: false} 本场已用

const STORAGE_KEY = 'mezastar_collection';

// ===== localStorage =====
function loadCollection(){
  try { collection = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch(e){ collection = {}; }
}
function saveCollection(){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collection)); } catch(e){}
}
function toggleCard(code){
  if(collection[code]) delete collection[code];
  else collection[code] = true;
  saveCollection();

  // 局部更新：只改目标卡元素，不全量重渲染
  const cardEl = document.querySelector(`.card[data-code="${code}"]`);
  if(cardEl){
    const owned = !!collection[code];
    cardEl.classList.toggle('owned', owned);
    const btn = cardEl.querySelector('.own-btn');
    if(btn){
      btn.classList.toggle('checked', owned);
      btn.textContent = owned ? '✓' : '+';
    }
  } else {
    renderCardGrid(); // fallback：找不到元素时全量渲染
  }
  updateStats();
}

// ===== 数据加载 =====
async function loadCards(){
  try {
    const resp = await fetch('cards.json?v=20260811i');
    const data = await resp.json();
    allCards = [];
    for(const series of data.series){
      for(const card of series.cards){
        allCards.push({...card, series: series.id, series_name: series.name});
      }
    }
    populateFilters(data.series);
    // 数据加载完成后重新应用语言（翻译筛选器选项+卡牌名）
    if(typeof window.applyLang_ === 'function') window.applyLang_(document.documentElement.dataset.lang || 'zh', false);
    updateStats();
  } catch(e){
    console.error('Failed to load cards.json:', e);
    document.getElementById('card-grid').innerHTML = `<p class="error">${T('load_error') || 'Load failed'}</p>`;
  }
}

function populateFilters(seriesList){
  const ss = document.getElementById('filter-series');
  for(const s of seriesList){ const o=document.createElement('option'); o.value=s.id; o.textContent=s.name; ss.appendChild(o); }
  const ts = document.getElementById('filter-type');
  for(const t of TYPES){ const o=document.createElement('option'); o.value=t; o.textContent=t; ts.appendChild(o); }
}

// ===== 图片横竖版检测 =====
// 用实际图片尺寸判断更可靠：w/h < 0.95 = 竖版（含 ★6 长图 1000x3000+ 和普通 800x1000）
// 但渲染前拿不到尺寸，所以策略：
//   1) HP_ 前缀 → 必为 ★6 超长竖版 → portrait
//   2) 其他文件默认 landscape，渲染后 onload 测量真实宽高再纠正 class
// 判断图片类型：HP_ 开头 = ★6超竖版 → tall，其他 → normal
function getImgClass(imgPath){
  if(!imgPath) return 'no-img';
  return imgPath.includes('HP_') ? 'tall' : 'normal';
}

// 语言辅助：获取当前语言下显示的名字和描述
function getCardName(c){
  const lang = document.documentElement.dataset.lang || 'zh';
  return (lang === 'en' && c.name_en) ? c.name_en : c.name;
}
function getCardDesc(c){
  const lang = document.documentElement.dataset.lang || 'zh';
  if(lang === 'en' && c.desc_en) return c.desc_en;
  return c.desc || '';
}
function isEN(){ return document.documentElement.dataset.lang === 'en'; }
window.getCardName_ = getCardName;
window.getCardDesc_ = getCardDesc;

// ===== 属性克制表 =====
function renderTypeGrid(containerId, onClick){
  const grid = document.getElementById(containerId);
  if(!grid) return;
  grid.innerHTML = '';
  for(const type of TYPES){
    const btn = document.createElement('button');
    btn.className = 'type-btn';
    btn.style.backgroundColor = TYPE_COLORS[type];
    btn.textContent = (typeof window.getTypeName === 'function') ? window.getTypeName(type) : (typeof getTypeName === 'function' ? getTypeName(type) : type);
    btn.addEventListener('click', ()=> onClick(type));
    grid.appendChild(btn);
  }
}

function showTypeEffect(atkType){
  const result = document.getElementById('type-result');
  const strong = [], weak = [], immune = [];
  for(const [defType, mult] of Object.entries(TYPE_CHART[atkType])){
    if(mult >= 2) strong.push(defType);
    else if(mult === 0.5) weak.push(defType);
    else if(mult === 0) immune.push(defType);
  }

  // 防守视角：谁打我有效
  const defStrong = [], defWeak = [], defImmune = [];
  for(const atkT of TYPES){
    const mult = TYPE_CHART[atkT]?.[atkType] ?? 1;
    if(mult >= 2) defStrong.push(atkT);
    else if(mult === 0.5) defWeak.push(atkT);
    else if(mult === 0) defImmune.push(atkT);
  }

  result.innerHTML = `
    <div class="effect-section">
      <h3 class="effect-direction">${T('atk_dir')} ${getTypeName(atkType)} →</h3>
      <div class="effect-group strong">
        <span class="effect-label">${T('atk_effect')}</span>
        <div class="type-tags">${strong.map(t=>`<span class="type-tag" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('')||'<span class="hint">—</span>'}</div>
      </div>
      ${weak.length ? `<div class="effect-group weak">
        <span class="effect-label">${T('atk_weak')}</span>
        <div class="type-tags">${weak.map(t=>`<span class="type-tag" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('')}</div>
      </div>`:''}
      ${immune.length ? `<div class="effect-group immune">
        <span class="effect-label">${T('atk_none')}</span>
        <div class="type-tags">${immune.map(t=>`<span class="type-tag" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('')}</div>
      </div>`:''}
    </div>
    <div class="effect-section">
      <h3 class="effect-direction">← ${T('def_dir')} ${getTypeName(atkType)}</h3>
      <div class="effect-group strong">
        <span class="effect-label">${T('be_weak')}</span>
        <div class="type-tags">${defStrong.map(t=>`<span class="type-tag" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('')||'<span class="hint">—</span>'}</div>
      </div>
      ${defWeak.length ? `<div class="effect-group weak">
        <span class="effect-label">${T('be_resist')}</span>
        <div class="type-tags">${defWeak.map(t=>`<span class="type-tag" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('')}</div>
      </div>`:''}
      ${defImmune.length ? `<div class="effect-group immune">
        <span class="effect-label">${T('be_immune')}</span>
        <div class="type-tags">${defImmune.map(t=>`<span class="type-tag" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('')}</div>
      </div>`:''}
    </div>
  `;
}

// ===== 收藏页 =====
function renderCardGrid(){
  const grid = document.getElementById('card-grid');
  if(!grid) return;
  const sf = document.getElementById('filter-series').value;
  const rf = document.getElementById('filter-rarity').value;
  const tf = document.getElementById('filter-type').value;
  const of = document.getElementById('filter-owned')?.checked || false;
  const sf2 = (document.getElementById('filter-search')?.value || '').trim().toLowerCase();

  const filtered = allCards.filter(c => {
    if(sf !== 'all' && c.series !== sf) return false;
    if(rf !== 'all' && c.rarity !== parseInt(rf)) return false;
    if(tf !== 'all' && !c.types.includes(tf)) return false;
    if(of && !collection[c.code]) return false;
    if(sf2){
      const nameLc = (c.name || '').toLowerCase();
      const nameEnLc = (c.name_en || '').toLowerCase();
      const codeLc = (c.code || '').toLowerCase();
      if(!nameLc.includes(sf2) && !nameEnLc.includes(sf2) && !codeLc.includes(sf2)) return false;
    }
    return true;
  });
  filtered.sort((a,b) => {
    // 支援券排在最后
    if(a.role === 'support' && b.role !== 'support') return 1;
    if(a.role !== 'support' && b.role === 'support') return -1;
    return b.rarity - a.rarity;
  });

  // 按稀有度分组渲染（每组前面加分割线标题）
  const RARITY_GROUPS = [
    {rarity: 6, label: () => '★★★★★★ ' + T('rarity_6')},
    {rarity: 5, label: () => '★★★★★ ' + T('rarity_5')},
    {rarity: 4, label: () => '★★★★'},
    {rarity: 3, label: () => '★★★'},
    {rarity: 2, label: () => '★★'},
    {rarity: 'support', label: () => T('support')},
  ];

  const renderCard = (c) => {
    const owned = collection[c.code];
    const stars = c.role === 'support' ? T('support') : '★'.repeat(c.rarity);
    const typeBadges = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('');
    const specialBadges = (c.special||[]).map(s => `<span class="special-badge">${s}</span>`).join('');
    const supportMove = c.support_move ? `<div class="support-move-info">${T('support_move_label')||'支援'}：${(window.getCardName_||getCardName)(c)}（${getTypeName(c.support_move_type)}）</div>` : '';
    const imgFile = c.img || '';
    const orient = imgFile ? getImgClass(imgFile) : 'no-img';
    const imgHtml = imgFile
      ? `<img src="${imgFile}" alt="${c.name}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">`
      : '';
    const supportClass = c.role === 'support' ? 'support-card' : '';
    const primaryType = c.types[0];
    const typeColor = primaryType ? TYPE_COLORS[primaryType] : '';
    const typeStyle = typeColor ? `--type-color:${typeColor};` : '';
    const typeAttr = primaryType ? `data-type="${primaryType}"` : '';
    const rareClass = c.rarity === 6 ? 'is-rare' : '';
    return `
      <div class="card ${owned?'owned':''} ${supportClass} ${rareClass}" data-code="${c.code}" ${typeAttr} style="${typeStyle}" onclick="showCardDetailPub('${c.code}')">
        <div class="card-img ${orient} ${imgFile?'':'no-img'}">
          ${imgHtml}
          <span class="rarity-badge">${stars}</span>
        </div>
        <div class="card-info">
          <div class="card-name">${(window.getCardName_||getCardName)(c)}</div>
          <div class="card-types">${typeBadges}</div>
          ${specialBadges ? `<div class="card-special">${specialBadges}</div>` : ''}
          ${supportMove}
          <div class="card-code">${c.code}</div>
        </div>
        <button class="own-btn ${owned?'checked':''}" onclick="event.stopPropagation();toggleCardPub('${c.code}')">${owned?'✓':'+'}</button>
      </div>
    `;
  };

  // 按 group 拼接 HTML（每组前加 divider）
  let html = '';
  const rendered = new Set();
  for(const group of RARITY_GROUPS){
    const groupCards = filtered.filter(c => {
      const match = group.rarity === 'support' ? c.role === 'support' : (c.role !== 'support' && c.rarity === group.rarity);
      if(match) rendered.add(c.code);
      return match;
    });
    if(groupCards.length === 0) continue;
    html += `<div class="rarity-divider"><span class="rarity-divider-label">${typeof group.label === 'function' ? group.label() : group.label}</span></div>`;
    html += groupCards.map(renderCard).join('');
  }
  // 兜底：渲染未被任何分组匹配的卡
  const rest = filtered.filter(c => !rendered.has(c.code));
  if(rest.length){
    html += `<div class="rarity-divider"><span class="rarity-divider-label">${T('rarity_other')}</span></div>`;
    html += rest.map(renderCard).join('');
  }
  grid.innerHTML = html;
}
window.toggleCardPub = toggleCard;
window.renderCardGrid_ = renderCardGrid;
window.recommendTeam_ = recommendTeam;
window.renderTypeGrid_ = renderTypeGrid;
window.showTypeEffect_ = showTypeEffect;

function updateStats(){
  const total = allCards.length;
  const owned = Object.keys(collection).filter(k=>collection[k]).length;
  const el = document.getElementById('collection-stats');
  if(el) el.innerHTML = `<span>${T('owned')}: <strong>${owned}</strong> / ${total}</span>`;
}

// ===== 对战推荐 =====

// 选择敌方宝可梦
function openEnemyPicker(slot){
  activeSlot = slot;
  document.getElementById('enemy-picker').classList.remove('hidden');
  renderEnemyPicker();
}

function closeEnemyPicker(){
  document.getElementById('enemy-picker').classList.add('hidden');
}

function selectEnemy(code){
  const card = allCards.find(c => c.code === code);
  if(!card) return;
  enemySlots[activeSlot] = card;
  closeEnemyPicker();
  renderEnemySlots();
  recommendTeam();
}

function removeEnemy(slot){
  enemySlots[slot] = null;
  renderEnemySlots();
  recommendTeam();
}

function renderEnemySlots(){
  const container = document.getElementById('enemy-slots');
  container.innerHTML = enemySlots.map((enemy, i) => {
    if(enemy){
      const typeBadges = enemy.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('');
      const stars = '★'.repeat(enemy.rarity);
      return `
        <div class="enemy-slot filled" data-slot="${i}">
          <img src="${enemy.img||''}" alt="${(window.getCardName_||getCardName)(enemy)}" class="slot-img" onerror="this.style.display='none'">
          <div class="slot-info">
            <div class="slot-stars">${stars}</div>
            <div class="slot-name">${(window.getCardName_||getCardName)(enemy)}</div>
            <div class="slot-types">${typeBadges}</div>
          </div>
          <button class="slot-remove" onclick="event.stopPropagation();removeEnemyPub(${i})">✕</button>
        </div>
      `;
    }
    return `
      <div class="enemy-slot empty" data-slot="${i}" onclick="openEnemyPickerPub(${i})">
        <span class="slot-plus">+</span>
        <span class="slot-label">${T('enemy_slot')} ${i+1}</span>
      </div>
    `;
  }).join('');
}

function renderEnemyPicker(){
  const grid = document.getElementById('picker-grid');
  if(!grid) return;
  const rf = document.getElementById('picker-rarity')?.value || 'all';
  const search = document.getElementById('picker-search')?.value || '';

  const filtered = allCards.filter(c => {
    if(c.role === 'support') return false; // 支援券不能当敌方
    if(rf !== 'all' && c.rarity !== parseInt(rf)) return false;
    if(search){
      const s = search.toLowerCase();
      const n = (c.name||'').toLowerCase();
      const ne = (c.name_en||'').toLowerCase();
      if(!n.includes(s) && !ne.includes(s)) return false;
    }
    return true;
  });
  filtered.sort((a,b) => b.rarity - a.rarity);

  grid.innerHTML = filtered.map(c => {
    const stars = '★'.repeat(c.rarity);
    const typeBadges = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('');
    const orient = c.img ? getImgClass(c.img) : 'no-img';
    return `
      <div class="picker-card" onclick="selectEnemyPub('${c.code}')">
        <div class="card-img ${orient}">
          ${c.img ? `<img src="${c.img}" alt="${(window.getCardName_||getCardName)(c)}" loading="lazy">` : ''}
          <span class="rarity-badge">${stars}</span>
        </div>
        <div class="picker-card-info">
          <div class="card-name">${(window.getCardName_||getCardName)(c)}</div>
          <div class="card-types">${typeBadges}</div>
        </div>
      </div>
    `;
  }).join('');
}

// 推荐：1v1 配对模式，每只敌方各派1只上场
function recommendTeam(){
  const result = document.getElementById('recommend-result');
  const enemies = enemySlots.filter(e => e !== null);

  if(enemies.length === 0){
    result.innerHTML = `<p class="hint">${T('recommend_empty')}</p>`;
    return;
  }

  const myCards = allCards.filter(c => collection[c.code] && c.role !== 'support');
  const mySupports = allCards.filter(c => collection[c.code] && c.role === 'support');

  if(myCards.length === 0){
    result.innerHTML = `
      <div class="recommend-empty">
        <p>${T('no_cards_owned')}</p>
        <p>${T('no_cards_hint')}</p>
        <div class="enemy-summary">
          <h3>${T('enemy_analysis')}</h3>
          ${enemies.map(e => analyzeEnemy(e)).join('')}
        </div>
      </div>
    `;
    return;
  }

  // ===== 推荐评分常量 =====
  const SCORE_W = { off: 3.0, def: 1.2, energy: 1.1, rarity: 0.2, power: 0.9 };
  const SPECIAL_SCORE = { '极巨化': 0.75, 'Mega进化': 0.70, '超级进化': 0.70, 'Ｚ招式': 0.80, 'Z招式': 0.80, '双重招式': 0.50, '组合招式': 0.55, '太晶化': 0.40 };

  // 预计算攻击力(atk/spa较高值)按星级中位数，供缺失时估算
  const POWER_MEDIAN = {};
  {
    const byR = {};
    for(const c of allCards){
      if(c.role === 'support') continue;
      const ms = c.mezastar_stats;
      if(!ms || (!Number.isFinite(ms.atk) && !Number.isFinite(ms.spa))) continue;
      const p = Math.max(ms.atk || 0, ms.spa || 0);
      if(p <= 0) continue;
      const r = c.rarity;
      if(!byR[r]) byR[r] = [];
      byR[r].push(p);
    }
    for(const [r, vals] of Object.entries(byR)){
      vals.sort((a,b) => a - b);
      POWER_MEDIAN[r] = vals.length % 2 ? vals[vals.length >> 1] : (vals[vals.length/2-1] + vals[vals.length/2]) / 2;
    }
    POWER_MEDIAN._global = (() => {
      const all = Object.values(byR).flat().sort((a,b) => a - b);
      return all.length ? (all.length % 2 ? all[all.length >> 1] : (all[all.length/2-1] + all[all.length/2]) / 2) : 100;
    })();
  }

  // 预计算各星级 energy 中位数
  const ENERGY_MEDIAN = {};
  {
    const byR = {};
    for(const c of allCards){
      if(c.role === 'support') continue;
      const e = Number(c.energy);
      if(!Number.isFinite(e) || e <= 0) continue;
      const r = c.rarity;
      if(!byR[r]) byR[r] = [];
      byR[r].push(e);
    }
    for(const [r, vals] of Object.entries(byR)){
      vals.sort((a,b) => a - b);
      ENERGY_MEDIAN[r] = vals.length % 2 ? vals[vals.length >> 1] : (vals[vals.length/2-1] + vals[vals.length/2]) / 2;
    }
    ENERGY_MEDIAN._global = (() => {
      const all = Object.values(byR).flat().sort((a,b) => a - b);
      return all.length ? (all.length % 2 ? all[all.length >> 1] : (all[all.length/2-1] + all[all.length/2]) / 2) : 100;
    })();
  }

  function clampN(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

  // 1v1 配对评分：每张卡对单个敌方的对局得分
  function scoreVS(enemy, card){
    // 攻击：我打敌方
    const atkMults = (card.types || []).map(t => {
      let m = 1;
      for(const et of (enemy.types || [])) m *= (TYPE_CHART[t]?.[et] ?? 1);
      return {type: t, mult: m};
    });
    const bestAtk = atkMults.length ? atkMults.reduce((a,b) => a.mult > b.mult ? a : b) : {type: null, mult: 1};

    // 防御：敌方打我
    let enemyDefMult = 0;
    let enemyBestType = '';
    for(const et of (enemy.types || [])){
      let m = 1;
      for(const ct of (card.types || [])) m *= (TYPE_CHART[et]?.[ct] ?? 1);
      if(m > enemyDefMult){ enemyDefMult = m; enemyBestType = et; }
    }

    // 对数评分
    const offRaw = Math.log2(bestAtk.mult || 0.125);
    const defRaw = -Math.log2(Math.max(enemyDefMult, 0.125));
    const offScore = SCORE_W.off * offRaw;
    const defScore = SCORE_W.def * defRaw;

    // 宝可能量（对数归一化，以100为基准）
    let energyVal = Number(card.energy);
    let energySource = 'actual';
    if(!Number.isFinite(energyVal) || energyVal <= 0){
      energyVal = ENERGY_MEDIAN[card.rarity] || ENERGY_MEDIAN._global || 100;
      energySource = ENERGY_MEDIAN[card.rarity] ? 'rarityMedian' : 'globalMedian';
    }
    const energyNorm = clampN(Math.log2(energyVal / 100), -1.5, 1.1);
    const energyScore = SCORE_W.energy * energyNorm;

    // 特殊机制（分层，每张卡实际只有1个机制）
    let specialScore = 0;
    const specialItems = [];
    for(const s of (card.special || [])){
      const w = SPECIAL_SCORE[s] ?? 0;
      if(w > 0){
        specialScore = Math.max(specialScore, w);
        specialItems.push({name: s, score: w});
      }
    }

    // 稀有度（居中归一化，★4=0）
    const rarityNorm = (card.rarity >= 2 && card.rarity <= 6) ? clampN((card.rarity - 4) / 2, -1, 1) : 0;
    const rarityScore = SCORE_W.rarity * rarityNorm;

    // 攻击力/特攻（取较高值，代表输出能力，同层内用于区分谁打得更痛）
    let powerVal = null;
    let powerSource = 'actual';
    const ms = card.mezastar_stats;
    if(ms && (Number.isFinite(ms.atk) || Number.isFinite(ms.spa))){
      powerVal = Math.max(ms.atk || 0, ms.spa || 0);
    }
    if(!powerVal || powerVal <= 0){
      powerVal = POWER_MEDIAN[card.rarity] || POWER_MEDIAN._global || 100;
      powerSource = POWER_MEDIAN[card.rarity] ? 'rarityMedian' : 'globalMedian';
    }
    const powerNorm = clampN(Math.log2(powerVal / 100), -1.5, 1.1);
    const powerScore = SCORE_W.power * powerNorm;

    const score = offScore + defScore + energyScore + specialScore + rarityScore + powerScore;

    // 词典序分层：先克制层，次防御层，数值分只做层内微调
    const offTier = bestAtk.mult >= 2 ? 2 : (bestAtk.mult >= 1 ? 1 : 0);
    const defTier = enemyDefMult === 0 ? 4 : (enemyDefMult <= 0.5 ? 3 : (enemyDefMult <= 1 ? 2 : (enemyDefMult <= 2 ? 1 : 0)));

    return {
      bestAtk, enemyDefMult, enemyBestType, score, offTier, defTier, powerVal,
      contributions: {
        offense: {raw: offRaw, weight: SCORE_W.off, score: offScore},
        defense: {raw: defRaw, weight: SCORE_W.def, score: defScore},
        energy: {value: energyVal, source: energySource, normalized: energyNorm, weight: SCORE_W.energy, score: energyScore},
        power: {value: powerVal, source: powerSource, normalized: powerNorm, weight: SCORE_W.power, score: powerScore},
        special: {items: specialItems, score: specialScore},
        rarity: {value: card.rarity, normalized: rarityNorm, weight: SCORE_W.rarity, score: rarityScore}
      }
    };
  }

  // 预计算所有卡对所有敌方的得分矩阵
  const matrix = myCards.map(card => {
    const vs = {};
    for(const e of enemies) vs[e.code] = scoreVS(e, card);
    return {card, vs};
  });

  // 穷举所有排列取全局最优（3! = 6 种，成本极低）
  function permutations(arr){
    if(arr.length <= 1) return [arr.slice()];
    const result = [];
    for(let i = 0; i < arr.length; i++){
      const rest = arr.slice(0,i).concat(arr.slice(i+1));
      for(const p of permutations(rest)) result.push([arr[i], ...p]);
    }
    return result;
  }

  // 降序比较器：a 排在 b 前（更优）返回正数
  // 词典序：先克制层，次防御层，再数值分
  function cmpVS(a, b){
    if(a.offTier !== b.offTier) return a.offTier - b.offTier;
    if(a.defTier !== b.defTier) return a.defTier - b.defTier;
    return a.score - b.score;
  }

  // 为每种敌方排列，贪心选最优可用卡（每张卡只用一次）
  let bestPairing = null;
  let bestTotalScore = -999;

  if(enemies.length <= 4){
    // 小规模：穷举敌方排列 × 每位贪心选卡（词典序）
    for(const perm of permutations(enemies)){
      const used = new Set();
      const pair = [];
      let totalScore = 0;
      for(const enemy of perm){
        let pick = null, sc = -999;
        for(const m of matrix){
          if(used.has(m.card.code)) continue;
          const s = m.vs[enemy.code];
          if(!pick || cmpVS(s, pick.vs[enemy.code]) > 0){ sc = s.score; pick = m; }
        }
        if(pick){
          used.add(pick.card.code);
          pair.push({enemy, match: pick, detail: pick.vs[enemy.code]});
          totalScore += sc;
        }
      }
      if(totalScore > bestTotalScore){
        bestTotalScore = totalScore;
        bestPairing = pair;
      }
    }
  } else {
    // 大规模（>4敌方）：退回贪心（词典序）
    const used = new Set();
    bestPairing = [];
    for(const enemy of enemies){
      let pick = null;
      for(const m of matrix){
        if(used.has(m.card.code)) continue;
        const s = m.vs[enemy.code];
        if(!pick || cmpVS(s, pick.vs[enemy.code]) > 0) pick = m;
      }
      if(pick){
        used.add(pick.card.code);
        bestPairing.push({enemy, match: pick, detail: pick.vs[enemy.code]});
      }
    }
  }

  // 每个敌方槽位的 top-3 备选（含被选中的那张，供 UI 展示替代方案）
  const alternates = {};
  for(const e of enemies){
    const sorted = matrix
      .map(m => ({card: m.card, d: m.vs[e.code]}))
      .sort((x, y) => -cmpVS(x.d, y.d));  // cmpVS(a,b)>0 表示 a 更优；sort 需要升序负号
    alternates[e.code] = sorted.slice(0, 3);
  }

  const pairing = bestPairing || [];
  const warnings = [];

  for(const p of pairing){
    const d = p.detail;
    const enemy = p.enemy;
    const enemyName = (window.getCardName_||getCardName)(enemy);
    const cardName = (window.getCardName_||getCardName)(p.match.card);
    if(d.bestAtk.mult < 2){
      const weakTypes = [];
      for(const t of TYPES){
        let m = 1;
        for(const et of enemy.types) m *= (TYPE_CHART[t]?.[et] ?? 1);
        if(m >= 2) weakTypes.push(t);
      }
      if(weakTypes.length){
        const typesStr = weakTypes.map(t=>getTypeName(t)).join('/');
        warnings.push(`${enemyName} — ${T('no_counter')} ${T('suggest')} ${typesStr} ${T('xi')}`);
      } else {
        warnings.push(`${enemyName} — ${T('no_2x_weak')}`);
      }
    }
    if(d.enemyDefMult >= 4){
      warnings.push(`⚠️ ${cardName} ${T('warn_4x')}`);
    }
  }

  // 特殊机制冲突检查
  const usedSpecials = new Set();
  const specialConflicts = [];
  for(const p of pairing){
    for(const s of (p.match.card.special || [])){
      if(usedSpecials.has(s)) specialConflicts.push(`${(window.getCardName_||getCardName)(p.match.card)} · ${s}`);
      usedSpecials.add(s);
    }
  }

  // 支援券推荐
  let supportPick = null;
  if(mySupports.length > 0){
    const supportScored = mySupports.map(s => {
      let supAtk = 0;
      const moveType = s.support_move_type || s.types[0];
      for(const enemy of enemies){
        let m = 1;
        for(const et of enemy.types) m *= (TYPE_CHART[moveType]?.[et] ?? 1);
        supAtk += m;
      }
      return {card: s, supAtk, moveType};
    });
    supportScored.sort((a,b) => b.supAtk - a.supAtk);
    supportPick = supportScored[0];
  }

  // 渲染
  result.innerHTML = `
    <div class="recommend-team">
      <h3>${T('recommend_title')}</h3>
      <div class="pairing-list">
        ${pairing.map((p, i) => {
          const enemy = p.enemy;
          const card = p.match.card;
          const d = p.detail;
          const enemyStars = '★'.repeat(enemy.rarity);
          const enemyTypeBadges = enemy.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('');
          const enemyName = (window.getCardName_||getCardName)(enemy);

          // 该敌方的 top-3 备选 + 相克徽章
          const alts = (alternates[enemy.code] || []).map((a, ai) => {
            const c = a.card;
            const ad = a.d;
            const cName = (window.getCardName_||getCardName)(c);
            const cStars = '★'.repeat(c.rarity);
            const cTypes = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('');

            let badge = '', badgeCls = 'alt-neutral';
            if(ad.bestAtk.mult >= 2){ badge = `${T('counter_badge')} ${ad.bestAtk.mult}x`; badgeCls = 'alt-counter'; }
            else if(ad.bestAtk.mult === 0){ badge = T('zero_atk_badge'); badgeCls = 'alt-zero'; }
            else if(ad.enemyDefMult === 0){ badge = T('immune_def_badge'); badgeCls = 'alt-counter'; }
            else if(ad.enemyDefMult >= 4){ badge = `${T('countered_badge')} ${ad.enemyDefMult}x`; badgeCls = 'alt-danger'; }
            else if(ad.bestAtk.mult < 1){ badge = T('weak_atk_badge'); badgeCls = 'alt-weak'; }
            else { badge = T('no_counter_badge'); badgeCls = 'alt-neutral'; }

            const atkDesc = ad.bestAtk.mult !== 1 ? `${getTypeName(ad.bestAtk.type)} ${ad.bestAtk.mult}x` : '';
            // 防御信息始终展示：免疫 / 抗性 / 普通 / 被克
            const defDesc = ad.enemyDefMult === 0 ? `${T('immune_text')} 0x` :
              (ad.enemyDefMult >= 2 ? `${T('takes')} ${ad.enemyDefMult}x(${getTypeName(ad.enemyBestType)})` :
              (ad.enemyDefMult <= 0.5 ? `${T('resists')} ${ad.enemyDefMult}x` : `${T('normal_def')} 1x`));

            return `
              <div class="alt-card ${badgeCls}">
                <div class="alt-rank">#${ai + 1}</div>
                ${c.img ? `<img class="alt-img" src="${c.img}" alt="${cName}" loading="lazy">` : ''}
                <div class="alt-info">
                  <div class="alt-name">${cName} <span class="alt-stars">${cStars}</span></div>
                  <div class="alt-types">${cTypes}</div>
                  <div class="alt-badge">${badge}</div>
                  ${(atkDesc || defDesc) ? `<div class="alt-detail">${[atkDesc, defDesc].filter(Boolean).join(' · ')}</div>` : ''}
                  ${c.energy ? `<div class="alt-energy">${T('energy')} ${c.energy}</div>` : ''}
                  ${ad.powerVal ? `<div class="alt-power">${T('stat_atk')}/${T('stat_spa')} ${ad.powerVal}</div>` : ''}
                </div>
              </div>
            `;
          }).join('');

          const noCounter = d.bestAtk.mult < 2;
          const cardName = (window.getCardName_||getCardName)(card);

          return `
            <div class="pairing-item">
              <div class="pairing-vs">
                <div class="pairing-enemy">
                  <div class="pairing-label">${T('enemy_slot')} ${i+1}</div>
                  ${enemy.img ? `<div class="pairing-img"><img src="${enemy.img}" alt="${enemyName}" loading="lazy"></div>` : ''}
                  <div class="pairing-name">${enemyName}</div>
                  <div class="pairing-stars">${enemyStars}</div>
                  <div class="card-types">${enemyTypeBadges}</div>
                </div>
                <div class="pairing-arrow">→</div>
                <div class="pairing-mine">
                  ${card.img ? `<div class="pairing-img"><img src="${card.img}" alt="${cardName}" loading="lazy"></div>` : ''}
                  <div class="pairing-name">${cardName}</div>
                  <div class="pairing-stars">${'★'.repeat(card.rarity)}</div>
                  <div class="card-types">${card.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('')}</div>
                  ${(card.special||[]).length ? `<div class="card-special">${(card.special||[]).map(s => `<span class="special-badge">${s}</span>`).join('')}</div>` : ''}
                </div>
              </div>
              ${noCounter ? `<div class="slot-banner">${T('no_counter_banner')}</div>` : ''}
              <div class="alt-list">${alts}</div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="type-proxy-note">${T('type_proxy_note')}</div>

      ${warnings.length ? `<div class="coverage-warnings">${warnings.map(w => `<div class="coverage-warn">${w}</div>`).join('')}</div>` : ''}

      ${supportPick ? `
        <h3>${T('recommend_support')}</h3>
        <div class="team-cards support">
          <div class="team-card support">
            <div class="support-label">${T('support')}</div>
            <div class="card-name">${(window.getCardName_||getCardName)(supportPick.card)}</div>
            <div class="card-types"><span class="type-tag sm" style="background:${TYPE_COLORS[supportPick.moveType]}">${getTypeName(supportPick.moveType)}</span></div>
            <div class="card-atk-info">${T('support_move_label')}：${supportPick.card.support_move || ''}</div>
          </div>
        </div>
      ` : `
        <h3>${T('support')}</h3>
        <p class="hint">${T('support_hint')}</p>
      `}

      ${specialConflicts.length ? `<div class="special-notice">⚠️ ${specialConflicts.join('；')}${T('special_conflict')}</div>` : ''}
    </div>
  `;
}

// 分析敌方弱点（无收藏时展示）
function analyzeEnemy(e){
  const weak = [];
  for(const t of TYPES){
    let m = 1;
    for(const et of e.types) m *= (TYPE_CHART[t]?.[et] ?? 1);
    if(m >= 2) weak.push({type:t, mult:m});
  }
  const weakBadges = weak.map(w => `<span class="type-tag" style="background:${TYPE_COLORS[w.type]}">${getTypeName(w.type)} ${w.mult}x</span>`).join('');
  return `<div class="enemy-analysis"><span class="analysis-name">vs ${(window.getCardName_||getCardName)(e)} ★${e.rarity}</span><div class="type-tags">${weakBadges||'<span class="hint">'+T('no_2x_weak')+'</span>'}</div></div>`;
}

// 暴露给 onclick
window.openEnemyPickerPub = openEnemyPicker;
window.removeEnemyPub = removeEnemy;
window.selectEnemyPub = selectEnemy;
window.showCardDetailPub = showCardDetail;
window.closeCardDetailPub = closeCardDetail;
window.renderEnemySlots_ = renderEnemySlots;
window.renderEnemyPicker_ = renderEnemyPicker;

// ===== Tab 切换 =====
function switchTab(tab){
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
}

// ===== 卡牌详情弹窗 =====
function showCardDetail(code){
  const card = allCards.find(c => c.code === code);
  if(!card) return;
  const modal = document.getElementById('card-detail-modal');
  if(!modal) return;

  const stars = card.role === 'support' ? T('support') : '★'.repeat(card.rarity);
  const typeBadges = card.types.map(t => `<span class="type-tag" style="background:${TYPE_COLORS[t]||'#666'}">${getTypeName(t)}</span>`).join('');
  const specialBadges = (card.special||[]).map(s => `<span class="special-badge">${s}</span>`).join('');
  const owned = collection[code];
  const energyText = card.energy ? `<span class="detail-energy">${card.energy}</span>` : '<span class="detail-energy missing">?</span>';
  const imgHtml = card.img
    ? `<img src="${card.img}" alt="${(window.getCardName_||getCardName)(card)}" onerror="this.style.display='none'">`
    : `<div class="detail-no-img">${T('no_image')}</div>`;

  // 弱点和抗性
  const weaknesses = [];
  const resistances = [];
  const immunities = [];
  for(const atkType of TYPES){
    let mult = 1;
    for(const defType of card.types){
      mult *= (TYPE_CHART[atkType]?.[defType] ?? 1);
    }
    if(mult >= 2) weaknesses.push({type: atkType, mult});
    else if(mult > 0 && mult <= 0.5) resistances.push({type: atkType, mult});
    else if(mult === 0) immunities.push({type: atkType});
  }
  weaknesses.sort((a,b) => b.mult - a.mult);
  resistances.sort((a,b) => a.mult - b.mult);

  const weakHtml = weaknesses.length
    ? weaknesses.map(w => `<span class="type-tag weak" style="background:${TYPE_COLORS[w.type]||'#666'}">${getTypeName(w.type)} ${w.mult}x</span>`).join('')
    : `<span class="hint">${T('none_label')}</span>`;
  const resistHtml = resistances.length
    ? resistances.map(r => `<span class="type-tag resist" style="background:${TYPE_COLORS[r.type]||'#666'}">${getTypeName(r.type)} ${r.mult}x</span>`).join('')
    : `<span class="hint">${T('none_label')}</span>`;
  const immuneHtml = immunities.length
    ? immunities.map(i => `<span class="type-tag immune" style="background:${TYPE_COLORS[i.type]||'#666'}">${getTypeName(i.type)} ${T('immune')}</span>`).join('')
    : '';

  // 支援招式
  const supportInfo = card.support_move
    ? `<div class="detail-row"><span class="detail-label">${T('support_move_label')}</span><span class="detail-value">${card.support_move}（${getTypeName(card.support_move_type)}）</span></div>`
    : '';

  // 招式（卡背OCR）
  const movesInfo = (card.moves && card.moves.length)
    ? `<div class="detail-section"><h3>${T('moves_title')}</h3><div class="moves-list">${card.moves.map(m => `<span class="move-chip">⚡${m}</span>`).join('')}</div></div>`
    : '';

  // 街机真实数值（卡背OCR）
  const mzInfo = card.mezastar_stats ? `
    <div class="detail-section">
      <h3>${T('mezastar_stats_title')}</h3>
      <div class="stats-grid">
        ${[{'key':'hp','label':T('stat_hp')},{'key':'atk','label':T('stat_atk')},{'key':'def','label':T('stat_def')},{'key':'spa','label':T('stat_spa')},{'key':'spd','label':T('stat_spd')},{'key':'spe','label':T('stat_spe')}].map(s => {
          const val = card.mezastar_stats[s.key];
          const pct = Math.min(100, val/250*100);
          const barClass = val >= 170 ? 'hi' : val <= 80 ? 'lo' : '';
          return `<div class="stat-row"><span class="stat-row-label">${s.label}</span><span class="stat-row-val">${val}</span><div class="stat-bar ${barClass}" style="width:${pct}%"></div></div>`;
        }).join('')}
      </div>
    </div>` : '';

  modal.innerHTML = `
    <div class="detail-content" style="--type-color:${TYPE_COLORS[card.types[0]]||'var(--accent)'}">
      <button class="detail-close" onclick="closeCardDetailPub()">✕</button>
      <div class="detail-img">${imgHtml}</div>
      <div class="detail-body">
        <h2 class="detail-name">${(window.getCardName_||getCardName)(card)}</h2>
        <div class="detail-meta">
          <span class="detail-stars">${stars}</span>
          <span class="detail-code">${card.code}</span>
        </div>
        <div class="detail-types">${typeBadges}</div>
        ${specialBadges ? `<div class="detail-special">${specialBadges}</div>` : ''}
        <div class="detail-stats">
          <div class="stat-box">
            <span class="stat-label">${T('energy')}</span>
            ${energyText}
          </div>
        </div>
        ${supportInfo}
        ${movesInfo}
        ${mzInfo}
        ${(window.getCardDesc_||getCardDesc)(card) ? `<div class="detail-desc">${(window.getCardDesc_||getCardDesc)(card)}</div>` : ''}
        ${card.base_stats ? `
        <div class="detail-section">
          <h3>${T('basestats')}</h3>
          <div class="stats-grid">
            ${[{'key':'hp','label':'HP'},{'key':'atk','label':T('stat_atk')},{'key':'def','label':T('stat_def')},{'key':'spa','label':T('stat_spa')},{'key':'spd','label':T('stat_spd')},{'key':'spe','label':T('stat_spe')}].map(s => {
              const val = card.base_stats[s.key];
              const pct = Math.min(100, val/180*100);
              const barClass = val >= 100 ? 'stat-bar-high' : val >= 60 ? 'stat-bar-mid' : 'stat-bar-low';
              return `<div class="stat-row"><span class="stat-row-label">${s.label}</span><span class="stat-row-val">${val}</span><div class="stat-bar ${barClass}" style="width:${pct}%"></div></div>`;
            }).join('')}
          </div>
          <div class="stats-extra">${T('height')} ${card.base_stats.height}m · ${T('weight')} ${card.base_stats.weight}kg</div>
        </div>
        ` : ''}
        <div class="detail-section">
          <h3>${T('weak')}</h3>
          <div class="type-tags">${weakHtml}</div>
        </div>
        <div class="detail-section">
          <h3>${T('resist')}</h3>
          <div class="type-tags">${resistHtml}</div>
        </div>
        ${immuneHtml ? `<div class="detail-section"><h3>${T('immune')}</h3><div class="type-tags">${immuneHtml}</div></div>` : ''}
        <button class="detail-own-btn ${owned?'checked':''}" onclick="event.stopPropagation();toggleCardPub('${code}');showCardDetailPub('${code}')">
          ${owned ? '✓ ' + T('owned') : '+ ' + T('own_btn')}
        </button>
      </div>
    </div>
  `;

  const overlay = document.getElementById('card-detail-overlay');
  if(overlay) overlay.classList.add('show');
}

function closeCardDetail(){
  const overlay = document.getElementById('card-detail-overlay');
  if(overlay) overlay.classList.remove('show');
}

// ESC 关闭弹窗
document.addEventListener('keydown', e => {
  if(e.key === 'Escape') closeCardDetail();
});

// ===== 初始化 =====
function init(){
  loadCollection();
  loadCards();
  renderTypeGrid('type-grid', showTypeEffect);
  renderEnemySlots();

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', ()=> switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('#filter-series,#filter-rarity,#filter-type,#filter-owned').forEach(el => {
    el.addEventListener('change', renderCardGrid);
  });

  // 搜索框防抖
  let searchTimer;
  document.getElementById('filter-search')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderCardGrid, 200);
  });

  // 敌方选择面板事件
  document.getElementById('picker-close').addEventListener('click', closeEnemyPicker);
  document.getElementById('picker-rarity').addEventListener('change', renderEnemyPicker);
  document.getElementById('picker-search').addEventListener('input', renderEnemyPicker);

  // 数据加载完成后重新应用语言（更新筛选器选项翻译）
  if(typeof window.applyLang_ === 'function') window.applyLang_(document.documentElement.dataset.lang || 'zh', false);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();

// ===== 主题切换器 =====
(function setupThemeSwitcher(){
  const THEME_KEY = "mezastar-theme";
  const themeColors = { light: "#F7FAFF", dark: "#101927", comfort: "#F3F0DD" };

  const switcher = document.querySelector(".theme-switcher");
  const status = document.querySelector("#themeStatus");
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if(!switcher) return;

  function applyTheme(theme, shouldSave){
    if(!themeColors[theme]) return;
    document.documentElement.dataset.theme = theme;
    switcher.querySelectorAll("[data-theme-value]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeValue === theme));
    });
    if(themeColorMeta) themeColorMeta.setAttribute("content", themeColors[theme]);
    if(status){
      const localizedName = (typeof T === 'function' && T(theme)) || theme;
      const template = (typeof T === 'function' && T('theme_status')) || 'Switched to {theme} theme';
      status.textContent = template.replace('{theme}', localizedName);
    }
    if(shouldSave){
      try { localStorage.setItem(THEME_KEY, theme); } catch(e) {}
    }
  }

  switcher.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-theme-value]");
    if(!btn) return;
    applyTheme(btn.dataset.themeValue, true);
  });

  // 暴露一个 hook，让语言切换后能重读 theme status 文本
  window.refreshThemeStatus_ = function(){
    const currentTheme = document.documentElement.dataset.theme;
    if(currentTheme && status){
      const localizedName = (typeof T === 'function' && T(currentTheme)) || currentTheme;
      const template = (typeof T === 'function' && T('theme_status')) || 'Switched to {theme} theme';
      status.textContent = template.replace('{theme}', localizedName);
    }
  };

  applyTheme(document.documentElement.dataset.theme || "light", false);
})();

// ===== 语言切换器（全局变量用 var 避免顶层 const 重复声明问题）=====
var I18N = {
  zh: {
    collection:"收藏", battle:"对战推荐", typechart:"属性表",
    brand:"明耀之星", app_title:"属性克制表", typechart_hint:"点击属性查看攻防效果",
    energy:"宝可能量", basestats:"基础属性", weak:"被克弱点", resist:"抗性减伤", immune:"免疫",
    search_ph:"搜索宝可梦...", own_btn:"收藏", owned:"已收藏", support:"支援券",
    recommend_title:"推荐阵容（每只各打一场）", recommend_empty:"选择敌方宝可梦后，这里会显示推荐阵容",
    recommend_support:"推荐支援券", support_hint:"收藏页可勾选支援券，这里会自动推荐。",
    no_counter:"无有效克制", suggest:"建议", xi:"系",
    be_weak:"被克 (受到2x)", be_resist:"抗性 (受到0.5x)", be_immune:"免疫 (受到0x)",
    atk_effect:"效果绝佳 (2x)", atk_weak:"效果不佳 (0.5x)", atk_none:"无效 (0x)",
    all_series:"全部弹数", all_rarity:"全部稀有度", all_types:"全部属性", owned_only:"只看已收藏",
    height:"身高", weight:"体重", special_conflict:"（每场各限用一次）",
    rarity_6:"超级明星", rarity_5:"明星", rarity_4:"", rarity_3:"", rarity_2:"", rarity_other:"其他",
    add_slot:"添加敌方", enemy_slot:"敌方", remove:"移除", select_enemy:"选择敌方宝可梦",
    light:"明亮", dark:"暗色", comfort:"护眼",
    atk_dir:"攻击", def_dir:"防守", pairing_label:"敌方", my_label:"我方", atk_text:"攻", def_text:"被打",
    res_text:"抗", immune_text:"免疫", normal_def:"普通承伤", load_error:"数据加载失败",
    battle_hint:"选择对方宝可梦（最多3只），根据你的收藏推荐阵容",
    search_enemy_ph:"搜索宝可梦名字...", no_image:"暂无图片", support_move_label:"支援招式", none_label:"无",
    stat_atk:"攻击", stat_def:"防御", stat_spa:"特攻", stat_spd:"特防", stat_spe:"速度",
    stat_hp:"体力", moves_title:"招式", mezastar_stats_title:"街机数值（卡背）",
    enemy_analysis:"敌方阵容分析", no_cards_owned:"你还没有收藏任何卡牌！",
    no_cards_hint:"去「收藏」页勾选你拥有的明耀之星盘。",
    no_2x_weak:"无2x克制", warn_4x:"被4倍克制！", theme_status:"已切换为{theme}主题",
    counter_badge:"克制", countered_badge:"被克", zero_atk_badge:"无法命中0x", weak_atk_badge:"输出减半",
    immune_def_badge:"免疫对手", no_counter_badge:"无克制·生存向", no_counter_banner:"⚠ 此对手你没有克制卡——以下按防御与能量择优",
    takes:"承伤", resists:"抗性", type_proxy_note:"* 属性按宝可梦本体推定，实际伤害以卡背招式属性为准",
  },
  en: {
    collection:"Collection", battle:"Battle", typechart:"Type Chart",
    brand:"MEZASTAR", app_title:"Type Chart", typechart_hint:"Click a type to see offense & defense",
    energy:"Poké Energy", basestats:"Base Stats", weak:"Weakness", resist:"Resistance", immune:"Immunity",
    search_ph:"Search Pokémon...", own_btn:"Owned", owned:"Owned", support:"Support",
    recommend_title:"Recommended Team (1v1 each)", recommend_empty:"Select opponent Pokémon to see your team",
    recommend_support:"Recommended Support", support_hint:"Mark Support cards in Collection to get recommendations.",
    no_counter:"No effective counter", suggest:"Try", xi:"type",
    be_weak:"Weak to (takes 2x)", be_resist:"Resists (takes 0.5x)", be_immune:"Immune (takes 0x)",
    atk_effect:"Super effective (2x)", atk_weak:"Not very effective (0.5x)", atk_none:"No effect (0x)",
    all_series:"All Series", all_rarity:"All Rarities", all_types:"All Types", owned_only:"Owned Only",
    height:"Height", weight:"Weight", special_conflict:"(each once per match)",
    rarity_6:"Superstar", rarity_5:"Star", rarity_4:"", rarity_3:"", rarity_2:"", rarity_other:"Other",
    add_slot:"Add Opponent", enemy_slot:"Enemy", remove:"Remove", select_enemy:"Select Opponent",
    light:"Light", dark:"Dark", comfort:"Eye Care",
    atk_dir:"Attack", def_dir:"Defense", pairing_label:"Enemy", my_label:"Yours", atk_text:"ATK", def_text:"DEF",
    res_text:"Resists", immune_text:"Immune", normal_def:"Normal damage", load_error:"Failed to load data",
    battle_hint:"Select opponent Pokémon (up to 3) to get team recommendations",
    search_enemy_ph:"Search by name...", no_image:"No image available", support_move_label:"Support Move", none_label:"None",
    stat_atk:"ATK", stat_def:"DEF", stat_spa:"Sp.A", stat_spd:"Sp.D", stat_spe:"SPE",
    stat_hp:"HP", moves_title:"Moves", mezastar_stats_title:"Arcade Stats (Card Back)",
    enemy_analysis:"Enemy Analysis", no_cards_owned:"You haven't collected any cards yet!",
    no_cards_hint:"Go to Collection to mark your MEZASTAR discs.",
    no_2x_weak:"No 2x weakness", warn_4x:"takes 4x damage!", theme_status:"Switched to {theme} theme",
    counter_badge:"Counter", countered_badge:"Countered", zero_atk_badge:"No effect 0x", weak_atk_badge:"Half dmg",
    immune_def_badge:"Immune", no_counter_badge:"No counter · tanky", no_counter_banner:"⚠ No counter card for this foe — best by defense & energy",
    takes:"Takes", resists:"Resists", type_proxy_note:"* Types inferred from Pokémon species — actual damage follows move types on card back",
  },
};

function T(key){
  if(typeof I18N === 'undefined' || !I18N) return key;
  const lang = document.documentElement.dataset.lang || 'zh';
  const t = I18N[lang] || I18N.zh;
  return t[key] !== undefined ? t[key] : key;
}

// 属性名翻译
var TYPE_I18N = {
  '一般':['一般','Normal'], '火':['火','Fire'], '水':['水','Water'], '草':['草','Grass'],
  '电':['电','Electric'], '冰':['冰','Ice'], '格斗':['格斗','Fighting'], '毒':['毒','Poison'],
  '地面':['地面','Ground'], '飞行':['飞行','Flying'], '超能力':['超能力','Psychic'],
  '虫':['虫','Bug'], '岩石':['岩石','Rock'], '幽灵':['幽灵','Ghost'], '龙':['龙','Dragon'],
  '恶':['恶','Dark'], '钢':['钢','Steel'], '妖精':['妖精','Fairy'],
};
function getTypeName(t){
  const lang = document.documentElement.dataset.lang || 'zh';
  const entry = TYPE_I18N[t];
  if(!entry) return t;
  return lang === 'en' ? entry[1] : entry[0];
}

// 弹数名翻译
var SERIES_I18N = {
  's1':['星光第1弹','Star Pack 1'], 's2':['星光第2弹','Star Pack 2'],
  's3':['星光第3弹','Star Pack 3'], 's4':['星光第4弹','Star Pack 4'],
  'g1':['银河第1弹','Galaxy Pack 1'], 'g2':['银河第2弹','Galaxy Pack 2'],
  'support':['支援券','Support'],
};
function getSeriesName(sid){
  const lang = document.documentElement.dataset.lang || 'zh';
  const entry = SERIES_I18N[sid];
  if(!entry) return sid;
  return lang === 'en' ? entry[1] : entry[0];
}

(function setupLangSwitcher(){
  const LANG_KEY = "mezastar-lang";
  const switcher = document.querySelector(".lang-switcher");
  if(!switcher) return;

  function applyLang(lang, shouldSave){
    if(!I18N[lang]) return;
    document.documentElement.dataset.lang = lang;
    document.documentElement.lang = (lang === 'en') ? 'en' : 'zh-CN';
    const t = I18N[lang];

    // aria-label 国际化
    const themeSwitcher = document.querySelector('.theme-switcher');
    if(themeSwitcher) themeSwitcher.setAttribute('aria-label', lang === 'en' ? 'Theme' : '界面主题');
    const langSwitcherEl = document.querySelector('.lang-switcher');
    if(langSwitcherEl) langSwitcherEl.setAttribute('aria-label', lang === 'en' ? 'Language' : '语言');
    const navEl = document.querySelector('.app-nav');
    if(navEl) navEl.setAttribute('aria-label', lang === 'en' ? 'Navigation' : '主要导航');

    // 导航按钮
    document.querySelectorAll('.nav-item').forEach(btn => {
      const tab = btn.dataset.tab;
      const span = btn.querySelector('span:last-child');
      if(tab === 'collection') span.textContent = t.collection;
      else if(tab === 'battle') span.textContent = t.battle;
      else if(tab === 'type-chart' || tab === 'typechart') span.textContent = t.typechart;
    });

    // 品牌标题
    document.querySelectorAll('.app-brand strong').forEach(el => el.textContent = t.brand);

    // 主题切换器文字
    document.querySelectorAll('.theme-switcher button').forEach(btn => {
      const val = btn.dataset.themeValue;
      const span = btn.querySelector('span:last-child');
      if(span) span.textContent = t[val] || val;
    });

    // 页面 h2 标题
    document.querySelectorAll('h2').forEach(h => {
      if(h.closest('#tab-battle')) h.textContent = t.battle;
      else if(h.closest('#tab-type-chart')) h.textContent = t.app_title;
    });

    // 对战推荐页 hint（Battle 页提示）
    document.querySelectorAll('#tab-battle .battle-section > .hint').forEach(h => {
      h.textContent = t.battle_hint;
    });

    // 敌方选择器
    const pickerHeader = document.querySelector('#enemy-picker .picker-header > span');
    if(pickerHeader) pickerHeader.textContent = t.select_enemy;
    const pickerSearch = document.getElementById('picker-search');
    if(pickerSearch) pickerSearch.placeholder = t.search_enemy_ph;

    // 属性表提示
    const hints = document.querySelectorAll('#tab-type-chart .hint');
    if(hints[0]) hints[0].textContent = t.typechart_hint;

    // 搜索框
    const search = document.getElementById('filter-search');
    if(search) search.placeholder = t.search_ph;

    // 筛选器
    const fs = document.getElementById('filter-series');
    if(fs){
      fs.options[0].textContent = t.all_series;
      for(let i=1;i<fs.options.length;i++){
        const sid = fs.options[i].value;
        fs.options[i].textContent = getSeriesName(sid);
      }
    }
    const fr = document.getElementById('filter-rarity');
    if(fr) fr.options[0].textContent = t.all_rarity;

    const ft = document.getElementById('filter-type');
    if(ft){
      ft.options[0].textContent = t.all_types;
      for(let i=1;i<ft.options.length;i++){
        const tname = ft.options[i].value;
        ft.options[i].textContent = getTypeName(tname);
      }
    }

    const fo = document.querySelector('#filter-owned');
    if(fo && fo.parentElement){
      // 只改 label 文字，不重建 checkbox（避免丢失事件绑定）
      const label = fo.parentElement;
      // 找到 label 里的文字节点并更新
      label.childNodes.forEach(node => {
        if(node.nodeType === 3) node.textContent = ' ' + t.owned_only;
      });
    }

    // 按钮 aria-pressed
    switcher.querySelectorAll("[data-lang-value]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.langValue === lang));
    });

    if(shouldSave){ try { localStorage.setItem(LANG_KEY, lang); } catch(e) {} }

    // 重新渲染（通过 window 暴露的引用，跨 IIFE 调用）
    if(typeof window.renderCardGrid_ === 'function') window.renderCardGrid_();
    if(typeof window.recommendTeam_ === 'function') window.recommendTeam_();
    if(typeof window.renderTypeGrid_ === 'function') window.renderTypeGrid_('type-grid', window.showTypeEffect_ || undefined);
    if(typeof window.renderEnemySlots_ === 'function') window.renderEnemySlots_();
    if(typeof window.renderEnemyPicker_ === 'function') window.renderEnemyPicker_();

    // 重新触发 theme status 文本更新（应用新语言）
    if(typeof window.refreshThemeStatus_ === 'function') window.refreshThemeStatus_();
  }

  switcher.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-lang-value]");
    if(!btn) return;
    applyLang(btn.dataset.langValue, true);
  });

  // 暴露到全局，让 init() 可以在数据加载后调用
  window.applyLang_ = applyLang;

  applyLang(document.documentElement.dataset.lang || "zh", false);
})();
// v20260816e
