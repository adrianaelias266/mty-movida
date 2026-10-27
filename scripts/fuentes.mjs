// Sitios que el recolector revisa cada noche.
// Para agregar uno nuevo, copia un bloque y cambia los datos.
//   nombre:   cómo aparece la fuente en la página
//   sitio:    dirección principal del sitio
//   filtro:   palabras que debe tener la dirección de cada página de evento
//   municipio: municipio que se usa si la página no dice dónde es
//   paginas:  páginas que se leen directo, sin buscar en el mapa del sitio
//   enlaces:  si se pone, de esas páginas se siguen los enlaces que coincidan (cada uno es un evento)
//   navegador: true si la página arma su calendario con JavaScript
//   excluir:  nombres de eventos que no se toman en cuenta
export const FUENTES = [
  { nombre: 'CONARTE', sitio: 'https://conarte.org.mx', filtro: /\/(agenda|exposiciones|cineteca)\//, municipio: 'centro' },
  { nombre: 'Parque Fundidora', sitio: 'https://www.parquefundidora.org', lector: 'tribe', lugar: 'Parque Fundidora, Monterrey', municipio: 'centro' },
  { nombre: 'Festival Internacional de Santa Lucía', sitio: 'https://festivalsantalucia.gob.mx', filtro: /(evento|event|programa|agenda)/, municipio: 'centro' },
  { nombre: 'Casa Motis', sitio: 'https://www.casamotis.com', filtro: /\/detalles-y-registro\//, municipio: 'centro' },
  // "paginas": se leen directo, sin buscar en el mapa del sitio
  { nombre: 'Metapatio', sitio: 'https://www.songkick.com', paginas: ['https://www.songkick.com/venues/3675169-metapatio'], filtro: /./, municipio: 'centro', limpiarNombre: /\s+@\s+.*$/ },
  // Cinema Río 70 (Barrio Antiguo): su cartelera de conciertos en Songkick
  { nombre: 'Cinema Río 70', sitio: 'https://www.songkick.com', paginas: ['https://www.songkick.com/venues/3331604-cinema-rio-70'], filtro: /./, municipio: 'centro', cat: 'concierto', organizadorLugar: true, limpiarNombre: /\s+@\s+.*$/ },
  // Estrenos de cine de la semana (Cinemex). Cinépolis bloquea la lectura automática.
  { nombre: 'Cinemex', sitio: 'https://cinemex.com/proximos-estrenos', lector: 'cinemex', lugar: 'Cines de Monterrey y su zona metropolitana', municipio: 'centro' },
  // Ticketmaster (todo lo que vende a 60 km de Monterrey). Requiere la llave TICKETMASTER_KEY en GitHub › Secrets.
  { nombre: 'Ticketmaster', sitio: 'https://www.ticketmaster.com.mx', lector: 'ticketmaster', municipio: 'centro',
    excluir: /estacionamiento|parking|vip|paquete|upgrade|meet ?(and|&) ?greet|abono/i },
  // Passline: no deja leer su buscador; los eventos se guardan cada semana desde el navegador en este archivo
  { nombre: 'Passline', sitio: 'https://www.passline.com', lector: 'archivo', archivo: 'public/data/passline.json', municipio: 'centro' },
  // Monterrey Secreto: publica notas, no eventos; los datos se toman de sus notas desde el navegador y se guardan aquí (con enlace a la nota)
  { nombre: 'Monterrey Secreto', sitio: 'https://monterreysecreto.com', lector: 'archivo', archivo: 'public/data/monterrey-secreto.json', municipio: 'centro' },
  // Todos los conciertos de la zona de Monterrey en Songkick (la lista ya trae cada evento completo)
  { nombre: 'Songkick', sitio: 'https://www.songkick.com', lista: 'https://www.songkick.com/metro-areas/31051-mexico-monterrey', listaDirecta: true, paginasLista: 6, filtro: /./, municipio: 'centro', cat: 'concierto', organizadorLugar: true, limpiarNombre: /\s+@\s+.*$/ },
  // MARCO, Museo de Arte Contemporáneo: exposiciones vigentes
  { nombre: 'MARCO', sitio: 'https://www.marco.org.mx', lector: 'marco', lugar: 'MARCO, Zuazua y Jardón, Centro', municipio: 'centro' },
  // Superboletos: todo lo que vende en Nuevo León (Arena Monterrey, Auditorio, Showcenter, etc.)
  { nombre: 'Superboletos', sitio: 'https://www.superboletos.com', lector: 'superboletos', municipio: 'centro',
    datos: 'https://dl09mj2qf37fz.cloudfront.net/SuperBoletosRepositorio/apps/jsonCache/27768/catalogos/search.json', enlace: 'https://www.superboletos.com/landing-evento/',
    excluir: /backstage|meet ?(and|&) ?greet|vip|paquete|estacionamiento|abono|upgrade/i },
  // Cultura UANL (Colegio Civil, Teatro Universitario y más): calendario de WordPress
  { nombre: 'Cultura UANL', sitio: 'https://cultura.uanl.mx', lector: 'tribe', lugar: 'UANL, Monterrey', municipio: 'centro' },
  // Fever (conciertos a la luz de las velas, obras y experiencias): se siguen los enlaces de cada plan; solo planes a menos de 60 km de Monterrey
  { nombre: 'Fever', sitio: 'https://feverup.com', paginas: ['https://feverup.com/es/monterrey', 'https://feverup.com/es/monterrey/eventos-musicales', 'https://feverup.com/es/monterrey/teatro'], enlaces: /feverup\.com\/m\/\d+/, filtro: /./, municipio: 'centro', organizadorDelEvento: true, organizadorLugar: true,
    planFever: true, radioKm: 60, excluir: /tarjeta regalo|lista de espera/i },
  { nombre: 'Bloom Entertainment', sitio: 'https://www.eventbrite.com.mx', paginas: ['https://www.eventbrite.com.mx/o/bloom-entertainment-62162028433'], enlaces: /eventbrite\.com\.mx\/e\//, filtro: /./, municipio: 'centro' },
  { nombre: 'Casa Padre Mier', sitio: 'https://www.eventbrite.com.mx', paginas: ['https://www.eventbrite.com.mx/o/casa-padre-mier-34353364941'], enlaces: /eventbrite\.com\.mx\/e\//, filtro: /./, municipio: 'centro' },
  { nombre: 'San Pedro Parques', sitio: 'https://sanpedroparques.mx', paginas: ['https://sanpedroparques.mx/calendario-eventos/'], navegador: true, filtro: /./, municipio: 'sanpedro',
    excluir: /cobro|yoga|pilates|tenis|tai ?chi|basquet|b[aá]squet|atletismo|roundnet|disc golf|skate|falun|hipopresivos|meditaci|mindfulness|sonidoterapia|cuencos|salsa con|rollerdance|running|esgrima|futb|adiestramiento|huerto|academia|zumba|entrenamiento|funcional|softbol|b[eé]isbol|soccer|corredores|patines|ritmos latinos/i },
  // Organizadores de Nuevo León en Eventbrite (Eventbrite no deja leer su buscador, pero sí la página de cada organizador).
  // Para sumar uno, copia la parte final de su dirección: eventbrite.com.mx/o/ESTA-PARTE
  { nombre: 'Eventbrite', sitio: 'https://www.eventbrite.com.mx', organizadorDelEvento: true, enlaces: /eventbrite\.com(\.mx)?\/e\//, filtro: /./, municipio: 'centro', soloEstado: /^(NLE|NL|Nuevo Le[oó]n)$/i,
    paginas: [
      'saturno-120681931210',
      'princeso-114136685981',
      'portales-agency-77726180153',
      'kindergarden-56530109043',
      'clasificacion-c-95899791113',
      'neo-entretainment-97631639783',
      'bassalto-115649149631',
      'rezzet-haus-108911604661',
      'emiliano-hernandez-79509093793',
      'tumba2-crew-121047906227',
      'geronimo-coronado-69363880963',
      'resonar-74000773583',
      'dialogo-en-la-oscuridad-monterrey-31294209711',
      'techno-monterrey-120808265402',
      'san-palma-studiomonterrey-120050414321',
      'omar-marquez-120861329267',
      'benjamin-franklin-innovation-center-121845102812',
      'sol-sonoro-121841035539',
      'yonder-nutrition-108145801301',
      'relaciones-culturales-120656419872'
    ].map(o => `https://www.eventbrite.com.mx/o/${o}`),
    excluir: /cumbre|congreso nacional de|summit|diplomado|certificaci|webinar|capacitaci|negocio|emprend|inversi|bienes ra[ií]ces|liderazgo|n[oó]mina|m[eé]dic|c[aá]ncer|networking|ventas|marketing|finanzas/i },
  // Centro Cívitas: su página de eventos lee esta lista de datos
  { nombre: 'Centro Cívitas', sitio: 'https://ccivitas.mx/eventos/', lector: 'civitas', datos: 'https://ccivitas-events.esbeto.deno.net/events', municipio: 'centro' },
  // LABNL Lab Cultural Ciudadano
  { nombre: 'LABNL', sitio: 'https://www.labnuevoleon.mx', lector: 'payload', lugar: 'LABNL Lab Cultural Ciudadano, Centro, Monterrey', municipio: 'centro' },
  // Eventos del Gobierno de Nuevo León
  { nombre: 'Gobierno de Nuevo León', sitio: 'https://beta.nl.gob.mx/es/eventos', lector: 'nlgob', lista: 'https://beta.nl.gob.mx/es/eventos', municipio: 'centro' },
  // Boletera PrimeTickets: se lee la portada y la página de cada obra
  // Chipinque: su página es una aplicación que lee esta lista de eventos
  { nombre: 'Chipinque', sitio: 'https://www.chipinque.org.mx/inicio/eventos', lector: 'chipinque', datos: 'https://chipinque-api-prod.onrender.com/api/v1/events', medios: 'https://chipinque-api-prod.onrender.com/media/', municipio: 'sanpedro' },
  { nombre: 'Foro 13', sitio: 'https://foro13.primetickets.mx/', lector: 'primetickets', lugar: 'Foro 13, Hidalgo 511, Centro', lugarCorto: 'FORO 13', municipio: 'centro' },
];
