/* L'éditeur de message de Forumactif a tendance à glisser des <br> et des
   espaces insécables (nbsp) tout seul entre nos balises, même en collant en
   mode "source". Ce n'est presque jamais visible... sauf que ces bouts de
   texte "invisibles" comptent quand même comme des éléments pour une grille
   CSS (display:grid) ou une mise en page flexible (display:flex) : ils
   prennent une case à eux tout seuls et décalent tout le reste (cartes qui
   ne se mettent plus 2 par 2, image poussée dans la fiche, etc.).
   On nettoie donc le DOM une fois au chargement, avant toute mise en page,
   pour supprimer ces <br> et ces bouts de texte "vides" (espace normal ou
   nbsp uniquement) — le vrai texte des fiches n'est jamais touché.
   Cas particulier : à l'intérieur d'une fiche (.creature-data), un <br>
   sépare deux lignes utiles (ex: deux statistiques tapées l'une sous
   l'autre) — on le transforme donc en vrai retour à la ligne au lieu de le
   supprimer, pour ne pas recoller les lignes entre elles. */
function nettoyerParasitesEditeur(racine) {
  const walker = document.createTreeWalker(
    racine,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );
  const brASeparer = [];
  const brASupprimer = [];
  const videsASupprimer = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR') {
      if (node.closest('.creature-data')) {
        brASeparer.push(node);
      } else {
        brASupprimer.push(node);
      }
    } else if (
      node.nodeType === Node.TEXT_NODE &&
      node.textContent.length > 0 &&
      // Volontairement [^\S\n] et pas \s tout court : \s inclut le retour
      // à la ligne (\n), or cette fonction peut être relancée plusieurs
      // fois par sécurité (voir plus bas dans le fichier). Si elle
      // reconnaissait \n comme un "espace vide parasite", une deuxième
      // passe supprimerait les \n qu'elle vient elle-même de créer juste
      // au-dessus à partir des <br> — recollant "Vitalité : 800" et
      // "Vitesse : 500" en "Vitalité : 800Vitesse : 500". Ici on ne vise
      // que les vrais parasites (espace normal, nbsp), jamais un \n.
      /^[^\S\n]*$/.test(node.textContent)
    ) {
      videsASupprimer.push(node);
    }
  }
  brASeparer.forEach((n) => n.replaceWith(document.createTextNode('\n')));
  brASupprimer.forEach((n) => n.remove());
  videsASupprimer.forEach((n) => n.remove());
}

/* ============================================================
   FICHES DE CRÉATURE : à partir de simples lignes de texte tapées
   dans bestiaire-contenu.html (voir les instructions de ce fichier),
   on reconstruit ici l'affichage en jolie liste à puces pour la
   fenêtre détaillée. Personne n'a besoin d'écrire de balises
   <ul>/<li>/<strong> à la main.
   ============================================================ */

// Sécurité : neutralise les caractères qui ont un sens spécial en HTML,
// pour qu'un texte de créature contenant "<" ou "&" ne casse jamais
// l'affichage.
function echapperHtml(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Enleve les accents et met en minuscules, pour reconnaitre "Vitalite",
// "vitalite", "VITALITE"... comme la meme chose.
function normaliser(texte) {
  return String(texte)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Les 3 statistiques de base ressortent chacune dans leur propre couleur
// (voir bestiaire-style.css) au lieu du dore generique des autres titres.
// Reconnu automatiquement a partir du libelle tape dans data-stats, sans
// rien a faire de special cote contenu.
const COULEURS_STATS = [
  { test: (n) => n.startsWith('vitalite'), classe: 'stat-vitalite' },
  { test: (n) => n.startsWith('vitesse'), classe: 'stat-vitesse' },
  { test: (n) => n.startsWith('degat'), classe: 'stat-degats' },
];

// Une ligne par info. Si la ligne commence par un court "Titre :", ce
// titre est affiche en gras (utile pour "Vitalite : 300"). Sans ":" proche
// du debut, la ligne est affichee telle quelle (utile pour un butin qui
// n'a pas besoin de libelle, ex: "Croc de Lycanthrope (Rare)") : ca evite
// aussi de couper en deux une phrase qui contiendrait elle-meme un ":"
// plus loin dans le texte.
// `colorerStats` n'est utilise que pour le bloc Statistiques (voir plus
// bas) : il active la coloration Vitalite/Vitesse/Degats ci-dessus.
const LONGUEUR_MAX_TITRE = 40;
function texteEnListe(texteBrut, colorerStats) {
  const lignes = (texteBrut || '')
    .replace(/\u00A0/g, ' ')
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter(Boolean);

  if (lignes.length === 0) return '<ul><li>/</li></ul>';

  const items = lignes.map((ligne) => {
    const sep = ligne.indexOf(':');
    if (sep > -1 && sep < ligne.length - 1 && sep <= LONGUEUR_MAX_TITRE) {
      const labelBrut = ligne.slice(0, sep).trim();
      const label = echapperHtml(labelBrut);
      const reste = echapperHtml(ligne.slice(sep + 1).trim());

      let attributClasse = '';
      if (colorerStats) {
        const match = COULEURS_STATS.find((c) => c.test(normaliser(labelBrut)));
        if (match) attributClasse = ` class="${match.classe}"`;
      }

      return `<li><strong${attributClasse}>${label} :</strong> ${reste}</li>`;
    }
    return `<li>${echapperHtml(ligne)}</li>`;
  });

  return `<ul>${items.join('')}</ul>`;
}

// Une ligne vide entre deux blocs de texte = un nouveau paragraphe.
// Sinon, tout reste dans un seul paragraphe (les retours à la ligne
// simples ne comptent pas comme un saut de paragraphe).
function texteEnParagraphes(texteBrut) {
  const paragraphes = (texteBrut || '')
    .replace(/\u00A0/g, ' ')
    .split(/\n\s*\n/)
    .map((p) => echapperHtml(p.replace(/\n/g, ' ').trim()))
    .filter(Boolean);

  if (paragraphes.length === 0) return '';
  return paragraphes.map((p) => `<p>${p}</p>`).join('');
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
      const lootEl = card.querySelector('.data-loot');
      const loot = lootEl ? lootEl.textContent.toLowerCase() : '';
      // Plusieurs catégories possibles, séparées par une virgule :
      // data-category="Dragons, Légendaire"
      const categories = (card.getAttribute('data-category') || '')
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);

      // La recherche regarde à la fois le nom ET le loot, pour retrouver
      // qui drop tel objet (ex: taper "gemme" trouve la créature qui la lâche).
      const matchesSearch = name.includes(currentSearch) || loot.includes(currentSearch);
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
    // Sécurité : si une carte a été mal recopiée et n'a pas de bloc image,
    // on l'ignore au lieu de faire planter l'initialisation de TOUTES les
    // cartes suivantes (avant, une seule carte incomplète suffisait à ce
    // que plus aucune fiche ne s'ouvre).
    if (!imgContainer) return;

    imgContainer.addEventListener('click', (e) => {
      // L'éditeur du forum entoure automatiquement l'image d'un lien vers
      // l'image en taille réelle. Sans ça, selon le navigateur, le clic
      // peut suivre ce lien au lieu (ou en plus) d'ouvrir la fiche.
      e.preventDefault();

      modalImg.src = card.querySelector('.creature-img').src;
      modalTitle.textContent = card.querySelector('.creature-name').textContent.trim();

      // Chaque champ de la fiche est du texte brut simple (une info par
      // ligne) — c'est ici qu'on le transforme en jolie mise en page.
      modalFamily.textContent = card.querySelector('.data-family').textContent.trim();
      modalDesc.innerHTML = texteEnParagraphes(card.querySelector('.data-desc').textContent);
      modalStats.innerHTML = texteEnListe(card.querySelector('.data-stats').textContent, true);
      modalAbilities.innerHTML = texteEnListe(card.querySelector('.data-abilities').textContent);
      modalLoot.innerHTML = texteEnListe(card.querySelector('.data-loot').textContent);

      modal.style.display = 'flex';
    });
  });

  closeModal.addEventListener('click', () => modal.style.display = 'none');
  window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });
  document.addEventListener('keydown', (e) => {
    if (e.key === "Escape" && modal.style.display === 'flex') modal.style.display = 'none';
  });
}

/* NOTE : pas de protection "anti-double-appel" ici volontairement. On a
   essayé un système qui marquait une instance comme "déjà initialisée"
   pour éviter d'attacher les écouteurs deux fois, mais ça créait un risque
   pire : si le tout premier appel échouait à mi-chemin pour une raison
   quelconque, l'instance restait marquée "faite" pour toujours et plus
   aucun appel suivant (même manuel) ne pouvait la réparer. Ici, rappeler
   initInstance() plusieurs fois sur la même instance ne fait AUCUN dégât
   (au pire la fiche se remplit deux fois avec les mêmes infos, invisible
   pour l'utilisateur) — donc autant rester simple et laisser chaque
   tentative avoir une vraie chance de réussir. */
function initBestiaire() {
  const instances = document.querySelectorAll('.bestiaire-instance');
  instances.forEach(initInstance);
}

/* Lance l'initialisation tout de suite si la page est déjà chargée
   (cas d'un script injecté dynamiquement, après coup), sinon on
   attend que le DOM soit prêt comme d'habitude.
   Filet de sécurité en plus : sur Forumactif, le script peut parfois
   être exécuté à un moment où document.readyState vaut encore 'loading'
   alors que l'événement DOMContentLoaded s'est déjà produit entre-temps
   (selon le moment exact où le panneau JS injecte le script) — dans ce
   cas l'écouteur ci-dessous attend un événement qui ne se reproduira
   jamais, et le bestiaire reste visuellement affiché mais sans aucune
   interaction (clic, recherche, filtres). On rattrape donc aussi le
   coup avec l'événement 'load' (page entièrement chargée, images
   comprises), qui se déclenche forcément après coup si jamais le
   premier essai a été manqué. */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initBestiaire);
} else {
  initBestiaire();
}
window.addEventListener('load', initBestiaire);
