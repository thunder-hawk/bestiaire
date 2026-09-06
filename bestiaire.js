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
      /^[\s ]*$/.test(node.textContent)
    ) {
      aSupprimer.push(node);
    }
  }
  aSupprimer.forEach((n) => n.remove());
}

function initBestiaire() {
      document.querySelectorAll('.book-container, #creatureModal').forEach(nettoyerParasitesEditeur);

      const searchInput = document.getElementById('searchInput');
      const filterBtns = document.querySelectorAll('.filter-btn');
      const cards = document.querySelectorAll('.creature-card');
      
      const modal = document.getElementById('creatureModal');
      const closeModal = document.getElementById('closeModal');
      
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

      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase().trim();
        filterCreatures();
      });

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
          document.getElementById('modalImg').src = card.querySelector('.creature-img').src;
          document.getElementById('modalTitle').textContent = card.querySelector('.creature-name').textContent;
          
          document.getElementById('modalFamily').textContent = card.querySelector('.data-family').textContent;
          document.getElementById('modalDesc').innerHTML = card.querySelector('.data-desc').innerHTML;
          document.getElementById('modalStats').innerHTML = card.querySelector('.data-stats').innerHTML;
          document.getElementById('modalAbilities').innerHTML = card.querySelector('.data-abilities').innerHTML;
          document.getElementById('modalLoot').innerHTML = card.querySelector('.data-loot').innerHTML;

          modal.style.display = 'flex';
        });
      });

      closeModal.addEventListener('click', () => modal.style.display = 'none');
      window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
      document.addEventListener('keydown', (e) => {
        if (e.key === "Escape" && modal.style.display === 'flex') modal.style.display = 'none';
      });
}

/* Lance l'initialisation tout de suite si la page est déjà chargée
   (cas d'un script injecté dynamiquement, après coup), sinon on
   attend que le DOM soit prêt comme d'habitude. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBestiaire);
} else {
  initBestiaire();
}
