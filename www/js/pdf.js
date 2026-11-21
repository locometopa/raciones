/* PDF mínimo: cada página es una imagen JPEG a tamaño A4. Sin librerías.
   PDF.fromJpegs([{b64, w, h}]) → PDF en base64. */
var PDF = (function () {
  'use strict';
  function b64ToBytes(b64) {
    var bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    var u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u;
  }
  function bytesToB64(u) {
    var s = ''; for (var i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
  }
  function fromJpegs(pages, title) {
    var W = 595.28, H = 841.89; // A4 en puntos
    var parts = [], len = 0, offs = [];
    function add(x) { var u = typeof x === 'string' ? strBytes(x) : x; parts.push(u); len += u.length; }
    function strBytes(str) { var u = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) u[i] = str.charCodeAt(i) & 255; return u; }
    function obj(n, body) { offs[n] = len; add(n + ' 0 obj\n'); body(); add('\nendobj\n'); }
    var n = pages.length, kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    obj(1, function () { add('<< /Type /Catalog /Pages 2 0 R >>'); });
    obj(2, function () { add('<< /Type /Pages /Count ' + n + ' /Kids [' + kids.join(' ') + '] >>'); });
    pages.forEach(function (pg, i) {
      var pn = 3 + i * 3, img = pn + 1, cn = pn + 2, data = b64ToBytes(pg.b64);
      var cs = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
      obj(pn, function () { add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + img + ' 0 R >> >> /Contents ' + cn + ' 0 R >>'); });
      obj(img, function () { add('<< /Type /XObject /Subtype /Image /Width ' + pg.w + ' /Height ' + pg.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + data.length + ' >>\nstream\n'); add(data); add('\nendstream'); });
      obj(cn, function () { add('<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream'); });
    });
    var total = 3 + n * 3, xref = len;
    var x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (var k = 1; k < total; k++) x += ('0000000000' + offs[k]).slice(-10) + ' 00000 n \n';
    add(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R /Info << /Title (' + String(title || 'Informe').replace(/[()\\]/g, '') + ') /Producer (iocrino) >> >>\nstartxref\n' + xref + '\n%%EOF\n');
    var out = new Uint8Array(len), o = 0; parts.forEach(function (u) { out.set(u, o); o += u.length; });
    return bytesToB64(out);
  }
  var api = { fromJpegs: fromJpegs, b64ToBytes: b64ToBytes, bytesToB64: bytesToB64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  return api;
})();
