// 明耀之星 Companion - 主应用逻辑
(function(){
'use strict';

// ===== 状态 =====
let allCards = [];
let collection = {};  // {card_code: true}
let currentTab = 'type-chart';

// ===== localStorage =====
const STORAGE_KEY = 'mezastar_collection';

function loadCollection(){
  try {
    collection = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch(e){ collection = {}; }
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
  } catch(e){
    console.error('Failed to load cards.json:', e);
    document.getElementById('card-grid').innerHTML = '<p class="error">数据加载失败</p>';
  }
}

function populateFilters(seriesList){
  const seriesSel = document.getElementById('filter-series');
  for(const s of seriesList){
    const opt = document.createElement('option');
    opt.value = s.id; opt.textContent = s.name;
    seriesSel.appendChild(opt);
  }
  const typeSel = document.getElementById('filter-type');
  for(const t of TYPES){
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    typeSel.appendChild(opt);
  }
}

// ===== 属性克制表 =====
function renderTypeGrid(containerId, onClick){
  const grid = document.getElementById(containerId);
  grid.innerHTML = '';
  for(const type of TYPES){
    const btn = document.createElement('button');
    btn.className = 'type-btn';
    btn.style.backgroundColor = TYPE_COLORS[type];
    btn.textContent = type;
    btn.dataset.type = type;
    btn.addEventListener('click', ()=> onClick(type));
    grid.appendChild(btn);
  }
}

function showTypeEffect(atkType){
  const result = document.getElementById('type-result');
  const strong = [], normal = [], weak = [], immune = [];
  for(const [defType, mult] of Object.entries(TYPE_CHART[atkType])){
    if(mult >= 2) strong.push(defType);
    else if(mult === 1) normal.push(defType);
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
  const seriesFilter = document.getElementById('filter-series').value;
  const rarityFilter = document.getElementById('filter-rarity').value;
  const typeFilter = document.getElementById('filter-type').value;
  const ownedOnly = document.getElementById('filter-owned').checked;

  const filtered = allCards.filter(c => {
    if(seriesFilter !== 'all' && c.series !== seriesFilter) return false;
    if(rarityFilter !== 'all' && c.rarity !== parseInt(rarityFilter)) return false;
    if(typeFilter !== 'all' && !c.types.includes(typeFilter)) return false;
    if(ownedOnly && !collection[c.code]) return false;
    return true;
  });

  // 按稀有度降序排列
  filtered.sort((a,b) => b.rarity - a.rarity);

  grid.innerHTML = filtered.map(c => {
    const owned = collection[c.code];
    const stars = '★'.repeat(c.rarity);
    const typeBadges = c.types.map(t =>
      `<span class="type-tag sm" style="background:${TYPE_COLORS[t]}">${t}</span>`
    ).join('');
    const imgFile = c.img || '';
    const imgHtml = imgFile
      ? `<img src="${imgFile}" alt="${c.name}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('no-img')">`
      : '';
    return `
      <div class="card ${owned?'owned':''}" data-code="${c.code}">
        <div class="card-img ${imgFile?'':'no-img'}">
          ${imgHtml}
          <span class="rarity-badge">${stars}</span>
        </div>
        <div class="card-info">
          <div class="card-name">${c.name}</div>
          <div class="card-types">${typeBadges}</div>
          <div class="card-code">${c.code}</div>
        </div>
        <button class="own-btn ${owned?'checked':''}" onclick="event.stopPropagation();toggleCardPub('${c.code}')">
          ${owned?'✓':'+'}
        </button>
      </div>
    `;
  }).join('');
}

// 全局暴露给 onclick
window.toggleCardPub = toggleCard;

function updateStats(){
  const total = allCards.length;
  const owned = Object.keys(collection).filter(k=>collection[k]).length;
  const el = document.getElementById('collection-stats');
  if(!el) return;
  el.innerHTML = `<span>已收藏: <strong>${owned}</strong> / ${total}</span>`;
}

// ===== Tab 切换 =====
function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
}

// ===== 初始化 =====
function init(){
  loadCollection();
  loadCards();
  renderTypeGrid('type-grid', showTypeEffect);
  renderTypeGrid('enemy-type-picker', function(type){
    // P1: 推荐逻辑
    console.log('Enemy type:', type);
  });
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', ()=> switchTab(btn.dataset.tab));
  });
  document.querySelectorAll('#filter-series,#filter-rarity,#filter-type,#filter-owned').forEach(el => {
    el.addEventListener('change', renderCardGrid);
  });
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
})();
