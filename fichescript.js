/* ==========================================================
   FICHE DE PERSONNAGE — système de niveaux (1 à 10)

   Ce script se charge UNE SEULE FOIS, sitewide, via "Gérer les codes
   JavaScript" (position "Partout") — exactement comme boutique.js,
   bestiaire.js et monnaie-script.js. Il injecte lui-même son propre
   style (voir FICHE_CSS plus bas, même principe que monnaie-script.js)
   et va chercher tout seul, sur CHAQUE page, tous les blocs
   <div class="fiche-progression"> qu'il trouve (voir initFiche() en
   bas de fichier) pour les remplir avec les données Firebase.

   Ça veut dire que là où tu colles le widget (campo18, sujet de
   forum...), tu n'as PLUS besoin d'y mettre de <link> ni de <script> :
   juste le <div class="fiche-progression">...</div> tout seul, en
   HTML "inerte" (aucune balise <script>/<link>). C'est fait exprès :
   certains champs de profil Forumactif laissent passer des balises
   basiques comme <div>/<span> mais filtrent les <script>/<link> pour
   des raisons de sécurité — en ne comptant plus du tout sur ces
   balises-là dans le champ, le widget fonctionne même dans ce cas.
   Voir fiche-campo18.html (le squelette à coller) et fiche-injection.js
   (le petit code "Partout" à coller une seule fois, sitewide).

   Trois façons de coller le squelette (voir fiche-campo18.html /
   fiche-contenu.html) :
   1. Dans le champ personnalisé "campo18" (Stats) du profil — chaque
      profil affiche alors SA PROPRE fiche, identifiée via l'URL /u...
   2. Dans le PREMIER MESSAGE d'un sujet de forum posté par le STAFF
      pour un joueur (ex. catégorie "Fiches de personnage", un sujet
      par joueur) : comme c'est le staff qui poste (donc l'auteur du
      message), on précise le joueur concerné à la main via l'attribut
      data-joueur="..." sur .fiche-progression — sinon la fiche
      s'identifierait au staff plutôt qu'au joueur. Le message doit
      quand même être posté en mode HTML (case "Activer le HTML pour
      ce message") pour que le <div> soit interprété comme un élément
      et non affiché en texte brut — mais comme il n'y a plus de
      <script>/<link> à l'intérieur, il n'y a plus rien d'exécutable à
      injecter depuis le message lui-même.
   3. Cas plus rare : sujet posté PAR LE JOUEUR LUI-MÊME (sans
      data-joueur) — la fiche est alors identifiée via l'auteur du
      premier message.
   Ne jamais laisser un membre normal poster en mode HTML (risque de
   sécurité, voir la note dans fiche-contenu.html) : même sans
   <script>/<link>, du HTML/CSS arbitraire reste un risque si n'importe
   qui peut l'activer sur ses propres messages.
   Le script détecte tout seul lequel des trois cas s'applique, voir
   ficheIdentifierPersonnage() plus bas.
   ========================================================== */

/* ------------------------------------------------------------------
   CONFIGURATION — à remplir une fois la base créée.
   Va sur https://console.firebase.google.com, crée un projet gratuit,
   ajoute une "Realtime Database" (mode test pour commencer), et colle
   ici l'URL affichée (ex: "https://mon-projet-default-rtdb.firebaseio.com").
   ------------------------------------------------------------------ */
const FICHE_FIREBASE_URL = "https://pathofdawn-fiches-default-rtdb.europe-west1.firebasedatabase.app";

/* Coût (en éclats) de CHAQUE palier, c'est-à-dire le prix pour passer
   du niveau juste en dessous à ce niveau-là (niveau 1 = gratuit, tout
   le monde commence là). */
const FICHE_COUTS_NIVEAU = {
  2: 50, 3: 100, 4: 150, 5: 200, 6: 250,
  7: 300, 8: 350, 9: 400, 10: 450
};
const FICHE_NIVEAU_MAX = 10;

/* Stats de départ (niveau 1, sans aucun équipement) et gain par niveau
   gagné. Pour l'instant ceci ne compte PAS l'équipement acheté à la
   boutique — voir la note en tête de fichier si ça évolue plus tard. */
const FICHE_PV_BASE_DEFAUT = 220;
const FICHE_DPS_BASE_DEFAUT = 110;
const FICHE_BONUS_PV_PAR_NIVEAU = 20;
const FICHE_BONUS_DPS_PAR_NIVEAU = 10;

/* Injecté nous-mêmes en JS au chargement (voir ficheInjecterStyle()
   plus bas) plutôt que via un <link> séparé — comme ça, l'endroit où
   tu colles le widget (campo18, message de sujet...) n'a besoin
   d'AUCUNE balise <link>/<script>, juste le <div class="fiche-progression">.
   Même famille visuelle bois/or que la boutique et la monnaie. */
const FICHE_CSS = `
/* ==========================================================
   FICHE DE PERSONNAGE — pathofdawn.forumactif.com
   Système de niveaux (1 à 10) intégré dans le champ personnalisé
   "campo18" (Stats) du profil. Même famille visuelle que la
   boutique (bois/or/rouge sombre) pour rester cohérent.
   ========================================================== */
:root {
  --fp-bg-bois: #1c140f;
  --fp-bg-bois-clair: #241a13;
  --fp-bg-etal: #2a1f18;
  --fp-text-main: #d3c4a9;
  --fp-text-muted: #8c7d6b;
  --fp-accent-gold: #c2a057;
  --fp-accent-red: #8f2d2d;
  --fp-accent-red-clair: #b23c3c;
  --fp-border-color: #3d2b1f;
  --fp-stat-pv: #8aab74;
  --fp-stat-dps: #b1524f;
  --fp-font-title: 'Cinzel', serif;
  --fp-font-body: 'Crimson Text', serif;
}

.fiche-progression,
.fiche-progression * {
  box-sizing: border-box !important;
  margin: 0;
  padding: 0;
  float: none !important;
}
.fiche-progression br { display: none !important; }

.fiche-progression {
  display: block !important;
  width: 100% !important;
  max-width: 680px !important;
  margin: 20px auto !important;
  background: linear-gradient(180deg, var(--fp-bg-bois) 0%, #150f0b 100%);
  color: var(--fp-text-main);
  font-family: var(--fp-font-body);
  line-height: 1.5;
  font-size: 1rem;
  padding: 20px;
  border: 1px solid var(--fp-border-color);
  border-radius: 4px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.9), inset 0 0 60px rgba(0,0,0,0.6);
  position: relative;
}

/* ---------- En-tête : badge de niveau + solde ---------- */
.fp-header {
  display: flex !important;
  align-items: center;
  gap: 16px;
  padding-bottom: 16px;
  margin-bottom: 16px !important;
  border-bottom: 1px solid var(--fp-border-color);
}

.fp-niveau-info { flex: 1 1 auto; min-width: 0; }
.fp-niveau-label {
  font-family: var(--fp-font-title);
  color: var(--fp-accent-gold);
  font-size: 1.15rem;
  letter-spacing: 0.5px;
}
.fp-solde {
  font-size: 0.9rem;
  color: var(--fp-text-muted);
  margin-top: 4px !important;
}
.fp-solde-val { color: var(--fp-accent-gold); font-weight: 600; }

/* ---------- Badge de niveau ----------
   Un seul gabarit (cercle + anneau + lueur), piloté par des variables
   CSS différentes selon le niveau (data-niveau="1" à "10") : de plus
   en plus riche/lumineux à mesure qu'on monte, sans avoir besoin
   d'une seule image à héberger. */
.fp-badge {
  --badge-taille: 64px;
  --badge-fond-1: #4a3a26;
  --badge-fond-2: #241a13;
  --badge-bordure: #5a4630;
  --badge-lueur: rgba(0,0,0,0);
  --badge-lueur-taille: 0px;
  --badge-anneaux: 0;

  flex: 0 0 var(--badge-taille);
  width: var(--badge-taille);
  height: var(--badge-taille);
  border-radius: 50% !important;
  background: radial-gradient(circle at 35% 30%, var(--badge-fond-1), var(--badge-fond-2)) !important;
  border: 3px solid var(--badge-bordure) !important;
  box-shadow:
    0 0 var(--badge-lueur-taille) var(--badge-lueur),
    inset 0 0 10px rgba(0,0,0,0.7) !important;
  position: relative;
  display: flex !important;
  align-items: center;
  justify-content: center;
  font-family: var(--fp-font-title);
  color: var(--fp-text-main);
  font-weight: 700;
  font-size: 1.2rem;
  transition: box-shadow 0.4s ease, border-color 0.4s ease;
}
.fp-badge::before {
  /* Anneau intérieur, qui n'apparaît qu'à partir du niveau 4 (voir
     --badge-anneaux plus bas) grâce à son opacity pilotée par la
     variable, plutôt que d'ajouter/retirer l'élément lui-même. */
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  border: 1px solid var(--badge-bordure);
  opacity: var(--badge-anneaux);
}
.fp-badge::after {
  /* Petite étoile, seulement visible sur les hauts niveaux (9-10),
     apparaît/disparaît via opacity, jamais retirée du DOM. */
  content: '\\2726';
  position: absolute;
  top: -8px;
  right: -4px;
  font-size: 0.8rem;
  color: var(--fp-accent-gold);
  opacity: 0;
  text-shadow: 0 0 6px rgba(194,160,87,0.9);
}

/* Paliers visuels : plus c'est haut, plus c'est lumineux/orné.
   1-3 bronze terne, 4-6 argent avec anneau, 7-9 or avec lueur,
   10 = version "complète" dorée/rouge qui pulse doucement. */
.fp-badge[data-niveau="1"] { --badge-fond-1:#4a3a26; --badge-fond-2:#221a12; --badge-bordure:#5a4630; }
.fp-badge[data-niveau="2"] { --badge-fond-1:#544028; --badge-fond-2:#241a13; --badge-bordure:#65502f; --badge-lueur:rgba(194,160,87,0.15); --badge-lueur-taille:4px; }
.fp-badge[data-niveau="3"] { --badge-fond-1:#5e4a2c; --badge-fond-2:#271d14; --badge-bordure:#755c34; --badge-lueur:rgba(194,160,87,0.25); --badge-lueur-taille:6px; }
.fp-badge[data-niveau="4"] { --badge-fond-1:#7c7a72; --badge-fond-2:#2a2925; --badge-bordure:#9a978c; --badge-lueur:rgba(200,200,200,0.25); --badge-lueur-taille:7px; --badge-anneaux:0.5; }
.fp-badge[data-niveau="5"] { --badge-fond-1:#8d8b82; --badge-fond-2:#2c2b27; --badge-bordure:#b4b0a2; --badge-lueur:rgba(210,210,210,0.35); --badge-lueur-taille:9px; --badge-anneaux:0.7; }
.fp-badge[data-niveau="6"] { --badge-fond-1:#a99a6e; --badge-fond-2:#2c2418; --badge-bordure:#c2a057; --badge-lueur:rgba(194,160,87,0.4); --badge-lueur-taille:10px; --badge-anneaux:0.85; }
.fp-badge[data-niveau="7"] { --badge-fond-1:#c2a057; --badge-fond-2:#33270f; --badge-bordure:#e0bc6c; --badge-lueur:rgba(194,160,87,0.55); --badge-lueur-taille:13px; --badge-anneaux:1; }
.fp-badge[data-niveau="8"] { --badge-fond-1:#d4b465; --badge-fond-2:#38290d; --badge-bordure:#f0d089; --badge-lueur:rgba(212,180,101,0.65); --badge-lueur-taille:16px; --badge-anneaux:1; }
.fp-badge[data-niveau="8"]::after,
.fp-badge[data-niveau="9"]::after,
.fp-badge[data-niveau="10"]::after { opacity: 1; }
.fp-badge[data-niveau="9"] { --badge-fond-1:#e0bc6c; --badge-fond-2:#3d1f12; --badge-bordure:#f0d089; --badge-lueur:rgba(178,60,60,0.55); --badge-lueur-taille:18px; --badge-anneaux:1; }
.fp-badge[data-niveau="10"] {
  --badge-fond-1:#f0d089; --badge-fond-2:#4a1c14; --badge-bordure:#ffe6a8;
  --badge-lueur:rgba(178,60,60,0.75); --badge-lueur-taille:22px; --badge-anneaux:1;
  animation: fpBadgePulse 2.4s ease-in-out infinite;
}
@keyframes fpBadgePulse {
  0%, 100% { box-shadow: 0 0 18px rgba(178,60,60,0.6), inset 0 0 10px rgba(0,0,0,0.7); }
  50%      { box-shadow: 0 0 30px rgba(212,180,101,0.9), inset 0 0 10px rgba(0,0,0,0.7); }
}

/* Petit éclat qui balaie le badge juste après un niveau gagné (même
   principe que la lueur des cartes de la boutique). */
.fp-badge.fp-levelup::before {
  animation: fpBadgeFlash 0.9s ease-out;
}
@keyframes fpBadgeFlash {
  0%   { box-shadow: inset 0 0 0 0 rgba(255,244,214,0); }
  30%  { box-shadow: inset 0 0 20px 6px rgba(255,244,214,0.9); }
  100% { box-shadow: inset 0 0 0 0 rgba(255,244,214,0); }
}

/* ---------- Statistiques (base + bonus de niveau) ---------- */
.fp-stats {
  display: flex !important;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px !important;
}
.fp-stat {
  flex: 1 1 220px;
  background: var(--fp-bg-etal);
  border: 1px solid var(--fp-border-color);
  border-radius: 4px;
  padding: 10px 14px;
}
.fp-stat-label {
  display: block !important;
  font-family: var(--fp-font-title);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--fp-text-muted);
  margin-bottom: 4px !important;
}
.fp-stat[data-type="pv"] .fp-stat-label { color: var(--fp-stat-pv); }
.fp-stat[data-type="dps"] .fp-stat-label { color: var(--fp-stat-dps); }
.fp-stat-total {
  font-family: var(--fp-font-title);
  font-size: 1.4rem;
  color: var(--fp-text-main);
}
.fp-stat-detail {
  display: block !important;
  font-size: 0.78rem;
  color: var(--fp-text-muted);
  margin-top: 4px !important;
}
.fp-pv-base,
.fp-dps-base { color: var(--fp-text-main); font-weight: 600; }
.fp-bonus { color: var(--fp-accent-gold); font-weight: 600; }

/* ---------- Boutons ---------- */
.fp-actions {
  display: flex !important;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px !important;
}
.fp-btn {
  font-family: var(--fp-font-title);
  font-size: 0.8rem;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 9px 16px;
  border-radius: 3px;
  border: 1px solid var(--fp-border-color);
  background: var(--fp-bg-etal);
  color: var(--fp-text-main);
  cursor: pointer;
  transition: all 0.2s ease;
}
.fp-btn:hover:not(:disabled) {
  border-color: var(--fp-accent-red-clair);
  color: #f0e6d2;
}
.fp-btn-acheter {
  background: var(--fp-accent-red);
  border-color: var(--fp-accent-red-clair);
  color: #f0e6d2;
}
.fp-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.fp-manque {
  font-size: 0.78rem;
  color: var(--fp-accent-red-clair);
  margin-bottom: 8px !important;
  min-height: 1.1em;
}

.fp-message {
  font-size: 0.85rem;
  font-style: italic;
  color: var(--fp-text-muted);
  min-height: 1.2em;
}
.fp-message.fp-ok { color: var(--fp-stat-pv); }
.fp-message.fp-erreur { color: var(--fp-accent-red-clair); }

.fp-lecture-seule {
  font-size: 0.85rem;
  color: var(--fp-text-muted);
  font-style: italic;
}
`;

function ficheInjecterStyle() {
  if (document.getElementById('fiche-style-injecte')) return;
  const style = document.createElement('style');
  style.id = 'fiche-style-injecte';
  style.textContent = FICHE_CSS;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------------
   Petits utilitaires
   ------------------------------------------------------------------ */

/* Détermine à QUEL PERSONNAGE appartient cette fiche, et son pseudo
   quand on peut l'avoir tout de suite — TROIS façons possibles, dans
   cet ordre de priorité :
   1. Un attribut "data-joueur" posé à la main sur le bloc
      .fiche-progression (voir fiche-contenu.html) : le staff y colle
      l'id ou l'URL du profil du joueur concerné au moment de créer
      son sujet. C'est la méthode à utiliser quand c'est le STAFF qui
      poste le sujet (donc qui en est l'auteur) — sans ça, la fiche
      s'identifierait au staff plutôt qu'au joueur.
   2. Sur une page de profil (".../u42"), comme au départ : l'id vient
      de l'URL, le pseudo du titre de la page ("Voir un profil - X").
   3. Sur un sujet de forum, à défaut des deux précédents : l'AUTEUR DU
      PREMIER MESSAGE du sujet — utile seulement si c'est vraiment le
      joueur lui-même qui a posté (rare si c'est le staff qui gère la
      création des sujets, voir la note de sécurité dans
      fiche-contenu.html à ce sujet). */
function ficheIdentifierPersonnage(racine) {
  const attribut = (racine.getAttribute('data-joueur') || '').trim();
  if (attribut) {
    const mUrl = attribut.match(/\/u(\d+)(?:[/?#]|$)/);
    const mNombre = attribut.match(/^(\d+)$/);
    const id = mUrl ? mUrl[1] : (mNombre ? mNombre[1] : null);
    if (id) return { id, pseudo: null }; // pseudo récupéré en tâche de fond, voir plus bas
  }

  const mUrl = location.pathname.match(/\/u(\d+)(?:[/?#]|$)/);
  if (mUrl) {
    const mTitre = document.title.match(/^Voir un profil - (.+)$/);
    return { id: mUrl[1], pseudo: mTitre ? mTitre[1].trim() : null };
  }

  const premierMessage = document.querySelector('.post');
  const lienAuteur = premierMessage
    ? premierMessage.querySelector('.post-tps-username a[href*="/u"]')
    : null;
  if (lienAuteur) {
    const m = (lienAuteur.getAttribute('href') || '').match(/\/u(\d+)(?:[/?#]|$)/);
    if (m) return { id: m[1], pseudo: lienAuteur.textContent.trim() };
  }

  return { id: null, pseudo: null };
}

/* Quand l'id vient de l'attribut data-joueur, on n'a pas le pseudo
   tout de suite (pas d'élément du DOM sous la main pour le lire) —
   on va le chercher en tâche de fond en récupérant la page de profil
   du joueur concerné, juste pour l'affichage lisible dans Firebase
   (aucun impact sur le fonctionnement si ça échoue). */
async function fichePseudoDepuisProfil(userId) {
  try {
    const res = await fetch('/u' + userId);
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<title>\s*Voir un profil - (.+?)\s*<\/title>/);
    return m ? m[1].trim() : null;
  } catch (e) {
    return null;
  }
}

/* L'id du joueur actuellement CONNECTÉ (celui qui regarde la page,
   pas forcément le propriétaire de la fiche) : repéré via le lien
   "Voir mon profil" du menu du forum, présent sur toutes les pages —
   même technique que monnaie-script.js. */
function ficheMonIdConnecte() {
  const liens = document.querySelectorAll('a[href*="/u"]');
  for (const a of liens) {
    if (a.textContent.trim().toLowerCase() === 'voir mon profil') {
      const m = (a.getAttribute('href') || '').match(/\/u(\d+)(?:[/?#]|$)/);
      if (m) return m[1];
    }
  }
  return null;
}

/* Vrai seulement si la personne qui regarde la page est bien la
   propriétaire de CETTE fiche (celle d'id "userId") :
   - Sur une page de profil, Forumactif n'affiche le lien "Éditer mon
     profil" (mode=editprofile) que sur son propre profil.
   - Sur un sujet de forum, ce lien n'existe pas : on compare plutôt
     l'id du joueur connecté avec celui du personnage de la fiche. */
function ficheEstProprietaire(userId) {
  if (document.querySelector('a[href*="mode=editprofile"]')) return true;
  const monId = ficheMonIdConnecte();
  return !!(monId && userId && monId === userId);
}

async function ficheChargerDonnees(userId) {
  if (!FICHE_FIREBASE_URL || FICHE_FIREBASE_URL.indexOf('COLLE-ICI') !== -1) {
    throw new Error('FIREBASE_NON_CONFIGURE');
  }
  const res = await fetch(FICHE_FIREBASE_URL + '/personnages/' + userId + '.json');
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
  const data = await res.json();
  return {
    niveau: (data && data.niveau) || 1,
    pvBase: (data && typeof data.pvBase === 'number') ? data.pvBase : FICHE_PV_BASE_DEFAUT,
    dpsBase: (data && typeof data.dpsBase === 'number') ? data.dpsBase : FICHE_DPS_BASE_DEFAUT,
    /* "solde" est désormais un vrai porte-monnaie géré par nous (voir
       monnaie-script.js, qui l'alimente à chaque message posté dans
       une zone de RP) : on le dépense directement à chaque achat de
       niveau, ce n'est plus un calcul "total gagné - coût cumulé". */
    solde: (data && typeof data.solde === 'number') ? data.solde : 0,
    pseudo: (data && typeof data.pseudo === 'string') ? data.pseudo : null
  };
}

async function ficheSauvegarder(userId, partiel) {
  const res = await fetch(FICHE_FIREBASE_URL + '/personnages/' + userId + '.json', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partiel)
  });
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
}

/* ------------------------------------------------------------------
   Mise en place d'une instance de fiche
   ------------------------------------------------------------------ */
function initFicheInstance(racine) {
  const identification = ficheIdentifierPersonnage(racine);
  const userId = identification.id;
  const proprietaire = ficheEstProprietaire(userId);

  const badge = racine.querySelector('.fp-badge');
  const niveauNum = racine.querySelector('.fp-niveau-num');
  const soldeVal = racine.querySelector('.fp-solde-val');
  const pvTotalEl = racine.querySelector('[data-type="pv"] .fp-stat-total');
  const dpsTotalEl = racine.querySelector('[data-type="dps"] .fp-stat-total');
  const pvBonusEl = racine.querySelector('[data-type="pv"] .fp-bonus');
  const dpsBonusEl = racine.querySelector('[data-type="dps"] .fp-bonus');
  const pvBaseEl = racine.querySelector('.fp-pv-base');
  const dpsBaseEl = racine.querySelector('.fp-dps-base');
  const btnAcheter = racine.querySelector('.fp-btn-acheter');
  const coutSuivantEl = racine.querySelector('.fp-cout-suivant');
  const labelNormal = racine.querySelector('.fp-label-normal');
  const labelMax = racine.querySelector('.fp-label-max');
  const manqueEl = racine.querySelector('.fp-manque');
  const messageEl = racine.querySelector('.fp-message');
  const zonesEdition = racine.querySelectorAll('.fp-edition');

  if (!userId) {
    if (messageEl) messageEl.textContent = "Impossible de déterminer le personnage (ni page de profil, ni sujet avec un premier message identifiable).";
    return;
  }

  // Un visiteur (pas le propriétaire) ne voit pas le bouton d'achat :
  // juste le résultat, en lecture seule.
  if (!proprietaire) zonesEdition.forEach((el) => el.remove());

  let etat = { niveau: 1, pvBase: 0, dpsBase: 0 };

  function afficherMessage(texte, type) {
    if (!messageEl) return;
    messageEl.textContent = texte;
    messageEl.className = 'fp-message' + (type ? ' fp-' + type : '');
  }

  function rafraichirAffichage() {
    if (badge) badge.setAttribute('data-niveau', String(etat.niveau));
    if (niveauNum) niveauNum.textContent = String(etat.niveau);

    const bonusPv = (etat.niveau - 1) * FICHE_BONUS_PV_PAR_NIVEAU;
    const bonusDps = (etat.niveau - 1) * FICHE_BONUS_DPS_PAR_NIVEAU;
    if (pvBonusEl) pvBonusEl.textContent = '+' + bonusPv;
    if (dpsBonusEl) dpsBonusEl.textContent = '+' + bonusDps;
    if (pvTotalEl) pvTotalEl.textContent = String((etat.pvBase || 0) + bonusPv);
    if (dpsTotalEl) dpsTotalEl.textContent = String((etat.dpsBase || 0) + bonusDps);
    if (pvBaseEl) pvBaseEl.textContent = String(etat.pvBase || 0);
    if (dpsBaseEl) dpsBaseEl.textContent = String(etat.dpsBase || 0);

    const soldeDisponible = etat.solde || 0;
    if (soldeVal) soldeVal.textContent = String(soldeDisponible);

    if (btnAcheter) {
      /* On bascule entre les deux libellés via "hidden" plutôt qu'en
         réécrivant le texte du bouton : remplacer tout le contenu par
         du texte brut détruirait définitivement le <span> qui affiche
         le coût, et il ne réapparaîtrait plus jamais ensuite (bug vu
         en testant le passage niveau max -> retour en arrière). */
      if (etat.niveau >= FICHE_NIVEAU_MAX) {
        if (labelNormal) labelNormal.hidden = true;
        if (labelMax) labelMax.hidden = false;
        btnAcheter.disabled = true;
        if (manqueEl) manqueEl.textContent = '';
      } else {
        const coutSuivant = FICHE_COUTS_NIVEAU[etat.niveau + 1];
        if (coutSuivantEl) coutSuivantEl.textContent = coutSuivant;
        if (labelNormal) labelNormal.hidden = false;
        if (labelMax) labelMax.hidden = true;
        const assezDeSolde = soldeDisponible >= coutSuivant;
        btnAcheter.disabled = !assezDeSolde;
        /* Un bouton désactivé ne déclenche jamais de clic, donc le
           message d'erreur du gestionnaire de clic ("pas assez
           d'éclats...") ne s'affiche jamais dans ce cas — d'où ce
           petit texte à part, toujours visible, qui explique la
           situation même sans avoir cliqué (bug remonté : le bouton
           grisé ne donnait aucune explication). */
        if (manqueEl) {
          manqueEl.textContent = assezDeSolde ? '' : ('Il te manque ' + (coutSuivant - soldeDisponible) + ' éclats pour ce niveau.');
        }
      }
    }
  }

  ficheChargerDonnees(userId)
    .then((donnees) => {
      etat = donnees;
      rafraichirAffichage();
      // Garde le pseudo à jour dans Firebase, juste pour que ce soit
      // lisible d'un coup d'œil dans la console (aucun impact sur le
      // fonctionnement) : on n'écrit que si ça a changé.
      if (identification.pseudo) {
        if (identification.pseudo !== donnees.pseudo) {
          ficheSauvegarder(userId, { pseudo: identification.pseudo }).catch(() => {});
        }
      } else {
        // Cas "data-joueur" : pas de pseudo sous la main tout de
        // suite, on va le chercher en tâche de fond.
        fichePseudoDepuisProfil(userId).then((pseudo) => {
          if (pseudo && pseudo !== donnees.pseudo) {
            ficheSauvegarder(userId, { pseudo }).catch(() => {});
          }
        });
      }
    })
    .catch((err) => {
      if (err && err.message === 'FIREBASE_NON_CONFIGURE') {
        afficherMessage("Base non configurée : remplace FICHE_FIREBASE_URL en haut du script.", 'erreur');
      } else {
        afficherMessage("Impossible de charger la fiche pour le moment, réessaie plus tard.", 'erreur');
      }
      rafraichirAffichage();
    });

  if (btnAcheter) {
    btnAcheter.addEventListener('click', async () => {
      /* Comme l'initialisation peut se déclencher plusieurs fois (voir
         le filet de sécurité en bas de fichier), plusieurs "instances"
         indépendantes peuvent écouter ce même bouton, chacune avec son
         propre "etat" en mémoire. Si on se basait sur cet "etat" local
         pour décider quoi écrire, deux instances légèrement désynchro-
         nisées pourraient se marcher dessus et faire redescendre le
         niveau sauvegardé au lieu de l'augmenter. Pour éviter ça, on
         relit le niveau ACTUEL directement depuis la base juste avant
         d'agir : chaque déclenchement (même redondant) part alors de
         la même vérité et aboutit au même résultat correct. */
      btnAcheter.disabled = true;
      let donneesActuelles;
      try {
        donneesActuelles = await ficheChargerDonnees(userId);
      } catch (e) {
        afficherMessage('Impossible de vérifier ton niveau actuel, réessaie.', 'erreur');
        btnAcheter.disabled = false;
        return;
      }
      const niveauActuel = donneesActuelles.niveau;
      const soldeActuel = donneesActuelles.solde || 0;

      if (niveauActuel >= FICHE_NIVEAU_MAX) {
        etat.niveau = niveauActuel;
        etat.solde = soldeActuel;
        rafraichirAffichage();
        return;
      }

      const prochainNiveau = niveauActuel + 1;
      const cout = FICHE_COUTS_NIVEAU[prochainNiveau];

      if (soldeActuel < cout) {
        afficherMessage('Pas assez d\'éclats : il en faut ' + cout + ', solde disponible ' + soldeActuel + '.', 'erreur');
        etat.niveau = niveauActuel;
        etat.solde = soldeActuel;
        rafraichirAffichage();
        return;
      }

      /* On dépense vraiment le solde ici (ce n'était pas possible avec
         le compteur natif d'éclats, qu'on ne peut pas modifier depuis
         le navigateur du joueur) : le porte-monnaie descend de "cout"
         au moment même de l'achat. */
      const nouveauSolde = soldeActuel - cout;

      try {
        await ficheSauvegarder(userId, { niveau: prochainNiveau, solde: nouveauSolde });
        etat.niveau = prochainNiveau;
        etat.solde = nouveauSolde;
        rafraichirAffichage();
        afficherMessage('Niveau ' + prochainNiveau + ' débloqué !', 'ok');
        if (badge) {
          badge.classList.remove('fp-levelup');
          void badge.offsetWidth;
          badge.classList.add('fp-levelup');
        }
      } catch (e) {
        afficherMessage("Échec de l'achat, réessaie.", 'erreur');
        rafraichirAffichage();
      }
    });
  }
}

function initFiche() {
  ficheInjecterStyle();
  document.querySelectorAll('.fiche-progression').forEach(initFicheInstance);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFiche);
} else {
  initFiche();
}
window.addEventListener('load', initFiche);
setTimeout(initFiche, 1000);
setTimeout(initFiche, 3000);
