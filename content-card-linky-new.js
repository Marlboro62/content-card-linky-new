/**
 * content-card-linky-new — « Carte Enedis Linky New »
 *
 * Carte Lovelace pour l'export Home Assistant de MyElectricalData new (mode client).
 * Reprend l'esprit de content-card-linky (saniho, puis MyElectricalData),
 * réécrite pour les entités publiées par MyElectricalData new et pour le style de son interface.
 *
 * type: custom:content-card-linky-new
 * entity: sensor.linky_<pdl>_consumption
 *
 * Production et bilan des échanges avec le réseau (même fichier) :
 * type: custom:content-card-linky-new-production
 * entity: sensor.linky_<pdl>_production
 * mode: production | bilan            (bilan : consumption_entity requis)
 *
 * Mini-carte Tempo (même fichier) : type: custom:content-card-linky-new-tempo
 *
 * L'ancien type custom:content-card-linky-v2 reste reconnu (tableaux de bord existants).
 */

const CARD_VERSION = "0.6.0";

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

  /** "2026-10-05" -> date locale (new Date() la lirait en UTC) */
  date(value) {
    if (!value) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
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
        date: MED.date(d),
        total: t,
        hc: h,
        hp: p,
        mp: mp[i] ?? null,
        mpTime: MED.date(mpTime[i]),
        mpOver: mpOver[i] === true,
        tempo: tempo[i] ? tempo[i].toLowerCase() : null,
      };
    });
  },

  /** Coût d'un jour à partir des prix Tempo publiés par MyElectricalData. */
  cost(day, prices) {
    if (!prices || day.hc === null || day.hp === null || !day.tempo) return null;
    const p = prices[day.tempo];
    if (!p || p.hc === null || p.hp === null) return null;
    return day.hc * p.hc + day.hp * p.hp;
  },

  /** Répartition HC/HP estimée d'un jour sans détail, d'après la part HP habituelle. */
  estimate(day, hpPct) {
    if (day.total === null || hpPct === null || hpPct < 0 || hpPct > 100) return null;
    const hp = (day.total * hpPct) / 100;
    return { hc: day.total - hp, hp };
  },

  /** Jours Tempo restants : quota - used (le champ remaining de MyElectricalData n'est pas fiable). */
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

/** Le capteur des jours Tempo restants porte l'un de ces deux noms selon l'installation :
 *  celui de la configuration d'abord, puis les deux noms connus. */
const TEMPO_INFO_IDS = (configured) =>
  [...new Set([configured, "sensor.edf_tempo_info", "sensor.edf_tempo_tempo_info"].filter(Boolean))];

/** Classe de thème de la carte :
 *  v2   : style MyElectricalData, toujours bleu nuit ;
 *  auto : style MyElectricalData, bleu nuit si Home Assistant est en mode sombre, clair sinon ;
 *  ha   : couleurs du thème Home Assistant (clair ou sombre). */
const themeClass = (theme, hass) => {
  const light = hass?.themes?.darkMode === false;
  if (theme === "ha") return `th-ha${light ? " light" : ""}`;
  if (theme === "auto") return `th-v2${light ? " light" : ""}`;
  return "th-v2";
};

const DEFAULTS = {
  title: "Linky",
  days: 14,
  subscribed_power: null,
  tempo_today: "sensor.rte_tempo_today",
  tempo_tomorrow: "sensor.rte_tempo_tomorrow",
  tempo_info: "sensor.edf_tempo_info",
  price_prefix: "sensor.edf_tempo_price_",
  ecowatt: "sensor.rte_ecowatt_j0",
  show_cost: true,
  theme: "v2",
  show_pdl: true,
  show_tempo: true,
  show_week: false,
};

class ContentCardLinkyNew extends HTMLElement {
  static getConfigElement() {
    return document.createElement("content-card-linky-new-editor");
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
    const ids = [c.entity, c.tempo_today, c.tempo_tomorrow, c.ecowatt, ...TEMPO_INFO_IDS(c.tempo_info)];
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
    const mode = themeClass(c.theme, this._hass);
    const main = this._state(c.entity);
    if (!main) {
      this.shadowRoot.innerHTML = `${STYLE}<ha-card class="${mode}"><div class="empty">
        <strong>Entité introuvable : ${esc(c.entity)}</strong>
        <span>Activez l'export Home Assistant dans l'interface MyElectricalData, puis choisissez le capteur
        <code>sensor.linky_&lt;pdl&gt;_consumption</code> dans la configuration de la carte.</span></div></ha-card>`;
      return;
    }

    const a = main.attributes || {};
    const all = MED.days(a);
    const prices = c.show_cost ? this._prices() : null;
    const hpPct = MED.num(a.peak_offpeak_percent);
    all.forEach((d) => {
      d.est = d.hc === null || d.hp === null ? MED.estimate(d, hpPct) : null;
      d.cost = MED.cost(d, prices);
      d.costEst = d.cost === null && d.est ? MED.cost({ ...d, ...d.est }, prices) : null;
    });

    const shown = all.slice(0, Math.max(1, Math.min(c.days, all.length)));
    if (this._selected >= shown.length) this._selected = 0;

    const pdl = (c.entity.match(/linky_(\d+)_/) || [])[1];

    this.shadowRoot.innerHTML = `${STYLE}<ha-card class="${mode}">
      ${this._header(pdl)}
      ${this._hero(all[0], a)}
      ${this._tiles(a, all)}
      ${this._chart(shown)}
      ${this._selected > 0 ? this._detail(shown[this._selected]) : ""}
      ${this._power(shown)}
      ${this._ecowatt()}
      ${this._footer(all, prices, hpPct)}
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
    const showTempo = c.show_tempo !== false;
    const info = TEMPO_INFO_IDS(c.tempo_info).map((id) => this._state(id)).find(Boolean);
    const left = showTempo ? MED.tempoLeft(info?.attributes) : null;
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
      ${showTempo ? `<div class="tempo">${this._pill(c.tempo_today, "Aujourd'hui")}${this._pill(c.tempo_tomorrow, "Demain")}</div>` : ""}
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
        ${
          day.cost !== null
            ? `<div class="cost">${euro(day.cost)}</div><div class="cost-l">coût de la journée</div>`
            : day.costEst !== null
              ? `<div class="cost est">≈ ${euro(day.costEst)}</div><div class="cost-l">coût estimé, en attendant le détail HC/HP</div>`
              : `<div class="cost none">—</div><div class="cost-l">coût disponible avec le détail HC/HP</div>`
        }
        ${day.mp !== null ? `<div class="hero-p">Pic ${fmt(day.mp, 2)} kVA${day.mpTime ? ` à ${day.mpTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>` : ""}
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

  _tile(label, value, unit, evo, note, evoSuffix = "") {
    const e = MED.num(evo);
    return `<div class="tile">
      <div class="tile-l">${cap(label)}</div>
      <div class="tile-v">${value}<span>${unit}</span></div>
      ${e !== null ? `<div class="evo ${e > 0 ? "up" : "down"}">${e > 0 ? "+" : ""}${fmt(e, 1)} %${evoSuffix}</div>` : ""}
      ${note ? `<div class="tile-n">${note}</div>` : ""}
    </div>`;
  }

  /** Semaine en cours (lundi à hier) comparée à la même période de la semaine dernière. */
  _weekTiles(a, all) {
    const DAY = 86400000;
    const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = dayOf(new Date());
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
    const prevMonday = new Date(monday.getTime() - 7 * DAY);
    const short = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    const cw = MED.num(a.current_week);
    const lw = MED.num(a.last_week);
    // Jours de la semaine en cours déjà publiés (données à J-1)
    const inRange = (from, to) => all.filter((d) => d.date && d.total !== null && dayOf(d.date) >= from && dayOf(d.date) <= to);
    const done = inRange(monday, today);
    let cwNote = "";
    let cwEvo = null;
    if (!done.length) {
      cwNote = "Pas encore de données (J-1)";
    } else {
      const lastDone = dayOf(done.reduce((m, d) => (d.date > m ? d.date : m), done[0].date));
      const span = Math.round((lastDone - monday) / DAY);
      const same = inRange(prevMonday, new Date(prevMonday.getTime() + span * DAY));
      if (same.length === span + 1) {
        const ref = same.reduce((t, d) => t + d.total, 0);
        if (cw !== null && ref > 0) cwEvo = ((cw - ref) / ref) * 100;
        cwNote = `Semaine dernière à date : ${fmt(ref, 0)} kWh`;
      }
    }
    const sunday = new Date(monday.getTime() - DAY);
    return `${this._tile("Semaine en cours", done.length ? fmt(cw, 0) : "—", "kWh", cwEvo, cwNote, cwEvo !== null ? " à date" : "")}
      ${this._tile("Semaine dernière", fmt(lw, 0), "kWh", null, `Du ${short(prevMonday)} au ${short(sunday)}`)}`;
  }

  _tiles(a, all) {
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
    // Projection fin de mois : comparer 5 jours à un mois complet n'a pas de sens.
    const last = all.find((d) => d.total !== null && d.date);
    let proj = null;
    if (cm !== null && last && last.date.getMonth() === now.getMonth() && last.date.getFullYear() === now.getFullYear()) {
      const done = last.date.getDate();
      const len = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      if (done >= 3) proj = (cm / done) * len;
    }
    const cmEvo = proj !== null && cmLy ? ((proj - cmLy) / cmLy) * 100 : null;
    const cmNote = [
      proj !== null ? `Projection : ${fmt(proj, 0)} kWh` : "",
      cmLy !== null ? `${cap(month(0, -1))} : ${fmt(cmLy, 0)} kWh` : "",
    ].filter(Boolean).join("<br>");
    const week = this._config.show_week ? this._weekTiles(a, all) : "";
    return `<section class="tiles${week ? " six" : ""}">
      ${week}
      ${this._tile(`${month(0)} en cours`, fmt(cm, 0), "kWh", cmEvo, cmNote, cmEvo !== null ? " sur projection" : "")}
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
        } else if (d.est) {
          const hHc = (d.est.hc / max) * H;
          const hHp = (d.est.hp / max) * H;
          body = `<g class="est"><title>Total ${fmt(d.total, 2)} kWh, répartition HC/HP estimée</title>
                  <rect class="hc" x="${x}" y="${H - hHc}" width="${w}" height="${hHc}"/>
                  <rect class="hp" x="${x}" y="${H - hHc - hHp}" width="${w}" height="${hHp}"/></g>`;
        } else if (d.total !== null) {
          const h = (d.total / max) * H;
          body = `<rect class="partial" x="${x}" y="${H - h}" width="${w}" height="${h}"/>`;
        }
        return `${sel}${body}<rect class="hit" data-i="${d.i}" x="${k * slot}" y="0" width="${slot}" height="${H}"/>`;
      })
      .join("");
    const showTempo = this._config.show_tempo !== false;
    const labels = chrono
      .map((d) => {
        const t = showTempo ? TEMPO[d.tempo] : null;
        const name = d.date ? d.date.toLocaleDateString("fr-FR", { weekday: n > 14 ? "narrow" : "short" }).replace(".", "") : "";
        const num = d.date ? d.date.getDate() : "";
        return `<button class="day ${t ? t.cls : ""} ${d.i === this._selected ? "on" : ""}" data-i="${d.i}" title="${t ? `Jour ${t.label.toLowerCase()}` : ""}">
          <span>${name}</span><b>${num}</b>${showTempo ? '<i class="dot"></i>' : ""}</button>`;
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
    const t = this._config.show_tempo !== false ? TEMPO[d.tempo] : null;
    const parts = [`<b>${fmt(d.total, 2)} kWh</b>`];
    if (d.hc !== null && d.hp !== null) parts.push(`HC ${fmt(d.hc, 2)}`, `HP ${fmt(d.hp, 2)}`);
    else parts.push("détail HC/HP en attente");
    if (d.cost !== null) parts.push(euro(d.cost));
    else if (d.costEst !== null) parts.push(`≈ ${euro(d.costEst)}`);
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
      <div class="power-t"><span>Puissance maximale sur ${days.length} jours</span><b>${fmt(top.mp, 2)} kVA</b></div>
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
    const LEVELS = {
      1: { cls: "e-ok", label: "Pas d'alerte" },
      2: { cls: "e-warn", label: "Système électrique tendu" },
      3: { cls: "e-alert", label: "Système très tendu, coupures possibles" },
    };
    const lvl = LEVELS[Math.round(Number(st.state))];
    const msg = st.attributes?.message || (lvl ? lvl.label : st.state);
    return `<section class="eco ${lvl ? lvl.cls : ""}" title="${esc(this._config.ecowatt)} : ${esc(st.state)}">
      <span class="eco-l">EcoWatt</span><span class="dot"></span><span>${esc(msg)}</span></section>`;
  }

  /* ----------------------------------------------------------- pied */

  _footer(all, prices, hpPct) {
    const last = all.find((d) => d.total !== null && d.date);
    const bits = [];
    if (last) bits.push(`Données Enedis jusqu'au ${last.date.toLocaleDateString("fr-FR")}`);
    if (this._config.show_cost) bits.push(prices ? "coûts estimés hors abonnement, au prix Tempo du jour" : "prix Tempo introuvables, coûts masqués");
    if (all.some((d) => d.est) && hpPct !== null) bits.push(`barres claires : répartition HC/HP estimée (${fmt(hpPct, 1)} % HP)`);
    return `<footer>${bits.join(", ")}.</footer>`;
  }
}

/* ------------------------------------------------- production et bilan */

const PROD_DEFAULTS = {
  title: "",
  mode: "production",
  days: 14,
  consumption_entity: "",
  sale_price: null,
  theme: "v2",
  show_pdl: true,
};

const SUN_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle class="sun" cx="16" cy="16" r="5.5"/><path class="rays" d="M16 3.5v3.5M16 25v3.5M3.5 16H7M25 16h3.5M7.2 7.2l2.5 2.5M22.3 22.3l2.5 2.5M7.2 24.8l2.5-2.5M22.3 9.7l2.5-2.5"/></svg>`;

const dayKey = (d) => (d ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` : "");
const hhmm = (d) => (d ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const longDay = (d) => (d ? cap(d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })) : "Hier");

/** Projection fin de mois à partir du cumul du mois en cours (au moins 3 jours de données). */
function monthProjection(cm, all) {
  const now = new Date();
  const last = all.find((d) => d.total !== null && d.date);
  if (cm === null || !last || last.date.getMonth() !== now.getMonth() || last.date.getFullYear() !== now.getFullYear()) return null;
  const done = last.date.getDate();
  if (done < 3) return null;
  return (cm / done) * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

class ContentCardLinkyNewProduction extends HTMLElement {
  static getConfigElement() {
    return document.createElement("content-card-linky-new-production-editor");
  }

  static getStubConfig(hass) {
    const ids = Object.keys(hass?.states || {});
    const prod = ids.find((id) => /^sensor\.linky_\d+_production$/.test(id));
    const pdl = prod ? prod.match(/linky_(\d+)_/)[1] : null;
    const cons = pdl ? ids.find((id) => id === `sensor.linky_${pdl}_consumption`) : null;
    return { entity: prod || "sensor.linky_<pdl>_production", ...(cons ? { consumption_entity: cons } : {}) };
  }

  setConfig(config) {
    if (!config || !config.entity) throw new Error("Indiquez l'entité de production (sensor.linky_<pdl>_production).");
    const mode = config.mode === "bilan" ? "bilan" : "production";
    if (mode === "bilan" && !config.consumption_entity) {
      throw new Error("Le mode bilan a besoin de l'entité de consommation (consumption_entity : sensor.linky_<pdl>_consumption).");
    }
    this._config = { ...PROD_DEFAULTS, ...config, mode, days: Number(config.days || PROD_DEFAULTS.days) };
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
    return 6;
  }

  _state(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  _signature() {
    const c = this._config;
    const ids = [c.entity, c.mode === "bilan" ? c.consumption_entity : null];
    return `${c.theme}|${this._hass?.themes?.darkMode}|` + ids.map((id) => this._state(id)?.last_updated || "-").join("|");
  }

  _price() {
    const p = MED.num(this._config.sale_price);
    return p !== null && p > 0 ? p : null;
  }

  _render(force) {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const sig = this._signature();
    if (!force && sig === this._sig) return;
    this._sig = sig;

    const c = this._config;
    const theme = themeClass(c.theme, this._hass);
    const prod = this._state(c.entity);
    const cons = c.mode === "bilan" ? this._state(c.consumption_entity) : null;
    const missing = !prod ? c.entity : c.mode === "bilan" && !cons ? c.consumption_entity : null;
    if (missing) {
      this.shadowRoot.innerHTML = `${STYLE}${PROD_STYLE}<ha-card class="${theme}"><div class="empty">
        <strong>Entité introuvable : ${esc(missing)}</strong>
        <span>Le capteur <code>sensor.linky_&lt;pdl&gt;_production</code> n'est créé par l'export Home Assistant de
        MyElectricalData que pour un point de livraison qui a de la production (panneaux solaires, etc.).</span></div></ha-card>`;
      return;
    }

    const pdl = (c.entity.match(/linky_(\d+)_/) || [])[1];
    const pa = prod.attributes || {};
    const pAll = MED.days(pa);
    let body;
    if (c.mode === "bilan") {
      const ca = cons.attributes || {};
      const byDay = new Map(MED.days(ca).map((d) => [dayKey(d.date), d]));
      const all = pAll
        .filter((d) => d.date)
        .map((d) => {
          const k = byDay.get(dayKey(d.date));
          const out = d.total;
          const inn = k ? k.total : null;
          return { date: d.date, out, inn, net: out !== null && inn !== null ? out - inn : null };
        });
      const shown = all.slice(0, Math.max(1, Math.min(c.days, all.length)));
      if (this._selected >= shown.length) this._selected = 0;
      body = `${this._balanceHero(all)}${this._balanceTiles(pa, ca)}${this._balanceChart(shown)}
        ${this._selected > 0 ? this._balanceDetail(shown[this._selected]) : ""}${this._balanceFooter(all)}`;
    } else {
      const shown = pAll.slice(0, Math.max(1, Math.min(c.days, pAll.length)));
      if (this._selected >= shown.length) this._selected = 0;
      body = `${this._prodHero(pAll[0], pa)}${this._prodTiles(pa, pAll, shown)}${this._prodChart(shown)}
        ${this._selected > 0 ? this._prodDetail(shown[this._selected]) : ""}${this._prodFooter(pAll)}`;
    }
    this.shadowRoot.innerHTML = `${STYLE}${PROD_STYLE}<ha-card class="${theme} prod">${this._header(pdl)}${body}</ha-card>`;
  }

  _header(pdl) {
    const c = this._config;
    const title = c.title || (c.mode === "bilan" ? "Bilan réseau" : "Production");
    return `<header>
      <div class="brand">${SUN_ICON}
        <div><div class="title">${esc(title)}</div>${pdl && c.show_pdl !== false ? `<div class="sub">PDL ${pdl}</div>` : ""}</div>
      </div>
    </header>`;
  }

  _evo(evo, suffix = " par rapport à la veille") {
    const e = MED.num(evo);
    // Pour la production, une hausse est une bonne nouvelle : couleurs inversées par rapport à la consommation.
    return e !== null ? `<div class="evo ${e > 0 ? "down" : "up"}">${e > 0 ? "+" : ""}${fmt(e, 1)} %${suffix}</div>` : "";
  }

  /* ------------------------------------------------- mode production */

  _prodHero(day, a) {
    if (!day) return "";
    const total = MED.num(a.yesterday) ?? day.total;
    const price = this._price();
    const peak = day.mp !== null ? `Pic d'injection ${fmt(day.mp, 2)} kW${day.mpTime ? ` à ${hhmm(day.mpTime)}` : ""}` : "";
    return `<section class="hero">
      <div>
        <div class="hero-l">${esc(longDay(day.date))}</div>
        <div class="hero-v pv">${fmt(total, 2)}<span>kWh</span></div>
        ${this._evo(a.yesterday_evolution)}
      </div>
      <div class="hero-r">
        ${
          price !== null && total !== null
            ? `<div class="cost">${euro(total * price)}</div><div class="cost-l">rachat estimé à ${Number(price).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €/kWh</div>${peak ? `<div class="hero-p">${peak}</div>` : ""}`
            : peak
              ? `<div class="peak">${fmt(day.mp, 2)}<span>kW</span></div><div class="cost-l">pic d'injection${day.mpTime ? ` à ${hhmm(day.mpTime)}` : ""}</div>`
              : ""
        }
      </div>
    </section>`;
  }

  _prodTiles(a, all, shown) {
    const now = new Date();
    const month = (offset) => new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleDateString("fr-FR", { month: "long" });
    const cm = MED.num(a.current_month);
    const cmLy = MED.num(a.current_month_last_year);
    const lm = MED.num(a.last_month);
    const lmLy = MED.num(a.last_month_last_year);
    const cy = MED.num(a.current_year);
    const cyLy = MED.num(a.current_year_last_year);
    const proj = monthProjection(cm, all);
    const best = shown.filter((d) => d.total !== null).reduce((m, d) => (!m || d.total > m.total ? d : m), null);
    const tile = (label, value, unit, evo, note) => `<div class="tile">
      <div class="tile-l">${cap(label)}</div><div class="tile-v">${value}<span>${unit}</span></div>
      ${this._evo(evo, "")}${note ? `<div class="tile-n">${note}</div>` : ""}</div>`;
    return `<section class="tiles">
      ${tile(`${month(0)} en cours`, fmt(cm, 0), "kWh", null, [proj !== null ? `Projection : ${fmt(proj, 0)} kWh` : "", cmLy !== null ? `L'an dernier : ${fmt(cmLy, 0)} kWh` : ""].filter(Boolean).join("<br>"))}
      ${tile(month(-1), fmt(lm, 0), "kWh", a.monthly_evolution, lmLy !== null ? `L'an dernier : ${fmt(lmLy, 0)} kWh` : "")}
      ${tile(`Année ${now.getFullYear()}`, fmt(cy, 0), "kWh", a.yearly_evolution, cyLy !== null ? `À date en ${now.getFullYear() - 1} : ${fmt(cyLy, 0)} kWh` : "")}
      ${tile("Meilleur jour", fmt(best ? best.total : null, 1), "kWh", null, best && best.date ? `Le ${best.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : "")}
    </section>`;
  }

  _labels(chrono, n) {
    return chrono
      .map((d) => {
        const name = d.date ? d.date.toLocaleDateString("fr-FR", { weekday: n > 14 ? "narrow" : "short" }).replace(".", "") : "";
        return `<button class="day ${d.i === this._selected ? "on" : ""}" data-i="${d.i}"><span>${name}</span><b>${d.date ? d.date.getDate() : ""}</b></button>`;
      })
      .join("");
  }

  _prodChart(days) {
    const chrono = days.map((d, i) => ({ ...d, i })).reverse();
    const n = chrono.length;
    const max = Math.max(0.1, ...chrono.map((d) => d.total || 0)) * 1.08;
    const H = 100;
    const slot = 100 / n;
    const w = slot * 0.62;
    const bars = chrono
      .map((d, k) => {
        const x = k * slot + (slot - w) / 2;
        const sel = d.i === this._selected ? `<rect class="sel" x="${k * slot}" y="0" width="${slot}" height="${H}"/>` : "";
        const h = d.total !== null ? (d.total / max) * H : 0;
        const bar = d.total !== null ? `<rect class="pv" x="${x}" y="${H - h}" width="${w}" height="${h}"/>` : "";
        return `${sel}${bar}<rect class="hit" data-i="${d.i}" x="${k * slot}" y="0" width="${slot}" height="${H}"/>`;
      })
      .join("");
    return `<section class="chart">
      <div class="chart-h"><span>${n} derniers jours</span><span class="legend"><i class="k-pv"></i>Production</span></div>
      <svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" role="img" aria-label="Production des ${n} derniers jours">${bars}</svg>
      <div class="days" style="grid-template-columns:repeat(${n},1fr)">${this._labels(chrono, n)}</div>
    </section>`;
  }

  _prodDetail(d) {
    if (!d || !d.date) return "";
    const price = this._price();
    const parts = [`<b>${fmt(d.total, 2)} kWh</b>`];
    if (price !== null && d.total !== null) parts.push(`≈ ${euro(d.total * price)}`);
    if (d.mp !== null) parts.push(`pic ${fmt(d.mp, 2)} kW${d.mpTime ? ` à ${hhmm(d.mpTime)}` : ""}`);
    return `<section class="detail">
      <div class="detail-h"><span>${esc(longDay(d.date))}</span></div>
      <div class="detail-v">${parts.join('<span class="sep"></span>')}</div>
    </section>`;
  }

  _prodFooter(all) {
    const last = all.find((d) => d.total !== null && d.date);
    const bits = [];
    if (last) bits.push(`Données Enedis jusqu'au ${last.date.toLocaleDateString("fr-FR")}`);
    bits.push("énergie mesurée par le compteur Linky : surplus injecté sur le réseau (vente du surplus) ou production totale (vente totale)");
    return `<footer>${bits.join(", ")}.</footer>`;
  }

  /* ------------------------------------------------------ mode bilan */

  _balanceHero(all) {
    const day = all.find((d) => d.net !== null) || all[0];
    if (!day) return "";
    const net = day.net;
    const ratio = day.inn ? (day.out / day.inn) * 100 : null;
    const total = (day.out || 0) + (day.inn || 0);
    const outPct = total > 0 ? ((day.out || 0) / total) * 100 : 50;
    return `<section class="hero">
      <div>
        <div class="hero-l">${esc(longDay(day.date))} · solde réseau</div>
        <div class="hero-v ${net === null ? "" : net >= 0 ? "pos" : "neg"}">${net === null ? "—" : `${net > 0 ? "+" : ""}${fmt(net, 2)}`}<span>kWh</span></div>
        <div class="tile-n">${net === null ? "" : net >= 0 ? "Plus d'énergie injectée que soutirée" : "Plus d'énergie soutirée qu'injectée"}</div>
      </div>
      <div class="hero-r">
        ${ratio !== null ? `<div class="peak">${fmt(ratio, 0)}<span>%</span></div><div class="cost-l">injecté / soutiré</div>` : ""}
      </div>
      <div class="split"><div class="bar"><i class="out" style="width:${outPct}%"></i><i class="in" style="width:${100 - outPct}%"></i></div>
        <div class="split-l"><span class="k-out">Injecté ${fmt(day.out, 2)} kWh</span><span class="k-in">Soutiré ${fmt(day.inn, 2)} kWh</span></div></div>
    </section>`;
  }

  _balanceTiles(pa, ca) {
    const now = new Date();
    const out = MED.num(pa.current_month);
    const inn = MED.num(ca.current_month);
    const yOut = MED.num(pa.current_year);
    const yIn = MED.num(ca.current_year);
    const sign = (v) => (v === null ? "—" : `${v > 0 ? "+" : ""}${fmt(v, 0)}`);
    const mNet = out !== null && inn !== null ? out - inn : null;
    const yNet = yOut !== null && yIn !== null ? yOut - yIn : null;
    const month = cap(now.toLocaleDateString("fr-FR", { month: "long" }));
    const tile = (label, value, note, cls = "") => `<div class="tile"><div class="tile-l">${label}</div>
      <div class="tile-v ${cls}">${value}<span>kWh</span></div>${note ? `<div class="tile-n">${note}</div>` : ""}</div>`;
    const cls = (v) => (v === null ? "" : v >= 0 ? "pos" : "neg");
    return `<section class="tiles">
      ${tile(`${month} · injecté`, fmt(out, 0), "")}
      ${tile(`${month} · soutiré`, fmt(inn, 0), "")}
      ${tile(`${month} · solde`, sign(mNet), mNet !== null && inn ? `Injecté / soutiré : ${fmt((out / inn) * 100, 0)} %` : "", cls(mNet))}
      ${tile(`Année ${now.getFullYear()} · solde`, sign(yNet), yNet !== null && yIn ? `Injecté / soutiré : ${fmt((yOut / yIn) * 100, 0)} %` : "", cls(yNet))}
    </section>`;
  }

  _balanceChart(days) {
    const chrono = days.map((d, i) => ({ ...d, i })).reverse();
    const n = chrono.length;
    const up = Math.max(0.1, ...chrono.map((d) => d.out || 0));
    const down = Math.max(0.1, ...chrono.map((d) => d.inn || 0));
    const H = 100;
    const zero = (up / (up + down)) * H * 0.96 + 2;
    const scale = (H - 4) / (up + down);
    const slot = 100 / n;
    const w = slot * 0.62;
    const bars = chrono
      .map((d, k) => {
        const x = k * slot + (slot - w) / 2;
        const sel = d.i === this._selected ? `<rect class="sel" x="${k * slot}" y="0" width="${slot}" height="${H}"/>` : "";
        const hOut = d.out !== null ? d.out * scale : 0;
        const hIn = d.inn !== null ? d.inn * scale : 0;
        return `${sel}${hOut ? `<rect class="out" x="${x}" y="${zero - hOut}" width="${w}" height="${hOut}"/>` : ""}${
          hIn ? `<rect class="in" x="${x}" y="${zero}" width="${w}" height="${hIn}"/>` : ""
        }<rect class="hit" data-i="${d.i}" x="${k * slot}" y="0" width="${slot}" height="${H}"/>`;
      })
      .join("");
    return `<section class="chart">
      <div class="chart-h"><span>${n} derniers jours</span><span class="legend"><i class="k-out"></i>Injecté<i class="k-in"></i>Soutiré</span></div>
      <svg viewBox="0 0 100 ${H}" preserveAspectRatio="none" role="img" aria-label="Énergie injectée et soutirée des ${n} derniers jours">
        ${bars}<line class="zero" x1="0" x2="100" y1="${zero}" y2="${zero}"/></svg>
      <div class="days" style="grid-template-columns:repeat(${n},1fr)">${this._labels(chrono, n)}</div>
    </section>`;
  }

  _balanceDetail(d) {
    if (!d || !d.date) return "";
    const parts = [`Injecté <b>${fmt(d.out, 2)} kWh</b>`, `Soutiré <b>${fmt(d.inn, 2)} kWh</b>`];
    if (d.net !== null) parts.push(`Solde <b class="${d.net >= 0 ? "pos" : "neg"}">${d.net > 0 ? "+" : ""}${fmt(d.net, 2)} kWh</b>`);
    return `<section class="detail">
      <div class="detail-h"><span>${esc(longDay(d.date))}</span></div>
      <div class="detail-v">${parts.join('<span class="sep"></span>')}</div>
    </section>`;
  }

  _balanceFooter(all) {
    const last = all.find((d) => d.net !== null);
    const bits = [];
    if (last) bits.push(`Données Enedis jusqu'au ${last.date.toLocaleDateString("fr-FR")}`);
    bits.push("échanges avec le réseau mesurés par le compteur Linky ; l'énergie produite et consommée sur place (autoconsommation) n'est pas visible par Enedis");
    return `<footer>${bits.join(", ")}.</footer>`;
  }
}

const PROD_STYLE = `<style>
ha-card.prod { --med-pv: #f5b82e; --med-out: #f5b82e; --med-in: #4a7bd8; --med-pos: #5fcf8a; --med-neg: #f08a4b; }
ha-card.prod.light { --med-pv: #d99a06; --med-out: #d99a06; --med-pos: #1d8a4b; --med-neg: #c2560f; }
.brand .sun { fill: var(--med-pv); }
.brand .rays { stroke: var(--med-pv); stroke-width: 2.2; stroke-linecap: round; }
.hero-v.pv { color: var(--med-text); }
.peak { font-size: 1.6rem; font-weight: 700; color: var(--med-pv); }
.peak span { font-size: .85rem; font-weight: 500; color: var(--med-muted); margin-left: 3px; }
.pos { color: var(--med-pos); } .neg { color: var(--med-neg); }
.bar .out { background: var(--med-out); } .bar .in { background: var(--med-in); }
.k-out { color: var(--med-out); } .k-in { color: #8fb0f0; }
ha-card.light .k-in { color: #2f5fb8; }
.legend .k-pv, .legend .k-out { background: var(--med-out); } .legend .k-in { background: var(--med-in); }
.chart rect.pv, .chart rect.out { fill: var(--med-out); } .chart rect.in { fill: var(--med-in); }
.chart line.zero { stroke: var(--med-muted); stroke-width: .4; vector-effect: non-scaling-stroke; opacity: .6; }
</style>`;

/* ------------------------------------------------------------ mini Tempo */

const TEMPO_DEFAULTS = {
  tempo_today: "sensor.rte_tempo_today",
  tempo_tomorrow: "sensor.rte_tempo_tomorrow",
  tempo_info: "sensor.edf_tempo_info",
  show_remaining: true,
  theme: "v2",
};

class ContentCardLinkyNewTempo extends HTMLElement {
  static getConfigElement() {
    return document.createElement("content-card-linky-new-tempo-editor");
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    this._config = { ...TEMPO_DEFAULTS, ...(config || {}) };
    this._sig = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._render(true);
  }

  set hass(hass) {
    this._hass = hass;
    this._render(false);
  }

  getCardSize() {
    return 1;
  }

  _state(id) {
    return id ? this._hass?.states?.[id] : undefined;
  }

  _render(force) {
    if (!this._config || !this._hass || !this.shadowRoot) return;
    const c = this._config;
    const ids = [c.tempo_today, c.tempo_tomorrow, ...TEMPO_INFO_IDS(c.tempo_info)];
    const sig = `${c.theme}|${this._hass.themes?.darkMode}|` + ids.map((id) => this._state(id)?.last_updated || "-").join("|");
    if (!force && sig === this._sig) return;
    this._sig = sig;

    const pill = (entity, label) => {
      const st = this._state(entity);
      const t = TEMPO[st ? String(st.state).toLowerCase() : ""];
      return `<div class="pill ${t ? t.cls : "t-none"}" title="${esc(entity)}">
        <span class="dot"></span><span class="pill-l">${label}</span><span class="pill-v">${t ? t.label : "Non publié"}</span></div>`;
    };
    const info = TEMPO_INFO_IDS(c.tempo_info).map((id) => this._state(id)).find(Boolean);
    const left = c.show_remaining !== false ? MED.tempoLeft(info?.attributes) : null;
    const quotas = left
      ? `<div class="quotas" title="Jours Tempo restants dans la saison">${["blue", "white", "red"]
          .filter((k) => left[k])
          .map((k) => `<span class="quota ${TEMPO[k].cls}"><span class="dot"></span>${left[k].left}<small>/${left[k].quota}</small></span>`)
          .join("")}</div>`
      : "";
    this.shadowRoot.innerHTML = `${STYLE}${TEMPO_STYLE}<ha-card class="${themeClass(c.theme, this._hass)} mini">
      <div class="row">${pill(c.tempo_today, "Aujourd'hui")}${pill(c.tempo_tomorrow, "Demain")}${quotas}</div>
    </ha-card>`;
  }
}

const TEMPO_STYLE = `<style>
ha-card.mini { border-radius: 14px; }
.mini .row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 10px; padding: 10px 12px; }
.mini .quotas { padding: 0 0 0 4px; margin-left: auto; gap: 12px; }
@container (max-width: 360px) { .mini .quotas { margin-left: 0; } }
</style>`;

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
.cost.est { color: var(--med-text); opacity: .85; }
.hero-p { font-size: .75rem; color: var(--med-muted); margin-top: 6px; }
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
@container (min-width: 620px) { .tiles.six { grid-template-columns: repeat(3, 1fr); } }
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
.chart rect.partial { fill: var(--med-muted); opacity: .35; }
.chart g.est { opacity: .45; }
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

.eco { margin: 10px 12px 0; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--med-line); font-size: .82rem; display: flex; align-items: center; gap: 8px; }
.eco.e-ok .dot { background: var(--med-down); }
.eco.e-warn { border-color: #f0a33a; } .eco.e-warn .dot { background: #f0a33a; }
.eco.e-alert { border-color: var(--t-red); } .eco.e-alert .dot { background: var(--t-red); }
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
/* Style MyElectricalData en version claire (theme: auto quand Home Assistant est en mode clair) */
ha-card.th-v2.light {
  --med-bg: #ffffff; --med-surface: #f2f5f9; --med-line: #dbe2ec;
  --med-text: #1a2434; --med-muted: #5b6b82;
  --med-green: #4c8a0b; --med-blue: #1673b8; --med-up: #c2560f; --med-down: #1d8a4b;
  box-shadow: 0 1px 3px rgba(26, 36, 52, .08);
}
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
          { value: "v2", label: "Style MyElectricalData (bleu nuit)" },
          { value: "auto", label: "Style MyElectricalData, clair ou sombre selon Home Assistant" },
          { value: "ha", label: "Thème Home Assistant (clair ou sombre)" },
        ],
      },
    },
  },
  { name: "show_cost", selector: { boolean: {} } },
  { name: "show_pdl", selector: { boolean: {} } },
  { name: "show_tempo", selector: { boolean: {} } },
  { name: "show_week", selector: { boolean: {} } },
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
  show_tempo: "Afficher Tempo (couleurs d'aujourd'hui et de demain, jours restants, pastilles du graphique)",
  show_week: "Afficher la semaine en cours et la semaine dernière",
  tempo_today: "Tempo aujourd'hui",
  tempo_tomorrow: "Tempo demain",
  tempo_info: "Tempo, jours restants",
  ecowatt: "EcoWatt (masqué si indisponible)",
  price_prefix: "Préfixe des capteurs de prix Tempo",
};

const DAYS_SELECT = SCHEMA.find((s) => s.name === "days");
const THEME_SELECT = SCHEMA.find((s) => s.name === "theme");

const PROD_SCHEMA = [
  {
    name: "mode",
    required: true,
    selector: {
      select: {
        mode: "dropdown",
        options: [
          { value: "production", label: "Production" },
          { value: "bilan", label: "Bilan des échanges avec le réseau (injecté / soutiré)" },
        ],
      },
    },
  },
  { name: "entity", required: true, selector: { entity: { domain: "sensor" } } },
  { name: "consumption_entity", selector: { entity: { domain: "sensor" } } },
  { name: "title", selector: { text: {} } },
  DAYS_SELECT,
  { name: "sale_price", selector: { number: { min: 0, max: 1, step: 0.0001, mode: "box", unit_of_measurement: "€/kWh" } } },
  THEME_SELECT,
  { name: "show_pdl", selector: { boolean: {} } },
];

const PROD_LABELS = {
  mode: "Affichage",
  entity: "Production (sensor.linky_<pdl>_production)",
  consumption_entity: "Consommation, pour le mode bilan (sensor.linky_<pdl>_consumption)",
  title: "Titre (par défaut : Production ou Bilan réseau)",
  days: "Historique affiché",
  sale_price: "Prix de rachat, pour estimer le revenu (mode production, facultatif)",
  theme: "Couleurs de la carte",
  show_pdl: "Afficher le numéro de PDL",
};

/** Éditeur visuel commun aux deux cartes : seuls le schéma, les libellés et les valeurs par défaut changent. */
function makeEditor(schema, labels, defaults) {
  const hasDays = schema.some((s) => s.name === "days");
  return class extends HTMLElement {
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
        this._form.computeLabel = (s) => labels[s.name] || s.name;
        this._form.addEventListener("value-changed", (ev) => {
          const v = { ...ev.detail.value };
          if (hasDays && v.days !== undefined) v.days = Number(v.days);
          this._config = v;
          this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: v }, bubbles: true, composed: true }));
        });
        this.appendChild(this._form);
      }
      this._form.hass = this._hass;
      this._form.schema = schema;
      this._form.data = hasDays
        ? { ...defaults, ...this._config, days: String(this._config.days || defaults.days) }
        : { ...defaults, ...this._config };
    }
  };
}

const ContentCardLinkyNewEditor = makeEditor(SCHEMA, LABELS, DEFAULTS);
const ContentCardLinkyNewProductionEditor = makeEditor(PROD_SCHEMA, PROD_LABELS, PROD_DEFAULTS);

const TEMPO_SCHEMA = [
  { name: "tempo_today", selector: { entity: { domain: "sensor" } } },
  { name: "tempo_tomorrow", selector: { entity: { domain: "sensor" } } },
  { name: "tempo_info", selector: { entity: { domain: "sensor" } } },
  { name: "show_remaining", selector: { boolean: {} } },
  THEME_SELECT,
];
const TEMPO_LABELS = {
  tempo_today: "Tempo aujourd'hui",
  tempo_tomorrow: "Tempo demain",
  tempo_info: "Tempo, jours restants",
  show_remaining: "Afficher les jours restants",
  theme: "Couleurs de la carte",
};
const ContentCardLinkyNewTempoEditor = makeEditor(TEMPO_SCHEMA, TEMPO_LABELS, TEMPO_DEFAULTS);

/* ---------------------------------------------------------- enregistrement */

if (typeof customElements !== "undefined") {
  const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
  define("content-card-linky-new", ContentCardLinkyNew);
  define("content-card-linky-new-editor", ContentCardLinkyNewEditor);
  // Compatibilité : les tableaux de bord créés avec l'ancien type continuent de fonctionner.
  define("content-card-linky-v2", class extends ContentCardLinkyNew {});
  define("content-card-linky-v2-editor", class extends ContentCardLinkyNewEditor {});
  define("content-card-linky-new-production", ContentCardLinkyNewProduction);
  define("content-card-linky-new-production-editor", ContentCardLinkyNewProductionEditor);
  define("content-card-linky-new-tempo", ContentCardLinkyNewTempo);
  define("content-card-linky-new-tempo-editor", ContentCardLinkyNewTempoEditor);
  window.customCards = window.customCards || [];
  const register = (type, name, description) => {
    if (!window.customCards.some((c) => c.type === type)) window.customCards.push({ type, name, description, preview: true });
  };
  register("content-card-linky-new", "Carte Enedis Linky New", "Carte pour MyElectricalData new (export Home Assistant du mode client).");
  register(
    "content-card-linky-new-tempo",
    "Carte Enedis Linky New · Tempo",
    "Mini-carte sur une ligne : couleur Tempo du jour et du lendemain, jours restants.",
  );
  register(
    "content-card-linky-new-production",
    "Carte Enedis Linky New · Production",
    "Production et bilan des échanges avec le réseau (injecté / soutiré), pour MyElectricalData new.",
  );
  console.info(`%c CARTE-ENEDIS-LINKY-NEW %c ${CARD_VERSION} `, "background:#96d21f;color:#1a2434;font-weight:700", "background:#1d93e3;color:#fff");
}

if (typeof module !== "undefined") module.exports = { MED };
