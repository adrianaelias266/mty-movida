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
];
