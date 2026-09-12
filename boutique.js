/* ==========================================================
   BOUTIQUE — script
   Chaque objet affiche directement toutes ses infos sur sa carte (pas
   de fenêtre de détail à ouvrir), donc pas besoin de reconstruire du
   HTML à partir de texte brut. En plus de filtrer/chercher/trier, le
   script écrit maintenant VRAIMENT dans Firebase au clic sur
   "Équiper" (voir la section BOUTIQUE — ÉQUIPEMENT plus bas) : chaque
   carte cible directement le visiteur actuellement connecté (voir
   boutiqueMonIdConnecte(), même technique que fiche-script.js et
   monnaie-script.js), pas de fenêtre à choisir "pour qui" — équiper
   ici, c'est toujours équiper SON PROPRE personnage.

   Équiper un objet dépense son prix immédiatement ET remplace tout
   ce qui occupait déjà cet emplacement, sans remboursement (voir la
   note d'architecture dans firebase-regles.json / fiche-script.js) :
   il n'existe pas d'inventaire "possédé mais pas porté", un objet
   acheté est TOUJOURS équipé dans la foulée.
   ========================================================== */

/* Nettoyage des <br> et espaces vides que l'éditeur Forumactif ajoute
   parfois tout seul en collant. Contrairement au bestiaire, aucun champ
   ici n'est un texte multi-lignes à préserver : tout <br> ou texte vide
   rencontré est donc toujours un parasite à supprimer, jamais une
   séparation utile. Du coup relancer cette fonction plusieurs fois de
   suite ne change jamais rien après le premier passage (rien de "créé"
   qu'un deuxième passage pourrait prendre pour un parasite) — c'est
   important, voir la note plus bas sur les rappels multiples. */
function nettoyerParasitesBoutique(racine) {
  const walker = document.createTreeWalker(
    racine,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );
  const aSupprimer = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
      aSupprimer.push(node);
    } else if (
      node.nodeType === Node.TEXT_NODE &&
      node.textContent.length > 0 &&
      /^\s*$/.test(node.textContent)
    ) {
      aSupprimer.push(node);
    }
  }
  aSupprimer.forEach((n) => n.remove());
}

function echapperHtmlBoutique(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* Petit effet de "lueur" façon étoile filante qui balaie la carte au
   clic (voir .item-card::after dans le CSS). On retire puis remet la
   classe à chaque clic (avec un reflow forcé entre les deux) pour que
   l'animation reparte bien de zéro même si on clique plusieurs fois de
   suite très vite sur la même carte — sans ce petit détour, réappliquer
   une classe déjà présente ne relance pas une animation CSS en cours. */
function declencherBrillance(card) {
  card.classList.remove('brillance');
  void card.offsetWidth; // force le reflow
  card.classList.add('brillance');
}

/* Infobulle de description : un seul élément partagé pour toute la page
   (même s'il y a plusieurs boutiques dessus), créé une seule fois et
   réutilisé ensuite. On vérifie qu'il est toujours bien dans la page au
   cas où — cette fonction peut être appelée plusieurs fois sans jamais
   créer de doublon. */
let tooltipBoutiquePartage = null;
function obtenirTooltipBoutique() {
  if (tooltipBoutiquePartage && document.body.contains(tooltipBoutiquePartage)) {
    return tooltipBoutiquePartage;
  }
  tooltipBoutiquePartage = document.createElement('div');
  tooltipBoutiquePartage.className = 'item-tooltip';
  document.body.appendChild(tooltipBoutiquePartage);
  return tooltipBoutiquePartage;
}

/* ------------------------------------------------------------------
   BOUTIQUE — ÉQUIPEMENT (écrit vraiment dans Firebase)
   ------------------------------------------------------------------ */

/* Même base Firebase que fiche-script.js (un seul et même projet) — si
   tu changes l'un, pense à changer l'autre pareil. */
const BOUTIQUE_FIREBASE_URL = "https://pathofdawn-fiches-default-rtdb.europe-west1.firebasedatabase.app";

/* Emplacements valides : les 5 pièces d'armure ont chacune leur propre
   emplacement ; les armes (une ou deux mains, épée ou hache) partagent
   toutes les deux mêmes emplacements "arme1"/"arme2" — voir
   determinerSlotsCible() plus bas pour savoir lequel est choisi. */

/* L'id du joueur actuellement CONNECTÉ (celui qui clique, pas un
   joueur choisi dans un menu) — même technique que fiche-script.js et
   monnaie-script.js : le lien "Voir mon profil" du menu du forum,
   présent sur toutes les pages. */
function boutiqueMonIdConnecte() {
  const liens = document.querySelectorAll('a[href*="/u"]');
  for (const a of liens) {
    if (a.textContent.trim().toLowerCase() === 'voir mon profil') {
      const m = (a.getAttribute('href') || '').match(/\/u(\d+)(?:[/?#]|$)/);
      if (m) return m[1];
    }
  }
  return null;
}

async function boutiqueChargerPersonnage(userId) {
  const res = await fetch(BOUTIQUE_FIREBASE_URL + '/personnages/' + userId + '.json');
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
  const data = await res.json();
  return {
    solde: (data && typeof data.solde === 'number') ? data.solde : 0,
    equipement: (data && data.equipement && typeof data.equipement === 'object') ? data.equipement : {}
  };
}

/* Les clés du corps envoyé utilisent la notation "chemin/avec/slash"
   (ex: "equipement/casque") plutôt que des objets imbriqués : un PATCH
   Firebase remplace ENTIÈREMENT l'objet à chaque chemin donné, donc
   envoyer {"equipement": {"casque": "..."}} effacerait tout le reste
   de l'équipement déjà porté (épaulettes, torse...). La notation à
   plat fait un vrai "multi-location update" qui ne touche QUE les
   chemins listés, tout le reste reste intact. */
async function boutiqueSauvegarder(userId, partiel) {
  const res = await fetch(BOUTIQUE_FIREBASE_URL + '/personnages/' + userId + '.json', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partiel)
  });
  if (!res.ok) throw new Error('Erreur réseau (' + res.status + ')');
}

/* Décide dans QUEL(S) emplacement(s) d'arme ranger une nouvelle arme :
   - Une arme à deux mains occupe TOUJOURS les deux emplacements à la
     fois (et remplace tout ce qui s'y trouvait, sans remboursement).
   - Une arme à une main va dans le premier emplacement libre ; si les
     deux sont déjà occupés, elle remplace l'emplacement principal
     (arme1) par défaut — un choix volontairement simple plutôt que de
     demander "laquelle remplacer ?" à chaque achat. */
function determinerSlotsCible(slotDeBase, deuxMains, equipementActuel) {
  if (slotDeBase !== 'arme') return [slotDeBase];
  if (deuxMains) return ['arme1', 'arme2'];
  if (!equipementActuel.arme1) return ['arme1'];
  if (!equipementActuel.arme2) return ['arme2'];
  return ['arme1'];
}

function initShopEquiper(card) {
  const btn = card.querySelector('.item-btn-equiper');
  const statutEl = card.querySelector('.item-statut');
  if (!btn || !statutEl) return;

  const itemId = card.getAttribute('data-item-id');
  const slot = card.getAttribute('data-slot');
  const deuxMains = card.getAttribute('data-deux-mains') === 'true';
  const prix = parseFloat(card.getAttribute('data-price')) || 0;
  if (!itemId || !slot) return; // carte pas encore configurée (attributs manquants)

  function afficherStatut(texte, type) {
    statutEl.textContent = texte;
    statutEl.className = 'item-statut' + (type ? ' item-statut-' + type : '');
  }

  btn.addEventListener('click', async (e) => {
    // Un clic sur ce bouton ne doit pas aussi ouvrir/fermer la bulle
    // de description (le clic sur la carte entière fait déjà ça).
    e.stopPropagation();

    const userId = boutiqueMonIdConnecte();
    if (!userId) {
      afficherStatut('Connecte-toi pour équiper un objet.', 'erreur');
      return;
    }

    btn.disabled = true;
    try {
      // Comme pour le passage de niveau sur la fiche : on relit le
      // solde et l'équipement ACTUELS directement depuis Firebase juste
      // avant d'agir, pour éviter qu'un double-clic ou deux onglets
      // ouverts en même temps ne se marchent dessus.
      const donnees = await boutiqueChargerPersonnage(userId);

      if (donnees.solde < prix) {
        afficherStatut('Il manque ' + (prix - donnees.solde) + ' éclats.', 'erreur');
        return;
      }

      const slotsCible = determinerSlotsCible(slot, deuxMains, donnees.equipement || {});
      const nouveauSolde = donnees.solde - prix;
      const partiel = { solde: nouveauSolde };
      slotsCible.forEach((s) => { partiel['equipement/' + s] = itemId; });

      await boutiqueSauvegarder(userId, partiel);
      declencherBrillance(card);
      afficherStatut('Équipé ! Rends-toi sur ta fiche pour le voir.', 'equipe');
    } catch (err) {
      afficherStatut("Impossible d'équiper pour le moment, réessaie.", 'erreur');
    } finally {
      btn.disabled = false;
    }
  });
}

function initShopInstance(instance) {
  /* Le filet de sécurité tout en bas de ce fichier (DOMContentLoaded +
     'load' + deux setTimeout) peut rappeler cette fonction plusieurs
     fois sur le MÊME poste déjà initialisé. Poser une deuxième fois
     tous les écouteurs de clic serait sans danger pour la recherche/le
     tri/la bulle de description, mais PAS pour le bouton "Équiper" :
     deux écouteurs indépendants sur le même bouton se déclenchent TOUS
     LES DEUX sur un seul clic, ce qui débiterait le joueur deux fois
     (ou plus) pour un seul achat. D'où ce garde-fou : on ne pose les
     écouteurs qu'une seule fois par poste, quel que soit le nombre de
     fois où initShopInstance() est rappelée derrière. */
  if (instance.dataset.shopEcouteursPoses === '1') return;
  instance.dataset.shopEcouteursPoses = '1';

  nettoyerParasitesBoutique(instance);

  const searchInput = instance.querySelector('.shop-search-bar input');
  const filterBtns = instance.querySelectorAll('.shop-filter-btn');
  const sortSelect = instance.querySelector('.shop-sort select');
  const grid = instance.querySelector('.items-grid');
  if (!grid) return;
  const cards = Array.from(instance.querySelectorAll('.item-card'));

  let currentFilter = 'all';
  let currentSearch = '';

  function appliquerFiltres() {
    let visibles = 0;
    cards.forEach((card) => {
      const nomEl = card.querySelector('.item-name');
      const nom = nomEl ? nomEl.textContent.toLowerCase() : '';
      const categories = (card.getAttribute('data-category') || '')
        .split(',')
        .map((c) => c.trim());

      const correspondRecherche = nom.includes(currentSearch);
      const correspondFiltre = currentFilter === 'all' || categories.includes(currentFilter);
      const visible = correspondRecherche && correspondFiltre;

      /* .item-card force "display: flex !important" en CSS (nécessaire
         pour la mise en page). Un style inline classique ne peut jamais
         gagner contre un !important de la feuille de style, donc
         "card.style.display = 'none'" tout seul ne cachait jamais
         vraiment la carte (elle restait affichée malgré l'attribut
         inline) : c'est ce qui rendait la recherche/le filtre inopérants
         à l'écran. On force donc nous aussi un !important pour cacher,
         et on retire simplement la propriété pour réafficher (la règle
         CSS "!important" reprend alors la main normalement). */
      if (visible) {
        card.style.removeProperty('display');
        visibles += 1;
      } else {
        card.style.setProperty('display', 'none', 'important');
      }
    });

    let messageVide = instance.querySelector('.shop-empty');
    if (visibles === 0) {
      if (!messageVide) {
        messageVide = document.createElement('div');
        messageVide.className = 'shop-empty';
        messageVide.textContent = 'Aucun objet ne correspond à ta recherche.';
        grid.appendChild(messageVide);
      }
    } else if (messageVide) {
      messageVide.remove();
    }
  }

  function appliquerTri() {
    if (!sortSelect) return;
    const mode = sortSelect.value;
    if (mode === 'defaut') return;
    const cartesTriees = [...cards].sort((a, b) => {
      const prixA = parseFloat(a.getAttribute('data-price')) || 0;
      const prixB = parseFloat(b.getAttribute('data-price')) || 0;
      return mode === 'prix-asc' ? prixA - prixB : prixB - prixA;
    });
    cartesTriees.forEach((card) => grid.appendChild(card));
  }

  /* ---------- Infobulle de description au clic ---------- */
  const tooltip = obtenirTooltipBoutique();
  let carteOuverte = null;

  function positionnerTooltip(card) {
    // Mesure après affichage (display: block) pour avoir la vraie taille
    // de l'infobulle une fois son contenu posé.
    const margeEcran = 10;
    const rectCarte = card.getBoundingClientRect();
    const rectTooltip = tooltip.getBoundingClientRect();

    let gauche = rectCarte.left;
    const gaucheMax = window.innerWidth - rectTooltip.width - margeEcran;
    if (gauche > gaucheMax) gauche = Math.max(margeEcran, gaucheMax);

    let haut = rectCarte.bottom + margeEcran;
    if (haut + rectTooltip.height > window.innerHeight - margeEcran) {
      // Pas assez de place en dessous : on l'affiche au-dessus de la carte.
      haut = rectCarte.top - rectTooltip.height - margeEcran;
      if (haut < margeEcran) haut = margeEcran;
    }

    tooltip.style.left = gauche + 'px';
    tooltip.style.top = haut + 'px';
  }

  function fermerTooltip() {
    tooltip.classList.remove('visible');
    if (carteOuverte) carteOuverte.classList.remove('ouverte');
    carteOuverte = null;
  }

  function ouvrirTooltip(card) {
    const descEl = card.querySelector('.item-desc');
    const desc = descEl ? descEl.textContent.trim() : '';
    if (!desc) return; // rien à montrer, inutile d'ouvrir une bulle vide
    const nomEl = card.querySelector('.item-name');
    const nom = nomEl ? nomEl.textContent.trim() : '';

    tooltip.innerHTML =
      '<div class="item-tooltip-title">' + echapperHtmlBoutique(nom) + '</div>' +
      '<div class="item-tooltip-desc">' + echapperHtmlBoutique(desc) + '</div>';
    tooltip.classList.add('visible');
    card.classList.add('ouverte');
    carteOuverte = card;
    positionnerTooltip(card);
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      declencherBrillance(card);
      if (carteOuverte === card) {
        fermerTooltip();
      } else {
        if (carteOuverte) carteOuverte.classList.remove('ouverte');
        ouvrirTooltip(card);
      }
    });
    // Nettoyage : une fois l'animation terminée, on retire la classe pour
    // que la carte reste dans un état "propre" entre deux clics.
    card.addEventListener('animationend', (e) => {
      if (e.animationName === 'brillanceSweep') card.classList.remove('brillance');
    });
    initShopEquiper(card);
  });

  // Clic en dehors de la carte ouverte (et en dehors de la bulle elle-même,
  // même si elle ignore les clics grâce à pointer-events:none) : on ferme.
  document.addEventListener('click', (e) => {
    if (carteOuverte && !carteOuverte.contains(e.target)) {
      fermerTooltip();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && carteOuverte) fermerTooltip();
  });
  // Si la page défile ou que la fenêtre change de taille, on referme
  // plutôt que de laisser une bulle mal placée.
  window.addEventListener('scroll', () => { if (carteOuverte) fermerTooltip(); }, true);
  window.addEventListener('resize', () => { if (carteOuverte) fermerTooltip(); });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      appliquerFiltres();
    });
  }

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      appliquerFiltres();
    });
  });

  if (sortSelect) {
    sortSelect.addEventListener('change', appliquerTri);
  }
}

function initBoutique() {
  document.querySelectorAll('.shop-instance').forEach(initShopInstance);
}

/* Même filet de sécurité à trois niveaux que sur le bestiaire (leçon du
   soir même !) : lancement immédiat si la page est déjà prête, sinon on
   attend DOMContentLoaded, et dans tous les cas on relance une fois de
   plus à l'événement 'load' au cas où le tout premier essai aurait été
   manqué. initShopInstance() peut sans risque être rappelée plusieurs
   fois sur le même poste (voir son garde-fou "shopEcouteursPoses" tout
   en haut de la fonction, qui empêche de poser deux fois les mêmes
   écouteurs de clic sur "Équiper"). */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBoutique);
} else {
  initBoutique();
}
window.addEventListener('load', initBoutique);

/* Testé en vrai sur le forum : même avec les 3 tentatives ci-dessus,
   il arrive que rien ne se déclenche automatiquement (le panneau JS de
   Forumactif peut injecter le script à un moment où DOMContentLoaded
   ET load ont déjà eu lieu tous les deux, donc plus aucun des deux
   évènements ne se reproduira). On ajoute donc deux rappels différés,
   qui finissent toujours par tomber après coup quoi qu'il arrive.
   Sans risque grâce au design du dessus (rappeler initBoutique()
   plusieurs fois ne fait jamais de dégât). */
setTimeout(initBoutique, 1000);
setTimeout(initBoutique, 3000);
