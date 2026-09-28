const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'it', label: 'Italiano' }
];

const DEFAULT_LANG = 'en';

const DICTIONARY = {
  saveContact: {
    ru: 'Сохранить контакт в 1 клик',
    en: 'Save contact in 1 tap',
    fr: 'Enregistrer le contact en 1 clic',
    de: 'Kontakt mit 1 Klick speichern',
    es: 'Guardar contacto en 1 clic',
    it: 'Salva contatto in 1 clic'
  },
  phoneLabel: {
    ru: 'Телефон', en: 'Phone', fr: 'Téléphone', de: 'Telefon', es: 'Teléfono', it: 'Telefono'
  },
  emailLabel: {
    ru: 'Email', en: 'Email', fr: 'Email', de: 'E-Mail', es: 'Correo', it: 'Email'
  },
  linkLabel: {
    ru: 'Ссылка', en: 'Link', fr: 'Lien', de: 'Link', es: 'Enlace', it: 'Link'
  },
  wifiNetwork: {
    ru: 'Сеть Wi‑Fi', en: 'Wi‑Fi network', fr: 'Réseau Wi‑Fi', de: 'WLAN-Netzwerk', es: 'Red Wi‑Fi', it: 'Rete Wi‑Fi'
  },
  wifiPassword: {
    ru: 'Пароль', en: 'Password', fr: 'Mot de passe', de: 'Passwort', es: 'Contraseña', it: 'Password'
  },
  wifiHint: {
    ru: 'Если телефон не подключился автоматически при поднесении карты, введите эти данные в настройках Wi‑Fi вручную.',
    en: "If your phone didn't connect automatically when you tapped the card, enter these details manually in Wi‑Fi settings.",
    fr: "Si votre téléphone ne s'est pas connecté automatiquement, entrez ces informations manuellement dans les paramètres Wi‑Fi.",
    de: 'Falls sich Ihr Telefon nicht automatisch verbunden hat, geben Sie diese Daten manuell in den WLAN-Einstellungen ein.',
    es: 'Si tu teléfono no se conectó automáticamente, introduce estos datos manualmente en los ajustes de Wi‑Fi.',
    it: 'Se il telefono non si è connesso automaticamente, inserisci questi dati manualmente nelle impostazioni Wi‑Fi.'
  },
  connectedBadge: {
    ru: 'Подключено через NFC',
    en: 'Connected via NFC',
    fr: 'Connecté via NFC',
    de: 'Über NFC verbunden',
    es: 'Conectado vía NFC',
    it: 'Connesso via NFC'
  },
  qrFallbackLabel: {
    ru: 'Не получилось через NFC?',
    en: "NFC didn't work?",
    fr: "Le NFC n'a pas fonctionné ?",
    de: 'NFC hat nicht funktioniert?',
    es: '¿No funcionó el NFC?',
    it: "L'NFC non ha funzionato?"
  },
  qrFallbackHint: {
    ru: 'Покажите этот QR-код собеседнику со своего экрана — он откроет ту же карточку камерой телефона.',
    en: 'Show this QR code on your screen — they can scan it with their camera to open the same card.',
    fr: "Montrez ce code QR sur votre écran — il pourra l'ouvrir en le scannant avec son appareil photo.",
    de: 'Zeigen Sie diesen QR-Code auf Ihrem Bildschirm — er kann ihn mit der Kamera scannen, um dieselbe Karte zu öffnen.',
    es: 'Muestra este código QR en tu pantalla — podrá escanearlo con la cámara para abrir la misma tarjeta.',
    it: 'Mostra questo codice QR sul tuo schermo — potrà scansionarlo con la fotocamera per aprire la stessa scheda.'
  },
  disabledTitle: {
    ru: 'Карточка временно отключена',
    en: 'This card is temporarily disabled',
    fr: 'Cette carte est temporairement désactivée',
    de: 'Diese Karte ist vorübergehend deaktiviert',
    es: 'Esta tarjeta está temporalmente desactivada',
    it: 'Questa scheda è temporaneamente disattivata'
  },
  disabledHint: {
    ru: 'Владелец приостановил эту карточку. Обратитесь к тому, кто её выдал.',
    en: 'The owner has paused this card. Please contact whoever gave it to you.',
    fr: "Le propriétaire a mis cette carte en pause. Contactez la personne qui vous l'a remise.",
    de: 'Der Besitzer hat diese Karte pausiert. Bitte wenden Sie sich an die Person, die sie Ihnen gegeben hat.',
    es: 'El propietario ha pausado esta tarjeta. Contacta con quien te la dio.',
    it: 'Il proprietario ha messo in pausa questa scheda. Contatta chi te l\'ha data.'
  },
  notFoundTitle: {
    ru: 'Карточка не найдена',
    en: 'Card not found',
    fr: 'Carte introuvable',
    de: 'Karte nicht gefunden',
    es: 'Tarjeta no encontrada',
    it: 'Scheda non trovata'
  },
  notFoundHint: {
    ru: 'Эта ссылка недействительна или карточка была удалена.',
    en: 'This link is invalid or the card has been deleted.',
    fr: "Ce lien n'est pas valide ou la carte a été supprimée.",
    de: 'Dieser Link ist ungültig oder die Karte wurde gelöscht.',
    es: 'Este enlace no es válido o la tarjeta ha sido eliminada.',
    it: 'Questo link non è valido o la scheda è stata eliminata.'
  },
  tabLinks: { ru: 'Ссылки', en: 'Links', fr: 'Liens', de: 'Links', es: 'Enlaces', it: 'Link' },
  tabGallery: { ru: 'Галерея', en: 'Gallery', fr: 'Galerie', de: 'Galerie', es: 'Galería', it: 'Galleria' },
  tabSchedule: { ru: 'Часы', en: 'Schedule', fr: 'Horaires', de: 'Öffnungszeiten', es: 'Horario', it: 'Orari' },
  tabAddress: { ru: 'Адрес', en: 'Address', fr: 'Adresse', de: 'Adresse', es: 'Dirección', it: 'Indirizzo' },
  socialsLabel: { ru: 'Соцсети', en: 'Socials', fr: 'Réseaux sociaux', de: 'Soziale Netzwerke', es: 'Redes sociales', it: 'Social' },
  messengersLabel: { ru: 'Мессенджеры', en: 'Messengers', fr: 'Messageries', de: 'Messenger', es: 'Mensajería', it: 'Messaggistica' },
  noLinksYet: {
    ru: 'Пока нет ссылок.', en: 'No links yet.', fr: 'Pas encore de liens.',
    de: 'Noch keine Links.', es: 'Todavía no hay enlaces.', it: 'Nessun link ancora.'
  },
  noPhotosYet: {
    ru: 'Пока нет фото.', en: 'No photos yet.', fr: 'Pas encore de photos.',
    de: 'Noch keine Fotos.', es: 'Todavía no hay fotos.', it: 'Nessuna foto ancora.'
  },
  hoursNotProvided: {
    ru: 'Часы работы не указаны.', en: 'Hours not provided.', fr: "Horaires non renseignés.",
    de: 'Öffnungszeiten nicht angegeben.', es: 'Horario no indicado.', it: 'Orari non indicati.'
  },
  addressNotProvided: {
    ru: 'Адрес не указан.', en: 'Address not provided.', fr: 'Adresse non renseignée.',
    de: 'Adresse nicht angegeben.', es: 'Dirección no indicada.', it: 'Indirizzo non indicato.'
  },
  openInMaps: {
    ru: 'Открыть на карте', en: 'Open in Maps', fr: 'Ouvrir dans Maps', de: 'In Karten öffnen',
    es: 'Abrir en Maps', it: 'Apri in Mappe'
  },
  privacyLabel: {
    ru: 'Политика конфиденциальности', en: 'Privacy', fr: 'Confidentialité', de: 'Datenschutz',
    es: 'Privacidad', it: 'Privacy'
  },
  privacyPageTitle: {
    ru: 'Конфиденциальность — Digilama', en: 'Privacy Policy — Digilama', fr: 'Confidentialité — Digilama',
    de: 'Datenschutz — Digilama', es: 'Privacidad — Digilama', it: 'Privacy — Digilama'
  },
  privacyH1: {
    ru: 'Политика конфиденциальности', en: 'Privacy Policy', fr: 'Politique de confidentialité',
    de: 'Datenschutzerklärung', es: 'Política de privacidad', it: 'Informativa sulla privacy'
  },
  privacyS1Title: {
    ru: 'Какие данные хранятся', en: 'What data is stored', fr: 'Quelles données sont stockées',
    de: 'Welche Daten werden gespeichert', es: 'Qué datos se almacenan', it: 'Quali dati vengono memorizzati'
  },
  privacyS1Body: {
    ru: 'Владелец этой системы (администратор) вручную создаёт цифровые карточки и указывает в них данные: имя, телефон, email, компанию, должность и ссылки на соцсети — для карточек-профилей; либо адрес сайта, картинку, данные Wi‑Fi или произвольный текст — для остальных типов карточек.',
    en: 'The owner of this system (administrator) manually creates digital cards and enters data into them: name, phone, email, company, job title and social links — for profile cards; or website address, image, Wi‑Fi details or custom text — for other card types.',
    fr: "Le propriétaire de ce système (administrateur) crée manuellement des cartes numériques et y saisit des données : nom, téléphone, email, entreprise, poste et liens sociaux — pour les cartes de profil ; ou adresse du site, image, informations Wi‑Fi ou texte personnalisé — pour les autres types de cartes.",
    de: 'Der Inhaber dieses Systems (Administrator) erstellt manuell digitale Karten und trägt darin Daten ein: Name, Telefon, E‑Mail, Unternehmen, Position und Social‑Media‑Links — für Profilkarten; oder Website‑Adresse, Bild, WLAN‑Daten oder freien Text — für andere Kartentypen.',
    es: 'El propietario de este sistema (administrador) crea manualmente tarjetas digitales e introduce en ellas datos: nombre, teléfono, email, empresa, puesto y enlaces sociales — para tarjetas de perfil; o dirección web, imagen, datos de Wi‑Fi o texto personalizado — para otros tipos de tarjeta.',
    it: 'Il proprietario di questo sistema (amministratore) crea manualmente schede digitali e vi inserisce dati: nome, telefono, email, azienda, ruolo e link social — per le schede profilo; oppure indirizzo del sito, immagine, dati Wi‑Fi o testo personalizzato — per gli altri tipi di scheda.'
  },
  privacyS2Title: {
    ru: 'Кто видит эти данные', en: 'Who can see this data', fr: 'Qui voit ces données',
    de: 'Wer sieht diese Daten', es: 'Quién ve estos datos', it: 'Chi vede questi dati'
  },
  privacyS2Body: {
    ru: 'Информация в карточке становится доступна любому, кто откроет её публичную ссылку — например, поднеся физическую NFC‑карту к телефону или отсканировав QR‑код. Специального поиска или каталога всех карточек в открытом доступе нет.',
    en: 'Information on a card becomes visible to anyone who opens its public link — for example, by tapping a physical NFC card to their phone or scanning a QR code. There is no search or public catalog of all cards.',
    fr: "Les informations d'une carte deviennent visibles pour toute personne qui ouvre son lien public — par exemple en approchant une carte NFC physique de son téléphone ou en scannant un code QR. Il n'existe pas de recherche ni de catalogue public de toutes les cartes.",
    de: 'Informationen auf einer Karte werden für jeden sichtbar, der ihren öffentlichen Link öffnet — zum Beispiel durch Halten einer physischen NFC‑Karte an das Telefon oder Scannen eines QR‑Codes. Es gibt keine Suche oder öffentliche Übersicht aller Karten.',
    es: 'La información de una tarjeta es visible para cualquiera que abra su enlace público — por ejemplo, acercando una tarjeta NFC física al teléfono o escaneando un código QR. No existe búsqueda ni catálogo público de todas las tarjetas.',
    it: 'Le informazioni di una scheda diventano visibili a chiunque apra il suo link pubblico — ad esempio avvicinando una scheda NFC fisica al telefono o scansionando un codice QR. Non esiste una ricerca o un catalogo pubblico di tutte le schede.'
  },
  privacyS3Title: {
    ru: 'Файлы cookie', en: 'Cookies', fr: 'Cookies', de: 'Cookies', es: 'Cookies', it: 'Cookie'
  },
  privacyS3Body: {
    ru: 'Используются только технически необходимые cookie: сессия входа администратора и выбранный посетителем язык интерфейса карточки. Рекламных или аналитических cookie сторонних сервисов не используется.',
    en: "Only technically necessary cookies are used: the administrator's login session and the visitor's chosen card interface language. No third‑party advertising or analytics cookies are used.",
    fr: "Seuls les cookies techniquement nécessaires sont utilisés : la session de connexion de l'administrateur et la langue d'interface choisie par le visiteur. Aucun cookie publicitaire ou d'analyse tiers n'est utilisé.",
    de: 'Es werden nur technisch notwendige Cookies verwendet: die Login‑Sitzung des Administrators und die vom Besucher gewählte Sprache der Kartenoberfläche. Es werden keine Werbe‑ oder Analyse‑Cookies von Drittanbietern verwendet.',
    es: 'Solo se utilizan cookies técnicamente necesarias: la sesión de inicio de sesión del administrador y el idioma de la interfaz elegido por el visitante. No se utilizan cookies publicitarias ni de análisis de terceros.',
    it: 'Vengono utilizzati solo cookie tecnicamente necessari: la sessione di accesso dell\'amministratore e la lingua dell\'interfaccia scelta dal visitatore. Non vengono utilizzati cookie pubblicitari o di analisi di terze parti.'
  },
  privacyS4Title: {
    ru: 'Статистика просмотров', en: 'View statistics', fr: 'Statistiques de consultation',
    de: 'Aufrufstatistik', es: 'Estadísticas de visualización', it: 'Statistiche di visualizzazione'
  },
  privacyS4Body: {
    ru: 'Система считает количество открытий каждой карточки и время последнего открытия — без сбора личных данных посетителей (IP, местоположение, устройство не сохраняются).',
    en: "The system counts how many times each card was opened and the time of the last open — without collecting visitors' personal data (IP address, location, and device are not stored).",
    fr: "Le système compte le nombre d'ouvertures de chaque carte et l'heure de la dernière ouverture — sans collecter de données personnelles des visiteurs (l'IP, la localisation et l'appareil ne sont pas enregistrés).",
    de: 'Das System zählt, wie oft jede Karte geöffnet wurde, und den Zeitpunkt des letzten Aufrufs — ohne persönliche Daten der Besucher zu erfassen (IP‑Adresse, Standort und Gerät werden nicht gespeichert).',
    es: 'El sistema cuenta cuántas veces se abrió cada tarjeta y la hora de la última apertura — sin recopilar datos personales de los visitantes (no se guardan la IP, la ubicación ni el dispositivo).',
    it: "Il sistema conta quante volte è stata aperta ogni scheda e l'orario dell'ultima apertura — senza raccogliere dati personali dei visitatori (IP, posizione e dispositivo non vengono memorizzati)."
  },
  privacyS5Title: {
    ru: 'Изменение или удаление данных', en: 'Changing or deleting data', fr: 'Modifier ou supprimer des données',
    de: 'Daten ändern oder löschen', es: 'Cambiar o eliminar datos', it: 'Modifica o eliminazione dei dati'
  },
  privacyS5Body: {
    ru: 'Если вы указаны в чьей-то карточке и хотите изменить или удалить свои данные — обратитесь к человеку или организации, которые выдали вам эту карточку: именно они управляют её содержимым.',
    en: "If you appear on someone else's card and want to change or delete your data, please contact the person or organization that issued you the card — they manage its content.",
    fr: "Si vous apparaissez sur la carte de quelqu'un d'autre et souhaitez modifier ou supprimer vos données, veuillez contacter la personne ou l'organisation qui vous a remis cette carte — c'est elle qui en gère le contenu.",
    de: 'Wenn Sie auf der Karte einer anderen Person erscheinen und Ihre Daten ändern oder löschen möchten, wenden Sie sich bitte an die Person oder Organisation, die Ihnen die Karte ausgestellt hat — sie verwaltet deren Inhalt.',
    es: 'Si apareces en la tarjeta de otra persona y deseas cambiar o eliminar tus datos, ponte en contacto con la persona u organización que te entregó la tarjeta — son quienes gestionan su contenido.',
    it: "Se compari nella scheda di qualcun altro e desideri modificare o eliminare i tuoi dati, contatta la persona o l'organizzazione che te l'ha consegnata — sono loro a gestirne il contenuto."
  },
  privacyBackLink: {
    ru: '← На главную', en: '← Back to home', fr: "← Retour à l'accueil", de: '← Zurück zur Startseite',
    es: '← Volver al inicio', it: '← Torna alla home'
  },
  claimTitle: {
    ru: 'Активируйте свою карточку', en: 'Activate your card', fr: 'Activez votre carte',
    de: 'Aktivieren Sie Ihre Karte', es: 'Activa tu tarjeta', it: 'Attiva la tua scheda'
  },
  claimHint: {
    ru: 'Эта NFC-карта ещё никому не принадлежит. Создайте аккаунт (или войдите в существующий), и она навсегда станет вашей — заполнить её можно будет в любой момент.',
    en: "This NFC card doesn't belong to anyone yet. Create an account (or sign in to an existing one) and it will become yours for good — you can fill it in any time.",
    fr: "Cette carte NFC n'appartient encore à personne. Créez un compte (ou connectez-vous à un compte existant) et elle deviendra définitivement la vôtre — vous pourrez la remplir à tout moment.",
    de: 'Diese NFC-Karte gehört noch niemandem. Erstellen Sie ein Konto (oder melden Sie sich bei einem bestehenden an), und sie gehört dauerhaft Ihnen — Sie können sie jederzeit ausfüllen.',
    es: 'Esta tarjeta NFC todavía no pertenece a nadie. Crea una cuenta (o inicia sesión en una existente) y será tuya para siempre — podrás completarla en cualquier momento.',
    it: 'Questa scheda NFC non appartiene ancora a nessuno. Crea un account (o accedi a uno esistente) e diventerà tua per sempre — potrai compilarla in qualsiasi momento.'
  },
  claimAlreadyLoggedInHint: {
    ru: 'Вы уже вошли в аккаунт. Привяжите эту карточку к нему в один клик.',
    en: "You're already signed in. Attach this card to your account in one click.",
    fr: 'Vous êtes déjà connecté. Associez cette carte à votre compte en un clic.',
    de: 'Sie sind bereits angemeldet. Verknüpfen Sie diese Karte mit einem Klick mit Ihrem Konto.',
    es: 'Ya has iniciado sesión. Vincula esta tarjeta a tu cuenta con un clic.',
    it: 'Hai già effettuato l\'accesso. Collega questa scheda al tuo account con un clic.'
  },
  claimAttachButton: {
    ru: 'Привязать карточку к моему аккаунту', en: 'Attach card to my account', fr: 'Associer la carte à mon compte',
    de: 'Karte mit meinem Konto verknüpfen', es: 'Vincular tarjeta a mi cuenta', it: 'Collega la scheda al mio account'
  },
  claimNameLabel: {
    ru: 'Имя', en: 'Full name', fr: 'Nom complet', de: 'Name', es: 'Nombre', it: 'Nome'
  },
  claimEmailLabel: {
    ru: 'Email', en: 'Email', fr: 'Email', de: 'E-Mail', es: 'Correo', it: 'Email'
  },
  claimPasswordLabel: {
    ru: 'Пароль', en: 'Password', fr: 'Mot de passe', de: 'Passwort', es: 'Contraseña', it: 'Password'
  },
  claimConfirmPasswordLabel: {
    ru: 'Повторите пароль', en: 'Confirm password', fr: 'Confirmez le mot de passe',
    de: 'Passwort bestätigen', es: 'Confirma la contraseña', it: 'Conferma password'
  },
  claimEmailHint: {
    ru: 'Если у вас уже есть аккаунт Digilama, просто введите его email и пароль — карточка добавится к нему.',
    en: 'If you already have a Digilama account, just enter its email and password — the card will be added to it.',
    fr: 'Si vous avez déjà un compte Digilama, saisissez simplement son email et son mot de passe — la carte y sera ajoutée.',
    de: 'Wenn Sie bereits ein Digilama-Konto haben, geben Sie einfach dessen E-Mail und Passwort ein — die Karte wird hinzugefügt.',
    es: 'Si ya tienes una cuenta de Digilama, introduce su email y contraseña — la tarjeta se añadirá a ella.',
    it: 'Se hai già un account Digilama, inserisci semplicemente la sua email e password — la scheda verrà aggiunta.'
  },
  claimMethodEmail: {
    ru: 'Email', en: 'Email', fr: 'Email', de: 'E-Mail', es: 'Correo', it: 'Email'
  },
  claimMethodPhone: {
    ru: 'Телефон', en: 'Phone', fr: 'Téléphone', de: 'Telefon', es: 'Teléfono', it: 'Telefono'
  },
  claimPhoneLabel: {
    ru: 'Номер телефона', en: 'Phone number', fr: 'Numéro de téléphone',
    de: 'Telefonnummer', es: 'Número de teléfono', it: 'Numero di telefono'
  },
  claimPhoneHint: {
    ru: 'Без SMS-подтверждения — просто придумайте пароль для входа по этому номеру.',
    en: 'No SMS confirmation — just set a password to sign in with this number.',
    fr: 'Aucune confirmation par SMS — définissez simplement un mot de passe pour vous connecter avec ce numéro.',
    de: 'Keine SMS-Bestätigung — legen Sie einfach ein Passwort für die Anmeldung mit dieser Nummer fest.',
    es: 'Sin confirmación por SMS — simplemente crea una contraseña para acceder con este número.',
    it: 'Nessuna conferma via SMS — imposta semplicemente una password per accedere con questo numero.'
  },
  claimPasswordWarning: {
    ru: '⚠ Сохраните пароль в надёжном месте — восстановить его позже будет нельзя.',
    en: "⚠ Save this password somewhere safe — it can't be recovered later.",
    fr: "⚠ Enregistrez ce mot de passe en lieu sûr — il ne pourra pas être récupéré plus tard.",
    de: '⚠ Bewahren Sie dieses Passwort sicher auf — es kann später nicht wiederhergestellt werden.',
    es: '⚠ Guarda esta contraseña en un lugar seguro — no se podrá recuperar más adelante.',
    it: '⚠ Conserva questa password in un posto sicuro — non potrà essere recuperata in seguito.'
  },
  claimSubmit: {
    ru: 'Активировать карточку', en: 'Activate card', fr: 'Activer la carte',
    de: 'Karte aktivieren', es: 'Activar tarjeta', it: 'Attiva scheda'
  }
};

function translate(lang, key) {
  const entry = DICTIONARY[key];
  if (!entry) return key;
  return entry[lang] || entry[DEFAULT_LANG];
}

function resolveLang(req, res) {
  const supported = LANGUAGES.map((l) => l.code);
  const fromQuery = (req.query.lang || '').toString();
  if (supported.includes(fromQuery)) {
    res.cookie('lang', fromQuery, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
    return fromQuery;
  }
  const fromCookie = (req.cookies && req.cookies.lang) || '';
  if (supported.includes(fromCookie)) return fromCookie;
  return DEFAULT_LANG;
}

module.exports = { LANGUAGES, DEFAULT_LANG, translate, resolveLang };
