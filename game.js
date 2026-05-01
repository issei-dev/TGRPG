// File: game.js

// =========================
// 定数（仕様）
// =========================
const HERO_MAX_LV = 9999;
const HERO_BASE_ATK = 10;
const HERO_ATK_PER_LV = 5;
const HERO_EXP_BASE = 2;
const HERO_EXP_MULT = 2;

const EQUIP_MAX_LV = 99;
const EQUIP_GROWTH = 0.15;        // 1Lvごと+15%（切り捨て）
const EQUIP_EXP_BASE = 10;
const EQUIP_EXP_MULT = 2;

const MAX_WEAPON_EQUIP = 2;
const MAX_PET_EQUIP = 3;

// ペット倍率の内部表現スケール（1万分率）
// 例: 1.10倍 → bonus=1000、1.25倍 → bonus=2500
const PET_BONUS_SCALE = 10000;

const SAVE_KEY = "time_grows_rpg_save_v2"; // 仕様変更のためキー更新

// =========================
// セーブデータ初期化
// =========================
function defaultState() {
  return {
    startTimeMs: Date.now(),
    lastTickMinute: 0,
    points: 0,
    hero: { lv: 1, exp: 0 },
    ownedWeapons: [],
    ownedPets: [],
    equippedWeaponIds: [],
    equippedPetIds: [],
  };
}

let state = loadState();
let WEAPONS_MASTER = [];
let PETS_MASTER = [];

// =========================
// セーブ・ロード
// =========================
function saveState() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}
function loadState() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return defaultState();
  try {
    return JSON.parse(raw);
  } catch {
    return defaultState();
  }
}

// =========================
// マスタデータ読み込み
// =========================
async function loadMasters() {
  const [w, p] = await Promise.all([
    fetch("data/weapons.json").then(r => r.json()),
    fetch("data/pets.json").then(r => r.json()),
  ]);
  WEAPONS_MASTER = w;
  PETS_MASTER = p;
}

function getWeaponMaster(id) {
  return WEAPONS_MASTER.find(x => x.id === id);
}
function getPetMaster(id) {
  return PETS_MASTER.find(x => x.id === id);
}

// =========================
// 計算系
// =========================

// 主人公の攻撃力
function heroAtk() {
  return HERO_BASE_ATK + (state.hero.lv - 1) * HERO_ATK_PER_LV;
}

// 主人公の必要EXP
function heroNeedExp(lv) {
  return HERO_EXP_BASE * Math.pow(HERO_EXP_MULT, lv - 1);
}

// 武器の攻撃力（Lv1で baseAtk、Lv毎+15%切り捨て）
function weaponAtk(baseAtk, lv) {
  let atk = baseAtk;
  for (let i = 1; i < lv; i++) {
    atk = Math.floor(atk * (1 + EQUIP_GROWTH));
  }
  return atk;
}

// ペットのbonus値（1万分率の整数）
// 基礎: floor((baseMultiplier - 1) * PET_BONUS_SCALE)
// Lv毎: floor(bonus * 1.15)
function petBonus(baseMultiplier, lv) {
  let bonus = Math.floor((baseMultiplier - 1) * PET_BONUS_SCALE);
  for (let i = 1; i < lv; i++) {
    bonus = Math.floor(bonus * (1 + EQUIP_GROWTH));
  }
  return bonus;
}

// ペットの倍率（表示用、小数）
function petMultiplier(baseMultiplier, lv) {
  return 1 + petBonus(baseMultiplier, lv) / PET_BONUS_SCALE;
}

// 装備の必要EXP
function equipNeedExp(lv) {
  return EQUIP_EXP_BASE * Math.pow(EQUIP_EXP_MULT, lv - 1);
}

// 主人公＋武器合計
function baseAtkSum() {
  let atk = heroAtk();
  for (const id of state.equippedWeaponIds) {
    const owned = state.ownedWeapons.find(x => x.id === id);
    const m = getWeaponMaster(id);
    if (owned && m) atk += weaponAtk(m.baseAtk, owned.lv);
  }
  return atk;
}

// 装備中ペットの合計bonus（1万分率合計）
function equippedPetBonusSum() {
  let sum = 0;
  for (const id of state.equippedPetIds) {
    const owned = state.ownedPets.find(x => x.id === id);
    const m = getPetMaster(id);
    if (owned && m) sum += petBonus(m.baseMultiplier, owned.lv);
  }
  return sum;
}

// 装備中ペットの合計倍率（表示用）
function equippedPetTotalMultiplier() {
  return 1 + equippedPetBonusSum() / PET_BONUS_SCALE;
}

// 総攻撃力 = (主人公+武器) × (1 + Σ(ペット倍率-1))
function totalAtk() {
  const base = baseAtkSum();
  const mult = equippedPetTotalMultiplier();
  return Math.floor(base * mult);
}

// =========================
// 時間経過ポイント獲得
// =========================
function tickPoints() {
  const elapsedMin = Math.floor((Date.now() - state.startTimeMs) / 60000);
  const diff = elapsedMin - state.lastTickMinute;
  if (diff > 0) {
    state.points += totalAtk() * diff;
    state.lastTickMinute = elapsedMin;
    saveState();
  }
}

// =========================
// アクション
// =========================
function levelUpHero() {
  if (state.hero.lv >= HERO_MAX_LV) {
    alert("主人公はカンスト済みです");
    return;
  }
  const need = heroNeedExp(state.hero.lv) - state.hero.exp;
  if (state.points < need) {
    alert(`ポイントが足りません。あと${need - state.points}ポイント必要です。`);
    return;
  }
  state.points -= need;
  state.hero.exp = 0;
  state.hero.lv += 1;
  saveState();
  render();
}

function buyWeapon(id) {
  const m = getWeaponMaster(id);
  if (!m) return;
  if (state.ownedWeapons.find(x => x.id === id)) {
    alert("既に所持しています");
    return;
  }
  if (state.points < m.price) {
    alert("ポイントが足りません");
    return;
  }
  state.points -= m.price;
  state.ownedWeapons.push({ id, lv: 1, exp: 0 });
  saveState();
  render();
}

function buyPet(id) {
  const m = getPetMaster(id);
  if (!m) return;
  if (state.ownedPets.find(x => x.id === id)) {
    alert("既に所持しています");
    return;
  }
  if (state.points < m.price) {
    alert("ポイントが足りません");
    return;
  }
  state.points -= m.price;
  state.ownedPets.push({ id, lv: 1, exp: 0 });
  saveState();
  render();
}

function levelUpEquip(kind, id) {
  const owned = (kind === "weapon" ? state.ownedWeapons : state.ownedPets)
    .find(x => x.id === id);
  if (!owned) return;
  if (owned.lv >= EQUIP_MAX_LV) {
    alert("カンスト済みです");
    return;
  }
  const need = equipNeedExp(owned.lv) - owned.exp;
  if (state.points < need) {
    alert(`ポイントが足りません。あと${need - state.points}ポイント必要です。`);
    return;
  }
  state.points -= need;
  owned.exp = 0;
  owned.lv += 1;
  saveState();
  render();
}

function toggleEquipWeapon(id) {
  const idx = state.equippedWeaponIds.indexOf(id);
  if (idx >= 0) {
    state.equippedWeaponIds.splice(idx, 1);
  } else {
    if (state.equippedWeaponIds.length >= MAX_WEAPON_EQUIP) {
      alert(`武器は${MAX_WEAPON_EQUIP}つまでです`);
      return;
    }
    state.equippedWeaponIds.push(id);
  }
  saveState();
  render();
}
function toggleEquipPet(id) {
  const idx = state.equippedPetIds.indexOf(id);
  if (idx >= 0) {
    state.equippedPetIds.splice(idx, 1);
  } else {
    if (state.equippedPetIds.length >= MAX_PET_EQUIP) {
      alert(`ペットは${MAX_PET_EQUIP}つまでです`);
      return;
    }
    state.equippedPetIds.push(id);
  }
  saveState();
  render();
}

// =========================
// 描画
// =========================
function fmtMul(m) {
  return m.toFixed(4) + "倍";
}

function render() {
  const elapsedMin = Math.floor((Date.now() - state.startTimeMs) / 60000);
  document.getElementById("elapsed").textContent = elapsedMin;
  document.getElementById("points").textContent = Math.floor(state.points);
  document.getElementById("totalAtk").textContent = totalAtk();
  document.getElementById("rate").textContent = totalAtk();

  document.getElementById("heroLv").textContent = state.hero.lv;
  document.getElementById("heroAtk").textContent = heroAtk();
  document.getElementById("heroExp").textContent = state.hero.exp;
  document.getElementById("heroNeed").textContent =
    state.hero.lv >= HERO_MAX_LV ? "MAX" : heroNeedExp(state.hero.lv);

  renderEquipped("equippedWeapons", state.equippedWeaponIds, "weapon");
  renderEquipped("equippedPets", state.equippedPetIds, "pet");

  renderOwned("ownedWeapons", state.ownedWeapons, "weapon");
  renderOwned("ownedPets", state.ownedPets, "pet");

  renderShop("shopWeapons", WEAPONS_MASTER, "weapon");
  renderShop("shopPets", PETS_MASTER, "pet");
}

function renderEquipped(elId, ids, kind) {
  const el = document.getElementById(elId);
  el.innerHTML = "";

  // ペットの場合は合計倍率も先頭に出す
  if (kind === "pet") {
    const totalMul = equippedPetTotalMultiplier();
    el.insertAdjacentHTML("beforeend", `
      <div class="card" style="background:#0f3a2e;border-color:#16a34a;">
        <h3>合計倍率</h3>
        <div class="meta">${fmtMul(totalMul)}（主人公＋武器に対して乗算）</div>
      </div>
    `);
  }

  if (ids.length === 0) {
    el.insertAdjacentHTML("beforeend", `<p style="opacity:0.6">未装備</p>`);
    return;
  }

  for (const id of ids) {
    const owned = (kind === "weapon" ? state.ownedWeapons : state.ownedPets)
      .find(x => x.id === id);
    const m = kind === "weapon" ? getWeaponMaster(id) : getPetMaster(id);
    if (!owned || !m) continue;

    let metaText;
    if (kind === "weapon") {
      const atk = weaponAtk(m.baseAtk, owned.lv);
      metaText = `Lv ${owned.lv}/${EQUIP_MAX_LV} ・ 攻撃力 ${atk}`;
    } else {
      const mul = petMultiplier(m.baseMultiplier, owned.lv);
      metaText = `Lv ${owned.lv}/${EQUIP_MAX_LV} ・ ${fmtMul(mul)}`;
    }

    el.insertAdjacentHTML("beforeend", `
      <div class="card">
        <h3>${m.name} <span class="tag equipped">装備中</span></h3>
        <div class="meta">${metaText}</div>
      </div>
    `);
  }
}

function renderOwned(elId, list, kind) {
  const el = document.getElementById(elId);
  el.innerHTML = "";
  if (list.length === 0) {
    el.innerHTML = `<p style="opacity:0.6">所持なし</p>`;
    return;
  }
  const equippedIds = kind === "weapon"
    ? state.equippedWeaponIds : state.equippedPetIds;

  for (const o of list) {
    const m = kind === "weapon" ? getWeaponMaster(o.id) : getPetMaster(o.id);
    if (!m) continue;

    let statText;
    if (kind === "weapon") {
      statText = `攻撃力 ${weaponAtk(m.baseAtk, o.lv)}`;
    } else {
      statText = fmtMul(petMultiplier(m.baseMultiplier, o.lv));
    }

    const need = o.lv >= EQUIP_MAX_LV ? null : equipNeedExp(o.lv);
    const isEquipped = equippedIds.includes(o.id);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${m.name} ${isEquipped ? '<span class="tag equipped">装備中</span>' : ''}</h3>
      <div class="meta">Lv ${o.lv}/${EQUIP_MAX_LV} ・ ${statText}</div>
      <div class="meta">EXP: ${o.exp}/${need ?? "MAX"}</div>
      <button data-act="equip">${isEquipped ? "外す" : "装備する"}</button>
      <button data-act="lvup" ${o.lv >= EQUIP_MAX_LV ? "disabled" : ""}>
        強化（${need ?? "MAX"}pt）
      </button>
    `;
    card.querySelector('[data-act="equip"]').onclick = () =>
      kind === "weapon" ? toggleEquipWeapon(o.id) : toggleEquipPet(o.id);
    card.querySelector('[data-act="lvup"]').onclick = () =>
      levelUpEquip(kind, o.id);
    el.appendChild(card);
  }
}

function renderShop(elId, master, kind) {
  const el = document.getElementById(elId);
  el.innerHTML = "";
  for (const m of master) {
    const owned = (kind === "weapon" ? state.ownedWeapons : state.ownedPets)
      .find(x => x.id === m.id);

    let statText;
    if (kind === "weapon") {
      statText = `基礎攻撃力 ${m.baseAtk}`;
    } else {
      statText = `基礎倍率 ${fmtMul(m.baseMultiplier)}`;
    }

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${m.name}</h3>
      <div class="meta">${statText} ・ 価格 ${m.price}pt</div>
      <div class="meta">${m.description ?? ""}</div>
      <button ${owned ? "disabled" : ""}>
        ${owned ? "所持済み" : "購入"}
      </button>
    `;
    card.querySelector("button").onclick = () =>
      kind === "weapon" ? buyWeapon(m.id) : buyPet(m.id);
    el.appendChild(card);
  }
}

// =========================
// 起動
// =========================
async function main() {
  await loadMasters();

  document.getElementById("btnLevelUp").onclick = levelUpHero;
  document.getElementById("btnReset").onclick = () => {
    if (confirm("セーブデータを消して最初からやり直しますか？")) {
      localStorage.removeItem(SAVE_KEY);
      state = defaultState();
      saveState();
      render();
    }
  };

  tickPoints();
  render();

  setInterval(() => {
    tickPoints();
    render();
  }, 1000);
}

main();
