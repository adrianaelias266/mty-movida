// Sitios que el recolector revisa cada noche.
// Para agregar uno nuevo, copia un bloque y cambia los datos.
//   nombre:   cómo aparece la fuente en la página
//   sitio:    dirección principal del sitio
//   filtro:   palabras que debe tener la dirección de cada página de evento
//   municipio: municipio que se usa si la página no dice dónde es
export const FUENTES = [
  { nombre: 'CONARTE', sitio: 'https://conarte.org.mx', filtro: /\/(agenda|exposiciones|cineteca)\//, municipio: 'centro' },
  { nombre: 'Parque Fundidora', sitio: 'https://www.parquefundidora.org', filtro: /(evento|event|agenda)/, municipio: 'centro' },
  { nombre: 'Festival Internacional de Santa Lucía', sitio: 'https://festivalsantalucia.gob.mx', filtro: /(evento|event|programa|agenda)/, municipio: 'centro' },
  { nombre: 'Casa Motis', sitio: 'https://www.casamotis.com', filtro: /\/detalles-y-registro\//, municipio: 'centro' },
  // "paginas": se leen directo, sin buscar en el mapa del sitio
  { nombre: 'Metapatio', sitio: 'https://www.songkick.com', paginas: ['https://www.songkick.com/venues/3675169-metapatio'], filtro: /./, municipio: 'centro' },
  { nombre: 'Bloom Entertainment', sitio: 'https://www.eventbrite.com.mx', paginas: ['https://www.eventbrite.com.mx/o/bloom-entertainment-62162028433'], filtro: /./, municipio: 'centro' },
  { nombre: 'Casa Padre Mier', sitio: 'https://www.eventbrite.com.mx', paginas: ['https://www.eventbrite.com.mx/o/casa-padre-mier-34353364941'], filtro: /./, municipio: 'centro' },
];
