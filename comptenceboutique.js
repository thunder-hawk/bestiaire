/* ==========================================================
   BOUTIQUE DES COMPÉTENCES — script
   ==========================================================
   Poste séparé de la boutique d'équipement (boutique-script.js) mais
   qui tourne sur les MÊMES pages (script sitewide, "Partout") : tous
   les noms de fonctions/classes sont donc préfixés "cshop" pour ne
   jamais entrer en collision avec l'autre boutique.

   Rôle de ce poste : c'est ICI, et UNIQUEMENT ici, qu'un joueur peut
   ACQUÉRIR une compétence (passage du niveau 0 au niveau 1). Une fois
   équipée, la suite de la progression (niveau 2 à 6) se fait sur la
   fiche de personnage (fiche-script.js), pas ici — ce poste ne vend
   donc chaque compétence qu'une seule fois par personnage.

   Conditions vérifiées avant de laisser équiper une compétence :
   1. Le joueur doit être identifié (connecté, via le lien "Voir mon
      profil" du forum — même technique que fiche-script.js et
      boutique-script.js).
   2. Il doit déjà avoir choisi une spécialité (archétype Guerrier ou
      Mage) sur sa fiche — sans ça, aucune catégorie n'est autorisée.
      (Le niveau 1 d'une compétence est toujours acceptable une fois
      un archétype choisi, quelle que soit la catégorie : c'est
      seulement à partir du niveau 2, sur la fiche, que le plafond
      "secondaire" (3) entre en jeu.)
   3. Il ne doit pas déjà posséder cette compétence (une seule
      acquisition possible ; la ré-acquisition n'existe pas, seule
      l'évolution sur la fiche fait progresser un niveau déjà acquis).
   4. Pour une compétence "Exclusif <race>" (ex: Runes Tonnerre =
      Nain, Nature Elfique = Elfe), sa race (assignée à la main par le
      staff dans Firebase, jamais par le joueur) doit correspondre.
   5. Il doit avoir assez d'éclats (prix fixe, identique pour toutes
      les compétences : voir CSHOP_PRIX_NIVEAU_1, doit rester égal à
      COUTS_COMPETENCE[1] dans fiche-script.js).
   ========================================================== */

/* Même base Firebase que fiche-script.js / boutique-script.js. */
const CSHOP_FIREBASE_URL = "https://pathofdawn-fiches-default-rtdb.europe-west1.firebasedatabase.app";

/* Prix fixe du niveau 1, identique pour toutes les compétences — doit
   rester en phase avec COUTS_COMPETENCE[1] dans fiche-script.js si tu
   changes un jour la grille de prix. */
const CSHOP_PRIX_NIVEAU_1 = 20;

/* ------------------------------------------------------------------
   Petits utilitaires
   ------------------------------------------------------------------ */

/* L'id du joueur actuellement CONNECTÉ — même technique que
   fiche-script.js / boutique-script.js / monnaie-script.js. */
function cshopMonIdConnecte() {
  const liens = document.querySelectorAll('a[href*="/u"]');
  for (const a of liens) {
    if (a.textContent.trim().toLowerCase() === 'voir mon profil') {
      const m = (a.getAttribute('href') || '').match(/\/u(\d+)(?:[/?#]|$)/);
      if (m) return m[1];
    }
  }
  return null;
}

async function cshopChargerPersonnage(userId) {
  const res = await fetch(CSHOP_FIREBASE_URL + '/personnages/' + userId + '.json');
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
  const data = await res.json();
  return {
    solde: (data && typeof data.solde === 'number') ? data.solde : 0,
    archetype: (data && (data.archetype === 'guerrier' || data.archetype === 'mage')) ? data.archetype : null,
    race: (data && typeof data.race === 'string') ? data.race : '',
    competences: (data && data.competences && typeof data.competences === 'object') ? data.competences : {}
  };
}

/* Notation "chemin/avec/slash" (voir la même remarque dans
   boutique-script.js et fiche-script.js) : ne touche QUE le solde et
   CETTE compétence, sans effacer les autres compétences déjà
   possédées par ailleurs. */
async function cshopSauvegarder(userId, partiel) {
  const res = await fetch(CSHOP_FIREBASE_URL + '/personnages/' + userId + '.json', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partiel)
  });
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
}

/* Compare la race (texte libre entré à la main par le staff, casse et
   accents quelconques) à l'id technique attendu ('nain' / 'elfe') :
   on met tout en minuscules et on retire les accents pour que "Nain",
   "nain " ou "NAIN" soient tous reconnus pareil. */
function cshopNormaliserRace(texte) {
  return String(texte || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function cshopCapitaliser(texte) {
  const t = String(texte || '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function cshopDeclencherBrillance(card) {
  card.classList.remove('brillance');
  void card.offsetWidth;
  card.classList.add('brillance');
}

/* ------------------------------------------------------------------
   État d'une carte (bouton + petit texte de statut)
   ------------------------------------------------------------------ */
function cshopAfficherStatut(statutEl, texte, type) {
  statutEl.textContent = texte;
  statutEl.className = 'cshop-statut' + (type ? ' cshop-statut-' + type : '');
}

/* Recalcule si le bouton "Équiper" d'une carte doit être activé ou
   non, et pourquoi, à partir des données ACTUELLES du joueur — utilisé
   à la fois au chargement de la page (pré-affichage) et juste avant
   d'écrire dans Firebase au clic (double vérification, voir plus
   bas). Retourne true si l'acquisition est possible (tout est bon). */
function cshopEvaluerCarte(card, donnees) {
  const btn = card.querySelector('.cshop-btn-equiper');
  const statutEl = card.querySelector('.cshop-statut');
  if (!btn || !statutEl) return false;

  const id = card.getAttribute('data-competence-id');
  const raceExclusive = card.getAttribute('data-race-exclusive') || '';
  const niveauActuel = (donnees.competences && donnees.competences[id]) || 0;

  if (niveauActuel > 0) {
    btn.disabled = true;
    cshopAfficherStatut(statutEl, 'Déjà équipée — fais-la évoluer sur ta fiche.', 'equipe');
    return false;
  }

  if (!donnees.archetype) {
    btn.disabled = true;
    cshopAfficherStatut(statutEl, "Choisis d'abord ta spécialité (Guerrier/Mage) sur ta fiche.", 'erreur');
    return false;
  }

  if (raceExclusive && cshopNormaliserRace(donnees.race) !== raceExclusive) {
    btn.disabled = true;
    cshopAfficherStatut(statutEl, 'Exclusif ' + cshopCapitaliser(raceExclusive) + '.', 'erreur');
    return false;
  }

  if ((donnees.solde || 0) < CSHOP_PRIX_NIVEAU_1) {
    btn.disabled = true;
    cshopAfficherStatut(statutEl, 'Il manque ' + (CSHOP_PRIX_NIVEAU_1 - (donnees.solde || 0)) + ' éclats.', 'erreur');
    return false;
  }

  btn.disabled = false;
  cshopAfficherStatut(statutEl, '', '');
  return true;
}

/* ------------------------------------------------------------------
   Mise en place d'une carte
   ------------------------------------------------------------------ */
function cshopInitCarte(card, messageGlobalEl) {
  const btn = card.querySelector('.cshop-btn-equiper');
  const statutEl = card.querySelector('.cshop-statut');
  const id = card.getAttribute('data-competence-id');
  if (!btn || !statutEl || !id) return;

  btn.addEventListener('click', async () => {
    const userId = cshopMonIdConnecte();
    if (!userId) {
      cshopAfficherStatut(statutEl, 'Connecte-toi pour équiper une compétence.', 'erreur');
      return;
    }

    btn.disabled = true;
    let donnees;
    try {
      // Comme sur la fiche et la boutique d'équipement : on relit les
      // données ACTUELLES depuis Firebase juste avant d'agir (pas
      // celles pré-chargées à l'ouverture de la page), pour éviter
      // qu'un double-clic ou deux onglets ouverts en même temps ne se
      // marchent dessus (ex: acheter deux fois la même compétence).
      donnees = await cshopChargerPersonnage(userId);
    } catch (e) {
      cshopAfficherStatut(statutEl, 'Impossible de vérifier tes données, réessaie.', 'erreur');
      btn.disabled = false;
      return;
    }

    const peutAcheter = cshopEvaluerCarte(card, donnees);
    if (!peutAcheter) return; // cshopEvaluerCarte a déjà mis à jour le bouton/statut

    try {
      const nouveauSolde = (donnees.solde || 0) - CSHOP_PRIX_NIVEAU_1;
      const partiel = { solde: nouveauSolde };
      partiel['competences/' + id] = 1;
      await cshopSauvegarder(userId, partiel);
      cshopDeclencherBrillance(card);
      btn.disabled = true;
      cshopAfficherStatut(statutEl, 'Équipée ! Rends-toi sur ta fiche pour la faire évoluer.', 'equipe');
    } catch (e) {
      cshopAfficherStatut(statutEl, "Échec de l'achat, réessaie.", 'erreur');
      btn.disabled = false;
    }
  });

  card.addEventListener('animationend', (e) => {
    if (e.animationName === 'cshopBrillance') card.classList.remove('brillance');
  });
}

/* ------------------------------------------------------------------
   Mise en place d'une instance de boutique
   ------------------------------------------------------------------ */
function cshopInitInstance(instance) {
  const grid = instance.querySelector('.cshop-grid');
  if (!grid) return;
  const cards = Array.from(instance.querySelectorAll('.cshop-card'));
  const filterBtns = instance.querySelectorAll('.cshop-filter-btn');
  const messageGlobalEl = instance.querySelector('.cshop-message-globale');

  /* Le filet de sécurité tout en bas de ce fichier (DOMContentLoaded +
     'load' + deux setTimeout) peut rappeler cette fonction plusieurs
     fois sur le MÊME poste déjà initialisé. Rafraîchir l'état des
     cartes (solde, spécialité...) à chaque rappel est voulu, mais
     reposer une deuxième fois les écouteurs de clic sur "Équiper" ne
     l'est PAS : deux écouteurs indépendants sur le même bouton se
     déclenchent tous les deux sur un seul clic, ce qui débiterait le
     joueur plusieurs fois pour une seule compétence (même remarque
     que le garde-fou "shopEcouteursPoses" de boutique-script.js). */
  if (instance.dataset.cshopEcouteursPoses !== '1') {
    instance.dataset.cshopEcouteursPoses = '1';
    cards.forEach((card) => cshopInitCarte(card, messageGlobalEl));
    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        filterBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter');
        appliquerFiltre();
      });
    });
  }

  // ---- Filtres (Tout / Physique / Pouvoir) ----
  let currentFilter = 'all';
  function appliquerFiltre() {
    cards.forEach((card) => {
      const categorie = card.getAttribute('data-categorie') || '';
      const visible = currentFilter === 'all' || categorie === currentFilter;
      if (visible) card.style.removeProperty('display');
      else card.style.setProperty('display', 'none', 'important');
    });
  }

  // ---- Pré-affichage : qui suis-je, qu'est-ce que je possède déjà ----
  const userId = cshopMonIdConnecte();
  if (!userId) {
    if (messageGlobalEl) {
      messageGlobalEl.textContent = 'Connecte-toi pour voir quelles compétences tu peux équiper.';
    }
    return;
  }

  cshopChargerPersonnage(userId)
    .then((donnees) => {
      cards.forEach((card) => cshopEvaluerCarte(card, donnees));
    })
    .catch(() => {
      if (messageGlobalEl) {
        messageGlobalEl.textContent = 'Impossible de charger tes données pour le moment (recharge la page).';
        messageGlobalEl.className = 'cshop-message-globale cshop-erreur';
      }
    });
}

function cshopInitBoutique() {
  document.querySelectorAll('.cshop-instance').forEach(cshopInitInstance);
}

/* Même filet de sécurité à trois niveaux que le reste du site (voir
   boutique-script.js / bestiaire-script.js pour la même remarque) :
   rappeler cshopInitBoutique() plusieurs fois ne casse jamais rien,
   ça ne fait que reposer des écouteurs et re-vérifier l'état actuel. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', cshopInitBoutique);
} else {
  cshopInitBoutique();
}
window.addEventListener('load', cshopInitBoutique);
setTimeout(cshopInitBoutique, 1000);
setTimeout(cshopInitBoutique, 3000);
