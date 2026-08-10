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
const imgOrientCache = {};
function getImgOrientation(imgPath){
  if(!imgPath) return '';
  if(imgOrientCache[imgPath] !== undefined) return imgOrientCache[imgPath];
  // ★6 超长竖版长图（1000x1874 ~ 1000x3000+）固定 portrait
  if(imgPath.includes('HP_')){
    imgOrientCache[imgPath] = 'portrait';
  } else {
    // 默认按 landscape 渲染，由 adjustImgOrientation() 测量后纠正
    imgOrientCache[imgPath] = 'landscape';
  }
  return imgOrientCache[imgPath];
}

// 渲染后测量真实尺寸：w/h<0.95 判为 portrait（覆盖 800x1000 / 400x500 等普通竖版）
function adjustImgOrientation(imgEl){
  if(!imgEl || !imgEl.naturalWidth) return;
  const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
  const container = imgEl.parentElement;
  if(!container) return;
  const src = imgEl.getAttribute('src');
  const newOrient = ratio < 0.95 ? 'portrait' : (ratio > 1.05 ? 'landscape' : 'landscape');
  const cached = imgOrientCache[src];
  if(cached !== newOrient){
    imgOrientCache[src] = newOrient;
    container.classList.remove('portrait','landscape','no-img');
    container.classList.add(newOrient);
  }
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
    const orient = imgFile ? getImgOrientation(imgFile) : '';
    const imgHtml = imgFile
      ? `<img src="${imgFile}" alt="${c.name}" loading="lazy" onload="adjustImgOrientation(this)" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">`
      : '';
    const supportClass = c.role === 'support' ? 'support-card' : '';
    return `
      <div class="card ${owned?'owned':''} ${supportClass}" data-code="${c.code}">
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
    const orient = c.img ? getImgOrientation(c.img) : '';
    return `
      <div class="picker-card" onclick="selectEnemyPub('${c.code}')">
        <div class="card-img ${orient}">
          ${c.img ? `<img src="${c.img}" alt="${c.name}" loading="lazy" onload="adjustImgOrientation(this)">` : ''}
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

// 推荐阵容：3主力 + 1支援
function recommendTeam(){
  const result = document.getElementById('recommend-result');
  const enemies = enemySlots.filter(e => e !== null);

  if(enemies.length === 0){
    result.innerHTML = '<p class="hint">选择敌方宝可梦后，这里会显示推荐阵容</p>';
    return;
  }

  // 获取用户收藏的卡（区分主力卡和支援券）
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

  // 计算每张主力卡对所有敌方的综合得分
  const scored = myCards.map(c => {
    let atkScore = 0;
    let defPenalty = 0;
    let bestTarget = null;
    let bestAtkMult = 0;
    let worstDefMult = 0;
    const perEnemy = [];

    for(const enemy of enemies){
      // === 攻击：我打敌方几个属性 ===
      const atkMults = c.types.map(t => {
        let m = 1;
        for(const et of enemy.types) m *= TYPE_CHART[t][et] || 1;
        return {type: t, mult: m};
      });
      const bestAtk = atkMults.reduce((a,b) => a.mult > b.mult ? a : b);
      if(bestAtk.mult > bestAtkMult){
        bestAtkMult = bestAtk.mult;
        bestTarget = enemy;
      }

      // === 防御：敌方打我几个属性 ===
      let enemyDefMult = 0;
      let enemyBestType = '';
      for(const et of enemy.types){
        let m = 1;
        for(const ct of c.types) m *= TYPE_CHART[et][ct] || 1;
        if(m > enemyDefMult){
          enemyDefMult = m;
          enemyBestType = et;
        }
      }
      worstDefMult = Math.max(worstDefMult, enemyDefMult);

      perEnemy.push({
        enemy: enemy.name,
        bestAtk,               // {type, mult} 我打敌方最好的倍率
        enemyDefMult,          // 敌方打我最坏的倍率
        enemyBestType
      });

      atkScore += bestAtk.mult;
      // 防御惩罚：被4x克制要重罚
      if(enemyDefMult >= 4) defPenalty += 4;
      else if(enemyDefMult >= 2) defPenalty += 2;
      else if(enemyDefMult <= 0.5) defPenalty -= 0.5;
      else if(enemyDefMult === 0) defPenalty -= 1; // 免疫=大优势
    }

    let score = atkScore * 2 - defPenalty;

    // 特殊机制加成
    const specials = c.special || [];
    if(specials.length > 0) score += 1.5;

    // 稀有度
    score += c.rarity * 0.3;

    return {card: c, score, perEnemy, worstDefMult, bestTarget, bestAtkMult};
  });

  scored.sort((a,b) => b.score - a.score);

  // === 选 3 张主力，去重特殊机制 ===
  const team = [];
  const usedSpecials = new Set();
  const usedTypes = new Set();

  // 第一轮：优先选克制最佳+特殊机制不冲突的
  for(const s of scored){
    if(team.length >= 3) break;
    const specials = s.card.special || [];
    const hasConflict = specials.some(sp => usedSpecials.has(sp));
    if(hasConflict) continue;
    specials.forEach(sp => usedSpecials.add(sp));
    s.card.types.forEach(t => usedTypes.add(t));
    team.push(s);
  }

  // 第二轮：如果没满3张，放宽特殊机制限制（标注冲突）
  if(team.length < 3){
    for(const s of scored){
      if(team.length >= 3) break;
      if(team.includes(s)) continue;
      s.card.types.forEach(t => usedTypes.add(t));
      team.push(s);
    }
  }

  // === 支援券推荐：只从收藏的支援券里选 ===
  let supportPick = null;
  if(mySupports.length > 0){
    // 选一张支援券：其支援招式属性对所有敌方综合克制最高的
    const supportScored = mySupports.map(s => {
      let supAtk = 0;
      const moveType = s.support_move_type || s.types[0];
      for(const enemy of enemies){
        let m = 1;
        for(const et of enemy.types) m *= TYPE_CHART[moveType][et] || 1;
        supAtk += m;
      }
      return {card: s, supAtk, moveType};
    });
    supportScored.sort((a,b) => b.supAtk - a.supAtk);
    supportPick = supportScored[0];
  }

  // === 渲染 ===
  result.innerHTML = `
    <div class="recommend-team">
      <h3>推荐主力（3只上场）</h3>
      <div class="team-cards">
        ${team.map((t, i) => {
          const c = t.card;
          const stars = '★'.repeat(c.rarity);
          const typeBadges = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
          const specialBadges = (c.special||[]).map(s => `<span class="special-badge">${s}</span>`).join('');
          const orient = c.img ? getImgOrientation(c.img) : '';

          // 每只敌方的攻防信息
          const atkInfo = t.perEnemy.map(a => {
            const atkClass = a.bestAtk.mult >= 2 ? 'atk-strong' : a.bestAtk.mult <= 0.5 ? 'atk-weak' : '';
            const defClass = a.enemyDefMult >= 2 ? 'def-vulnerable' : a.enemyDefMult <= 0.5 ? 'def-safe' : '';
            const atkText = `攻 ${a.bestAtk.type}${a.bestAtk.mult}x`;
            const defText = a.enemyDefMult >= 4 ? `⚠️被打${a.enemyDefMult}x` : a.enemyDefMult >= 2 ? `被打${a.enemyDefMult}x` : '';
            return `<div class="vs-line">vs ${a.enemy}: <span class="${atkClass}">${atkText}</span>${defText ? ` <span class="${defClass}">${defText}</span>` : ''}</div>`;
          }).join('');

          // 防御弱点警告
          const defWarn = t.worstDefMult >= 4 ? '<div class="def-warning">⚠️ 被敌方4倍克制，慎用！</div>' : '';

          return `
            <div class="team-card">
              <div class="team-rank">#${i+1}</div>
              <div class="card-img ${orient}">
                ${c.img ? `<img src="${c.img}" alt="${c.name}" onload="adjustImgOrientation(this)">` : ''}
                <span class="rarity-badge">${stars}</span>
              </div>
              <div class="card-name">${c.name}</div>
              <div class="card-types">${typeBadges}</div>
              ${specialBadges ? `<div class="card-special">${specialBadges}</div>` : ''}
              ${defWarn}
              <div class="card-atk-info">${atkInfo}</div>
            </div>
          `;
        }).join('')}
      </div>

      ${supportPick ? `
        <h3>推荐支援券</h3>
        <div class="team-cards support">
          <div class="team-card support">
            <div class="support-label">支援券</div>
            <div class="card-name">${supportPick.card.name}</div>
            <div class="card-types">
              <span class="type-tag sm" style="background:${TYPE_COLORS[supportPick.moveType]}">${supportPick.moveType}</span>
            </div>
            <div class="card-atk-info">支援招式：${supportPick.card.support_move || ''}</div>
          </div>
        </div>
      ` : `
        <h3>支援券</h3>
        <p class="hint">收藏页可勾选支援券（谜拟丘/拉普拉斯/葱游兵/铝钢龙），这里会自动推荐。</p>
      `}

      <div class="special-notice">
        ${[...usedSpecials].length ? `本局已分配: ${[...usedSpecials].join('、')}（每场各限用一次）` : ''}
      </div>
    </div>
  `;
}

// 分析敌方弱点（无收藏时展示）
function analyzeEnemy(e){
  const weak = [];
  for(const t of TYPES){
    let m = 1;
    for(const et of e.types) m *= TYPE_CHART[t][et] || 1;
    if(m >= 2) weak.push({type:t, mult:m});
  }
  const weakBadges = weak.map(w => `<span class="type-tag" style="background:${TYPE_COLORS[w.type]}">${w.type} ${w.mult}x</span>`).join('');
  return `<div class="enemy-analysis"><span class="analysis-name">vs ${e.name} ★${e.rarity}</span><div class="type-tags">${weakBadges||'<span class="hint">无2x克制</span>'}</div></div>`;
}

// 暴露给 onclick
window.openEnemyPickerPub = openEnemyPicker;
window.removeEnemyPub = removeEnemy;
window.selectEnemyPub = selectEnemy;

// ===== Tab 切换 =====
function switchTab(tab){
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
}

// ===== 初始化 =====
function init(){
  loadCollection();
  loadCards();
  renderTypeGrid('type-grid', showTypeEffect);
  renderEnemySlots();

  document.querySelectorAll('.tab-btn').forEach(btn => {
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
