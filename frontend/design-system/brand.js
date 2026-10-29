/* ==========================================================================
   Fundación visual — nombre de producto
   Revisión 1 · Aprobación: pendiente
   Punto único de cambio del nombre visible. Las pantallas y mockups escriben
   <span data-brand-name></span> (o cualquier elemento con ese atributo) y el
   texto se completa acá. Reemplazar este archivo alcanza para renombrar todo.
   Autocontenido: sin dependencias, sin red, sin build.
   ========================================================================== */
(function (global) {
  "use strict";

  // Único dato de marca a reemplazar cuando exista nombre definitivo (TBD).
  var BRAND = {
    name: "Agenda Odontológica",
    shortName: "Agenda",
    provisional: true,
    locale: "es-AR"
  };

  function render(root) {
    var scope = root || global.document;
    if (!scope || !scope.querySelectorAll) return;

    var nodes = scope.querySelectorAll("[data-brand-name]");
    for (var i = 0; i < nodes.length; i += 1) {
      nodes[i].textContent = BRAND.name;
    }

    var short = scope.querySelectorAll("[data-brand-short]");
    for (var j = 0; j < short.length; j += 1) {
      short[j].textContent = BRAND.shortName;
    }

    // Marca visible mientras no exista identidad aprobada.
    var marks = scope.querySelectorAll("[data-brand-provisional]");
    for (var k = 0; k < marks.length; k += 1) {
      marks[k].hidden = !BRAND.provisional;
    }

    if (global.document && global.document.documentElement) {
      global.document.documentElement.setAttribute("lang", BRAND.locale);
    }
  }

  function ready() {
    render(global.document);
    // Los atributos se rellenan después de pintar para no bloquear el render;
    // mientras tanto el HTML muestra el nombre de respaldo como texto.
    if (global.document) {
      global.document.documentElement.setAttribute("data-brand-ready", "true");
    }
  }

  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", ready, { once: true });
    } else {
      ready();
    }
  }

  global.BrandFolio = { name: BRAND.name, provisional: BRAND.provisional, render: render };
})(typeof window !== "undefined" ? window : this);
