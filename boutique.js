/* ==========================================================
   BOUTIQUE — script
   Volontairement plus simple que celui du bestiaire : chaque objet
   affiche directement toutes ses infos sur sa carte (pas de fenêtre
   de détail à ouvrir), donc pas besoin de reconstruire du HTML à
   partir de texte brut. Le script ne fait que filtrer/chercher/trier.
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

function initShopInstance(instance) {
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

      card.style.display = visible ? '' : 'none';
      if (visible) visibles += 1;
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
      if (carteOuverte === card) {
        fermerTooltip();
      } else {
        if (carteOuverte) carteOuverte.classList.remove('ouverte');
        ouvrirTooltip(card);
      }
    });
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
   manqué. Comme initShopInstance() ne fait que (re)poser des écouteurs
   et nettoyer un DOM déjà propre, le rappeler plusieurs fois ne casse
   jamais rien — pas besoin (et surtout pas de risque) d'un système
   "anti-double-appel". */
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
