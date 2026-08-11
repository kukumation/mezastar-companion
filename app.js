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
    const resp = await fetch('cards.json');
    const data = await resp.json();
    allCards = [];
    for(const series of data.series){
      for(const card of series.cards){
        allCards.push({...card, series: series.id, series_name: series.name});
      }
    }
    populateFilters(data.series);
    renderCardGrid();
    updateStats();
    renderEnemyPicker();
  } catch(e){
    console.error('Failed to load cards.json:', e);
    document.getElementById('card-grid').innerHTML = '<p class="error">数据加载失败</p>';
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

// ===== 属性克制表 =====
function renderTypeGrid(containerId, onClick){
  const grid = document.getElementById(containerId);
  if(!grid) return;
  grid.innerHTML = '';
  for(const type of TYPES){
    const btn = document.createElement('button');
    btn.className = 'type-btn';
    btn.style.backgroundColor = TYPE_COLORS[type];
    btn.textContent = type;
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
  const of = document.getElementById('filter-owned').checked;
  const sf2 = (document.getElementById('filter-search')?.value || '').trim().toLowerCase();

  const filtered = allCards.filter(c => {
    if(sf !== 'all' && c.series !== sf) return false;
    if(rf !== 'all' && c.rarity !== parseInt(rf)) return false;
    if(tf !== 'all' && !c.types.includes(tf)) return false;
    if(of && !collection[c.code]) return false;
    if(sf2 && !c.name.toLowerCase().includes(sf2) && !c.code.toLowerCase().includes(sf2)) return false;
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
    const stars = c.role === 'support' ? '支援' : '★'.repeat(c.rarity);
    const typeBadges = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('');
    const specialBadges = (c.special||[]).map(s => `<span class="special-badge">${s}</span>`).join('');
    const supportMove = c.support_move ? `<div class="support-move-info">支援：${c.support_move}（${c.support_move_type}）</div>` : '';
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
          <div class="card-name">${getCardName(c)}</div>
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
          <img src="${enemy.img||''}" alt="${enemy.name}" class="slot-img" onerror="this.style.display='none'">
          <div class="slot-info">
            <div class="slot-stars">${stars}</div>
            <div class="slot-name">${enemy.name}</div>
            <div class="slot-types">${typeBadges}</div>
          </div>
          <button class="slot-remove" onclick="event.stopPropagation();removeEnemyPub(${i})">✕</button>
        </div>
      `;
    }
    return `
      <div class="enemy-slot empty" data-slot="${i}" onclick="openEnemyPickerPub(${i})">
        <span class="slot-plus">+</span>
        <span class="slot-label">敌方${i+1}</span>
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
    if(search && !c.name.includes(search)) return false;
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
          ${c.img ? `<img src="${c.img}" alt="${c.name}" loading="lazy">` : ''}
          <span class="rarity-badge">${stars}</span>
        </div>
        <div class="picker-card-info">
          <div class="card-name">${getCardName(c)}</div>
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
        <p>你还没有收藏任何卡牌！</p>
        <p>去「收藏」页勾选你拥有的明耀之星盘。</p>
        <div class="enemy-summary">
          <h3>敌方阵容分析</h3>
          ${enemies.map(e => analyzeEnemy(e)).join('')}
        </div>
      </div>
    `;
    return;
  }

  // 1v1 配对评分：每张卡对单个敌方的对局得分
  function scoreVS(enemy, card){
    // 攻击：我打敌方
    const atkMults = card.types.map(t => {
      let m = 1;
      for(const et of enemy.types) m *= (TYPE_CHART[t]?.[et] ?? 1);
      return {type: t, mult: m};
    });
    const bestAtk = atkMults.reduce((a,b) => a.mult > b.mult ? a : b);

    // 防御：敌方打我
    let enemyDefMult = 0;
    let enemyBestType = '';
    for(const et of enemy.types){
      let m = 1;
      for(const ct of card.types) m *= (TYPE_CHART[et]?.[ct] ?? 1);
      if(m > enemyDefMult){ enemyDefMult = m; enemyBestType = et; }
    }

    // log 评分（攻击权重 > 防御）
    const off = Math.log2(bestAtk.mult || 0.125);
    const def = -Math.log2(Math.max(enemyDefMult, 0.125));
    let score = 1.0 * off + 0.6 * def;

    // 特殊机制和稀有度（低权重）
    if(card.special?.length > 0) score += 0.3;
    score += card.rarity * 0.08;

    return {bestAtk, enemyDefMult, enemyBestType, score};
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

  // 为每种敌方排列，贪心选最优可用卡（每张卡只用一次）
  let bestPairing = null;
  let bestTotalScore = -999;

  if(enemies.length <= 4){
    // 小规模：穷举敌方排列 × 每位贪心选卡
    for(const perm of permutations(enemies)){
      const used = new Set();
      const pair = [];
      let totalScore = 0;
      for(const enemy of perm){
        let pick = null, sc = -999;
        for(const m of matrix){
          if(used.has(m.card.code)) continue;
          const s = m.vs[enemy.code];
          if(s.score > sc){ sc = s.score; pick = m; }
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
    // 大规模（>4敌方）：退回贪心
    const used = new Set();
    bestPairing = [];
    for(const enemy of enemies){
      let pick = null, sc = -999;
      for(const m of matrix){
        if(used.has(m.card.code)) continue;
        const s = m.vs[enemy.code];
        if(s.score > sc){ sc = s.score; pick = m; }
      }
      if(pick){
        used.add(pick.card.code);
        bestPairing.push({enemy, match: pick, detail: pick.vs[enemy.code]});
      }
    }
  }

  const pairing = bestPairing || [];
  const warnings = [];

  for(const p of pairing){
    const d = p.detail;
    const enemy = p.enemy;
    if(d.bestAtk.mult < 2){
      const weakTypes = [];
      for(const t of TYPES){
        let m = 1;
        for(const et of enemy.types) m *= (TYPE_CHART[t]?.[et] ?? 1);
        if(m >= 2) weakTypes.push(t);
      }
      if(weakTypes.length){
        warnings.push(`对 ${enemy.name} 无有效克制（建议 ${weakTypes.join('/')} 系）`);
      } else {
        warnings.push(`对 ${enemy.name} 无2x克制属性`);
      }
    }
    if(d.enemyDefMult >= 4){
      warnings.push(`⚠️ ${p.match.card.name} 被 ${enemy.name} 4倍克制！`);
    }
  }

  // 特殊机制冲突检查
  const usedSpecials = new Set();
  const specialConflicts = [];
  for(const p of pairing){
    for(const s of (p.match.card.special || [])){
      if(usedSpecials.has(s)) specialConflicts.push(`${p.match.card.name} 的 ${s}`);
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
          const stars = '★'.repeat(card.rarity);
          const enemyStars = '★'.repeat(enemy.rarity);
          const typeBadges = card.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('');
          const enemyTypeBadges = enemy.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${getTypeName(t)}</span>`).join('');
          const specialBadges = (card.special||[]).map(s => `<span class="special-badge">${s}</span>`).join('');

          const atkClass = d.bestAtk.mult >= 2 ? 'atk-strong' : d.bestAtk.mult <= 0.5 ? 'atk-weak' : '';
          const defClass = d.enemyDefMult >= 2 ? 'def-vulnerable' : d.enemyDefMult <= 0.5 ? 'def-safe' : '';
          const atkText = `${d.bestAtk.type} ${d.bestAtk.mult}x`;
          const defText = d.enemyDefMult >= 4 ? `被打${d.enemyDefMult}x` : d.enemyDefMult >= 2 ? `被打${d.enemyDefMult}x` : d.enemyDefMult <= 0.5 ? `抗${d.enemyDefMult}x` : '';

          return `
            <div class="pairing-item">
              <div class="pairing-vs">
                <div class="pairing-enemy">
                  <div class="pairing-label">敌方 ${i+1}</div>
                  <div class="pairing-name">${enemy.name}</div>
                  <div class="pairing-stars">${enemyStars}</div>
                  <div class="card-types">${enemyTypeBadges}</div>
                </div>
                <div class="pairing-arrow">→</div>
                <div class="pairing-mine">
                  ${card.img ? `<div class="pairing-img"><img src="${card.img}" alt="${card.name}" loading="lazy"></div>` : ''}
                  <div class="pairing-name">${card.name}</div>
                  <div class="pairing-stars">${stars}</div>
                  <div class="card-types">${typeBadges}</div>
                  ${specialBadges ? `<div class="card-special">${specialBadges}</div>` : ''}
                </div>
              </div>
              <div class="pairing-result">
                <span class="${atkClass}">攻 ${atkText}</span>
                ${defText ? `<span class="${defClass}">${defText}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      ${warnings.length ? `<div class="coverage-warnings">${warnings.map(w => `<div class="coverage-warn">${w}</div>`).join('')}</div>` : ''}

      ${supportPick ? `
        <h3>${T('recommend_support')}</h3>
        <div class="team-cards support">
          <div class="team-card support">
            <div class="support-label">${T('support')}</div>
            <div class="card-name">${supportPick.card.name}</div>
            <div class="card-types"><span class="type-tag sm" style="background:${TYPE_COLORS[supportPick.moveType]}">${supportPick.moveType}</span></div>
            <div class="card-atk-info">支援招式：${supportPick.card.support_move || ''}</div>
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
  return `<div class="enemy-analysis"><span class="analysis-name">vs ${e.name} ★${e.rarity}</span><div class="type-tags">${weakBadges||'<span class="hint">无2x克制</span>'}</div></div>`;
}

// 暴露给 onclick
window.openEnemyPickerPub = openEnemyPicker;
window.removeEnemyPub = removeEnemy;
window.selectEnemyPub = selectEnemy;
window.showCardDetailPub = showCardDetail;
window.closeCardDetailPub = closeCardDetail;

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

  const stars = card.role === 'support' ? '支援券' : '★'.repeat(card.rarity);
  const typeBadges = card.types.map(t => `<span class="type-tag" style="background:${TYPE_COLORS[t]||'#666'}">${getTypeName(t)}</span>`).join('');
  const specialBadges = (card.special||[]).map(s => `<span class="special-badge">${s}</span>`).join('');
  const owned = collection[code];
  const energyText = card.energy ? `<span class="detail-energy">${card.energy}</span>` : '<span class="detail-energy missing">?</span>';
  const imgHtml = card.img
    ? `<img src="${card.img}" alt="${card.name}" onerror="this.style.display='none'">`
    : '<div class="detail-no-img">暂无图片</div>';

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
    : '<span class="hint">无</span>';
  const resistHtml = resistances.length
    ? resistances.map(r => `<span class="type-tag resist" style="background:${TYPE_COLORS[r.type]||'#666'}">${getTypeName(r.type)} ${r.mult}x</span>`).join('')
    : '<span class="hint">无</span>';
  const immuneHtml = immunities.length
    ? immunities.map(i => `<span class="type-tag immune" style="background:${TYPE_COLORS[i.type]||'#666'}">${getTypeName(i.type)} ${T('immune')}</span>`).join('')
    : '';

  // 支援招式
  const supportInfo = card.support_move
    ? `<div class="detail-row"><span class="detail-label">支援招式</span><span class="detail-value">${card.support_move}（${card.support_move_type}）</span></div>`
    : '';

  modal.innerHTML = `
    <div class="detail-content" style="--type-color:${TYPE_COLORS[card.types[0]]||'var(--accent)'}">
      <button class="detail-close" onclick="closeCardDetailPub()">✕</button>
      <div class="detail-img">${imgHtml}</div>
      <div class="detail-body">
        <h2 class="detail-name">${getCardName(card)}</h2>
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
        ${getCardDesc(card) ? `<div class="detail-desc">${getCardDesc(card)}</div>` : ''}
        ${card.base_stats ? `
        <div class="detail-section">
          <h3>${T('basestats')}</h3>
          <div class="stats-grid">
            ${[{'key':'hp','label':'HP'},{'key':'atk','label':'攻击'},{'key':'def','label':'防御'},{'key':'spa','label':'特攻'},{'key':'spd','label':'特防'},{'key':'spe','label':'速度'}].map(s => {
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
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();

// ===== 主题切换器 =====
(function setupThemeSwitcher(){
  const THEME_KEY = "mezastar-theme";
  const themeNames = { light: "明亮", dark: "暗色", comfort: "护眼" };
  const themeColors = { light: "#F7FAFF", dark: "#101927", comfort: "#F3F0DD" };

  const switcher = document.querySelector(".theme-switcher");
  const status = document.querySelector("#themeStatus");
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if(!switcher) return;

  function applyTheme(theme, shouldSave){
    if(!themeNames[theme]) return;
    document.documentElement.dataset.theme = theme;
    switcher.querySelectorAll("[data-theme-value]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themeValue === theme));
    });
    if(themeColorMeta) themeColorMeta.setAttribute("content", themeColors[theme]);
    if(status) status.textContent = "已切换为" + themeNames[theme] + "主题";
    if(shouldSave){
      try { localStorage.setItem(THEME_KEY, theme); } catch(e) {}
    }
  }

  switcher.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-theme-value]");
    if(!btn) return;
    applyTheme(btn.dataset.themeValue, true);
  });

  applyTheme(document.documentElement.dataset.theme || "light", false);
})();

// ===== 语言切换器 =====
const I18N = {
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
    res_text:"抗", immune_text:"免疫",
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
    res_text:"RES", immune_text:"IMM",
  },
};

function T(key){
  const lang = document.documentElement.dataset.lang || 'zh';
  const t = I18N[lang] || I18N.zh;
  return t[key] !== undefined ? t[key] : key;
}

// 属性名翻译
const TYPE_I18N = {
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
const SERIES_I18N = {
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
    const t = I18N[lang];

    // 导航按钮
    document.querySelectorAll('.nav-item').forEach(btn => {
      const tab = btn.dataset.tab;
      const span = btn.querySelector('span:last-child');
      if(tab === 'collection') span.textContent = t.collection;
      else if(tab === 'battle') span.textContent = t.battle;
      else if(tab === 'typechart') span.textContent = t.typechart;
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
      const label = fo.parentElement;
      label.innerHTML = '';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = 'filter-owned';
      cb.checked = fo.checked;
      cb.addEventListener('change', renderCardGrid);
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + t.owned_only));
    }

    // 按钮 aria-pressed
    switcher.querySelectorAll("[data-lang-value]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.langValue === lang));
    });

    if(shouldSave){ try { localStorage.setItem(LANG_KEY, lang); } catch(e) {} }

    // 重新渲染
    if(typeof renderCardGrid === 'function') renderCardGrid();
    if(typeof recommendTeam === 'function') recommendTeam();
    if(typeof renderTypeGrid === 'function') renderTypeGrid('type-grid', showTypeEffect);
  }

  switcher.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-lang-value]");
    if(!btn) return;
    applyLang(btn.dataset.langValue, true);
  });

  applyLang(document.documentElement.dataset.lang || "zh", false);
})();
