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
const imgOrientCache = {};
function getImgOrientation(imgPath){
  if(imgOrientCache[imgPath] !== undefined) return imgOrientCache[imgPath];
  // HP_XX.png 是★6竖版长图（宽高比 < 0.8）
  // hash.png 是横版图（宽高比 ~1.25）
  if(imgPath && imgPath.includes('HP_')){
    imgOrientCache[imgPath] = 'portrait';
  } else {
    imgOrientCache[imgPath] = 'landscape';
  }
  return imgOrientCache[imgPath];
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
  filtered.sort((a,b) => b.rarity - a.rarity);

  grid.innerHTML = filtered.map(c => {
    const owned = collection[c.code];
    const stars = '★'.repeat(c.rarity);
    const typeBadges = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
    const specialBadges = (c.special||[]).map(s => `<span class="special-badge">${s}</span>`).join('');
    const imgFile = c.img || '';
    const orient = imgFile ? getImgOrientation(imgFile) : '';
    const imgHtml = imgFile
      ? `<img src="${imgFile}" alt="${c.name}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">`
      : '';
    return `
      <div class="card ${owned?'owned':''}" data-code="${c.code}">
        <div class="card-img ${orient} ${imgFile?'':'no-img'}">
          ${imgHtml}
          <span class="rarity-badge">${stars}</span>
        </div>
        <div class="card-info">
          <div class="card-name">${c.name}</div>
          <div class="card-types">${typeBadges}</div>
          ${specialBadges ? `<div class="card-special">${specialBadges}</div>` : ''}
          <div class="card-code">${c.code}</div>
        </div>
        <button class="own-btn ${owned?'checked':''}" onclick="event.stopPropagation();toggleCardPub('${c.code}')">${owned?'✓':'+'}</button>
      </div>
    `;
  }).join('');
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

// 推荐阵容
function recommendTeam(){
  const result = document.getElementById('recommend-result');
  const enemies = enemySlots.filter(e => e !== null);

  if(enemies.length === 0){
    result.innerHTML = '<p class="hint">选择敌方宝可梦后，这里会显示推荐阵容</p>';
    return;
  }

  // 获取用户收藏的卡
  const myCards = allCards.filter(c => collection[c.code]);
  if(myCards.length === 0){
    result.innerHTML = `
      <div class="recommend-empty">
        <p>你还没有收藏任何卡牌！</p>
        <p>去「收藏」页勾选你拥有的明耀之星盘，这里会根据你的收藏推荐最佳阵容。</p>
        <div class="enemy-summary">
          <h3>敌方阵容分析</h3>
          ${enemies.map(e => {
            const weak = [];
            for(const t of TYPES){
              let mult = 1;
              for(const et of e.types) mult *= TYPE_CHART[t][et];
              if(mult >= 2) weak.push({type:t, mult});
            }
            const weakBadges = weak.map(w => `<span class="type-tag" style="background:${TYPE_COLORS[w.type]}">${w.type} ${w.mult}x</span>`).join('');
            return `<div class="enemy-analysis"><span class="analysis-name">vs ${e.name} ★${e.rarity}</span><div class="type-tags">${weakBadges||'<span class="hint">无2x克制</span>'}</div></div>`;
          }).join('')}
        </div>
      </div>
    `;
    return;
  }

  // 计算每张卡对所有敌方的综合得分
  const scored = myCards.map(c => {
    let score = 0;
    const analysis = [];

    for(const enemy of enemies){
      // 攻击：我的属性打敌方
      const atkMults = c.types.map(t => {
        let m = 1;
        for(const et of enemy.types) m *= TYPE_CHART[t][et];
        return {type: t, mult: m};
      });
      const bestAtk = atkMults.reduce((a,b) => a.mult > b.mult ? a : b);

      // 防御：敌方打我
      let defMult = 0;
      for(const et of enemy.types){
        let m = 1;
        for(const ct of c.types) m *= TYPE_CHART[et][ct];
        defMult = Math.max(defMult, m);
      }

      score += bestAtk.mult * 2;
      score -= defMult > 1 ? (defMult * 1.5) : 0;
      score += defMult < 1 ? 0.5 : 0;

      analysis.push({enemy: enemy.name, bestAtk, defMult});
    }

    // 特殊机制加成
    const specials = c.special || [];
    if(specials.length > 0) score += 1;

    // 稀有度
    score += c.rarity * 0.3;

    return {card: c, score, analysis};
  });

  scored.sort((a,b) => b.score - a.score);

  // TOP 3 主力 + 去重特殊机制
  const team = [];
  const usedSpecials = new Set();
  for(const s of scored){
    if(team.length >= 3) break;
    const specials = s.card.special || [];
    const hasConflict = specials.some(sp => usedSpecials.has(sp));
    if(hasConflict && team.length > 0) continue;
    specials.forEach(sp => usedSpecials.add(sp));
    team.push(s);
  }

  // 支援卡推荐（低星但属性互补）
  const teamTypes = new Set();
  team.forEach(t => t.card.types.forEach(ty => teamTypes.add(ty)));
  const supportCards = scored
    .filter(s => !team.includes(s))
    .filter(s => s.card.types.some(t => !teamTypes.has(t)))
    .slice(0, 2);

  result.innerHTML = `
    <div class="recommend-team">
      <h3>推荐主力</h3>
      <div class="team-cards">
        ${team.map((t, i) => {
          const c = t.card;
          const stars = '★'.repeat(c.rarity);
          const typeBadges = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
          const specialBadges = (c.special||[]).map(s => `<span class="special-badge">${s}</span>`).join('');
          const orient = c.img ? getImgOrientation(c.img) : '';
          const atkInfo = t.analysis.map(a => `vs ${a.enemy}: <span class="${a.bestAtk.mult>=2?'atk-strong':a.bestAtk.mult<=0.5?'atk-weak':''}">${a.bestAtk.type} ${a.bestAtk.mult}x</span>`).join(' / ');
          return `
            <div class="team-card">
              <div class="team-rank">#${i+1}</div>
              <div class="card-img ${orient}">
                ${c.img ? `<img src="${c.img}" alt="${c.name}">` : ''}
                <span class="rarity-badge">${stars}</span>
              </div>
              <div class="card-name">${c.name}</div>
              <div class="card-types">${typeBadges}</div>
              ${specialBadges ? `<div class="card-special">${specialBadges}</div>` : ''}
              <div class="card-atk-info">${atkInfo}</div>
            </div>
          `;
        }).join('')}
      </div>

      ${supportCards.length ? `
        <h3>推荐支援</h3>
        <div class="team-cards support">
          ${supportCards.map(t => {
            const c = t.card;
            const stars = '★'.repeat(c.rarity);
            const typeBadges = c.types.map(t => `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`).join('');
            const orient = c.img ? getImgOrientation(c.img) : '';
            return `
              <div class="team-card support">
                <div class="card-img ${orient}">
                  ${c.img ? `<img src="${c.img}" alt="${c.name}">` : ''}
                  <span class="rarity-badge">${stars}</span>
                </div>
                <div class="card-name">${c.name}</div>
                <div class="card-types">${typeBadges}</div>
              </div>
            `;
          }).join('')}
        </div>
      ` : ''}

      <div class="special-notice">
        ${[...usedSpecials].length ? `⚠️ 已分配特殊机制: ${[...usedSpecials].join(', ')}（每场各限用一次）` : ''}
      </div>
    </div>
  `;
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
