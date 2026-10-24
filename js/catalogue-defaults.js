/* Default product catalogue: kitchen cabinets ("boxes") — 39 base cabinets and 25 wall cabinets, with their pictures (media/boxes).
   It is added ONCE to the shared catalogue by the first person who can edit it (js/catalogue.js, applyDefaults), so every
   present and future user finds it in Product Catalogue. Everything in it can be edited or deleted later; deleted items do not come back.
   All products start UNPUBLISHED. Codes and sizes are those printed on the pictures (sizes: height × width × depth, mm). */
(function () {
  'use strict';

  const VERSION = 'boxes-v1';

  // fields of the "Kitchen cabinet" form (fixed ids, so the products' values stay readable)
  const fld = (id, label, type, required) => ({ id, label, type, required: !!required, options: '' });
  const FIELDS = [
    fld('kb-code', 'Code', 'text', true), fld('kb-w', 'Width, mm', 'number', true), fld('kb-h', 'Height, mm', 'number'), fld('kb-d', 'Depth, mm', 'number'),
    fld('kb-doors', 'Doors', 'number'), fld('kb-drawers', 'Drawers', 'number'),
    fld('kb-glass', 'Glass door', 'checkbox'), fld('kb-corner', 'Corner cabinet', 'checkbox'),
    fld('kb-mat', 'Body material', 'text'), fld('kb-soft', 'Soft-close', 'checkbox')
  ];
  const FORM = { name: 'Kitchen cabinet', desc: 'Code, size and fittings of a kitchen cabinet (box).', fields: FIELDS };
  const TYPES = [
    { id: 'tp-base', name: 'Base cabinet', desc: 'Floor cabinets under the worktop (height 850 mm).' },
    { id: 'tp-wall', name: 'Wall cabinet', desc: 'Cabinets on the wall above the worktop.' }
  ];

  // [file, type(b/w), code, width, height, depth, doors, drawers, flags, kind, note]
  //   flags: g = glass door, c = corner
  const ROWS = [
    ['bottom-01', 'b', 'ШН 300', 300, 850, 480, 1, 0, '', '1 door'],
    ['bottom-02', 'b', 'ШН 400', 400, 850, 480, 1, 0, '', '1 door'],
    ['bottom-03', 'b', 'ШН 500', 500, 850, 480, 1, 0, '', '1 door'],
    ['bottom-04', 'b', 'ШН 600', 600, 850, 480, 2, 0, '', '2 doors'],
    ['bottom-05', 'b', 'ШН 600м', 600, 850, 480, 1, 0, '', '1 wide door'],
    ['bottom-06', 'b', 'ШН 800', 800, 850, 480, 2, 0, '', '2 doors'],
    ['bottom-07', 'b', 'ШН 1000', 1000, 850, 480, 2, 0, '', '2 doors'],
    ['bottom-08', 'b', 'ШН 1200', 1200, 850, 480, 2, 0, '', '2 doors'],
    ['bottom-09', 'b', 'ШН1Я 300', 300, 850, 480, 1, 1, '', '1 drawer and a door'],
    ['bottom-10', 'b', 'ШН1Я 400', 400, 850, 480, 1, 1, '', '1 drawer and a door'],
    ['bottom-11', 'b', 'ШН1Я 500', 500, 850, 480, 1, 1, '', '1 drawer and a door'],
    ['bottom-12', 'b', 'ШН1Я 600', 600, 850, 480, 2, 1, '', '1 drawer and 2 doors'],
    ['bottom-13', 'b', 'ШН1Я 800', 800, 850, 480, 2, 1, '', '1 drawer and 2 doors'],
    ['bottom-14', 'b', 'ШН1Я 1000R', 1000, 850, 480, 2, 1, '', '1 drawer and 2 doors, right-hand version'],
    ['bottom-15', 'b', 'ШН1Я 1200L', 1200, 850, 480, 2, 1, '', '1 drawer and 2 doors, left-hand version'],
    ['bottom-16', 'b', 'ШНУ 990 / ШНУ 1050', 990, 850, 480, 2, 0, 'c', 'corner base cabinet', 'Two versions: 850×990×480 and 850×1050×600 mm.'],
    ['bottom-17', 'b', 'ШНУ 890 / ШНУ 850', 892, 850, 892, 1, 0, 'c', 'corner base cabinet', 'Two versions: 850×892×892 and 850×850×850 mm.'],
    ['bottom-18', 'b', 'ШН2Я 300', 300, 850, 480, 0, 2, '', '2 drawers'],
    ['bottom-19', 'b', 'ШН2Я 400', 400, 850, 480, 0, 2, '', '2 drawers'],
    ['bottom-20', 'b', 'ШН2Я 500', 500, 850, 480, 0, 2, '', '2 drawers'],
    ['bottom-21', 'b', 'ШН2Я 600', 600, 850, 480, 0, 2, '', '2 drawers'],
    ['bottom-22', 'b', 'ШН2Я 800', 800, 850, 480, 0, 2, '', '2 drawers'],
    ['bottom-23', 'b', 'ШНМ 500', 500, 850, 480, 1, 0, '', 'sink base, 1 door', 'Open frame for a sink.'],
    ['bottom-24', 'b', 'ШНМ 600', 600, 850, 480, 2, 0, '', 'sink base, 2 doors', 'Open frame for a sink.'],
    ['bottom-25', 'b', 'ШНМ 800', 800, 850, 480, 2, 0, '', 'sink base, 2 doors', 'Open frame for a sink.'],
    ['bottom-26', 'b', 'ШНД 600', 600, 850, 480, 0, 1, '', 'oven base, 1 drawer', 'Niche for a built-in oven.'],
    ['bottom-27', 'b', 'ШНБ 150', 150, 850, 480, 1, 0, '', 'narrow bottle cabinet'],
    ['bottom-28', 'b', 'ШНТ 300 L/R', 300, 850, 560, 1, 0, '', 'end cabinet, left or right', 'Shaped end cabinet, depth 560 mm.'],
    ['bottom-29', 'b', 'ШН3Я 300', 300, 850, 480, 0, 3, '', '3 drawers'],
    ['bottom-30', 'b', 'ШН3Я 400', 400, 850, 480, 0, 3, '', '3 drawers'],
    ['bottom-31', 'b', 'ШН3Я 500', 500, 850, 480, 0, 3, '', '3 drawers'],
    ['bottom-32', 'b', 'ШН3Я 600', 600, 850, 480, 0, 3, '', '3 drawers'],
    ['bottom-33', 'b', 'ШН3Я 800', 800, 850, 480, 0, 3, '', '3 drawers'],
    ['bottom-34', 'b', 'ШН4Я 300', 300, 850, 480, 0, 4, '', '4 drawers'],
    ['bottom-35', 'b', 'ШН4Я 400', 400, 850, 480, 0, 4, '', '4 drawers'],
    ['bottom-36', 'b', 'ШН4Я 500', 500, 850, 480, 0, 4, '', '4 drawers'],
    ['bottom-37', 'b', 'ШН4Я 600', 600, 850, 480, 0, 4, '', '4 drawers'],
    ['bottom-38', 'b', 'ШН4Я 800', 800, 850, 480, 0, 4, '', '4 drawers'],
    ['bottom-39', 'b', 'ШНПУ 300 L/R', 300, 850, 540, 0, 0, 'c', 'open corner shelf unit, left or right', 'Open shelves, depth 540 mm.'],
    ['top-01', 'w', 'ШВГС 500', 500, 358, 320, 1, 0, 'g', 'horizontal cabinet with a glass lift-up door', 'Above the hood or tall units.'],
    ['top-02', 'w', 'ШВГС 600', 600, 358, 320, 1, 0, 'g', 'horizontal cabinet with a glass lift-up door', 'Above the hood or tall units.'],
    ['top-03', 'w', 'ШВГС 800', 800, 358, 320, 1, 0, 'g', 'horizontal cabinet with a glass lift-up door', 'Above the hood or tall units.'],
    ['top-04', 'w', 'ШВГ 500', 500, 358, 320, 1, 0, '', 'horizontal cabinet with a lift-up door', 'Above the hood or tall units.'],
    ['top-05', 'w', 'ШВГ 600', 600, 358, 320, 1, 0, '', 'horizontal cabinet with a lift-up door', 'Above the hood or tall units.'],
    ['top-06', 'w', 'ШВГ 800', 800, 358, 320, 1, 0, '', 'horizontal cabinet with a lift-up door', 'Above the hood or tall units.'],
    ['top-07', 'w', 'ШВБ 150', 150, 720, 300, 0, 0, '', 'narrow open shelf unit'],
    ['top-08', 'w', 'ШВПУ 300', 300, 720, 300, 0, 0, 'c', 'open corner shelf unit'],
    ['top-09', 'w', 'ШВТ 224', 224, 720, 320, 1, 0, '', 'end cabinet, 1 door'],
    ['top-10', 'w', 'ШВУ 590 / ШВУ 550', 592, 720, 592, 1, 0, 'c', 'corner wall cabinet', 'Two versions: 720×592×592 and 720×550×550 mm.'],
    ['top-11', 'w', 'ШВС 300', 300, 720, 320, 1, 0, 'g', '1 glass door'],
    ['top-12', 'w', 'ШВС 400', 400, 720, 320, 1, 0, 'g', '1 glass door'],
    ['top-13', 'w', 'ШВС 500', 500, 720, 320, 1, 0, 'g', '1 glass door'],
    ['top-14', 'w', 'ШВС 600', 600, 720, 320, 2, 0, 'g', '2 glass doors'],
    ['top-15', 'w', 'ШВС 800', 800, 720, 320, 2, 0, 'g', '2 glass doors'],
    ['top-16', 'w', 'ШВС 1000', 1000, 720, 320, 2, 0, 'g', '2 glass doors'],
    ['top-17', 'w', 'ШВУС 590 / ШВУС 550', 592, 720, 592, 1, 0, 'cg', 'corner wall cabinet with a glass door', 'Two versions: 720×592×592 and 720×550×550 mm.'],
    ['top-18', 'w', 'ШВ 300', 300, 720, 320, 1, 0, '', '1 door'],
    ['top-19', 'w', 'ШВ 400', 400, 720, 320, 1, 0, '', '1 door'],
    ['top-20', 'w', 'ШВ 500', 500, 720, 320, 1, 0, '', '1 door'],
    ['top-21', 'w', 'ШВ 600', 600, 720, 320, 2, 0, '', '2 doors'],
    ['top-22', 'w', 'ШВ 600м', 600, 720, 320, 1, 0, '', '1 wide door'],
    ['top-23', 'w', 'ШВ 800', 800, 720, 320, 2, 0, '', '2 doors'],
    ['top-24', 'w', 'ШВ 1000', 1000, 720, 320, 2, 0, '', '2 doors'],
    ['top-25', 'w', 'ШВ 1200', 1200, 720, 320, 2, 0, '', '2 doors']
  ];

  const products = () => ROWS.map(([file, t, code, w, h, d, doors, drawers, flags, kind, note], i) => {
    const base = t === 'b';
    return {
      id: 'bx-' + file,
      typeId: base ? 'tp-base' : 'tp-wall',
      name: (base ? 'Base cabinet ' : 'Wall cabinet ') + code,
      price: '',                                   // empty = price on request
      desc: (kind.charAt(0).toUpperCase() + kind.slice(1)) + '. Size ' + h + '×' + w + '×' + d + ' mm (height × width × depth).' + (note ? ' ' + note : ''),
      published: false,                            // never published automatically
      photos: ['media/boxes/' + file + '.jpg'],
      values: { 'kb-code': code, 'kb-w': w, 'kb-h': h, 'kb-d': d, 'kb-doors': doors, 'kb-drawers': drawers, 'kb-glass': flags.includes('g'), 'kb-corner': flags.includes('c'), 'kb-mat': '', 'kb-soft': false },
      at: 1700000000000 + i,
      author: ''
    };
  });

  window.KitchensCatalogueDefaults = { version: VERSION, form: FORM, types: TYPES, products };
})();
