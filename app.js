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
  renderCardGrid();
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
  result.innerHTML = `
    <div class="effect-group strong">
      <span class="effect-label">效果绝佳 (2x)</span>
      <div class="type-tags">${strong.map(t=>`<span class="type-tag" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('')}</div>
    </div>
    ${weak.length ? `<div class="effect-group weak">
      <span class="effect-label">效果不佳 (0.5x)</span>
      <div class="type-tags">${weak.map(t=>`<span class="type-tag" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('')}</div>
    </div>`:''}
    ${immune.length ? `<div class="effect-group immune">
      <span class="effect-label">无效 (0x)</span>
      <div class="type-tags">${immune.map(t=>`<span class="type-tag" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('')}</div>
    </div>`:''}
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

  const filtered = allCards.filter(c => {
    if(sf !== 'all' && c.series !== sf) return false;
    if(rf !== 'all' && c.rarity !== parseInt(rf)) return false;
    if(tf !== 'all' && !c.types.includes(tf)) return false;
    if(of && !collection[c.code]) return false;
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
    {rarity: 6, label: '★★★★★★ 超级明星'},
    {rarity: 5, label: '★★★★★ 明星'},
    {rarity: 4, label: '★★★★'},
    {rarity: 3, label: '★★★'},
    {rarity: 2, label: '★★'},
    {rarity: 'support', label: '支援券'},
  ];

  const renderCard = (c) => {
    const owned = collection[c.code];
    const stars = c.role === 'support' ? '支援' : '★'.repeat(c.rarity);
    const typeBadges = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
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
          <div class="card-name">${c.name}</div>
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
  for(const group of RARITY_GROUPS){
    const groupCards = filtered.filter(c =>
      group.rarity === 'support' ? c.role === 'support' : (c.role !== 'support' && c.rarity === group.rarity)
    );
    if(groupCards.length === 0) continue;
    html += `<div class="rarity-divider"><span class="rarity-divider-label">${group.label}</span></div>`;
    html += groupCards.map(renderCard).join('');
  }
  grid.innerHTML = html;
}
window.toggleCardPub = toggleCard;

function updateStats(){
  const total = allCards.length;
  const owned = Object.keys(collection).filter(k=>collection[k]).length;
  const el = document.getElementById('collection-stats');
  if(el) el.innerHTML = `<span>已收藏: <strong>${owned}</strong> / ${total}</span>`;
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
      const typeBadges = enemy.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
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
    const typeBadges = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
    const orient = c.img ? getImgClass(c.img) : 'no-img';
    return `
      <div class="picker-card" onclick="selectEnemyPub('${c.code}')">
        <div class="card-img ${orient}">
          ${c.img ? `<img src="${c.img}" alt="${c.name}" loading="lazy">` : ''}
          <span class="rarity-badge">${stars}</span>
        </div>
        <div class="picker-card-info">
          <div class="card-name">${c.name}</div>
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
    result.innerHTML = '<p class="hint">选择敌方宝可梦后，这里会显示推荐阵容</p>';
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
    if(card.special?.length > 0) score += 0.5;
    score += card.rarity * 0.15;

    return {bestAtk, enemyDefMult, enemyBestType, score};
  }

  // 预计算所有卡对所有敌方的得分矩阵
  const matrix = myCards.map(card => {
    const vs = {};
    for(const e of enemies) vs[e.code] = scoreVS(e, card);
    return {card, vs};
  });

  // 贪心配对：逐个敌方选最优可用卡
  const usedCards = new Set();
  const pairing = [];
  const warnings = [];

  for(const enemy of enemies){
    let bestPick = null;
    let bestScore = -999;
    for(const m of matrix){
      if(usedCards.has(m.card.code)) continue;
      const s = m.vs[enemy.code];
      if(s.score > bestScore){
        bestScore = s.score;
        bestPick = m;
      }
    }
    if(bestPick){
      usedCards.add(bestPick.card.code);
      const d = bestPick.vs[enemy.code];
      pairing.push({enemy, match: bestPick, detail: d});

      // 覆盖率提示
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
        warnings.push(`⚠️ ${bestPick.card.name} 被 ${enemy.name} 4倍克制！`);
      }
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
      <h3>推荐阵容（每只各打一场）</h3>
      <div class="pairing-list">
        ${pairing.map((p, i) => {
          const enemy = p.enemy;
          const card = p.match.card;
          const d = p.detail;
          const stars = '★'.repeat(card.rarity);
          const enemyStars = '★'.repeat(enemy.rarity);
          const typeBadges = card.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
          const enemyTypeBadges = enemy.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
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
        <h3>推荐支援券</h3>
        <div class="team-cards support">
          <div class="team-card support">
            <div class="support-label">支援券</div>
            <div class="card-name">${supportPick.card.name}</div>
            <div class="card-types"><span class="type-tag sm" style="background:${TYPE_COLORS[supportPick.moveType]}">${supportPick.moveType}</span></div>
            <div class="card-atk-info">支援招式：${supportPick.card.support_move || ''}</div>
          </div>
        </div>
      ` : `
        <h3>支援券</h3>
        <p class="hint">收藏页可勾选支援券（谜拟丘/拉普拉斯/葱游兵/铝钢龙），这里会自动推荐。</p>
      `}

      ${specialConflicts.length ? `<div class="special-notice">⚠️ ${specialConflicts.join('；')}（每场各限用一次）</div>` : ''}
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
  const weakBadges = weak.map(w => `<span class="type-tag" style="background:${TYPE_COLORS[w.type]}">${w.type} ${w.mult}x</span>`).join('');
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
  const typeBadges = card.types.map(t => `<span class="type-tag" style="background:${TYPE_COLORS[t]||'#666'}">${t}</span>`).join('');
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
    ? weaknesses.map(w => `<span class="type-tag weak" style="background:${TYPE_COLORS[w.type]||'#666'}">${w.type} ${w.mult}x</span>`).join('')
    : '<span class="hint">无</span>';
  const resistHtml = resistances.length
    ? resistances.map(r => `<span class="type-tag resist" style="background:${TYPE_COLORS[r.type]||'#666'}">${r.type} ${r.mult}x</span>`).join('')
    : '<span class="hint">无</span>';
  const immuneHtml = immunities.length
    ? immunities.map(i => `<span class="type-tag immune" style="background:${TYPE_COLORS[i.type]||'#666'}">${i.type} 免疫</span>`).join('')
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
        <h2 class="detail-name">${card.name}</h2>
        <div class="detail-meta">
          <span class="detail-stars">${stars}</span>
          <span class="detail-code">${card.code}</span>
        </div>
        <div class="detail-types">${typeBadges}</div>
        ${specialBadges ? `<div class="detail-special">${specialBadges}</div>` : ''}
        <div class="detail-stats">
          <div class="stat-box">
            <span class="stat-label">宝可能量</span>
            ${energyText}
          </div>
        </div>
        ${supportInfo}
        ${card.desc ? `<div class="detail-desc">${card.desc}</div>` : ''}
        <div class="detail-section">
          <h3>被克弱点</h3>
          <div class="type-tags">${weakHtml}</div>
        </div>
        <div class="detail-section">
          <h3>抗性减伤</h3>
          <div class="type-tags">${resistHtml}</div>
        </div>
        ${immuneHtml ? `<div class="detail-section"><h3>免疫</h3><div class="type-tags">${immuneHtml}</div></div>` : ''}
        <button class="detail-own-btn ${owned?'checked':''}" onclick="event.stopPropagation();toggleCardPub('${code}');showCardDetailPub('${code}')">
          ${owned ? '✓ 已收藏' : '+ 收藏'}
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
