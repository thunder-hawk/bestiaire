/* ==========================================================
   FICHE DE PERSONNAGE — système de niveaux (1 à 10)

   Trois façons de coller ce widget (voir fiche-contenu.html) :
   1. Dans le champ personnalisé "campo18" (Stats) du profil — chaque
      profil affiche alors SA PROPRE fiche, identifiée via l'URL /u...
   2. Dans le PREMIER MESSAGE d'un sujet de forum posté par le STAFF
      pour un joueur (ex. catégorie "Fiches de personnage", un sujet
      par joueur) : comme c'est le staff qui poste (donc l'auteur du
      message), on précise le joueur concerné à la main via l'attribut
      data-joueur="..." sur .fiche-progression — sinon la fiche
      s'identifierait au staff plutôt qu'au joueur.
   3. Cas plus rare : sujet posté PAR LE JOUEUR LUI-MÊME (sans
      data-joueur) — la fiche est alors identifiée via l'auteur du
      premier message.
   Ne jamais laisser un membre normal coller du HTML/JS dans un
   message (risque de sécurité) — voir la note dans fiche-contenu.html.
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
  const pvInput = racine.querySelector('.fp-input-pv');
  const dpsInput = racine.querySelector('.fp-input-dps');
  const btnSauver = racine.querySelector('.fp-btn-sauver');
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

  // Un visiteur (pas le propriétaire) ne voit ni les champs de saisie
  // ni les boutons d'achat : juste le résultat, en lecture seule.
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
    if (pvInput) pvInput.value = etat.pvBase || 0;
    if (dpsInput) dpsInput.value = etat.dpsBase || 0;

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

  if (btnSauver) {
    btnSauver.addEventListener('click', async () => {
      const pv = Math.max(0, parseInt(pvInput.value, 10) || 0);
      const dps = Math.max(0, parseInt(dpsInput.value, 10) || 0);
      btnSauver.disabled = true;
      try {
        await ficheSauvegarder(userId, { pvBase: pv, dpsBase: dps });
        etat.pvBase = pv;
        etat.dpsBase = dps;
        rafraichirAffichage();
        afficherMessage('Stats de base enregistrées.', 'ok');
      } catch (e) {
        afficherMessage("Échec de l'enregistrement, réessaie.", 'erreur');
      } finally {
        btnSauver.disabled = false;
      }
    });
  }

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
