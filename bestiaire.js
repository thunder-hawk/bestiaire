function initBestiaire() {
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
          const category = card.getAttribute('data-category');
          
          const matchesSearch = name.includes(currentSearch);
          const matchesFilter = (currentFilter === 'all') || (category === currentFilter);

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