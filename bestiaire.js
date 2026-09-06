/* L'éditeur de message de Forumactif a tendance à glisser des <br> et des
   espaces insécables (nbsp) tout seul entre nos balises, même en collant en
   mode "source". Ce n'est presque jamais visible... sauf que ces bouts de
   texte "invisibles" comptent quand même comme des éléments pour une grille
   CSS (display:grid) ou une mise en page flexible (display:flex) : ils
   prennent une case à eux tout seuls et décalent tout le reste (cartes qui
   ne se mettent plus 2 par 2, image poussée dans la fiche, etc.).
   On nettoie donc le DOM une fois au chargement, avant toute mise en page,
   pour supprimer ces <br> et ces bouts de texte "vides" (espace normal ou
   nbsp uniquement) — le vrai texte des fiches n'est jamais touché. */
function nettoyerParasitesEditeur(racine) {
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
      /^[\s ]*$/.test(node.textContent)
    ) {
      aSupprimer.push(node);
    }
  }
  aSupprimer.forEach((n) => n.remove());
}

/* Le bestiaire peut être collé plusieurs fois sur la même page (un sujet
   avec plusieurs messages contenant chacun le bestiaire). Comme le script
   est chargé une seule fois pour toute la page (panneau JS de Forumactif),
   on ne peut pas utiliser document.getElementById/querySelector globalement
   — ça ne trouverait que le tout premier bloc, et une recherche/un filtre
   dans un message agirait aussi sur tous les autres. On initialise donc
   CHAQUE bloc ".bestiaire-instance" séparément, en ne cherchant jamais en
   dehors de son propre bloc. */
function initInstance(instance) {
  nettoyerParasitesEditeur(instance);

  const searchInput = instance.querySelector('.search-bar input');
  const filterBtns = instance.querySelectorAll('.filter-btn');
  const cards = instance.querySelectorAll('.creature-card');

  const modal = instance.querySelector('.modal');
  if (!modal) return;
  const closeModal = modal.querySelector('.close-btn');
  const modalImg = modal.querySelector('.modal-left img');
  const modalTitle = modal.querySelector('.modal-title');
  const modalFamily = modal.querySelector('.modal-family');
  const modalDesc = modal.querySelector('.modal-desc');
  const modalStats = modal.querySelector('.modal-stats');
  const modalAbilities = modal.querySelector('.modal-abilities');
  const modalLoot = modal.querySelector('.modal-loot');

  let currentFilter = 'all';
  let currentSearch = '';

  function filterCreatures() {
    cards.forEach(card => {
      const name = card.querySelector('.creature-name').textContent.toLowerCase();
      // Plusieurs catégories possibles, séparées par une virgule :
      // data-category="Dragons, Légendaire"
      const categories = (card.getAttribute('data-category') || '')
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);

      const matchesSearch = name.includes(currentSearch);
      const matchesFilter = (currentFilter === 'all') || categories.includes(currentFilter);

      card.style.display = (matchesSearch && matchesFilter) ? 'block' : 'none';
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      filterCreatures();
    });
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      filterCreatures();
    });
  });

  cards.forEach(card => {
    const imgContainer = card.querySelector('.img-container');

    imgContainer.addEventListener('click', () => {
      modalImg.src = card.querySelector('.creature-img').src;
      modalTitle.textContent = card.querySelector('.creature-name').textContent;

      modalFamily.textContent = card.querySelector('.data-family').textContent;
      modalDesc.innerHTML = card.querySelector('.data-desc').innerHTML;
      modalStats.innerHTML = card.querySelector('.data-stats').innerHTML;
      modalAbilities.innerHTML = card.querySelector('.data-abilities').innerHTML;
      modalLoot.innerHTML = card.querySelector('.data-loot').innerHTML;

      modal.style.display = 'flex';
    });
  });

  closeModal.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  document.addEventListener('keydown', (e) => {
    if (e.key === "Escape" && modal.style.display === 'flex') modal.style.display = 'none';
  });
}

function initBestiaire() {
  const instances = document.querySelectorAll('.bestiaire-instance');
  instances.forEach(initInstance);
}

/* Lance l'initialisation tout de suite si la page est déjà chargée
   (cas d'un script injecté dynamiquement, après coup), sinon on
   attend que le DOM soit prêt comme d'habitude. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBestiaire);
} else {
  initBestiaire();
}
