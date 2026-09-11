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
