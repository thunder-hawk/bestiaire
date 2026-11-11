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
      /^[^\S\n]*$/.test(node.textContent) &&
      // Dans une fiche (.creature-data), un espace "seul" peut être un
      // vrai espace entre deux mots mis en forme (ex. un mot en couleur
      // suivi d'un mot en gras) : on le garde, sinon les mots se
      // colleraient. Ces blocs sont cachés, donc aucun risque de
      // décalage de mise en page.
      !(node.parentElement && node.parentElement.closest('.creature-data'))
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
   dans les blocs data-... de chaque carte, on reconstruit ici
   l'affichage en jolie liste à puces / paragraphes pour la fenêtre
   détaillée. Personne n'a besoin d'écrire de <ul>/<li> à la main.

   MISE EN FORME (couleurs, gras...) — dans data-desc, data-stats,
   data-abilities, data-loot (et le nom de la créature), on peut
   utiliser au choix :
     - du BBCode :  [color=red]Croc maudit[/color]  [color=#3fa7ff]...[/color]
                    [b]gras[/b]  [i]italique[/i]  [u]souligné[/u]  [s]barré[/s]
     - ou le HTML équivalent : <span style="color:red">...</span>,
       <b>, <strong>, <i>, <em>, <u>, <s>, <font color="red">.
   Les deux marchent même si le forum a déjà transformé le BBCode en
   HTML à l'affichage. Une balise peut couvrir plusieurs lignes
   (ex. tout un bloc de butin en vert). Tout ce qui n'est pas dans
   cette liste reste du texte normal : "[Imblocable]", "[Début : mars
   2017]"... s'affichent tels quels, comme avant.
   ============================================================ */

// Sécurité : neutralise les caractères qui ont un sens spécial en HTML,
// pour qu'un texte de créature contenant "<" ou "&" ne casse jamais
// l'affichage.
function echapperHtml(texte) {
  return String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Enleve les accents et met en minuscules, pour reconnaitre "Vitalite",
// "vitalite", "VITALITE"... comme la meme chose.
function normaliser(texte) {
  return String(texte)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Couleurs acceptées : nom (red, darkred, gold...), #hex, rgb()/rgba().
// Tout le reste est refusé (la balise reste alors du texte normal).
function couleurValide(c) {
  c = String(c || '').trim().replace(/\s+/g, '');
  if (/^#[0-9a-f]{3,8}$/i.test(c)) return c;
  if (/^[a-z]{3,30}$/i.test(c)) return c;
  if (/^rgba?\([\d.,%]+\)$/i.test(c)) return c;
  return null;
}

const BALISES_HTML = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', s: 's', strike: 's', del: 's' };

// Lit un bloc de la carte en gardant sa mise en forme, convertie en
// BBCode simple : que le texte ait été tapé en BBCode ou en HTML (ou
// que le forum ait déjà converti l'un en l'autre), on retombe toujours
// sur le même format, traité ensuite par lireBalises().
function versBalisage(el) {
  if (!el) return '';
  let out = '';
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) { out += n.textContent; return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const tag = n.tagName.toLowerCase();
    if (tag === 'br') { out += '\n'; return; }
    if (/^(script|style)$/.test(tag)) return;
    if (n.classList && n.classList.contains('icon')) return; // icônes du titre
    let inner = versBalisage(n);
    const simple = BALISES_HTML[tag];
    if (simple) inner = '[' + simple + ']' + inner + '[/' + simple + ']';
    const couleur = couleurValide((n.style && n.style.color) || n.getAttribute('color'));
    if (couleur) inner = '[color=' + couleur + ']' + inner + '[/color]';
    if (n.style && /bold|[6-9]00/.test(n.style.fontWeight || '')) inner = '[b]' + inner + '[/b]';
    if (n.style && n.style.fontStyle === 'italic') inner = '[i]' + inner + '[/i]';
    if (n.style && /underline/.test(n.style.textDecoration || '')) inner = '[u]' + inner + '[/u]';
    out += inner;
    if (/^(p|div|li)$/.test(tag)) out += '\n';
  });
  return out;
}

// Découpe le texte en jetons : morceaux de texte, balises ouvrantes,
// balises fermantes. Seules les balises connues sont reconnues.
function lireBalises(texte) {
  const jetons = [];
  const re = /\[(\/?)(b|i|u|s|color)(?:=([^\]\n]{1,40}))?\]/gi;
  let dernier = 0, m;
  const ajouterTexte = (t) => { if (t) jetons.push({ t: 'txt', v: t.replace(/ /g, ' ') }); };
  while ((m = re.exec(texte))) {
    const ferme = m[1] === '/';
    const nom = m[2].toLowerCase();
    let ok = true, couleur = null;
    if (ferme) ok = m[3] === undefined;
    else if (nom === 'color') ok = !!(couleur = couleurValide(m[3]));
    else ok = m[3] === undefined;
    if (!ok) continue; // pas une vraie balise : reste du texte
    ajouterTexte(texte.slice(dernier, m.index));
    jetons.push(ferme ? { t: 'fin', nom } : { t: 'deb', nom, couleur });
    dernier = re.lastIndex;
  }
  ajouterTexte(texte.slice(dernier));
  return jetons;
}

// Fait avancer la pile des balises ouvertes au fil des jetons.
function majPile(pile, j) {
  if (j.t === 'deb') pile.push(j);
  else if (j.t === 'fin') {
    for (let k = pile.length - 1; k >= 0; k--) {
      if (pile[k].nom === j.nom) { pile.splice(k, 1); break; }
    }
  }
}

// Coupe une liste de jetons à chaque retour à la ligne. Une balise
// encore ouverte en fin de ligne est rouverte au début de la suivante.
function enLignes(jetons) {
  const lignes = [];
  let courante = [];
  const pile = [];
  jetons.forEach((j) => {
    if (j.t !== 'txt') { courante.push(j); majPile(pile, j); return; }
    const morceaux = j.v.split('\n');
    morceaux.forEach((mo, idx) => {
      if (idx > 0) {
        lignes.push(courante);
        courante = pile.map((p) => ({ ...p }));
      }
      if (mo) courante.push({ t: 'txt', v: mo });
    });
  });
  lignes.push(courante);
  return lignes;
}

function texteVisible(jetons) {
  return jetons.filter((j) => j.t === 'txt').map((j) => j.v).join('');
}

// Coupe une ligne en deux à la position `pos` du texte visible (le ":"
// du libellé), en rouvrant à droite les balises encore ouvertes.
function couperA(jetons, pos) {
  const gauche = [], droite = [];
  const pile = [];
  let vu = 0, coupe = false;
  jetons.forEach((j) => {
    if (coupe) { droite.push(j); return; }
    if (j.t !== 'txt') { gauche.push(j); majPile(pile, j); return; }
    if (vu + j.v.length <= pos) { gauche.push(j); vu += j.v.length; return; }
    const i = pos - vu;
    if (i > 0) gauche.push({ t: 'txt', v: j.v.slice(0, i) });
    coupe = true;
    pile.forEach((p) => droite.push({ ...p }));
    const reste = j.v.slice(i + 1); // +1 : on saute le ":"
    if (reste) droite.push({ t: 'txt', v: reste });
  });
  return [gauche, droite];
}

// Transforme une suite de jetons en HTML propre (balises toujours bien
// refermées, fermetures orphelines ignorées, espaces de bord retirés).
function rendreJetons(jetons) {
  const liste = jetons.map((j) => ({ ...j }));
  const txt = liste.filter((j) => j.t === 'txt');
  if (txt.length) {
    txt[0].v = txt[0].v.replace(/^\s+/, '');
    txt[txt.length - 1].v = txt[txt.length - 1].v.replace(/\s+$/, '');
  }
  let html = '';
  const pile = [];
  const fermer = (p) => (p.nom === 'color' ? '</span>' : '</' + p.nom + '>');
  liste.forEach((j) => {
    if (j.t === 'txt') { html += echapperHtml(j.v); return; }
    if (j.t === 'deb') {
      pile.push(j);
      html += j.nom === 'color'
        ? '<span style="color:' + echapperHtml(j.couleur) + '">'
        : '<' + j.nom + '>';
      return;
    }
    const k = pile.map((p) => p.nom).lastIndexOf(j.nom);
    if (k === -1) return;
    const aRouvrir = pile.splice(k + 1);
    for (let x = aRouvrir.length - 1; x >= 0; x--) html += fermer(aRouvrir[x]);
    html += fermer(pile.pop());
    aRouvrir.forEach((p) => {
      pile.push(p);
      html += p.nom === 'color' ? '<span style="color:' + echapperHtml(p.couleur) + '">' : '<' + p.nom + '>';
    });
  });
  for (let x = pile.length - 1; x >= 0; x--) html += fermer(pile[x]);
  return html;
}

// Les 3 statistiques de base ressortent chacune dans leur propre couleur
// (voir bestiaire-style.css) au lieu du dore generique des autres titres.
const COULEURS_STATS = [
  { test: (n) => n.startsWith('vitalite'), classe: 'stat-vitalite' },
  { test: (n) => n.startsWith('vitesse'), classe: 'stat-vitesse' },
  { test: (n) => n.startsWith('degat'), classe: 'stat-degats' },
];

// Une ligne par info. Si la ligne commence par un court "Titre :", ce
// titre est affiche en gras (utile pour "Vitalite : 300"). Sans ":" proche
// du debut, la ligne est affichee telle quelle (utile pour un butin qui
// n'a pas besoin de libelle). Le ":" est cherché dans le texte VISIBLE :
// les balises de couleur ne comptent pas dans la longueur du titre.
const LONGUEUR_MAX_TITRE = 40;
function texteEnListe(texteBrut, colorerStats) {
  const lignes = enLignes(lireBalises(texteBrut || ''))
    .filter((l) => texteVisible(l).trim());

  if (lignes.length === 0) return '<ul><li>/</li></ul>';

  const items = lignes.map((ligne) => {
    const visible = texteVisible(ligne);
    const sep = visible.indexOf(':');
    const avant = visible.slice(0, Math.max(sep, 0));
    if (sep > -1 && visible.slice(sep + 1).trim() && avant.trim().length <= LONGUEUR_MAX_TITRE && avant.trim()) {
      const [gauche, droite] = couperA(ligne, sep);
      let attributClasse = '';
      if (colorerStats) {
        const match = COULEURS_STATS.find((c) => c.test(normaliser(avant)));
        if (match) attributClasse = ` class="${match.classe}"`;
      }
      return `<li><strong${attributClasse}>${rendreJetons(gauche)} :</strong> ${rendreJetons(droite)}</li>`;
    }
    return `<li>${rendreJetons(ligne)}</li>`;
  });

  return `<ul>${items.join('')}</ul>`;
}

// Une ligne vide entre deux blocs de texte = un nouveau paragraphe.
// Sinon, tout reste dans un seul paragraphe (les retours à la ligne
// simples ne comptent pas comme un saut de paragraphe).
function texteEnParagraphes(texteBrut) {
  const paragraphes = [];
  let courant = [];
  enLignes(lireBalises(texteBrut || '')).forEach((l) => {
    if (texteVisible(l).trim()) courant.push(rendreJetons(l));
    else if (courant.length) { paragraphes.push(courant); courant = []; }
  });
  if (courant.length) paragraphes.push(courant);
  return paragraphes.map((p) => `<p>${p.join(' ')}</p>`).join('');
}

// Nom de la créature dans la fenêtre : garde les couleurs ({Boss} en
// rouge, etc.), ignore les icônes.
function titreEnHtml(el) {
  return enLignes(lireBalises(versBalisage(el)))
    .filter((l) => texteVisible(l).trim())
    .map(rendreJetons)
    .join(' ');
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
      modalTitle.innerHTML = titreEnHtml(card.querySelector('.creature-name'));

      // Chaque champ de la fiche est du texte brut simple (une info par
      // ligne) — c'est ici qu'on le transforme en jolie mise en page.
      modalFamily.textContent = card.querySelector('.data-family').textContent.trim();
      modalDesc.innerHTML = texteEnParagraphes(versBalisage(card.querySelector('.data-desc')));
      modalStats.innerHTML = texteEnListe(versBalisage(card.querySelector('.data-stats')), true);
      modalAbilities.innerHTML = texteEnListe(versBalisage(card.querySelector('.data-abilities')));
      modalLoot.innerHTML = texteEnListe(versBalisage(card.querySelector('.data-loot')));

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
