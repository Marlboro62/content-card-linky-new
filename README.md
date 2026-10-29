<p>
  ☕ <strong>Si cette carte vous est utile, vous pouvez soutenir le projet :</strong>
</p>

<div style="white-space: nowrap; line-height: 0;">
  <a
    href="https://www.buymeacoffee.com/Marlboro62"
    target="_blank"
    rel="noopener noreferrer"
    style="display: inline-block; text-decoration: none; vertical-align: middle;"
  ><img
    src="https://img.buymeacoffee.com/button-api/?text=Offrir%20un%20caf%C3%A9&emoji=%E2%98%95&slug=Marlboro62&button_colour=FF5F5F&font_colour=ffffff&font_family=Cookie&outline_colour=000000&coffee_colour=FFDD00"
    alt="Offrir un café sur Buy Me a Coffee"
    height="45"
    style="display: block; border: 0;"
  ></a>&nbsp;&nbsp;<a
    href="https://ko-fi.com/M4M2QL45X"
    target="_blank"
    rel="noopener noreferrer"
    style="display: inline-block; text-decoration: none; vertical-align: middle;"
  ><img
    src="https://storage.ko-fi.com/cdn/kofi6.png?v=6"
    alt="Soutenir le projet sur Ko-fi"
    height="45"
    style="display: block; border: 0;"
  ></a>
</div>

# Carte Enedis Linky New

Cartes Lovelace pour **[MyElectricalData new](https://github.com/MyElectricalData/myelectricaldata_new)** (mode client), dans le style de l'interface MyElectricalData :

- **Carte Enedis Linky New** : consommation Linky, heures creuses / heures pleines, Tempo, coût estimé et puissance maximale ;
- **Carte Enedis Linky New · Production** (depuis la 0.3.0) : production, ou bilan des échanges avec le réseau (injecté / soutiré), pour les installations solaires ;
- **Carte Enedis Linky New · Tempo** (depuis la 0.5.0) : mini-carte sur une ligne, couleur Tempo du jour et du lendemain et jours restants.

![Carte Enedis Linky New](https://raw.githubusercontent.com/Marlboro62/content-card-linky-new/main/images/apercu.png)

🎮 **[Essayer la démo en ligne](https://marlboro62.github.io/content-card-linky-new/docs/demo.html)** : les vraies cartes (consommation, production, bilan, mini Tempo) avec des données simulées, sans installer Home Assistant.

Elle reprend l'esprit de [content-card-linky](https://github.com/MyElectricalData/content-card-linky), réécrite pour les entités publiées par l'export Home Assistant de MyElectricalData new. Pour l'add-on MyElectricalData **v1**, utilisez content-card-linky.

## 🧩 Fait partie de l'écosystème MyElectricalData new

Ces projets sont **non officiels**, maintenus par Marlboro62, sans lien avec l'équipe MyElectricalData. Ils s'appuient sur le [mode client de MyElectricalData new](https://github.com/MyElectricalData/myelectricaldata_new), relié à la passerelle [www.v2.myelectricaldata.fr](https://www.v2.myelectricaldata.fr).

| Projet | Rôle |
| --- | --- |
| [Add-on Home Assistant](https://github.com/Marlboro62/hassio-addons) | Installe le mode client dans Home Assistant (interface web, synchro Linky/Tempo, PostgreSQL intégré) |
| [Script Proxmox (LXC)](https://github.com/Marlboro62/myelectricaldata-proxmox) | Déploie le mode client dans un conteneur LXC Proxmox, sans Docker |
| **Cartes Lovelace (ce dépôt)** | Affichent conso, Tempo, coût, puissance max, production et bilan dans un tableau de bord Home Assistant |
| [Carte Linky Appareils](https://github.com/Marlboro62/linky-appareils-card) | Coûts par circuit et par appareil (jour, mois, cycle), au tarif en cours |
| [Carte Linky Solaire](https://github.com/Marlboro62/linky-solaire-card) | Produit, importé et exporté jour par jour, autoconsommation |
| [Dashboards Grafana](https://github.com/Marlboro62/myelectricaldata-new-grafana) | Analyse la base PostgreSQL de l'add-on (Linky, Tempo, coûts) |

## Ce qu'affiche la carte

- la couleur Tempo d'aujourd'hui et de demain, et les jours restants par couleur ;
- la consommation de la veille, son évolution, le coût estimé et la répartition HC / HP ;
- le mois en cours, le mois dernier, l'année en cours et la part d'heures pleines, avec la comparaison à l'année précédente ; en option (`show_week`), la semaine en cours et la semaine dernière ;
- un graphique des 7, 14 ou 31 derniers jours (HC et HP empilés, jours colorés selon Tempo) ; un clic sur un jour affiche son détail ;
- la puissance maximale de la période, comparée à la puissance souscrite ;
- EcoWatt, uniquement quand des données sont disponibles.

Les données pas encore publiées par Enedis sont signalées comme telles, au lieu d'afficher `-1`.

## Prérequis

- MyElectricalData new en mode client (Docker, [add-on Home Assistant](https://github.com/Marlboro62/hassio-addons) ou [script Proxmox](https://github.com/Marlboro62/myelectricaldata-proxmox)) ;
- l'export **Home Assistant** activé dans l'interface MyElectricalData (page Home Assistant : URL de Home Assistant et jeton d'accès longue durée) ;
- une **offre** sélectionnée sur la carte de votre PDL dans l'interface MyElectricalData, pour que les prix soient publiés.

L'export crée notamment `sensor.linky_<pdl>_consumption`, `sensor.rte_tempo_today`, `sensor.rte_tempo_tomorrow`, `sensor.edf_tempo_info` et les prix `sensor.edf_tempo_price_*`.

Selon la version de Home Assistant, ces entités peuvent aussi s'appeler `sensor.myelectricaldata_tempo_today`, `sensor.myelectricaldata_tempo_info`, `sensor.myelectricaldata_tempo_price_*`, `sensor.myelectricaldata_ecowatt_j0`… La carte utilise automatiquement le nom qui existe chez vous, même si l'éditeur visuel a enregistré les noms par défaut dans la configuration.

## Installation

### Avec HACS

1. HACS, menu ⋮, **Dépôts personnalisés**.
2. Ajoutez `https://github.com/Marlboro62/content-card-linky-new`, catégorie **Tableau de bord** (Dashboard).
3. Installez **Carte Enedis Linky New**, puis rechargez la page (Ctrl+F5).

### Manuellement

1. Téléchargez [`content-card-linky-new.js`](https://raw.githubusercontent.com/Marlboro62/content-card-linky-new/main/content-card-linky-new.js) (clic droit → Enregistrer sous) et copiez-le dans `/config/www/`.
2. **Paramètres → Tableaux de bord → ⋮ → Ressources → Ajouter** : URL `/local/content-card-linky-new.js?v=0.5.0`, type **Module JavaScript**.
3. Rechargez la page (Ctrl+F5). Changez le `?v=` à chaque mise à jour du fichier.

> **Vous utilisiez la version 0.2.2 ou antérieure ?** Le fichier s'appelle désormais `content-card-linky-new.js` et le type `custom:content-card-linky-new`. L'ancien type `custom:content-card-linky-v2` reste reconnu : vos tableaux de bord continuent de fonctionner. En installation manuelle, remplacez l'ancienne ressource `/local/content-card-linky-v2.js` par la nouvelle.

## Configuration

La carte se configure avec l'éditeur visuel, ou en YAML :

```yaml
type: custom:content-card-linky-new
entity: sensor.linky_<pdl>_consumption
days: 14
subscribed_power: 6
theme: v2
```

| Option | Défaut | Description |
|---|---|---|
| `entity` | obligatoire | Capteur de consommation `sensor.linky_<pdl>_consumption` |
| `title` | `Linky` | Titre affiché |
| `days` | `14` | Historique du graphique : `7`, `14` ou `31` jours |
| `subscribed_power` | aucun | Puissance souscrite en kVA (celle du compteur), pour la jauge de puissance maximale |
| `subscription_price` | aucun | Abonnement mensuel TTC en €/mois : ajouté au coût de chaque jour, au prorata des jours du mois (18,36 € en octobre : 0,59 € par jour) |
| `hc_price`, `hp_price` | aucun | Prix du kWh TTC en heures creuses et pleines (€/kWh), pour un contrat dont les prix ne sont pas dans MyElectricalData. Remplacent les prix de l'offre et les prix Tempo pour le calcul du coût |
| `base_price` | aucun | Prix du kWh TTC pour une option Base (€/kWh), utilisé si `hc_price` / `hp_price` ne sont pas renseignés |
| `theme` | `v2` | `v2` : style bleu nuit de l'interface MyElectricalData (valeur conservée pour compatibilité) ; `auto` : style MyElectricalData, bleu nuit quand Home Assistant est en mode sombre et clair en mode clair ; `ha` : couleurs du thème Home Assistant |
| `show_cost` | `true` | Afficher les coûts estimés |
| `show_pdl` | `true` | Afficher le numéro de PDL sous le titre |
| `show_tempo` | `true` | Afficher Tempo : couleurs d'aujourd'hui et de demain, jours restants et pastilles de couleur sous le graphique. Mettre `false` pour masquer tout l'affichage Tempo (le calcul des coûts n'est pas modifié) |
| `show_week` | `false` | Ajouter deux tuiles : **semaine en cours** (du lundi à hier, comparée à la même période de la semaine dernière) et **semaine dernière** (lundi à dimanche) |
| `tempo_today` | `sensor.rte_tempo_today` | Couleur Tempo du jour |
| `tempo_tomorrow` | `sensor.rte_tempo_tomorrow` | Couleur Tempo du lendemain |
| `tempo_info` | `sensor.edf_tempo_info` | Jours Tempo restants. Selon l'installation, l'entité peut s'appeler `sensor.edf_tempo_tempo_info` : la carte essaie les deux noms si celui-ci n'existe pas |
| `ecowatt` | `sensor.rte_ecowatt_j0` | Signal EcoWatt (bloc masqué si indisponible) |
| `price_prefix` | `sensor.edf_tempo_price_` | Préfixe des capteurs de prix Tempo (`sensor.myelectricaldata_tempo_price_` essayé automatiquement si les premiers n'existent pas) |
| `hc_color` | `#4a7bd8` (bleu) | Couleur des heures creuses : graphique, barre HC/HP, légende et détail du jour. Code `"#1e88e5"` (entre guillemets en YAML), `[r, g, b]`, `rgb(...)` ou nom de couleur CSS |
| `hp_color` | `#d27333` (orange) | Couleur des heures pleines, mêmes formats que `hc_color` |
| `base_color` | `hc_color` (bleu) | Couleur des barres du graphique pour un **contrat Base** (sans heures creuses / pleines), mêmes formats que `hc_color` |
| `hc_blue_color`, `hp_blue_color` | `hc_color`, `hp_color` | Couleurs HC et HP des **jours bleus** (contrat Tempo) |
| `hc_white_color`, `hp_white_color` | `hc_color`, `hp_color` | Couleurs HC et HP des **jours blancs** |
| `hc_red_color`, `hp_red_color` | `hc_color`, `hp_color` | Couleurs HC et HP des **jours rouges** |

### Couleurs des heures creuses et pleines

Dans l'éditeur visuel, chaque couleur se choisit sur une **roue de couleurs** (comme celle des lumières de Home Assistant) : la teinte autour du cercle, une couleur plus pâle vers le centre, et un curseur de **luminosité**. Le code de la couleur s'affiche dans un champ, où l'on peut aussi le saisir, et le bouton **Couleur par défaut** revient au bleu et à l'orange d'origine (l'option disparaît alors du YAML).


**Contrat Tempo : six couleurs.** Dans l'éditeur, la case **Couleurs selon la couleur Tempo du jour** ajoute six roues : HC et HP des jours bleus, blancs et rouges. Chaque barre du graphique et la barre HC/HP du jour prennent les couleurs de leur jour Tempo, et la légende affiche une paire HC / HP par couleur présente sur la période. Une couleur non réglée reprend `hc_color` / `hp_color` ; décocher la case retire les six options.

**Contrat Base.** Sans heures creuses ni pleines, la carte le détecte seule : les barres du graphique prennent `base_color` (bleu par défaut) au lieu du gris des jours en attente, la légende affiche « Base » et la carte n'annonce plus de détail HC/HP.

```yaml
type: custom:content-card-linky-new
entity: sensor.linky_<pdl>_consumption
hc_blue_color: "#7fb3ff"
hp_blue_color: "#0047ab"
hc_white_color: "#e0e0e0"
hp_white_color: "#8a8a8a"
hc_red_color: "#ff9e9e"
hp_red_color: "#c00000"
```

Pour essayer sans rien installer : [démo en ligne](https://marlboro62.github.io/content-card-linky-new/docs/demo.html), réglage **Couleurs HC / HP** → **Choisies avec la roue**. Le texte du détail HC/HP reprend la teinte choisie en restant lisible sur le fond de la carte.

```yaml
type: custom:content-card-linky-new
entity: sensor.linky_<pdl>_consumption
hc_color: "#1e88e5"
hp_color: "#e53935"
```

## Mini-carte Tempo

Une ligne, pour le haut d'un tableau de bord ou un téléphone : couleur Tempo d'aujourd'hui et de demain, et jours restants par couleur. Elle est incluse dans le même fichier, sans ressource à ajouter.

```yaml
type: custom:content-card-linky-new-tempo
```

| Option | Défaut | Description |
|---|---|---|
| `tempo_today` | `sensor.rte_tempo_today` | Couleur Tempo du jour |
| `tempo_tomorrow` | `sensor.rte_tempo_tomorrow` | Couleur Tempo du lendemain |
| `tempo_info` | `sensor.edf_tempo_info` | Jours restants (`sensor.edf_tempo_tempo_info` essayé aussi automatiquement) |
| `show_remaining` | `true` | Afficher les jours restants |
| `theme` | `v2` | `v2`, `auto` ou `ha`, comme les autres cartes |

## Carte Production et bilan

Le même fichier fournit une deuxième carte, `custom:content-card-linky-new-production`, pour les points de livraison qui ont de la production (panneaux solaires…). Pas de ressource à ajouter : elle est disponible dès que la carte de consommation est installée.

L'export Home Assistant de MyElectricalData crée le capteur `sensor.linky_<pdl>_production` **uniquement si votre PDL a de la production**.

**Mode `production`** : production de la veille et son évolution, pic d'injection, mois en cours (avec projection), mois dernier, année, meilleur jour, graphique des 7, 14 ou 31 derniers jours, et revenu estimé si vous indiquez un prix de rachat.

<p align="center"><img src="https://raw.githubusercontent.com/Marlboro62/content-card-linky-new/main/images/production-reelle.jpg" alt="Carte Production avec de vraies données" width="360"></p>
<p align="center"><sub>Carte Production avec de vraies données, capture partagée par <a href="https://github.com/Userfreedu42">@Userfreedu42</a> (merci !).</sub></p>

```yaml
type: custom:content-card-linky-new-production
entity: sensor.linky_<pdl>_production
sale_price: 0.04
```

**Mode `bilan`** : énergie injectée et soutirée, solde réseau du jour, du mois et de l'année, et graphique des deux sens (injecté au-dessus, soutiré en dessous).

```yaml
type: custom:content-card-linky-new-production
mode: bilan
entity: sensor.linky_<pdl>_production
consumption_entity: sensor.linky_<pdl>_consumption
```

| Option | Défaut | Description |
|---|---|---|
| `entity` | obligatoire | Capteur de production `sensor.linky_<pdl>_production` |
| `mode` | `production` | `production` ou `bilan` |
| `consumption_entity` | aucun | Capteur de consommation, **obligatoire en mode `bilan`** |
| `title` | `Production` / `Bilan réseau` | Titre affiché |
| `days` | `14` | Historique du graphique : `7`, `14` ou `31` jours |
| `sale_price` | aucun | Prix de rachat en €/kWh, pour estimer le revenu (mode `production`) |
| `theme` | `v2` | `v2`, `auto` ou `ha`, comme la carte de consommation |
| `show_pdl` | `true` | Afficher le numéro de PDL sous le titre |

> ⚠️ **Ce que mesure Enedis** : le compteur Linky ne voit que les échanges avec le réseau. Avec un contrat de **vente du surplus**, la « production » est l'énergie **injectée** (le surplus), pas la production totale des panneaux ; avec la **vente totale**, c'est bien toute la production. L'énergie produite et consommée sur place (autoconsommation) n'est pas visible par Enedis : pour la mesurer, il faut un capteur côté onduleur. Le mode `bilan` montre donc le solde des échanges avec le réseau, pas votre autoconsommation.

## À savoir

- **Coût estimé**, hors abonnement sauf si `subscription_price` est renseigné :
  - **prix saisis dans la carte** (`hc_price` + `hp_price`, ou `base_price`) : ils sont prioritaires, pour un contrat dont les prix ne sont pas dans MyElectricalData (par exemple un Zen Fixe souscrit avant la grille actuelle) ;
  - **offre avec prix HC / HP ou Base** (Zen Fixe, Tarif Bleu…) : coût calculé par MyElectricalData avec l'offre choisie sur le PDL (attribut `dailyweek_cost`). Pour un prix différent de la grille actuelle (contrat souscrit plus tôt), choisir la bonne grille dans MyElectricalData, case « Afficher les offres obsolètes » ;
  - **Tempo** : calculé par la carte (HC et HP du jour multipliés par le prix Tempo de la couleur du jour). Les heures creuses de 0 h à 6 h appartiennent en réalité au jour Tempo de la veille : l'estimation peut donc légèrement différer de la facture.
- **Jours Tempo restants** : calculés à partir du quota et des jours utilisés.
- **Cumuls annuels** : calculés par MyElectricalData en année civile.

## Licence

MIT. Merci à [saniho](https://github.com/saniho/content-card-linky) et à l'équipe [MyElectricalData](https://github.com/MyElectricalData) pour content-card-linky, dont cette carte s'inspire.
