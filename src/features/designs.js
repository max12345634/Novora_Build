// Discord embeds cannot choose arbitrary font families; these are distinct color and layout themes.
const DESIGNS = [
  { id: 'midnight', name: 'Midnight', primaryColor: '#5865F2', accentColor: '#9B8CFF' },
  { id: 'aurora', name: 'Aurora', primaryColor: '#24B8A6', accentColor: '#7DE3D1' },
  { id: 'royal', name: 'Royal', primaryColor: '#7B61FF', accentColor: '#C2A6FF' },
  { id: 'ocean', name: 'Ocean', primaryColor: '#2389DA', accentColor: '#79C7FF' },
  { id: 'ember', name: 'Ember', primaryColor: '#E66B3D', accentColor: '#FFB36B' },
  { id: 'forest', name: 'Forest', primaryColor: '#39835A', accentColor: '#8BD3A5' },
  { id: 'rose', name: 'Rose', primaryColor: '#D94F8A', accentColor: '#FFA4C8' },
  { id: 'graphite', name: 'Graphite', primaryColor: '#596273', accentColor: '#B8C0CC' },
  { id: 'sunrise', name: 'Sunrise', primaryColor: '#D48A24', accentColor: '#FFD36B' },
  { id: 'ice', name: 'Ice', primaryColor: '#4D9CCB', accentColor: '#A8E4FF' }
];
const DESIGN_BY_ID = Object.fromEntries(DESIGNS.map(item => [item.id, item]));
module.exports = { DESIGNS, DESIGN_BY_ID };
