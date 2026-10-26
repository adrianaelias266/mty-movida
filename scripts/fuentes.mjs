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
  { nombre: 'Parque Fundidora', sitio: 'https://www.parquefundidora.org', filtro: /(evento|event|agenda)/, municipio: 'centro' },
  { nombre: 'Festival Internacional de Santa Lucía', sitio: 'https://festivalsantalucia.gob.mx', filtro: /(evento|event|programa|agenda)/, municipio: 'centro' },
  { nombre: 'Casa Motis', sitio: 'https://www.casamotis.com', filtro: /\/detalles-y-registro\//, municipio: 'centro' },
  // "paginas": se leen directo, sin buscar en el mapa del sitio
  { nombre: 'Metapatio', sitio: 'https://www.songkick.com', paginas: ['https://www.songkick.com/venues/3675169-metapatio'], filtro: /./, municipio: 'centro' },
  { nombre: 'Bloom Entertainment', sitio: 'https://www.eventbrite.com.mx', paginas: ['https://www.eventbrite.com.mx/o/bloom-entertainment-62162028433'], enlaces: /eventbrite\.com\.mx\/e\//, filtro: /./, municipio: 'centro' },
  { nombre: 'Casa Padre Mier', sitio: 'https://www.eventbrite.com.mx', paginas: ['https://www.eventbrite.com.mx/o/casa-padre-mier-34353364941'], enlaces: /eventbrite\.com\.mx\/e\//, filtro: /./, municipio: 'centro' },
  { nombre: 'San Pedro Parques', sitio: 'https://sanpedroparques.mx', paginas: ['https://sanpedroparques.mx/calendario-eventos/'], navegador: true, filtro: /./, municipio: 'sanpedro',
    excluir: /cobro|yoga|pilates|tenis|tai ?chi|basquet|b[aá]squet|atletismo|roundnet|disc golf|skate|falun|hipopresivos|meditaci|mindfulness|sonidoterapia|cuencos|salsa con|rollerdance|running|esgrima|futb|adiestramiento|huerto|academia|zumba|entrenamiento|funcional|softbol|b[eé]isbol|soccer|corredores|patines|ritmos latinos/i },
  // Boletera PrimeTickets: se lee la portada y la página de cada obra
  { nombre: 'Foro 13', sitio: 'https://foro13.primetickets.mx/', lector: 'primetickets', lugar: 'Foro 13, Hidalgo 511, Centro', lugarCorto: 'FORO 13', municipio: 'centro' },
];
