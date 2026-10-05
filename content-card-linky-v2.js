/**
 * content-card-linky-v2 — « Carte Enedis V2 »
 *
 * Carte Lovelace pour l'export Home Assistant de MyElectricalData v2 (mode client).
 * Reprend l'esprit de content-card-linky (saniho, puis MyElectricalData),
 * réécrite pour les entités publiées par la v2 et pour le style de son interface.
 *
 * type: custom:content-card-linky-v2
 * entity: sensor.linky_<pdl>_consumption
 */

const CARD_VERSION = "0.2.1";

/* ---------------------------------------------------------------- données */

const MED = {
  /** "a,b,c" ou [a,b,c] -> tableau ; "-1" / -1 / "" -> null */
  list(value, kind = "num") {
    if (value === undefined || value === null) return [];
    const raw = Array.isArray(value) ? value : String(value).split(",");
    return raw.map((v) => {
      const s = String(v).trim();
      if (s === "" || s === "-1" || s === "null") return null;
      if (kind === "num") {
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      }
      if (kind === "bool") return s === "true";
      return s;
    });
  },

  num(value) {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) && n !== -1 ? n : null;
  },

  /** Construit la série des jours, du plus récent au plus ancien. */
  days(attr) {
    const dates = MED.list(attr.dailyweek, "str");
    const total = MED.list(attr.daily);
    const hc = MED.list(attr.dailyweek_HC);
    const hp = MED.list(attr.dailyweek_HP);
    const mp = MED.list(attr.dailyweek_MP);
    const mpTime = MED.list(attr.dailyweek_MP_time, "str");
    const mpOver = MED.list(attr.dailyweek_MP_over, "bool");
    const tempo = MED.list(attr.dailyweek_Tempo, "str");
    return dates.map((d, i) => {
      const h = hc[i] ?? null;
      const p = hp[i] ?? null;
      let t = total[i] ?? null;
      if (t === null && h !== null && p !== null) t = h + p;
      return {
        date: d ? new Date(d) : null,
        total: t,
        hc: h,
        hp: p,
        mp: mp[i] ?? null,
        mpTime: mpTime[i] ? new Date(mpTime[i]) : null,
        mpOver: mpOver[i] === true,
        tempo: tempo[i] ? tempo[i].toLowerCase() : null,
      };
    });
  },

  /** Coût d'un jour à partir des prix Tempo publiés par la v2. */
  cost(day, prices) {
    if (!prices || day.hc === null || day.hp === null || !day.tempo) return null;
    const p = prices[day.tempo];
    if (!p || p.hc === null || p.hp === null) return null;
    return day.hc * p.hc + day.hp * p.hp;
  },

  /** Jours Tempo restants : quota - used (le champ remaining de la v2 n'est pas fiable). */
  tempoLeft(info) {
    if (!info) return null;
    const out = {};
    for (const c of ["blue", "white", "red"]) {
      const d = info[`days_${c}_detail`];
      if (d && Number.isFinite(d.quota) && Number.isFinite(d.used)) {
        out[c] = { left: Math.max(0, d.quota - d.used), quota: d.quota };
      }
    }
    return Object.keys(out).length ? out : null;
  },
};

/* ------------------------------------------------------------- affichage */

const fmt = (n, digits = 1) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

const euro = (n) =>
  n === null || n === undefined
    ? "—"
    : Number(n).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

const TEMPO = {
  blue: { label: "Bleu", cls: "t-blue" },
  white: { label: "Blanc", cls: "t-white" },
  red: { label: "Rouge", cls: "t-red" },
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const DEFAULTS = {
  title: "Linky",
  days: 14,
  subscribed_power: null,
  tempo_today: "sensor.rte_tempo_today",
  tempo_tomorrow: "sensor.rte_tempo_tomorrow",
  tempo_info: "sensor.edf_tempo_tempo_info",
  price_prefix: "sensor.edf_tempo_price_",
  ecowatt: "sensor.rte_ecowatt_j0",
  show_cost: true,
  theme: "v2",
  show_pdl: true,
};

class ContentCardLinkyV2 extends HTMLElement {
  static getConfigElement() {
    return document.createElement("content-card-linky-v2-editor");
  }

  static getStubConfig(hass) {
    const e = Object.keys(hass?.states || {}).find((id) => /^sensor\.linky_\d+_consumption$/.test(id));
    return { entity: e || "sensor.linky_<pdl>_consumption" };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("Indiquez l'entité de consommation (sensor.linky_<pdl>_consumption).");
    this._config = { ...DEFAULTS, ...config, days: Number(config.days || DEFAULTS.days) };
    this._selected = 0;
    this._sig = null;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
      this.shadowRoot.addEventListener("click", (ev) => {
        const t = ev.target.closest("[data-i]");
        if (!t) return;
        this._selected = Number(t.dataset.i);
        this._render(true);
      });
    }
    this._render(true);
  }

  set hass(hass) {
    this._hass = hass;
    this._render(false);
  }

  getCardSize() {
    return 7;
  }

  _state(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  /** Ne redessine que si une entité utilisée a changé. */
  _signature() {
    const c = this._config;
    const ids = [c.entity, c.tempo_today, c.tempo_tomorrow, c.tempo_info, c.ecowatt];
    for (const col of ["blue", "white", "red"]) for (const h of ["hc", "hp"]) ids.push(`${c.price_prefix}${col}_${h}`);
    return `${c.theme}|${this._hass?.themes?.darkMode}|` + ids.map((id) => this._state(id)?.last_updated || "-").join("|");
  }

  _prices() {
    const c = this._config;
    const out = {};
    let any = false;
    for (const col of ["blue", "white", "red"]) {
      out[col] = {};
      for (const h of ["hc", "hp"]) {
        const v = MED.num(this._state(`${c.price_prefix}${col}_${h}`)?.state);
        out[col][h] = v;
        if (v !== null) any = true;
      }
    }
    return any ? out : null;
  }

  _render(force) {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const sig = this._signature();
    if (!force && sig === this._sig) return;
    this._sig = sig;

    const c = this._config;
    const mode = c.theme === "ha" ? `th-ha${this._hass.themes?.darkMode ? "" : " light"}` : "th-v2";
    const main = this._state(c.entity);
    if (!main) {
      this.shadowRoot.innerHTML = `${STYLE}<ha-card class="${mode}"><div class="empty">
        <strong>Entité introuvable : ${esc(c.entity)}</strong>
        <span>Activez l'export Home Assistant dans l'interface MyElectricalData v2, puis choisissez le capteur
        <code>sensor.linky_&lt;pdl&gt;_consumption</code> dans la configuration de la carte.</span></div></ha-card>`;
      return;
    }

    const a = main.attributes || {};
    const all = MED.days(a);
    const prices = c.show_cost ? this._prices() : null;
    all.forEach((d) => (d.cost = MED.cost(d, prices)));

    const shown = all.slice(0, Math.max(1, Math.min(c.days, all.length)));
    if (this._selected >= shown.length) this._selected = 0;

    const pdl = (c.entity.match(/linky_(\d+)_/) || [])[1];

    this.shadowRoot.innerHTML = `${STYLE}<ha-card class="${mode}">
      ${this._header(pdl)}
      ${this._hero(all[0], a)}
      ${this._tiles(a)}
      ${this._chart(shown)}
      ${this._detail(shown[this._selected])}
      ${this._power(shown)}
      ${this._ecowatt()}
      ${this._footer(all, prices)}
    </ha-card>`;
  }

  /* ---------------------------------------------------------- en-tête */

  _pill(entity, label) {
    const st = this._state(entity);
    const key = st ? String(st.state).toLowerCase() : null;
    const t = TEMPO[key];
    return `<div class="pill ${t ? t.cls : "t-none"}" title="${esc(entity)}">
      <span class="dot"></span><span class="pill-l">${label}</span>
      <span class="pill-v">${t ? t.label : "Non publié"}</span></div>`;
  }

  _header(pdl) {
    const c = this._config;
    const left = MED.tempoLeft(this._state(c.tempo_info)?.attributes);
    const quotas = left
      ? `<div class="quotas">${["blue", "white", "red"]
          .filter((k) => left[k])
          .map((k) => `<span class="quota ${TEMPO[k].cls}"><span class="dot"></span>${left[k].left}<small>/${left[k].quota}</small></span>`)
          .join("")}<span class="quota-l">jours restants</span></div>`
      : "";
    return `<header>
      <div class="brand">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path class="house" d="M4 14.5 16 4l12 10.5V27a1.5 1.5 0 0 1-1.5 1.5h-5M10.5 28.5h-5A1.5 1.5 0 0 1 4 27V14.5"/><path class="bolt" d="M17.5 9 11 18h4.5l-1.5 8 7-10h-4.6z"/></svg>
        <div><div class="title">${esc(c.title)}</div>${pdl && c.show_pdl !== false ? `<div class="sub">PDL ${pdl}</div>` : ""}</div>
      </div>
      <div class="tempo">${this._pill(c.tempo_today, "Aujourd'hui")}${this._pill(c.tempo_tomorrow, "Demain")}</div>
    </header>${quotas}`;
  }

  /* ------------------------------------------------------------- hier */

  _hero(day, a) {
    if (!day) return "";
    const total = MED.num(a.yesterday) ?? day.total;
    const evo = MED.num(a.yesterday_evolution);
    const split = day.hc !== null && day.hp !== null && day.hc + day.hp > 0;
    const hcPct = split ? (day.hc / (day.hc + day.hp)) * 100 : 0;
    const when = day.date ? day.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "Hier";
    return `<section class="hero">
      <div>
        <div class="hero-l">${esc(cap(when))}</div>
        <div class="hero-v">${fmt(total, 2)}<span>kWh</span></div>
        ${evo !== null ? `<div class="evo ${evo > 0 ? "up" : "down"}">${evo > 0 ? "+" : ""}${fmt(evo, 1)} % par rapport à la veille</div>` : ""}
      </div>
      <div class="hero-r">
        <div class="cost ${day.cost === null ? "none" : ""}">${day.cost !== null ? euro(day.cost) : "—"}</div>
        <div class="cost-l">${day.cost !== null ? "coût de la journée" : "coût disponible avec le détail HC/HP"}</div>
      </div>
      ${
        split
          ? `<div class="split"><div class="bar"><i class="hc" style="width:${hcPct}%"></i><i class="hp" style="width:${100 - hcPct}%"></i></div>
             <div class="split-l"><span class="k-hc">Heures creuses ${fmt(day.hc, 2)} kWh</span><span class="k-hp">Heures pleines ${fmt(day.hp, 2)} kWh</span></div></div>`
          : `<div class="split wait">Détail heures creuses / heures pleines pas encore publié par Enedis</div>`
      }
    </section>`;
  }

  /* ------------------------------------------------------------ tuiles */

  _tile(label, value, unit, evo, note) {
    const e = MED.num(evo);
    return `<div class="tile">
      <div class="tile-l">${cap(label)}</div>
      <div class="tile-v">${value}<span>${unit}</span></div>
      ${e !== null ? `<div class="evo ${e > 0 ? "up" : "down"}">${e > 0 ? "+" : ""}${fmt(e, 1)} %</div>` : ""}
      ${note ? `<div class="tile-n">${note}</div>` : ""}
    </div>`;
  }

  _tiles(a) {
    const now = new Date();
    const month = (offset, year = 0) =>
      new Date(now.getFullYear() + year, now.getMonth() + offset, 1).toLocaleDateString("fr-FR", { month: "long", year: year ? "numeric" : undefined });
    const cm = MED.num(a.current_month);
    const cmLy = MED.num(a.current_month_last_year);
    const lm = MED.num(a.last_month);
    const lmLy = MED.num(a.last_month_last_year);
    const cy = MED.num(a.current_year);
    const cyLy = MED.num(a.current_year_last_year);
    const hp = MED.num(a.peak_offpeak_percent);
    return `<section class="tiles">
      ${this._tile(`${month(0)} en cours`, fmt(cm, 0), "kWh", null, cmLy !== null ? `${cap(month(0, -1))} complet : ${fmt(cmLy, 0)} kWh` : "")}
      ${this._tile(month(-1), fmt(lm, 0), "kWh", a.monthly_evolution, lmLy !== null ? `${cap(month(-1, -1))} : ${fmt(lmLy, 0)} kWh` : "")}
      ${this._tile(`Année ${now.getFullYear()}`, fmt(cy, 0), "kWh", a.yearly_evolution, cyLy !== null ? `À date en ${now.getFullYear() - 1} : ${fmt(cyLy, 0)} kWh` : "")}
      ${this._tile("Part heures pleines", fmt(hp, 1), "%", null, "de la consommation")}
    </section>`;
  }

  /* ---------------------------------------------------------- graphique */

  _chart(days) {
    const chrono = days.map((d, i) => ({ ...d, i })).reverse();
    const n = chrono.length;
    const max = Math.max(1, ...chrono.map((d) => d.total || 0)) * 1.08;
    const H = 100;
    const slot = 100 / n;
    const w = slot * 0.62;
    const bars = chrono
      .map((d, k) => {
        const x = k * slot + (slot - w) / 2;
        const sel = d.i === this._selected ? `<rect class="sel" x="${k * slot}" y="0" width="${slot}" height="${H}"/>` : "";
        let body = "";
        if (d.hc !== null && d.hp !== null) {
          const hHc = (d.hc / max) * H;
          const hHp = (d.hp / max) * H;
          body = `<rect class="hc" x="${x}" y="${H - hHc}" width="${w}" height="${hHc}"/>
                  <rect class="hp" x="${x}" y="${H - hHc - hHp}" width="${w}" height="${hHp}"/>`;
        } else if (d.total !== null) {
          const h = (d.total / max) * H;
          body = `<rect class="partial" x="${x}" y="${H - h}" width="${w}" height="${h}"/>`;
        }
        return `${sel}${body}<rect class="hit" data-i="${d.i}" x="${k * slot}" y="0" width="${slot}" height="${H}"/>`;
      })
      .join("");
    const labels = chrono
      .map((d) => {
        const t = TEMPO[d.tempo];
        const name = d.date ? d.date.toLocaleDateString("fr-FR", { weekday: n > 14 ? "narrow" : "short" }).replace(".", "") : "";
        const num = d.date ? d.date.getDate() : "";
        return `<button class="day ${t ? t.cls : ""} ${d.i === this._selected ? "on" : ""}" data-i="${d.i}" title="${t ? `Jour ${t.label.toLowerCase()}` : ""}">
          <span>${name}</span><b>${num}</b><i class="dot"></i></button>`;
      })
      .join("");
    return `<section class="chart">
      <div class="chart-h"><span>${n} derniers jours</span>
        <span class="legend"><i class="k-hc"></i>HC<i class="k-hp"></i>HP</span></div>
      <svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" role="img" aria-label="Consommation des ${n} derniers jours">${bars}</svg>
      <div class="days" style="grid-template-columns:repeat(${n},1fr)">${labels}</div>
    </section>`;
  }

  _detail(d) {
    if (!d || !d.date) return "";
    const when = d.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const t = TEMPO[d.tempo];
    const parts = [`<b>${fmt(d.total, 2)} kWh</b>`];
    if (d.hc !== null && d.hp !== null) parts.push(`HC ${fmt(d.hc, 2)}`, `HP ${fmt(d.hp, 2)}`);
    else parts.push("détail HC/HP en attente");
    if (d.cost !== null) parts.push(euro(d.cost));
    const peak =
      d.mp !== null
        ? `Pic ${fmt(d.mp, 2)} kVA${d.mpTime ? ` à ${d.mpTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}${d.mpOver ? ' <em class="warn">dépassement</em>' : ""}`
        : "";
    return `<section class="detail">
      <div class="detail-h">${t ? `<span class="tag ${t.cls}">${t.label}</span>` : ""}<span>${esc(cap(when))}</span></div>
      <div class="detail-v">${parts.join("<span class=\"sep\"></span>")}</div>
      ${peak ? `<div class="detail-p">${peak}</div>` : ""}
    </section>`;
  }

  /* ------------------------------------------------- puissance max */

  _power(days) {
    const withMp = days.filter((d) => d.mp !== null);
    if (!withMp.length) return "";
    const top = withMp.reduce((m, d) => (d.mp > m.mp ? d : m));
    const sub = MED.num(this._config.subscribed_power);
    const over = days.some((d) => d.mpOver);
    const pct = sub ? Math.min(100, (top.mp / sub) * 100) : null;
    const when = top.date ? top.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }).replace(/^1 /, "1er ") : "";
    const hour = top.mpTime ? top.mpTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
    return `<section class="power ${over ? "is-over" : ""}">
      <div class="power-t"><span>Puissance maximale</span><b>${fmt(top.mp, 2)} kVA</b></div>
      ${pct !== null ? `<div class="gauge"><i style="width:${pct}%"></i></div>` : ""}
      <div class="power-n">Le ${esc(when)}${hour ? ` à ${hour}` : ""}${sub ? `, pour ${fmt(sub, 0)} kVA souscrits` : ""}${
        over ? ". Dépassement de la puissance souscrite sur la période." : ""
      }</div>
    </section>`;
  }

  /* ---------------------------------------------------------- EcoWatt */

  _ecowatt() {
    const st = this._state(this._config.ecowatt);
    if (!st || ["unknown", "unavailable", ""].includes(String(st.state))) return "";
    const msg = st.attributes?.message || st.state;
    return `<section class="eco"><span class="eco-l">EcoWatt</span><span>${esc(msg)}</span></section>`;
  }

  /* ----------------------------------------------------------- pied */

  _footer(all, prices) {
    const last = all.find((d) => d.total !== null && d.date);
    const bits = [];
    if (last) bits.push(`Données Enedis jusqu'au ${last.date.toLocaleDateString("fr-FR")}`);
    if (this._config.show_cost) bits.push(prices ? "coûts estimés hors abonnement, au prix Tempo du jour" : "prix Tempo introuvables, coûts masqués");
    return `<footer>${bits.join(", ")}.</footer>`;
  }
}

/* ------------------------------------------------------------------ style */

const STYLE = `<style>
:host {
  --med-bg: #1a2434; --med-surface: #212d40; --med-line: #2f3d55;
  --med-text: #e7edf5; --med-muted: #8fa0b8;
  --med-green: #96d21f; --med-blue: #1d93e3;
  --med-hc: #4a7bd8; --med-hp: #d27333;
  --t-blue: #3f7ff0; --t-white: #e9eef4; --t-red: #ee4a4a;
  --med-up: #f08a4b; --med-down: #5fcf8a;
}
ha-card { background: var(--med-bg); color: var(--med-text); border: 1px solid var(--med-line);
  border-radius: 18px; overflow: hidden; font-variant-numeric: tabular-nums; container-type: inline-size; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 8px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; }
.brand svg { width: 34px; height: 34px; fill: none; }
.brand .house { stroke: var(--med-green); stroke-width: 2.4; stroke-linejoin: round; stroke-linecap: round; }
.brand .bolt { fill: var(--med-blue); }
.title { font-size: 1.15rem; font-weight: 700; letter-spacing: .2px; }
.sub { font-size: .78rem; color: var(--med-muted); }
.tempo { display: flex; gap: 8px; }
.pill { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
  background: var(--med-surface); border: 1px solid var(--med-line); font-size: .78rem; }
.pill-l { color: var(--med-muted); }
.pill-v { font-weight: 600; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--med-muted); flex: none; }
.t-blue .dot { background: var(--t-blue); } .t-white .dot { background: var(--t-white); } .t-red .dot { background: var(--t-red); }
.t-none .pill-v { color: var(--med-muted); font-weight: 400; }
.quotas { display: flex; align-items: center; gap: 14px; padding: 0 18px 10px; font-size: .82rem; }
.quota { display: inline-flex; align-items: center; gap: 5px; font-weight: 600; }
.quota small { color: var(--med-muted); font-weight: 400; }
.quota-l { color: var(--med-muted); }

.hero { margin: 4px 12px 0; padding: 16px; border-radius: 14px; background: var(--med-surface);
  border: 1px solid var(--med-line); display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; }
.hero-l { color: var(--med-muted); font-size: .85rem; }
.hero-v { font-size: 2.4rem; font-weight: 700; line-height: 1.1; }
.hero-v span, .tile-v span { font-size: .9rem; font-weight: 500; color: var(--med-muted); margin-left: 4px; }
.hero-r { text-align: right; align-self: center; }
.cost { font-size: 1.6rem; font-weight: 700; color: var(--med-green); }
.cost.none { color: var(--med-muted); }
.cost-l { font-size: .75rem; color: var(--med-muted); max-width: 160px; }
.evo { font-size: .8rem; font-weight: 600; margin-top: 2px; }
.evo.up { color: var(--med-up); } .evo.down { color: var(--med-down); }
.split { grid-column: 1 / -1; margin-top: 6px; }
.split.wait { font-size: .8rem; color: var(--med-muted); border-top: 1px dashed var(--med-line); padding-top: 8px; }
.bar { display: flex; height: 8px; border-radius: 6px; overflow: hidden; background: var(--med-line); }
.bar i { display: block; } .bar .hc { background: var(--med-hc); } .bar .hp { background: var(--med-hp); }
.split-l { display: flex; justify-content: space-between; font-size: .78rem; margin-top: 6px; }
.k-hc { color: #8fb0f0; } .k-hp { color: #eaa070; }

.tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 10px 12px 0; }
@container (min-width: 620px) { .tiles { grid-template-columns: repeat(4, 1fr); } }
.tile { padding: 12px; border-radius: 12px; border: 1px solid var(--med-line); }
.tile-l { font-size: .78rem; color: var(--med-muted); }
.tile-v { font-size: 1.35rem; font-weight: 700; margin-top: 2px; }
.tile-n { font-size: .72rem; color: var(--med-muted); margin-top: 4px; }

.chart { margin: 14px 12px 0; }
.chart-h { display: flex; justify-content: space-between; font-size: .82rem; color: var(--med-muted); margin: 0 4px 6px; }
.legend { display: flex; align-items: center; gap: 6px; }
.legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-left: 6px; }
.legend .k-hc { background: var(--med-hc); } .legend .k-hp { background: var(--med-hp); }
.chart svg { width: 100%; height: 130px; display: block; }
.chart rect.hc { fill: var(--med-hc); } .chart rect.hp { fill: var(--med-hp); }
.chart rect.partial { fill: var(--med-line); opacity: .9; }
.chart rect.sel { fill: rgba(255,255,255,.06); }
.chart rect.hit { fill: transparent; cursor: pointer; }
.days { display: grid; margin-top: 4px; }
.day { all: unset; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 1px;
  padding: 4px 0; border-radius: 8px; font-size: .68rem; color: var(--med-muted); text-transform: capitalize; }
.day b { color: var(--med-text); font-size: .78rem; }
.day .dot { width: 6px; height: 6px; margin-top: 2px; }
.day.on { background: var(--med-surface); }
.day:focus-visible { outline: 2px solid var(--med-blue); }

.detail { margin: 8px 12px 0; padding: 10px 12px; border-radius: 12px; background: var(--med-surface); border: 1px solid var(--med-line); }
.detail-h { display: flex; align-items: center; gap: 8px; font-size: .8rem; color: var(--med-muted); }
.tag { padding: 1px 8px; border-radius: 999px; font-size: .72rem; font-weight: 700; color: #0f1724; }
.tag.t-blue { background: var(--t-blue); color: #fff; } .tag.t-white { background: var(--t-white); } .tag.t-red { background: var(--t-red); color: #fff; }
.detail-v { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin-top: 4px; font-size: .9rem; }
.sep { width: 1px; height: 12px; background: var(--med-line); }
.detail-p { font-size: .78rem; color: var(--med-muted); margin-top: 4px; }
.warn { color: var(--t-red); font-style: normal; font-weight: 600; }

.power { margin: 10px 12px 0; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--med-line); }
.power.is-over { border-color: var(--t-red); }
.power-t { display: flex; justify-content: space-between; font-size: .85rem; }
.gauge { height: 6px; border-radius: 6px; background: var(--med-line); margin: 8px 0 6px; overflow: hidden; }
.gauge i { display: block; height: 100%; background: linear-gradient(90deg, var(--med-green), var(--med-blue)); }
.is-over .gauge i { background: var(--t-red); }
.power-n { font-size: .75rem; color: var(--med-muted); }

.eco { margin: 10px 12px 0; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--med-line); font-size: .82rem; display: flex; gap: 10px; }
.eco-l { color: var(--med-muted); }
footer { padding: 10px 18px 14px; font-size: .7rem; color: var(--med-muted); }
.empty { padding: 18px; display: flex; flex-direction: column; gap: 6px; font-size: .9rem; }
.empty span { color: var(--med-muted); }
/* Thème Home Assistant : fond, textes et bordures suivent le thème clair ou sombre */
ha-card.th-ha {
  --med-bg: var(--ha-card-background, var(--card-background-color, #fff));
  --med-surface: color-mix(in srgb, var(--primary-text-color, #000) 5%, transparent);
  --med-line: var(--divider-color, rgba(127, 127, 127, .25));
  --med-text: var(--primary-text-color, #1f2937);
  --med-muted: var(--secondary-text-color, #6b7280);
  border-radius: var(--ha-card-border-radius, 12px);
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
}
ha-card.th-ha.light { --med-green: #4c8a0b; --med-up: #c2560f; --med-down: #1d8a4b; }
ha-card.light .k-hc { color: #2f5fb8; }
ha-card.light .k-hp { color: #b35619; }
ha-card.light .t-white .dot, ha-card.light .tag.t-white { box-shadow: inset 0 0 0 1px #aab3c0; }
ha-card.light .chart rect.sel { fill: rgba(0, 0, 0, .05); }
ha-card.light .tag.t-white { color: #1f2937; }
@media (max-width: 420px) { .hero-v { font-size: 2rem; } .tempo { width: 100%; } }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>`;

/* ----------------------------------------------------------------- éditeur */

const SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: "sensor" } } },
  { name: "title", selector: { text: {} } },
  {
    name: "days",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "7", label: "7 jours" },
          { value: "14", label: "14 jours" },
          { value: "31", label: "31 jours" },
        ],
      },
    },
  },
  { name: "subscribed_power", selector: { number: { min: 3, max: 36, step: 3, mode: "box", unit_of_measurement: "kVA" } } },
  {
    name: "theme",
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "v2", label: "Style MyElectricalData v2 (bleu nuit)" },
          { value: "ha", label: "Thème Home Assistant (clair ou sombre)" },
        ],
      },
    },
  },
  { name: "show_cost", selector: { boolean: {} } },
  { name: "show_pdl", selector: { boolean: {} } },
  { name: "tempo_today", selector: { entity: { domain: "sensor" } } },
  { name: "tempo_tomorrow", selector: { entity: { domain: "sensor" } } },
  { name: "tempo_info", selector: { entity: { domain: "sensor" } } },
  { name: "ecowatt", selector: { entity: { domain: "sensor" } } },
  { name: "price_prefix", selector: { text: {} } },
];

const LABELS = {
  entity: "Consommation (sensor.linky_<pdl>_consumption)",
  title: "Titre",
  days: "Historique affiché",
  subscribed_power: "Puissance souscrite",
  theme: "Couleurs de la carte",
  show_cost: "Afficher les coûts estimés",
  show_pdl: "Afficher le numéro de PDL",
  tempo_today: "Tempo aujourd'hui",
  tempo_tomorrow: "Tempo demain",
  tempo_info: "Tempo, jours restants",
  ecowatt: "EcoWatt (masqué si indisponible)",
  price_prefix: "Préfixe des capteurs de prix Tempo",
};

class ContentCardLinkyV2Editor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._draw();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._draw();
  }

  _draw() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LABELS[s.name] || s.name;
      this._form.addEventListener("value-changed", (ev) => {
        const v = { ...ev.detail.value };
        if (v.days !== undefined) v.days = Number(v.days);
        this._config = v;
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = SCHEMA;
    this._form.data = { ...DEFAULTS, ...this._config, days: String(this._config.days || DEFAULTS.days) };
  }
}

/* ---------------------------------------------------------- enregistrement */

if (typeof customElements !== "undefined") {
  if (!customElements.get("content-card-linky-v2")) customElements.define("content-card-linky-v2", ContentCardLinkyV2);
  if (!customElements.get("content-card-linky-v2-editor")) customElements.define("content-card-linky-v2-editor", ContentCardLinkyV2Editor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === "content-card-linky-v2")) {
    window.customCards.push({
      type: "content-card-linky-v2",
      name: "Carte Enedis V2",
      description: "Carte pour MyElectricalData v2 (export Home Assistant du mode client).",
      preview: true,
    });
  }
  console.info(`%c CARTE-ENEDIS-V2 %c ${CARD_VERSION} `, "background:#96d21f;color:#1a2434;font-weight:700", "background:#1d93e3;color:#fff");
}

if (typeof module !== "undefined") module.exports = { MED };
